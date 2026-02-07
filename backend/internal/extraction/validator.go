// Package extraction provides document extraction capabilities using ML models.
package extraction

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

const defaultGeminiBaseURL = "https://generativelanguage.googleapis.com/v1beta"

// ValidationService validates ML extractions using commercial APIs.
type ValidationService struct {
	geminiAPIKey  string
	mistralAPIKey string
	httpClient    *http.Client
	geminiBaseURL string
	RetryConfig   RetryConfig
}

// ValidationResult contains the result of validating an extraction.
type ValidationResult struct {
	Accuracy      float64
	Discrepancies []Discrepancy
	ValidatedBy   string
}

// Discrepancy represents a difference found during validation.
type Discrepancy struct {
	Field          string
	ExtractedValue string
	ValidatedValue string
	TransactionID  string
}

// NewValidationService creates a new validation service.
func NewValidationService(geminiAPIKey, mistralAPIKey string) *ValidationService {
	return &ValidationService{
		geminiAPIKey:  geminiAPIKey,
		mistralAPIKey: mistralAPIKey,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
		geminiBaseURL: defaultGeminiBaseURL,
		RetryConfig:   DefaultGeminiRetryConfig,
	}
}

// ValidateExtraction validates ML extraction results using Gemini API.
func (v *ValidationService) ValidateExtraction(
	ctx context.Context,
	documentData []byte,
	extracted *pfinancev1.ExtractionResult,
) (*ValidationResult, error) {
	if v.geminiAPIKey == "" {
		return nil, fmt.Errorf("Gemini API key not configured")
	}

	// Use Gemini to extract the same document
	geminiResult, err := v.extractWithGeminiRetry(ctx, documentData)
	if err != nil {
		return nil, fmt.Errorf("Gemini extraction failed: %w", err)
	}

	// Compare results
	return v.compareResults(extracted, geminiResult), nil
}

