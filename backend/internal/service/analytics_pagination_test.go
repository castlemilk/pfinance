package service

import (
	"context"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
)

func TestListAllAnalyticsTransactionsLoadsEveryPageInOrder(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	scope := analyticsScope{userID: "user-1"}
	start := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)

	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "user-1", "", &start, &end, int32(1000), "").
		Return([]*pfinancev1.Expense{{Id: "expense-1"}, {Id: "expense-2"}}, "expenses-page-2", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "user-1", "", &start, &end, int32(1000), "expenses-page-2").
		Return([]*pfinancev1.Expense{{Id: "expense-3"}}, "", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "user-1", "", &start, &end, int32(1000), "").
		Return([]*pfinancev1.Income{{Id: "income-1"}}, "incomes-page-2", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "user-1", "", &start, &end, int32(1000), "incomes-page-2").
		Return([]*pfinancev1.Income{{Id: "income-2"}, {Id: "income-3"}}, "", nil)

	expenses, err := service.listAllAnalyticsExpenses(context.Background(), scope, &start, &end)
	if err != nil {
		t.Fatalf("listAllAnalyticsExpenses() unexpected error: %v", err)
	}
	if got, want := expenseIDs(expenses), []string{"expense-1", "expense-2", "expense-3"}; !equalStrings(got, want) {
		t.Fatalf("expense IDs = %v, want %v", got, want)
	}

	incomes, err := service.listAllAnalyticsIncomes(context.Background(), scope, &start, &end)
	if err != nil {
		t.Fatalf("listAllAnalyticsIncomes() unexpected error: %v", err)
	}
	if got, want := incomeIDs(incomes), []string{"income-1", "income-2", "income-3"}; !equalStrings(got, want) {
		t.Fatalf("income IDs = %v, want %v", got, want)
	}
}

func TestListAllAnalyticsExpensesRejectsRepeatedPaginationToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	scope := analyticsScope{groupID: "group-1"}

	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "", "group-1", nil, nil, int32(1000), "").
		Return([]*pfinancev1.Expense{{Id: "expense-1"}}, "repeat", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "", "group-1", nil, nil, int32(1000), "repeat").
		Return([]*pfinancev1.Expense{{Id: "expense-2"}}, "repeat", nil)

	_, err := service.listAllAnalyticsExpenses(context.Background(), scope, nil, nil)
	assertRepeatedPaginationTokenError(t, err)
}

func TestListAllAnalyticsIncomesRejectsRepeatedPaginationToken(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	scope := analyticsScope{userID: "user-1"}

	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "user-1", "", nil, nil, int32(1000), "").
		Return([]*pfinancev1.Income{{Id: "income-1"}}, "repeat", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), "user-1", "", nil, nil, int32(1000), "repeat").
		Return([]*pfinancev1.Income{{Id: "income-2"}}, "repeat", nil)

	_, err := service.listAllAnalyticsIncomes(context.Background(), scope, nil, nil)
	assertRepeatedPaginationTokenError(t, err)
}

func assertRepeatedPaginationTokenError(t *testing.T, err error) {
	t.Helper()
	if err == nil {
		t.Fatal("pagination loader error = nil, want repeated-token error")
	}
	if got := connect.CodeOf(err); got != connect.CodeInternal {
		t.Fatalf("pagination loader code = %v, want %v", got, connect.CodeInternal)
	}
	if !strings.Contains(err.Error(), "pagination token repeated") {
		t.Fatalf("pagination loader error = %q, want repeated-token message", err)
	}
}

func expenseIDs(expenses []*pfinancev1.Expense) []string {
	ids := make([]string, len(expenses))
	for i, expense := range expenses {
		ids[i] = expense.Id
	}
	return ids
}

func incomeIDs(incomes []*pfinancev1.Income) []string {
	ids := make([]string, len(incomes))
	for i, income := range incomes {
		ids[i] = income.Id
	}
	return ids
}

func equalStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
