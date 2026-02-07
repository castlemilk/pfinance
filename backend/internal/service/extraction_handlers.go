package service

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
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
	userID, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if extractionService == nil {
		return nil, connect.NewError(connect.CodeUnavailable,
			fmt.Errorf("document extraction service is not available"))
	}

	method := req.Msg.ExtractionMethod

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
		return connect.NewResponse(&pfinancev1.ExtractDocumentResponse{
			JobId:  jobID,
			Status: pfinancev1.ExtractionStatus_EXTRACTION_STATUS_PROCESSING,
		}), nil
	}

	// Synchronous extraction with fallback chain
	result, err := extractionService.ExtractDocumentWithMethod(
		ctx,
		req.Msg.DocumentData,
		req.Msg.Filename,
		req.Msg.DocumentType,
		req.Msg.ValidateWithApi,
		method,
	)
	if err != nil {
		return nil, mapExtractionError(err)
	}

	return connect.NewResponse(&pfinancev1.ExtractDocumentResponse{
		Result: result,
		Status: pfinancev1.ExtractionStatus_EXTRACTION_STATUS_COMPLETED,
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
