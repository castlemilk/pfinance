package service

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (s *FinanceService) GetAnalyticsOverview(
	ctx context.Context,
	req *connect.Request[pfinancev1.GetAnalyticsOverviewRequest],
) (*connect.Response[pfinancev1.GetAnalyticsOverviewResponse], error) {
	return s.getAnalyticsOverviewAt(ctx, req, time.Now().UTC())
}

func (s *FinanceService) getAnalyticsOverviewAt(
	ctx context.Context,
	req *connect.Request[pfinancev1.GetAnalyticsOverviewRequest],
	now time.Time,
) (*connect.Response[pfinancev1.GetAnalyticsOverviewResponse], error) {
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

	bounds := analyticsPeriodBounds(now, req.Msg.Period)
	currentExpenses, err := s.listAllAnalyticsExpenses(
		ctx, scope, &bounds.currentStart, &bounds.currentEnd,
	)
	if err != nil {
		return nil, err
	}
	currentIncomes, err := s.listAllAnalyticsIncomes(
		ctx, scope, &bounds.currentStart, &bounds.currentEnd,
	)
	if err != nil {
		return nil, err
	}
	previousExpenses, err := s.listAllAnalyticsExpenses(
		ctx, scope, &bounds.previousStart, &bounds.previousEnd,
	)
	if err != nil {
		return nil, err
	}
	previousIncomes, err := s.listAllAnalyticsIncomes(
		ctx, scope, &bounds.previousStart, &bounds.previousEnd,
	)
	if err != nil {
		return nil, err
	}

	categoryTotals := make(map[pfinancev1.ExpenseCategory]int64)
	var currentExpenseTotal int64
	for _, expense := range currentExpenses {
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		currentExpenseTotal, err = checkedAddInt64(currentExpenseTotal, amount)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		if expense != nil {
			categoryTotals[expense.Category], err = checkedAddInt64(
				categoryTotals[expense.Category], amount,
			)
			if err != nil {
				return nil, analyticsCalculationError()
			}
		}
	}

	var currentIncomeTotal int64
	for _, income := range currentIncomes {
		amount, err := checkedIncomeCents(income)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		currentIncomeTotal, err = checkedAddInt64(currentIncomeTotal, amount)
		if err != nil {
			return nil, analyticsCalculationError()
		}
	}

	var previousExpenseTotal int64
	for _, expense := range previousExpenses {
		amount, err := checkedExpenseCents(expense)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		previousExpenseTotal, err = checkedAddInt64(previousExpenseTotal, amount)
		if err != nil {
			return nil, analyticsCalculationError()
		}
	}

	var previousIncomeTotal int64
	for _, income := range previousIncomes {
		amount, err := checkedIncomeCents(income)
		if err != nil {
			return nil, analyticsCalculationError()
		}
		previousIncomeTotal, err = checkedAddInt64(previousIncomeTotal, amount)
		if err != nil {
			return nil, analyticsCalculationError()
		}
	}

	currentNet, err := checkedSubInt64(currentIncomeTotal, currentExpenseTotal)
	if err != nil {
		return nil, analyticsCalculationError()
	}
	previousNet, err := checkedSubInt64(previousIncomeTotal, previousExpenseTotal)
	if err != nil {
		return nil, analyticsCalculationError()
	}
	currentTransactionCount, err := checkedAnalyticsTransactionCount(
		len(currentExpenses), len(currentIncomes),
	)
	if err != nil {
		return nil, analyticsCalculationError()
	}
	previousTransactionCount, err := checkedAnalyticsTransactionCount(
		len(previousExpenses), len(previousIncomes),
	)
	if err != nil {
		return nil, analyticsCalculationError()
	}

	largestCategory, largestCategoryAmount := largestPresentAnalyticsCategory(categoryTotals)

	savingsRatePercent, hasSavingsRate := savingsRate(currentIncomeTotal, currentExpenseTotal)
	incomeChangePercent, hasIncomeChange := percentageChange(currentIncomeTotal, previousIncomeTotal)
	expenseChangePercent, hasExpenseChange := percentageChange(currentExpenseTotal, previousExpenseTotal)

	return connect.NewResponse(&pfinancev1.GetAnalyticsOverviewResponse{
		CurrentStart:               timestamppb.New(bounds.currentStart),
		CurrentEnd:                 timestamppb.New(bounds.currentEnd),
		PreviousStart:              timestamppb.New(bounds.previousStart),
		PreviousEnd:                timestamppb.New(bounds.previousEnd),
		CurrentIncomeCents:         currentIncomeTotal,
		CurrentExpenseCents:        currentExpenseTotal,
		CurrentNetCents:            currentNet,
		PreviousIncomeCents:        previousIncomeTotal,
		PreviousExpenseCents:       previousExpenseTotal,
		PreviousNetCents:           previousNet,
		SavingsRatePercent:         savingsRatePercent,
		HasSavingsRate:             hasSavingsRate,
		IncomeChangePercent:        incomeChangePercent,
		HasIncomeChange:            hasIncomeChange,
		ExpenseChangePercent:       expenseChangePercent,
		HasExpenseChange:           hasExpenseChange,
		LargestCategory:            largestCategory,
		LargestCategoryAmountCents: largestCategoryAmount,
		CurrentTransactionCount:    currentTransactionCount,
		PreviousTransactionCount:   previousTransactionCount,
		HasCurrentData:             len(currentExpenses) > 0 || len(currentIncomes) > 0,
	}), nil
}

func largestPresentAnalyticsCategory(
	categoryTotals map[pfinancev1.ExpenseCategory]int64,
) (pfinancev1.ExpenseCategory, int64) {
	largestCategory := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED
	var largestAmount int64
	hasLargest := false
	for category, amount := range categoryTotals {
		if !hasLargest || amount > largestAmount ||
			(amount == largestAmount && category < largestCategory) {
			largestCategory = category
			largestAmount = amount
			hasLargest = true
		}
	}
	return largestCategory, largestAmount
}

func analyticsCalculationError() error {
	return connect.NewError(
		connect.CodeInternal,
		errors.New("analytics overview could not be calculated"),
	)
}
