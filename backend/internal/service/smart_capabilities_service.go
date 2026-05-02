package service

import (
	"context"
	"fmt"
	"log"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// DetectRecurringTransactions calls the ML service to detect recurring patterns in user transactions.
func (s *FinanceService) DetectRecurringTransactions(ctx context.Context, req *connect.Request[pfinancev1.DetectRecurringTransactionsRequest]) (*connect.Response[pfinancev1.DetectRecurringTransactionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if s.smartClient == nil {
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("ML smart capabilities not configured"))
	}

	// Fetch user's expenses to send to ML service
	expenses, _, err := s.store.ListExpenses(ctx, claims.UID, "", nil, nil, 10000, "")
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list expenses: %w", err))
	}

	if len(expenses) < 3 {
		return connect.NewResponse(&pfinancev1.DetectRecurringTransactionsResponse{
			Patterns:                 nil,
			TransactionCountAnalyzed: int32(len(expenses)),
			ProcessingTimeMs:         0,
		}), nil
	}

	// Convert to ML service input format
	txs := make([]extraction.RecurringInputTx, 0, len(expenses))
	for _, e := range expenses {
		date := ""
		if e.Date != nil {
			date = e.Date.AsTime().Format("2006-01-02")
		}
		txs = append(txs, extraction.RecurringInputTx{
			ID:          e.Id,
			Date:        date,
			Description: e.Description,
			Amount:      e.Amount,
			IsDebit:     true,
			Category:    e.Category.String(),
		})
	}

	mlReq := &extraction.RecurringRequest{
		UserID:       claims.UID,
		Transactions: txs,
		ForceRefresh: req.Msg.ForceRefresh,
	}

	result, err := s.smartClient.DetectRecurring(ctx, mlReq)
	if err != nil {
		log.Printf("[SmartCapabilities] recurring detection failed for user %s: %v", claims.UID, err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("recurring detection failed: %w", err))
	}

	// Convert ML response to proto
	patterns := make([]*pfinancev1.DetectedRecurringPattern, 0, len(result.Patterns))
	for i := range result.Patterns {
		patterns = append(patterns, extraction.PatternToProto(&result.Patterns[i]))
	}

	return connect.NewResponse(&pfinancev1.DetectRecurringTransactionsResponse{
		Patterns:                 patterns,
		TransactionCountAnalyzed: int32(result.TxCountAnalyzed),
		ProcessingTimeMs:         int32(result.ProcessingTimeMS),
	}), nil
}

// DetectSpendingAnomalies calls the ML service to detect spending anomalies.
func (s *FinanceService) DetectSpendingAnomalies(ctx context.Context, req *connect.Request[pfinancev1.DetectSpendingAnomaliesRequest]) (*connect.Response[pfinancev1.DetectSpendingAnomaliesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if s.smartClient == nil {
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("ML smart capabilities not configured"))
	}

	// Fetch user's expenses
	expenses, _, err := s.store.ListExpenses(ctx, claims.UID, "", nil, nil, 10000, "")
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list expenses: %w", err))
	}

	// Convert to ML service input format
	txs := make([]extraction.RecurringInputTx, 0, len(expenses))
	for _, e := range expenses {
		date := ""
		if e.Date != nil {
			date = e.Date.AsTime().Format("2006-01-02")
		}
		txs = append(txs, extraction.RecurringInputTx{
			ID:          e.Id,
			Date:        date,
			Description: e.Description,
			Amount:      e.Amount,
			IsDebit:     true,
			Category:    e.Category.String(),
		})
	}

	mlReq := &extraction.AnomalyRequest{
		UserID:       claims.UID,
		Transactions: txs,
	}

	// Pass date range if provided
	if req.Msg.StartDate != nil {
		mlReq.StartDate = req.Msg.StartDate.AsTime().Format("2006-01-02")
	}
	if req.Msg.EndDate != nil {
		mlReq.EndDate = req.Msg.EndDate.AsTime().Format("2006-01-02")
	}

	result, err := s.smartClient.DetectAnomalies(ctx, mlReq)
	if err != nil {
		log.Printf("[SmartCapabilities] anomaly detection failed for user %s: %v", claims.UID, err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("anomaly detection failed: %w", err))
	}

	// Convert ML response to proto
	anomalies := make([]*pfinancev1.MLDetectedAnomaly, 0, len(result.Anomalies))
	for i := range result.Anomalies {
		anomalies = append(anomalies, extraction.AnomalyToProto(&result.Anomalies[i]))
	}

	// Send FCM push notifications for warning/alert severity anomalies
	s.sendAnomalyNotifications(ctx, claims.UID, result.Anomalies)

	return connect.NewResponse(&pfinancev1.DetectSpendingAnomaliesResponse{
		Anomalies:        anomalies,
		ProcessingTimeMs: int32(result.ProcessingTimeMS),
	}), nil
}

