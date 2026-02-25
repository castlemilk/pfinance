package extraction

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

const (
	textExtractorConfidence = 0.75
	minParseRate            = 0.50 // must parse at least 50% of estimated lines
)

// TextExtractor provides rule-based transaction extraction from pre-extracted PDF text.
type TextExtractor struct{}

// transactionLinePattern matches a line with: date ... description ... amount
// Groups: (1) date, (2) description, (3) sign/amount
var transactionLineRe = regexp.MustCompile(
	`(?i)` +
		// Date group - various formats
		`(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}|\d{4}[/\-]\d{2}[/\-]\d{2}|` +
		`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(?:[,\s]+\d{2,4})?|` +
		`\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?(?:[,\s]+\d{2,4})?)` +
		// Separator + description (non-greedy)
		`\s+(.+?)\s+` +
		// Amount (possibly negative or with $ or CR/DR suffix)
		`(-?\$?\d{1,3}(?:,\d{3})*\.\d{2})\s*(?:CR|DR)?$`,
)

// dateFormats to try when parsing extracted dates.
var dateFormats = []string{
	"02/01/2006", // DD/MM/YYYY
	"2/1/2006",   // D/M/YYYY
	"02-01-2006", // DD-MM-YYYY
	"02.01.2006", // DD.MM.YYYY
	"2006-01-02", // YYYY-MM-DD
	"2006/01/02", // YYYY/MM/DD
	"Jan 02 2006",
	"Jan 2 2006",
	"02 Jan 2006",
	"2 Jan 2006",
	"Jan 02, 2006",
	"Jan 2, 2006",
	"02/01/06", // DD/MM/YY
	"2/1/06",   // D/M/YY
}

// ExtractFromText attempts rule-based transaction extraction from pre-analyzed PDF text.
// Returns nil if extraction doesn't meet quality thresholds (caller should fall back to Gemini).
func (te *TextExtractor) ExtractFromText(
	analysis *PDFAnalysis,
	docType pfinancev1.DocumentType,
) (*pfinancev1.ExtractionResult, error) {
	if analysis == nil || analysis.IsScanned {
		return nil, fmt.Errorf("cannot extract from scanned PDF")
	}

	// Check text density
	if analysis.PageCount > 0 && len(analysis.ExtractedText)/analysis.PageCount < textDenseMin {
		return nil, fmt.Errorf("text density too low for rule-based extraction")
	}

	var transactions []*pfinancev1.ExtractedTransaction
	txID := 0

	for _, line := range analysis.TextLines {
		matches := transactionLineRe.FindStringSubmatch(line)
		if matches == nil {
			continue
		}

		dateStr := strings.TrimSpace(matches[1])
		description := strings.TrimSpace(matches[2])
		amountStr := strings.TrimSpace(matches[3])

		// Parse date
		parsedDate := parseFlexibleDate(dateStr)

		// Parse amount
		amount, isDebit := parseAmount(amountStr)
		if amount <= 0 {
			continue
		}

		// Normalize merchant
		info := NormalizeMerchant(description)

		txID++
		tx := &pfinancev1.ExtractedTransaction{
			Id:                 fmt.Sprintf("text-%d", txID),
			Date:               formatDate(parsedDate),
			Description:        description,
			NormalizedMerchant: info.Name,
			Amount:             amount,
			SuggestedCategory:  info.Category,
			Confidence:         textExtractorConfidence,
			IsDebit:            isDebit,
			FieldConfidences: &pfinancev1.FieldConfidence{
				Amount:      0.85,
				Date:        0.80,
				Description: 0.70,
				Merchant:    info.Confidence,
				Category:    0.60,
			},
		}

		transactions = append(transactions, tx)
	}

	// Quality check: did we parse enough?
	if analysis.EstimatedTxCount > 0 {
		parseRate := float64(len(transactions)) / float64(analysis.EstimatedTxCount)
		if parseRate < minParseRate {
			return nil, fmt.Errorf("parse rate %.2f below threshold %.2f (%d/%d)",
				parseRate, minParseRate, len(transactions), analysis.EstimatedTxCount)
		}
	}

	if len(transactions) == 0 {
		return nil, fmt.Errorf("no transactions parsed from text")
	}

	return &pfinancev1.ExtractionResult{
		Transactions:      transactions,
		OverallConfidence: textExtractorConfidence,
		ModelUsed:         "text-extraction",
		DocumentType:      docType,
		PageCount:         int32(analysis.PageCount),
		MethodUsed:        pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI, // report as Gemini since it's an internal optimization
		Warnings:          []string{"Extracted using rule-based text parser (no AI model used)"},
	}, nil
}

// parseFlexibleDate tries multiple date formats and returns the parsed time.
func parseFlexibleDate(s string) time.Time {
	s = strings.TrimSpace(s)
	for _, format := range dateFormats {
		if t, err := time.Parse(format, s); err == nil {
			// Handle 2-digit years
			if t.Year() < 100 {
				t = t.AddDate(2000, 0, 0)
			}
			return t
		}
	}
	return time.Time{}
}

// formatDate formats a time as YYYY-MM-DD, or returns empty string for zero time.
func formatDate(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return t.Format("2006-01-02")
}

// parseAmount extracts a numeric amount from a string like "$1,234.56" or "-45.00".
// Returns the absolute amount and whether it's a debit (positive or no sign).
func parseAmount(s string) (float64, bool) {
	s = strings.TrimSpace(s)

	isDebit := true
	if strings.HasSuffix(strings.ToUpper(s), "CR") {
		isDebit = false
		s = strings.TrimSuffix(strings.TrimSuffix(s, "CR"), "cr")
		s = strings.TrimSpace(s)
	}

	// Remove $ and commas
	s = strings.ReplaceAll(s, "$", "")
	s = strings.ReplaceAll(s, ",", "")
	s = strings.TrimSpace(s)

	if strings.HasPrefix(s, "-") {
		s = s[1:]
		// Negative in bank statements is often a credit/refund
		isDebit = false
	}

	amount, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, false
	}

	return amount, isDebit
}
