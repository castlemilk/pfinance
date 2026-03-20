// Package extraction provides document extraction capabilities using ML models.
package extraction

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// Confidence threshold constants.
const (
	ConfidenceAutoReject  = 0.3 // Backend: transaction placed in rejected_transactions
	ConfidenceLowWarning  = 0.6 // Frontend: yellow badge, "please verify" warning
	ConfidenceHigh        = 0.8 // Frontend: green badge
	ConfidencePreDeselect = 0.5 // Frontend: unchecked by default in import
	AsyncPageThreshold    = 3   // PDFs with > 3 pages use async path
)

// Extractor is the interface for document extraction operations.
type Extractor interface {
	ExtractDocumentWithMethod(ctx context.Context, data []byte, filename string, docType pfinancev1.DocumentType, validateWithAPI bool, method pfinancev1.ExtractionMethod) (*pfinancev1.ExtractionResult, error)
	IsGeminiAvailable() bool
	IsEnabled() bool
	ParseExpenseText(ctx context.Context, text string) (*pfinancev1.ParseExpenseTextResponse, error)
	ParseBankStatement(ctx context.Context, pdfData []byte, bankHint string, method pfinancev1.ExtractionMethod) (*pfinancev1.BankStatementResult, error)
	ImportTransactions(ctx context.Context, userID string, groupID string, transactions []*pfinancev1.ExtractedTransaction, skipDuplicates bool, defaultFrequency pfinancev1.ExpenseFrequency) ([]*pfinancev1.Expense, int, []string, error)
	GetJob(id string) (*pfinancev1.ExtractionJob, error)
	StartAsyncExtraction(ctx context.Context, userID string, data []byte, filename string, docType pfinancev1.DocumentType, method pfinancev1.ExtractionMethod) (string, error)
	ExtractMetadataOnly(ctx context.Context, data []byte) (*pfinancev1.StatementMetadata, error)
	CheckStatementDuplicate(ctx context.Context, userID string, metadata *pfinancev1.StatementMetadata) (bool, []string, error)
	RecordProcessedStatement(ctx context.Context, userID string, metadata *pfinancev1.StatementMetadata, filename string, importedCount int32) error
	SetStatementStore(store StatementStore)
}

// MerchantLookup provides user-specific merchant lookups.
type MerchantLookup interface {
	LookupMerchant(ctx context.Context, userID string, rawMerchant string) (*MerchantInfo, error)
}

// StatementStore provides processed statement tracking for dedup.
type StatementStore interface {
	FindProcessedStatement(ctx context.Context, userID, fingerprint string) (*pfinancev1.ProcessedStatement, error)
	FindOverlappingStatements(ctx context.Context, userID, bankName, accountID string, periodStart, periodEnd time.Time) ([]*pfinancev1.ProcessedStatement, error)
	CreateProcessedStatement(ctx context.Context, stmt *pfinancev1.ProcessedStatement) error
}

// ExtractionService provides document extraction functionality.
type ExtractionService struct {
	mlClient       *MLClient
	stmtClient     *StatementParserClient
	validator      *ValidationService
	mlEnabled      bool
	stmtEnabled    bool
	jobStore       *JobStore
	merchantLookup MerchantLookup
	merchantCache  *MerchantCache
	statementStore StatementStore
	textExtractor  *TextExtractor
}

// Config holds configuration for the extraction service.
type Config struct {
	MLServiceURL       string
	StatementParserURL string
	GeminiAPIKey       string
	MistralAPIKey      string
	EnableML           bool
	EnableValidation   bool
}

// NewExtractionService creates a new extraction service.
func NewExtractionService(cfg Config) *ExtractionService {
	var mlClient *MLClient
	if cfg.EnableML && cfg.MLServiceURL != "" {
		mlClient = NewMLClient(cfg.MLServiceURL)
	}

	var stmtClient *StatementParserClient
	if cfg.StatementParserURL != "" {
		stmtClient = NewStatementParserClient(cfg.StatementParserURL)
	}

	var validator *ValidationService
	if cfg.EnableValidation && cfg.GeminiAPIKey != "" {
		validator = NewValidationService(cfg.GeminiAPIKey, cfg.MistralAPIKey)
	}

	return &ExtractionService{
		mlClient:      mlClient,
		stmtClient:    stmtClient,
		validator:     validator,
		mlEnabled:     cfg.EnableML && mlClient != nil,
		stmtEnabled:   stmtClient != nil,
		jobStore:      NewJobStore(1 * time.Hour),
		merchantCache: NewMerchantCache(15*time.Minute, 4096),
		textExtractor: &TextExtractor{},
	}
}

