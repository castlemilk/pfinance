package service

import (
	"context"
	"errors"
	"math"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
)

func TestGetAnalyticsOverviewAtAggregatesAllPagesAndReturnsExactBounds(t *testing.T) {
	const userID = "user-1"
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)
	currentStart := time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC)
	currentEnd := now
	previousStart := time.Date(2026, time.June, 1, 0, 0, 0, 0, time.UTC)
	previousEnd := time.Date(2026, time.June, 13, 10, 30, 0, 0, time.UTC)

	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().
		ListExpenses(gomock.Any(), userID, "", &currentStart, &currentEnd, int32(1000), "").
		Return([]*pfinancev1.Expense{
			{Id: "current-expense-1", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, AmountCents: 5000, Amount: 999},
			{Id: "current-expense-2", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING, AmountCents: 5000, Amount: 999},
		}, "current-expenses-page-2", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), userID, "", &currentStart, &currentEnd, int32(1000), "current-expenses-page-2").
		Return([]*pfinancev1.Expense{
			{Id: "current-expense-3", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, Amount: 25.506},
		}, "", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), userID, "", &currentStart, &currentEnd, int32(1000), "").
		Return([]*pfinancev1.Income{
			{Id: "current-income-1", AmountCents: 20000, Amount: 999},
		}, "current-incomes-page-2", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), userID, "", &currentStart, &currentEnd, int32(1000), "current-incomes-page-2").
		Return([]*pfinancev1.Income{
			{Id: "current-income-2", Amount: 50.006},
		}, "", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), userID, "", &previousStart, &previousEnd, int32(1000), "").
		Return([]*pfinancev1.Expense{
			{Id: "previous-expense-1", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, AmountCents: 2000},
		}, "", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), userID, "", &previousStart, &previousEnd, int32(1000), "").
		Return([]*pfinancev1.Income{
			{Id: "previous-income-1", AmountCents: 10000},
			{Id: "previous-income-2", Amount: 50},
		}, "", nil)

	resp, err := service.getAnalyticsOverviewAt(
		testProContext(userID),
		connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{
			UserId: "forged-user-id",
			Period: pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH,
		}),
		now,
	)
	if err != nil {
		t.Fatalf("getAnalyticsOverviewAt() unexpected error: %v", err)
	}

	if got := resp.Msg.CurrentStart.AsTime(); got != currentStart {
		t.Fatalf("current start = %v, want %v", got, currentStart)
	}
	if got := resp.Msg.CurrentEnd.AsTime(); got != currentEnd {
		t.Fatalf("current end = %v, want %v", got, currentEnd)
	}
	if got := resp.Msg.PreviousStart.AsTime(); got != previousStart {
		t.Fatalf("previous start = %v, want %v", got, previousStart)
	}
	if got := resp.Msg.PreviousEnd.AsTime(); got != previousEnd {
		t.Fatalf("previous end = %v, want %v", got, previousEnd)
	}

	const (
		wantCurrentIncome   = int64(25001)
		wantCurrentExpenses = int64(12551)
		wantPreviousIncome  = int64(15000)
		wantPreviousExpense = int64(2000)
	)
	if resp.Msg.CurrentIncomeCents != wantCurrentIncome ||
		resp.Msg.CurrentExpenseCents != wantCurrentExpenses ||
		resp.Msg.CurrentNetCents != wantCurrentIncome-wantCurrentExpenses {
		t.Fatalf("current totals = income %d, expenses %d, net %d",
			resp.Msg.CurrentIncomeCents, resp.Msg.CurrentExpenseCents, resp.Msg.CurrentNetCents)
	}
	if resp.Msg.PreviousIncomeCents != wantPreviousIncome ||
		resp.Msg.PreviousExpenseCents != wantPreviousExpense ||
		resp.Msg.PreviousNetCents != wantPreviousIncome-wantPreviousExpense {
		t.Fatalf("previous totals = income %d, expenses %d, net %d",
			resp.Msg.PreviousIncomeCents, resp.Msg.PreviousExpenseCents, resp.Msg.PreviousNetCents)
	}

	wantSavingsRate, _ := savingsRate(wantCurrentIncome, wantCurrentExpenses)
	wantIncomeChange, _ := percentageChange(wantCurrentIncome, wantPreviousIncome)
	wantExpenseChange, _ := percentageChange(wantCurrentExpenses, wantPreviousExpense)
	assertFloatClose(t, "savings rate", resp.Msg.SavingsRatePercent, wantSavingsRate)
	assertFloatClose(t, "income change", resp.Msg.IncomeChangePercent, wantIncomeChange)
	assertFloatClose(t, "expense change", resp.Msg.ExpenseChangePercent, wantExpenseChange)
	if !resp.Msg.HasSavingsRate || !resp.Msg.HasIncomeChange || !resp.Msg.HasExpenseChange {
		t.Fatalf("presence flags = savings %v, income %v, expenses %v, want all true",
			resp.Msg.HasSavingsRate, resp.Msg.HasIncomeChange, resp.Msg.HasExpenseChange)
	}
	if resp.Msg.LargestCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD ||
		resp.Msg.LargestCategoryAmountCents != 5000 {
		t.Fatalf("largest category = (%v, %d), want (FOOD, 5000)",
			resp.Msg.LargestCategory, resp.Msg.LargestCategoryAmountCents)
	}
	if resp.Msg.CurrentTransactionCount != 5 || resp.Msg.PreviousTransactionCount != 3 {
		t.Fatalf("transaction counts = current %d, previous %d, want 5 and 3",
			resp.Msg.CurrentTransactionCount, resp.Msg.PreviousTransactionCount)
	}
	if !resp.Msg.HasCurrentData {
		t.Fatal("has_current_data = false, want true")
	}
}

