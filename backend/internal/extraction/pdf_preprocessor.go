package extraction

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"regexp"
	"strings"

	"github.com/ledongthuc/pdf"
)

const (
	maxTextBytes     = 100 * 1024 // 100KB cap for extracted text
	defaultMaxTokens = 8192
	minMaxTokens     = 2048
	maxMaxTokens     = 32768
	tokenRoundTo     = 1024
	scannedThreshold = 50  // chars per page below which PDF is considered scanned
	textDenseMin     = 200 // chars per page for "dense text" classification
)

// PDFAnalysis contains the results of pre-processing a PDF document.
type PDFAnalysis struct {
	PageCount        int
	ExtractedText    string
	TextLines        []string
	EstimatedTxCount int
	IsScanned        bool
	MaxOutputTokens  int
	Error            error
}

// dateAmountPattern matches lines that contain a date-like pattern and a monetary amount.
// Covers: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, YYYY/MM/DD, "Jan 15", "15 Jan"
var datePattern = regexp.MustCompile(
	`(?i)` +
		`(?:\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})` + // DD/MM/YYYY variants
		`|(?:\d{4}[/\-]\d{2}[/\-]\d{2})` + // YYYY-MM-DD
		`|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})` + // Mon DD
		`|(?:\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?)`, // DD Mon
)

var amountPattern = regexp.MustCompile(
	`[\$\-]?\d{1,3}(?:[,]\d{3})*(?:\.\d{1,2})` + // $1,234.56 or -1234.56
		`|\d+\.\d{2}`, // plain 123.45
)

// AnalyzePDF extracts text and metadata from a PDF for pre-processing.
// It is wrapped in recover() and never panics or blocks extraction.
// On any error, it returns sensible defaults.
func AnalyzePDF(data []byte) (result *PDFAnalysis) {
	result = &PDFAnalysis{
		PageCount:       1,
		IsScanned:       true, // default to scanned (conservative — will use Gemini)
		MaxOutputTokens: defaultMaxTokens,
	}

	defer func() {
		if r := recover(); r != nil {
			log.Printf("[pdf-preprocessor] recovered from panic: %v", r)
			result.Error = fmt.Errorf("panic during PDF analysis: %v", r)
			result.IsScanned = true
			result.MaxOutputTokens = defaultMaxTokens
		}
	}()

	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		result.Error = fmt.Errorf("open PDF reader: %w", err)
		return result
	}

	result.PageCount = reader.NumPage()
	if result.PageCount < 1 {
		result.PageCount = 1
	}

	// Extract plain text
	plainText, err := reader.GetPlainText()
	if err != nil {
		result.Error = fmt.Errorf("extract plain text: %w", err)
		return result
	}

	textBytes, err := io.ReadAll(io.LimitReader(plainText, int64(maxTextBytes)))
	if err != nil {
		result.Error = fmt.Errorf("read plain text: %w", err)
		return result
	}

	result.ExtractedText = string(textBytes)
	result.IsScanned = isLikelyScanned(result.ExtractedText, result.PageCount)

	// Split into non-empty lines
	for _, line := range strings.Split(result.ExtractedText, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			result.TextLines = append(result.TextLines, trimmed)
		}
	}

	result.EstimatedTxCount = countTransactionLines(result.TextLines)
	result.MaxOutputTokens = estimateOutputTokens(result.EstimatedTxCount)

	return result
}

// countTransactionLines counts lines that look like financial transactions
// (contain both a date-like pattern and a monetary amount).
func countTransactionLines(lines []string) int {
	count := 0
	for _, line := range lines {
		if datePattern.MatchString(line) && amountPattern.MatchString(line) {
			count++
		}
	}
	return count
}

// estimateOutputTokens calculates a recommended maxOutputTokens for Gemini
// based on the estimated transaction count.
// Formula: (150 + txCount * 100) * 1.5, clamped to [2048, 32768], rounded to nearest 1024.
func estimateOutputTokens(txCount int) int {
	if txCount <= 0 {
		return defaultMaxTokens
	}

	raw := float64(150+txCount*100) * 1.5
	tokens := int(raw)

	// Clamp
	if tokens < minMaxTokens {
		tokens = minMaxTokens
	}
	if tokens > maxMaxTokens {
		tokens = maxMaxTokens
	}

	// Round up to nearest 1024
	if tokens%tokenRoundTo != 0 {
		tokens = ((tokens / tokenRoundTo) + 1) * tokenRoundTo
	}

	return tokens
}

// isLikelyScanned returns true if the PDF appears to be a scanned image
// (very little extractable text per page).
func isLikelyScanned(text string, pages int) bool {
	if pages <= 0 {
		pages = 1
	}
	charsPerPage := len(text) / pages
	return charsPerPage < scannedThreshold
}

// CountPDFPagesAccurate uses the pdf library for accurate page counting,
// falling back to the heuristic string search on error.
func CountPDFPagesAccurate(data []byte) int {
	defer func() {
		recover() // swallow any panic from pdf library
	}()

	reader, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return countPDFPages(data) // fallback to heuristic
	}

	n := reader.NumPage()
	if n < 1 {
		return 1
	}
	return n
}
