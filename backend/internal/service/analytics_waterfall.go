package service

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

func waterfallPeriodBounds(now time.Time, period string) (time.Time, time.Time, string) {
	switch period {
	case "week":
		daysFromSunday := int(now.Weekday())
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -daysFromSunday)
		end := start.AddDate(0, 0, 6)
		end = time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, end.Location())
		return start, end, fmt.Sprintf("Week of %s", start.Format("Jan 02, 2006"))
	case "quarter":
		quarterStartMonth := time.Month(((int(now.Month())-1)/3)*3 + 1)
		start := time.Date(now.Year(), quarterStartMonth, 1, 0, 0, 0, 0, now.Location())
		end := start.AddDate(0, 3, -1)
		end = time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, end.Location())
		quarter := ((int(now.Month()) - 1) / 3) + 1
		return start, end, fmt.Sprintf("Q%d %d", quarter, now.Year())
	case "year":
		start := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		end := time.Date(now.Year(), 12, 31, 23, 59, 59, 0, now.Location())
		return start, end, fmt.Sprintf("%d", now.Year())
	default:
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		end := start.AddDate(0, 1, -1)
		end = time.Date(end.Year(), end.Month(), end.Day(), 23, 59, 59, 0, end.Location())
		return start, end, now.Format("January 2006")
	}
}

func waterfallCalculationError() error {
	return connect.NewError(connect.CodeInternal, errors.New("waterfall data could not be calculated"))
}

func roundedWaterfallCents(value float64) (int64, error) {
	rounded := math.Round(value)
	limit := math.Ldexp(1, 63)
	if math.IsNaN(rounded) || math.IsInf(rounded, 0) || rounded >= limit || rounded < -limit {
		return 0, errors.New("waterfall cents outside int64 range")
	}
	return int64(rounded), nil
}

func waterfallEntry(label string, amountCents, runningTotalCents int64, entryType pfinancev1.WaterfallEntryType) *pfinancev1.WaterfallEntry {
	return &pfinancev1.WaterfallEntry{
		Label:             label,
		Amount:            float64(amountCents) / 100,
		AmountCents:       amountCents,
		EntryType:         entryType,
		RunningTotal:      float64(runningTotalCents) / 100,
		RunningTotalCents: runningTotalCents,
	}
}

// GetWaterfallData returns waterfall chart data showing income to savings flow.
func (s *FinanceService) GetWaterfallData(ctx context.Context, req *connect.Request[pfinancev1.GetWaterfallDataRequest]) (*connect.Response[pfinancev1.GetWaterfallDataResponse], error) {
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
	period := req.Msg.Period
	if period == "" {
		period = "month"
	}
	startDate, endDate, periodLabel := waterfallPeriodBounds(time.Now(), period)

	incomes, err := s.listAllAnalyticsIncomes(ctx, scope, &startDate, &endDate)
	if err != nil {
		return nil, err
	}
	expenses, err := s.listAllAnalyticsExpenses(ctx, scope, &startDate, &endDate)
	if err != nil {
		return nil, err
	}

	var totalIncomeCents int64
	for _, income := range incomes {
		amount, err := checkedIncomeCents(income)
		if err != nil {
			return nil, waterfallCalculationError()
		}
		totalIncomeCents, err = checkedAddInt64(totalIncomeCents, amount)
		if err != nil {
			return nil, waterfallCalculationError()
		}
	}
	expensesByCategory := make(map[pfinancev1.ExpenseCategory]int64)
	for _, expense := range expenses {
		if expense == nil {
			continue
		}
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, waterfallCalculationError()
		}
		expensesByCategory[expense.Category], err = checkedAddInt64(expensesByCategory[expense.Category], amount)
		if err != nil {
			return nil, waterfallCalculationError()
		}
	}

	incomeLabel := "Gross Income"
	finalLabel := "Net Savings"
	if scope.groupID != "" {
		incomeLabel = "Group Income"
		finalLabel = "Remaining Group Cash"
	}
	runningTotalCents := totalIncomeCents
	entries := []*pfinancev1.WaterfallEntry{
		waterfallEntry(incomeLabel, totalIncomeCents, runningTotalCents, pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_INCOME),
	}

	if scope.groupID == "" {
		taxRatePercent := 25.0
		if taxConfig, taxErr := s.store.GetTaxConfig(ctx, scope.userID, ""); taxErr == nil && taxConfig != nil && taxConfig.TaxRate > 0 {
			taxRatePercent = taxConfig.TaxRate
		}
		taxCents, err := roundedWaterfallCents(float64(totalIncomeCents) * taxRatePercent / 100)
		if err != nil {
			return nil, waterfallCalculationError()
		}
		runningTotalCents, err = checkedSubInt64(runningTotalCents, taxCents)
		if err != nil {
			return nil, waterfallCalculationError()
		}
		entries = append(entries, waterfallEntry(
			"Tax", taxCents, runningTotalCents,
			pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_TAX,
		))
	}

	type categoryAmount struct {
		category pfinancev1.ExpenseCategory
		amount   int64
	}
	sortedCategories := make([]categoryAmount, 0, len(expensesByCategory))
	for category, amount := range expensesByCategory {
		sortedCategories = append(sortedCategories, categoryAmount{category: category, amount: amount})
	}
	sort.Slice(sortedCategories, func(i, j int) bool {
		if sortedCategories[i].amount != sortedCategories[j].amount {
			return sortedCategories[i].amount > sortedCategories[j].amount
		}
		return sortedCategories[i].category < sortedCategories[j].category
	})
	for _, category := range sortedCategories {
		runningTotalCents, err = checkedSubInt64(runningTotalCents, category.amount)
		if err != nil {
			return nil, waterfallCalculationError()
		}
		entries = append(entries, waterfallEntry(
			category.category.String(), category.amount, runningTotalCents,
			pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_EXPENSE,
		))
	}

	entries = append(entries, waterfallEntry(
		finalLabel, runningTotalCents, runningTotalCents,
		pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_SAVINGS,
	))
	return connect.NewResponse(&pfinancev1.GetWaterfallDataResponse{
		Entries:     entries,
		PeriodLabel: periodLabel,
	}), nil
}
