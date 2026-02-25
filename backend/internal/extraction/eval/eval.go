// Package eval provides an evaluation framework for comparing extraction strategies
// (rule-based, Gemini, hybrid) against ground-truth test fixtures.
package eval

import (
	"context"
	"fmt"
	"io"
	"math"
	"strings"
	"text/tabwriter"
	"time"
	"unicode/utf8"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// GroundTruth represents expected extraction output for a test fixture.
type GroundTruth struct {
	Name         string        `json:"name"`
	DocumentType string        `json:"document_type"`
	Transactions []Transaction `json:"transactions"`
}

// Transaction is a single expected transaction.
type Transaction struct {
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	IsDebit     bool    `json:"is_debit"`
}

// EvalResult holds metrics from running one strategy on one fixture.
type EvalResult struct {
	Strategy         string
	Fixture          string
	TransactionCount CountMetrics
	AmountAccuracy   float64
	DateAccuracy     float64
	CategoryAccuracy float64
	DescriptionSim   float64
	OverallScore     float64
	Duration         time.Duration
	GeminiCalls      int
	Error            string // non-empty if the strategy failed
}

// CountMetrics measures transaction detection performance.
type CountMetrics struct {
	Expected  int
	Extracted int
	Matched   int
	Precision float64
	Recall    float64
	F1        float64
}

// txPair represents a matched pair of extracted and ground-truth transactions.
type txPair struct {
	extracted *pfinancev1.ExtractedTransaction
	truth     Transaction
}

// StrategyFunc is the signature for an extraction strategy.
// Returns: result, geminiCallCount, error.
type StrategyFunc func(ctx context.Context, text string, docType pfinancev1.DocumentType) (*pfinancev1.ExtractionResult, int, error)

// --- Metric Functions ---

// ComputeMetrics compares extracted transactions against ground truth.
func ComputeMetrics(
	strategy string,
	fixture string,
	extracted []*pfinancev1.ExtractedTransaction,
	truth *GroundTruth,
	duration time.Duration,
	geminiCalls int,
) *EvalResult {
	result := &EvalResult{
		Strategy:    strategy,
		Fixture:     fixture,
		Duration:    duration,
		GeminiCalls: geminiCalls,
	}

	matched, unmatchedExtracted, unmatchedTruth := matchTransactions(extracted, truth.Transactions)

	// Count metrics
	result.TransactionCount = CountMetrics{
		Expected:  len(truth.Transactions),
		Extracted: len(extracted),
		Matched:   len(matched),
	}

	if len(extracted) > 0 {
		result.TransactionCount.Precision = float64(len(matched)) / float64(len(extracted))
	}
	if len(truth.Transactions) > 0 {
		result.TransactionCount.Recall = float64(len(matched)) / float64(len(truth.Transactions))
	}
	p := result.TransactionCount.Precision
	r := result.TransactionCount.Recall
	if p+r > 0 {
		result.TransactionCount.F1 = 2 * p * r / (p + r)
	}

	// Compute per-field accuracy on matched pairs
	if len(matched) > 0 {
		var amountOK, dateOK, catOK int
		var descSimSum float64

		for _, pair := range matched {
			if amountMatch(pair.extracted.Amount, pair.truth.Amount) {
				amountOK++
			}
			if dateMatch(pair.extracted.Date, pair.truth.Date) {
				dateOK++
			}
			if categoryMatch(pair.extracted.SuggestedCategory, pair.truth.Category) {
				catOK++
			}
			descSimSum += descriptionSimilarity(pair.extracted.Description, pair.truth.Description)
		}

		result.AmountAccuracy = float64(amountOK) / float64(len(matched))
		result.DateAccuracy = float64(dateOK) / float64(len(matched))
		result.CategoryAccuracy = float64(catOK) / float64(len(matched))
		result.DescriptionSim = descSimSum / float64(len(matched))
	}

	// Overall score
	result.OverallScore = 0.30*result.TransactionCount.F1 +
		0.30*result.AmountAccuracy +
		0.15*result.DateAccuracy +
		0.15*result.CategoryAccuracy +
		0.10*result.DescriptionSim

	_ = unmatchedExtracted
	_ = unmatchedTruth

	return result
}

// matchTransactions pairs extracted txs to ground truth txs using date+amount matching.
// Returns matched pairs + count of unmatched from each side.
func matchTransactions(
	extracted []*pfinancev1.ExtractedTransaction,
	truth []Transaction,
) (matched []txPair, unmatchedExtracted, unmatchedTruth int) {
	// Track which truth transactions have been matched
	truthUsed := make([]bool, len(truth))

	for _, ext := range extracted {
		bestIdx := -1
		bestScore := -1.0

		for j, tr := range truth {
			if truthUsed[j] {
				continue
			}
			// Primary match: amount within tolerance
			if !amountMatch(ext.Amount, tr.Amount) {
				continue
			}
			// Secondary: date match gives a bonus
			score := 1.0
			if dateMatch(ext.Date, tr.Date) {
				score += 1.0
			}
			// Tertiary: description similarity bonus
			score += descriptionSimilarity(ext.Description, tr.Description) * 0.5

			if score > bestScore {
				bestScore = score
				bestIdx = j
			}
		}

		if bestIdx >= 0 {
			truthUsed[bestIdx] = true
			matched = append(matched, txPair{
				extracted: ext,
				truth:     truth[bestIdx],
			})
		}
	}

	unmatchedExtracted = len(extracted) - len(matched)
	unmatchedTruth = 0
	for _, used := range truthUsed {
		if !used {
			unmatchedTruth++
		}
	}

	return matched, unmatchedExtracted, unmatchedTruth
}

// amountMatch returns true if amounts are within $0.10 or 1%.
func amountMatch(a, b float64) bool {
	diff := math.Abs(a - b)
	if diff <= 0.10 {
		return true
	}
	if b != 0 && diff/math.Abs(b) < 0.01 {
		return true
	}
	return false
}

// dateMatch returns true if dates are the same (YYYY-MM-DD string comparison).
func dateMatch(a, b string) bool {
	return strings.TrimSpace(a) == strings.TrimSpace(b)
}

// categoryMatch returns true if the extracted category maps to the same ground-truth category string.
func categoryMatch(extracted pfinancev1.ExpenseCategory, truth string) bool {
	extractedStr := categoryEnumToString(extracted)
	return strings.EqualFold(extractedStr, strings.TrimSpace(truth))
}

// categoryEnumToString converts a proto category enum to a display string.
func categoryEnumToString(cat pfinancev1.ExpenseCategory) string {
	switch cat {
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD:
		return "Food"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING:
		return "Housing"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION:
		return "Transportation"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT:
		return "Entertainment"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE:
		return "Healthcare"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES:
		return "Utilities"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING:
		return "Shopping"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION:
		return "Education"
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL:
		return "Travel"
	default:
		return "Other"
	}
}

// descriptionSimilarity returns a 0-1 similarity score using normalized Levenshtein distance.
func descriptionSimilarity(a, b string) float64 {
	a = strings.ToLower(strings.TrimSpace(a))
	b = strings.ToLower(strings.TrimSpace(b))

	if a == b {
		return 1.0
	}

	lenA := utf8.RuneCountInString(a)
	lenB := utf8.RuneCountInString(b)
	if lenA == 0 && lenB == 0 {
		return 1.0
	}

	dist := levenshtein(a, b)
	maxLen := lenA
	if lenB > maxLen {
		maxLen = lenB
	}

	return 1.0 - float64(dist)/float64(maxLen)
}

// levenshtein computes the Levenshtein edit distance between two strings.
func levenshtein(a, b string) int {
	runesA := []rune(a)
	runesB := []rune(b)
	la := len(runesA)
	lb := len(runesB)

	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	// Use single-row optimization
	prev := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}

	for i := 1; i <= la; i++ {
		curr := make([]int, lb+1)
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if runesA[i-1] == runesB[j-1] {
				cost = 0
			}
			curr[j] = min(
				prev[j]+1,      // deletion
				curr[j-1]+1,    // insertion
				prev[j-1]+cost, // substitution
			)
		}
		prev = curr
	}

	return prev[lb]
}