// sendAnomalyNotifications creates in-app notifications and optionally sends FCM push
// for warning/alert severity anomalies. Follows the notification_triggers.go pattern.
func (s *FinanceService) sendAnomalyNotifications(ctx context.Context, userID string, anomalies []extraction.DetectedAnomaly) {
	// Check user preferences
	prefs, err := s.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.UnusualSpending {
		return
	}

	for _, a := range anomalies {
		if a.Severity == "info" {
			continue // info-level anomalies are shown in-app only, no notification
		}

		notifType := pfinancev1.NotificationType_NOTIFICATION_TYPE_UNUSUAL_SPENDING

		notification := &pfinancev1.Notification{
			Id:            uuid.New().String(),
			UserId:        userID,
			Type:          notifType,
			Title:         "Spending Alert",
			Message:       a.Message,
			IsRead:        false,
			ActionUrl:     "/personal/analytics",
			ReferenceId:   a.TransactionID,
			ReferenceType: "anomaly",
			CreatedAt:     timestamppb.Now(),
			Metadata: map[string]string{
				"anomaly_type": a.Type,
				"severity":     a.Severity,
				"category":     a.Category,
			},
		}

		if err := s.store.CreateNotification(ctx, notification); err != nil {
			log.Printf("[SmartCapabilities] failed to create anomaly notification: %v", err)
		}
	}
}

// GetSpendingForecast calls the ML service to forecast spending by category.
func (s *FinanceService) GetSpendingForecast(ctx context.Context, req *connect.Request[pfinancev1.GetSpendingForecastRequest]) (*connect.Response[pfinancev1.GetSpendingForecastResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if s.smartClient == nil {
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("ML smart capabilities not configured"))
	}

	// Validate months_ahead
	monthsAhead := int(req.Msg.MonthsAhead)
	if monthsAhead <= 0 {
		monthsAhead = 3
	}
	if monthsAhead > 6 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("months_ahead must be 1-6"))
	}

	// Fetch user's expenses
	expenses, _, err := s.store.ListExpenses(ctx, claims.UID, "", nil, nil, 10000, "")
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list expenses: %w", err))
	}

	// Convert to ML service input format
	txs := make([]extraction.RecurringInputTx, 0, len(expenses))
	for _, e := range expenses {
		date := ""
		if e.Date != nil {
			date = e.Date.AsTime().Format("2006-01-02")
		}
		txs = append(txs, extraction.RecurringInputTx{
			ID:          e.Id,
			Date:        date,
			Description: e.Description,
			Amount:      e.Amount,
			IsDebit:     true,
			Category:    e.Category.String(),
		})
	}

	mlReq := &extraction.ForecastRequest{
		UserID:       claims.UID,
		Transactions: txs,
		Category:     req.Msg.Category,
		MonthsAhead:  monthsAhead,
	}

	result, err := s.smartClient.ForecastSpending(ctx, mlReq)
	if err != nil {
		log.Printf("[SmartCapabilities] forecast failed for user %s: %v", claims.UID, err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("forecast failed: %w", err))
	}

	// Convert ML response to proto
	forecasts := make([]*pfinancev1.MLSpendingForecast, 0, len(result.Forecasts))
	for i := range result.Forecasts {
		forecasts = append(forecasts, extraction.ForecastToProto(&result.Forecasts[i]))
	}

	return connect.NewResponse(&pfinancev1.GetSpendingForecastResponse{
		Forecasts:        forecasts,
		ProcessingTimeMs: int32(result.ProcessingTimeMS),
	}), nil
}

// TriggerModelTraining triggers a manual ML training pipeline run (admin/Pro-only).
func (s *FinanceService) TriggerModelTraining(ctx context.Context, req *connect.Request[pfinancev1.TriggerModelTrainingRequest]) (*connect.Response[pfinancev1.TriggerModelTrainingResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if s.smartClient == nil {
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("ML smart capabilities not configured"))
	}

	trainingType := req.Msg.TrainingType
	if trainingType == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("training_type is required"))
	}

	// Validate training type
	validTypes := map[string]bool{"lora": true, "recurring": true, "anomaly": true}
	if !validTypes[trainingType] {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("training_type must be one of: lora, recurring, anomaly"))
	}

	mlReq := &extraction.TrainingRequest{
		TrainingType: trainingType,
	}

	result, err := s.smartClient.TriggerTraining(ctx, mlReq)
	if err != nil {
		log.Printf("[SmartCapabilities] training trigger failed: %v", err)
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("training trigger failed: %w", err))
	}

	return connect.NewResponse(&pfinancev1.TriggerModelTrainingResponse{
		JobId:   result.JobID,
		Status:  result.Status,
		Message: result.Message,
	}), nil
}
