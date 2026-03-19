package extraction

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// TaxGeminiClassifier classifies expenses for tax deductibility using Gemini API.
type TaxGeminiClassifier struct {
	apiKey     string
	httpClient *http.Client
	baseURL    string
}

// NewTaxGeminiClassifier creates a new Gemini-based tax classifier.
func NewTaxGeminiClassifier(apiKey string) *TaxGeminiClassifier {
	return &TaxGeminiClassifier{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		baseURL: defaultGeminiBaseURL,
	}
}

// GeminiTaxFieldConfidences represents per-field confidence scores from Gemini.
type GeminiTaxFieldConfidences struct {
	IsDeductible         float64 `json:"is_deductible"`
	ATOCategory          float64 `json:"ato_category"`
	DeductiblePercentage float64 `json:"deductible_percentage"`
}

// GeminiTaxResult represents a single expense classification from Gemini.
type GeminiTaxResult struct {
	ExpenseID            string                     `json:"expense_id"`
	IsDeductible         bool                       `json:"is_deductible"`
	ATOCategory          string                     `json:"ato_category"`
	DeductiblePercentage float64                    `json:"deductible_percentage"`
	Confidence           float64                    `json:"confidence"`
	Reasoning            string                     `json:"reasoning"`
	FieldConfidences     *GeminiTaxFieldConfidences `json:"field_confidences,omitempty"`
}

// GeminiTaxResponse represents the full response from Gemini.
type GeminiTaxResponse struct {
	Results []GeminiTaxResult `json:"results"`
}

// expenseForPrompt is a simplified expense representation for the Gemini prompt.
type expenseForPrompt struct {
	ID          string  `json:"id"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category"`
	Date        string  `json:"date"`
	Tags        string  `json:"tags"`
}

// ClassifyBatchArgs holds optional arguments for ClassifyBatch.
type ClassifyBatchArgs struct {
	UserMappings      []*pfinancev1.TaxDeductibilityMapping
	CorrectionSignals []CorrectionSignal
}

