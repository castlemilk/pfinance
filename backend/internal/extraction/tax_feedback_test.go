package extraction

import (
	"strings"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestBuildCorrectionContext_Empty(t *testing.T) {
	result := buildCorrectionContext(nil)
	if result != "" {
		t.Errorf("expected empty string for nil mappings, got %q", result)
	}

	result = buildCorrectionContext([]*pfinancev1.TaxDeductibilityMapping{})
	if result != "" {
		t.Errorf("expected empty string for empty mappings, got %q", result)
	}
}

func TestBuildCorrectionContext_SingleMapping(t *testing.T) {
	mappings := []*pfinancev1.TaxDeductibilityMapping{
		{
			MerchantPattern:   "officeworks",
			DeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
			DeductiblePercent: 1.0,
			ConfirmationCount: 3,
		},
	}

	result := buildCorrectionContext(mappings)

	if !strings.Contains(result, "officeworks") {
		t.Error("expected result to contain merchant pattern")
	}
	if !strings.Contains(result, "D4") {
		t.Error("expected result to contain ATO category D4")
	}
	if !strings.Contains(result, "100%") {
		t.Error("expected result to contain percentage")
	}
	if !strings.Contains(result, "confirmed 3 times") {
		t.Error("expected result to contain confirmation count")
	}
}

func TestBuildCorrectionContext_LimitsTo20(t *testing.T) {
	var mappings []*pfinancev1.TaxDeductibilityMapping
	for i := 0; i < 30; i++ {
		mappings = append(mappings, &pfinancev1.TaxDeductibilityMapping{
			MerchantPattern:   "merchant",
			DeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
			DeductiblePercent: 1.0,
			ConfirmationCount: 1,
		})
	}

	result := buildCorrectionContext(mappings)
	lines := strings.Split(result, "\n")

	// Count lines starting with "- " (the example lines)
	exampleCount := 0
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "- ") {
			exampleCount++
		}
	}

	if exampleCount != 20 {
		t.Errorf("expected 20 example lines, got %d", exampleCount)
	}
}

func TestBuildCorrectionSignalContext_Empty(t *testing.T) {
	result := buildCorrectionSignalContext(nil)
	if result != "" {
		t.Errorf("expected empty string for nil signals, got %q", result)
	}

	result = buildCorrectionSignalContext([]CorrectionSignal{})
	if result != "" {
		t.Errorf("expected empty string for empty signals, got %q", result)
	}
}

func TestBuildCorrectionSignalContext_WithSignals(t *testing.T) {
	signals := []CorrectionSignal{
		{
			MerchantPattern:   "officeworks",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
			CorrectionCount:   5,
			Consistency:       0.80,
		},
	}

	result := buildCorrectionSignalContext(signals)

	if !strings.Contains(result, "officeworks") {
		t.Error("expected result to contain merchant name")
	}
	if !strings.Contains(result, "EDUCATION") {
		t.Error("expected result to contain corrected category")
	}
	if !strings.Contains(result, "5 times") {
		t.Error("expected result to contain correction count")
	}
	if !strings.Contains(result, "80%") {
		t.Error("expected result to contain consistency percentage")
	}
}

func TestBuildCorrectionSignalContext_LimitsTo15(t *testing.T) {
	var signals []CorrectionSignal
	for i := 0; i < 25; i++ {
		signals = append(signals, CorrectionSignal{
			MerchantPattern:   "merchant",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
			CorrectionCount:   3,
			Consistency:       0.90,
		})
	}

	result := buildCorrectionSignalContext(signals)
	lines := strings.Split(result, "\n")

	exampleCount := 0
	for _, line := range lines {
		if strings.HasPrefix(strings.TrimSpace(line), "- ") {
			exampleCount++
		}
	}

	if exampleCount != 15 {
		t.Errorf("expected 15 example lines, got %d", exampleCount)
	}
}

func TestMapEnumToATOCategory(t *testing.T) {
	tests := []struct {
		cat  pfinancev1.TaxDeductionCategory
		want string
	}{
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL, "D1"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM, "D2"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION, "D3"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK, "D4"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE, "D5"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE, "D6"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS, "D10"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, "D15"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_INCOME_PROTECTION, "INCOME_PROTECTION"},
		{pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED, "OTHER"},
	}

	for _, tt := range tests {
		t.Run(tt.want, func(t *testing.T) {
			got := mapEnumToATOCategory(tt.cat)
			if got != tt.want {
				t.Errorf("mapEnumToATOCategory(%v) = %q, want %q", tt.cat, got, tt.want)
			}
		})
	}
}
