package extraction

import (
	"context"
	"testing"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestTaxPipeline_AlreadyClassifiedSkipped(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	expenses := []*pfinancev1.Expense{
		{
			Id:                   "exp-1",
			Description:          "Office desk for home office",
			IsTaxDeductible:      true,
			TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
			TaxDeductiblePercent: 1.0,
		},
	}

	results := pipeline.ClassifyExpenses(ctx, expenses, nil, "", 0.85)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.Classification.Source != "user" {
		t.Errorf("expected Source='user', got %q", r.Classification.Source)
	}
	if r.Classification.Confidence != 1.0 {
		t.Errorf("expected Confidence=1.0, got %f", r.Classification.Confidence)
	}
	if !r.Classification.IsDeductible {
		t.Error("expected IsDeductible=true")
	}
	if r.Classification.Category != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE {
		t.Errorf("expected Category=HOME_OFFICE, got %v", r.Classification.Category)
	}
	if r.Classification.DeductiblePct != 1.0 {
		t.Errorf("expected DeductiblePct=1.0, got %f", r.Classification.DeductiblePct)
	}
}

func TestTaxPipeline_UserRejectedSkipped(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	expenses := []*pfinancev1.Expense{
		{
			Id:               "exp-2",
			Description:      "Coffee at cafe",
			IsTaxDeductible:  false,
			TaxDeductionNote: "User rejected",
		},
	}

	results := pipeline.ClassifyExpenses(ctx, expenses, nil, "", 0.85)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.Classification.Source != "user" {
		t.Errorf("expected Source='user', got %q", r.Classification.Source)
	}
	if r.Classification.Confidence != 1.0 {
		t.Errorf("expected Confidence=1.0, got %f", r.Classification.Confidence)
	}
	if r.Classification.IsDeductible {
		t.Error("expected IsDeductible=false")
	}
}

func TestTaxPipeline_UserMappingPriority(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	expenses := []*pfinancev1.Expense{
		{
			Id:          "exp-3",
			Description: "coworking space monthly fee",
		},
	}

	mappings := []*pfinancev1.TaxDeductibilityMapping{
		{
			MerchantPattern:   "coworking",
			DeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
			DeductiblePercent: 0.8,
			Confidence:        0.85,
		},
	}

	results := pipeline.ClassifyExpenses(ctx, expenses, mappings, "", 0.85)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.Classification.Source != "user_mapping" {
		t.Errorf("expected Source='user_mapping', got %q", r.Classification.Source)
	}
	if r.Classification.Confidence != 0.85 {
		t.Errorf("expected Confidence=0.85, got %f", r.Classification.Confidence)
	}
	if !r.Classification.IsDeductible {
		t.Error("expected IsDeductible=true")
	}
	if r.Classification.Category != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE {
		t.Errorf("expected Category=HOME_OFFICE, got %v", r.Classification.Category)
	}
	if r.Classification.DeductiblePct != 0.8 {
		t.Errorf("expected DeductiblePct=0.8, got %f", r.Classification.DeductiblePct)
	}
}

func TestTaxPipeline_RuleBasedHighConfidence(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	expenses := []*pfinancev1.Expense{
		{
			Id:          "exp-4",
			Description: "h&r block tax prep",
		},
	}

	results := pipeline.ClassifyExpenses(ctx, expenses, nil, "", 0.85)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.Classification.Source != "merchant_map" {
		t.Errorf("expected Source='merchant_map', got %q", r.Classification.Source)
	}
	if r.Classification.Confidence != 0.95 {
		t.Errorf("expected Confidence=0.95, got %f", r.Classification.Confidence)
	}
	if !r.Classification.IsDeductible {
		t.Error("expected IsDeductible=true")
	}
	if r.Classification.Category != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS {
		t.Errorf("expected Category=TAX_AFFAIRS, got %v", r.Classification.Category)
	}
}

func TestTaxPipeline_LowConfidenceFallsThrough(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	expenses := []*pfinancev1.Expense{
		{
			Id:          "exp-5",
			Description: "random store payment",
		},
	}

	results := pipeline.ClassifyExpenses(ctx, expenses, nil, "", 0.85)

	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}

	r := results[0]
	if r.Classification.Source != "none" {
		t.Errorf("expected Source='none', got %q", r.Classification.Source)
	}
	if r.Classification.Confidence != 0.30 {
		t.Errorf("expected Confidence=0.30, got %f", r.Classification.Confidence)
	}
	if r.Classification.IsDeductible {
		t.Error("expected IsDeductible=false")
	}
}

