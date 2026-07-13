package service

import (
	"context"
	"errors"
	"math/big"
	"sort"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

func budgetPeriodsPerYear(period pfinancev1.BudgetPeriod) int64 {
	switch period {
	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY:
		return 52
	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_FORTNIGHTLY:
		return 26
	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_QUARTERLY:
		return 4
	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_YEARLY:
		return 1
	default:
		return 12
	}
}

func analyticsPeriodsPerYear(period string) int64 {
	switch period {
	case "week", "weekly":
		return 52
	case "fortnight", "fortnightly":
		return 26
	case "quarter", "quarterly":
		return 4
	case "year", "yearly":
		return 1
	default:
		return 12
	}
}

// normaliseBudgetCentsChecked converts a budget allowance between periods and
// rounds half away from zero without overflowing intermediate or final values.
func normaliseBudgetCentsChecked(amountCents int64, source pfinancev1.BudgetPeriod, target string) (int64, error) {
	numerator := new(big.Int).Mul(
		big.NewInt(amountCents),
		big.NewInt(budgetPeriodsPerYear(source)),
	)
	denominator := big.NewInt(analyticsPeriodsPerYear(target))
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(numerator, denominator, remainder)

	doubledRemainder := new(big.Int).Lsh(new(big.Int).Abs(remainder), 1)
	if doubledRemainder.Cmp(denominator) >= 0 {
		if numerator.Sign() < 0 {
			quotient.Sub(quotient, big.NewInt(1))
		} else {
			quotient.Add(quotient, big.NewInt(1))
		}
	}
	if quotient.IsInt64() {
		return quotient.Int64(), nil
	}
	return 0, errors.New("normalised budget amount overflows int64")
}

func budgetAmountCents(budget *pfinancev1.Budget) (int64, error) {
	if budget == nil {
		return 0, nil
	}
	if budget.AmountCents != 0 {
		return budget.AmountCents, nil
	}
	return checkedLegacyDollarCents(budget.Amount)
}

func (s *FinanceService) listAllAnalyticsBudgets(
	ctx context.Context,
	scope analyticsScope,
) ([]*pfinancev1.Budget, error) {
	var budgets []*pfinancev1.Budget
	pageToken := ""
	seenTokens := make(map[string]struct{})

	for {
		page, nextPageToken, err := s.store.ListBudgets(
			ctx, scope.userID, scope.groupID, false, 1000, pageToken,
		)
		if err != nil {
			return nil, connect.NewError(
				connect.CodeInternal,
				errors.New("analytics budget data is unavailable"),
			)
		}
		budgets = append(budgets, page...)
		if nextPageToken == "" {
			return budgets, nil
		}
		if _, repeated := seenTokens[nextPageToken]; repeated {
			return nil, connect.NewError(
				connect.CodeInternal,
				errors.New("analytics budget data is unavailable"),
			)
		}
		seenTokens[nextPageToken] = struct{}{}
		pageToken = nextPageToken
	}
}

func categoryComparisonPeriodBounds(now time.Time, period string) analyticsBounds {
	if period != "week" {
		analyticsPeriod := pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH
		switch period {
		case "quarter":
			analyticsPeriod = pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_QUARTER
		case "year":
			analyticsPeriod = pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_YEAR
		}
		return analyticsPeriodBounds(now, analyticsPeriod)
	}

	now = now.UTC()
	currentStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).
		AddDate(0, 0, -int(now.Weekday()))
	previousStart := currentStart.AddDate(0, 0, -7)
	return analyticsBounds{
		currentStart:  currentStart,
		currentEnd:    now,
		previousStart: previousStart,
		previousEnd:   previousStart.Add(now.Sub(currentStart)),
	}
}

// GetCategoryComparison compares category spending between current and previous periods.
func (s *FinanceService) GetCategoryComparison(ctx context.Context, req *connect.Request[pfinancev1.GetCategoryComparisonRequest]) (*connect.Response[pfinancev1.GetCategoryComparisonResponse], error) {
	return s.getCategoryComparisonAt(ctx, req, time.Now())
}