// SetMerchantLookup sets the merchant lookup for user-specific merchant resolution.
func (s *ExtractionService) SetMerchantLookup(lookup MerchantLookup) {
	s.merchantLookup = lookup
}

// StartWarmupScheduler pings the ML service every interval to prevent cold starts.
// Modal's serverless containers shut down after 60s of inactivity; a regular
// health-check keeps the container warm so the first real request isn't delayed
// by a 5-10s cold start.
//
// Call this once at server startup. The returned stop function terminates it.
func (s *ExtractionService) StartWarmupScheduler(interval time.Duration) (stop func()) {
	if !s.mlEnabled || s.mlClient == nil {
		return func() {}
	}
	ticker := time.NewTicker(interval)
	done := make(chan struct{})
	go func() {
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
				if _, err := s.mlClient.HealthCheck(ctx); err != nil {
					log.Printf("[warmup] ML service health check failed: %v", err)
				} else {
					log.Printf("[warmup] ML service is warm")
				}
				cancel()
			}
		}
	}()
	return func() {
		ticker.Stop()
		close(done)
	}
}

// SetStatementStore sets the statement store for dedup tracking.
func (s *ExtractionService) SetStatementStore(store StatementStore) {
	s.statementStore = store
}

// ExtractMetadataOnly extracts only statement metadata using a lightweight Gemini prompt.
// This is the fast first phase of the two-phase extraction flow.
func (s *ExtractionService) ExtractMetadataOnly(ctx context.Context, data []byte) (*pfinancev1.StatementMetadata, error) {
	if s.validator == nil || !s.validator.IsGeminiAvailable() {
		return nil, fmt.Errorf("Gemini is required for metadata extraction")
	}
	return s.validator.ExtractStatementMetadata(ctx, data)
}

// CheckStatementDuplicate checks if a statement has already been processed or overlaps with existing statements.
func (s *ExtractionService) CheckStatementDuplicate(ctx context.Context, userID string, metadata *pfinancev1.StatementMetadata) (isDuplicate bool, warnings []string, err error) {
	if s.statementStore == nil || metadata == nil {
		return false, nil, nil
	}

	// Check exact fingerprint match
	existing, err := s.statementStore.FindProcessedStatement(ctx, userID, metadata.Fingerprint)
	if err == nil && existing != nil {
		warnings = append(warnings, fmt.Sprintf(
			"Statement already imported on %s (%d transactions from %s)",
			existing.ProcessedAt.AsTime().Format("2006-01-02"),
			existing.ImportedCount,
			existing.OriginalFilename,
		))
		return true, warnings, nil
	}

	// Check overlapping periods
	periodStart, _ := time.Parse("2006-01-02", metadata.PeriodStart)
	periodEnd, _ := time.Parse("2006-01-02", metadata.PeriodEnd)
	if !periodStart.IsZero() && !periodEnd.IsZero() {
		overlapping, err := s.statementStore.FindOverlappingStatements(
			ctx, userID, metadata.BankName, metadata.AccountIdentifier,
			periodStart, periodEnd,
		)
		if err == nil && len(overlapping) > 0 {
			for _, stmt := range overlapping {
				warnings = append(warnings, fmt.Sprintf(
					"Overlapping period with %s statement (%s to %s) imported on %s",
					stmt.BankName, stmt.PeriodStart, stmt.PeriodEnd,
					stmt.ProcessedAt.AsTime().Format("2006-01-02"),
				))
			}
		}
	}

	return false, warnings, nil
}

