package taxeval

import (
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"
)

// GenerateTaxReport produces an aggregated tax report from eval run results.
func GenerateTaxReport(run *EvalRun, financialYear string) *TaxReport {
	report := &TaxReport{
		FinancialYear:        financialYear,
		Occupation:           run.Occupation,
		GeneratedAt:          time.Now(),
		DeductionsByCategory: make(map[string]*DeductionCategory),
		DocumentCount:        run.Summary.SuccessfulFiles,
	}

	// Initialize all ATO categories
	for cat, info := range ATOCategoryInfo {
		_ = cat
		report.DeductionsByCategory[info.Code] = &DeductionCategory{
			Code: info.Code,
			Name: info.Name,
		}
	}

	// Aggregate all tax results
	for _, fr := range run.FileResults {
		for _, tr := range fr.TaxResults {
			report.TransactionCount++
			report.TotalExpenses += tr.Amount
			report.Items = append(report.Items, tr)

			if tr.Confidence >= 0.8 {
				report.HighConfidence++
			} else if tr.Confidence < 0.6 {
				report.LowConfidence++
			}

			if !tr.IsDeductible {
				continue
			}

			report.TotalDeductions += tr.DeductibleAmount

			// Parse ATO code from "D4 - Other work-related expenses"
			code := strings.SplitN(tr.TaxCategory, " - ", 2)[0]
			if code == "" {
				code = "Other"
			}

			cat, ok := report.DeductionsByCategory[code]
			if !ok {
				cat = &DeductionCategory{Code: code, Name: code}
				report.DeductionsByCategory[code] = cat
			}
			cat.TotalAmount += tr.Amount
			cat.DeductibleAmount += tr.DeductibleAmount
			cat.ItemCount++
			cat.Items = append(cat.Items, tr)
		}
	}

	// Remove empty categories
	for code, cat := range report.DeductionsByCategory {
		if cat.ItemCount == 0 {
			delete(report.DeductionsByCategory, code)
		}
	}

	return report
}

// LoadResults reads an EvalRun from a JSON file (for score-only mode).
func LoadResults(path string) (*EvalRun, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read results: %w", err)
	}
	var run EvalRun
	if err := json.Unmarshal(data, &run); err != nil {
		return nil, fmt.Errorf("parse results: %w", err)
	}
	return &run, nil
}

// WriteJSON writes any value to a JSON file.
func WriteJSON(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}

// PrintSummary prints a human-readable summary to stdout.
func PrintSummary(run *EvalRun) {
	s := run.Summary
	c := run.CostSummary

	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Println("  TAX EVAL RESULTS")
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Printf("  Dataset:      %s\n", run.DatasetPath)
	fmt.Printf("  Method:       %s\n", run.Method)
	fmt.Printf("  Occupation:   %s\n", run.Occupation)
	fmt.Printf("  Duration:     %s\n", time.Duration(run.DurationMs)*time.Millisecond)
	fmt.Println()

	fmt.Println("── Files ──────────────────────────────────────────────")
	fmt.Printf("  Total:        %d\n", s.TotalFiles)
	fmt.Printf("  Successful:   %d\n", s.SuccessfulFiles)
	fmt.Printf("  Failed:       %d\n", s.FailedFiles)
	fmt.Printf("  Avg time:     %.0fms/file\n", s.AvgProcessingMs)
	fmt.Println()

	fmt.Println("── Transactions ───────────────────────────────────────")
	fmt.Printf("  Extracted:    %d\n", s.TotalTransactions)
	fmt.Printf("  Rejected:     %d\n", s.TotalRejected)
	fmt.Printf("  Deductible:   %d\n", s.TotalDeductible)
	fmt.Printf("  Non-deduct:   %d\n", s.TotalNonDeductible)
	fmt.Printf("  Avg conf:     %.1f%%\n", s.AvgConfidence*100)
	fmt.Println()

	fmt.Println("── Cost ───────────────────────────────────────────────")
	fmt.Printf("  API calls:    %d (extraction: %d, classify: %d)\n",
		c.TotalAPICalls, c.ExtractionCalls, c.ClassificationCalls)
	fmt.Printf("  Est tokens:   %d\n", c.EstimatedTokens)
	fmt.Printf("  Est cost:     $%.4f\n", c.EstimatedCostUSD)
	fmt.Println()

	// Print failed files
	if s.FailedFiles > 0 {
		fmt.Println("── Errors ─────────────────────────────────────────────")
		for _, fr := range run.FileResults {
			if fr.Error != "" {
				fmt.Printf("  ✗ %s: %s\n", fr.RelativePath, fr.Error)
			}
		}
		fmt.Println()
	}

	fmt.Println("═══════════════════════════════════════════════════════")
}

