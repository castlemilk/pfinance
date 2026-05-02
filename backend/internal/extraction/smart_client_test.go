package extraction

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestSmartClient_DetectRecurring(t *testing.T) {
	// Mock ML service
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/detect-recurring" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
		}

		// Decode request to verify it
		var req RecurringRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		if req.UserID != "user-123" {
			t.Errorf("expected user_id user-123, got %s", req.UserID)
		}
		if len(req.Transactions) != 5 {
			t.Errorf("expected 5 transactions, got %d", len(req.Transactions))
		}

		resp := RecurringResponse{
			Patterns: []RecurringPattern{
				{
					ID:               "pattern-1",
					Description:      "Netflix",
					Category:         "Entertainment",
					RecurrenceType:   "subscription",
					Period:           "monthly",
					MedianAmount:     15.99,
					AmountTrend:      0.0,
					IsFixedAmount:    true,
					NextExpectedDate: "2026-04-15",
					LastSeenDate:     "2026-03-15",
					Confidence:       0.95,
					AnomalyFlag:      false,
					TransactionIDs:   []string{"tx-1", "tx-2", "tx-3"},
				},
				{
					ID:               "pattern-2",
					Description:      "Salary - ACME Corp",
					Category:         "Income",
					RecurrenceType:   "salary",
					Period:           "fortnightly",
					MedianAmount:     3500.00,
					AmountTrend:      50.0,
					IsFixedAmount:    true,
					NextExpectedDate: "2026-04-01",
					LastSeenDate:     "2026-03-18",
					Confidence:       0.98,
					AnomalyFlag:      false,
					TransactionIDs:   []string{"tx-4", "tx-5"},
				},
			},
			TxCountAnalyzed:  5,
			ProcessingTimeMS: 1200,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewSmartClient(server.URL)
	ctx := context.Background()

	req := &RecurringRequest{
		UserID: "user-123",
		Transactions: []RecurringInputTx{
			{ID: "tx-1", Date: "2026-01-15", Description: "Netflix", Amount: 15.99, IsDebit: true, Category: "Entertainment"},
			{ID: "tx-2", Date: "2026-02-15", Description: "Netflix", Amount: 15.99, IsDebit: true, Category: "Entertainment"},
			{ID: "tx-3", Date: "2026-03-15", Description: "Netflix", Amount: 15.99, IsDebit: true, Category: "Entertainment"},
			{ID: "tx-4", Date: "2026-03-04", Description: "Salary - ACME Corp", Amount: 3500.00, IsDebit: false, Category: "Income"},
			{ID: "tx-5", Date: "2026-03-18", Description: "Salary - ACME Corp", Amount: 3550.00, IsDebit: false, Category: "Income"},
		},
	}

	result, err := client.DetectRecurring(ctx, req)
	if err != nil {
		t.Fatalf("DetectRecurring: %v", err)
	}

	if len(result.Patterns) != 2 {
		t.Fatalf("expected 2 patterns, got %d", len(result.Patterns))
	}

	if result.Patterns[0].Description != "Netflix" {
		t.Errorf("expected Netflix, got %s", result.Patterns[0].Description)
	}
	if result.Patterns[0].RecurrenceType != "subscription" {
		t.Errorf("expected subscription, got %s", result.Patterns[0].RecurrenceType)
	}
	if result.Patterns[1].Period != "fortnightly" {
		t.Errorf("expected fortnightly, got %s", result.Patterns[1].Period)
	}
	if result.TxCountAnalyzed != 5 {
		t.Errorf("expected 5, got %d", result.TxCountAnalyzed)
	}
}

