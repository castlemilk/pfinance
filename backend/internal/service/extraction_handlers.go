package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// extractionService is the extraction service instance (set via SetExtractionService)
var extractionService extraction.Extractor

// SetExtractionService sets the extraction service for the handlers.
func SetExtractionService(svc extraction.Extractor) {
	extractionService = svc
}

// mapExtractionError maps extraction errors to Connect-RPC error codes.
func mapExtractionError(err error) *connect.Error {
	extErr, ok := err.(*extraction.ExtractionError)
	if !ok {
		return connect.NewError(connect.CodeInternal, fmt.Errorf("extraction failed: %w", err))
	}

	switch extErr.Code {
	case extraction.ErrMLServiceUnavailable, extraction.ErrMLServiceTimeout:
		return connect.NewError(connect.CodeUnavailable, fmt.Errorf("%s", extErr.Message))
	case extraction.ErrGeminiUnavailable:
		return connect.NewError(connect.CodeUnavailable, fmt.Errorf("%s", extErr.Message))
	case extraction.ErrGeminiRateLimited:
		return connect.NewError(connect.CodeResourceExhausted, fmt.Errorf("%s", extErr.Message))
	case extraction.ErrInvalidDocument:
		return connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("%s", extErr.Message))
	case extraction.ErrAllMethodsFailed:
		return connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("all extraction methods failed — try again later or enter manually"))
	default:
		return connect.NewError(connect.CodeInternal, fmt.Errorf("extraction failed: %s", extErr.Message))
	}
}

// ExtractDocument extracts transactions from a document using ML.
func (s *FinanceService) ExtractDocument(ctx context.Context, req *connect.Request[pfinancev1.ExtractDocumentRequest]) (*connect.Response[pfinancev1.ExtractDocumentResponse], error) {
	rpcStart := time.Now()

	userID, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if extractionService == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("document extraction service is not available"))
	}

	method := req.Msg.ExtractionMethod
	fileSizeKB := len(req.Msg.DocumentData) / 1024
	log.Printf("[extract] start file=%q size=%dKB method=%v async=%v",
		req.Msg.Filename, fileSizeKB, method, req.Msg.AsyncProcessing)

	// Check if this is a multi-page PDF that should use async path
	if req.Msg.AsyncProcessing || shouldUseAsyncPath(req.Msg.DocumentData) {
		jobID, err := extractionService.StartAsyncExtraction(
			ctx,
			userID.UID,
			req.Msg.DocumentData,
			req.Msg.Filename,
			req.Msg.DocumentType,
			method,
		)
		if err != nil {
			return nil, mapExtractionError(err)
		}
		log.Printf("[extract] async job started jobId=%s elapsed=%dms", jobID, time.Since(rpcStart).Milliseconds())
		return connect.NewResponse(&pfinancev1.ExtractDocumentResponse{
			JobId:  jobID,
			Status: pfinancev1.ExtractionStatus_EXTRACTION_STATUS_PROCESSING,
		}), nil
	}

	// Synchronous extraction with fallback chain
	extractStart := time.Now()
	result, err := extractionService.ExtractDocumentWithMethod(
		ctx,
		req.Msg.DocumentData,
		req.Msg.Filename,
		req.Msg.DocumentType,
		req.Msg.ValidateWithApi,
		method,
	)
	extractMs := time.Since(extractStart).Milliseconds()
	if err != nil {
		log.Printf("[extract] FAILED file=%q extractMs=%d err=%v", req.Msg.Filename, extractMs, err)
		return nil, mapExtractionError(err)
	}
	log.Printf("[extract] done file=%q method=%v txCount=%d confidence=%.2f extractMs=%d totalMs=%d",
		req.Msg.Filename, result.MethodUsed, len(result.Transactions),
		result.OverallConfidence, extractMs, time.Since(rpcStart).Milliseconds())

	// Check for statement duplicates if metadata was extracted
	var duplicateWarnings []string
	if result.StatementMetadata != nil {
		dupStart := time.Now()
		isDup, warnings, _ := extractionService.CheckStatementDuplicate(ctx, userID.UID, result.StatementMetadata)
		log.Printf("[extract] dedup check dupMs=%d isDup=%v", time.Since(dupStart).Milliseconds(), isDup)
		duplicateWarnings = warnings
		if isDup {
			result.Warnings = append(result.Warnings, warnings...)
		}
	}

	// Record extraction event for metrics tracking
	if s.store != nil {
		event := &pfinancev1.ExtractionEvent{
			Id:                uuid.New().String(),
			UserId:            userID.UID,
			Method:            result.MethodUsed,
			TransactionCount:  int32(len(result.Transactions)),
			OverallConfidence: result.OverallConfidence,
			ProcessingTimeMs:  result.ProcessingTimeMs,
			DocumentType:      result.DocumentType,
			CreatedAt:         timestamppb.Now(),
		}
		if err := s.store.CreateExtractionEvent(ctx, event); err != nil {
			log.Printf("Failed to record extraction event: %v", err)
		}
	}

	return connect.NewResponse(&pfinancev1.ExtractDocumentResponse{
		Result:            result,
		Status:            pfinancev1.ExtractionStatus_EXTRACTION_STATUS_COMPLETED,
		StatementMetadata: result.StatementMetadata,
		DuplicateWarnings: duplicateWarnings,
	}), nil
}