// RecordProcessedStatement records a processed statement for future dedup checks.
func (s *ExtractionService) RecordProcessedStatement(ctx context.Context, userID string, metadata *pfinancev1.StatementMetadata, filename string, importedCount int32) error {
	if s.statementStore == nil || metadata == nil {
		return nil
	}
	stmt := &pfinancev1.ProcessedStatement{
		Id:                uuid.New().String(),
		UserId:            userID,
		Fingerprint:       metadata.Fingerprint,
		BankName:          metadata.BankName,
		AccountIdentifier: metadata.AccountIdentifier,
		PeriodStart:       metadata.PeriodStart,
		PeriodEnd:         metadata.PeriodEnd,
		ImportedCount:     importedCount,
		ProcessedAt:       timestamppb.Now(),
		OriginalFilename:  filename,
	}
	return s.statementStore.CreateProcessedStatement(ctx, stmt)
}

// ExtractDocument extracts transactions from a document.
func (s *ExtractionService) ExtractDocument(
	ctx context.Context,
	data []byte,
	filename string,
	docType pfinancev1.DocumentType,
	validateWithAPI bool,
) (*pfinancev1.ExtractionResult, error) {
	return s.ExtractDocumentWithMethod(ctx, data, filename, docType, validateWithAPI, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED)
}

// buildFallbackChain returns an ordered list of methods to try.
func (s *ExtractionService) buildFallbackChain(method pfinancev1.ExtractionMethod) []pfinancev1.ExtractionMethod {
	switch method {
	case pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI:
		chain := []pfinancev1.ExtractionMethod{pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI}
		if s.mlEnabled {
			chain = append(chain, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED)
		}
		return chain
	case pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED,
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED:
		chain := []pfinancev1.ExtractionMethod{pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED}
		if s.validator != nil && s.validator.IsGeminiAvailable() {
			chain = append(chain, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI)
		}
		return chain
	default:
		return []pfinancev1.ExtractionMethod{method}
	}
}

// tryExtract attempts extraction with a single method.
func (s *ExtractionService) tryExtract(
	ctx context.Context,
	data []byte,
	filename string,
	docType pfinancev1.DocumentType,
	method pfinancev1.ExtractionMethod,
) (*pfinancev1.ExtractionResult, error) {
	switch method {
	case pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI:
		if s.validator == nil || !s.validator.IsGeminiAvailable() {
			return nil, &ExtractionError{
				Code:    ErrGeminiUnavailable,
				Message: "Gemini API is not configured",
				Method:  "gemini",
			}
		}

		var opts GeminiExtractionOpts
		if detectMimeType(data) == "application/pdf" {
			analysis := AnalyzePDF(data)
			if analysis.Error == nil {
				opts.MaxOutputTokens = analysis.MaxOutputTokens
				log.Printf("[extraction] PDF analysis: %d pages, ~%d transactions, maxTokens=%d, scanned=%v",
					analysis.PageCount, analysis.EstimatedTxCount, analysis.MaxOutputTokens, analysis.IsScanned)

				// Try text-only extraction first for native PDFs with structured text
				if !analysis.IsScanned && analysis.EstimatedTxCount >= 3 && s.textExtractor != nil {
					if result, err := s.textExtractor.ExtractFromText(analysis, docType); err == nil && result != nil {
						log.Printf("[extraction] text-only succeeded: %d transactions", len(result.Transactions))
						return result, nil
					}
				}
			} else {
				log.Printf("[extraction] PDF analysis failed (using defaults): %v", analysis.Error)
			}
		}

		return s.validator.ExtractWithGeminiAdvanced(ctx, data, docType, opts)

	case pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED:
		// For bank statements, try the dedicated statement parser first
		if docType == pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT && s.stmtEnabled {
			resp, err := s.stmtClient.ParseStatement(ctx, data, "")
			if err == nil && !resp.NeedsFallback && resp.Confidence >= StatementConfidenceFallbackThreshold {
				mlTxns := resp.ToMLTransactions()
				mlResp := &MLExtractionResponse{
					Transactions:      mlTxns,
					OverallConfidence: resp.Confidence,
					PageCount:         resp.PageCount,
					DocumentType:      "bank_statement",
				}
				result := mlResp.ToExtractionResult()
				if resp.BankDetected != "" {
					result.StatementMetadata = &pfinancev1.StatementMetadata{
						BankName: resp.BankDetected,
					}
				}
				return result, nil
			}
			if err != nil {
				log.Printf("[extraction] statement parser failed, trying general ML: %v", err)
			} else {
				log.Printf("[extraction] statement parser low confidence (%.2f), trying general ML", resp.Confidence)
			}
		}

		if !s.mlEnabled {
			return nil, &ExtractionError{
				Code:    ErrMLServiceUnavailable,
				Message: "ML extraction is not enabled",
				Method:  "self-hosted",
			}
		}
		result, err := s.mlClient.Extract(ctx, data, filename, docType)
		if err != nil {
			return nil, err
		}
		return result.ToExtractionResult(), nil

	default:
		return nil, fmt.Errorf("unknown extraction method: %v", method)
	}
}

