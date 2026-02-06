package service

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// extractionService is the extraction service instance (set via SetExtractionService)
var extractionService *extraction.ExtractionService

// SetExtractionService sets the extraction service for the handlers.
func SetExtractionService(svc *extraction.ExtractionService) {
	extractionService = svc
}

// ExtractDocument extracts transactions from a document using ML.
func (s *FinanceService) ExtractDocument(ctx context.Context, req *connect.Request[pfinancev1.ExtractDocumentRequest]) (*connect.Response[pfinancev1.ExtractDocumentResponse], error) {
	_, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if extractionService == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("document extraction service is not available"))
	}

	// Check availability based on method
	method := req.Msg.ExtractionMethod
	if method == pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI {
		if !extractionService.IsGeminiAvailable() {
			return nil, connect.NewError(connect.CodeUnavailable,
				fmt.Errorf("Gemini extraction is not available (API key not configured)"))
		}
	} else if !extractionService.IsEnabled() {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("ML extraction service is not available"))
	}

	// Extract document with specified method
	result, err := extractionService.ExtractDocumentWithMethod(
		ctx,
		req.Msg.DocumentData,
		req.Msg.Filename,
		req.Msg.DocumentType,
		req.Msg.ValidateWithApi,
		method,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("extraction failed: %w", err))
	}

	return connect.NewResponse(&pfinancev1.ExtractDocumentResponse{
		Result: result,
		Status: pfinancev1.ExtractionStatus_EXTRACTION_STATUS_COMPLETED,
	}), nil
}

// GetExtractionJob gets the status of an async extraction job.
func (s *FinanceService) GetExtractionJob(ctx context.Context, req *connect.Request[pfinancev1.GetExtractionJobRequest]) (*connect.Response[pfinancev1.GetExtractionJobResponse], error) {
	_, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For now, we only support synchronous extraction
	// Async jobs would be stored in the database
	return nil, connect.NewError(connect.CodeUnimplemented,
		fmt.Errorf("async extraction jobs are not yet implemented"))
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

	// Convert transactions to expenses
	expenses, skippedCount, skippedReasons, err := extractionService.ImportTransactions(
		ctx,
		req.Msg.UserId,
		req.Msg.GroupId,
		req.Msg.Transactions,
		req.Msg.SkipDuplicates,
		req.Msg.DefaultFrequency,
	)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("import failed: %w", err))
	}

	// Store the expenses
	var createdExpenses []*pfinancev1.Expense
	for _, expense := range expenses {
		if err := s.store.CreateExpense(ctx, expense); err != nil {
			// Log and continue - partial success
			skippedCount++
			skippedReasons = append(skippedReasons, fmt.Sprintf("Failed to create expense: %v", err))
			continue
		}
		createdExpenses = append(createdExpenses, expense)
	}

	return connect.NewResponse(&pfinancev1.ImportExtractedTransactionsResponse{
		CreatedExpenses: createdExpenses,
		ImportedCount:   int32(len(createdExpenses)),
		SkippedCount:    int32(skippedCount),
		SkippedReasons:  skippedReasons,
	}), nil
}

// extractionJobFromProto converts a proto ExtractionJob to a response.
func extractionJobFromProto(job *pfinancev1.ExtractionJob) *pfinancev1.GetExtractionJobResponse {
	return &pfinancev1.GetExtractionJobResponse{
		Job: job,
	}
}

// newExtractionJob creates a new extraction job.
func newExtractionJob(userID string, docType pfinancev1.DocumentType, filename string) *pfinancev1.ExtractionJob {
	return &pfinancev1.ExtractionJob{
		Id:               generateID(),
		UserId:           userID,
		Status:           pfinancev1.ExtractionStatus_EXTRACTION_STATUS_PENDING,
		DocumentType:     docType,
		OriginalFilename: filename,
		CreatedAt:        timestamppb.Now(),
	}
}

// generateID generates a unique ID for an extraction job.
func generateID() string {
	return fmt.Sprintf("extr_%s", timestamppb.Now().AsTime().Format("20060102150405"))
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
