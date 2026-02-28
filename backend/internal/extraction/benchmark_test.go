// Package extraction — benchmark tests for the document extraction pipeline.
//
// These benchmarks measure the CPU-bound portions of extraction (normalizer,
// PDF analysis, post-processing) using synthetic data so they run without any
// network or ML service dependency.
//
// Usage:
//
//	# Run all benchmarks
//	go test ./internal/extraction/... -bench=. -benchtime=5s
//
//	# Run a single benchmark with memory profiling
//	go test ./internal/extraction/... -bench=BenchmarkNormalizeMerchant -benchmem
//
//	# Compare two commits (requires benchstat):
//	go test ./internal/extraction/... -bench=. -count=6 -benchtime=3s | tee before.txt
//	# (make your change)
//	go test ./internal/extraction/... -bench=. -count=6 -benchtime=3s | tee after.txt
//	benchstat before.txt after.txt
package extraction

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// ─── Synthetic test data ─────────────────────────────────────────────────────

// syntheticMLResponse builds a realistic ML service JSON response with n transactions.
func syntheticMLResponse(n int) []byte {
	txs := make([]map[string]any, n)
	merchants := []string{"WOOLWORTHS", "COLES", "ALDI", "NETFLIX", "UBER", "AMAZON", "SPOTIFY", "BUNNINGS"}
	categories := []string{"Food", "Food", "Food", "Entertainment", "Transportation", "Shopping", "Entertainment", "Shopping"}
	for i := range txs {
		m := merchants[i%len(merchants)]
		txs[i] = map[string]any{
			"date":                fmt.Sprintf("2025-%02d-%02d", (i%12)+1, (i%28)+1),
			"description":         fmt.Sprintf("%s purchase #%d", m, i+1),
			"normalized_merchant": m,
			"amount":              float64((i+1)*1099) / 100.0,
			"category":            categories[i%len(categories)],
			"confidence":          0.85,
			"is_debit":            true,
		}
	}
	resp := map[string]any{
		"transactions":       txs,
		"overall_confidence": 0.87,
		"model_used":         "Qwen2-VL-7B",
		"processing_time_ms": 3200,
		"document_type":      "bank_statement",
	}
	b, _ := json.Marshal(resp)
	return b
}

// syntheticExtractionResult builds a proto ExtractionResult with n transactions.
func syntheticExtractionResult(n int) *pfinancev1.ExtractionResult {
	txs := make([]*pfinancev1.ExtractedTransaction, n)
	rawMerchants := []string{"WOOLWORTHS 1234", "COLES SUPERMARKET", "VISA*NETFLIX.COM", "UBER* RIDE", "AMAZON AU PTY LTD"}
	for i := range txs {
		txs[i] = &pfinancev1.ExtractedTransaction{
			Id:                 fmt.Sprintf("tx-%d", i),
			Description:        fmt.Sprintf("%s purchase", rawMerchants[i%len(rawMerchants)]),
			NormalizedMerchant: rawMerchants[i%len(rawMerchants)],
			AmountCents:        int64((i + 1) * 999),
		}
	}
	return &pfinancev1.ExtractionResult{
		Transactions:      txs,
		OverallConfidence: 0.87,
	}
}

// ─── MLClient benchmarks ─────────────────────────────────────────────────────

// BenchmarkMLClient_Extract measures the full HTTP round-trip and JSON parsing
// overhead through the MLClient against a local mock server.
func BenchmarkMLClient_Extract(b *testing.B) {
	for _, n := range []int{5, 20, 50} {
		payload := syntheticMLResponse(n)
		b.Run(fmt.Sprintf("n=%d", n), func(b *testing.B) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Write(payload)
			}))
			defer srv.Close()

			client := NewMLClient(srv.URL)
			dummyFile := []byte(strings.Repeat("PDF content line\n", 200))
			b.ResetTimer()
			b.ReportAllocs()

			for i := 0; i < b.N; i++ {
				_, err := client.Extract(context.Background(), dummyFile, "statement.pdf", pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
				if err != nil {
					b.Fatalf("Extract failed: %v", err)
				}
			}
		})
	}
}

// ─── Normalizer benchmarks ───────────────────────────────────────────────────

