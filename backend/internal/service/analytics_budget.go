package service

import (
	"context"
	"math"
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

// normaliseBudgetCents converts a budget allowance between periods and rounds
// half away from zero without overflowing the intermediate multiplication.
func normaliseBudgetCents(amountCents int64, source pfinancev1.BudgetPeriod, target string) int64 {
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
		return quotient.Int64()
	}
	if quotient.Sign() < 0 {
		return math.MinInt64
	}
	return math.MaxInt64
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

// GetCategoryComparison compares category spending between current and previous periods.
func (s *FinanceService) GetCategoryComparison(ctx context.Context, req *connect.Request[pfinancev1.GetCategoryComparisonRequest]) (*connect.Response[pfinancev1.GetCategoryComparisonResponse], error) {
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
	currentStart, currentEnd, prevStart, prevEnd := categoryComparisonBounds(time.Now(), period)

	currentExpenses, _, err := s.store.ListExpenses(ctx, scope.userID, scope.groupID, &currentStart, &currentEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list current expenses", err)
	}
	previousExpenses, _, err := s.store.ListExpenses(ctx, scope.userID, scope.groupID, &prevStart, &prevEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list previous expenses", err)
	}

	if len(currentExpenses) == 0 && len(previousExpenses) == 0 {
		historicalExpenses, _, err := s.store.ListExpenses(ctx, scope.userID, scope.groupID, nil, nil, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list historical expenses", err)
		}
		if anchor, ok := latestExpenseDate(historicalExpenses, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED); ok {
			currentStart, currentEnd, prevStart, prevEnd = categoryComparisonBounds(anchor, period)
			currentExpenses, _, err = s.store.ListExpenses(ctx, scope.userID, scope.groupID, &currentStart, &currentEnd, 10000, "")
			if err != nil {
				return nil, auth.WrapStoreError("list anchored current expenses", err)
			}
			previousExpenses, _, err = s.store.ListExpenses(ctx, scope.userID, scope.groupID, &prevStart, &prevEnd, 10000, "")
			if err != nil {
				return nil, auth.WrapStoreError("list anchored previous expenses", err)
			}
		}
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
		budgets, _, err := s.store.ListBudgets(ctx, scope.userID, scope.groupID, false, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list budgets", err)
		}
		for _, budget := range budgets {
			if budget == nil {
				continue
			}
			allowance, err := budgetAmountCents(budget)
			if err != nil {
				return nil, analyticsCalculationError()
			}
			allowance = normaliseBudgetCents(allowance, budget.Period, period)

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
