package service

import (
	"math"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestNormaliseBudgetCentsCheckedRejectsOverflow(t *testing.T) {
	tests := []struct {
		name   string
		amount int64
	}{
		{name: "positive", amount: math.MaxInt64},
		{name: "negative", amount: math.MinInt64},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := normaliseBudgetCentsChecked(
				tt.amount,
				pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY,
				"year",
			)
			if err == nil {
				t.Fatal("normaliseBudgetCentsChecked error = nil, want overflow error")
			}
		})
	}
}

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
			ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "").
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

func TestCategoryComparisonBudgetOnlyCategoryAppearsWithZeroSpend(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	gomock.InOrder(
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), gomock.Any(), "").
			Return(nil, "", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), gomock.Any(), "").
			Return(nil, "", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", nil, gomock.Any(), gomock.Any(), "").
			Return(nil, "", nil),
	)
	mockStore.EXPECT().
		ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "").
		Return([]*pfinancev1.Budget{
			{
				Id:          "shopping-budget",
				Name:        "Shopping",
				AmountCents: 1_234,
				Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
				CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING},
				IsActive:    true,
			},
		}, "", nil)

	resp, err := service.GetCategoryComparison(testProContext("budget-user"), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
		CurrentPeriod:  "month",
		IncludeBudgets: true,
	}))
	if err != nil {
		t.Fatalf("GetCategoryComparison: %v", err)
	}

	item := categoryComparisonFor(t, resp.Msg, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING)
	if item.CurrentAmountCents != 0 || item.PreviousAmountCents != 0 {
		t.Fatalf("spend = (%d, %d), want (0, 0)", item.CurrentAmountCents, item.PreviousAmountCents)
	}
	if item.BudgetAmountCents != 1_234 {
		t.Fatalf("BudgetAmountCents = %d, want 1234", item.BudgetAmountCents)
	}
}

func TestCategoryComparisonBudgetNormalisationOverflowReturnsSanitizedInternalError(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	gomock.InOrder(
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), gomock.Any(), "").
			Return([]*pfinancev1.Expense{{Id: "food", AmountCents: 100, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD}}, "", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), gomock.Any(), "").
			Return(nil, "", nil),
	)
	mockStore.EXPECT().
		ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "").
		Return([]*pfinancev1.Budget{
			{
				Id:          "overflow-budget",
				AmountCents: math.MaxInt64,
				Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY,
				CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
				IsActive:    true,
			},
		}, "", nil)

	resp, err := service.GetCategoryComparison(testProContext("budget-user"), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
		CurrentPeriod:  "year",
		IncludeBudgets: true,
	}))
	if resp != nil {
		t.Fatalf("response = %#v, want nil", resp)
	}
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("error code = %s, want %s (err=%v)", connect.CodeOf(err), connect.CodeInternal, err)
	}
	if got := err.Error(); got != "internal: analytics overview could not be calculated" {
		t.Fatalf("error = %q, want sanitized analytics error", got)
	}
}

func TestCategoryComparisonLoadsAllExpenseAndBudgetPages(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	food := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD
	shopping := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING
	gomock.InOrder(
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").
			Return([]*pfinancev1.Expense{{Id: "current-1", AmountCents: 100, Category: food}}, "current-next", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "current-next").
			Return([]*pfinancev1.Expense{{Id: "current-2", AmountCents: 200, Category: food}}, "", nil),
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").
			Return([]*pfinancev1.Expense{{Id: "previous-1", AmountCents: 50, Category: food}}, "", nil),
		mockStore.EXPECT().
			ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "").
			Return([]*pfinancev1.Budget{{
				Id: "food-budget", AmountCents: 1_000, Period: pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
				CategoryIds: []pfinancev1.ExpenseCategory{food}, IsActive: true,
			}}, "budget-next", nil),
		mockStore.EXPECT().
			ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "budget-next").
			Return([]*pfinancev1.Budget{{
				Id: "shopping-budget", AmountCents: 2_000, Period: pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
				CategoryIds: []pfinancev1.ExpenseCategory{shopping}, IsActive: true,
			}}, "", nil),
	)

	resp, err := service.GetCategoryComparison(testProContext("budget-user"), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
		CurrentPeriod:  "month",
		IncludeBudgets: true,
	}))
	if err != nil {
		t.Fatalf("GetCategoryComparison: %v", err)
	}

	foodComparison := categoryComparisonFor(t, resp.Msg, food)
	if foodComparison.CurrentAmountCents != 300 || foodComparison.PreviousAmountCents != 50 || foodComparison.BudgetAmountCents != 1_000 {
		t.Fatalf("food comparison = %#v, want current=300 previous=50 budget=1000", foodComparison)
	}
	shoppingComparison := categoryComparisonFor(t, resp.Msg, shopping)
	if shoppingComparison.BudgetAmountCents != 2_000 {
		t.Fatalf("shopping budget = %d, want 2000", shoppingComparison.BudgetAmountCents)
	}
}

func TestCategoryComparisonLoadsAllHistoricalExpensePagesBeforeAnchoring(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	oldDate := time.Date(2020, time.January, 10, 12, 0, 0, 0, time.UTC)
	latestDate := time.Date(2025, time.October, 15, 12, 0, 0, 0, time.UTC)
	food := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD
	gomock.InOrder(
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", nil, gomock.Any(), int32(1000), "").Return([]*pfinancev1.Expense{
			{Id: "old", Date: timestamppb.New(oldDate), Category: food},
		}, "historical-next", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", nil, gomock.Any(), int32(1000), "historical-next").Return([]*pfinancev1.Expense{
			{Id: "latest", Date: timestamppb.New(latestDate), Category: food},
		}, "", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return([]*pfinancev1.Expense{
			{Id: "anchored", Date: timestamppb.New(latestDate), AmountCents: 500, Category: food},
		}, "", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "", nil),
	)

	resp, err := service.GetCategoryComparison(testProContext("budget-user"), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
		CurrentPeriod: "month",
	}))
	if err != nil {
		t.Fatalf("GetCategoryComparison: %v", err)
	}
	if got := categoryComparisonFor(t, resp.Msg, food).CurrentAmountCents; got != 500 {
		t.Fatalf("anchored current amount = %d, want 500", got)
	}
}

func TestCategoryComparisonRejectsRepeatedBudgetPageToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	food := pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD

	gomock.InOrder(
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return([]*pfinancev1.Expense{
			{Id: "current", AmountCents: 100, Category: food},
		}, "", nil),
		mockStore.EXPECT().ListExpenses(gomock.Any(), "budget-user", "", gomock.Any(), gomock.Any(), int32(1000), "").Return(nil, "", nil),
		mockStore.EXPECT().ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "").Return(nil, "loop", nil),
		mockStore.EXPECT().ListBudgets(gomock.Any(), "budget-user", "", false, int32(1000), "loop").Return(nil, "loop", nil),
	)

	resp, err := service.GetCategoryComparison(testProContext("budget-user"), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
		CurrentPeriod:  "month",
		IncludeBudgets: true,
	}))
	if resp != nil {
		t.Fatalf("response = %#v, want nil", resp)
	}
	if connect.CodeOf(err) != connect.CodeInternal {
		t.Fatalf("error code = %s, want internal (err=%v)", connect.CodeOf(err), err)
	}
	if got := err.Error(); got != "internal: analytics budget data is unavailable" {
		t.Fatalf("error = %q, want sanitized budget availability error", got)
	}
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