// GeminiTransaction represents a transaction extracted by Gemini.
type GeminiTransaction struct {
	Date        string  `json:"date"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Category    string  `json:"category,omitempty"`
	Reference   string  `json:"reference,omitempty"`
}

// GeminiResponse represents the response from Gemini API.
type GeminiResponse struct {
	Transactions []GeminiTransaction `json:"transactions"`
}

// extractWithGeminiRetry wraps extractWithGemini with retry logic.
func (v *ValidationService) extractWithGeminiRetry(ctx context.Context, documentData []byte) (*GeminiResponse, error) {
	return WithRetry(ctx, v.RetryConfig, func(ctx context.Context) (*GeminiResponse, error) {
		return v.extractWithGemini(ctx, documentData)
	})
}

// detectMimeType returns the MIME type based on document data.
func detectMimeType(data []byte) string {
	// PDF magic bytes: %PDF
	if len(data) >= 4 && string(data[:4]) == "%PDF" {
		return "application/pdf"
	}
	// PNG magic bytes
	if len(data) >= 8 && string(data[:4]) == "\x89PNG" {
		return "image/png"
	}
	// Default to JPEG
	return "image/jpeg"
}

// CountPDFPagesFromData returns a rough page count from PDF data.
// Exported for use by extraction handlers to determine async processing path.
func CountPDFPagesFromData(data []byte) int {
	return countPDFPages(data)
}

// countPDFPages returns a rough page count from PDF data.
func countPDFPages(data []byte) int {
	// Simple heuristic: count "/Type /Page" occurrences (excluding /Pages)
	content := string(data)
	count := 0
	idx := 0
	for {
		pos := strings.Index(content[idx:], "/Type /Page")
		if pos == -1 {
			break
		}
		absPos := idx + pos
		// Make sure it's /Page and not /Pages
		afterPage := absPos + len("/Type /Page")
		if afterPage < len(content) && content[afterPage] != 's' {
			count++
		}
		idx = absPos + 1
	}
	if count == 0 {
		count = 1
	}
	return count
}

func (v *ValidationService) extractWithGemini(ctx context.Context, documentData []byte) (*GeminiResponse, error) {
	// Encode document as base64
	encoded := base64.StdEncoding.EncodeToString(documentData)

	// Detect mime type from document data
	mimeType := detectMimeType(documentData)

	// Build request for Gemini API
	prompt := `Extract all expense/debit transactions from this document.
Return ONLY a valid JSON object with this structure:
{
  "transactions": [
    {"date": "YYYY-MM-DD", "description": "merchant name", "amount": 0.00, "category": "Food"}
  ]
}
Rules:
- Only include debit transactions (money going out)
- Express amounts as positive numbers
- Assign each transaction a category from: Food, Housing, Transportation, Entertainment, Healthcare, Utilities, Shopping, Education, Travel, Other
- Use the merchant name and transaction context to determine the most appropriate category`

	requestBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
					{
						"inline_data": map[string]string{
							"mime_type": mimeType,
							"data":      encoded,
						},
					},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.1,
			"maxOutputTokens": 4096,
		},
	}

	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Make request to Gemini API
	url := fmt.Sprintf("%s/models/gemini-1.5-flash:generateContent?key=%s", v.geminiBaseURL, v.geminiAPIKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, classifyGeminiError(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, classifyGeminiHTTPError(resp.StatusCode, string(body))
	}

	// Parse Gemini response
	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no response from Gemini")
	}

	text := geminiResp.Candidates[0].Content.Parts[0].Text

	// Extract JSON from response
	var result GeminiResponse
	if err := extractJSON(text, &result); err != nil {
		return nil, fmt.Errorf("parse Gemini result: %w", err)
	}

	return &result, nil
}

// classifyGeminiError converts Gemini network errors to ExtractionErrors.
func classifyGeminiError(err error) *ExtractionError {
	return &ExtractionError{
		Code:      ErrGeminiUnavailable,
		Message:   "Gemini API request failed",
		Method:    "gemini",
		Retryable: true,
		Cause:     err,
	}
}

// classifyGeminiHTTPError converts Gemini HTTP errors to ExtractionErrors.
func classifyGeminiHTTPError(statusCode int, body string) *ExtractionError {
	if statusCode == http.StatusTooManyRequests {
		return &ExtractionError{
			Code:      ErrGeminiRateLimited,
			Message:   "Gemini API rate limited",
			Method:    "gemini",
			Retryable: true,
		}
	}
	return &ExtractionError{
		Code:      ErrGeminiUnavailable,
		Message:   fmt.Sprintf("Gemini API error (HTTP %d): %s", statusCode, body),
		Method:    "gemini",
		Retryable: statusCode >= 500,
	}
}

func (v *ValidationService) compareResults(
	extracted *pfinancev1.ExtractionResult,
	validated *GeminiResponse,
) *ValidationResult {
	result := &ValidationResult{
		ValidatedBy: "gemini-1.5-flash",
	}

	if len(extracted.Transactions) == 0 && len(validated.Transactions) == 0 {
		result.Accuracy = 1.0
		return result
	}

	// Compare transaction counts
	countDiff := math.Abs(float64(len(extracted.Transactions) - len(validated.Transactions)))
	maxCount := math.Max(float64(len(extracted.Transactions)), float64(len(validated.Transactions)))
	if maxCount == 0 {
		maxCount = 1
	}

	// Simple accuracy based on count match and amount match
	countAccuracy := 1.0 - (countDiff / maxCount)

	// Compare amounts for matching transactions
	var amountMatches int
	for _, ext := range extracted.Transactions {
		for _, val := range validated.Transactions {
			// Consider a match if amounts are within 1% or $0.10
			amountDiff := math.Abs(ext.Amount - val.Amount)
			if amountDiff < 0.10 || amountDiff/ext.Amount < 0.01 {
				amountMatches++
				break
			} else {
				// Record discrepancy
				result.Discrepancies = append(result.Discrepancies, Discrepancy{
					Field:          "amount",
					ExtractedValue: fmt.Sprintf("%.2f", ext.Amount),
					ValidatedValue: fmt.Sprintf("%.2f", val.Amount),
					TransactionID:  ext.Id,
				})
			}
		}
	}

	amountAccuracy := 0.0
	if len(extracted.Transactions) > 0 {
		amountAccuracy = float64(amountMatches) / float64(len(extracted.Transactions))
	}

	// Weighted accuracy
	result.Accuracy = (countAccuracy * 0.3) + (amountAccuracy * 0.7)

	return result
}

// extractJSON extracts a JSON object from a text response.
func extractJSON(text string, v interface{}) error {
	// Find JSON in response
	start := -1
	end := -1
	braceCount := 0

	for i, c := range text {
		if c == '{' {
			if start == -1 {
				start = i
			}
			braceCount++
		} else if c == '}' {
			braceCount--
			if braceCount == 0 && start != -1 {
				end = i + 1
				break
			}
		}
	}

	if start == -1 || end == -1 {
		return fmt.Errorf("no JSON object found in response")
	}

	jsonStr := text[start:end]
	return json.Unmarshal([]byte(jsonStr), v)
}

// ExtractWithGemini extracts transactions from a document using Gemini API.
func (v *ValidationService) ExtractWithGemini(
	ctx context.Context,
	documentData []byte,
	docType pfinancev1.DocumentType,
) (*pfinancev1.ExtractionResult, error) {
	if v.geminiAPIKey == "" {
		return nil, fmt.Errorf("Gemini API key not configured")
	}

	startTime := time.Now()

	geminiResult, err := v.extractWithGeminiRetry(ctx, documentData)
	if err != nil {
		return nil, err
	}

	processingTime := int32(time.Since(startTime).Milliseconds())

	// Detect actual page count for PDFs
	pageCount := int32(1)
	if detectMimeType(documentData) == "application/pdf" {
		pageCount = int32(countPDFPages(documentData))
	}

	// Convert to proto result
	transactions := make([]*pfinancev1.ExtractedTransaction, 0, len(geminiResult.Transactions))
	for i, tx := range geminiResult.Transactions {
		// Normalize merchant name
		info := NormalizeMerchant(tx.Description)

		// Use Gemini's category if provided, otherwise use normalizer's category
		category := parseCategory(tx.Category)
		if category == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED ||
			category == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER {
			if info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER {
				category = info.Category
			}
		}

		// Compute per-field confidence for Gemini
		fc := &pfinancev1.FieldConfidence{
			Amount:      0.95,
			Date:        0.90,
			Description: 0.90,
			Merchant:    info.Confidence,
			Category:    0.85,
		}
		// If date is missing, lower confidence
		if tx.Date == "" {
			fc.Date = 0.5
		}

		transactions = append(transactions, &pfinancev1.ExtractedTransaction{
			Id:                 fmt.Sprintf("gemini-%d", i+1),
			Date:               tx.Date,
			Description:        tx.Description,
			NormalizedMerchant: info.Name,
			Amount:             tx.Amount,
			SuggestedCategory:  category,
			Confidence:         0.9,
			IsDebit:            true,
			Reference:          tx.Reference,
			FieldConfidences:   fc,
		})
	}

	return &pfinancev1.ExtractionResult{
		Transactions:      transactions,
		OverallConfidence: 0.9,
		ModelUsed:         "gemini-1.5-flash",
		ProcessingTimeMs:  processingTime,
		DocumentType:      docType,
		PageCount:         pageCount,
		MethodUsed:        pfinancev1.ExtractionMethod_EXTRACTION_METHOD_GEMINI,
	}, nil
}

// IsGeminiAvailable returns true if Gemini API is configured.
func (v *ValidationService) IsGeminiAvailable() bool {
	return v.geminiAPIKey != ""
}

// ParsedTextExpense represents a parsed expense from natural language text.
type ParsedTextExpense struct {
	Description string   `json:"description"`
	Amount      float64  `json:"amount"`
	Category    string   `json:"category"`
	Frequency   string   `json:"frequency,omitempty"`
	Date        string   `json:"date,omitempty"`
	SplitWith   []string `json:"split_with,omitempty"`
	Confidence  float64  `json:"confidence"`
	Reasoning   string   `json:"reasoning"`
}

// ParsedTextResponse represents the response from text parsing.
type ParsedTextResponse struct {
	Expenses []ParsedTextExpense `json:"expenses"`
	Success  bool                `json:"success"`
	Error    string              `json:"error,omitempty"`
}

// ParseExpenseText parses natural language text into structured expense data using Gemini Flash.
func (v *ValidationService) ParseExpenseText(ctx context.Context, text string) (*ParsedTextResponse, error) {
	if v.geminiAPIKey == "" {
		return nil, fmt.Errorf("Gemini API key not configured")
	}

	// Build the prompt for Gemini Flash
	prompt := fmt.Sprintf(`Parse this expense description into structured data. Today's date is %s.

Input: "%s"

Return ONLY a valid JSON object with this exact structure:
{
  "expenses": [
    {
      "description": "merchant or item name (clean, title case)",
      "amount": 0.00,
      "category": "Food|Housing|Transportation|Entertainment|Healthcare|Utilities|Shopping|Education|Travel|Other",
      "frequency": "once|weekly|fortnightly|monthly|annually",
      "date": "YYYY-MM-DD or null if not mentioned",
      "split_with": ["name1", "name2"] or [],
      "confidence": 0.0 to 1.0,
      "reasoning": "brief explanation of parsing"
    }
  ],
  "success": true
}

CATEGORY RULES (be specific!):
- Food: restaurants, cafes, coffee shops, groceries, supermarkets, fast food, food delivery (Uber Eats, DoorDash), bars
- Transportation: Uber/Lyft rides, taxis, fuel/petrol/gas, parking, tolls, public transport, car services
- Entertainment: Netflix, Spotify, movies, concerts, games, streaming services, subscriptions for fun
- Shopping: Amazon, retail stores, clothing, electronics, household items, general merchandise
- Healthcare: pharmacy, doctor, medical, dental, hospital, health insurance
- Utilities: phone, internet, electricity, water, gas (home), mobile plans
- Housing: rent, mortgage, home repairs, furniture
- Education: courses, tuition, books, school supplies
- Travel: hotels, flights, Airbnb, vacation expenses
- Other: only use if nothing else fits

FREQUENCY RULES:
- Default is "once" (one-time purchase) unless explicitly stated otherwise
- Only use "monthly", "weekly", "annually" if the user mentions it (e.g., "monthly Netflix", "weekly groceries")
- Keywords: "monthly", "every month", "subscription" -> monthly
- Keywords: "weekly", "every week" -> weekly
- Keywords: "yearly", "annual", "per year" -> annually

OTHER RULES:
- Extract the amount (look for $, numbers with decimals)
- Clean up the description to a nice merchant/item name (title case)
- Parse relative dates: "yesterday" = yesterday's date, "last monday" = most recent Monday, etc.
- Detect split mentions ("split with John", "share with Mary", "halves with Sam")
- If multiple expenses mentioned ("coffee $5 and lunch $15"), return multiple items
- Confidence: 1.0 = very clear, 0.7 = good guess, 0.5 = uncertain
- If parsing fails completely, set success to false with an error message`,
		time.Now().Format("2006-01-02"), text)

	requestBody := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.1,
			"maxOutputTokens": 1024,
		},
	}

	jsonBody, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Use Gemini Flash for speed
	url := fmt.Sprintf("%s/models/gemini-1.5-flash:generateContent?key=%s", v.geminiBaseURL, v.geminiAPIKey)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("Gemini API error: status %d, body: %s", resp.StatusCode, string(body))
	}

	// Parse Gemini response
	var geminiResp struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&geminiResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if len(geminiResp.Candidates) == 0 || len(geminiResp.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("no response from Gemini")
	}

	responseText := geminiResp.Candidates[0].Content.Parts[0].Text

	// Extract JSON from response
	var result ParsedTextResponse
	if err := extractJSON(responseText, &result); err != nil {
		return nil, fmt.Errorf("parse Gemini result: %w", err)
	}

	return &result, nil
}

// parseCategory converts a category string to the proto enum.
func parseCategory(category string) pfinancev1.ExpenseCategory {
	switch strings.ToLower(strings.TrimSpace(category)) {
	case "food", "groceries", "restaurant", "dining":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD
	case "housing", "rent", "mortgage":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING
	case "transportation", "transport", "fuel", "gas", "parking":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION
	case "entertainment", "movies", "games", "streaming":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT
	case "healthcare", "health", "medical", "pharmacy":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE
	case "utilities", "electricity", "water", "internet", "phone":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES
	case "shopping", "retail", "clothing", "electronics":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING
	case "education", "school", "tuition", "courses":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION
	case "travel", "hotel", "flight", "vacation":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL
	case "other":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER
	default:
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED
	}
}
