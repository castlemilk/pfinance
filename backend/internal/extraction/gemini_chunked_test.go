package extraction

import (
	"errors"
	"testing"
)

func TestMergeChunkedResponses_MergesMetadataAcrossChunks(t *testing.T) {
	// Each chunk reports its own slice of metadata. The merge should pick the
	// first non-empty value for bank/account/currency, and span the full
	// period_start..period_end across all chunks.
	chunkA := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Date: "2026-02-05", Description: "X", Amount: 1.00},
		},
		Metadata: &GeminiMetadata{
			BankName:    "ANZ",
			PeriodStart: "2026-02-01",
			PeriodEnd:   "2026-02-10",
			Currency:    "AUD",
		},
	}
	chunkB := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Date: "2026-02-25", Description: "Y", Amount: 2.00},
		},
		Metadata: &GeminiMetadata{
			BankName:          "", // empty — should not overwrite chunkA's value
			AccountIdentifier: "1234",
			PeriodStart:       "2026-02-15",
			PeriodEnd:         "2026-02-28", // later than chunkA
			Currency:          "AUD",
		},
	}
	merged := mergeChunkedResponses([]*GeminiResponse{chunkA, chunkB})
	if merged.Metadata == nil {
		t.Fatal("expected merged metadata")
	}
	if merged.Metadata.BankName != "ANZ" {
		t.Errorf("bank_name: want ANZ, got %q", merged.Metadata.BankName)
	}
	if merged.Metadata.AccountIdentifier != "1234" {
		t.Errorf("account_identifier: want 1234, got %q", merged.Metadata.AccountIdentifier)
	}
	if merged.Metadata.PeriodStart != "2026-02-01" {
		t.Errorf("period_start: want 2026-02-01 (min), got %q", merged.Metadata.PeriodStart)
	}
	if merged.Metadata.PeriodEnd != "2026-02-28" {
		t.Errorf("period_end: want 2026-02-28 (max), got %q", merged.Metadata.PeriodEnd)
	}
	if merged.Metadata.TransactionCount != 2 {
		t.Errorf("transaction_count: want 2, got %d", merged.Metadata.TransactionCount)
	}
}

func TestMergeChunkedResponses_DedupesBoundaryRows(t *testing.T) {
	chunkA := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Date: "2026-01-01", Description: "Coffee Shop A", Amount: 4.50},
			{Date: "2026-01-02", Description: "Carryover Row", Amount: 99.00},
		},
		Metadata: &GeminiMetadata{BankName: "TestBank", TransactionCount: 2},
	}
	// Chunk B's first row repeats chunk A's last row (common Gemini behaviour
	// when the same row spans a page break).
	chunkB := &GeminiResponse{
		Transactions: []GeminiTransaction{
			{Date: "2026-01-02", Description: "carryover row ", Amount: 99.001}, // case + trailing space + cents-rounded
			{Date: "2026-01-03", Description: "Grocery Store", Amount: 25.10},
		},
		Metadata: &GeminiMetadata{BankName: "TestBank", TransactionCount: 2},
	}

	merged := mergeChunkedResponses([]*GeminiResponse{chunkA, chunkB})

	if got, want := len(merged.Transactions), 3; got != want {
		t.Fatalf("expected %d unique transactions after dedup, got %d", want, got)
	}
	if merged.Metadata == nil {
		t.Fatalf("expected metadata to be carried through")
	}
	if got := merged.Metadata.TransactionCount; got != 3 {
		t.Errorf("expected merged metadata transaction_count=3, got %d", got)
	}
}

func TestMergeChunkedResponses_PreservesOrder(t *testing.T) {
	a := &GeminiResponse{Transactions: []GeminiTransaction{
		{Date: "2026-01-01", Description: "First", Amount: 1.00},
		{Date: "2026-01-02", Description: "Second", Amount: 2.00},
	}}
	b := &GeminiResponse{Transactions: []GeminiTransaction{
		{Date: "2026-01-03", Description: "Third", Amount: 3.00},
	}}
	merged := mergeChunkedResponses([]*GeminiResponse{a, b})
	wants := []string{"First", "Second", "Third"}
	for i, want := range wants {
		if got := merged.Transactions[i].Description; got != want {
			t.Errorf("position %d: want %q, got %q", i, want, got)
		}
	}
}

func TestMergeChunkedResponses_HandlesNilChunks(t *testing.T) {
	a := &GeminiResponse{Transactions: []GeminiTransaction{{Date: "2026-01-01", Description: "X", Amount: 1}}}
	merged := mergeChunkedResponses([]*GeminiResponse{nil, a, nil})
	if len(merged.Transactions) != 1 {
		t.Errorf("expected 1 transaction, got %d", len(merged.Transactions))
	}
}

func TestPerChunkOutputTokens_RespectsBounds(t *testing.T) {
	cases := []struct{ pages, want int }{
		{1, 6144},   // floor (1*2500=2500 → bumped to floor)
		{3, 7500},   // 3*2500
		{5, 12500},  // 5*2500 — accommodates ~150 trans/chunk (well above ~95 observed)
		{14, 32768}, // ceiling (14*2500=35000 → capped)
	}
	for _, c := range cases {
		if got := perChunkOutputTokens(c.pages); got != c.want {
			t.Errorf("perChunkOutputTokens(%d): want %d, got %d", c.pages, c.want, got)
		}
	}
}

func TestExtractJSON_TruncatedJSONReturnsTypedError(t *testing.T) {
	// Response that opens a JSON object but never closes — what Gemini
	// returns when max_output_tokens is exhausted mid-stream.
	truncated := `{
  "metadata": {"bank_name": "ANZ", "currency": "AUD"},
  "transactions": [
    {"date": "2026-01-01", "description": "Coffee Shop", "amount": 4.50},
    {"date": "2026-01-02", "description": "Uber", "amount`

	var dest map[string]interface{}
	err := extractJSON(truncated, &dest)
	if err == nil {
		t.Fatal("expected error from truncated JSON, got nil")
	}
	if !errors.Is(err, ErrTruncatedJSON) {
		t.Errorf("expected ErrTruncatedJSON, got %v", err)
	}
}

func TestExtractJSON_NoOpenBraceReturnsGenericError(t *testing.T) {
	// Response that is plain prose, no JSON object at all (e.g. a refusal).
	prose := "I'm sorry, I can't help with that."
	var dest map[string]interface{}
	err := extractJSON(prose, &dest)
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if errors.Is(err, ErrTruncatedJSON) {
		t.Errorf("plain prose should NOT be classified as truncation; got %v", err)
	}
}

func TestEnvInt_FallsBackOnInvalid(t *testing.T) {
	t.Setenv("PFINANCE_TEST_ENVINT", "")
	if got := envInt("PFINANCE_TEST_ENVINT", 7); got != 7 {
		t.Errorf("empty env: want 7, got %d", got)
	}
	t.Setenv("PFINANCE_TEST_ENVINT", "abc")
	if got := envInt("PFINANCE_TEST_ENVINT", 7); got != 7 {
		t.Errorf("non-int env: want 7, got %d", got)
	}
	t.Setenv("PFINANCE_TEST_ENVINT", "0")
	if got := envInt("PFINANCE_TEST_ENVINT", 7); got != 7 {
		t.Errorf("zero env: want 7, got %d", got)
	}
	t.Setenv("PFINANCE_TEST_ENVINT", "12")
	if got := envInt("PFINANCE_TEST_ENVINT", 7); got != 12 {
		t.Errorf("valid env: want 12, got %d", got)
	}
}
