package service

import (
	"context"
	"fmt"
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
)

// mockExtractor is a simple mock for the Extractor interface.
type mockExtractor struct {
	extractDocResult *pfinancev1.ExtractionResult
	extractDocErr    error
	geminiAvailable  bool
	enabled          bool
	parseResult      *pfinancev1.ParseExpenseTextResponse
	parseErr         error
	importExpenses   []*pfinancev1.Expense
	importSkipped    int
	importReasons    []string
	importErr        error
	getJobResult     *pfinancev1.ExtractionJob
	getJobErr        error
	asyncJobID       string
	asyncErr         error
}

func (m *mockExtractor) ExtractDocumentWithMethod(ctx context.Context, data []byte, filename string, docType pfinancev1.DocumentType, validateWithAPI bool, method pfinancev1.ExtractionMethod) (*pfinancev1.ExtractionResult, error) {
	return m.extractDocResult, m.extractDocErr
}

func (m *mockExtractor) IsGeminiAvailable() bool {
	return m.geminiAvailable
}

func (m *mockExtractor) IsEnabled() bool {
	return m.enabled
}

func (m *mockExtractor) ParseExpenseText(ctx context.Context, text string) (*pfinancev1.ParseExpenseTextResponse, error) {
	return m.parseResult, m.parseErr
}

func (m *mockExtractor) ImportTransactions(ctx context.Context, userID string, groupID string, transactions []*pfinancev1.ExtractedTransaction, skipDuplicates bool, defaultFrequency pfinancev1.ExpenseFrequency) ([]*pfinancev1.Expense, int, []string, error) {
	return m.importExpenses, m.importSkipped, m.importReasons, m.importErr
}

func (m *mockExtractor) GetJob(id string) (*pfinancev1.ExtractionJob, error) {
	return m.getJobResult, m.getJobErr
}

func (m *mockExtractor) StartAsyncExtraction(ctx context.Context, userID string, data []byte, filename string, docType pfinancev1.DocumentType, method pfinancev1.ExtractionMethod) (string, error) {
	return m.asyncJobID, m.asyncErr
}

// helper to create an authenticated context
func authedCtx(uid string) context.Context {
	return auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:   uid,
		Email: uid + "@test.com",
	})
}