// ExtractDocumentWithMethod extracts transactions using the specified method with fallback chain.
func (s *ExtractionService) ExtractDocumentWithMethod(
	ctx context.Context,
	data []byte,
	filename string,
	docType pfinancev1.DocumentType,
	validateWithAPI bool,
	method pfinancev1.ExtractionMethod,
) (*pfinancev1.ExtractionResult, error) {
	chain := s.buildFallbackChain(method)
	var lastErr error
	var protoResult *pfinancev1.ExtractionResult
	usedFallback := false
	var fallbackFrom pfinancev1.ExtractionMethod

	for i, m := range chain {
		result, err := s.tryExtract(ctx, data, filename, docType, m)
		if err == nil {
			protoResult = result
			if i > 0 {
				usedFallback = true
				fallbackFrom = chain[0]
			}
			break
		}
		log.Printf("[extraction] method %v failed: %v", m, err)
		lastErr = err

		// Don't fallback on non-retryable errors like invalid documents
		if extErr, ok := err.(*ExtractionError); ok && extErr.Code == ErrInvalidDocument {
			return nil, err
		}
	}

	if protoResult == nil {
		log.Printf("[extraction] all methods failed for file %q (chain: %v): %v", filename, chain, lastErr)
		return nil, &ExtractionError{
			Code:    ErrAllMethodsFailed,
			Message: fmt.Sprintf("all extraction methods failed: %v", lastErr),
			Cause:   lastErr,
		}
	}

	// Set fallback information
	if usedFallback {
		protoResult.FallbackFrom = fallbackFrom
		protoResult.Warnings = append(protoResult.Warnings,
			fmt.Sprintf("Fell back from %s to %s", fallbackFrom, protoResult.MethodUsed))
	}

	// Apply merchant normalization, confidence merging, and rejection
	s.postProcessResult(protoResult)

	// Optionally validate with commercial API (only for self-hosted)
	if validateWithAPI && s.validator != nil && protoResult.MethodUsed != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI {
		validation, err := s.validator.ValidateExtraction(ctx, data, protoResult)
		if err != nil {
			protoResult.Warnings = append(protoResult.Warnings, fmt.Sprintf("Validation failed: %v", err))
		} else if validation.Accuracy < 0.9 {
			protoResult.Warnings = append(protoResult.Warnings,
				fmt.Sprintf("Validation accuracy: %.1f%%, review recommended", validation.Accuracy*100))
		}
	}

	return protoResult, nil
}

// postProcessResult applies normalization, confidence merging, and auto-rejection.
func (s *ExtractionService) postProcessResult(result *pfinancev1.ExtractionResult) {
	s.postProcessResultWithUser(context.Background(), "", result)
}