// PrintTaxReport prints a human-readable tax report.
func PrintTaxReport(report *TaxReport) {
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Printf("  TAX REPORT — FY%s\n", report.FinancialYear)
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Printf("  Occupation:      %s\n", report.Occupation)
	fmt.Printf("  Documents:       %d\n", report.DocumentCount)
	fmt.Printf("  Transactions:    %d\n", report.TransactionCount)
	fmt.Printf("  Total expenses:  $%.2f\n", report.TotalExpenses)
	fmt.Printf("  Total deductions: $%.2f\n", report.TotalDeductions)
	fmt.Printf("  High confidence: %d  |  Low confidence: %d\n", report.HighConfidence, report.LowConfidence)
	fmt.Println()

	// Sort categories by code
	var codes []string
	for code := range report.DeductionsByCategory {
		codes = append(codes, code)
	}
	sort.Strings(codes)

	fmt.Println("── Deductions by ATO Category ─────────────────────────")
	for _, code := range codes {
		cat := report.DeductionsByCategory[code]
		fmt.Printf("\n  %s: %s\n", cat.Code, cat.Name)
		fmt.Printf("    Items: %d  |  Total: $%.2f  |  Deductible: $%.2f\n",
			cat.ItemCount, cat.TotalAmount, cat.DeductibleAmount)

		// Show top 5 items
		items := cat.Items
		if len(items) > 5 {
			items = items[:5]
		}
		for _, item := range items {
			fmt.Printf("    · %-40s $%8.2f  (%.0f%% conf, %s)\n",
				truncate(item.Description, 40),
				item.Amount,
				item.Confidence*100,
				item.Source,
			)
		}
		if len(cat.Items) > 5 {
			fmt.Printf("    ... and %d more\n", len(cat.Items)-5)
		}
	}

	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════")
}

// PrintAccuracyReport prints a human-readable accuracy report.
func PrintAccuracyReport(acc *AccuracyReport) {
	fmt.Println()
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Println("  ACCURACY REPORT")
	fmt.Println("═══════════════════════════════════════════════════════")
	fmt.Printf("  Files with ground truth: %d\n", acc.FilesWithGroundTruth)
	fmt.Printf("  Files evaluated:         %d\n", acc.FilesEvaluated)
	fmt.Println()

	fmt.Println("── Extraction ─────────────────────────────────────────")
	fmt.Printf("  Expected txns:   %d\n", acc.Extraction.ExpectedTotal)
	fmt.Printf("  Extracted txns:  %d\n", acc.Extraction.ExtractedTotal)
	fmt.Printf("  Matched:         %d\n", acc.Extraction.MatchedCount)
	fmt.Printf("  Precision:       %.1f%%\n", acc.Extraction.Precision*100)
	fmt.Printf("  Recall:          %.1f%%\n", acc.Extraction.Recall*100)
	fmt.Printf("  F1:              %.1f%%\n", acc.Extraction.F1*100)
	fmt.Println()

	fmt.Println("── Deductibility Classification ───────────────────────")
	fmt.Printf("  Evaluated:       %d\n", acc.Deductibility.Total)
	fmt.Printf("  Correct:         %d\n", acc.Deductibility.Correct)
	fmt.Printf("  Accuracy:        %.1f%%\n", acc.Deductibility.Accuracy*100)
	fmt.Println()

	if acc.TaxCategory.Total > 0 {
		fmt.Println("── Tax Category Classification ────────────────────────")
		fmt.Printf("  Evaluated:       %d\n", acc.TaxCategory.Total)
		fmt.Printf("  Correct:         %d\n", acc.TaxCategory.Correct)
		fmt.Printf("  Accuracy:        %.1f%%\n", acc.TaxCategory.Accuracy*100)
		fmt.Println()
	}

	fmt.Println("── Amount Accuracy ────────────────────────────────────")
	fmt.Printf("  Evaluated:       %d\n", acc.AmountAccuracy.Total)
	fmt.Printf("  Exact (±$0.01):  %d (%.1f%%)\n",
		acc.AmountAccuracy.ExactMatches,
		pct(acc.AmountAccuracy.ExactMatches, acc.AmountAccuracy.Total))
	fmt.Printf("  Close (±5%%):     %d (%.1f%%)\n",
		acc.AmountAccuracy.CloseMatches,
		pct(acc.AmountAccuracy.CloseMatches, acc.AmountAccuracy.Total))
	fmt.Printf("  Mean abs error:  $%.2f\n", acc.AmountAccuracy.MeanAbsError)
	fmt.Printf("  Mean %% error:    %.1f%%\n", acc.AmountAccuracy.MeanPctError*100)
	fmt.Println()

	// Per-file breakdown
	if len(acc.PerFile) > 0 {
		fmt.Println("── Per-File Breakdown ─────────────────────────────────")
		for _, pf := range acc.PerFile {
			status := "✓"
			if pf.Matched < pf.Expected {
				status = "△"
			}
			fmt.Printf("  %s %-45s  expected:%d  extracted:%d  matched:%d",
				status,
				truncate(pf.RelativePath, 45),
				pf.Expected, pf.Extracted, pf.Matched)
			if pf.Deductibility != nil {
				fmt.Printf("  deduct:%.0f%%", pf.Deductibility.Accuracy*100)
			}
			if pf.TaxCategory != nil {
				fmt.Printf("  taxcat:%.0f%%", pf.TaxCategory.Accuracy*100)
			}
			fmt.Println()
		}
		fmt.Println()
	}

	fmt.Println("═══════════════════════════════════════════════════════")
}

func pct(n, total int) float64 {
	if total == 0 {
		return 0
	}
	return float64(n) / float64(total) * 100
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}