func TestGetAnalyticsOverviewAtPersonalScopeAndCurrentDataPresence(t *testing.T) {
	const authenticatedUserID = "owner"
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)

	tests := []struct {
		name            string
		requestedUserID string
		currentExpenses []*pfinancev1.Expense
		currentIncomes  []*pfinancev1.Income
		wantCurrentData bool
		wantCount       int32
		wantSavingsRate bool
	}{
		{
			name:            "empty user id and no expenses still has zero-amount income data",
			requestedUserID: "",
			currentIncomes:  []*pfinancev1.Income{{Id: "zero-income"}},
			wantCurrentData: true,
			wantCount:       1,
			wantSavingsRate: false,
		},
		{
			name:            "forged user id and no income still has zero-amount expense data",
			requestedUserID: "victim",
			currentExpenses: []*pfinancev1.Expense{{Id: "zero-expense", Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD}},
			wantCurrentData: true,
			wantCount:       1,
			wantSavingsRate: false,
		},
		{
			name:            "neither collection has a transaction",
			requestedUserID: "",
			wantCurrentData: false,
			wantCount:       0,
			wantSavingsRate: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			mockStore := store.NewMockStore(ctrl)
			service := NewFinanceService(mockStore, nil, nil)
			expectOverviewWindows(
				mockStore,
				analyticsScope{userID: authenticatedUserID},
				bounds,
				tt.currentExpenses,
				tt.currentIncomes,
				nil,
				nil,
			)

			resp, err := service.getAnalyticsOverviewAt(
				testProContext(authenticatedUserID),
				connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{
					UserId: tt.requestedUserID,
					Period: pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH,
				}),
				now,
			)
			if err != nil {
				t.Fatalf("getAnalyticsOverviewAt() unexpected error: %v", err)
			}
			if resp.Msg.HasCurrentData != tt.wantCurrentData {
				t.Fatalf("has_current_data = %v, want %v", resp.Msg.HasCurrentData, tt.wantCurrentData)
			}
			if resp.Msg.CurrentTransactionCount != tt.wantCount {
				t.Fatalf("current transaction count = %d, want %d", resp.Msg.CurrentTransactionCount, tt.wantCount)
			}
			if resp.Msg.HasSavingsRate != tt.wantSavingsRate {
				t.Fatalf("has_savings_rate = %v, want %v", resp.Msg.HasSavingsRate, tt.wantSavingsRate)
			}
			if resp.Msg.HasIncomeChange || resp.Msg.HasExpenseChange {
				t.Fatalf("zero previous totals reported change presence: income=%v expenses=%v",
					resp.Msg.HasIncomeChange, resp.Msg.HasExpenseChange)
			}
		})
	}
}

