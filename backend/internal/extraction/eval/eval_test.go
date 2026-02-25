package eval

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"strings"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
)

// --- Unit Tests for Metric Functions ---

func TestAmountMatch(t *testing.T) {
	tests := []struct {
		a, b float64
		want bool
	}{
		{10.00, 10.00, true},
		{10.00, 10.05, true},    // within $0.10
		{10.00, 10.09, true},    // within $0.10
		{10.00, 10.11, false},   // over $0.10 and over 1%
		{100.00, 100.50, true},  // within 1%
		{100.00, 101.01, true},  // diff/b = 1.01/101.01 < 1%
		{100.00, 102.00, false}, // diff/b = 2.0/102.0 > 1%
		{0.0, 0.0, true},
		{0.0, 0.05, true},
		{45.67, 45.67, true},
		{45.67, 45.68, true},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%.2f_vs_%.2f", tt.a, tt.b), func(t *testing.T) {
			got := amountMatch(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("amountMatch(%.2f, %.2f) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestDateMatch(t *testing.T) {
	tests := []struct {
		a, b string
		want bool
	}{
		{"2025-01-15", "2025-01-15", true},
		{"2025-01-15", "2025-01-16", false},
		{"", "", true},
		{"2025-01-15", "", false},
		{"  2025-01-15  ", "2025-01-15", true}, // trimmed
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%q_vs_%q", tt.a, tt.b), func(t *testing.T) {
			got := dateMatch(tt.a, tt.b)
			if got != tt.want {
				t.Errorf("dateMatch(%q, %q) = %v, want %v", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func TestCategoryMatch(t *testing.T) {
	tests := []struct {
		extracted pfinancev1.ExpenseCategory
		truth     string
		want      bool
	}{
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "Food", true},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "food", true},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "Transportation", true},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "Shopping", false},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, "Other", true},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED, "Other", true},
		{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "Entertainment", true},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%v_vs_%s", tt.extracted, tt.truth), func(t *testing.T) {
			got := categoryMatch(tt.extracted, tt.truth)
			if got != tt.want {
				t.Errorf("categoryMatch(%v, %q) = %v, want %v", tt.extracted, tt.truth, got, tt.want)
			}
		})
	}
}

