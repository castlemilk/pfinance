package extraction

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestExtractJSON_ValidJSON(t *testing.T) {
	input := `{"transactions": [{"date": "2024-01-15", "description": "Coffee Shop", "amount": 5.50}]}`
	var result GeminiResponse
	if err := extractJSON(input, &result); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(result.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(result.Transactions))
	}
	if result.Transactions[0].Amount != 5.50 {
		t.Fatalf("expected amount 5.50, got %f", result.Transactions[0].Amount)
	}
}

func TestExtractJSON_MarkdownFences(t *testing.T) {
	input := "```json\n{\"transactions\": [{\"date\": \"2024-01-15\", \"description\": \"Lunch\", \"amount\": 12.00}]}\n```"
	var result GeminiResponse
	if err := extractJSON(input, &result); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(result.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(result.Transactions))
	}
}

func TestExtractJSON_NoJSON(t *testing.T) {
	input := "This is just plain text with no JSON."
	var result GeminiResponse
	if err := extractJSON(input, &result); err == nil {
		t.Fatal("expected error for no JSON, got nil")
	}
}

func TestExtractJSON_MalformedJSON(t *testing.T) {
	input := `{"transactions": [{"date": "2024-01-15", "amount": }]}`
	var result GeminiResponse
	if err := extractJSON(input, &result); err == nil {
		t.Fatal("expected error for malformed JSON, got nil")
	}
}

func TestExtractJSON_NestedBraces(t *testing.T) {
	input := `Some text before {"transactions": [{"date": "2024-01-15", "description": "Store {A}", "amount": 10.00}]} and after`
	var result GeminiResponse
	if err := extractJSON(input, &result); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if len(result.Transactions) != 1 {
		t.Fatalf("expected 1 transaction, got %d", len(result.Transactions))
	}
}

func TestParseCategory_AllCategories(t *testing.T) {
	tests := []struct {
		input    string
		expected pfinancev1.ExpenseCategory
	}{
		{"Food", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{"food", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{"groceries", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{"restaurant", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{"dining", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{"Housing", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING},
		{"rent", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING},
		{"mortgage", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING},
		{"Transportation", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
		{"transport", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
		{"fuel", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
		{"gas", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
		{"parking", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
		{"Entertainment", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT},
		{"movies", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT},
		{"games", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT},
		{"streaming", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT},
		{"Healthcare", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE},
		{"health", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE},
		{"medical", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE},
		{"pharmacy", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE},
		{"Utilities", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES},
		{"electricity", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES},
		{"water", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES},
		{"internet", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES},
		{"phone", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES},
		{"Shopping", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING},
		{"retail", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING},
		{"clothing", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING},
		{"electronics", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING},
		{"Education", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION},
		{"school", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION},
		{"tuition", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION},
		{"courses", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION},
		{"Travel", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL},
		{"hotel", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL},
		{"flight", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL},
		{"vacation", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL},
		{"other", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result := parseCategory(tc.input)
			if result != tc.expected {
				t.Fatalf("parseCategory(%q) = %v, want %v", tc.input, result, tc.expected)
			}
		})
	}
}

func TestParseCategory_Unknown(t *testing.T) {
	result := parseCategory("random_unknown_category")
	if result != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
		t.Fatalf("expected UNSPECIFIED for unknown, got %v", result)
	}
}

func TestParseCategory_Whitespace(t *testing.T) {
	result := parseCategory("  food  ")
	if result != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
		t.Fatalf("expected FOOD for trimmed input, got %v", result)
	}
}

func TestDetectMimeType(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected string
	}{
		{"PDF", []byte("%PDF-1.4 some content"), "application/pdf"},
		{"PNG", append([]byte{0x89, 0x50, 0x4E, 0x47}, make([]byte, 4)...), "image/png"},
		{"JPEG default", []byte{0xFF, 0xD8, 0xFF, 0xE0}, "image/jpeg"},
		{"Empty data", []byte{}, "image/jpeg"},
		{"Short data", []byte{0x01}, "image/jpeg"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := detectMimeType(tc.data)
			if result != tc.expected {
				t.Fatalf("detectMimeType(%v) = %q, want %q", tc.name, result, tc.expected)
			}
		})
	}
}

func TestCountPDFPages(t *testing.T) {
	tests := []struct {
		name     string
		data     string
		expected int
	}{
		{"Single page", "%PDF-1.4\n/Type /Page\n", 1},
		{"Two pages", "%PDF-1.4\n/Type /Page\n/Type /Page\n", 2},
		{"Pages object excluded", "%PDF-1.4\n/Type /Pages\n/Type /Page\n", 1},
		{"Mixed pages and Pages", "%PDF-1.4\n/Type /Page\n/Type /Pages\n/Type /Page\n", 2},
		{"No pages defaults to 1", "%PDF-1.4\nsome content", 1},
		{"Empty data", "", 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := countPDFPages([]byte(tc.data))
			if result != tc.expected {
				t.Fatalf("countPDFPages(%q) = %d, want %d", tc.name, result, tc.expected)
			}
		})
	}
}

func TestCountPDFPagesFromData(t *testing.T) {
	data := []byte("%PDF-1.4\n/Type /Page\n/Type /Page\n/Type /Page\n")
	result := CountPDFPagesFromData(data)
	if result != 3 {
		t.Fatalf("CountPDFPagesFromData = %d, want 3", result)
	}
}

// newTestGeminiServer creates an httptest server that mimics the Gemini API.
func newTestGeminiServer(t *testing.T, response interface{}, statusCode int) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(response)
	}))
}

