package extraction

import (
	"sort"
	"strings"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// TaxClassification represents the result of classifying an expense for tax deductibility
type TaxClassification struct {
	IsDeductible  bool
	Category      pfinancev1.TaxDeductionCategory
	DeductiblePct float64 // 0.0-1.0
	Confidence    float64 // 0.0-1.0
	Reasoning     string
	Source        string // "merchant_map", "category", "keyword", "tag", "not_deductible"
}

// notDeductiblePattern represents a merchant pattern that is almost certainly NOT tax deductible.
type notDeductiblePattern struct {
	Pattern string
}

// notDeductibleMerchants is a sorted slice of merchant patterns (longest first for deterministic matching).
var notDeductibleMerchants []notDeductiblePattern

// deductibleMerchantEntry pairs a pattern with its classification.
type deductibleMerchantEntry struct {
	Pattern        string
	Classification TaxClassification
}

// deductibleMerchantsSorted is a sorted slice (longest pattern first) for deterministic matching.
var deductibleMerchantsSorted []deductibleMerchantEntry

// workKeywordEntry pairs a keyword with its category.
type workKeywordEntry struct {
	Keyword  string
	Category pfinancev1.TaxDeductionCategory
}

// workKeywordsSorted is a sorted slice (longest keyword first) for deterministic matching.
var workKeywordsSorted []workKeywordEntry

func init() {
	// Build sorted not-deductible patterns (longest first)
	notDeductibleSet := []string{
		"woolworths", "coles", "aldi", "costco", "iga",
		"mcdonalds", "mcdonald's", "starbucks", "subway",
		"kfc", "burger king", "dominos", "pizza hut",
		"uber eats", "doordash", "deliveroo", "menulog",
		"netflix", "spotify", "disney+", "stan",
		"amazon prime", "hulu", "youtube premium",
		"jb hi-fi", "harvey norman", "kmart", "target",
		"big w", "bunnings", "ikea",
	}
	sort.Slice(notDeductibleSet, func(i, j int) bool {
		if len(notDeductibleSet[i]) != len(notDeductibleSet[j]) {
			return len(notDeductibleSet[i]) > len(notDeductibleSet[j])
		}
		return notDeductibleSet[i] < notDeductibleSet[j]
	})
	for _, p := range notDeductibleSet {
		notDeductibleMerchants = append(notDeductibleMerchants, notDeductiblePattern{Pattern: p})
	}

	// Build sorted deductible merchant entries (longest pattern first)
	deductibleMap := map[string]TaxClassification{
		// D10 - Tax affairs
		"h&r block":  {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "Tax preparation service", Source: "merchant_map"},
		"tax return": {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS, DeductiblePct: 1.0, Confidence: 0.90, Reasoning: "Tax preparation service", Source: "merchant_map"},
		"myob":       {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS, DeductiblePct: 1.0, Confidence: 0.85, Reasoning: "Accounting software", Source: "merchant_map"},
		"xero":       {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS, DeductiblePct: 1.0, Confidence: 0.85, Reasoning: "Accounting software", Source: "merchant_map"},
		"quickbooks": {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS, DeductiblePct: 1.0, Confidence: 0.85, Reasoning: "Accounting software", Source: "merchant_map"},
		// D15 - Donations
		"red cross":      {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		"salvation army": {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		"unicef":         {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		"world vision":   {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		"oxfam":          {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		"beyondblue":     {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		"wwf":            {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS, DeductiblePct: 1.0, Confidence: 0.95, Reasoning: "DGR-registered charity", Source: "merchant_map"},
		// Income protection
		"income protection": {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_INCOME_PROTECTION, DeductiblePct: 1.0, Confidence: 0.85, Reasoning: "Income protection insurance premium", Source: "merchant_map"},
		// D2 - Uniform
		"workwear":    {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM, DeductiblePct: 1.0, Confidence: 0.70, Reasoning: "Possible work uniform expense", Source: "merchant_map"},
		"dry cleaner": {IsDeductible: true, Category: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM, DeductiblePct: 1.0, Confidence: 0.50, Reasoning: "Possible work uniform cleaning", Source: "merchant_map"},
	}
	for pattern, cls := range deductibleMap {
		deductibleMerchantsSorted = append(deductibleMerchantsSorted, deductibleMerchantEntry{Pattern: pattern, Classification: cls})
	}
	sort.Slice(deductibleMerchantsSorted, func(i, j int) bool {
		if len(deductibleMerchantsSorted[i].Pattern) != len(deductibleMerchantsSorted[j].Pattern) {
			return len(deductibleMerchantsSorted[i].Pattern) > len(deductibleMerchantsSorted[j].Pattern)
		}
		return deductibleMerchantsSorted[i].Pattern < deductibleMerchantsSorted[j].Pattern
	})

	// Build sorted work keywords (longest first)
	workKeywordsMap := map[string]pfinancev1.TaxDeductionCategory{
		"office supplies":  pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		"stationery":       pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		"work phone":       pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		"mobile plan":      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		"internet plan":    pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
		"home office":      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
		"desk":             pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
		"monitor":          pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
		"keyboard":         pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
		"laptop":           pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		"union":            pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		"professional dev": pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
		"conference":       pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
		"seminar":          pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
		"course":           pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
		"textbook":         pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
		"donation":         pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS,
		"charity":          pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS,
		"laundry":          pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM,
		"safety boots":     pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM,
		"tool":             pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
	}
	for kw, cat := range workKeywordsMap {
		workKeywordsSorted = append(workKeywordsSorted, workKeywordEntry{Keyword: kw, Category: cat})
	}
	sort.Slice(workKeywordsSorted, func(i, j int) bool {
		if len(workKeywordsSorted[i].Keyword) != len(workKeywordsSorted[j].Keyword) {
			return len(workKeywordsSorted[i].Keyword) > len(workKeywordsSorted[j].Keyword)
		}
		return workKeywordsSorted[i].Keyword < workKeywordsSorted[j].Keyword
	})
}

// ClassifyExpenseRuleBased applies rule-based classification for tax deductibility.
// Returns a TaxClassification with confidence. This is the first tier of the pipeline.
func ClassifyExpenseRuleBased(expense *pfinancev1.Expense) TaxClassification {
	desc := strings.ToLower(expense.Description)

	// 1. Check not-deductible merchants first (high confidence negative)
	// Sorted by length descending for deterministic longest-match-first behavior
	for _, entry := range notDeductibleMerchants {
		if strings.Contains(desc, entry.Pattern) {
			return TaxClassification{
				IsDeductible: false,
				Confidence:   0.90,
				Reasoning:    "Personal expense merchant - unlikely to be deductible",
				Source:       "not_deductible",
			}
		}
	}

	// 2. Check deductible merchant mappings
	// Sorted by length descending for deterministic longest-match-first behavior
	for _, entry := range deductibleMerchantsSorted {
		if strings.Contains(desc, entry.Pattern) {
			return entry.Classification
		}
	}

	// 3. Category-based heuristics (lower confidence)
	switch expense.Category {
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION:
		return TaxClassification{
			IsDeductible:  true,
			Category:      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
			DeductiblePct: 1.0,
			Confidence:    0.55,
			Reasoning:     "Education expense - may be deductible if work-related",
			Source:        "category",
		}
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION:
		return TaxClassification{
			IsDeductible:  true,
			Category:      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL,
			DeductiblePct: 0.5, // Assume 50% work use without more info
			Confidence:    0.40,
			Reasoning:     "Transport expense - may be deductible if for work travel (not commuting)",
			Source:        "category",
		}
	}

	// 4. Tag-based rules
	for _, tag := range expense.Tags {
		tagLower := strings.ToLower(tag)
		if tagLower == "work" || tagLower == "business" || tagLower == "deductible" || tagLower == "tax" {
			return TaxClassification{
				IsDeductible:  true,
				Category:      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
				DeductiblePct: 1.0,
				Confidence:    0.60,
				Reasoning:     "Tagged as work/business related by user",
				Source:        "tag",
			}
		}
	}

	// 5. Keyword-based fallback (sorted by length descending for deterministic matching)
	for _, kw := range workKeywordsSorted {
		if strings.Contains(desc, kw.Keyword) {
			return TaxClassification{
				IsDeductible:  true,
				Category:      kw.Category,
				DeductiblePct: 1.0,
				Confidence:    0.55,
				Reasoning:     "Description contains work-related keyword: " + kw.Keyword,
				Source:        "keyword",
			}
		}
	}

	// No match — uncertain
	return TaxClassification{
		IsDeductible: false,
		Confidence:   0.30, // Low confidence — needs human or AI review
		Reasoning:    "No matching rules found",
		Source:       "none",
	}
}
