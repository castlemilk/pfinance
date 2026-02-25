package extraction

import (
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestParseAmount(t *testing.T) {
	tests := []struct {
		input    string
		amount   float64
		isDebit  bool
		hasValue bool
	}{
		{"45.67", 45.67, true, true},
		{"$45.67", 45.67, true, true},
		{"-45.67", 45.67, false, true},
		{"$1,234.56", 1234.56, true, true},
		{"100.00CR", 100.00, false, true},
		{"100.00", 100.00, true, true},
		{"0.50", 0.50, true, true},
		{"notanumber", 0, false, false},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			amount, isDebit := parseAmount(tc.input)
			if tc.hasValue {
				if amount != tc.amount {
					t.Fatalf("parseAmount(%q) amount = %f, want %f", tc.input, amount, tc.amount)
				}
				if isDebit != tc.isDebit {
					t.Fatalf("parseAmount(%q) isDebit = %v, want %v", tc.input, isDebit, tc.isDebit)
				}
			} else {
				if amount > 0 {
					t.Fatalf("parseAmount(%q) expected 0 amount for invalid input, got %f", tc.input, amount)
				}
			}
		})
	}
}

func TestParseFlexibleDate(t *testing.T) {
	tests := []struct {
		input    string
		expected string // YYYY-MM-DD or empty
	}{
		{"15/01/2024", "2024-01-15"},
		{"01/15/2024", ""}, // invalid DD/MM/YYYY (month 15 doesn't exist)
		{"2024-01-15", "2024-01-15"},
		{"15.01.2024", "2024-01-15"},
		{"Jan 15 2006", "2006-01-15"},
		{"15 Jan 2006", "2006-01-15"},
		{"", ""},
		{"not a date", ""},
	}

	for _, tc := range tests {
		t.Run(tc.input, func(t *testing.T) {
			result := parseFlexibleDate(tc.input)
			formatted := formatDate(result)
			if formatted != tc.expected {
				t.Fatalf("parseFlexibleDate(%q) = %q, want %q", tc.input, formatted, tc.expected)
			}
		})
	}
}

func TestFormatDate(t *testing.T) {
	t.Run("zero time returns empty", func(t *testing.T) {
		result := formatDate(parseFlexibleDate(""))
		if result != "" {
			t.Fatalf("expected empty string, got %q", result)
		}
	})
}