func min(a, b, c int) int {
	if b < a {
		a = b
	}
	if c < a {
		a = c
	}
	return a
}

// --- Runner ---

// RunEval executes all strategies against all fixtures and returns results.
func RunEval(
	ctx context.Context,
	strategies map[string]StrategyFunc,
	fixtures []*Fixture,
) []*EvalResult {
	var results []*EvalResult

	for _, fixture := range fixtures {
		for name, strategy := range strategies {
			start := time.Now()
			extractionResult, geminiCalls, err := strategy(ctx, fixture.Text, fixture.DocumentType)
			elapsed := time.Since(start)

			if err != nil {
				results = append(results, &EvalResult{
					Strategy:    name,
					Fixture:     fixture.Name,
					Duration:    elapsed,
					GeminiCalls: geminiCalls,
					Error:       err.Error(),
				})
				continue
			}

			result := ComputeMetrics(
				name,
				fixture.Name,
				extractionResult.Transactions,
				fixture.GroundTruth,
				elapsed,
				geminiCalls,
			)
			results = append(results, result)
		}
	}

	return results
}

// --- Summary Printer ---

// PrintSummary outputs a formatted comparison table to an io.Writer.
func PrintSummary(w io.Writer, results []*EvalResult) {
	tw := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)

	fmt.Fprintln(tw, "Strategy\tFixture\tF1\tAmt%\tDate%\tCat%\tDesc~\tScore\tTime\tGemini\tMatch\tError")
	fmt.Fprintln(tw, "--------\t-------\t--\t----\t-----\t----\t-----\t-----\t----\t------\t-----\t-----")

	for _, r := range results {
		errStr := ""
		if r.Error != "" {
			errStr = truncate(r.Error, 30)
		}

		matchStr := fmt.Sprintf("%d/%d", r.TransactionCount.Matched, r.TransactionCount.Expected)

		fmt.Fprintf(tw, "%s\t%s\t%.2f\t%.0f%%\t%.0f%%\t%.0f%%\t%.2f\t%.2f\t%s\t%d\t%s\t%s\n",
			r.Strategy,
			r.Fixture,
			r.TransactionCount.F1,
			r.AmountAccuracy*100,
			r.DateAccuracy*100,
			r.CategoryAccuracy*100,
			r.DescriptionSim,
			r.OverallScore,
			r.Duration.Round(time.Millisecond),
			r.GeminiCalls,
			matchStr,
			errStr,
		)
	}

	tw.Flush()

	// Print per-strategy averages
	fmt.Fprintln(w)
	fmt.Fprintln(w, "=== Strategy Averages ===")

	strategyScores := make(map[string][]float64)
	strategyF1s := make(map[string][]float64)
	for _, r := range results {
		if r.Error == "" {
			strategyScores[r.Strategy] = append(strategyScores[r.Strategy], r.OverallScore)
			strategyF1s[r.Strategy] = append(strategyF1s[r.Strategy], r.TransactionCount.F1)
		}
	}

	tw2 := tabwriter.NewWriter(w, 0, 4, 2, ' ', 0)
	fmt.Fprintln(tw2, "Strategy\tAvg Score\tAvg F1\tFixtures")
	fmt.Fprintln(tw2, "--------\t---------\t------\t--------")

	for strategy, scores := range strategyScores {
		avgScore := avg(scores)
		avgF1 := avg(strategyF1s[strategy])
		fmt.Fprintf(tw2, "%s\t%.3f\t%.3f\t%d/%d\n",
			strategy, avgScore, avgF1, len(scores), len(results)/len(strategyScores))
	}
	tw2.Flush()
}

func avg(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	var sum float64
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max-3] + "..."
}
