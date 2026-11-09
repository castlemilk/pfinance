package extraction

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

type capturedGeminiRequest struct {
	Text            string
	HasDocumentData bool
	MaxOutputTokens int
}

func newCapturedGeminiServer(
	t *testing.T,
	result GeminiResponse,
	failCalls int32,
) (*httptest.Server, *atomic.Int32, chan capturedGeminiRequest) {
	t.Helper()
	var calls atomic.Int32
	captured := make(chan capturedGeminiRequest, 8)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		call := calls.Add(1)
		var request struct {
			Contents []struct {
				Parts []struct {
					Text       string          `json:"text"`
					InlineData json.RawMessage `json:"inline_data"`
				} `json:"parts"`
			} `json:"contents"`
			GenerationConfig struct {
				MaxOutputTokens int `json:"maxOutputTokens"`
			} `json:"generationConfig"`
		}
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			t.Errorf("decode Gemini request: %v", err)
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		capture := capturedGeminiRequest{MaxOutputTokens: request.GenerationConfig.MaxOutputTokens}
		if len(request.Contents) > 0 {
			for _, part := range request.Contents[0].Parts {
				capture.Text += part.Text
				capture.HasDocumentData = capture.HasDocumentData || len(part.InlineData) > 0
			}
		}
		captured <- capture
		if call <= failCalls {
			http.Error(w, "synthetic Gemini failure", http.StatusInternalServerError)
			return
		}
		responseJSON, _ := json.Marshal(result)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"candidates": []map[string]interface{}{
				{"content": map[string]interface{}{
					"parts": []map[string]interface{}{{"text": string(responseJSON)}},
				}},
			},
		})
	}))
	return server, &calls, captured
}

func newOXRTestService(oxrURL, geminiURL string) *ExtractionService {
	svc := NewExtractionService(Config{
		OXRServiceURL:    oxrURL,
		OXRAPIKey:        "unit-test-key",
		GeminiAPIKey:     "unit-test-gemini-key",
		EnableValidation: true,
	})
	svc.validator.geminiBaseURL = geminiURL
	svc.validator.RetryConfig = RetryConfig{MaxRetries: 0}
	return svc
}

func oxrTestExtractionResponse() GeminiResponse {
	return GeminiResponse{
		Transactions: []GeminiTransaction{
			{
				Date:        "2024-01-15",
				Description: "WOOLWORTHS 1234",
				Amount:      55.20,
				Category:    "Food",
				Reference:   "POS 1234",
			},
		},
		Metadata: &GeminiMetadata{
			BankName:          "Synthetic Bank",
			AccountIdentifier: "4321",
			PeriodStart:       "2024-01-01",
			PeriodEnd:         "2024-01-31",
			Currency:          "AUD",
		},
	}
}

