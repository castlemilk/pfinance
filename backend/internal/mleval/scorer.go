package mleval

import (
	"math"
	"strings"
)

// AccuracyReport holds accuracy metrics for an eval run compared to ground truth.
type AccuracyReport struct {
	EvaluatorName        string             `json:"evaluator_name"`
	FilesWithGroundTruth int                `json:"files_with_ground_truth"`
	FilesEvaluated       int                `json:"files_evaluated"`
	Extraction           ExtractionAccuracy `json:"extraction"`
	Deductibility        ClassAccuracy      `json:"deductibility"`
	TaxCategory          ClassAccuracy      `json:"tax_category"`
	AmountAccuracy       AmountAccuracy     `json:"amount_accuracy"`
	PerFile              []*FileAccuracy    `json:"per_file"`
}

// ExtractionAccuracy measures how well transactions were extracted.
type ExtractionAccuracy struct {
	ExpectedTotal  int     `json:"expected_total"`
	ExtractedTotal int     `json:"extracted_total"`
	MatchedCount   int     `json:"matched_count"`
	Precision      float64 `json:"precision"`
	Recall         float64 `json:"recall"`
	F1             float64 `json:"f1"`
}

// ClassAccuracy measures classification accuracy (deductibility or tax category).
type ClassAccuracy struct {
	Total     int     `json:"total"`
	Correct   int     `json:"correct"`
	Incorrect int     `json:"incorrect"`
	Accuracy  float64 `json:"accuracy"`
}

// AmountAccuracy measures how close extracted amounts are to expected.
type AmountAccuracy struct {
	Total        int     `json:"total"`
	ExactMatches int     `json:"exact_matches"`
	CloseMatches int     `json:"close_matches"`
	MeanAbsError float64 `json:"mean_abs_error"`
	MeanPctError float64 `json:"mean_pct_error"`
}

// FileAccuracy holds per-file accuracy breakdown.
type FileAccuracy struct {
	Filename      string         `json:"filename"`
	RelativePath  string         `json:"relative_path"`
	Expected      int            `json:"expected_transactions"`
	Extracted     int            `json:"extracted_transactions"`
	Matched       int            `json:"matched"`
	Deductibility *ClassAccuracy `json:"deductibility,omitempty"`
	TaxCategory   *ClassAccuracy `json:"tax_category,omitempty"`
}

// ScoreRun compares an eval run's results against ground truth and produces accuracy metrics.
func ScoreRun(run *EvalRun, gtSet *GroundTruthSet) *AccuracyReport {
	report := &AccuracyReport{
		EvaluatorName: run.EvaluatorName,
	}

	for _, fr := range run.FileResults {
		if fr.Error != "" {
			continue
		}

		gt := gtSet.Lookup(fr.RelativePath)
		if gt == nil {
			continue
		}
		report.FilesWithGroundTruth++
		report.FilesEvaluated++

		matches := MatchTransactions(fr.TaxResults, gt.Transactions)

		fileAcc := &FileAccuracy{
			Filename:     fr.Filename,
			RelativePath: fr.RelativePath,
			Expected:     len(gt.Transactions),
			Extracted:    len(fr.TaxResults),
			Matched:      len(matches),
		}

		report.Extraction.ExpectedTotal += len(gt.Transactions)
		report.Extraction.ExtractedTotal += len(fr.TaxResults)
		report.Extraction.MatchedCount += len(matches)

		fileDeduc := &ClassAccuracy{}
		fileTaxCat := &ClassAccuracy{}

		for _, m := range matches {
			actual := fr.TaxResults[m.ActualIdx]
			expected := gt.Transactions[m.ExpectedIdx]

			fileDeduc.Total++
			report.Deductibility.Total++
			if actual.IsDeductible == expected.IsDeductible {
				fileDeduc.Correct++
				report.Deductibility.Correct++
			} else {
				fileDeduc.Incorrect++
				report.Deductibility.Incorrect++
			}

			if expected.TaxCategory != "" && expected.IsDeductible {
				fileTaxCat.Total++
				report.TaxCategory.Total++
				actualCode := ExtractATOCode(actual.TaxCategory)
				if actualCode == expected.TaxCategory {
					fileTaxCat.Correct++
					report.TaxCategory.Correct++
				} else {
					fileTaxCat.Incorrect++
					report.TaxCategory.Incorrect++
				}
			}

			report.AmountAccuracy.Total++
			diff := math.Abs(actual.Amount - expected.Amount)
			if diff <= 0.01 {
				report.AmountAccuracy.ExactMatches++
			}
			if expected.Amount > 0 {
				pctDiff := diff / expected.Amount
				if pctDiff <= 0.05 {
					report.AmountAccuracy.CloseMatches++
				}
				report.AmountAccuracy.MeanPctError += pctDiff
			}
			report.AmountAccuracy.MeanAbsError += diff
		}

		if fileDeduc.Total > 0 {
			fileDeduc.Accuracy = float64(fileDeduc.Correct) / float64(fileDeduc.Total)
			fileAcc.Deductibility = fileDeduc
		}
		if fileTaxCat.Total > 0 {
			fileTaxCat.Accuracy = float64(fileTaxCat.Correct) / float64(fileTaxCat.Total)
			fileAcc.TaxCategory = fileTaxCat
		}

		report.PerFile = append(report.PerFile, fileAcc)
	}

	if report.Extraction.ExtractedTotal > 0 {
		report.Extraction.Precision = float64(report.Extraction.MatchedCount) / float64(report.Extraction.ExtractedTotal)
	}
	if report.Extraction.ExpectedTotal > 0 {
		report.Extraction.Recall = float64(report.Extraction.MatchedCount) / float64(report.Extraction.ExpectedTotal)
	}
	if report.Extraction.Precision+report.Extraction.Recall > 0 {
		report.Extraction.F1 = 2 * report.Extraction.Precision * report.Extraction.Recall /
			(report.Extraction.Precision + report.Extraction.Recall)
	}

	if report.Deductibility.Total > 0 {
		report.Deductibility.Accuracy = float64(report.Deductibility.Correct) / float64(report.Deductibility.Total)
	}
	if report.TaxCategory.Total > 0 {
		report.TaxCategory.Accuracy = float64(report.TaxCategory.Correct) / float64(report.TaxCategory.Total)
	}
	if report.AmountAccuracy.Total > 0 {
		report.AmountAccuracy.MeanAbsError /= float64(report.AmountAccuracy.Total)
		report.AmountAccuracy.MeanPctError /= float64(report.AmountAccuracy.Total)
	}

	return report
}

