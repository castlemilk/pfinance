package service

import (
	"testing"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

func TestAnalyticsPeriodBounds(t *testing.T) {
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)

	tests := []struct {
		name   string
		period pfinancev1.AnalyticsPeriod
		want   analyticsBounds
	}{
		{
			name:   "month",
			period: pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH,
			want: analyticsBounds{
				currentStart:  time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC),
				currentEnd:    now,
				previousStart: time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC),
				previousEnd:   time.Date(2026, time.June, 13, 10, 30, 0, 0, time.UTC),
			},
		},
		{
			name:   "quarter",
			period: pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_QUARTER,
			want: analyticsBounds{
				currentStart:  time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC),
				currentEnd:    now,
				previousStart: time.Date(2026, time.April, 1, 0, 0, 0, 0, time.UTC),
				previousEnd:   time.Date(2026, time.April, 13, 10, 30, 0, 0, time.UTC),
			},
		},
		{
			name:   "year",
			period: pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_YEAR,
			want: analyticsBounds{
				currentStart:  time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC),
				currentEnd:    now,
				previousStart: time.Date(2025, time.January, 1, 0, 0, 0, 0, time.UTC),
				previousEnd:   time.Date(2025, time.July, 13, 10, 30, 0, 0, time.UTC),
			},
		},
		{
			name:   "unspecified defaults to month",
			period: pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_UNSPECIFIED,
			want: analyticsBounds{
				currentStart:  time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC),
				currentEnd:    now,
				previousStart: time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC),
				previousEnd:   time.Date(2026, time.June, 13, 10, 30, 0, 0, time.UTC),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := analyticsPeriodBounds(now, tt.period)
			if got != tt.want {
				t.Fatalf("analyticsPeriodBounds() = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestAnalyticsPeriodBoundsCapsPreviousPeriodAtCalendarEnd(t *testing.T) {
	now := time.Date(2026, time.March, 31, 23, 59, 59, 0, time.UTC)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)

	wantPreviousEnd := time.Date(2026, time.March, 1, 0, 0, 0, 0, time.UTC).Add(-time.Nanosecond)
	if bounds.previousEnd != wantPreviousEnd {
		t.Fatalf("previous end = %v, want capped calendar end %v", bounds.previousEnd, wantPreviousEnd)
	}
}

func TestAnalyticsPeriodBoundsUsesEqualElapsedDuration(t *testing.T) {
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)

	currentElapsed := bounds.currentEnd.Sub(bounds.currentStart)
	previousElapsed := bounds.previousEnd.Sub(bounds.previousStart)
	if previousElapsed != currentElapsed {
		t.Fatalf("previous elapsed duration = %v, want %v", previousElapsed, currentElapsed)
	}
}

func TestAnalyticsPeriodBoundsHandlesLeapYearElapsedDuration(t *testing.T) {
	now := time.Date(2024, time.February, 29, 12, 0, 0, 0, time.UTC)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_YEAR)

	wantPreviousEnd := time.Date(2023, time.March, 1, 12, 0, 0, 0, time.UTC)
	if bounds.previousEnd != wantPreviousEnd {
		t.Fatalf("previous end = %v, want %v", bounds.previousEnd, wantPreviousEnd)
	}
	if bounds.previousEnd.Sub(bounds.previousStart) != bounds.currentEnd.Sub(bounds.currentStart) {
		t.Fatal("leap-year previous period did not preserve elapsed duration")
	}
}

func TestAnalyticsPeriodBoundsConvertsNowToUTC(t *testing.T) {
	melbourne := time.FixedZone("AEST", 10*60*60)
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, melbourne)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)

	wantEnd := time.Date(2026, time.July, 13, 0, 30, 0, 0, time.UTC)
	wantStart := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	if bounds.currentEnd != wantEnd || bounds.currentStart != wantStart {
		t.Fatalf("UTC bounds = %+v, want current %v..%v", bounds, wantStart, wantEnd)
	}
}

func TestAnalyticsMoneyHelpersPreferCentsAndRoundLegacyDollars(t *testing.T) {
	tests := []struct {
		name string
		got  int64
		want int64
	}{
		{
			name: "expense cents override legacy dollars",
			got:  expenseCents(&pfinancev1.Expense{AmountCents: 1250, Amount: 99.99}),
			want: 1250,
		},
		{
			name: "expense zero cents falls back to rounded legacy dollars",
			got:  expenseCents(&pfinancev1.Expense{Amount: 12.346}),
			want: 1235,
		},
		{
			name: "income cents override legacy dollars",
			got:  incomeCents(&pfinancev1.Income{AmountCents: 4321, Amount: 88.88}),
			want: 4321,
		},
		{
			name: "income zero cents falls back to rounded legacy dollars",
			got:  incomeCents(&pfinancev1.Income{Amount: 43.216}),
			want: 4322,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.got != tt.want {
				t.Fatalf("money helper = %d, want %d", tt.got, tt.want)
			}
		})
	}
}

func TestPercentageChangePresence(t *testing.T) {
	if got, ok := percentageChange(150, 100); !ok || got != 50 {
		t.Fatalf("percentageChange(150, 100) = (%v, %v), want (50, true)", got, ok)
	}
	if got, ok := percentageChange(100, 0); ok || got != 0 {
		t.Fatalf("percentageChange(100, 0) = (%v, %v), want (0, false)", got, ok)
	}
}

func TestSavingsRatePresence(t *testing.T) {
	if got, ok := savingsRate(1000, 250); !ok || got != 75 {
		t.Fatalf("savingsRate(1000, 250) = (%v, %v), want (75, true)", got, ok)
	}
	if got, ok := savingsRate(0, 250); ok || got != 0 {
		t.Fatalf("savingsRate(0, 250) = (%v, %v), want (0, false)", got, ok)
	}
}