func TestExtractDocument_Success(t *testing.T) {
	mock := &mockExtractor{
		extractDocResult: &pfinancev1.ExtractionResult{
			Transactions: []*pfinancev1.ExtractedTransaction{
				{Id: "1", Description: "Coffee", Amount: 5.50},
			},
			OverallConfidence: 0.9,
		},
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	resp, err := svc.ExtractDocument(ctx, connect.NewRequest(&pfinancev1.ExtractDocumentRequest{
		DocumentData: []byte("fake-image-data"),
		Filename:     "receipt.jpg",
		DocumentType: pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT,
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.Result == nil {
		t.Fatal("expected result, got nil")
	}
	if len(resp.Msg.Result.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(resp.Msg.Result.Transactions))
	}
	if resp.Msg.Status != pfinancev1.ExtractionStatus_EXTRACTION_STATUS_COMPLETED {
		t.Fatalf("expected COMPLETED status, got %v", resp.Msg.Status)
	}
}

func TestExtractDocument_ServiceNil(t *testing.T) {
	SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.ExtractDocument(ctx, connect.NewRequest(&pfinancev1.ExtractDocumentRequest{
		DocumentData: []byte("data"),
		Filename:     "test.jpg",
	}))

	if err == nil {
		t.Fatal("expected error when service is nil")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeUnavailable {
		t.Fatalf("expected CodeUnavailable, got %v", connectErr.Code())
	}
}

func TestExtractDocument_ExtractionFails(t *testing.T) {
	mock := &mockExtractor{
		extractDocErr: &extraction.ExtractionError{
			Code:    extraction.ErrMLServiceUnavailable,
			Message: "ML service down",
		},
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.ExtractDocument(ctx, connect.NewRequest(&pfinancev1.ExtractDocumentRequest{
		DocumentData: []byte("data"),
		Filename:     "test.jpg",
	}))

	if err == nil {
		t.Fatal("expected error")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeUnavailable {
		t.Fatalf("expected CodeUnavailable, got %v", connectErr.Code())
	}
}

func TestExtractDocument_Unauthenticated(t *testing.T) {
	mock := &mockExtractor{}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	// No auth claims in context
	ctx := context.Background()

	_, err := svc.ExtractDocument(ctx, connect.NewRequest(&pfinancev1.ExtractDocumentRequest{
		DocumentData: []byte("data"),
		Filename:     "test.jpg",
	}))

	if err == nil {
		t.Fatal("expected unauthenticated error")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeUnauthenticated {
		t.Fatalf("expected CodeUnauthenticated, got %v", connectErr.Code())
	}
}

func TestExtractDocument_AsyncProcessing(t *testing.T) {
	mock := &mockExtractor{
		asyncJobID: "extr_abc123",
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	resp, err := svc.ExtractDocument(ctx, connect.NewRequest(&pfinancev1.ExtractDocumentRequest{
		DocumentData:    []byte("data"),
		Filename:        "test.jpg",
		AsyncProcessing: true,
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.JobId != "extr_abc123" {
		t.Fatalf("expected job ID 'extr_abc123', got %q", resp.Msg.JobId)
	}
	if resp.Msg.Status != pfinancev1.ExtractionStatus_EXTRACTION_STATUS_PROCESSING {
		t.Fatalf("expected PROCESSING status, got %v", resp.Msg.Status)
	}
}

func TestGetExtractionJob_Success(t *testing.T) {
	mock := &mockExtractor{
		getJobResult: &pfinancev1.ExtractionJob{
			Id:              "extr_abc123",
			Status:          pfinancev1.ExtractionStatus_EXTRACTION_STATUS_COMPLETED,
			ProgressPercent: 100,
		},
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	resp, err := svc.GetExtractionJob(ctx, connect.NewRequest(&pfinancev1.GetExtractionJobRequest{
		JobId: "extr_abc123",
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.Job.Id != "extr_abc123" {
		t.Fatalf("expected job ID 'extr_abc123', got %q", resp.Msg.Job.Id)
	}
}

func TestGetExtractionJob_NotFound(t *testing.T) {
	mock := &mockExtractor{
		getJobErr: fmt.Errorf("job not found"),
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.GetExtractionJob(ctx, connect.NewRequest(&pfinancev1.GetExtractionJobRequest{
		JobId: "nonexistent",
	}))

	if err == nil {
		t.Fatal("expected error")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeNotFound {
		t.Fatalf("expected CodeNotFound, got %v", connectErr.Code())
	}
}

func TestGetExtractionJob_ServiceNil(t *testing.T) {
	SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.GetExtractionJob(ctx, connect.NewRequest(&pfinancev1.GetExtractionJobRequest{
		JobId: "extr_abc123",
	}))

	if err == nil {
		t.Fatal("expected error when service is nil")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeUnavailable {
		t.Fatalf("expected CodeUnavailable, got %v", connectErr.Code())
	}
}

func TestParseExpenseText_Success(t *testing.T) {
	mock := &mockExtractor{
		geminiAvailable: true,
		parseResult: &pfinancev1.ParseExpenseTextResponse{
			Success: true,
			Expense: &pfinancev1.ParsedExpense{
				Description: "Coffee",
				Amount:      5.50,
			},
		},
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	resp, err := svc.ParseExpenseText(ctx, connect.NewRequest(&pfinancev1.ParseExpenseTextRequest{
		Text: "Coffee $5.50",
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !resp.Msg.Success {
		t.Fatal("expected success=true")
	}
	if resp.Msg.Expense.Description != "Coffee" {
		t.Fatalf("expected 'Coffee', got %q", resp.Msg.Expense.Description)
	}
}

func TestParseExpenseText_EmptyText(t *testing.T) {
	mock := &mockExtractor{geminiAvailable: true}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.ParseExpenseText(ctx, connect.NewRequest(&pfinancev1.ParseExpenseTextRequest{
		Text: "",
	}))

	if err == nil {
		t.Fatal("expected error for empty text")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeInvalidArgument {
		t.Fatalf("expected CodeInvalidArgument, got %v", connectErr.Code())
	}
}

func TestParseExpenseText_GeminiUnavailable(t *testing.T) {
	mock := &mockExtractor{geminiAvailable: false}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.ParseExpenseText(ctx, connect.NewRequest(&pfinancev1.ParseExpenseTextRequest{
		Text: "Coffee $5.50",
	}))

	if err == nil {
		t.Fatal("expected error when Gemini unavailable")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodeUnavailable {
		t.Fatalf("expected CodeUnavailable, got %v", connectErr.Code())
	}
}

func TestParseExpenseText_Unauthenticated(t *testing.T) {
	mock := &mockExtractor{geminiAvailable: true}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := context.Background()

	_, err := svc.ParseExpenseText(ctx, connect.NewRequest(&pfinancev1.ParseExpenseTextRequest{
		Text: "Coffee $5.50",
	}))

	if err == nil {
		t.Fatal("expected unauthenticated error")
	}
}

func TestImportExtractedTransactions_Success(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	mockStore.EXPECT().CreateExpense(gomock.Any(), gomock.Any()).Return(nil).Times(2)

	mock := &mockExtractor{
		importExpenses: []*pfinancev1.Expense{
			{Id: "exp-1", UserId: "user-1", Description: "Coffee", Amount: 5.50},
			{Id: "exp-2", UserId: "user-1", Description: "Lunch", Amount: 12.00},
		},
		importSkipped: 0,
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(mockStore)
	ctx := authedCtx("user-1")

	resp, err := svc.ImportExtractedTransactions(ctx, connect.NewRequest(&pfinancev1.ImportExtractedTransactionsRequest{
		UserId: "user-1",
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Description: "Coffee", Amount: 5.50, IsDebit: true, Confidence: 0.9},
			{Id: "2", Description: "Lunch", Amount: 12.00, IsDebit: true, Confidence: 0.9},
		},
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.ImportedCount != 2 {
		t.Fatalf("expected 2 imported, got %d", resp.Msg.ImportedCount)
	}
}

func TestImportExtractedTransactions_PermissionDenied(t *testing.T) {
	mock := &mockExtractor{}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(nil)
	ctx := authedCtx("user-1")

	_, err := svc.ImportExtractedTransactions(ctx, connect.NewRequest(&pfinancev1.ImportExtractedTransactionsRequest{
		UserId:       "user-2", // Different from authenticated user
		Transactions: []*pfinancev1.ExtractedTransaction{},
	}))

	if err == nil {
		t.Fatal("expected permission denied error")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodePermissionDenied {
		t.Fatalf("expected CodePermissionDenied, got %v", connectErr.Code())
	}
}

func TestImportExtractedTransactions_PartialFailure(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	mockStore.EXPECT().CreateExpense(gomock.Any(), gomock.Any()).Return(nil).Times(1)
	mockStore.EXPECT().CreateExpense(gomock.Any(), gomock.Any()).Return(fmt.Errorf("db error")).Times(1)

	mock := &mockExtractor{
		importExpenses: []*pfinancev1.Expense{
			{Id: "exp-1", UserId: "user-1", Description: "Coffee", Amount: 5.50},
			{Id: "exp-2", UserId: "user-1", Description: "Lunch", Amount: 12.00},
		},
		importSkipped: 0,
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(mockStore)
	ctx := authedCtx("user-1")

	resp, err := svc.ImportExtractedTransactions(ctx, connect.NewRequest(&pfinancev1.ImportExtractedTransactionsRequest{
		UserId: "user-1",
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Description: "Coffee", Amount: 5.50, IsDebit: true},
			{Id: "2", Description: "Lunch", Amount: 12.00, IsDebit: true},
		},
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// 1 succeeded, 1 failed
	if resp.Msg.ImportedCount != 1 {
		t.Fatalf("expected 1 imported, got %d", resp.Msg.ImportedCount)
	}
	if resp.Msg.SkippedCount != 1 {
		t.Fatalf("expected 1 skipped, got %d", resp.Msg.SkippedCount)
	}
}

func TestImportExtractedTransactions_GroupCheck(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	mockStore.EXPECT().GetGroup(gomock.Any(), "group-1").Return(&pfinancev1.FinanceGroup{
		Id:        "group-1",
		MemberIds: []string{"user-1"},
	}, nil)
	mockStore.EXPECT().CreateExpense(gomock.Any(), gomock.Any()).Return(nil).Times(1)

	mock := &mockExtractor{
		importExpenses: []*pfinancev1.Expense{
			{Id: "exp-1", UserId: "user-1", GroupId: "group-1", Description: "Coffee", Amount: 5.50},
		},
	}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(mockStore)
	ctx := authedCtx("user-1")

	resp, err := svc.ImportExtractedTransactions(ctx, connect.NewRequest(&pfinancev1.ImportExtractedTransactionsRequest{
		UserId:  "user-1",
		GroupId: "group-1",
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Description: "Coffee", Amount: 5.50, IsDebit: true, Confidence: 0.9},
		},
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.ImportedCount != 1 {
		t.Fatalf("expected 1 imported, got %d", resp.Msg.ImportedCount)
	}
}

func TestImportExtractedTransactions_GroupNotMember(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	mockStore.EXPECT().GetGroup(gomock.Any(), "group-1").Return(&pfinancev1.FinanceGroup{
		Id:        "group-1",
		MemberIds: []string{"other-user"},
	}, nil)

	mock := &mockExtractor{}
	SetExtractionService(mock)
	defer SetExtractionService(nil)

	svc := NewFinanceService(mockStore)
	ctx := authedCtx("user-1")

	_, err := svc.ImportExtractedTransactions(ctx, connect.NewRequest(&pfinancev1.ImportExtractedTransactionsRequest{
		UserId:  "user-1",
		GroupId: "group-1",
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Description: "Coffee", Amount: 5.50, IsDebit: true},
		},
	}))

	if err == nil {
		t.Fatal("expected permission denied error for non-member")
	}
	connectErr, ok := err.(*connect.Error)
	if !ok {
		t.Fatalf("expected *connect.Error, got %T", err)
	}
	if connectErr.Code() != connect.CodePermissionDenied {
		t.Fatalf("expected CodePermissionDenied, got %v", connectErr.Code())
	}
}

func TestMapExtractionError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		wantCode connect.Code
	}{
		{
			"ML unavailable",
			&extraction.ExtractionError{Code: extraction.ErrMLServiceUnavailable, Message: "down"},
			connect.CodeUnavailable,
		},
		{
			"ML timeout",
			&extraction.ExtractionError{Code: extraction.ErrMLServiceTimeout, Message: "timeout"},
			connect.CodeUnavailable,
		},
		{
			"Gemini unavailable",
			&extraction.ExtractionError{Code: extraction.ErrGeminiUnavailable, Message: "down"},
			connect.CodeUnavailable,
		},
		{
			"Gemini rate limited",
			&extraction.ExtractionError{Code: extraction.ErrGeminiRateLimited, Message: "rate limited"},
			connect.CodeResourceExhausted,
		},
		{
			"Invalid document",
			&extraction.ExtractionError{Code: extraction.ErrInvalidDocument, Message: "bad"},
			connect.CodeInvalidArgument,
		},
		{
			"All methods failed",
			&extraction.ExtractionError{Code: extraction.ErrAllMethodsFailed, Message: "all failed"},
			connect.CodeUnavailable,
		},
		{
			"Generic error",
			fmt.Errorf("something went wrong"),
			connect.CodeInternal,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			connectErr := mapExtractionError(tc.err)
			if connectErr.Code() != tc.wantCode {
				t.Fatalf("mapExtractionError(%v) code = %v, want %v", tc.err, connectErr.Code(), tc.wantCode)
			}
		})
	}
}

func TestShouldUseAsyncPath(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected bool
	}{
		{"Non-PDF", []byte("not a pdf"), false},
		{"Empty", []byte{}, false},
		{"Short data", []byte("abc"), false},
		{"PDF with 1 page", []byte("%PDF-1.4\n/Type /Page\n"), false},
		{"PDF with 4 pages", []byte("%PDF-1.4\n/Type /Page\n/Type /Page\n/Type /Page\n/Type /Page\n"), true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := shouldUseAsyncPath(tc.data)
			if result != tc.expected {
				t.Fatalf("shouldUseAsyncPath(%q) = %v, want %v", tc.name, result, tc.expected)
			}
		})
	}
}