// BenchmarkNormalizeMerchant measures merchant name normalization throughput.
// This runs on every extracted transaction, so it's called N × txCount times
// per document. Optimising it compounds across large bank statements.
func BenchmarkNormalizeMerchant(b *testing.B) {
	inputs := []string{
		"WOOLWORTHS SUPERMARKET 1234",
		"VISA*NETFLIX.COM",
		"UBER* TRIP 9f3a",
		"AMAZON AU PTY LTD",
		"EFTPOS BUNNINGS WAREHOUSE",
		"POS COLES 0042",
		"UNFAMILIAR MERCHANT XYZ",
		"MACDONALDS RESTAURANT AU",
	}
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		NormalizeMerchant(inputs[i%len(inputs)])
	}
}

// BenchmarkNormalizeMerchantBatch simulates normalizing all merchants in a
// 50-transaction bank statement in a single pass.
func BenchmarkNormalizeMerchantBatch(b *testing.B) {
	merchants := make([]string, 50)
	raw := []string{"WOOLWORTHS 123", "COLES EXPRESS", "UBER EATS", "NETFLIX", "ALDI STORE"}
	for i := range merchants {
		merchants[i] = raw[i%len(raw)]
	}
	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		for _, m := range merchants {
			NormalizeMerchant(m)
		}
	}
}

// ─── PDF analysis benchmarks ─────────────────────────────────────────────────

// BenchmarkAnalyzePDF measures the cost of PDF analysis (page-count detection,
// scanned vs native detection, token size estimation). This runs before every
// Gemini extraction to determine how many output tokens to request.
func BenchmarkAnalyzePDF(b *testing.B) {
	// Minimal syntactically valid PDF with text content
	minimalPDF := []byte(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 200>>stream
BT /F1 12 Tf 72 720 Td
(Date        Description                  Amount) Tj T*
(2025-07-01  WOOLWORTHS SUPERMARKET        $45.20) Tj T*
(2025-07-03  NETFLIX SUBSCRIPTION          $22.99) Tj T*
(2025-07-05  UBER EATS DELIVERY            $34.50) Tj
ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000266 00000 n
0000000517 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
581
%%EOF`)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		AnalyzePDF(minimalPDF)
	}
}

// ─── Post-processing benchmarks ──────────────────────────────────────────────

// BenchmarkPostProcessResult measures the normalizer + confidence merging pass
// that runs after every extraction. This is the primary CPU cost after the
// ML call returns.
func BenchmarkPostProcessResult(b *testing.B) {
	svc := &ExtractionService{
		merchantLookup: nil, // no user-specific lookups
	}
	for _, n := range []int{5, 20, 50} {
		result := syntheticExtractionResult(n)
		b.Run(fmt.Sprintf("n=%d", n), func(b *testing.B) {
			b.ResetTimer()
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				// Clone to avoid mutation across iterations
				cloned := &pfinancev1.ExtractionResult{
					Transactions:      make([]*pfinancev1.ExtractedTransaction, len(result.Transactions)),
					OverallConfidence: result.OverallConfidence,
					MethodUsed:        result.MethodUsed,
				}
				copy(cloned.Transactions, result.Transactions)
				svc.postProcessResult(cloned)
			}
		})
	}
}

// ─── End-to-end pipeline benchmark (mock server) ─────────────────────────────

// BenchmarkExtractPipeline_EndToEnd measures the entire extraction pipeline
// from bytes-in to ExtractionResult-out using a local mock ML server.
// This is the best proxy for real-world latency minus network RTT to Modal.
func BenchmarkExtractPipeline_EndToEnd(b *testing.B) {
	for _, n := range []int{5, 20} {
		payload := syntheticMLResponse(n)
		b.Run(fmt.Sprintf("n=%d_txns", n), func(b *testing.B) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Write(payload)
			}))
			defer srv.Close()

			svc := NewExtractionService(Config{
				MLServiceURL: srv.URL,
				EnableML:     true,
			})
			docBytes := []byte(strings.Repeat("line of PDF text with amounts $12.34\n", 100))

			b.ResetTimer()
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				_, err := svc.ExtractDocumentWithMethod(
					context.Background(),
					docBytes,
					"statement.pdf",
					pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT,
					false,
					pfinancev1.ExtractionMethod_EXTRACTION_METHOD_SELF_HOSTED,
				)
				if err != nil {
					b.Fatalf("extraction failed: %v", err)
				}
			}
		})
	}
}