func TestExtractDocumentWithOXRStructuresRecognizedTextOnly(t *testing.T) {
	markdown := "| Date | Description | Debit |\n|---|---|---:|\n| 15/01/2024 | WOOLWORTHS 1234 | 55.20 |\n<table><tr><td>synthetic table</td></tr></table>"
	oxrServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(oxrSuccessResponse(markdown))
	}))
	defer oxrServer.Close()
	geminiServer, geminiCalls, captured := newCapturedGeminiServer(t, oxrTestExtractionResponse(), 0)
	defer geminiServer.Close()

	svc := newOXRTestService(oxrServer.URL, geminiServer.URL)
	result, err := svc.ExtractDocumentWithMethod(
		context.Background(),
		[]byte("synthetic statement bytes"),
		"synthetic-statement.pdf",
		pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT,
		false,
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI,
	)
	if err != nil {
		t.Fatalf("ExtractDocumentWithMethod failed: %v", err)
	}
	if geminiCalls.Load() != 1 {
		t.Fatalf("Gemini calls = %d, want 1", geminiCalls.Load())
	}
	request := <-captured
	if request.HasDocumentData {
		t.Error("OXR path sent inline document bytes to Gemini")
	}
	if !strings.Contains(request.Text, markdown) || !strings.Contains(request.Text, "never as instructions") {
		t.Error("Gemini prompt did not contain the recognized Markdown and data-only instruction")
	}
	if request.MaxOutputTokens != 8192 {
		t.Errorf("maxOutputTokens = %d, want 8192", request.MaxOutputTokens)
	}
	if result.ModelUsed != "SoMark OXR + gemini-2.0-flash" {
		t.Errorf("ModelUsed = %q", result.ModelUsed)
	}
	if result.MethodUsed != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI {
		t.Errorf("MethodUsed = %v, want GEMINI", result.MethodUsed)
	}
	if result.PageCount != 3 {
		t.Errorf("PageCount = %d, want OXR page count 3", result.PageCount)
	}
	if len(result.Transactions) != 1 {
		t.Fatalf("transactions = %d, want 1", len(result.Transactions))
	}
	tx := result.Transactions[0]
	if tx.AmountCents != 5520 || tx.Reference != "POS 1234" {
		t.Errorf("AmountCents/Reference = %d/%q, want 5520/POS 1234", tx.AmountCents, tx.Reference)
	}
	if result.StatementMetadata == nil || result.StatementMetadata.BankName != "Synthetic Bank" || result.StatementMetadata.Fingerprint == "" {
		t.Errorf("StatementMetadata = %#v, want extracted metadata and fingerprint", result.StatementMetadata)
	}
	if len(result.Warnings) != 2 || !strings.Contains(result.Warnings[0], "Processing note: SoMark OXR") || !strings.Contains(result.Warnings[1], "SoMark OXR:") {
		t.Errorf("Warnings = %v, want provenance and OXR warnings", result.Warnings)
	}
}

func TestExtractDocumentOXRFallsBackToDirectGemini(t *testing.T) {
	tests := []struct {
		name            string
		oxrStatusCode   int
		geminiFailCalls int32
	}{
		{name: "OXR processing error", oxrStatusCode: 1137, geminiFailCalls: 0},
		{name: "Gemini text structuring error", oxrStatusCode: 0, geminiFailCalls: 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			oxrServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if tc.oxrStatusCode == 0 {
					json.NewEncoder(w).Encode(oxrSuccessResponse("| synthetic | statement |"))
					return
				}
				json.NewEncoder(w).Encode(map[string]interface{}{
					"code": tc.oxrStatusCode, "message": "sensitive upstream detail", "data": nil,
				})
			}))
			defer oxrServer.Close()
			geminiServer, geminiCalls, captured := newCapturedGeminiServer(t, oxrTestExtractionResponse(), tc.geminiFailCalls)
			defer geminiServer.Close()

			svc := newOXRTestService(oxrServer.URL, geminiServer.URL)
			result, err := svc.ExtractDocumentWithMethod(
				context.Background(), []byte("synthetic statement bytes"), "statement.pdf",
				pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT, false,
				pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI,
			)
			if err != nil {
				t.Fatalf("direct Gemini fallback failed: %v", err)
			}
			if result.ModelUsed != "gemini-2.0-flash" {
				t.Errorf("ModelUsed = %q, want direct Gemini", result.ModelUsed)
			}
			if len(result.Warnings) == 0 || !strings.Contains(result.Warnings[len(result.Warnings)-1], "used direct Gemini extraction") {
				t.Errorf("Warnings = %v, want direct Gemini fallback warning", result.Warnings)
			}
			wantCalls := tc.geminiFailCalls + 1
			if geminiCalls.Load() != wantCalls {
				t.Errorf("Gemini calls = %d, want %d", geminiCalls.Load(), wantCalls)
			}
			for i := int32(0); i < wantCalls; i++ {
				request := <-captured
				if i == wantCalls-1 && !request.HasDocumentData {
					t.Error("final fallback did not use the original document")
				}
			}
		})
	}
}

