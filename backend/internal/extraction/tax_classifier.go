package extraction

import (
	"sort"
	"strings"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// TaxFieldConfidences holds per-field confidence scores for tax classification.
type TaxFieldConfidences struct {
	IsDeductible         float64 // Confidence in the deductibility decision (0.0-1.0)
	ATOCategory          float64 // Confidence in the ATO category assignment (0.0-1.0)
	DeductiblePercentage float64 // Confidence in the deductible percentage (0.0-1.0)
}

// TaxClassification represents the result of classifying an expense for tax deductibility
type TaxClassification struct {
	IsDeductible     bool
	Category         pfinancev1.TaxDeductionCategory
	DeductiblePct    float64 // 0.0-1.0
	Confidence       float64 // 0.0-1.0 (overall, kept for backward compatibility)
	Reasoning        string
	Source           string // "merchant_map", "category", "keyword", "tag", "not_deductible"
	FieldConfidences TaxFieldConfidences
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

// occupationCategoryRelevance maps occupation groups to deduction categories with
// a confidence boost (positive) or penalty (negative). Only applied when an occupation
// is provided. The boost is additive to the base confidence.
var occupationCategoryRelevance = map[string]map[pfinancev1.TaxDeductionCategory]float64{
	"nurse": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM:        +0.15,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION: +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL:    +0.05,
	},
	"teacher": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION: +0.15,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:     +0.10,
	},
	"engineer": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE:    +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION: +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:     +0.05,
	},
	"developer": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE:    +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION: +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:     +0.05,
	},
	"tradesperson": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE:    +0.15,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK: +0.15,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM:    +0.10,
	},
	"sales": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE:     +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL: +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:  +0.05,
	},
	"healthcare": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM:        +0.15,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION: +0.10,
	},
	"accountant": {
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS:    +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION: +0.10,
		pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE:    +0.05,
	},
}

// occupationAliases maps common occupation strings to canonical keys used in
// occupationCategoryRelevance. Only the most common mappings are included;
// unrecognized occupations receive no boost.
var occupationAliases = map[string]string{
	"registered nurse": "nurse", "rn": "nurse", "nursing": "nurse",
	"doctor": "healthcare", "gp": "healthcare", "physician": "healthcare",
	"paramedic": "healthcare", "dentist": "healthcare", "pharmacist": "healthcare",
	"software engineer": "developer", "programmer": "developer", "web developer": "developer",
	"it": "engineer", "data engineer": "engineer", "devops": "engineer",
	"electrician": "tradesperson", "plumber": "tradesperson", "carpenter": "tradesperson",
	"mechanic": "tradesperson", "builder": "tradesperson",
	"sales representative": "sales", "sales manager": "sales", "real estate agent": "sales",
	"school teacher": "teacher", "lecturer": "teacher", "tutor": "teacher",
	"cpa": "accountant", "bookkeeper": "accountant", "tax agent": "accountant",
}

// resolveOccupation normalizes an occupation string to a canonical key.
func resolveOccupation(occupation string) string {
	occ := strings.ToLower(strings.TrimSpace(occupation))
	if occ == "" {
		return ""
	}
	// Direct match
	if _, ok := occupationCategoryRelevance[occ]; ok {
		return occ
	}
	// Alias match
	if canonical, ok := occupationAliases[occ]; ok {
		return canonical
	}
	// Substring match (e.g., "senior software engineer" contains "software engineer")
	for alias, canonical := range occupationAliases {
		if strings.Contains(occ, alias) {
			return canonical
		}
	}
	return ""
}

// applyOccupationBoost adjusts a classification's confidence based on how relevant
// the deduction category is to the user's occupation. Returns a new classification.
func applyOccupationBoost(cls TaxClassification, occupation string) TaxClassification {
	canonical := resolveOccupation(occupation)
	if canonical == "" {
		return cls
	}
	boosts, ok := occupationCategoryRelevance[canonical]
	if !ok {
		return cls
	}
	boost, ok := boosts[cls.Category]
	if !ok {
		return cls
	}

	boosted := cls
	boosted.Confidence = min(0.99, cls.Confidence+boost)
	if boost > 0 {
		boosted.Reasoning += " (boosted: relevant to " + canonical + " occupation)"
	}
	return boosted
}