func makeGeminiExtractResponse(transactions []GeminiTransaction) interface{} {
	jsonData, _ := json.Marshal(GeminiResponse{Transactions: transactions})
	return map[string]interface{}{
		"candidates": []map[string]interface{}{
			{
				"content": map[string]interface{}{
					"parts": []map[string]interface{}{
						{"text": string(jsonData)},
					},
				},
			},
		},
	}
}

func TestValidationService_ExtractWithGemini(t *testing.T) {
	transactions := []GeminiTransaction{
		{Date: "2024-01-15", Description: "Coffee Shop", Amount: 5.50, Category: "Food"},
		{Date: "2024-01-16", Description: "Gas Station", Amount: 45.00, Category: "Transportation"},
	}

	server := newTestGeminiServer(t, makeGeminiExtractResponse(transactions), http.StatusOK)
	defer server.Close()

	svc := NewValidationService("test-key", "")
	svc.geminiBaseURL = server.URL
	svc.RetryConfig = RetryConfig{MaxRetries: 0} // No retries for tests

	result, err := svc.ExtractWithGemini(context.Background(), []byte("fake image data"), pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Transactions) != 2 {
		t.Fatalf("expected 2 transactions, got %d", len(result.Transactions))
	}

	if result.MethodUsed != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI {
		t.Fatalf("expected GEMINI method, got %v", result.MethodUsed)
	}

	if result.ModelUsed != "gemini-1.5-flash" {
		t.Fatalf("expected model gemini-1.5-flash, got %q", result.ModelUsed)
	}

	// Verify first transaction
	tx := result.Transactions[0]
	if tx.Description != "Coffee Shop" {
		t.Fatalf("expected 'Coffee Shop', got %q", tx.Description)
	}
	if tx.Amount != 5.50 {
		t.Fatalf("expected 5.50, got %f", tx.Amount)
	}
	if tx.SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
		t.Fatalf("expected FOOD category, got %v", tx.SuggestedCategory)
	}

	// Verify field confidences are set
	if tx.FieldConfidences == nil {
		t.Fatal("expected field confidences to be set")
	}
	if tx.FieldConfidences.Amount != 0.95 {
		t.Fatalf("expected amount confidence 0.95, got %f", tx.FieldConfidences.Amount)
	}
}