func (s *FinanceService) getCategoryComparisonAt(
	ctx context.Context,
	req *connect.Request[pfinancev1.GetCategoryComparisonRequest],
	now time.Time,
) (*connect.Response[pfinancev1.GetCategoryComparisonResponse], error) {
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

	period := req.Msg.CurrentPeriod
	if period == "" {
		period = "month"
	}
	bounds := categoryComparisonPeriodBounds(now, period)

	currentExpenses, err := s.listAllAnalyticsExpenses(ctx, scope, &bounds.currentStart, &bounds.currentEnd)
	if err != nil {
		return nil, err
	}
	previousExpenses, err := s.listAllAnalyticsExpenses(ctx, scope, &bounds.previousStart, &bounds.previousEnd)
	if err != nil {
		return nil, err
	}

	currentByCategory := make(map[pfinancev1.ExpenseCategory]int64)
	previousByCategory := make(map[pfinancev1.ExpenseCategory]int64)
	for _, expense := range currentExpenses {
		if expense == nil {
			continue
		}
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		currentByCategory[expense.Category], err = checkedAddInt64(currentByCategory[expense.Category], amount)
		if err != nil {
			return nil, analyticsCalculationError()
		}
	}
	for _, expense := range previousExpenses {
		if expense == nil {
			continue
		}
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		previousByCategory[expense.Category], err = checkedAddInt64(previousByCategory[expense.Category], amount)
		if err != nil {
			return nil, analyticsCalculationError()
		}
	}

	allCategories := make(map[pfinancev1.ExpenseCategory]struct{})
	for category := range currentByCategory {
		allCategories[category] = struct{}{}
	}
	for category := range previousByCategory {
		allCategories[category] = struct{}{}
	}

	budgetByCategory := make(map[pfinancev1.ExpenseCategory]int64)
	var combinedBudgets []*pfinancev1.CombinedBudgetComparison
	if req.Msg.IncludeBudgets {
		// includeInactive=false makes the store the source of truth for active budgets.
		budgets, err := s.listAllAnalyticsBudgets(ctx, scope)
		if err != nil {
			return nil, err
		}
		for _, budget := range budgets {
			if budget == nil {
				continue
			}
			allowance, err := budgetAmountCents(budget)
			if err != nil {
				return nil, analyticsCalculationError()
			}
			allowance, err = normaliseBudgetCentsChecked(allowance, budget.Period, period)
			if err != nil {
				return nil, analyticsCalculationError()
			}

			uniqueCategories := make(map[pfinancev1.ExpenseCategory]struct{})
			for _, category := range budget.CategoryIds {
				uniqueCategories[category] = struct{}{}
			}
			if len(uniqueCategories) == 1 {
				for category := range uniqueCategories {
					budgetByCategory[category], err = checkedAddInt64(budgetByCategory[category], allowance)
					if err != nil {
						return nil, analyticsCalculationError()
					}
					allCategories[category] = struct{}{}
				}
				continue
			}
			if len(uniqueCategories) < 2 {
				continue
			}

			categories := make([]pfinancev1.ExpenseCategory, 0, len(uniqueCategories))
			var currentSpend int64
			for category := range uniqueCategories {
				categories = append(categories, category)
				currentSpend, err = checkedAddInt64(currentSpend, currentByCategory[category])
				if err != nil {
					return nil, analyticsCalculationError()
				}
			}
			sort.Slice(categories, func(i, j int) bool { return categories[i] < categories[j] })
			combinedBudgets = append(combinedBudgets, &pfinancev1.CombinedBudgetComparison{
				BudgetId:          budget.Id,
				Name:              budget.Name,
				Categories:        categories,
				AllowanceCents:    allowance,
				CurrentSpendCents: currentSpend,
			})
		}
		sort.Slice(combinedBudgets, func(i, j int) bool {
			if combinedBudgets[i].Name != combinedBudgets[j].Name {
				return combinedBudgets[i].Name < combinedBudgets[j].Name
			}
			return combinedBudgets[i].BudgetId < combinedBudgets[j].BudgetId
		})
	}

	categories := make([]*pfinancev1.CategorySpending, 0, len(allCategories))
	for category := range allCategories {
		current := currentByCategory[category]
		previous := previousByCategory[category]
		changePercent, _ := percentageChange(current, previous)
		budget := budgetByCategory[category]
		categories = append(categories, &pfinancev1.CategorySpending{
			Category:            category,
			CurrentAmount:       float64(current) / 100,
			CurrentAmountCents:  current,
			PreviousAmount:      float64(previous) / 100,
			PreviousAmountCents: previous,
			BudgetAmount:        float64(budget) / 100,
			BudgetAmountCents:   budget,
			ChangePercent:       changePercent,
		})
	}
	sort.Slice(categories, func(i, j int) bool {
		if categories[i].CurrentAmountCents != categories[j].CurrentAmountCents {
			return categories[i].CurrentAmountCents > categories[j].CurrentAmountCents
		}
		return categories[i].Category < categories[j].Category
	})

	return connect.NewResponse(&pfinancev1.GetCategoryComparisonResponse{
		Categories:      categories,
		CombinedBudgets: combinedBudgets,
	}), nil
}