// TxnMatch represents a matched pair of actual and expected transactions.
type TxnMatch struct {
	ActualIdx   int
	ExpectedIdx int
	Score       float64
}

// MatchTransactions finds the best matching between actual and expected transactions
// using a greedy approach based on description similarity + amount closeness.
func MatchTransactions(actual []*TaxResult, expected []*ExpectedTxn) []TxnMatch {
	if len(actual) == 0 || len(expected) == 0 {
		return nil
	}

	type candidate struct {
		actualIdx   int
		expectedIdx int
		score       float64
	}
	var candidates []candidate

	for ai, a := range actual {
		for ei, e := range expected {
			score := TxnSimilarity(a, e)
			if score >= 0.3 {
				candidates = append(candidates, candidate{ai, ei, score})
			}
		}
	}

	// Sort by score descending
	for i := 0; i < len(candidates); i++ {
		for j := i + 1; j < len(candidates); j++ {
			if candidates[j].score > candidates[i].score {
				candidates[i], candidates[j] = candidates[j], candidates[i]
			}
		}
	}

	usedActual := make(map[int]bool)
	usedExpected := make(map[int]bool)
	var matches []TxnMatch

	for _, c := range candidates {
		if usedActual[c.actualIdx] || usedExpected[c.expectedIdx] {
			continue
		}
		matches = append(matches, TxnMatch{c.actualIdx, c.expectedIdx, c.score})
		usedActual[c.actualIdx] = true
		usedExpected[c.expectedIdx] = true
	}

	return matches
}

// TxnSimilarity scores how similar an actual result is to an expected transaction.
func TxnSimilarity(actual *TaxResult, expected *ExpectedTxn) float64 {
	amountScore := 0.0
	if expected.Amount > 0 {
		diff := math.Abs(actual.Amount-expected.Amount) / expected.Amount
		if diff <= 0.01 {
			amountScore = 0.5
		} else if diff <= 0.05 {
			amountScore = 0.4
		} else if diff <= 0.10 {
			amountScore = 0.2
		}
	} else if actual.Amount == expected.Amount {
		amountScore = 0.5
	}

	descScore := DescriptionSimilarity(actual.Description, expected.Description) * 0.5

	return amountScore + descScore
}

// DescriptionSimilarity compares two transaction descriptions using Jaccard similarity.
func DescriptionSimilarity(a, b string) float64 {
	tokensA := Tokenize(a)
	tokensB := Tokenize(b)

	if len(tokensA) == 0 && len(tokensB) == 0 {
		return 1.0
	}
	if len(tokensA) == 0 || len(tokensB) == 0 {
		return 0.0
	}

	normA := strings.ToLower(strings.Join(tokensA, " "))
	normB := strings.ToLower(strings.Join(tokensB, " "))
	if strings.Contains(normA, normB) || strings.Contains(normB, normA) {
		return 0.9
	}

	setA := make(map[string]bool)
	for _, t := range tokensA {
		setA[t] = true
	}
	setB := make(map[string]bool)
	for _, t := range tokensB {
		setB[t] = true
	}

	intersection := 0
	for t := range setA {
		if setB[t] {
			intersection++
		}
	}

	union := len(setA) + len(setB) - intersection
	if union == 0 {
		return 0.0
	}

	return float64(intersection) / float64(union)
}

// Tokenize splits a string into lowercase tokens, removing common noise.
func Tokenize(s string) []string {
	s = strings.ToLower(s)
	for _, sep := range []string{"-", "_", "/", ".", ",", "(", ")", "*"} {
		s = strings.ReplaceAll(s, sep, " ")
	}
	var tokens []string
	for _, w := range strings.Fields(s) {
		if len(w) > 1 {
			tokens = append(tokens, w)
		}
	}
	return tokens
}

// ExtractATOCode pulls the ATO code from a tax category string like "D5 - Working from home".
func ExtractATOCode(taxCategory string) string {
	parts := strings.SplitN(taxCategory, " - ", 2)
	if len(parts) > 0 {
		return strings.TrimSpace(parts[0])
	}
	return taxCategory
}