// postProcessResultWithUser applies normalization with user-specific merchant lookups.
func (s *ExtractionService) postProcessResultWithUser(ctx context.Context, userID string, result *pfinancev1.ExtractionResult) {
	var accepted []*pfinancev1.ExtractedTransaction
	var rejected []*pfinancev1.ExtractedTransaction

	for _, tx := range result.Transactions {
		// 1. Check user-specific merchant mappings first (highest priority)
		var userInfo *MerchantInfo
		if s.merchantLookup != nil && userID != "" {
			if info, err := s.merchantLookup.LookupMerchant(ctx, userID, tx.Description); err == nil && info != nil {
				userInfo = info
			}
		}

		// 2. Static normalizer with fuzzy matching + cache
		info := NormalizeMerchantCached(tx.Description, s.merchantCache)

		// Prefer user mapping over static
		if userInfo != nil && userInfo.Confidence > info.Confidence {
			info = *userInfo
		}

		if tx.NormalizedMerchant == "" {
			tx.NormalizedMerchant = info.Name
		}

		// Merge normalizer confidence into field confidences
		if tx.FieldConfidences != nil {
			if info.Confidence > tx.FieldConfidences.Merchant {
				tx.FieldConfidences.Merchant = info.Confidence
			}
			if info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER &&
				info.Confidence > tx.FieldConfidences.Category {
				tx.FieldConfidences.Category = info.Confidence
			}
		}

		// Use normalized category if ML had no good category
		mlHasNoCategory := tx.SuggestedCategory == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED ||
			tx.SuggestedCategory == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER
		normalizerHasBetterCategory := info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER &&
			info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED
		if (mlHasNoCategory && normalizerHasBetterCategory) || tx.Confidence < info.Confidence {
			tx.SuggestedCategory = info.Category
		}

		// Auto-reject low confidence transactions
		if tx.Confidence < ConfidenceAutoReject {
			rejected = append(rejected, tx)
		} else {
			accepted = append(accepted, tx)
		}
	}

	result.Transactions = accepted
	result.RejectedTransactions = rejected
}

// IsGeminiAvailable returns true if Gemini extraction is available.
func (s *ExtractionService) IsGeminiAvailable() bool {
	return s.validator != nil && s.validator.IsGeminiAvailable()
}

// ParseExpenseText parses natural language text into structured expense data.
func (s *ExtractionService) ParseExpenseText(ctx context.Context, text string) (*pfinancev1.ParseExpenseTextResponse, error) {
	if s.validator == nil || !s.validator.IsGeminiAvailable() {
		return nil, fmt.Errorf("Gemini API is not configured for text parsing")
	}

	result, err := s.validator.ParseExpenseText(ctx, text)
	if err != nil {
		return nil, err
	}

	// Convert to proto response
	response := &pfinancev1.ParseExpenseTextResponse{
		Success: result.Success,
	}

	if !result.Success {
		response.ErrorMessage = result.Error
		return response, nil
	}

	for i, exp := range result.Expenses {
		// Dual-write amount/cents
		amountCents := int64(exp.Amount * 100)

		parsedExp := &pfinancev1.ParsedExpense{
			Description: exp.Description,
			Amount:      exp.Amount,
			AmountCents: amountCents,
			Category:    parseCategory(exp.Category),
			Frequency:   parseFrequency(exp.Frequency),
			Confidence:  exp.Confidence,
			RawInput:    text,
			Reasoning:   exp.Reasoning,
		}

		// Compute per-field confidence for text parsing
		parsedExp.FieldConfidences = computeTextParsingConfidence(text, exp)

		// Parse date if present
		if exp.Date != "" && exp.Date != "null" {
			if t, err := time.Parse("2006-01-02", exp.Date); err == nil {
				parsedExp.Date = timestamppb.New(t)
			}
		}

		// Add split_with names
		parsedExp.SplitWith = exp.SplitWith

		if i == 0 {
			response.Expense = parsedExp
		} else {
			response.Additional = append(response.Additional, parsedExp)
		}
	}

	return response, nil
}