// shouldUseAsyncPath determines if the document should be processed asynchronously.
func shouldUseAsyncPath(data []byte) bool {
	if len(data) < 4 || string(data[:4]) != "%PDF" {
		return false
	}
	// Use the extraction package's page count detection
	return extraction.CountPDFPagesFromData(data) > extraction.AsyncPageThreshold
}

// GetExtractionJob gets the status of an async extraction job.
func (s *FinanceService) GetExtractionJob(ctx context.Context, req *connect.Request[pfinancev1.GetExtractionJobRequest]) (*connect.Response[pfinancev1.GetExtractionJobResponse], error) {
	_, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if extractionService == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("extraction service is not available"))
	}

	job, err := extractionService.GetJob(req.Msg.JobId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("extraction job not found: %s", req.Msg.JobId))
	}

	return connect.NewResponse(&pfinancev1.GetExtractionJobResponse{
		Job: job,
	}), nil
}

// ImportExtractedTransactions imports extracted transactions as expenses.
func (s *FinanceService) ImportExtractedTransactions(ctx context.Context, req *connect.Request[pfinancev1.ImportExtractedTransactionsRequest]) (*connect.Response[pfinancev1.ImportExtractedTransactionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify the user is importing for themselves or their group
	if req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot import transactions for another user"))
	}

	// If group is specified, verify membership
	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	if extractionService == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("extraction service is not available"))
	}

	// Filter out duplicates before importing if skip_duplicates is set
	transactions := req.Msg.Transactions
	var dupSkippedCount int
	var dupSkippedReasons []string
	if req.Msg.SkipDuplicates && len(transactions) > 0 {
		var filtered []*pfinancev1.ExtractedTransaction
		for _, tx := range transactions {
			candidates := s.findDuplicatesForTransaction(ctx, claims.UID, req.Msg.GroupId, tx)
			if len(candidates) > 0 {
				dupSkippedCount++
				desc := tx.Description
				if desc == "" {
					desc = tx.NormalizedMerchant
				}
				dupSkippedReasons = append(dupSkippedReasons, fmt.Sprintf("Duplicate of existing expense: %s (score: %.0f%%)", desc, candidates[0].MatchScore*100))
			} else {
				filtered = append(filtered, tx)
			}
		}
		transactions = filtered
	}

	// Convert transactions to expenses
	expenses, skippedCount, skippedReasons, err := extractionService.ImportTransactions(
		ctx,
		req.Msg.UserId,
		req.Msg.GroupId,
		transactions,
		req.Msg.SkipDuplicates,
		req.Msg.DefaultFrequency,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("import failed: %w", err))
	}

	// Merge duplicate-skipped counts
	skippedCount += dupSkippedCount
	skippedReasons = append(dupSkippedReasons, skippedReasons...)

	// Attach receipt URLs to expenses if provided (parallel arrays from frontend)
	if len(req.Msg.ReceiptUrls) > 0 || len(req.Msg.ReceiptStoragePaths) > 0 {
		for i, expense := range expenses {
			if i < len(req.Msg.ReceiptUrls) && req.Msg.ReceiptUrls[i] != "" {
				expense.ReceiptUrl = req.Msg.ReceiptUrls[i]
			}
			if i < len(req.Msg.ReceiptStoragePaths) && req.Msg.ReceiptStoragePaths[i] != "" {
				expense.ReceiptStoragePath = req.Msg.ReceiptStoragePaths[i]
			}
		}
	}

	// Batch store the expenses in a single call
	if err := s.store.BatchCreateExpenses(ctx, expenses); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("batch create expenses: %w", err))
	}
	createdExpenses := expenses

	importedCount := int32(len(createdExpenses))

	// Record processed statement for future dedup
	if req.Msg.StatementMetadata != nil && extractionService != nil {
		_ = extractionService.RecordProcessedStatement(
			ctx, claims.UID, req.Msg.StatementMetadata,
			req.Msg.OriginalFilename, importedCount,
		)
	}

	// Fire-and-forget: send extraction complete notification
	func() {
		trigger := NewNotificationTrigger(s.store)
		trigger.ExtractionComplete(ctx, claims.UID, importedCount, int32(skippedCount))
	}()

	return connect.NewResponse(&pfinancev1.ImportExtractedTransactionsResponse{
		CreatedExpenses: createdExpenses,
		ImportedCount:   importedCount,
		SkippedCount:    int32(skippedCount),
		SkippedReasons:  skippedReasons,
	}), nil
}

// ParseExpenseText parses natural language text into structured expense data using Gemini.
func (s *FinanceService) ParseExpenseText(ctx context.Context, req *connect.Request[pfinancev1.ParseExpenseTextRequest]) (*connect.Response[pfinancev1.ParseExpenseTextResponse], error) {
	_, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if extractionService == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("extraction service is not available"))
	}

	if !extractionService.IsGeminiAvailable() {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("Gemini API is not configured for text parsing"))
	}

	text := req.Msg.Text
	if text == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("text is required"))
	}

	result, err := extractionService.ParseExpenseText(ctx, text)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("parsing failed: %w", err))
	}

	return connect.NewResponse(result), nil
}