func TestDescriptionSimilarity(t *testing.T) {
	tests := []struct {
		a, b    string
		wantMin float64
		wantMax float64
	}{
		{"hello", "hello", 1.0, 1.0},
		{"", "", 1.0, 1.0},
		{"WOOLWORTHS METRO SYDNEY", "WOOLWORTHS METRO SYDNEY", 1.0, 1.0},
		{"WOOLWORTHS METRO SYDNEY", "Woolworths Metro Sydney", 1.0, 1.0},     // case insensitive
		{"WOOLWORTHS METRO", "WOOLWORTHS METRO SYDNEY", 0.5, 0.9},            // partial
		{"UBER *TRIP SYDNEY", "UBER *TRIP", 0.5, 0.9},                        // partial
		{"MCDONALDS", "TOTALLY DIFFERENT", 0.0, 0.3},                         // very different
		{"NETFLIX.COM", "NETFLIX.COM SUBSCRIPTION", 0.3, 0.8},                // substring
		{"CHEMIST WAREHOUSE SYDNEY", "CHEMIST WAREHOUSE BROADWAY", 0.5, 0.9}, // similar
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("%q_vs_%q", tt.a, tt.b), func(t *testing.T) {
			got := descriptionSimilarity(tt.a, tt.b)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("descriptionSimilarity(%q, %q) = %.3f, want [%.1f, %.1f]",
					tt.a, tt.b, got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestMatchTransactions(t *testing.T) {
	extracted := []*pfinancev1.ExtractedTransaction{
		{Date: "2025-01-01", Description: "WOOLWORTHS", Amount: 45.67},
		{Date: "2025-01-02", Description: "UBER TRIP", Amount: 18.50},
		{Date: "2025-01-03", Description: "EXTRA TX", Amount: 999.99}, // no match
	}

	truth := []Transaction{
		{Date: "2025-01-01", Description: "WOOLWORTHS METRO", Amount: 45.67},
		{Date: "2025-01-02", Description: "UBER *TRIP", Amount: 18.50},
		{Date: "2025-01-04", Description: "NETFLIX", Amount: 22.99}, // no match
	}

	matched, unmatchedExt, unmatchedTruth := matchTransactions(extracted, truth)

	if len(matched) != 2 {
		t.Errorf("expected 2 matches, got %d", len(matched))
	}
	if unmatchedExt != 1 {
		t.Errorf("expected 1 unmatched extracted, got %d", unmatchedExt)
	}
	if unmatchedTruth != 1 {
		t.Errorf("expected 1 unmatched truth, got %d", unmatchedTruth)
	}
}

func TestComputeMetrics(t *testing.T) {
	extracted := []*pfinancev1.ExtractedTransaction{
		{
			Date:              "2025-01-01",
			Description:       "WOOLWORTHS METRO",
			Amount:            45.67,
			SuggestedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
		{
			Date:              "2025-01-02",
			Description:       "UBER *TRIP",
			Amount:            18.50,
			SuggestedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
		},
	}

	truth := &GroundTruth{
		Transactions: []Transaction{
			{Date: "2025-01-01", Description: "WOOLWORTHS METRO SYDNEY", Amount: 45.67, Category: "Food"},
			{Date: "2025-01-02", Description: "UBER *TRIP SYDNEY", Amount: 18.50, Category: "Transportation"},
		},
	}

	result := ComputeMetrics("test", "test_fixture", extracted, truth, 100, 0)

	// Perfect precision and recall
	if result.TransactionCount.Precision != 1.0 {
		t.Errorf("expected precision 1.0, got %.2f", result.TransactionCount.Precision)
	}
	if result.TransactionCount.Recall != 1.0 {
		t.Errorf("expected recall 1.0, got %.2f", result.TransactionCount.Recall)
	}
	if result.TransactionCount.F1 != 1.0 {
		t.Errorf("expected F1 1.0, got %.2f", result.TransactionCount.F1)
	}

	// Amount should be perfect
	if result.AmountAccuracy != 1.0 {
		t.Errorf("expected amount accuracy 1.0, got %.2f", result.AmountAccuracy)
	}

	// Date should be perfect
	if result.DateAccuracy != 1.0 {
		t.Errorf("expected date accuracy 1.0, got %.2f", result.DateAccuracy)
	}

	// Category should be perfect
	if result.CategoryAccuracy != 1.0 {
		t.Errorf("expected category accuracy 1.0, got %.2f", result.CategoryAccuracy)
	}

	// Overall score should be high
	if result.OverallScore < 0.9 {
		t.Errorf("expected overall score >= 0.9, got %.3f", result.OverallScore)
	}
}

func TestComputeMetrics_Empty(t *testing.T) {
	result := ComputeMetrics("test", "empty", nil, &GroundTruth{}, 0, 0)
	if result.TransactionCount.F1 != 0 {
		t.Errorf("expected F1 0 for empty, got %.2f", result.TransactionCount.F1)
	}
	if result.OverallScore != 0 {
		t.Errorf("expected score 0 for empty, got %.3f", result.OverallScore)
	}
}

func TestComputeMetrics_NoExtracted(t *testing.T) {
	truth := &GroundTruth{
		Transactions: []Transaction{
			{Date: "2025-01-01", Description: "TX1", Amount: 10.00, Category: "Food"},
		},
	}
	result := ComputeMetrics("test", "none", nil, truth, 0, 0)
	if result.TransactionCount.Recall != 0 {
		t.Errorf("expected recall 0, got %.2f", result.TransactionCount.Recall)
	}
}

// --- Fixture Loading ---

func TestLoadFixtures(t *testing.T) {
	fixtures, err := LoadFixtures()
	if err != nil {
		t.Fatalf("LoadFixtures() error: %v", err)
	}

	if len(fixtures) != 4 {
		t.Fatalf("expected 4 fixtures, got %d", len(fixtures))
	}

	expectedNames := []string{"simple_receipt", "monthly_statement", "large_statement", "messy_statement"}
	expectedTxCounts := []int{5, 30, 100, 15}

	for i, f := range fixtures {
		if f.Name != expectedNames[i] {
			t.Errorf("fixture[%d].Name = %q, want %q", i, f.Name, expectedNames[i])
		}
		if len(f.GroundTruth.Transactions) != expectedTxCounts[i] {
			t.Errorf("fixture[%d] %q: %d ground truth transactions, want %d",
				i, f.Name, len(f.GroundTruth.Transactions), expectedTxCounts[i])
		}
		if f.Text == "" {
			t.Errorf("fixture[%d] %q: empty text", i, f.Name)
		}
	}
}

// --- Rule-Based Strategy ---

func ruleBasedStrategy() StrategyFunc {
	te := &extraction.TextExtractor{}
	return func(ctx context.Context, text string, docType pfinancev1.DocumentType) (*pfinancev1.ExtractionResult, int, error) {
		// Build a PDFAnalysis from the text (simulates what AnalyzePDF returns)
		lines := splitNonEmpty(text)
		analysis := &extraction.PDFAnalysis{
			PageCount:        1,
			ExtractedText:    text,
			TextLines:        lines,
			EstimatedTxCount: countTransactionCandidates(lines),
			IsScanned:        false,
			MaxOutputTokens:  8192,
		}

		result, err := te.ExtractFromText(analysis, docType)
		if err != nil {
			return nil, 0, err
		}
		return result, 0, nil
	}
}

func splitNonEmpty(text string) []string {
	var lines []string
	for _, line := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			lines = append(lines, trimmed)
		}
	}
	return lines
}

func countTransactionCandidates(lines []string) int {
	// Simple heuristic: count lines that look like they have a date and amount
	count := 0
	for _, line := range lines {
		hasDigits := false
		hasDot := false
		for _, c := range line {
			if c >= '0' && c <= '9' {
				hasDigits = true
			}
			if c == '.' {
				hasDot = true
			}
		}
		if hasDigits && hasDot && strings.Contains(line, "$") {
			count++
		}
	}
	return count
}

// --- Rule-Based Eval ---

func TestEval_RuleBasedOnly(t *testing.T) {
	fixtures, err := LoadFixtures()
	if err != nil {
		t.Fatalf("LoadFixtures() error: %v", err)
	}

	strategies := map[string]StrategyFunc{
		"rule-based": ruleBasedStrategy(),
	}

	results := RunEval(context.Background(), strategies, fixtures)

	if len(results) != len(fixtures) {
		t.Fatalf("expected %d results, got %d", len(fixtures), len(results))
	}

	// Print results table
	var buf bytes.Buffer
	PrintSummary(&buf, results)
	t.Log("\n" + buf.String())

	// Check monthly_statement (well-formatted, rule-based should do well)
	for _, r := range results {
		if r.Error != "" {
			t.Logf("[%s/%s] strategy error (expected for some fixtures): %s",
				r.Strategy, r.Fixture, r.Error)
			continue
		}

		t.Logf("[%s/%s] F1=%.2f Amt=%.0f%% Date=%.0f%% Cat=%.0f%% Desc=%.2f Score=%.3f Matched=%d/%d",
			r.Strategy, r.Fixture,
			r.TransactionCount.F1,
			r.AmountAccuracy*100,
			r.DateAccuracy*100,
			r.CategoryAccuracy*100,
			r.DescriptionSim,
			r.OverallScore,
			r.TransactionCount.Matched,
			r.TransactionCount.Expected,
		)

		// The monthly_statement fixture is well-formatted and should parse well
		if r.Fixture == "monthly_statement" {
			if r.TransactionCount.Matched < 20 {
				t.Errorf("[monthly_statement] expected at least 20 matched transactions, got %d",
					r.TransactionCount.Matched)
			}
			if r.AmountAccuracy < 0.9 {
				t.Errorf("[monthly_statement] expected amount accuracy >= 90%%, got %.0f%%",
					r.AmountAccuracy*100)
			}
		}
	}
}

// --- Print Summary ---

func TestPrintSummary(t *testing.T) {
	results := []*EvalResult{
		{
			Strategy: "rule-based",
			Fixture:  "test",
			TransactionCount: CountMetrics{
				Expected: 10, Extracted: 8, Matched: 7,
				Precision: 0.875, Recall: 0.7, F1: 0.778,
			},
			AmountAccuracy:   0.95,
			DateAccuracy:     0.90,
			CategoryAccuracy: 0.80,
			DescriptionSim:   0.75,
			OverallScore:     0.85,
			Duration:         50000000, // 50ms
		},
		{
			Strategy: "gemini",
			Fixture:  "test",
			TransactionCount: CountMetrics{
				Expected: 10, Extracted: 10, Matched: 10,
				Precision: 1.0, Recall: 1.0, F1: 1.0,
			},
			AmountAccuracy:   1.0,
			DateAccuracy:     1.0,
			CategoryAccuracy: 0.90,
			DescriptionSim:   0.85,
			OverallScore:     0.96,
			Duration:         2000000000, // 2s
			GeminiCalls:      1,
		},
	}

	var buf bytes.Buffer
	PrintSummary(&buf, results)

	output := buf.String()
	if !strings.Contains(output, "rule-based") {
		t.Error("summary should contain 'rule-based'")
	}
	if !strings.Contains(output, "gemini") {
		t.Error("summary should contain 'gemini'")
	}
	if !strings.Contains(output, "Strategy Averages") {
		t.Error("summary should contain strategy averages section")
	}
	t.Log("\n" + output)
}

// --- Integration Test (requires GEMINI_API_KEY) ---

func geminiStrategy(validator *extraction.ValidationService) StrategyFunc {
	return func(ctx context.Context, text string, docType pfinancev1.DocumentType) (*pfinancev1.ExtractionResult, int, error) {
		result, err := validator.ExtractFromTextWithGemini(ctx, text, docType)
		if err != nil {
			return nil, 1, err
		}
		return result, 1, nil
	}
}

func hybridStrategy(validator *extraction.ValidationService) StrategyFunc {
	te := &extraction.TextExtractor{}
	return func(ctx context.Context, text string, docType pfinancev1.DocumentType) (*pfinancev1.ExtractionResult, int, error) {
		// Try rule-based first
		lines := splitNonEmpty(text)
		analysis := &extraction.PDFAnalysis{
			PageCount:        1,
			ExtractedText:    text,
			TextLines:        lines,
			EstimatedTxCount: countTransactionCandidates(lines),
			IsScanned:        false,
			MaxOutputTokens:  8192,
		}

		if analysis.EstimatedTxCount >= 3 {
			if result, err := te.ExtractFromText(analysis, docType); err == nil && result != nil && len(result.Transactions) >= 3 {
				return result, 0, nil
			}
		}

		// Fall back to Gemini
		result, err := validator.ExtractFromTextWithGemini(ctx, text, docType)
		if err != nil {
			return nil, 1, err
		}
		return result, 1, nil
	}
}

func TestEval_AllStrategies(t *testing.T) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		t.Skip("GEMINI_API_KEY not set, skipping integration test")
	}

	fixtures, err := LoadFixtures()
	if err != nil {
		t.Fatalf("LoadFixtures() error: %v", err)
	}

	validator := extraction.NewValidationService(apiKey, "")

	strategies := map[string]StrategyFunc{
		"rule-based": ruleBasedStrategy(),
		"gemini":     geminiStrategy(validator),
		"hybrid":     hybridStrategy(validator),
	}

	results := RunEval(context.Background(), strategies, fixtures)

	var buf bytes.Buffer
	PrintSummary(&buf, results)
	fmt.Println(buf.String())

	// Log errors for debugging
	for _, r := range results {
		if r.Error != "" {
			t.Logf("[%s/%s] error: %s", r.Strategy, r.Fixture, r.Error)
		}
	}

	// Verify we got results for all strategy/fixture combinations
	expectedCount := len(strategies) * len(fixtures)
	if len(results) != expectedCount {
		t.Errorf("expected %d results, got %d", expectedCount, len(results))
	}
}
