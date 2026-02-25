package extraction

import (
	"testing"
)

func TestCountTransactionLines(t *testing.T) {
	tests := []struct {
		name     string
		lines    []string
		expected int
	}{
		{
			name: "typical bank statement lines",
			lines: []string{
				"01/12/2024 WOOLWORTHS 1234 SYDNEY 45.67",
				"02/12/2024 UBER *TRIP HELP.UBER.COM 23.50",
				"Statement Period: 01/12/2024 to 31/12/2024", // no amount pattern at end
				"03/12/2024 NETFLIX.COM 15.99",
				"Total: $85.16", // no date
			},
			expected: 3,
		},
		{
			name: "ISO date format",
			lines: []string{
				"2024-01-15 Coffee Shop 5.50",
				"2024-01-16 Gas Station 45.00",
			},
			expected: 2,
		},
		{
			name: "month name dates",
			lines: []string{
				"Jan 15 ALDI STORES 32.45",
				"15 Feb Coles Supermarket 67.89",
				"March 3 Target 12.00",
			},
			expected: 3,
		},
		{
			name: "no transactions",
			lines: []string{
				"Account Summary",
				"Opening Balance",
				"Closing Balance",
			},
			expected: 0,
		},
		{
			name:     "empty input",
			lines:    []string{},
			expected: 0,
		},
		{
			name: "dot-separated dates",
			lines: []string{
				"15.01.2024 Payment received 100.00",
				"16.01.2024 Coffee 4.50",
			},
			expected: 2,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := countTransactionLines(tc.lines)
			if result != tc.expected {
				t.Fatalf("countTransactionLines() = %d, want %d", result, tc.expected)
			}
		})
	}
}

func TestEstimateOutputTokens(t *testing.T) {
	tests := []struct {
		name     string
		txCount  int
		expected int
	}{
		{"zero transactions", 0, defaultMaxTokens},
		{"negative count", -1, defaultMaxTokens},
		{"5 transactions (receipt)", 5, 2048},
		{"20 transactions (short statement)", 20, 4096},
		{"50 transactions (monthly)", 50, 8192},
		{"100 transactions (large)", 100, 15360},
		{"200 transactions (quarterly)", 200, 30720},
		{"500 transactions (capped)", 500, maxMaxTokens},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := estimateOutputTokens(tc.txCount)
			if result != tc.expected {
				t.Fatalf("estimateOutputTokens(%d) = %d, want %d", tc.txCount, result, tc.expected)
			}
			// Should always be within bounds
			if result < minMaxTokens || result > maxMaxTokens {
				t.Fatalf("result %d outside bounds [%d, %d]", result, minMaxTokens, maxMaxTokens)
			}
			// Should be multiple of 1024
			if result%tokenRoundTo != 0 {
				t.Fatalf("result %d is not a multiple of %d", result, tokenRoundTo)
			}
		})
	}
}

func TestIsLikelyScanned(t *testing.T) {
	tests := []struct {
		name     string
		text     string
		pages    int
		expected bool
	}{
		{"empty text", "", 1, true},
		{"very short text", "hello", 1, true},
		{"decent text single page", makeText(200), 1, false},
		{"decent text multi page low density", makeText(100), 3, true},
		{"good density multi page", makeText(300), 3, false},
		{"zero pages defaults to 1", makeText(100), 0, false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := isLikelyScanned(tc.text, tc.pages)
			if result != tc.expected {
				t.Fatalf("isLikelyScanned(%d chars, %d pages) = %v, want %v",
					len(tc.text), tc.pages, result, tc.expected)
			}
		})
	}
}

// makeText creates a string of approximately n characters.
func makeText(n int) string {
	s := ""
	for len(s) < n {
		s += "Transaction line with some text and numbers 123.45\n"
	}
	return s[:n]
}

func TestAnalyzePDF_InvalidData(t *testing.T) {
	// AnalyzePDF should never panic and should return sensible defaults
	result := AnalyzePDF([]byte("not a pdf"))
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Error == nil {
		t.Fatal("expected error for invalid PDF data")
	}
	// Should have safe defaults
	if result.MaxOutputTokens != defaultMaxTokens {
		t.Fatalf("expected default maxOutputTokens %d, got %d", defaultMaxTokens, result.MaxOutputTokens)
	}
	if !result.IsScanned {
		t.Fatal("expected IsScanned=true as default for error case")
	}
}

func TestAnalyzePDF_EmptyData(t *testing.T) {
	result := AnalyzePDF([]byte{})
	if result == nil {
		t.Fatal("expected non-nil result")
	}
	if result.Error == nil {
		t.Fatal("expected error for empty data")
	}
}

func TestEstimateOutputTokens_AlwaysRoundsUp(t *testing.T) {
	// Edge case: exactly on boundary
	for txCount := 1; txCount <= 300; txCount++ {
		result := estimateOutputTokens(txCount)
		if result%tokenRoundTo != 0 {
			t.Fatalf("txCount=%d: result %d not a multiple of %d", txCount, result, tokenRoundTo)
		}
	}
}

func TestEstimateOutputTokens_MonotonicIncrease(t *testing.T) {
	prev := estimateOutputTokens(1)
	for txCount := 2; txCount <= 300; txCount++ {
		current := estimateOutputTokens(txCount)
		if current < prev {
			t.Fatalf("non-monotonic: estimateOutputTokens(%d)=%d < estimateOutputTokens(%d)=%d",
				txCount, current, txCount-1, prev)
		}
		prev = current
	}
}
