package service

import (
	"math"
	"sort"
	"strings"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// DetectSubscriptions analyzes expense history for recurring patterns.
func DetectSubscriptions(expenses []*pfinancev1.Expense, existingRecurring []*pfinancev1.RecurringTransaction) []*pfinancev1.DetectedSubscription {
	// Group expenses by normalized merchant name
	groups := make(map[string][]*pfinancev1.Expense)
	for _, e := range expenses {
		key := normalizeMerchant(e.Description)
		groups[key] = append(groups[key], e)
	}

	// Build lookup for existing recurring descriptions
	existingSet := make(map[string]bool)
	for _, rt := range existingRecurring {
		existingSet[normalizeMerchant(rt.Description)] = true
	}

	var results []*pfinancev1.DetectedSubscription

	for name, expenseGroup := range groups {
		if len(expenseGroup) < 2 {
			continue
		}

		// Sort by date ascending
		sort.Slice(expenseGroup, func(i, j int) bool {
			if expenseGroup[i].Date == nil || expenseGroup[j].Date == nil {
				return expenseGroup[i].Date != nil
			}
			return expenseGroup[i].Date.AsTime().Before(expenseGroup[j].Date.AsTime())
		})

		// Calculate intervals between transactions (in days)
		var intervals []float64
		for i := 1; i < len(expenseGroup); i++ {
			if expenseGroup[i-1].Date == nil || expenseGroup[i].Date == nil {
				continue
			}
			days := expenseGroup[i].Date.AsTime().Sub(expenseGroup[i-1].Date.AsTime()).Hours() / 24
			if days > 0 {
				intervals = append(intervals, days)
			}
		}

		if len(intervals) == 0 {
			continue
		}

		// Detect frequency pattern
		freq, freqConfidence := detectFrequency(intervals)
		if freq == pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED {
			continue
		}

		// Calculate amount consistency
		var amounts []float64
		var totalAmount float64
		for _, e := range expenseGroup {
			amounts = append(amounts, e.Amount)
			totalAmount += e.Amount
		}
		avgAmount := totalAmount / float64(len(amounts))
		amountVariance := calculateVariance(amounts, avgAmount)
		amountConfidence := 1.0
		if avgAmount > 0 {
			cv := math.Sqrt(amountVariance) / avgAmount // coefficient of variation
			if cv > 0.25 {
				amountConfidence = 0.3
			} else if cv > 0.10 {
				amountConfidence = 0.7
			}
		}

		// Overall confidence score
		occurrenceBoost := math.Min(float64(len(expenseGroup))/5.0, 1.0)
		confidence := freqConfidence * amountConfidence * (0.5 + 0.5*occurrenceBoost)

		if confidence < 0.5 {
			continue
		}

		// Collect matched expense IDs
		var expenseIDs []string
		for _, e := range expenseGroup {
			expenseIDs = append(expenseIDs, e.Id)
		}

		// Determine last seen and expected next
		lastExpense := expenseGroup[len(expenseGroup)-1]
		var lastSeen *timestamppb.Timestamp
		var expectedNext *timestamppb.Timestamp
		if lastExpense.Date != nil {
			lastSeen = lastExpense.Date
			nextDate := calculateNextDate(lastExpense.Date.AsTime(), freq)
			expectedNext = timestamppb.New(nextDate)
		}

		// Get category from most common
		category := mostCommonCategory(expenseGroup)

		sub := &pfinancev1.DetectedSubscription{
			MerchantName:      expenseGroup[0].Description,
			NormalizedName:    name,
			Category:          category.String(),
			AverageAmount:     math.Round(avgAmount*100) / 100,
			AverageAmountCents: int64(math.Round(avgAmount * 100)),
			DetectedFrequency: freq,
			ConfidenceScore:   math.Round(confidence*100) / 100,
			OccurrenceCount:   int32(len(expenseGroup)),
			LastSeen:          lastSeen,
			ExpectedNext:      expectedNext,
			IsAlreadyTracked:  existingSet[name],
			MatchedExpenseIds: expenseIDs,
		}

		results = append(results, sub)
	}

	// Sort by confidence descending
	sort.Slice(results, func(i, j int) bool {
		return results[i].ConfidenceScore > results[j].ConfidenceScore
	})

	return results
}

func normalizeMerchant(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func detectFrequency(intervals []float64) (pfinancev1.ExpenseFrequency, float64) {
	if len(intervals) == 0 {
		return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED, 0
	}

	avgInterval := 0.0
	for _, d := range intervals {
		avgInterval += d
	}
	avgInterval /= float64(len(intervals))

	type freqMatch struct {
		freq       pfinancev1.ExpenseFrequency
		min, max   float64
		targetDays float64
	}

	patterns := []freqMatch{
		{pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_WEEKLY, 5, 9, 7},
		{pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_FORTNIGHTLY, 12, 16, 14},
		{pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY, 27, 34, 30.44},
		{pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_QUARTERLY, 85, 95, 91.3},
		{pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ANNUALLY, 355, 375, 365.25},
	}

	for _, p := range patterns {
		if avgInterval >= p.min && avgInterval <= p.max {
			// Calculate how many intervals match the pattern
			matchCount := 0
			for _, d := range intervals {
				if d >= p.min && d <= p.max {
					matchCount++
				}
			}
			matchRatio := float64(matchCount) / float64(len(intervals))
			return p.freq, matchRatio
		}
	}

	return pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED, 0
}

func calculateVariance(values []float64, mean float64) float64 {
	if len(values) < 2 {
		return 0
	}
	var sumSq float64
	for _, v := range values {
		d := v - mean
		sumSq += d * d
	}
	return sumSq / float64(len(values)-1)
}

func calculateNextDate(lastDate time.Time, freq pfinancev1.ExpenseFrequency) time.Time {
	switch freq {
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_WEEKLY:
		return lastDate.AddDate(0, 0, 7)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_FORTNIGHTLY:
		return lastDate.AddDate(0, 0, 14)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY:
		return lastDate.AddDate(0, 1, 0)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_QUARTERLY:
		return lastDate.AddDate(0, 3, 0)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ANNUALLY:
		return lastDate.AddDate(1, 0, 0)
	default:
		return lastDate.AddDate(0, 1, 0)
	}
}

func mostCommonCategory(expenses []*pfinancev1.Expense) pfinancev1.ExpenseCategory {
	counts := make(map[pfinancev1.ExpenseCategory]int)
	for _, e := range expenses {
		counts[e.Category]++
	}
	maxCount := 0
	best := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER
	for cat, count := range counts {
		if count > maxCount {
			maxCount = count
			best = cat
		}
	}
	return best
}
