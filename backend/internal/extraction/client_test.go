package extraction

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestMLClient_HealthCheck(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}

		resp := MLHealthResponse{
			Status:      "healthy",
			ModelLoaded: true,
			ModelName:   "PaddleOCR-VL-1.5",
			Version:     "0.1.0",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewMLClient(server.URL)
	health, err := client.HealthCheck(context.Background())
	if err != nil {
		t.Fatalf("HealthCheck failed: %v", err)
	}

	if health.Status != "healthy" {
		t.Errorf("Status = %q, want %q", health.Status, "healthy")
	}
	if !health.ModelLoaded {
		t.Error("ModelLoaded = false, want true")
	}
}

func TestMLClient_Extract(t *testing.T) {
	// Create mock server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/extract" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}

		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Verify multipart form
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Errorf("failed to parse multipart form: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		// Check document_type field
		docType := r.FormValue("document_type")
		if docType != "receipt" {
			t.Errorf("document_type = %q, want %q", docType, "receipt")
		}

		// Return mock response
		resp := MLExtractionResponse{
			Transactions: []MLTransaction{
				{
					ID:                 "tx-1",
					Date:               "2024-01-15",
					Description:        "STARBUCKS #123",
					NormalizedMerchant: "Starbucks",
					Amount:             5.50,
					SuggestedCategory:  "Food",
					Confidence:         0.95,
					IsDebit:            true,
				},
			},
			OverallConfidence: 0.95,
			ModelUsed:         "PaddleOCR-VL-1.5",
			ProcessingTimeMS:  150,
			DocumentType:      "receipt",
			PageCount:         1,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewMLClient(server.URL)
	result, err := client.Extract(
		context.Background(),
		[]byte("fake image data"),
		"test.jpg",
		pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT,
	)
	if err != nil {
		t.Fatalf("Extract failed: %v", err)
	}

	if len(result.Transactions) != 1 {
		t.Errorf("got %d transactions, want 1", len(result.Transactions))
	}

	if result.Transactions[0].Amount != 5.50 {
		t.Errorf("Amount = %f, want 5.50", result.Transactions[0].Amount)
	}

	if result.OverallConfidence != 0.95 {
		t.Errorf("OverallConfidence = %f, want 0.95", result.OverallConfidence)
	}
}

func TestMLExtractionResponse_ToExtractionResult(t *testing.T) {
	resp := &MLExtractionResponse{
		Transactions: []MLTransaction{
			{
				ID:                 "tx-1",
				Date:               "2024-01-15",
				Description:        "Coffee Shop",
				NormalizedMerchant: "Starbucks",
				Amount:             5.50,
				SuggestedCategory:  "Food",
				Confidence:         0.95,
				IsDebit:            true,
			},
			{
				ID:                 "tx-2",
				Date:               "2024-01-16",
				Description:        "Gas Station",
				NormalizedMerchant: "Shell",
				Amount:             45.00,
				SuggestedCategory:  "Transportation",
				Confidence:         0.90,
				IsDebit:            true,
			},
		},
		OverallConfidence: 0.925,
		ModelUsed:         "PaddleOCR-VL-1.5",
		ProcessingTimeMS:  200,
		DocumentType:      "receipt",
		PageCount:         1,
	}

	result := resp.ToExtractionResult()

	if len(result.Transactions) != 2 {
		t.Errorf("got %d transactions, want 2", len(result.Transactions))
	}

	if result.Transactions[0].SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
		t.Errorf("first transaction category = %v, want FOOD", result.Transactions[0].SuggestedCategory)
	}

	if result.Transactions[1].SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION {
		t.Errorf("second transaction category = %v, want TRANSPORTATION", result.Transactions[1].SuggestedCategory)
	}

	if result.ModelUsed != "PaddleOCR-VL-1.5" {
		t.Errorf("ModelUsed = %q, want %q", result.ModelUsed, "PaddleOCR-VL-1.5")
	}
}

func TestDocumentTypeToString(t *testing.T) {
	tests := []struct {
		dt   pfinancev1.DocumentType
		want string
	}{
		{pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT, "receipt"},
		{pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, "bank_statement"},
		{pfinancev1.DocumentType_DOCUMENT_TYPE_INVOICE, "invoice"},
		{pfinancev1.DocumentType_DOCUMENT_TYPE_UNSPECIFIED, "receipt"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := documentTypeToString(tt.dt)
			if got != tt.want {
				t.Errorf("documentTypeToString(%v) = %q, want %q", tt.dt, got, tt.want)
			}
		})
	}
}

func TestStringToCategory(t *testing.T) {
	tests := []struct {
		s    string
		want pfinancev1.ExpenseCategory
	}{
		{"Food", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{"Transportation", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
		{"Entertainment", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT},
		{"Shopping", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING},
		{"Unknown", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER},
		{"", pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER},
	}

	for _, tt := range tests {
		t.Run(tt.s, func(t *testing.T) {
			got := stringToCategory(tt.s)
			if got != tt.want {
				t.Errorf("stringToCategory(%q) = %v, want %v", tt.s, got, tt.want)
			}
		})
	}
}
