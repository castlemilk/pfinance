package service

import (
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
)

func runCategoryBudgetComparison(
	t *testing.T,
	period string,
	budgets []*pfinancev1.Budget,
	includeBudgets bool,
) *pfinancev1.GetCategoryComparisonResponse {
	t.Helper()

	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	currentExpenses := []*pfinancev1.Expense{
		{Id: "food-current", AmountCents: 10_001, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
		{Id: "transport-current", AmountCents: 2_500, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION},
	}
	previousExpenses := []*pfinancev1.Expense{
		{Id: "food-previous", AmountCents: 5_000, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
	}

	gomock.InOrder(
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), gomock.Any(), "").
			Return(currentExpenses, "", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), gomock.Any(), "").
			Return(previousExpenses, "", nil),
	)
	if includeBudgets {
		mockStore.EXPECT().
			ListBudgets(gomock.Any(), "budget-user", "", false, int32(10000), "").
			Return(budgets, "", nil)
	}

	resp, err := service.GetCategoryComparison(testProContext("budget-user"), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
		CurrentPeriod:  period,
		IncludeBudgets: includeBudgets,
	}))
	if err != nil {
		t.Fatalf("GetCategoryComparison: %v", err)
	}
	return resp.Msg
}

func categoryComparisonFor(
	t *testing.T,
	resp *pfinancev1.GetCategoryComparisonResponse,
	category pfinancev1.ExpenseCategory,
) *pfinancev1.CategorySpending {
	t.Helper()
	for _, item := range resp.Categories {
		if item.Category == category {
			return item
		}
	}
	t.Fatalf("category %s not found", category)
	return nil
}

func TestCategoryComparisonBudgetNormalisesAllPeriods(t *testing.T) {
	tests := []struct {
		name       string
		source     pfinancev1.BudgetPeriod
		target     string
		wantCents  int64
		legacyOnly bool
	}{
		{name: "weekly to month", source: pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY, target: "month", wantCents: 4_333},
		{name: "fortnightly to month", source: pfinancev1.BudgetPeriod_BUDGET_PERIOD_FORTNIGHTLY, target: "month", wantCents: 2_167},
		{name: "monthly to month", source: pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, target: "month", wantCents: 1_000},
		{name: "quarterly to month", source: pfinancev1.BudgetPeriod_BUDGET_PERIOD_QUARTERLY, target: "month", wantCents: 333},
		{name: "yearly to month", source: pfinancev1.BudgetPeriod_BUDGET_PERIOD_YEARLY, target: "month", wantCents: 83},
		{name: "unspecified defaults to monthly", source: pfinancev1.BudgetPeriod_BUDGET_PERIOD_UNSPECIFIED, target: "", wantCents: 1_235, legacyOnly: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			budget := &pfinancev1.Budget{
				Id:          "period-budget",
				Name:        tt.name,
				AmountCents: 1_000,
				Period:      tt.source,
				CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
				IsActive:    true,
			}
			if tt.legacyOnly {
				budget.AmountCents = 0
				budget.Amount = 12.346
			}

			resp := runCategoryBudgetComparison(t, tt.target, []*pfinancev1.Budget{budget}, true)
			item := categoryComparisonFor(t, resp, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD)
			if item.BudgetAmountCents != tt.wantCents {
				t.Fatalf("BudgetAmountCents = %d, want %d", item.BudgetAmountCents, tt.wantCents)
			}
			if item.BudgetAmount != float64(tt.wantCents)/100 {
				t.Fatalf("BudgetAmount = %.10f, want %.10f", item.BudgetAmount, float64(tt.wantCents)/100)
			}
		})
	}
}

func TestCategoryComparisonBudgetSumsSinglesAndSeparatesCombined(t *testing.T) {
	budgets := []*pfinancev1.Budget{
		{
			Id: "food-weekly", Name: "Food weekly", AmountCents: 1_000,
			Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY,
			CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD}, IsActive: true,
		},
		{
			Id: "food-monthly", Name: "Food monthly", AmountCents: 500,
			Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD}, IsActive: true,
		},
		{
			Id: "combined-z", Name: "Household", AmountCents: 20_000,
			Period: pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			CategoryIds: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
			}, IsActive: true,
		},
		{
			Id: "combined-a", Name: "Household", AmountCents: 15_000,
			Period: pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			CategoryIds: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			}, IsActive: true,
		},
	}

	resp := runCategoryBudgetComparison(t, "month", budgets, true)
	food := categoryComparisonFor(t, resp, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD)
	if food.BudgetAmountCents != 4_833 {
		t.Fatalf("single-category food budget = %d, want 4833", food.BudgetAmountCents)
	}
	transport := categoryComparisonFor(t, resp, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION)
	if transport.BudgetAmountCents != 0 {
		t.Fatalf("combined budget leaked onto transport axis: %d", transport.BudgetAmountCents)
	}
	if len(resp.CombinedBudgets) != 2 {
		t.Fatalf("combined budget count = %d, want 2", len(resp.CombinedBudgets))
	}
	if resp.CombinedBudgets[0].BudgetId != "combined-a" || resp.CombinedBudgets[1].BudgetId != "combined-z" {
		t.Fatalf("combined budget order = [%s %s], want [combined-a combined-z]",
			resp.CombinedBudgets[0].BudgetId, resp.CombinedBudgets[1].BudgetId)
	}
	for _, combined := range resp.CombinedBudgets {
		if len(combined.Categories) != 2 {
			t.Fatalf("combined budget %s category count = %d, want 2 deduplicated categories", combined.BudgetId, len(combined.Categories))
		}
		if combined.CurrentSpendCents != 12_501 {
			t.Fatalf("combined budget %s spend = %d, want 12501", combined.BudgetId, combined.CurrentSpendCents)
		}
	}
}

func TestCategoryComparisonBudgetDisabledZerosAllBudgetFields(t *testing.T) {
	resp := runCategoryBudgetComparison(t, "month", nil, false)
	if len(resp.CombinedBudgets) != 0 {
		t.Fatalf("combined budgets returned while disabled: %d", len(resp.CombinedBudgets))
	}
	for _, item := range resp.Categories {
		if item.BudgetAmountCents != 0 || item.BudgetAmount != 0 {
			t.Fatalf("category %s budget = %d/%.2f while disabled", item.Category, item.BudgetAmountCents, item.BudgetAmount)
		}
	}
}
