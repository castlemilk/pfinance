// Package extraction provides ML client methods for smart capabilities:
// recurring transaction detection, spending anomaly detection, and spending forecasting.
package extraction

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// SmartClient wraps MLClient with methods for the smart capability endpoints.
type SmartClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewSmartClient creates a new smart capabilities ML client.
func NewSmartClient(baseURL string) *SmartClient {
	return &SmartClient{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// --- Recurring Detection ---

// RecurringRequest is the request payload for /v1/detect-recurring.
type RecurringRequest struct {
	UserID       string             `json:"user_id"`
	Transactions []RecurringInputTx `json:"transactions"`
	ForceRefresh bool               `json:"force_refresh"`
}

// RecurringInputTx is a simplified transaction sent to the ML service.
type RecurringInputTx struct {
	ID          string  `json:"id"`
	Date        string  `json:"date"` // YYYY-MM-DD
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	IsDebit     bool    `json:"is_debit"`
	Category    string  `json:"category"`
}

// RecurringResponse is the response from /v1/detect-recurring.
type RecurringResponse struct {
	Patterns         []RecurringPattern `json:"patterns"`
	TxCountAnalyzed  int                `json:"transaction_count_analyzed"`
	ProcessingTimeMS int                `json:"processing_time_ms"`
}

// RecurringPattern is a single detected recurring pattern from the ML service.
type RecurringPattern struct {
	ID               string   `json:"id"`
	Description      string   `json:"description"`
	Category         string   `json:"category"`
	RecurrenceType   string   `json:"recurrence_type"` // subscription/salary/rent/utility/insurance/other
	Period           string   `json:"period"`          // weekly/fortnightly/monthly/quarterly/yearly
	MedianAmount     float64  `json:"median_amount"`
	AmountTrend      float64  `json:"amount_trend"`
	IsFixedAmount    bool     `json:"is_fixed_amount"`
	NextExpectedDate string   `json:"next_expected_date"` // YYYY-MM-DD
	LastSeenDate     string   `json:"last_seen_date"`     // YYYY-MM-DD
	Confidence       float32  `json:"confidence"`
	AnomalyFlag      bool     `json:"anomaly_flag"`
	TransactionIDs   []string `json:"transaction_ids"`
}

// DetectRecurring calls the ML service recurring detection endpoint.
func (c *SmartClient) DetectRecurring(ctx context.Context, req *RecurringRequest) (*RecurringResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/detect-recurring", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ML service error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result RecurringResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// --- Anomaly Detection ---

// AnomalyRequest is the request payload for /v1/detect-anomalies.
type AnomalyRequest struct {
	UserID       string             `json:"user_id"`
	Transactions []RecurringInputTx `json:"transactions"`
	StartDate    string             `json:"start_date,omitempty"` // YYYY-MM-DD
	EndDate      string             `json:"end_date,omitempty"`   // YYYY-MM-DD
}

// AnomalyResponse is the response from /v1/detect-anomalies.
type AnomalyResponse struct {
	Anomalies        []DetectedAnomaly `json:"anomalies"`
	ProcessingTimeMS int               `json:"processing_time_ms"`
}

// DetectedAnomaly is a single anomaly from the ML service.
type DetectedAnomaly struct {
	ID            string  `json:"id"`
	Type          string  `json:"type"`     // new_category/large_transaction/high_monthly_spending
	Severity      string  `json:"severity"` // info/warning/alert
	Message       string  `json:"message"`
	TransactionID string  `json:"transaction_id"`
	Category      string  `json:"category"`
	Amount        float64 `json:"amount"`
	ZScore        float64 `json:"z_score"`
	DetectedAt    string  `json:"detected_at"` // RFC3339
}

// DetectAnomalies calls the ML service anomaly detection endpoint.
func (c *SmartClient) DetectAnomalies(ctx context.Context, req *AnomalyRequest) (*AnomalyResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/detect-anomalies", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ML service error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result AnomalyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// --- Spending Forecast ---

// ForecastRequest is the request payload for /v1/forecast-spending.
type ForecastRequest struct {
	UserID       string             `json:"user_id"`
	Transactions []RecurringInputTx `json:"transactions"`
	Category     string             `json:"category,omitempty"`
	MonthsAhead  int                `json:"months_ahead"`
}

// ForecastResponse is the response from /v1/forecast-spending.
type ForecastResponse struct {
	Forecasts        []ForecastItem `json:"forecasts"`
	ProcessingTimeMS int            `json:"processing_time_ms"`
}

// ForecastItem is a single forecast point from the ML service.
type ForecastItem struct {
	Month      string  `json:"month"` // YYYY-MM
	Category   string  `json:"category"`
	Predicted  float64 `json:"predicted"`
	LowerBound float64 `json:"lower_bound"`
	UpperBound float64 `json:"upper_bound"`
}

// ForecastSpending calls the ML service forecast endpoint.
func (c *SmartClient) ForecastSpending(ctx context.Context, req *ForecastRequest) (*ForecastResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/forecast-spending", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ML service error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result ForecastResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// --- Training Trigger ---

// TrainingRequest is the request payload for /v1/trigger-training.
type TrainingRequest struct {
	TrainingType string `json:"training_type"` // lora/recurring/anomaly
}

// TrainingResponse is the response from /v1/trigger-training.
type TrainingResponse struct {
	JobID   string `json:"job_id"`
	Status  string `json:"status"` // queued/started/failed
	Message string `json:"message"`
}

// TriggerTraining calls the ML service training trigger endpoint.
func (c *SmartClient) TriggerTraining(ctx context.Context, req *TrainingRequest) (*TrainingResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/trigger-training", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ML service error: status %d, body: %s", resp.StatusCode, string(respBody))
	}

	var result TrainingResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// --- Proto conversion helpers ---

func parseRecurrenceType(s string) pfinancev1.RecurrenceType {
	switch s {
	case "subscription":
		return pfinancev1.RecurrenceType_RECURRENCE_TYPE_SUBSCRIPTION
	case "salary":
		return pfinancev1.RecurrenceType_RECURRENCE_TYPE_SALARY
	case "rent":
		return pfinancev1.RecurrenceType_RECURRENCE_TYPE_RENT
	case "utility":
		return pfinancev1.RecurrenceType_RECURRENCE_TYPE_UTILITY
	case "insurance":
		return pfinancev1.RecurrenceType_RECURRENCE_TYPE_INSURANCE
	default:
		return pfinancev1.RecurrenceType_RECURRENCE_TYPE_OTHER
	}
}

func parseRecurrencePeriod(s string) pfinancev1.RecurrencePeriod {
	switch s {
	case "weekly":
		return pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_WEEKLY
	case "fortnightly":
		return pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_FORTNIGHTLY
	case "monthly":
		return pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_MONTHLY
	case "quarterly":
		return pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_QUARTERLY
	case "yearly":
		return pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_YEARLY
	default:
		return pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_UNSPECIFIED
	}
}

func parseMLAnomalyType(s string) pfinancev1.MLAnomalyType {
	switch s {
	case "new_category":
		return pfinancev1.MLAnomalyType_ML_ANOMALY_TYPE_NEW_CATEGORY
	case "large_transaction":
		return pfinancev1.MLAnomalyType_ML_ANOMALY_TYPE_LARGE_TRANSACTION
	case "high_monthly_spending":
		return pfinancev1.MLAnomalyType_ML_ANOMALY_TYPE_HIGH_MONTHLY_SPENDING
	default:
		return pfinancev1.MLAnomalyType_ML_ANOMALY_TYPE_UNSPECIFIED
	}
}

func parseMLAnomalySeverity(s string) pfinancev1.MLAnomalySeverity {
	switch s {
	case "info":
		return pfinancev1.MLAnomalySeverity_ML_ANOMALY_SEVERITY_INFO
	case "warning":
		return pfinancev1.MLAnomalySeverity_ML_ANOMALY_SEVERITY_WARNING
	case "alert":
		return pfinancev1.MLAnomalySeverity_ML_ANOMALY_SEVERITY_ALERT
	default:
		return pfinancev1.MLAnomalySeverity_ML_ANOMALY_SEVERITY_UNSPECIFIED
	}
}

// parseDate parses a YYYY-MM-DD string to a protobuf Timestamp. Returns nil on error.
func parseDate(s string) *timestamppb.Timestamp {
	if s == "" {
		return nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return nil
	}
	return timestamppb.New(t)
}

// PatternToProto converts an ML service RecurringPattern to a proto DetectedRecurringPattern.
func PatternToProto(p *RecurringPattern) *pfinancev1.DetectedRecurringPattern {
	return &pfinancev1.DetectedRecurringPattern{
		Id:                p.ID,
		Description:       p.Description,
		Category:          p.Category,
		RecurrenceType:    parseRecurrenceType(p.RecurrenceType),
		Period:            parseRecurrencePeriod(p.Period),
		MedianAmount:      p.MedianAmount,
		MedianAmountCents: int64(p.MedianAmount * 100),
		AmountTrend:       p.AmountTrend,
		IsFixedAmount:     p.IsFixedAmount,
		NextExpectedDate:  parseDate(p.NextExpectedDate),
		LastSeenDate:      parseDate(p.LastSeenDate),
		Confidence:        p.Confidence,
		AnomalyFlag:       p.AnomalyFlag,
		TransactionIds:    p.TransactionIDs,
	}
}

// AnomalyToProto converts an ML service DetectedAnomaly to a proto MLDetectedAnomaly.
func AnomalyToProto(a *DetectedAnomaly) *pfinancev1.MLDetectedAnomaly {
	detectedAt := &timestamppb.Timestamp{}
	if t, err := time.Parse(time.RFC3339, a.DetectedAt); err == nil {
		detectedAt = timestamppb.New(t)
	}

	return &pfinancev1.MLDetectedAnomaly{
		Id:            a.ID,
		Type:          parseMLAnomalyType(a.Type),
		Severity:      parseMLAnomalySeverity(a.Severity),
		Message:       a.Message,
		TransactionId: a.TransactionID,
		Category:      a.Category,
		Amount:        a.Amount,
		AmountCents:   int64(a.Amount * 100),
		ZScore:        a.ZScore,
		DetectedAt:    detectedAt,
	}
}

// ForecastToProto converts an ML service ForecastItem to a proto MLSpendingForecast.
func ForecastToProto(f *ForecastItem) *pfinancev1.MLSpendingForecast {
	return &pfinancev1.MLSpendingForecast{
		Month:           f.Month,
		Category:        f.Category,
		Predicted:       f.Predicted,
		PredictedCents:  int64(f.Predicted * 100),
		LowerBound:      f.LowerBound,
		LowerBoundCents: int64(f.LowerBound * 100),
		UpperBound:      f.UpperBound,
		UpperBoundCents: int64(f.UpperBound * 100),
	}
}