func TestGetAnalyticsOverviewAtGroupScopeRequiresMembership(t *testing.T) {
	const (
		userID  = "member"
		groupID = "group-1"
	)
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)

	t.Run("member receives group-wide overview", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		mockStore := store.NewMockStore(ctrl)
		service := NewFinanceService(mockStore, nil, nil)

		mockStore.EXPECT().GetGroup(gomock.Any(), groupID).Return(&pfinancev1.FinanceGroup{
			Id:        groupID,
			OwnerId:   "owner",
			MemberIds: []string{userID},
		}, nil)
		expectOverviewWindows(mockStore, analyticsScope{groupID: groupID}, bounds, nil, nil, nil, nil)

		resp, err := service.getAnalyticsOverviewAt(
			testProContext(userID),
			connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{GroupId: groupID}),
			now,
		)
		if err != nil {
			t.Fatalf("getAnalyticsOverviewAt() unexpected error: %v", err)
		}
		if resp.Msg.HasCurrentData {
			t.Fatal("empty group overview has_current_data = true, want false")
		}
	})

	t.Run("non-member is denied", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		mockStore := store.NewMockStore(ctrl)
		service := NewFinanceService(mockStore, nil, nil)

		mockStore.EXPECT().GetGroup(gomock.Any(), groupID).Return(&pfinancev1.FinanceGroup{
			Id:      groupID,
			OwnerId: "owner",
		}, nil)

		_, err := service.getAnalyticsOverviewAt(
			testProContext(userID),
			connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{GroupId: groupID}),
			now,
		)
		if got := connect.CodeOf(err); got != connect.CodePermissionDenied {
			t.Fatalf("non-member code = %v, want %v (error %v)", got, connect.CodePermissionDenied, err)
		}
	})
}

func TestGetAnalyticsOverviewAtRequiresAuthAndPro(t *testing.T) {
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)

	t.Run("requires authentication", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		service := NewFinanceService(store.NewMockStore(ctrl), nil, nil)

		_, err := service.getAnalyticsOverviewAt(
			context.Background(),
			connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{}),
			now,
		)
		if got := connect.CodeOf(err); got != connect.CodeUnauthenticated {
			t.Fatalf("unauthenticated code = %v, want %v (error %v)", got, connect.CodeUnauthenticated, err)
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		const userID = "free-user"
		ctrl := gomock.NewController(t)
		mockStore := store.NewMockStore(ctrl)
		service := NewFinanceService(mockStore, nil, nil)
		ctx := auth.WithUserClaims(context.Background(), &auth.UserClaims{UID: userID})

		mockStore.EXPECT().GetUser(gomock.Any(), userID).Return(nil, errors.New("not found"))

		_, err := service.getAnalyticsOverviewAt(
			ctx,
			connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{}),
			now,
		)
		if got := connect.CodeOf(err); got != connect.CodePermissionDenied {
			t.Fatalf("free-tier code = %v, want %v (error %v)", got, connect.CodePermissionDenied, err)
		}
	})
}

