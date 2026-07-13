package service

import (
	"math"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

type analyticsBounds struct {
	currentStart  time.Time
	currentEnd    time.Time
	previousStart time.Time
	previousEnd   time.Time
}

func analyticsPeriodBounds(now time.Time, period pfinancev1.AnalyticsPeriod) analyticsBounds {
	now = now.UTC()

	var currentStart time.Time
	var previousStart time.Time
	switch period {
	case pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_QUARTER:
		quarterStartMonth := time.Month(((int(now.Month()) - 1) / 3 * 3) + 1)
		currentStart = time.Date(now.Year(), quarterStartMonth, 1, 0, 0, 0, 0, time.UTC)
		previousStart = currentStart.AddDate(0, -3, 0)
	case pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_YEAR:
		currentStart = time.Date(now.Year(), time.January, 1, 0, 0, 0, 0, time.UTC)
		previousStart = currentStart.AddDate(-1, 0, 0)
	default:
		currentStart = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
		previousStart = currentStart.AddDate(0, -1, 0)
	}

	previousEnd := previousStart.Add(now.Sub(currentStart))
	previousCalendarEnd := currentStart.Add(-time.Nanosecond)
	if previousEnd.After(previousCalendarEnd) {
		previousEnd = previousCalendarEnd
	}

	return analyticsBounds{
		currentStart:  currentStart,
		currentEnd:    now,
		previousStart: previousStart,
		previousEnd:   previousEnd,
	}
}

func expenseCents(expense *pfinancev1.Expense) int64 {
	if expense == nil {
		return 0
	}
	if expense.AmountCents != 0 {
		return expense.AmountCents
	}
	return int64(math.Round(expense.Amount * 100))
}

func incomeCents(income *pfinancev1.Income) int64 {
	if income == nil {
		return 0
	}
	if income.AmountCents != 0 {
		return income.AmountCents
	}
	return int64(math.Round(income.Amount * 100))
}

func percentageChange(current, previous int64) (float64, bool) {
	if previous == 0 {
		return 0, false
	}
	return float64(current-previous) / float64(previous) * 100, true
}

func savingsRate(income, expenses int64) (float64, bool) {
	if income == 0 {
		return 0, false
	}
	return float64(income-expenses) / float64(income) * 100, true
}
