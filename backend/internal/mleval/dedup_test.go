package mleval

import (
	"testing"
)

func TestDedupKey(t *testing.T) {
	tests := []struct {
		date1, date2 string
		amt1, amt2   float64
		desc1, desc2 string
		wantSame     bool
	}{
		{"2025-01-15", "2025-01-15", 42.50, 42.50, "WOOLWORTHS 1234", "WOOLWORTHS 1234", true},
		{"2025-01-15", "2025-01-15", 42.50, 42.50, "Woolworths 1234", "woolworths 1234", true},
		{"2025-01-15", "2025-01-16", 42.50, 42.50, "WOOLWORTHS", "WOOLWORTHS", false},
		{"2025-01-15", "2025-01-15", 42.50, 42.51, "WOOLWORTHS", "WOOLWORTHS", false},
		{"2025-01-15", "2025-01-15", 42.50, 42.50, "WOOLWORTHS", "COLES", false},
	}

	for _, tt := range tests {
		k1 := dedupKey(tt.date1, tt.amt1, tt.desc1)
		k2 := dedupKey(tt.date2, tt.amt2, tt.desc2)
		if (k1 == k2) != tt.wantSame {
			t.Errorf("dedupKey(%q,%f,%q) vs dedupKey(%q,%f,%q): got same=%v want same=%v",
				tt.date1, tt.amt1, tt.desc1, tt.date2, tt.amt2, tt.desc2, k1 == k2, tt.wantSame)
		}
	}
}

func TestDeduplicateRun(t *testing.T) {
	run := &EvalRun{
		FileResults: []*FileResult{
			{
				Filename:     "statement-oct.pdf",
				RelativePath: "statements/statement-oct.pdf",
				Category:     "statement",
				Extraction: &Extraction{
					TransactionCount: 3,
					StatementMetadata: &StatementMeta{
						BankName:    "Westpac",
						PeriodStart: "2025-10-01",
						PeriodEnd:   "2025-10-31",
					},
				},
				TaxResults: []*TaxResult{
					{Description: "WOOLWORTHS", Amount: 42.50, Date: "2025-10-15", Confidence: 0.9},
					{Description: "UBER", Amount: 15.00, Date: "2025-10-20", Confidence: 0.85},
					{Description: "NETFLIX", Amount: 22.99, Date: "2025-10-25", Confidence: 0.95},
				},
			},
			{
				Filename:     "statement-nov.pdf",
				RelativePath: "statements/statement-nov.pdf",
				Category:     "statement",
				Extraction: &Extraction{
					TransactionCount: 2,
					StatementMetadata: &StatementMeta{
						BankName:    "Westpac",
						PeriodStart: "2025-10-20",
						PeriodEnd:   "2025-11-20",
					},
				},
				TaxResults: []*TaxResult{
					// Duplicate of UBER from oct statement
					{Description: "UBER", Amount: 15.00, Date: "2025-10-20", Confidence: 0.80},
					// Duplicate of NETFLIX from oct statement
					{Description: "NETFLIX", Amount: 22.99, Date: "2025-10-25", Confidence: 0.90},
				},
			},
		},
		Summary: &RunSummary{TotalTransactions: 5},
	}

	result := DeduplicateRun(run)

	if result.DuplicatesFound != 2 {
		t.Errorf("DuplicatesFound = %d, want 2", result.DuplicatesFound)
	}
	if result.TotalBefore != 5 {
		t.Errorf("TotalBefore = %d, want 5", result.TotalBefore)
	}
	if result.TotalAfter != 3 {
		t.Errorf("TotalAfter = %d, want 3", result.TotalAfter)
	}

	// Verify the kept transactions are the higher-confidence ones
	if len(run.FileResults[0].TaxResults) != 3 {
		t.Errorf("file 0 should still have 3 transactions, got %d", len(run.FileResults[0].TaxResults))
	}
	if len(run.FileResults[1].TaxResults) != 0 {
		t.Errorf("file 1 should have 0 transactions after dedup, got %d", len(run.FileResults[1].TaxResults))
	}

	// Check overlaps detected
	if len(result.OverlapPairs) != 1 {
		t.Errorf("OverlapPairs = %d, want 1", len(result.OverlapPairs))
	}

	// Summary should be updated
	if run.Summary.TotalTransactions != 3 {
		t.Errorf("Summary.TotalTransactions = %d, want 3", run.Summary.TotalTransactions)
	}
}

func TestDeduplicateRunNoDuplicates(t *testing.T) {
	run := &EvalRun{
		FileResults: []*FileResult{
			{
				Filename: "receipt1.pdf",
				Category: "receipt",
				TaxResults: []*TaxResult{
					{Description: "OFFICE SUPPLIES", Amount: 99.00, Date: "2025-06-01", Confidence: 0.9},
				},
			},
			{
				Filename: "receipt2.pdf",
				Category: "receipt",
				TaxResults: []*TaxResult{
					{Description: "LAPTOP CASE", Amount: 45.00, Date: "2025-06-15", Confidence: 0.85},
				},
			},
		},
		Summary: &RunSummary{TotalTransactions: 2},
	}

	result := DeduplicateRun(run)

	if result.DuplicatesFound != 0 {
		t.Errorf("DuplicatesFound = %d, want 0", result.DuplicatesFound)
	}
	if result.TotalBefore != result.TotalAfter {
		t.Errorf("TotalBefore (%d) != TotalAfter (%d)", result.TotalBefore, result.TotalAfter)
	}
}