// computeTextParsingConfidence computes per-field confidence for text parsing results.
func computeTextParsingConfidence(input string, exp ParsedTextExpense) *pfinancev1.FieldConfidence {
	fc := &pfinancev1.FieldConfidence{
		Amount:      0.90,
		Date:        0.50, // Default low if no date in input
		Description: 0.85,
		Merchant:    0.80,
		Category:    0.75,
	}

	lower := strings.ToLower(input)

	// If $ sign present, amount confidence is higher
	if strings.Contains(lower, "$") {
		fc.Amount = 0.95
	}

	// If a date reference was found
	if exp.Date != "" && exp.Date != "null" {
		fc.Date = 0.85
		if strings.Contains(lower, "yesterday") || strings.Contains(lower, "today") {
			fc.Date = 0.95
		}
	}

	// If frequency was explicitly mentioned
	if exp.Frequency != "" && exp.Frequency != "once" {
		// Higher confidence since user was explicit
		fc.Description = 0.90
	}

	return fc
}

// parseFrequency converts a frequency string to the proto enum.
func parseFrequency(frequency string) pfinancev1.ExpenseFrequency {
	switch strings.ToLower(strings.TrimSpace(frequency)) {
	case "weekly":
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_WEEKLY
	case "fortnightly", "biweekly":
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_FORTNIGHTLY
	case "monthly":
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY
	case "annually", "yearly":
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ANNUALLY
	case "once", "one-time":
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE
	default:
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE
	}
}

// ImportTransactions converts extracted transactions to expenses.
func (s *ExtractionService) ImportTransactions(
	ctx context.Context,
	userID string,
	groupID string,
	transactions []*pfinancev1.ExtractedTransaction,
	skipDuplicates bool,
	defaultFrequency pfinancev1.ExpenseFrequency,
) ([]*pfinancev1.Expense, int, []string, error) {
	var expenses []*pfinancev1.Expense
	var skippedReasons []string
	skippedCount := 0

	// Set default frequency
	if defaultFrequency == pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED {
		defaultFrequency = pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE
	}

	for _, tx := range transactions {
		// Skip if not a debit
		if !tx.IsDebit {
			skippedCount++
			skippedReasons = append(skippedReasons, fmt.Sprintf("Skipped credit transaction: %s", tx.Description))
			continue
		}

		// Skip if confidence is too low (use auto-reject threshold)
		if tx.Confidence < ConfidenceAutoReject {
			skippedCount++
			skippedReasons = append(skippedReasons, fmt.Sprintf("Low confidence (%.0f%%): %s", tx.Confidence*100, tx.Description))
			continue
		}

		// Parse date
		var expenseDate *timestamppb.Timestamp
		if tx.Date != "" {
			t, err := time.Parse("2006-01-02", tx.Date)
			if err == nil {
				expenseDate = timestamppb.New(t)
			} else {
				expenseDate = timestamppb.Now()
			}
		} else {
			expenseDate = timestamppb.Now()
		}

		// Create expense
		expense := &pfinancev1.Expense{
			Id:          uuid.New().String(),
			UserId:      userID,
			GroupId:     groupID,
			Description: tx.NormalizedMerchant,
			Amount:      tx.Amount,
			Category:    tx.SuggestedCategory,
			Frequency:   defaultFrequency,
			Date:        expenseDate,
			CreatedAt:   timestamppb.Now(),
			UpdatedAt:   timestamppb.Now(),
		}

		expenses = append(expenses, expense)
	}

	return expenses, skippedCount, skippedReasons, nil
}

// IsEnabled returns whether ML extraction is enabled.
func (s *ExtractionService) IsEnabled() bool {
	return s.mlEnabled
}

// GetJob retrieves an extraction job by ID.
func (s *ExtractionService) GetJob(id string) (*pfinancev1.ExtractionJob, error) {
	return s.jobStore.Get(id)
}

// StartAsyncExtraction creates an async extraction job for multi-page PDFs.
func (s *ExtractionService) StartAsyncExtraction(
	ctx context.Context,
	userID string,
	data []byte,
	filename string,
	docType pfinancev1.DocumentType,
	method pfinancev1.ExtractionMethod,
) (string, error) {
	jobID := fmt.Sprintf("extr_%s", uuid.New().String()[:8])

	pageCount := 1
	if detectMimeType(data) == "application/pdf" {
		pageCount = CountPDFPagesAccurate(data)
	}

	job := NewExtractionJobProto(jobID, userID, docType, filename, method)
	job.TotalPages = int32(pageCount)
	job.Status = pfinancev1.ExtractionStatus_EXTRACTION_STATUS_PROCESSING

	if err := s.jobStore.Create(job); err != nil {
		return "", fmt.Errorf("create job: %w", err)
	}

	// Process in background
	go s.processAsyncExtraction(context.Background(), job, data, filename, docType, method)

	return jobID, nil
}

