package extraction

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatementParserClient_ParseStatement(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/parse-statement" {
			t.Errorf("unexpected path: %s", r.URL.Path)
			http.NotFound(w, r)
			return
		}

		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		if err := r.ParseMultipartForm(10 << 20); err != nil {
			t.Errorf("failed to parse multipart form: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}

		// Verify bank_hint field is passed through
		bankHint := r.FormValue("bank_hint")
		if bankHint != "CBA" {
			t.Errorf("bank_hint = %q, want %q", bankHint, "CBA")
		}

		bal := 1234.56
		resp := StatementParseResponse{
			Transactions: []StatementTransaction{
				{
					ID:          "tx-1",
					Date:        "2024-01-15",
					Description: "WOOLWORTHS 1234 SYDNEY",
					Amount:      45.99,
					IsDebit:     true,
					Balance:     &bal,
					Confidence:  0.92,
					Page:        1,
					FieldConfidences: map[string]float64{
						"amount":      0.95,
						"date":        0.98,
						"description": 0.90,
					},
				},
				{
					ID:          "tx-2",
					Date:        "2024-01-16",
					Description: "SALARY PAYMENT",
					Amount:      3500.00,
					IsDebit:     false,
					Confidence:  0.88,
					Page:        1,
				},
			},
			Confidence:        0.90,
			BankDetected:      "CBA",
			PageCount:         2,
			ProcessingTimeMS:  350,
			NeedsFallback:     false,
			BalanceReconciled: true,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewStatementParserClient(server.URL)
	result, err := client.ParseStatement(context.Background(), []byte("fake-pdf-bytes"), "CBA")
	if err != nil {
		t.Fatalf("ParseStatement failed: %v", err)
	}

	if result.BankDetected != "CBA" {
		t.Errorf("BankDetected = %q, want %q", result.BankDetected, "CBA")
	}
	if len(result.Transactions) != 2 {
		t.Fatalf("got %d transactions, want 2", len(result.Transactions))
	}
	if result.Transactions[0].Description != "WOOLWORTHS 1234 SYDNEY" {
		t.Errorf("tx[0].Description = %q, want %q", result.Transactions[0].Description, "WOOLWORTHS 1234 SYDNEY")
	}
	if result.Transactions[0].Amount != 45.99 {
		t.Errorf("tx[0].Amount = %f, want 45.99", result.Transactions[0].Amount)
	}
	if !result.BalanceReconciled {
		t.Error("BalanceReconciled = false, want true")
	}
	if result.NeedsFallback {
		t.Error("NeedsFallback = true, want false")
	}
	if result.Confidence != 0.90 {
		t.Errorf("Confidence = %f, want 0.90", result.Confidence)
	}
}

func TestStatementParserClient_ParseStatement_LowConfidence(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		resp := StatementParseResponse{
			Transactions: []StatementTransaction{
				{
					ID:          "tx-1",
					Date:        "2024-01-15",
					Description: "UNKNOWN TXN",
					Amount:      10.00,
					IsDebit:     true,
					Confidence:  0.3,
					Page:        1,
				},
			},
			Confidence:     0.35,
			NeedsFallback:  true,
			FallbackReason: "overall confidence below threshold",
			PageCount:      1,
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewStatementParserClient(server.URL)
	result, err := client.ParseStatement(context.Background(), []byte("fake-pdf-bytes"), "")
	if err != nil {
		t.Fatalf("ParseStatement failed: %v", err)
	}

	if !result.NeedsFallback {
		t.Error("NeedsFallback = false, want true")
	}
	if result.Confidence >= StatementConfidenceFallbackThreshold {
		t.Errorf("Confidence = %f, should be below fallback threshold %f",
			result.Confidence, StatementConfidenceFallbackThreshold)
	}
}

func TestStatementParserClient_ParseStatement_ServerError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, `{"error": "internal server error"}`, http.StatusInternalServerError)
	}))
	defer server.Close()

	client := NewStatementParserClient(server.URL)
	_, err := client.ParseStatement(context.Background(), []byte("fake-pdf-bytes"), "")
	if err == nil {
		t.Fatal("expected error for server error response")
	}
}

func TestStatementParserClient_HealthCheck(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/health" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status": "healthy"}`))
	}))
	defer server.Close()

	client := NewStatementParserClient(server.URL)
	err := client.HealthCheck(context.Background())
	if err != nil {
		t.Fatalf("HealthCheck failed: %v", err)
	}
}

func TestStatementParseResponse_ToMLTransactions(t *testing.T) {
	bal := 1000.50
	resp := &StatementParseResponse{
		Transactions: []StatementTransaction{
			{
				ID:          "tx-1",
				Date:        "2024-03-15",
				Description: "COLES EXPRESS MELBOURNE",
				Amount:      32.50,
				IsDebit:     true,
				Balance:     &bal,
				Confidence:  0.91,
				Page:        1,
				FieldConfidences: map[string]float64{
					"amount":      0.95,
					"date":        0.98,
					"description": 0.88,
				},
			},
		},
	}

	mlTxns := resp.ToMLTransactions()
	if len(mlTxns) != 1 {
		t.Fatalf("got %d transactions, want 1", len(mlTxns))
	}

	tx := mlTxns[0]
	if tx.ID != "tx-1" {
		t.Errorf("ID = %q, want %q", tx.ID, "tx-1")
	}
	if tx.Description != "COLES EXPRESS MELBOURNE" {
		t.Errorf("Description = %q, want %q", tx.Description, "COLES EXPRESS MELBOURNE")
	}
	if tx.Amount != 32.50 {
		t.Errorf("Amount = %f, want 32.50", tx.Amount)
	}
	if !tx.IsDebit {
		t.Error("IsDebit = false, want true")
	}
	if tx.FieldConfidences == nil {
		t.Fatal("FieldConfidences is nil")
	}
	if tx.FieldConfidences.Amount != 0.95 {
		t.Errorf("FieldConfidences.Amount = %f, want 0.95", tx.FieldConfidences.Amount)
	}
}