func TestValidationService_ExtractWithGemini_NoAPIKey(t *testing.T) {
	svc := NewValidationService("", "")
	_, err := svc.ExtractWithGemini(context.Background(), []byte("data"), pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT)
	if err == nil {
		t.Fatal("expected error for empty API key")
	}
}

func TestValidationService_ExtractWithGemini_PDFPageCount(t *testing.T) {
	transactions := []GeminiTransaction{
		{Date: "2024-01-15", Description: "Test", Amount: 10.00},
	}

	server := newTestGeminiServer(t, makeGeminiExtractResponse(transactions), http.StatusOK)
	defer server.Close()

	svc := NewValidationService("test-key", "")
	svc.geminiBaseURL = server.URL
	svc.RetryConfig = RetryConfig{MaxRetries: 0}

	// Simulate a PDF with 3 pages
	pdfData := []byte("%PDF-1.4\n/Type /Page\n/Type /Page\n/Type /Page\n")
	result, err := svc.ExtractWithGemini(context.Background(), pdfData, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.PageCount != 3 {
		t.Fatalf("expected 3 pages, got %d", result.PageCount)
	}
}

func makeGeminiParseResponse(expenses []ParsedTextExpense) interface{} {
	resp := ParsedTextResponse{
		Expenses: expenses,
		Success:  true,
	}
	jsonData, _ := json.Marshal(resp)
	return map[string]interface{}{
		"candidates": []map[string]interface{}{
			{
				"content": map[string]interface{}{
					"parts": []map[string]interface{}{
						{"text": string(jsonData)},
					},
				},
			},
		},
	}
}

func TestValidationService_ParseExpenseText(t *testing.T) {
	expenses := []ParsedTextExpense{
		{
			Description: "Coffee",
			Amount:      5.50,
			Category:    "Food",
			Frequency:   "once",
			Confidence:  0.9,
			Reasoning:   "Clear expense",
		},
	}

	server := newTestGeminiServer(t, makeGeminiParseResponse(expenses), http.StatusOK)
	defer server.Close()

	svc := NewValidationService("test-key", "")
	svc.geminiBaseURL = server.URL

	result, err := svc.ParseExpenseText(context.Background(), "Coffee $5.50")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !result.Success {
		t.Fatal("expected success=true")
	}
	if len(result.Expenses) != 1 {
		t.Fatalf("expected 1 expense, got %d", len(result.Expenses))
	}
	if result.Expenses[0].Description != "Coffee" {
		t.Fatalf("expected 'Coffee', got %q", result.Expenses[0].Description)
	}
}

func TestValidationService_ParseExpenseText_NoAPIKey(t *testing.T) {
	svc := NewValidationService("", "")
	_, err := svc.ParseExpenseText(context.Background(), "test")
	if err == nil {
		t.Fatal("expected error for empty API key")
	}
}

func TestCompareResults_BothEmpty(t *testing.T) {
	svc := NewValidationService("test-key", "")
	result := svc.compareResults(
		&pfinancev1.ExtractionResult{},
		&GeminiResponse{},
	)
	if result.Accuracy != 1.0 {
		t.Fatalf("expected accuracy 1.0 for empty results, got %f", result.Accuracy)
	}
}

func TestCompareResults_ExactMatch(t *testing.T) {
	svc := NewValidationService("test-key", "")
	extracted := &pfinancev1.ExtractionResult{
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Amount: 10.00},
			{Id: "2", Amount: 20.00},
		},
	}
	validated := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Amount: 10.00},
			{Amount: 20.00},
		},
	}

	result := svc.compareResults(extracted, validated)
	if result.Accuracy < 0.99 {
		t.Fatalf("expected high accuracy for exact match, got %f", result.Accuracy)
	}
}

