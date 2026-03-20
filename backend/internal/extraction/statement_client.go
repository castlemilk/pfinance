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
)

// StatementParserClient is an HTTP client for the LayoutLMv3 statement parsing service.
type StatementParserClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewStatementParserClient creates a new statement parser client.
func NewStatementParserClient(baseURL string) *StatementParserClient {
	return &StatementParserClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// StatementParseResponse represents the response from the statement parser service.
type StatementParseResponse struct {
	Transactions      []StatementTransaction `json:"transactions"`
	Confidence        float64                `json:"confidence"`
	BankDetected      string                 `json:"bank_detected"`
	PageCount         int                    `json:"page_count"`
	ProcessingTimeMS  int                    `json:"processing_time_ms"`
	NeedsFallback     bool                   `json:"needs_fallback"`
	FallbackReason    string                 `json:"fallback_reason,omitempty"`
	BalanceReconciled bool                   `json:"balance_reconciled"`
	Warnings          []string               `json:"warnings,omitempty"`
}

// StatementTransaction represents a single parsed transaction from the statement parser.
type StatementTransaction struct {
	ID               string             `json:"id"`
	Date             string             `json:"date"`
	Description      string             `json:"description"`
	Amount           float64            `json:"amount"`
	IsDebit          bool               `json:"is_debit"`
	Balance          *float64           `json:"balance,omitempty"`
	Confidence       float64            `json:"confidence"`
	Page             int                `json:"page"`
	FieldConfidences map[string]float64 `json:"field_confidences,omitempty"`
}

// ParseStatement sends a PDF to the LayoutLMv3 statement parser.
func (c *StatementParserClient) ParseStatement(ctx context.Context, pdfBytes []byte, bankHint string) (*StatementParseResponse, error) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	// Add PDF file
	part, err := writer.CreateFormFile("file", "statement.pdf")
	if err != nil {
		return nil, fmt.Errorf("create form file: %w", err)
	}
	if _, err := part.Write(pdfBytes); err != nil {
		return nil, fmt.Errorf("write pdf bytes: %w", err)
	}

	// Add bank hint if provided
	if bankHint != "" {
		if err := writer.WriteField("bank_hint", bankHint); err != nil {
			return nil, fmt.Errorf("write bank hint: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("close multipart writer: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/parse-statement", &body)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("statement parser error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result StatementParseResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// HealthCheck checks if the statement parser service is healthy.
func (c *StatementParserClient) HealthCheck(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/health", nil)
	if err != nil {
		return fmt.Errorf("create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("health check failed: status %d", resp.StatusCode)
	}
	return nil
}

// ToMLTransactions converts statement parser transactions to the common MLTransaction format
// used by the existing extraction pipeline.
func (r *StatementParseResponse) ToMLTransactions() []MLTransaction {
	txns := make([]MLTransaction, len(r.Transactions))
	for i, t := range r.Transactions {
		var fc *MLFieldConfidence
		if t.FieldConfidences != nil {
			fc = &MLFieldConfidence{
				Amount:      t.FieldConfidences["amount"],
				Date:        t.FieldConfidences["date"],
				Description: t.FieldConfidences["description"],
			}
		}
		txns[i] = MLTransaction{
			ID:               t.ID,
			Date:             t.Date,
			Description:      t.Description,
			Amount:           t.Amount,
			IsDebit:          t.IsDebit,
			Confidence:       t.Confidence,
			Page:             t.Page,
			FieldConfidences: fc,
		}
	}
	return txns
}
