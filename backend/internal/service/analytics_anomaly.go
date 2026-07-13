package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/google/uuid"
)

const minimumAnomalyCategorySample = 10

type anomalyCategoryStats struct {
	amounts  []int64
	expenses []*pfinancev1.Expense
	total    int64
}

func anomalyReasonPriority(reason pfinancev1.AnomalyType) int {
	switch reason {
	case pfinancev1.AnomalyType_ANOMALY_TYPE_AMOUNT_OUTLIER:
		return 4
	case pfinancev1.AnomalyType_ANOMALY_TYPE_CATEGORY_SPIKE:
		return 3
	case pfinancev1.AnomalyType_ANOMALY_TYPE_UNUSUAL_TIMING:
		return 2
	case pfinancev1.AnomalyType_ANOMALY_TYPE_NEW_MERCHANT:
		return 1
	default:
		return 0
	}
}

func shouldReplaceAnomaly(existing, candidate *pfinancev1.SpendingAnomaly) bool {
	if candidate.Severity != existing.Severity {
		return candidate.Severity > existing.Severity
	}
	return anomalyReasonPriority(candidate.AnomalyType) > anomalyReasonPriority(existing.AnomalyType)
}

func anomalyCalculationError() error {
	return connect.NewError(
		connect.CodeInternal,
		errors.New("anomaly data could not be calculated"),
	)
}

func roundedAnomalyCents(value float64) (int64, error) {
	rounded := math.Round(value)
	limit := math.Ldexp(1, 63)
	if math.IsNaN(rounded) || math.IsInf(rounded, 0) || rounded >= limit || rounded < -limit {
		return 0, errors.New("anomaly cents outside int64 range")
	}
	return int64(rounded), nil
}

func normaliseAnomalyMerchant(description string) string {
	return strings.ToLower(strings.TrimSpace(description))
}

