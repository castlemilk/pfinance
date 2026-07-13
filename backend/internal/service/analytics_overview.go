package service

import (
	"context"
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
		amount := expenseCents(expense)
		currentExpenseTotal += amount
		if expense != nil {
			categoryTotals[expense.Category] += amount
		}
	}

	var currentIncomeTotal int64
	for _, income := range currentIncomes {
		currentIncomeTotal += incomeCents(income)
	}

	var previousExpenseTotal int64
	for _, expense := range previousExpenses {
		previousExpenseTotal += expenseCents(expense)
	}

	var previousIncomeTotal int64
	for _, income := range previousIncomes {
		previousIncomeTotal += incomeCents(income)
	}

	largestCategory := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED
	var largestCategoryAmount int64
	for categoryValue := int32(pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED); categoryValue <= int32(pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER); categoryValue++ {
		category := pfinancev1.ExpenseCategory(categoryValue)
		if amount := categoryTotals[category]; amount > largestCategoryAmount {
			largestCategory = category
			largestCategoryAmount = amount
		}
	}

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
		CurrentNetCents:            currentIncomeTotal - currentExpenseTotal,
		PreviousIncomeCents:        previousIncomeTotal,
		PreviousExpenseCents:       previousExpenseTotal,
		PreviousNetCents:           previousIncomeTotal - previousExpenseTotal,
		SavingsRatePercent:         savingsRatePercent,
		HasSavingsRate:             hasSavingsRate,
		IncomeChangePercent:        incomeChangePercent,
		HasIncomeChange:            hasIncomeChange,
		ExpenseChangePercent:       expenseChangePercent,
		HasExpenseChange:           hasExpenseChange,
		LargestCategory:            largestCategory,
		LargestCategoryAmountCents: largestCategoryAmount,
		CurrentTransactionCount:    int32(len(currentExpenses) + len(currentIncomes)),
		PreviousTransactionCount:   int32(len(previousExpenses) + len(previousIncomes)),
		HasCurrentData:             len(currentExpenses) > 0 || len(currentIncomes) > 0,
	}), nil
}
