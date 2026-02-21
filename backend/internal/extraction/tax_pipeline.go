package extraction

import (
	"context"
	"log"
	"strings"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// TaxClassificationPipeline runs a three-tier classification pipeline:
// 1. User-learned mappings (TaxDeductibilityMapping)
// 2. Static rule-based classifier (tax_classifier.go)
// 3. Gemini AI classifier (tax_gemini.go)
type TaxClassificationPipeline struct {
	gemini *TaxGeminiClassifier
}

// NewTaxClassificationPipeline creates a new classification pipeline.
func NewTaxClassificationPipeline(geminiAPIKey string) *TaxClassificationPipeline {
	var gemini *TaxGeminiClassifier
	if geminiAPIKey != "" {
		gemini = NewTaxGeminiClassifier(geminiAPIKey)
	}
	return &TaxClassificationPipeline{
		gemini: gemini,
	}
}

// ClassificationResult pairs an expense with its classification.
type ClassificationResult struct {
	Expense        *pfinancev1.Expense
	Classification TaxClassification
}

// ClassifyExpenses runs the three-tier pipeline on a list of expenses.
// userMappings are the user's learned deductibility patterns.
// autoApplyThreshold is the confidence above which results are auto-applied.
func (p *TaxClassificationPipeline) ClassifyExpenses(
	ctx context.Context,
	expenses []*pfinancev1.Expense,
	userMappings []*pfinancev1.TaxDeductibilityMapping,
	occupation string,
	autoApplyThreshold float64,
) []ClassificationResult {
	if autoApplyThreshold <= 0 {
		autoApplyThreshold = 0.85
	}

	results := make([]ClassificationResult, len(expenses))
	var needsGemini []*pfinancev1.Expense
	var needsGeminiIdx []int

	for i, expense := range expenses {
		// Skip already-classified expenses
		if expense.IsTaxDeductible && expense.TaxDeductionCategory != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED {
			results[i] = ClassificationResult{
				Expense: expense,
				Classification: TaxClassification{
					IsDeductible:  true,
					Category:      expense.TaxDeductionCategory,
					DeductiblePct: expense.TaxDeductiblePercent,
					Confidence:    1.0, // User already classified
					Reasoning:     "Already classified by user",
					Source:         "user",
				},
			}
			continue
		}

		// Tier 1: User-learned mappings
		if cls := matchUserMapping(expense, userMappings); cls != nil && cls.Confidence >= 0.70 {
			results[i] = ClassificationResult{Expense: expense, Classification: *cls}
			continue
		}

		// Tier 2: Rule-based classifier
		cls := ClassifyExpenseRuleBased(expense)
		if cls.Confidence >= autoApplyThreshold {
			results[i] = ClassificationResult{Expense: expense, Classification: cls}
			continue
		}

		// Tier 2 result below threshold — queue for Gemini
		if cls.Confidence >= 0.60 {
			// Decent rule-based result but not high enough — still use if Gemini unavailable
			results[i] = ClassificationResult{Expense: expense, Classification: cls}
		}

		needsGemini = append(needsGemini, expense)
		needsGeminiIdx = append(needsGeminiIdx, i)
	}

	// Tier 3: Gemini AI for uncertain expenses
	if len(needsGemini) > 0 && p.gemini != nil {
		// Process in batches of 20
		batchSize := 20
		for batchStart := 0; batchStart < len(needsGemini); batchStart += batchSize {
			batchEnd := batchStart + batchSize
			if batchEnd > len(needsGemini) {
				batchEnd = len(needsGemini)
			}
			batch := needsGemini[batchStart:batchEnd]

			geminiResults, err := p.gemini.ClassifyBatch(ctx, batch, occupation)
			if err != nil {
				log.Printf("[TaxPipeline] Gemini classification failed: %v", err)
				continue
			}

			for j, cls := range geminiResults {
				idx := needsGeminiIdx[batchStart+j]
				// Only override if Gemini has higher confidence than existing rule-based
				existing := results[idx].Classification
				if cls.Confidence > existing.Confidence {
					results[idx] = ClassificationResult{
						Expense:        needsGemini[batchStart+j],
						Classification: cls,
					}
				}
			}
		}
	}

	// Fill in any remaining unclassified
	for i, r := range results {
		if r.Expense == nil {
			results[i] = ClassificationResult{
				Expense: expenses[i],
				Classification: TaxClassification{
					IsDeductible: false,
					Confidence:   0.30,
					Reasoning:    "Could not determine deductibility",
					Source:        "none",
				},
			}
		}
	}

	return results
}

// matchUserMapping checks if an expense matches any user-learned tax deductibility mapping.
func matchUserMapping(expense *pfinancev1.Expense, mappings []*pfinancev1.TaxDeductibilityMapping) *TaxClassification {
	desc := strings.ToLower(expense.Description)
	for _, m := range mappings {
		pattern := strings.ToLower(m.MerchantPattern)
		if strings.Contains(desc, pattern) {
			return &TaxClassification{
				IsDeductible:  true,
				Category:      m.DeductionCategory,
				DeductiblePct: m.DeductiblePercent,
				Confidence:    m.Confidence,
				Reasoning:     "Matched user-learned pattern: " + m.MerchantPattern,
				Source:         "user_mapping",
			}
		}
	}
	return nil
}