// DetectAnomalies detects unusual spending patterns using z-score analysis.
func (s *FinanceService) DetectAnomalies(ctx context.Context, req *connect.Request[pfinancev1.DetectAnomaliesRequest]) (*connect.Response[pfinancev1.DetectAnomaliesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	scope, err := s.resolveAnalyticsScope(ctx, claims, req.Msg.UserId, req.Msg.GroupId)
	if err != nil {
		return nil, err
	}

	lookbackDays := req.Msg.LookbackDays
	if lookbackDays <= 0 {
		lookbackDays = 90
	}
	sensitivity := req.Msg.Sensitivity
	// Sensitivity is a proto3 scalar, so zero also represents omission and uses
	// the documented default. Explicit values otherwise must stay in [0, 1].
	if sensitivity == 0 {
		sensitivity = 0.5
	}
	if sensitivity < 0 || sensitivity > 1 || math.IsNaN(sensitivity) {
		return nil, connect.NewError(
			connect.CodeInvalidArgument,
			errors.New("sensitivity must be between 0 and 1"),
		)
	}
	threshold := 3.0 - sensitivity*2.0

	now := time.Now()
	startDate := now.AddDate(0, 0, -int(lookbackDays))
	endDate := now
	expenses, err := s.listAllAnalyticsExpenses(ctx, scope, &startDate, &endDate)
	if err != nil {
		return nil, err
	}
	fullHistory, err := s.listAllAnalyticsExpenses(ctx, scope, nil, nil)
	if err != nil {
		return nil, err
	}

	analyzedExpenseCount, err := checkedAnalyticsTransactionCount(len(expenses), 0)
	if err != nil {
		return nil, anomalyCalculationError()
	}

	byCategory := make(map[pfinancev1.ExpenseCategory]*anomalyCategoryStats)
	for _, expense := range expenses {
		if expense == nil {
			continue
		}
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		stats := byCategory[expense.Category]
		if stats == nil {
			stats = &anomalyCategoryStats{}
			byCategory[expense.Category] = stats
		}
		stats.total, err = checkedAddInt64(stats.total, amount)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		stats.amounts = append(stats.amounts, amount)
		stats.expenses = append(stats.expenses, expense)
	}

	merchantCount := make(map[string]int)
	for _, expense := range fullHistory {
		if expense == nil {
			continue
		}
		merchant := normaliseAnomalyMerchant(expense.Description)
		if merchant != "" {
			merchantCount[merchant]++
		}
	}

	anomaliesByExpense := make(map[string]*pfinancev1.SpendingAnomaly)
	var anomalousSpendTotalCents int64
	addAnomaly := func(anomaly *pfinancev1.SpendingAnomaly) error {
		existing, present := anomaliesByExpense[anomaly.ExpenseId]
		if present {
			if shouldReplaceAnomaly(existing, anomaly) {
				anomaliesByExpense[anomaly.ExpenseId] = anomaly
			}
			return nil
		}
		var err error
		anomalousSpendTotalCents, err = checkedAddInt64(anomalousSpendTotalCents, anomaly.AmountCents)
		if err != nil {
			return err
		}
		anomaliesByExpense[anomaly.ExpenseId] = anomaly
		return nil
	}

	categoryKeys := make([]pfinancev1.ExpenseCategory, 0, len(byCategory))
	for category := range byCategory {
		categoryKeys = append(categoryKeys, category)
	}
	sort.Slice(categoryKeys, func(i, j int) bool { return categoryKeys[i] < categoryKeys[j] })

	categoryCoverage := make([]*pfinancev1.AnomalyCategoryCoverage, 0, len(categoryKeys))
	var eligibleCategoryCount int32
	for _, category := range categoryKeys {
		stats := byCategory[category]
		sampleCount, err := checkedAnalyticsTransactionCount(len(stats.amounts), 0)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		hasSufficientHistory := len(stats.amounts) >= minimumAnomalyCategorySample
		if hasSufficientHistory {
			eligibleCategoryCount++
		}
		categoryCoverage = append(categoryCoverage, &pfinancev1.AnomalyCategoryCoverage{
			Category:             category,
			SampleCount:          sampleCount,
			HasSufficientHistory: hasSufficientHistory,
		})
		if !hasSufficientHistory {
			continue
		}

		mean := float64(stats.total) / float64(len(stats.amounts))
		var varianceSum float64
		for _, amount := range stats.amounts {
			difference := float64(amount) - mean
			varianceSum += difference * difference
		}
		stddev := math.Sqrt(varianceSum / float64(len(stats.amounts)))
		if math.IsNaN(stddev) || math.IsInf(stddev, 0) {
			return nil, anomalyCalculationError()
		}
		if stddev == 0 {
			continue
		}

		expectedAmountCents, err := roundedAnomalyCents(mean)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		expectedLowerCents, err := roundedAnomalyCents(mean - threshold*stddev)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		if expectedLowerCents < 0 {
			expectedLowerCents = 0
		}
		expectedUpperCents, err := roundedAnomalyCents(mean + threshold*stddev)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		if expectedLowerCents > expectedUpperCents {
			return nil, anomalyCalculationError()
		}

		for index, expense := range stats.expenses {
			amount := stats.amounts[index]
			zScore := (float64(amount) - mean) / stddev
			absoluteZScore := math.Abs(zScore)
			if absoluteZScore <= threshold {
				continue
			}

			severity := pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_LOW
			if absoluteZScore > 3.0 {
				severity = pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_HIGH
			} else if absoluteZScore > 2.5 {
				severity = pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_MEDIUM
			}
			if err := addAnomaly(&pfinancev1.SpendingAnomaly{
				Id:                  uuid.New().String(),
				ExpenseId:           expense.Id,
				Description:         expense.Description,
				Amount:              float64(amount) / 100,
				AmountCents:         amount,
				Category:            category,
				Date:                expense.Date,
				ZScore:              zScore,
				ExpectedAmount:      float64(expectedAmountCents) / 100,
				ExpectedAmountCents: expectedAmountCents,
				AnomalyType:         pfinancev1.AnomalyType_ANOMALY_TYPE_AMOUNT_OUTLIER,
				Severity:            severity,
				ExpectedLowerCents:  expectedLowerCents,
				ExpectedUpperCents:  expectedUpperCents,
				HasExpectedRange:    true,
			}); err != nil {
				return nil, anomalyCalculationError()
			}
		}
	}

	for _, expense := range expenses {
		if expense == nil {
			continue
		}
		merchant := normaliseAnomalyMerchant(expense.Description)
		if merchant == "" || merchantCount[merchant] != 1 {
			continue
		}
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, anomalyCalculationError()
		}
		if err := addAnomaly(&pfinancev1.SpendingAnomaly{
			Id:          uuid.New().String(),
			ExpenseId:   expense.Id,
			Description: fmt.Sprintf("New merchant: %s", expense.Description),
			Amount:      float64(amount) / 100,
			AmountCents: amount,
			Category:    expense.Category,
			Date:        expense.Date,
			AnomalyType: pfinancev1.AnomalyType_ANOMALY_TYPE_NEW_MERCHANT,
			Severity:    pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_LOW,
		}); err != nil {
			return nil, anomalyCalculationError()
		}
	}

	anomalies := make([]*pfinancev1.SpendingAnomaly, 0, len(anomaliesByExpense))
	for _, anomaly := range anomaliesByExpense {
		anomalies = append(anomalies, anomaly)
	}
	sort.Slice(anomalies, func(i, j int) bool {
		if anomalies[i].Severity != anomalies[j].Severity {
			return anomalies[i].Severity > anomalies[j].Severity
		}
		if anomalies[i].AmountCents != anomalies[j].AmountCents {
			return anomalies[i].AmountCents > anomalies[j].AmountCents
		}
		if anomalyReasonPriority(anomalies[i].AnomalyType) != anomalyReasonPriority(anomalies[j].AnomalyType) {
			return anomalyReasonPriority(anomalies[i].AnomalyType) > anomalyReasonPriority(anomalies[j].AnomalyType)
		}
		return anomalies[i].ExpenseId < anomalies[j].ExpenseId
	})

	categoryAnomalyCounts := make(map[pfinancev1.ExpenseCategory]int)
	for _, anomaly := range anomalies {
		categoryAnomalyCounts[anomaly.Category]++
	}
	topCategory := ""
	topCategoryCount := 0
	for _, category := range categoryKeys {
		count := categoryAnomalyCounts[category]
		if count > topCategoryCount {
			topCategoryCount = count
			topCategory = category.String()
		}
	}

	totalAnomalies, err := checkedAnalyticsTransactionCount(len(anomalies), 0)
	if err != nil {
		return nil, anomalyCalculationError()
	}
	return connect.NewResponse(&pfinancev1.DetectAnomaliesResponse{
		Anomalies:                anomalies,
		TotalAnomalies:           totalAnomalies,
		AnomalousSpendTotal:      float64(anomalousSpendTotalCents) / 100,
		AnomalousSpendTotalCents: anomalousSpendTotalCents,
		TopAnomalyCategory:       topCategory,
		AnalyzedExpenseCount:     analyzedExpenseCount,
		EligibleCategoryCount:    eligibleCategoryCount,
		MinimumCategorySample:    minimumAnomalyCategorySample,
		HasSufficientHistory:     eligibleCategoryCount > 0,
		CategoryCoverage:         categoryCoverage,
	}), nil
}