// processAsyncExtraction processes extraction in the background, updating job progress.
func (s *ExtractionService) processAsyncExtraction(
	ctx context.Context,
	job *pfinancev1.ExtractionJob,
	data []byte,
	filename string,
	docType pfinancev1.DocumentType,
	method pfinancev1.ExtractionMethod,
) {
	result, err := s.ExtractDocumentWithMethod(ctx, data, filename, docType, false, method)
	if err != nil {
		job.Status = pfinancev1.ExtractionStatus_EXTRACTION_STATUS_FAILED
		job.ErrorMessage = err.Error()
		job.CompletedAt = timestamppb.Now()
		if updateErr := s.jobStore.Update(job); updateErr != nil {
			log.Printf("failed to update job %s: %v", job.Id, updateErr)
		}
		return
	}

	job.Status = pfinancev1.ExtractionStatus_EXTRACTION_STATUS_COMPLETED
	job.Result = result
	job.ProcessedPages = job.TotalPages
	job.ProgressPercent = 100.0
	job.CompletedAt = timestamppb.Now()
	if updateErr := s.jobStore.Update(job); updateErr != nil {
		log.Printf("failed to update job %s: %v", job.Id, updateErr)
	}
}

// HealthCheck checks if the ML service is healthy.
func (s *ExtractionService) HealthCheck(ctx context.Context) error {
	if !s.mlEnabled {
		return fmt.Errorf("ML service not enabled")
	}

	health, err := s.mlClient.HealthCheck(ctx)
	if err != nil {
		return err
	}

	if health.Status != "healthy" {
		return fmt.Errorf("ML service unhealthy: %s", health.Status)
	}

	if !health.ModelLoaded {
		return fmt.Errorf("ML model not loaded")
	}

	return nil
}

// StatementConfidenceFallbackThreshold is the confidence below which we fall back to Gemini.
const StatementConfidenceFallbackThreshold = 0.5

// ParseBankStatement parses a bank statement PDF using the ML statement parser
// with confidence-based fallback to Gemini.
func (s *ExtractionService) ParseBankStatement(
	ctx context.Context,
	pdfData []byte,
	bankHint string,
	method pfinancev1.ExtractionMethod,
) (*pfinancev1.BankStatementResult, error) {
	start := time.Now()

	// Try statement parser first (self-hosted ML) unless Gemini explicitly requested
	if method != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI && s.stmtEnabled {
		result, err := s.parseWithStatementClient(ctx, pdfData, bankHint)
		if err != nil {
			log.Printf("[statement] ML parser failed: %v", err)
		} else if !result.NeedsFallback && result.Confidence >= StatementConfidenceFallbackThreshold {
			// ML parse succeeded with good confidence
			bsResult := s.convertStatementResult(result, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED)
			bsResult.ProcessingTimeMs = int32(time.Since(start).Milliseconds())
			return bsResult, nil
		} else {
			reason := result.FallbackReason
			if reason == "" {
				reason = fmt.Sprintf("low confidence: %.2f", result.Confidence)
			}
			log.Printf("[statement] ML parser needs fallback: %s", reason)
		}
	}

	// Fallback: use Gemini via the existing extraction pipeline
	if s.validator == nil || !s.validator.IsGeminiAvailable() {
		if !s.stmtEnabled {
			return nil, &ExtractionError{
				Code:    ErrMLServiceUnavailable,
				Message: "statement parser is not configured and Gemini is unavailable",
				Method:  "statement",
			}
		}
		return nil, &ExtractionError{
			Code:    ErrGeminiUnavailable,
			Message: "Gemini fallback is not available for low-confidence statement parse",
			Method:  "statement",
		}
	}

	log.Printf("[statement] falling back to Gemini extraction pipeline")
	geminiResult, err := s.tryExtract(ctx, pdfData, "statement.pdf", pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI)
	if err != nil {
		return nil, &ExtractionError{
			Code:    ErrAllMethodsFailed,
			Message: fmt.Sprintf("all statement parsing methods failed: %v", err),
			Cause:   err,
		}
	}

	// Convert ExtractionResult to BankStatementResult
	bsResult := s.convertExtractionToBankResult(geminiResult, pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED)
	bsResult.ProcessingTimeMs = int32(time.Since(start).Milliseconds())
	return bsResult, nil
}

