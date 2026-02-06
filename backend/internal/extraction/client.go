// Package extraction provides document extraction capabilities using ML models.
package extraction

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// MLClient is an HTTP client for the Python ML extraction service.
type MLClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewMLClient creates a new ML service client.
func NewMLClient(baseURL string) *MLClient {
	return &MLClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 120 * time.Second, // Long timeout for ML processing
		},
	}
}

// MLExtractionResponse represents the response from the ML service.
// Handles both legacy format and Modal API format.
type MLExtractionResponse struct {
	Transactions      []MLTransaction `json:"transactions"`
	Errors            []MLError       `json:"errors,omitempty"`
	OverallConfidence float64         `json:"overall_confidence"`
	ModelUsed         string          `json:"model_used"`
	Model             string          `json:"model"` // Modal API format
	GPU               string          `json:"gpu"`   // Modal API format
	ProcessingTimeMS  int             `json:"processing_time_ms"`
	Warnings          []string        `json:"warnings"`
	DocumentType      string          `json:"document_type"`
	DocType           string          `json:"doc_type"` // Modal API format
	PageCount         int             `json:"page_count"`
}

// MLError represents an extraction error from the ML service.
type MLError struct {
	Error string `json:"error"`
	Raw   string `json:"raw,omitempty"`
	Page  int    `json:"page,omitempty"`
}

// MLTransaction represents a transaction from the ML service.
// Handles multiple field name formats from different extraction types.
type MLTransaction struct {
	ID                 string  `json:"id"`
	Date               string  `json:"date"`
	Description        string  `json:"description"`
	Merchant           string  `json:"merchant"` // Receipt format
	NormalizedMerchant string  `json:"normalized_merchant"`
	Amount             float64 `json:"amount"`
	Total              float64 `json:"total"` // Receipt format
	SuggestedCategory  string  `json:"suggested_category"`
	Confidence         float64 `json:"confidence"`
	IsDebit            bool    `json:"is_debit"`
	Reference          string  `json:"reference,omitempty"`
	Quantity           int     `json:"quantity,omitempty"` // Line item format
	Page               int     `json:"page,omitempty"`
}

// GetDescription returns the description, handling different field names.
func (t *MLTransaction) GetDescription() string {
	if t.Description != "" {
		return t.Description
	}
	return t.Merchant
}

// GetAmount returns the amount, handling different field names.
func (t *MLTransaction) GetAmount() float64 {
	if t.Amount != 0 {
		return t.Amount
	}
	return t.Total
}

// GetModelUsed returns the model name from either format.
func (r *MLExtractionResponse) GetModelUsed() string {
	if r.ModelUsed != "" {
		return r.ModelUsed
	}
	return r.Model
}

// GetDocumentType returns the document type from either format.
func (r *MLExtractionResponse) GetDocumentType() string {
	if r.DocumentType != "" {
		return r.DocumentType
	}
	return r.DocType
}

// MLHealthResponse represents the health check response.
type MLHealthResponse struct {
	Status      string `json:"status"`
	ModelLoaded bool   `json:"model_loaded"`
	ModelName   string `json:"model_name"`
	Version     string `json:"version"`
}

// HealthCheck checks if the ML service is healthy.
func (c *MLClient) HealthCheck(ctx context.Context) (*MLHealthResponse, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("health check failed: status %d, body: %s", resp.StatusCode, string(body))
	}

	var health MLHealthResponse
	if err := json.NewDecoder(resp.Body).Decode(&health); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &health, nil
}

// Extract sends a document to the ML service for extraction.
func (c *MLClient) Extract(ctx context.Context, data []byte, filename string, docType pfinancev1.DocumentType) (*MLExtractionResponse, error) {
	// Create multipart form
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	// Add file
	part, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := part.Write(data); err != nil {
		return nil, fmt.Errorf("write file data: %w", err)
	}

	// Add document type
	docTypeStr := documentTypeToString(docType)
	if err := writer.WriteField("document_type", docTypeStr); err != nil {
		return nil, fmt.Errorf("write document_type: %w", err)
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close writer: %w", err)
	}

	// Create request
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/extract", &buf)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Execute request
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("extraction failed: status %d, body: %s", resp.StatusCode, string(body))
	}

	var result MLExtractionResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// ToExtractionResult converts an ML response to a proto ExtractionResult.
func (r *MLExtractionResponse) ToExtractionResult() *pfinancev1.ExtractionResult {
	transactions := make([]*pfinancev1.ExtractedTransaction, len(r.Transactions))
	for i, tx := range r.Transactions {
		transactions[i] = tx.ToProto()
	}

	// Collect warnings from errors
	warnings := r.Warnings
	for _, e := range r.Errors {
		if e.Error != "" {
			warnings = append(warnings, fmt.Sprintf("Page %d: %s", e.Page, e.Error))
		}
	}

	// Use helper methods to handle both response formats
	confidence := r.OverallConfidence
	if confidence == 0 && len(transactions) > 0 {
		confidence = 0.9 // Default confidence if not provided
	}

	return &pfinancev1.ExtractionResult{
		Transactions:      transactions,
		OverallConfidence: confidence,
		ModelUsed:         r.GetModelUsed(),
		ProcessingTimeMs:  int32(r.ProcessingTimeMS),
		Warnings:          warnings,
		DocumentType:      stringToDocumentType(r.GetDocumentType()),
		PageCount:         int32(r.PageCount),
	}
}

// ToProto converts an ML transaction to a proto ExtractedTransaction.
func (tx *MLTransaction) ToProto() *pfinancev1.ExtractedTransaction {
	description := tx.GetDescription()
	amount := tx.GetAmount()

	// Determine if this is a debit based on amount sign or explicit flag
	isDebit := tx.IsDebit
	if amount < 0 {
		isDebit = true
		amount = -amount // Store as positive
	} else if amount > 0 && !tx.IsDebit {
		// For receipts, positive amounts are typically debits
		isDebit = true
	}

	// Use existing confidence or default
	confidence := tx.Confidence
	if confidence == 0 {
		confidence = 0.9
	}

	return &pfinancev1.ExtractedTransaction{
		Id:                 tx.ID,
		Date:               tx.Date,
		Description:        description,
		NormalizedMerchant: tx.NormalizedMerchant,
		Amount:             amount,
		SuggestedCategory:  stringToCategory(tx.SuggestedCategory),
		Confidence:         confidence,
		IsDebit:            isDebit,
		Reference:          tx.Reference,
	}
}

func documentTypeToString(dt pfinancev1.DocumentType) string {
	switch dt {
	case pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT:
		return "receipt"
	case pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT:
		return "bank_statement"
	case pfinancev1.DocumentType_DOCUMENT_TYPE_INVOICE:
		return "invoice"
	default:
		return "receipt"
	}
}

func stringToDocumentType(s string) pfinancev1.DocumentType {
	switch s {
	case "receipt":
		return pfinancev1.DocumentType_DOCUMENT_TYPE_RECEIPT
	case "bank_statement":
		return pfinancev1.DocumentType_DOCUMENT_TYPE_BANK_STATEMENT
	case "invoice":
		return pfinancev1.DocumentType_DOCUMENT_TYPE_INVOICE
	default:
		return pfinancev1.DocumentType_DOCUMENT_TYPE_UNSPECIFIED
	}
}

func stringToCategory(s string) pfinancev1.ExpenseCategory {
	switch s {
	case "Food":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD
	case "Housing":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING
	case "Transportation":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION
	case "Entertainment":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT
	case "Healthcare":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE
	case "Utilities":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES
	case "Shopping":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING
	case "Education":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION
	case "Travel":
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL
	default:
		return pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER
	}
}