// ClassifyExpenseRuleBased applies rule-based classification for tax deductibility.
// Returns a TaxClassification with confidence. This is Tier 2 of the pipeline.
func ClassifyExpenseRuleBased(expense *pfinancev1.Expense, occupation ...string) TaxClassification {
	desc := strings.ToLower(expense.Description)
	occ := ""
	if len(occupation) > 0 {
		occ = occupation[0]
	}

	// 1. Check not-deductible merchants first (high confidence negative)
	// Sorted by length descending for deterministic longest-match-first behavior
	for _, entry := range notDeductibleMerchants {
		if strings.Contains(desc, entry.Pattern) {
			return TaxClassification{
				IsDeductible: false,
				Confidence:   0.90,
				Reasoning:    "Personal expense merchant - unlikely to be deductible",
				Source:       "not_deductible",
				FieldConfidences: TaxFieldConfidences{
					IsDeductible:         0.90,
					ATOCategory:          0.0, // N/A for not-deductible
					DeductiblePercentage: 0.0,
				},
			}
		}
	}

	// 2. Check deductible merchant mappings
	// Sorted by length descending for deterministic longest-match-first behavior
	for _, entry := range deductibleMerchantsSorted {
		if strings.Contains(desc, entry.Pattern) {
			cls := entry.Classification
			cls.FieldConfidences = TaxFieldConfidences{
				IsDeductible:         cls.Confidence,
				ATOCategory:          cls.Confidence,
				DeductiblePercentage: cls.Confidence,
			}
			return applyOccupationBoost(cls, occ)
		}
	}

	// 3. Category-based heuristics (lower confidence)
	switch expense.Category {
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION:
		cls := TaxClassification{
			IsDeductible:  true,
			Category:      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
			DeductiblePct: 1.0,
			Confidence:    0.55,
			Reasoning:     "Education expense - may be deductible if work-related",
			Source:        "category",
			FieldConfidences: TaxFieldConfidences{
				IsDeductible:         0.60,
				ATOCategory:          0.70,
				DeductiblePercentage: 0.50,
			},
		}
		return applyOccupationBoost(cls, occ)
	case pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION:
		cls := TaxClassification{
			IsDeductible:  true,
			Category:      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL,
			DeductiblePct: 0.5, // Assume 50% work use without more info
			Confidence:    0.40,
			Reasoning:     "Transport expense - may be deductible if for work travel (not commuting)",
			Source:        "category",
			FieldConfidences: TaxFieldConfidences{
				IsDeductible:         0.45,
				ATOCategory:          0.55,
				DeductiblePercentage: 0.30,
			},
		}
		return applyOccupationBoost(cls, occ)
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
				FieldConfidences: TaxFieldConfidences{
					IsDeductible:         0.75,
					ATOCategory:          0.40,
					DeductiblePercentage: 0.55,
				},
			}
		}
	}

	// 5. Keyword-based fallback (sorted by length descending for deterministic matching)
	for _, kw := range workKeywordsSorted {
		if strings.Contains(desc, kw.Keyword) {
			cls := TaxClassification{
				IsDeductible:  true,
				Category:      kw.Category,
				DeductiblePct: 1.0,
				Confidence:    0.55,
				Reasoning:     "Description contains work-related keyword: " + kw.Keyword,
				Source:        "keyword",
				FieldConfidences: TaxFieldConfidences{
					IsDeductible:         0.60,
					ATOCategory:          0.55,
					DeductiblePercentage: 0.45,
				},
			}
			return applyOccupationBoost(cls, occ)
		}
	}

	// No match — uncertain
	return TaxClassification{
		IsDeductible: false,
		Confidence:   0.30, // Low confidence — needs human or AI review
		Reasoning:    "No matching rules found",
		Source:       "none",
		FieldConfidences: TaxFieldConfidences{
			IsDeductible:         0.30,
			ATOCategory:          0.0,
			DeductiblePercentage: 0.0,
		},
	}
}
