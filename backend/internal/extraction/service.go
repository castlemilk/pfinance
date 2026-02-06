// Package extraction provides document extraction capabilities using ML models.
package extraction

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// ExtractionService provides document extraction functionality.
type ExtractionService struct {
	mlClient  *MLClient
	validator *ValidationService
	mlEnabled bool
}

// Config holds configuration for the extraction service.
type Config struct {
	MLServiceURL     string
	GeminiAPIKey     string
	MistralAPIKey    string
	EnableML         bool
	EnableValidation bool
}

// NewExtractionService creates a new extraction service.
func NewExtractionService(cfg Config) *ExtractionService {
	var mlClient *MLClient
	if cfg.EnableML && cfg.MLServiceURL != "" {
		mlClient = NewMLClient(cfg.MLServiceURL)
	}

	var validator *ValidationService
	if cfg.EnableValidation && cfg.GeminiAPIKey != "" {
		validator = NewValidationService(cfg.GeminiAPIKey, cfg.MistralAPIKey)
	}

	return &ExtractionService{
		mlClient:  mlClient,
		validator: validator,
		mlEnabled: cfg.EnableML && mlClient != nil,
	}
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

// ExtractDocumentWithMethod extracts transactions using the specified method.
func (s *ExtractionService) ExtractDocumentWithMethod(
	ctx context.Context,
	data []byte,
	filename string,
	docType pfinancev1.DocumentType,
	validateWithAPI bool,
	method pfinancev1.ExtractionMethod,
) (*pfinancev1.ExtractionResult, error) {
	var protoResult *pfinancev1.ExtractionResult
	var err error

	// Route to appropriate extraction method
	switch method {
	case pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI:
		// Use Gemini API
		if s.validator == nil || !s.validator.IsGeminiAvailable() {
			return nil, fmt.Errorf("Gemini API is not configured")
		}
		protoResult, err = s.validator.ExtractWithGemini(ctx, data, docType)
		if err != nil {
			return nil, fmt.Errorf("Gemini extraction failed: %w", err)
		}

	case pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED,
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED:
		// Use self-hosted ML model (default)
		if !s.mlEnabled {
			return nil, fmt.Errorf("ML extraction is not enabled")
		}
		result, err := s.mlClient.Extract(ctx, data, filename, docType)
		if err != nil {
			return nil, fmt.Errorf("ML extraction failed: %w", err)
		}
		protoResult = result.ToExtractionResult()

	default:
		return nil, fmt.Errorf("unknown extraction method: %v", method)
	}

	// Apply additional merchant normalization and categorization
	for _, tx := range protoResult.Transactions {
		info := NormalizeMerchant(tx.Description)
		if tx.NormalizedMerchant == "" {
			tx.NormalizedMerchant = info.Name
		}
		// Use normalized category if:
		// 1. ML returned unspecified/other category, or
		// 2. ML confidence is lower than normalizer confidence
		mlHasNoCategory := tx.SuggestedCategory == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED ||
			tx.SuggestedCategory == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER
		normalizerHasBetterCategory := info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER &&
			info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED
		if (mlHasNoCategory && normalizerHasBetterCategory) || tx.Confidence < info.Confidence {
			tx.SuggestedCategory = info.Category
		}
	}

	// Optionally validate with commercial API (only for self-hosted)
	if validateWithAPI && s.validator != nil && method != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI {
		validation, err := s.validator.ValidateExtraction(ctx, data, protoResult)
		if err != nil {
			// Log but don't fail - validation is optional
			protoResult.Warnings = append(protoResult.Warnings, fmt.Sprintf("Validation failed: %v", err))
		} else if validation.Accuracy < 0.9 {
			protoResult.Warnings = append(protoResult.Warnings,
				fmt.Sprintf("Validation accuracy: %.1f%%, review recommended", validation.Accuracy*100))
		}
	}

	return protoResult, nil
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
		parsedExp := &pfinancev1.ParsedExpense{
			Description: exp.Description,
			Amount:      exp.Amount,
			Category:    parseCategory(exp.Category),
			Frequency:   parseFrequency(exp.Frequency),
			Confidence:  exp.Confidence,
			RawInput:    text,
			Reasoning:   exp.Reasoning,
		}

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

		// Skip if confidence is too low
		if tx.Confidence < 0.5 {
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
