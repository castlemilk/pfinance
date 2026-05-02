package extraction

import (
	"testing"
)

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
		{1, 4096}, // floor
		{3, 4500},
		{5, 7500},
		{20, 16384}, // ceiling
	}
	for _, c := range cases {
		if got := perChunkOutputTokens(c.pages); got != c.want {
			t.Errorf("perChunkOutputTokens(%d): want %d, got %d", c.pages, c.want, got)
		}
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