func TestTaxPipeline_MixedBatch(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	expenses := []*pfinancev1.Expense{
		// 0: Already classified by user
		{
			Id:                   "exp-classified",
			Description:          "Previously classified expense",
			IsTaxDeductible:      true,
			TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
			TaxDeductiblePercent: 1.0,
		},
		// 1: User-rejected
		{
			Id:               "exp-rejected",
			Description:      "Rejected by user",
			IsTaxDeductible:  false,
			TaxDeductionNote: "Not work related",
		},
		// 2: High-confidence not-deductible merchant (woolworths)
		{
			Id:          "exp-woolworths",
			Description: "woolworths groceries",
		},
		// 3: Keyword match (laptop)
		{
			Id:          "exp-laptop",
			Description: "new laptop for development",
		},
		// 4: Unknown - should fall through to low confidence
		{
			Id:          "exp-unknown",
			Description: "miscellaneous payment xyz",
		},
	}

	results := pipeline.ClassifyExpenses(ctx, expenses, nil, "", 0.85)

	if len(results) != 5 {
		t.Fatalf("expected 5 results, got %d", len(results))
	}

	// 0: Already classified -> user, 1.0
	if results[0].Classification.Source != "user" {
		t.Errorf("[0] expected Source='user', got %q", results[0].Classification.Source)
	}
	if results[0].Classification.Confidence != 1.0 {
		t.Errorf("[0] expected Confidence=1.0, got %f", results[0].Classification.Confidence)
	}

	// 1: User-rejected -> user, 1.0
	if results[1].Classification.Source != "user" {
		t.Errorf("[1] expected Source='user', got %q", results[1].Classification.Source)
	}
	if results[1].Classification.Confidence != 1.0 {
		t.Errorf("[1] expected Confidence=1.0, got %f", results[1].Classification.Confidence)
	}
	if results[1].Classification.IsDeductible {
		t.Error("[1] expected IsDeductible=false")
	}

	// 2: Woolworths -> not_deductible, 0.90
	if results[2].Classification.Source != "not_deductible" {
		t.Errorf("[2] expected Source='not_deductible', got %q", results[2].Classification.Source)
	}
	if results[2].Classification.Confidence != 0.90 {
		t.Errorf("[2] expected Confidence=0.90, got %f", results[2].Classification.Confidence)
	}
	if results[2].Classification.IsDeductible {
		t.Error("[2] expected IsDeductible=false")
	}

	// 3: Laptop -> keyword match at 0.55, but below 0.60 intermediate threshold so queued for Gemini.
	// With no Gemini, falls through to default 0.30 (the 0.55 result is not stored since < 0.60).
	if results[3].Classification.Confidence != 0.30 {
		t.Errorf("[3] expected Confidence=0.30 (no Gemini fallback), got %f", results[3].Classification.Confidence)
	}
	if results[3].Classification.IsDeductible {
		t.Error("[3] expected IsDeductible=false (fell through without Gemini)")
	}

	// 4: Unknown -> none, 0.30
	if results[4].Classification.Source != "none" {
		t.Errorf("[4] expected Source='none', got %q", results[4].Classification.Source)
	}
	if results[4].Classification.Confidence != 0.30 {
		t.Errorf("[4] expected Confidence=0.30, got %f", results[4].Classification.Confidence)
	}
	if results[4].Classification.IsDeductible {
		t.Error("[4] expected IsDeductible=false")
	}
}

func TestTaxPipeline_EmptyExpenses(t *testing.T) {
	pipeline := NewTaxClassificationPipeline("")
	ctx := context.Background()

	results := pipeline.ClassifyExpenses(ctx, []*pfinancev1.Expense{}, nil, "", 0.85)

	if len(results) != 0 {
		t.Fatalf("expected 0 results, got %d", len(results))
	}
}