func TestGetAnalyticsOverviewAtMapsStoreErrors(t *testing.T) {
	const userID = "user-1"
	now := time.Date(2026, time.July, 13, 10, 30, 0, 0, time.UTC)
	bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)
	storeErr := errors.New("store unavailable")

	tests := []struct {
		name        string
		setup       func(*store.MockStore)
		wantMessage string
	}{
		{
			name: "current expenses",
			setup: func(mockStore *store.MockStore) {
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
					Return(nil, "", storeErr)
			},
			wantMessage: "failed to list expenses: store unavailable",
		},
		{
			name: "current incomes",
			setup: func(mockStore *store.MockStore) {
				gomock.InOrder(
					mockStore.EXPECT().
						ListExpenses(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
						Return(nil, "", nil),
					mockStore.EXPECT().
						ListIncomes(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
						Return(nil, "", storeErr),
				)
			},
			wantMessage: "failed to list incomes: store unavailable",
		},
		{
			name: "previous expenses",
			setup: func(mockStore *store.MockStore) {
				gomock.InOrder(
					mockStore.EXPECT().
						ListExpenses(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
						Return(nil, "", nil),
					mockStore.EXPECT().
						ListIncomes(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
						Return(nil, "", nil),
					mockStore.EXPECT().
						ListExpenses(gomock.Any(), userID, "", &bounds.previousStart, &bounds.previousEnd, int32(1000), "").
						Return(nil, "", storeErr),
				)
			},
			wantMessage: "failed to list expenses: store unavailable",
		},
		{
			name: "previous incomes",
			setup: func(mockStore *store.MockStore) {
				gomock.InOrder(
					mockStore.EXPECT().
						ListExpenses(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
						Return(nil, "", nil),
					mockStore.EXPECT().
						ListIncomes(gomock.Any(), userID, "", &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
						Return(nil, "", nil),
					mockStore.EXPECT().
						ListExpenses(gomock.Any(), userID, "", &bounds.previousStart, &bounds.previousEnd, int32(1000), "").
						Return(nil, "", nil),
					mockStore.EXPECT().
						ListIncomes(gomock.Any(), userID, "", &bounds.previousStart, &bounds.previousEnd, int32(1000), "").
						Return(nil, "", storeErr),
				)
			},
			wantMessage: "failed to list incomes: store unavailable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			mockStore := store.NewMockStore(ctrl)
			service := NewFinanceService(mockStore, nil, nil)
			tt.setup(mockStore)

			_, err := service.getAnalyticsOverviewAt(
				testProContext(userID),
				connect.NewRequest(&pfinancev1.GetAnalyticsOverviewRequest{}),
				now,
			)
			if err == nil {
				t.Fatal("getAnalyticsOverviewAt() error = nil, want store error")
			}
			if got := connect.CodeOf(err); got != connect.CodeUnknown {
				t.Fatalf("store error code = %v, want %v", got, connect.CodeUnknown)
			}
			if !strings.Contains(err.Error(), tt.wantMessage) {
				t.Fatalf("store error = %q, want substring %q", err, tt.wantMessage)
			}
		})
	}
}

func expectOverviewWindows(
	mockStore *store.MockStore,
	scope analyticsScope,
	bounds analyticsBounds,
	currentExpenses []*pfinancev1.Expense,
	currentIncomes []*pfinancev1.Income,
	previousExpenses []*pfinancev1.Expense,
	previousIncomes []*pfinancev1.Income,
) {
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), scope.userID, scope.groupID, &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
		Return(currentExpenses, "", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), scope.userID, scope.groupID, &bounds.currentStart, &bounds.currentEnd, int32(1000), "").
		Return(currentIncomes, "", nil)
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), scope.userID, scope.groupID, &bounds.previousStart, &bounds.previousEnd, int32(1000), "").
		Return(previousExpenses, "", nil)
	mockStore.EXPECT().
		ListIncomes(gomock.Any(), scope.userID, scope.groupID, &bounds.previousStart, &bounds.previousEnd, int32(1000), "").
		Return(previousIncomes, "", nil)
}

func assertFloatClose(t *testing.T, name string, got, want float64) {
	t.Helper()
	if math.Abs(got-want) > 1e-9 {
		t.Fatalf("%s = %.12f, want %.12f", name, got, want)
	}
}