// ClassifyBatch classifies a batch of expenses using Gemini API.
// Processes up to 20 expenses per API call.
func (c *TaxGeminiClassifier) ClassifyBatch(ctx context.Context, expenses []*pfinancev1.Expense, occupation string, userMappings []*pfinancev1.TaxDeductibilityMapping, correctionSignals ...[]CorrectionSignal) ([]TaxClassification, error) {
	if c.apiKey == "" {
		return nil, fmt.Errorf("Gemini API key not configured")
	}
	if len(expenses) == 0 {
		return nil, nil
	}

	// Build simplified expense list for prompt
	var expenseList []expenseForPrompt
	for _, e := range expenses {
		dateStr := ""
		if e.Date != nil {
			dateStr = e.Date.AsTime().Format("2006-01-02")
		}
		amount := e.Amount
		if e.AmountCents != 0 {
			amount = float64(e.AmountCents) / 100.0
		}
		expenseList = append(expenseList, expenseForPrompt{
			ID:          e.Id,
			Description: e.Description,
			Amount:      amount,
			Category:    e.Category.String(),
			Date:        dateStr,
			Tags:        strings.Join(e.Tags, ", "),
		})
	}

	expenseJSON, err := json.Marshal(expenseList)
	if err != nil {
		return nil, fmt.Errorf("marshal expenses: %w", err)
	}

	occupationCtx := ""
	if occupation != "" {
		occupationCtx = fmt.Sprintf("\nThe user's occupation is: %s. Consider this when determining work-relatedness.\n", occupation)
	}

	correctionCtx := ""
	if len(userMappings) > 0 {
		correctionCtx = buildCorrectionContext(userMappings)
	}

	// Add correction history signals to give Gemini context about user's past corrections
	if len(correctionSignals) > 0 && len(correctionSignals[0]) > 0 {
		correctionCtx += buildCorrectionSignalContext(correctionSignals[0])
	}

	prompt := fmt.Sprintf(`You are an Australian tax deduction classifier. Classify each expense for tax deductibility under ATO rules.
%s%s
ATO Deduction Categories:
- D1: Work-related travel (NOT regular commuting)
- D2: Uniform, laundry, dry-cleaning (must be occupation-specific or protective)
- D3: Self-education (must maintain/improve skills for CURRENT employment)
- D4: Other work-related (tools, phone, subscriptions used for work)
- D5: Home office (67c/hr fixed rate or actual cost method)
- D6: Car expenses (85c/km or logbook method, only work trips)
- D10: Cost of managing tax affairs (tax agent fees, accounting software)
- D15: Gifts and donations (must be to DGR-registered organisations, $2+ to claim)
- INCOME_PROTECTION: Income protection insurance premiums
- OTHER: Other deductions not in above categories
- NOT_DEDUCTIBLE: Personal expenses, not claimable

Key rules:
- Personal groceries, dining, entertainment are NOT deductible
- Regular commuting is NOT deductible
- Work phone/internet may be partially deductible (work %% only)
- Home office items may be partially deductible if also used personally
- Education must relate to CURRENT job, not a new career

Classify each expense. Return JSON only:
{"results": [{"expense_id": "...", "is_deductible": true/false, "ato_category": "D1|D2|D3|D4|D5|D6|D10|D15|INCOME_PROTECTION|OTHER|NOT_DEDUCTIBLE", "deductible_percentage": 0.0-1.0, "confidence": 0.0-1.0, "reasoning": "brief explanation", "field_confidences": {"is_deductible": 0.0-1.0, "ato_category": 0.0-1.0, "deductible_percentage": 0.0-1.0}}]}

For field_confidences, provide separate confidence scores for each classification decision:
- is_deductible: how confident you are in the deductibility decision
- ato_category: how confident you are in the specific ATO category
- deductible_percentage: how confident you are in the deductible percentage

Expenses:
%s`, occupationCtx, correctionCtx, string(expenseJSON))

	result, err := c.callGemini(ctx, prompt)
	if err != nil {
		return nil, err
	}

	// Map results back to TaxClassification
	resultMap := make(map[string]GeminiTaxResult)
	for _, r := range result.Results {
		resultMap[r.ExpenseID] = r
	}

	var classifications []TaxClassification
	for _, e := range expenses {
		r, ok := resultMap[e.Id]
		if !ok {
			classifications = append(classifications, TaxClassification{
				IsDeductible: false,
				Confidence:   0.30,
				Reasoning:    "Not classified by AI",
				Source:       "gemini_miss",
			})
			continue
		}

		cat := mapATOCategoryToEnum(r.ATOCategory)
		pct := r.DeductiblePercentage
		if pct <= 0 && r.IsDeductible {
			pct = 1.0
		}

		fc := TaxFieldConfidences{
			IsDeductible:         r.Confidence,
			ATOCategory:          r.Confidence,
			DeductiblePercentage: r.Confidence,
		}
		if r.FieldConfidences != nil {
			fc.IsDeductible = r.FieldConfidences.IsDeductible
			fc.ATOCategory = r.FieldConfidences.ATOCategory
			fc.DeductiblePercentage = r.FieldConfidences.DeductiblePercentage
		}

		classifications = append(classifications, TaxClassification{
			IsDeductible:     r.IsDeductible,
			Category:         cat,
			DeductiblePct:    pct,
			Confidence:       r.Confidence,
			Reasoning:        r.Reasoning,
			Source:           "gemini",
			FieldConfidences: fc,
		})
	}

	return classifications, nil
}