func TestSmartClient_DetectAnomalies(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/detect-anomalies" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		resp := AnomalyResponse{
			Anomalies: []DetectedAnomaly{
				{
					ID:            "anomaly-1",
					Type:          "large_transaction",
					Severity:      "warning",
					Message:       "$500.00 at JB Hi-Fi is unusually large for Shopping",
					TransactionID: "tx-99",
					Category:      "Shopping",
					Amount:        500.00,
					ZScore:        3.2,
					DetectedAt:    "2026-03-20T10:00:00Z",
				},
				{
					ID:       "anomaly-2",
					Type:     "new_category",
					Severity: "info",
					Message:  "First transaction in 'Education': $200.00",
					Category: "Education",
					Amount:   200.00,
					ZScore:   0,
				},
			},
			ProcessingTimeMS: 800,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewSmartClient(server.URL)
	ctx := context.Background()

	result, err := client.DetectAnomalies(ctx, &AnomalyRequest{
		UserID:       "user-123",
		Transactions: []RecurringInputTx{},
		StartDate:    "2026-03-01",
		EndDate:      "2026-03-31",
	})
	if err != nil {
		t.Fatalf("DetectAnomalies: %v", err)
	}

	if len(result.Anomalies) != 2 {
		t.Fatalf("expected 2 anomalies, got %d", len(result.Anomalies))
	}

	if result.Anomalies[0].Type != "large_transaction" {
		t.Errorf("expected large_transaction, got %s", result.Anomalies[0].Type)
	}
	if result.Anomalies[0].ZScore != 3.2 {
		t.Errorf("expected z_score 3.2, got %f", result.Anomalies[0].ZScore)
	}
	if result.Anomalies[1].Severity != "info" {
		t.Errorf("expected info severity, got %s", result.Anomalies[1].Severity)
	}
}

func TestSmartClient_ForecastSpending(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/forecast-spending" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		var req ForecastRequest
		json.NewDecoder(r.Body).Decode(&req)
		if req.MonthsAhead != 3 {
			t.Errorf("expected months_ahead 3, got %d", req.MonthsAhead)
		}

		resp := ForecastResponse{
			Forecasts: []ForecastItem{
				{Month: "2026-04", Category: "Food", Predicted: 450.00, LowerBound: 380.00, UpperBound: 520.00},
				{Month: "2026-05", Category: "Food", Predicted: 460.00, LowerBound: 385.00, UpperBound: 535.00},
				{Month: "2026-06", Category: "Food", Predicted: 470.00, LowerBound: 390.00, UpperBound: 550.00},
			},
			ProcessingTimeMS: 2500,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewSmartClient(server.URL)
	ctx := context.Background()

	result, err := client.ForecastSpending(ctx, &ForecastRequest{
		UserID:      "user-123",
		Category:    "Food",
		MonthsAhead: 3,
	})
	if err != nil {
		t.Fatalf("ForecastSpending: %v", err)
	}

	if len(result.Forecasts) != 3 {
		t.Fatalf("expected 3 forecasts, got %d", len(result.Forecasts))
	}

	if result.Forecasts[0].Month != "2026-04" {
		t.Errorf("expected 2026-04, got %s", result.Forecasts[0].Month)
	}
	if result.Forecasts[0].Predicted != 450.00 {
		t.Errorf("expected 450.00, got %f", result.Forecasts[0].Predicted)
	}
}

func TestSmartClient_TriggerTraining(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/trigger-training" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}

		resp := TrainingResponse{
			JobID:   "job-abc123",
			Status:  "queued",
			Message: "LoRA training job queued",
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}))
	defer server.Close()

	client := NewSmartClient(server.URL)
	ctx := context.Background()

	result, err := client.TriggerTraining(ctx, &TrainingRequest{TrainingType: "lora"})
	if err != nil {
		t.Fatalf("TriggerTraining: %v", err)
	}

	if result.JobID != "job-abc123" {
		t.Errorf("expected job-abc123, got %s", result.JobID)
	}
	if result.Status != "queued" {
		t.Errorf("expected queued, got %s", result.Status)
	}
}

func TestSmartClient_MLServiceError(t *testing.T) {
	// Test timeout handling
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error": "model not loaded"}`))
	}))
	defer server.Close()

	client := NewSmartClient(server.URL)
	ctx := context.Background()

	_, err := client.DetectRecurring(ctx, &RecurringRequest{UserID: "user-123"})
	if err == nil {
		t.Fatal("expected error from 500 response")
	}
}