func TestTextExtractor_ExtractFromText(t *testing.T) {
	te := &TextExtractor{}

	t.Run("successful extraction from bank statement text", func(t *testing.T) {
		text := makeBankStatementText()
		analysis := &PDFAnalysis{
			PageCount:        1, // single page so density is high enough
			ExtractedText:    text,
			TextLines:        splitNonEmpty(text),
			EstimatedTxCount: 5,
			IsScanned:        false,
			MaxOutputTokens:  4096,
		}

		result, err := te.ExtractFromText(analysis, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if result == nil {
			t.Fatal("expected non-nil result")
		}
		if len(result.Transactions) == 0 {
			t.Fatal("expected at least 1 transaction")
		}
		if result.OverallConfidence != textExtractorConfidence {
			t.Fatalf("expected confidence %f, got %f", textExtractorConfidence, result.OverallConfidence)
		}
		if result.ModelUsed != "text-extraction" {
			t.Fatalf("expected model 'text-extraction', got %q", result.ModelUsed)
		}
	})

	t.Run("nil analysis returns error", func(t *testing.T) {
		result, err := te.ExtractFromText(nil, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
		if err == nil {
			t.Fatal("expected error for nil analysis")
		}
		if result != nil {
			t.Fatal("expected nil result")
		}
	})

	t.Run("scanned PDF returns error", func(t *testing.T) {
		analysis := &PDFAnalysis{
			IsScanned: true,
		}
		result, err := te.ExtractFromText(analysis, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
		if err == nil {
			t.Fatal("expected error for scanned PDF")
		}
		if result != nil {
			t.Fatal("expected nil result")
		}
	})

	t.Run("low text density returns error", func(t *testing.T) {
		analysis := &PDFAnalysis{
			PageCount:     5,
			ExtractedText: "short text",
			TextLines:     []string{"short text"},
			IsScanned:     false,
		}
		result, err := te.ExtractFromText(analysis, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
		if err == nil {
			t.Fatal("expected error for low text density")
		}
		if result != nil {
			t.Fatal("expected nil result")
		}
	})

	t.Run("low parse rate falls back", func(t *testing.T) {
		analysis := &PDFAnalysis{
			PageCount:        1,
			ExtractedText:    makeLowParseRateText(),
			TextLines:        splitNonEmpty(makeLowParseRateText()),
			EstimatedTxCount: 20, // claims 20 but only a few will parse
			IsScanned:        false,
		}
		result, err := te.ExtractFromText(analysis, pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT)
		if err == nil && result != nil {
			// If it did parse, check that there are fewer than expected
			parseRate := float64(len(result.Transactions)) / float64(analysis.EstimatedTxCount)
			if parseRate < minParseRate {
				t.Fatal("should have returned error for low parse rate")
			}
		}
	})
}

func TestTextExtractor_TransactionLineRegex(t *testing.T) {
	// Lines that should match
	matches := []string{
		"01/12/2024 WOOLWORTHS 1234 SYDNEY 45.67",
		"2024-01-15 Coffee Shop 5.50",
		"15/01/2024 UBER *TRIP HELP.UBER.COM 23.50",
		"Jan 15 ALDI STORES 32.45",
		"02/12/2024 NETFLIX.COM 15.99",
	}

	for _, line := range matches {
		if !transactionLineRe.MatchString(line) {
			t.Errorf("expected line to match: %q", line)
		}
	}

	// Lines that should NOT match
	noMatches := []string{
		"Account Summary",
		"Opening Balance: $1,234.56",                 // no date
		"Statement Period: 01/12/2024 to 31/12/2024", // no amount at end
	}

	for _, line := range noMatches {
		if transactionLineRe.MatchString(line) {
			t.Errorf("expected line NOT to match: %q", line)
		}
	}
}

// Helper functions

func splitNonEmpty(text string) []string {
	var lines []string
	for _, line := range splitLines(text) {
		if line != "" {
			lines = append(lines, line)
		}
	}
	return lines
}

func splitLines(text string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(text); i++ {
		if text[i] == '\n' {
			lines = append(lines, text[start:i])
			start = i + 1
		}
	}
	if start < len(text) {
		lines = append(lines, text[start:])
	}
	return lines
}

func makeBankStatementText() string {
	return `ANZ Bank Statement
Account: XX-1234
Period: 01/12/2024 to 31/12/2024

Date Description Amount
01/12/2024 WOOLWORTHS 1234 SYDNEY 45.67
03/12/2024 UBER *TRIP HELP.UBER.COM 23.50
05/12/2024 NETFLIX.COM 15.99
10/12/2024 COLES SUPERMARKET 67.89
15/12/2024 AMAZON AU MARKETPLACE 129.00

Opening Balance: $2,345.67
Closing Balance: $2,063.62
`
}

func makeLowParseRateText() string {
	// Has lots of lines that look like transactions to the heuristic
	// (have dates and amounts) but won't match the stricter regex
	return `Bank Statement Summary
01/01/2024 opening balance 1000.00
various fees and charges applied
01/01/2024 random noise with 50.00 embedded
02/01/2024 more noise 25.00 in the middle of text
some header 03/01/2024 15.00
04/01/2024 actual tx 10.00
random text with 05/01/2024 and 20.00
06/01/2024 mixed content 30.00 extra stuff
07/01/2024 something else 40.00 more
08/01/2024 another thing 50.00 again
09/01/2024 yet another 60.00 item
10/01/2024 item ten 70.00 here
11/01/2024 item eleven 80.00 now
12/01/2024 item twelve 90.00 too
13/01/2024 item thirteen 100.00 end
14/01/2024 item fourteen 110.00 of
15/01/2024 item fifteen 120.00 list
16/01/2024 item sixteen 130.00 done
17/01/2024 item seventeen 140.00 fin
18/01/2024 item eighteen 150.00 last
`
}