func TestCompareResults_WithinTolerance(t *testing.T) {
	svc := NewValidationService("test-key", "")
	extracted := &pfinancev1.ExtractionResult{
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Amount: 10.00},
		},
	}
	validated := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Amount: 10.05}, // Within $0.10 tolerance
		},
	}

	result := svc.compareResults(extracted, validated)
	if result.Accuracy < 0.9 {
		t.Fatalf("expected high accuracy for within-tolerance match, got %f", result.Accuracy)
	}
}

func TestCompareResults_LargeMismatch(t *testing.T) {
	svc := NewValidationService("test-key", "")
	extracted := &pfinancev1.ExtractionResult{
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Amount: 10.00},
		},
	}
	validated := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Amount: 50.00}, // Very different
		},
	}

	result := svc.compareResults(extracted, validated)
	if result.Accuracy > 0.5 {
		t.Fatalf("expected low accuracy for large mismatch, got %f", result.Accuracy)
	}
	if len(result.Discrepancies) == 0 {
		t.Fatal("expected discrepancies for mismatch")
	}
}

func TestCompareResults_CountMismatch(t *testing.T) {
	svc := NewValidationService("test-key", "")
	extracted := &pfinancev1.ExtractionResult{
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Amount: 10.00},
		},
	}
	validated := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Amount: 10.00},
			{Amount: 20.00},
			{Amount: 30.00},
		},
	}

	result := svc.compareResults(extracted, validated)
	// Count mismatch means accuracy should be penalized
	if result.Accuracy > 0.8 {
		t.Fatalf("expected lower accuracy for count mismatch, got %f", result.Accuracy)
	}
}

func TestValidateExtraction_WithMockServer(t *testing.T) {
	transactions := []GeminiTransaction{
		{Date: "2024-01-15", Description: "Coffee", Amount: 5.50},
	}

	server := newTestGeminiServer(t, makeGeminiExtractResponse(transactions), http.StatusOK)
	defer server.Close()

	svc := NewValidationService("test-key", "")
	svc.geminiBaseURL = server.URL
	svc.RetryConfig = RetryConfig{MaxRetries: 0}

	extracted := &pfinancev1.ExtractionResult{
		Transactions: []*pfinancev1.ExtractedTransaction{
			{Id: "1", Amount: 5.50, Date: "2024-01-15", Description: "Coffee"},
		},
	}

	result, err := svc.ValidateExtraction(context.Background(), []byte("fake data"), extracted)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result.ValidatedBy != "gemini-1.5-flash" {
		t.Fatalf("expected validated by gemini-1.5-flash, got %q", result.ValidatedBy)
	}
	if result.Accuracy < 0.9 {
		t.Fatalf("expected high accuracy for matching results, got %f", result.Accuracy)
	}
}

func TestClassifyGeminiHTTPError(t *testing.T) {
	tests := []struct {
		statusCode int
		expectCode ExtractionErrorCode
		retryable  bool
	}{
		{http.StatusTooManyRequests, ErrGeminiRateLimited, true},
		{http.StatusInternalServerError, ErrGeminiUnavailable, true},
		{http.StatusServiceUnavailable, ErrGeminiUnavailable, true},
		{http.StatusBadRequest, ErrGeminiUnavailable, false},
	}

	for _, tc := range tests {
		t.Run(fmt.Sprintf("HTTP_%d", tc.statusCode), func(t *testing.T) {
			err := classifyGeminiHTTPError(tc.statusCode, "error body")
			if err.Code != tc.expectCode {
				t.Fatalf("expected code %s, got %s", tc.expectCode, err.Code)
			}
			if err.Retryable != tc.retryable {
				t.Fatalf("expected retryable=%v, got %v", tc.retryable, err.Retryable)
			}
		})
	}
}

func TestIsGeminiAvailable(t *testing.T) {
	svc := NewValidationService("test-key", "")
	if !svc.IsGeminiAvailable() {
		t.Fatal("expected Gemini to be available with API key")
	}

	svc2 := NewValidationService("", "")
	if svc2.IsGeminiAvailable() {
		t.Fatal("expected Gemini to be unavailable without API key")
	}
}