func TestSmartClient_Timeout(t *testing.T) {
	// Test context cancellation
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
	}))
	defer server.Close()

	client := NewSmartClient(server.URL)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	_, err := client.DetectRecurring(ctx, &RecurringRequest{UserID: "user-123"})
	if err == nil {
		t.Fatal("expected error from timeout")
	}
}

func TestPatternToProto(t *testing.T) {
	pattern := &RecurringPattern{
		ID:               "p-1",
		Description:      "Netflix",
		Category:         "Entertainment",
		RecurrenceType:   "subscription",
		Period:           "monthly",
		MedianAmount:     15.99,
		AmountTrend:      0.5,
		IsFixedAmount:    true,
		NextExpectedDate: "2026-04-15",
		LastSeenDate:     "2026-03-15",
		Confidence:       0.95,
		AnomalyFlag:      false,
		TransactionIDs:   []string{"tx-1", "tx-2"},
	}

	proto := PatternToProto(pattern)

	if proto.Id != "p-1" {
		t.Errorf("expected p-1, got %s", proto.Id)
	}
	if proto.RecurrenceType != pfinancev1.RecurrenceType_RECURRENCE_TYPE_SUBSCRIPTION {
		t.Errorf("expected SUBSCRIPTION, got %v", proto.RecurrenceType)
	}
	if proto.Period != pfinancev1.RecurrencePeriod_RECURRENCE_PERIOD_MONTHLY {
		t.Errorf("expected MONTHLY, got %v", proto.Period)
	}
	if proto.MedianAmountCents != 1599 {
		t.Errorf("expected 1599 cents, got %d", proto.MedianAmountCents)
	}
	if proto.NextExpectedDate == nil {
		t.Error("expected non-nil NextExpectedDate")
	}
	if len(proto.TransactionIds) != 2 {
		t.Errorf("expected 2 transaction IDs, got %d", len(proto.TransactionIds))
	}
}

func TestAnomalyToProto(t *testing.T) {
	anomaly := &DetectedAnomaly{
		ID:            "a-1",
		Type:          "large_transaction",
		Severity:      "warning",
		Message:       "Large purchase",
		TransactionID: "tx-99",
		Category:      "Shopping",
		Amount:        500.00,
		ZScore:        3.2,
		DetectedAt:    "2026-03-20T10:00:00Z",
	}

	proto := AnomalyToProto(anomaly)

	if proto.Type != pfinancev1.MLAnomalyType_ML_ANOMALY_TYPE_LARGE_TRANSACTION {
		t.Errorf("expected LARGE_TRANSACTION, got %v", proto.Type)
	}
	if proto.Severity != pfinancev1.MLAnomalySeverity_ML_ANOMALY_SEVERITY_WARNING {
		t.Errorf("expected WARNING, got %v", proto.Severity)
	}
	if proto.AmountCents != 50000 {
		t.Errorf("expected 50000 cents, got %d", proto.AmountCents)
	}
}

func TestForecastToProto(t *testing.T) {
	forecast := &ForecastItem{
		Month:      "2026-04",
		Category:   "Food",
		Predicted:  450.00,
		LowerBound: 380.00,
		UpperBound: 520.00,
	}

	proto := ForecastToProto(forecast)

	if proto.Month != "2026-04" {
		t.Errorf("expected 2026-04, got %s", proto.Month)
	}
	if proto.PredictedCents != 45000 {
		t.Errorf("expected 45000, got %d", proto.PredictedCents)
	}
	if proto.LowerBoundCents != 38000 {
		t.Errorf("expected 38000, got %d", proto.LowerBoundCents)
	}
	if proto.UpperBoundCents != 52000 {
		t.Errorf("expected 52000, got %d", proto.UpperBoundCents)
	}
}
