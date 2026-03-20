package extraction

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// newTestStatementServer creates a mock statement parser HTTP server.
func newTestStatementServer(t *testing.T, resp StatementParseResponse) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte(`{"status":"healthy"}`))
			return
		}
		if r.URL.Path != "/v1/parse-statement" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
}

func TestParseBankStatement_SuccessfulParse(t *testing.T) {
	stmtResp := StatementParseResponse{
		Transactions: []StatementTransaction{
			{
				ID:          "tx-1",
				Date:        "2024-01-15",
				Description: "WOOLWORTHS 1234",
				Amount:      55.20,
				IsDebit:     true,
				Confidence:  0.93,
				Page:        1,
			},
			{
				ID:          "tx-2",
				Date:        "2024-01-16",
				Description: "SALARY DEPOSIT",
				Amount:      3000.00,
				IsDebit:     false,
				Confidence:  0.89,
				Page:        1,
			},
		},
		Confidence:        0.91,
		BankDetected:      "CBA",
		PageCount:         1,
		ProcessingTimeMS:  200,
		NeedsFallback:     false,
		BalanceReconciled: true,
	}
	server := newTestStatementServer(t, stmtResp)
	defer server.Close()

	svc := &ExtractionService{
		stmtClient:    NewStatementParserClient(server.URL),
		stmtEnabled:   true,
		merchantCache: NewMerchantCache(0, 100),
	}

	result, err := svc.ParseBankStatement(
		context.Background(),
		[]byte("fake-pdf"),
		"CBA",
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED,
	)
	if err != nil {
		t.Fatalf("ParseBankStatement failed: %v", err)
	}

	if result.BankDetected != "CBA" {
		t.Errorf("BankDetected = %q, want %q", result.BankDetected, "CBA")
	}
	if len(result.Transactions) != 2 {
		t.Fatalf("got %d transactions, want 2", len(result.Transactions))
	}
	if result.Transactions[0].Description != "WOOLWORTHS 1234" {
		t.Errorf("tx[0].Description = %q, want %q", result.Transactions[0].Description, "WOOLWORTHS 1234")
	}
	if result.Transactions[0].AmountCents != 5520 {
		t.Errorf("tx[0].AmountCents = %d, want 5520", result.Transactions[0].AmountCents)
	}
	if result.MethodUsed != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED {
		t.Errorf("MethodUsed = %v, want SELF_HOSTED", result.MethodUsed)
	}
	if result.BalanceReconciled != true {
		t.Error("BalanceReconciled = false, want true")
	}
	if result.Confidence != 0.91 {
		t.Errorf("Confidence = %f, want 0.91", result.Confidence)
	}
}

func TestParseBankStatement_LowConfidenceFallsBackToGemini(t *testing.T) {
	// Statement parser returns low confidence → triggers Gemini fallback
	stmtResp := StatementParseResponse{
		Transactions: []StatementTransaction{
			{
				ID:          "tx-1",
				Date:        "2024-01-15",
				Description: "UNKNOWN",
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
	stmtServer := newTestStatementServer(t, stmtResp)
	defer stmtServer.Close()

	// Without Gemini available, should return error
	svc := &ExtractionService{
		stmtClient:    NewStatementParserClient(stmtServer.URL),
		stmtEnabled:   true,
		merchantCache: NewMerchantCache(0, 100),
	}

	_, err := svc.ParseBankStatement(
		context.Background(),
		[]byte("fake-pdf"),
		"",
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED,
	)
	if err == nil {
		t.Fatal("expected error when ML returns low confidence and Gemini unavailable")
	}

	extErr, ok := err.(*ExtractionError)
	if !ok {
		t.Fatalf("expected *ExtractionError, got %T", err)
	}
	if extErr.Code != ErrGeminiUnavailable {
		t.Errorf("error code = %v, want ErrGeminiUnavailable", extErr.Code)
	}
}

func TestParseBankStatement_StatementParserDown(t *testing.T) {
	// Statement parser server returns errors
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "service unavailable", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	// Without Gemini or ML fallback, should return error
	svc := &ExtractionService{
		stmtClient:    NewStatementParserClient(server.URL),
		stmtEnabled:   true,
		merchantCache: NewMerchantCache(0, 100),
	}

	_, err := svc.ParseBankStatement(
		context.Background(),
		[]byte("fake-pdf"),
		"",
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED,
	)
	if err == nil {
		t.Fatal("expected error when statement parser is down and no fallback available")
	}
}

func TestParseBankStatement_GeminiExplicitMethod(t *testing.T) {
	// When Gemini is explicitly requested, statement parser should NOT be called
	stmtCalled := false
	stmtServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		stmtCalled = true
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(StatementParseResponse{})
	}))
	defer stmtServer.Close()

	svc := &ExtractionService{
		stmtClient:    NewStatementParserClient(stmtServer.URL),
		stmtEnabled:   true,
		merchantCache: NewMerchantCache(0, 100),
		// No Gemini validator → will fail, but statement parser should NOT be called
	}

	_, err := svc.ParseBankStatement(
		context.Background(),
		[]byte("fake-pdf"),
		"",
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI,
	)
	// Should fail because Gemini is not available
	if err == nil {
		t.Fatal("expected error when Gemini explicitly requested but unavailable")
	}
	if stmtCalled {
		t.Error("statement parser was called when Gemini was explicitly requested")
	}
}

func TestParseBankStatement_NoBothServices(t *testing.T) {
	svc := &ExtractionService{
		merchantCache: NewMerchantCache(0, 100),
	}

	_, err := svc.ParseBankStatement(
		context.Background(),
		[]byte("fake-pdf"),
		"",
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED,
	)
	if err == nil {
		t.Fatal("expected error when no services available")
	}
}

func TestParseBankStatement_BankDetectionRouting(t *testing.T) {
	// Verify bank_hint is passed through to the statement parser
	var receivedBankHint string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/parse-statement" {
			r.ParseMultipartForm(10 << 20)
			receivedBankHint = r.FormValue("bank_hint")
			resp := StatementParseResponse{
				Transactions: []StatementTransaction{
					{
						ID:          "tx-1",
						Date:        "2024-01-15",
						Description: "WESTPAC TFR",
						Amount:      100.00,
						IsDebit:     true,
						Confidence:  0.85,
						Page:        1,
					},
				},
				Confidence:   0.85,
				BankDetected: "Westpac",
				PageCount:    1,
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		http.NotFound(w, r)
	}))
	defer server.Close()

	svc := &ExtractionService{
		stmtClient:    NewStatementParserClient(server.URL),
		stmtEnabled:   true,
		merchantCache: NewMerchantCache(0, 100),
	}

	result, err := svc.ParseBankStatement(
		context.Background(),
		[]byte("fake-pdf"),
		"Westpac",
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED,
	)
	if err != nil {
		t.Fatalf("ParseBankStatement failed: %v", err)
	}

	if receivedBankHint != "Westpac" {
		t.Errorf("bank_hint sent to ML = %q, want %q", receivedBankHint, "Westpac")
	}
	if result.BankDetected != "Westpac" {
		t.Errorf("BankDetected = %q, want %q", result.BankDetected, "Westpac")
	}
}
