package extraction

import (
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestClassifyExpenseRuleBased_NotDeductibleMerchants(t *testing.T) {
	tests := []struct {
		name        string
		description string
	}{
		{name: "woolworths", description: "woolworths"},
		{name: "coles", description: "coles"},
		{name: "netflix", description: "netflix"},
		{name: "bunnings", description: "bunnings"},
		{name: "uber eats", description: "uber eats"},
		{name: "jb hi-fi", description: "jb hi-fi"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expense := &pfinancev1.Expense{
				Description: tc.description,
			}
			result := ClassifyExpenseRuleBased(expense)

			if result.IsDeductible {
				t.Errorf("expected IsDeductible=false for %q, got true", tc.description)
			}
			if result.Confidence < 0.90 {
				t.Errorf("expected Confidence >= 0.90 for %q, got %f", tc.description, result.Confidence)
			}
			if result.Source != "not_deductible" {
				t.Errorf("expected Source=%q for %q, got %q", "not_deductible", tc.description, result.Source)
			}
		})
	}
}

func TestClassifyExpenseRuleBased_DeductibleMerchants(t *testing.T) {
	tests := []struct {
		name           string
		description    string
		wantCategory   pfinancev1.TaxDeductionCategory
		wantConfidence float64
	}{
		{
			name:           "h&r block",
			description:    "h&r block",
			wantCategory:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS,
			wantConfidence: 0.95,
		},
		{
			name:           "red cross",
			description:    "red cross",
			wantCategory:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS,
			wantConfidence: 0.95,
		},
		{
			name:           "xero",
			description:    "xero",
			wantCategory:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS,
			wantConfidence: 0.85,
		},
		{
			name:           "dry cleaner",
			description:    "dry cleaner",
			wantCategory:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM,
			wantConfidence: 0.50,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expense := &pfinancev1.Expense{
				Description: tc.description,
			}
			result := ClassifyExpenseRuleBased(expense)

			if !result.IsDeductible {
				t.Errorf("expected IsDeductible=true for %q, got false", tc.description)
			}
			if result.Category != tc.wantCategory {
				t.Errorf("expected Category=%v for %q, got %v", tc.wantCategory, tc.description, result.Category)
			}
			if result.Confidence != tc.wantConfidence {
				t.Errorf("expected Confidence=%f for %q, got %f", tc.wantConfidence, tc.description, result.Confidence)
			}
			if result.Source != "merchant_map" {
				t.Errorf("expected Source=%q for %q, got %q", "merchant_map", tc.description, result.Source)
			}
		})
	}
}

func TestClassifyExpenseRuleBased_CategoryHeuristics(t *testing.T) {
	tests := []struct {
		name              string
		category          pfinancev1.ExpenseCategory
		wantTaxCategory   pfinancev1.TaxDeductionCategory
		wantConfidence    float64
		wantDeductiblePct float64
	}{
		{
			name:              "education category",
			category:          pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
			wantTaxCategory:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
			wantConfidence:    0.55,
			wantDeductiblePct: 1.0,
		},
		{
			name:              "transportation category",
			category:          pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
			wantTaxCategory:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL,
			wantConfidence:    0.40,
			wantDeductiblePct: 0.5,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expense := &pfinancev1.Expense{
				Description: "some generic expense",
				Category:    tc.category,
			}
			result := ClassifyExpenseRuleBased(expense)

			if !result.IsDeductible {
				t.Errorf("expected IsDeductible=true for category %v, got false", tc.category)
			}
			if result.Category != tc.wantTaxCategory {
				t.Errorf("expected Category=%v, got %v", tc.wantTaxCategory, result.Category)
			}
			if result.Confidence != tc.wantConfidence {
				t.Errorf("expected Confidence=%f, got %f", tc.wantConfidence, result.Confidence)
			}
			if result.DeductiblePct != tc.wantDeductiblePct {
				t.Errorf("expected DeductiblePct=%f, got %f", tc.wantDeductiblePct, result.DeductiblePct)
			}
			if result.Source != "category" {
				t.Errorf("expected Source=%q, got %q", "category", result.Source)
			}
		})
	}
}

func TestClassifyExpenseRuleBased_TagBased(t *testing.T) {
	tests := []struct {
		name string
		tags []string
	}{
		{name: "work tag", tags: []string{"work"}},
		{name: "business tag", tags: []string{"business"}},
		{name: "deductible tag", tags: []string{"deductible"}},
		{name: "tax tag", tags: []string{"tax"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expense := &pfinancev1.Expense{
				Description: "some unrecognised expense",
				Tags:        tc.tags,
			}
			result := ClassifyExpenseRuleBased(expense)

			if !result.IsDeductible {
				t.Errorf("expected IsDeductible=true for tags %v, got false", tc.tags)
			}
			if result.Category != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK {
				t.Errorf("expected Category=OTHER_WORK, got %v", result.Category)
			}
			if result.Confidence != 0.60 {
				t.Errorf("expected Confidence=0.60, got %f", result.Confidence)
			}
			if result.Source != "tag" {
				t.Errorf("expected Source=%q, got %q", "tag", result.Source)
			}
		})
	}
}

func TestClassifyExpenseRuleBased_KeywordFallback(t *testing.T) {
	tests := []struct {
		name         string
		description  string
		wantCategory pfinancev1.TaxDeductionCategory
	}{
		{
			name:         "office supplies keyword",
			description:  "office supplies",
			wantCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		},
		{
			name:         "laptop keyword",
			description:  "laptop",
			wantCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		},
		{
			name:         "conference keyword",
			description:  "conference",
			wantCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
		},
		{
			name:         "donation keyword",
			description:  "donation",
			wantCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expense := &pfinancev1.Expense{
				Description: tc.description,
			}
			result := ClassifyExpenseRuleBased(expense)

			if !result.IsDeductible {
				t.Errorf("expected IsDeductible=true for %q, got false", tc.description)
			}
			if result.Category != tc.wantCategory {
				t.Errorf("expected Category=%v for %q, got %v", tc.wantCategory, tc.description, result.Category)
			}
			if result.Confidence != 0.55 {
				t.Errorf("expected Confidence=0.55 for %q, got %f", tc.description, result.Confidence)
			}
			if result.Source != "keyword" {
				t.Errorf("expected Source=%q for %q, got %q", "keyword", tc.description, result.Source)
			}
		})
	}
}

func TestClassifyExpenseRuleBased_NoMatch(t *testing.T) {
	expense := &pfinancev1.Expense{
		Description: "random purchase at local shop",
	}
	result := ClassifyExpenseRuleBased(expense)

	if result.IsDeductible {
		t.Error("expected IsDeductible=false, got true")
	}
	if result.Confidence != 0.30 {
		t.Errorf("expected Confidence=0.30, got %f", result.Confidence)
	}
	if result.Source != "none" {
		t.Errorf("expected Source=%q, got %q", "none", result.Source)
	}
}

func TestClassifyExpenseRuleBased_CaseInsensitive(t *testing.T) {
	tests := []struct {
		name        string
		description string
	}{
		{name: "uppercase", description: "WOOLWORTHS"},
		{name: "lowercase", description: "woolworths"},
		{name: "mixed case with suffix", description: "Woolworths 1234 SYDNEY"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			expense := &pfinancev1.Expense{
				Description: tc.description,
			}
			result := ClassifyExpenseRuleBased(expense)

			if result.IsDeductible {
				t.Errorf("expected IsDeductible=false for %q, got true", tc.description)
			}
			if result.Source != "not_deductible" {
				t.Errorf("expected Source=%q for %q, got %q", "not_deductible", tc.description, result.Source)
			}
		})
	}
}