// parseWithStatementClient calls the ML statement parser service.
func (s *ExtractionService) parseWithStatementClient(ctx context.Context, pdfData []byte, bankHint string) (*StatementParseResponse, error) {
	if s.stmtClient == nil {
		return nil, fmt.Errorf("statement parser client not configured")
	}
	return s.stmtClient.ParseStatement(ctx, pdfData, bankHint)
}

// convertStatementResult converts a StatementParseResponse to a proto BankStatementResult.
func (s *ExtractionService) convertStatementResult(
	resp *StatementParseResponse,
	methodUsed pfinancev1.ExtractionMethod,
	fallbackFrom pfinancev1.ExtractionMethod,
) *pfinancev1.BankStatementResult {
	var transactions []*pfinancev1.BankTransaction
	for _, t := range resp.Transactions {
		bt := &pfinancev1.BankTransaction{
			Id:          t.ID,
			Date:        t.Date,
			Description: t.Description,
			Amount:      t.Amount,
			IsDebit:     t.IsDebit,
			Confidence:  t.Confidence,
			Page:        int32(t.Page),
			AmountCents: int64(t.Amount * 100),
		}
		if t.Balance != nil {
			bt.Balance = *t.Balance
		}
		if t.FieldConfidences != nil {
			bt.FieldConfidences = &pfinancev1.FieldConfidence{
				Amount:      t.FieldConfidences["amount"],
				Date:        t.FieldConfidences["date"],
				Description: t.FieldConfidences["description"],
			}
		}
		transactions = append(transactions, bt)
	}

	result := &pfinancev1.BankStatementResult{
		Transactions:      transactions,
		BankDetected:      resp.BankDetected,
		PageCount:         int32(resp.PageCount),
		Confidence:        resp.Confidence,
		BalanceReconciled: resp.BalanceReconciled,
		ProcessingTimeMs:  int32(resp.ProcessingTimeMS),
		Warnings:          resp.Warnings,
		MethodUsed:        methodUsed,
	}

	if fallbackFrom != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED {
		result.FallbackFrom = fallbackFrom
	}

	return result
}

// convertExtractionToBankResult converts an ExtractionResult (from Gemini) to BankStatementResult.
func (s *ExtractionService) convertExtractionToBankResult(
	result *pfinancev1.ExtractionResult,
	fallbackFrom pfinancev1.ExtractionMethod,
) *pfinancev1.BankStatementResult {
	var transactions []*pfinancev1.BankTransaction
	for _, tx := range result.Transactions {
		bt := &pfinancev1.BankTransaction{
			Id:          tx.Id,
			Date:        tx.Date,
			Description: tx.Description,
			Amount:      tx.Amount,
			IsDebit:     tx.IsDebit,
			Confidence:  tx.Confidence,
			AmountCents: tx.AmountCents,
		}
		if tx.FieldConfidences != nil {
			bt.FieldConfidences = tx.FieldConfidences
		}
		transactions = append(transactions, bt)
	}

	bsResult := &pfinancev1.BankStatementResult{
		Transactions:      transactions,
		PageCount:         result.PageCount,
		Confidence:        result.OverallConfidence,
		Warnings:          result.Warnings,
		MethodUsed:        result.MethodUsed,
		StatementMetadata: result.StatementMetadata,
	}

	if fallbackFrom != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED {
		bsResult.FallbackFrom = fallbackFrom
		bsResult.Warnings = append(bsResult.Warnings,
			fmt.Sprintf("Fell back from %s to %s", fallbackFrom, result.MethodUsed))
	}

	return bsResult
}