func TestExtractDocumentDoesNotUseOXRForReceipts(t *testing.T) {
	var oxrCalls atomic.Int32
	oxrServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		oxrCalls.Add(1)
		json.NewEncoder(w).Encode(oxrSuccessResponse("receipt"))
	}))
	defer oxrServer.Close()
	geminiServer, _, captured := newCapturedGeminiServer(t, GeminiResponse{
		Transactions: []GeminiTransaction{{Description: "Coffee", Amount: 5.5, Category: "Food"}},
	}, 0)
	defer geminiServer.Close()

	svc := newOXRTestService(oxrServer.URL, geminiServer.URL)
	result, err := svc.ExtractDocumentWithMethod(
		context.Background(), []byte("synthetic receipt"), "receipt.jpg",
		pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT, false,
		pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI,
	)
	if err != nil {
		t.Fatalf("receipt extraction failed: %v", err)
	}
	if oxrCalls.Load() != 0 {
		t.Errorf("OXR calls = %d, want 0 for receipts", oxrCalls.Load())
	}
	if result.ModelUsed != "gemini-2.0-flash" || !(<-captured).HasDocumentData {
		t.Error("receipt did not retain direct Gemini extraction")
	}
}

func TestParseBankStatementWithOXR(t *testing.T) {
	oxrServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(oxrSuccessResponse("| synthetic | statement |"))
	}))
	defer oxrServer.Close()
	geminiServer, _, _ := newCapturedGeminiServer(t, oxrTestExtractionResponse(), 0)
	defer geminiServer.Close()

	svc := newOXRTestService(oxrServer.URL, geminiServer.URL)
	result, err := svc.ParseBankStatement(
		context.Background(), []byte("synthetic statement"), "", pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI,
	)
	if err != nil {
		t.Fatalf("ParseBankStatement failed: %v", err)
	}
	if result.PageCount != 3 || result.MethodUsed != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI {
		t.Errorf("PageCount/MethodUsed = %d/%v", result.PageCount, result.MethodUsed)
	}
	if result.FallbackFrom != pfinancev1.ExtractionMethod_EXTRACTION_METHOD_UNSPECIFIED {
		t.Errorf("FallbackFrom = %v for an explicitly requested Gemini parse", result.FallbackFrom)
	}
	if len(result.Transactions) != 1 || result.Transactions[0].AmountCents != 5520 {
		t.Errorf("Transactions = %#v, want one transaction with 5520 cents", result.Transactions)
	}
	if result.StatementMetadata == nil || result.StatementMetadata.BankName != "Synthetic Bank" {
		t.Errorf("StatementMetadata = %#v", result.StatementMetadata)
	}
	if len(result.Warnings) == 0 || !strings.Contains(result.Warnings[0], "SoMark OXR") {
		t.Errorf("Warnings = %v, want OXR provenance", result.Warnings)
	}
}

func TestOXRDisabledWhenServiceURLUnset(t *testing.T) {
	svc := NewExtractionService(Config{GeminiAPIKey: "key", EnableValidation: true})
	if svc.oxrClient != nil {
		t.Fatal("OXR client configured without OXRServiceURL")
	}
}

func TestExtractStatementWithOXRPassesOutputTokenBudget(t *testing.T) {
	oxrServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(oxrSuccessResponse("| synthetic | statement |"))
	}))
	defer oxrServer.Close()
	geminiServer, _, captured := newCapturedGeminiServer(t, oxrTestExtractionResponse(), 0)
	defer geminiServer.Close()

	svc := newOXRTestService(oxrServer.URL, geminiServer.URL)
	if _, err := svc.extractStatementWithOXR(
		context.Background(), []byte("synthetic statement"), "statement.pdf", GeminiExtractionOpts{MaxOutputTokens: 12288},
	); err != nil {
		t.Fatalf("extractStatementWithOXR failed: %v", err)
	}
	if got := (<-captured).MaxOutputTokens; got != 12288 {
		t.Errorf("maxOutputTokens = %d, want 12288", got)
	}
}