// callGemini calls the Gemini API with a text prompt.
func (c *TaxGeminiClassifier) callGemini(ctx context.Context, prompt string) (*GeminiTaxResponse, error) {
	url := fmt.Sprintf("%s/models/gemini-2.0-flash:generateContent?key=%s", c.baseURL, c.apiKey)

	reqBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":      0.1,
			"maxOutputTokens":  4096,
			"responseMimeType": "application/json",
		},
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Gemini API call failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gemini API error %d: %s", resp.StatusCode, string(respBody))
	}

	// Parse Gemini response structure
	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return nil, fmt.Errorf("parse Gemini response: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("empty Gemini response")
	}

	text := geminiResp.Candidates[0].Content.Parts[0].Text
	// Strip markdown code fences if present
	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")
	text = strings.TrimSpace(text)

	var taxResp GeminiTaxResponse
	if err := json.Unmarshal([]byte(text), &taxResp); err != nil {
		return nil, fmt.Errorf("parse tax classification response: %w (text: %s)", err, text[:min(len(text), 200)])
	}

	return &taxResp, nil
}

// mapATOCategoryToEnum maps an ATO category string to the protobuf enum.
func mapATOCategoryToEnum(cat string) pfinancev1.TaxDeductionCategory {
	switch strings.ToUpper(strings.TrimSpace(cat)) {
	case "D1":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL
	case "D2":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM
	case "D3":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION
	case "D4":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK
	case "D5":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE
	case "D6":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE
	case "D10":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS
	case "D15":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS
	case "INCOME_PROTECTION":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_INCOME_PROTECTION
	case "OTHER":
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER
	default:
		return pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED
	}
}

// buildCorrectionContext builds a prompt section from user's learned tax mappings.
// This gives Gemini context about what the user has previously classified.
func buildCorrectionContext(mappings []*pfinancev1.TaxDeductibilityMapping) string {
	if len(mappings) == 0 {
		return ""
	}

	// Limit to 20 most relevant (highest confidence) mappings to avoid bloating prompt
	limit := 20
	if len(mappings) < limit {
		limit = len(mappings)
	}

	var examples []string
	for i := 0; i < limit; i++ {
		m := mappings[i]
		catStr := mapEnumToATOCategory(m.DeductionCategory)
		pctStr := fmt.Sprintf("%.0f%%", m.DeductiblePercent*100)
		examples = append(examples, fmt.Sprintf("- \"%s\" → %s (%s deductible, confirmed %d times)",
			m.MerchantPattern, catStr, pctStr, m.ConfirmationCount))
	}

	return fmt.Sprintf("\nThe user has previously classified these merchants:\n%s\nUse these as guidance for similar merchants.\n",
		strings.Join(examples, "\n"))
}

// buildCorrectionSignalContext builds a prompt section from aggregated correction signals.
// This tells Gemini about patterns in how the user has corrected past classifications.
func buildCorrectionSignalContext(signals []CorrectionSignal) string {
	if len(signals) == 0 {
		return ""
	}

	limit := 15
	if len(signals) < limit {
		limit = len(signals)
	}

	var examples []string
	for i := 0; i < limit; i++ {
		s := signals[i]
		examples = append(examples, fmt.Sprintf("- \"%s\" was corrected to category %s (%d times, %.0f%% consistent)",
			s.MerchantPattern, s.CorrectedCategory.String(), s.CorrectionCount, s.Consistency*100))
	}

	return fmt.Sprintf("\nThe user has frequently corrected these merchants' categories:\n%s\nConsider these correction patterns when classifying similar merchants.\n",
		strings.Join(examples, "\n"))
}

// mapEnumToATOCategory converts a TaxDeductionCategory enum to its ATO code string.
func mapEnumToATOCategory(cat pfinancev1.TaxDeductionCategory) string {
	switch cat {
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL:
		return "D1"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNIFORM:
		return "D2"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION:
		return "D3"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK:
		return "D4"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE:
		return "D5"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE:
		return "D6"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS:
		return "D10"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS:
		return "D15"
	case pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_INCOME_PROTECTION:
		return "INCOME_PROTECTION"
	default:
		return "OTHER"
	}
}
