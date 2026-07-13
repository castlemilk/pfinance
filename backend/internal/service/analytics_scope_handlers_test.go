package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type analyticsHandlerScopeFixture struct {
	name          string
	expectQueries func(*store.MockStore, string, string)
	invoke        func(*FinanceService, context.Context, string, string) error
}

func dailyAggregatesScopeFixture() analyticsHandlerScopeFixture {
	return analyticsHandlerScopeFixture{
		name: "daily_aggregates",
		expectQueries: func(mockStore *store.MockStore, userID, groupID string) {
			mockStore.EXPECT().
				GetDailyAggregates(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any()).
				Return(nil, nil)
		},
		invoke: func(service *FinanceService, ctx context.Context, userID, groupID string) error {
			start := time.Date(2026, time.January, 1, 0, 0, 0, 0, time.UTC)
			end := start.AddDate(0, 0, 1)
			_, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
				UserId:    userID,
				GroupId:   groupID,
				StartDate: timestamppb.New(start),
				EndDate:   timestamppb.New(end),
			}))
			return err
		},
	}
}

func spendingTrendsScopeFixture() analyticsHandlerScopeFixture {
	return analyticsHandlerScopeFixture{
		name: "spending_trends",
		expectQueries: func(mockStore *store.MockStore, userID, groupID string) {
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return([]*pfinancev1.Expense{{
					Id:     "expense-1",
					UserId: userID,
					Date:   timestamppb.Now(),
				}}, "", nil)
			mockStore.EXPECT().
				ListIncomes(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return(nil, "", nil)
		},
		invoke: func(service *FinanceService, ctx context.Context, userID, groupID string) error {
			_, err := service.GetSpendingTrends(ctx, connect.NewRequest(&pfinancev1.GetSpendingTrendsRequest{
				UserId:      userID,
				GroupId:     groupID,
				Granularity: pfinancev1.Granularity_GRANULARITY_MONTH,
				Periods:     1,
			}))
			return err
		},
	}
}

func categoryComparisonScopeFixture() analyticsHandlerScopeFixture {
	return analyticsHandlerScopeFixture{
		name: "category_comparison",
		expectQueries: func(mockStore *store.MockStore, userID, groupID string) {
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return([]*pfinancev1.Expense{{
					Id:       "expense-1",
					UserId:   userID,
					Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Date:     timestamppb.Now(),
				}}, "", nil).
				Times(2)
		},
		invoke: func(service *FinanceService, ctx context.Context, userID, groupID string) error {
			_, err := service.GetCategoryComparison(ctx, connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
				UserId:        userID,
				GroupId:       groupID,
				CurrentPeriod: "month",
			}))
			return err
		},
	}
}

func anomaliesScopeFixture() analyticsHandlerScopeFixture {
	return analyticsHandlerScopeFixture{
		name: "anomalies",
		expectQueries: func(mockStore *store.MockStore, userID, groupID string) {
			gomock.InOrder(
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(1000), "").
					Return(nil, "", nil),
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), userID, groupID, nil, nil, int32(1000), "").
					Return(nil, "", nil),
			)
		},
		invoke: func(service *FinanceService, ctx context.Context, userID, groupID string) error {
			_, err := service.DetectAnomalies(ctx, connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
				UserId:       userID,
				GroupId:      groupID,
				LookbackDays: 30,
				Sensitivity:  0.5,
			}))
			return err
		},
	}
}

func forecastScopeFixture() analyticsHandlerScopeFixture {
	return analyticsHandlerScopeFixture{
		name: "forecast",
		expectQueries: func(mockStore *store.MockStore, userID, groupID string) {
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return(nil, "", nil)
			mockStore.EXPECT().
				ListIncomes(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return(nil, "", nil)
			mockStore.EXPECT().
				ListRecurringTransactions(
					gomock.Any(), userID, groupID,
					pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
					false, false, int32(10000), "",
				).
				Return(nil, "", nil)
		},
		invoke: func(service *FinanceService, ctx context.Context, userID, groupID string) error {
			_, err := service.GetCashFlowForecast(ctx, connect.NewRequest(&pfinancev1.GetCashFlowForecastRequest{
				UserId:       userID,
				GroupId:      groupID,
				ForecastDays: 1,
			}))
			return err
		},
	}
}

func waterfallScopeFixture() analyticsHandlerScopeFixture {
	return analyticsHandlerScopeFixture{
		name: "waterfall",
		expectQueries: func(mockStore *store.MockStore, userID, groupID string) {
			mockStore.EXPECT().
				ListIncomes(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return(nil, "", nil)
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), userID, groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return(nil, "", nil)
			if groupID == "" {
				mockStore.EXPECT().
					GetTaxConfig(gomock.Any(), userID, "").
					Return(nil, errors.New("tax config not found"))
			}
		},
		invoke: func(service *FinanceService, ctx context.Context, userID, groupID string) error {
			_, err := service.GetWaterfallData(ctx, connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
				UserId:  userID,
				GroupId: groupID,
				Period:  "month",
			}))
			return err
		},
	}
}

func TestAnalyticsHandlersEnforceScope(t *testing.T) {
	const (
		ownerID  = "owner"
		victimID = "victim"
		groupID  = "group-1"
	)

	fixtures := []analyticsHandlerScopeFixture{
		dailyAggregatesScopeFixture(),
		spendingTrendsScopeFixture(),
		categoryComparisonScopeFixture(),
		anomaliesScopeFixture(),
		forecastScopeFixture(),
		waterfallScopeFixture(),
	}

	for _, fixture := range fixtures {
		fixture := fixture
		t.Run(fixture.name, func(t *testing.T) {
			personalCases := []struct {
				name            string
				requestedUserID string
			}{
				{name: "personal_empty_user_id"},
				{name: "personal_forged_user_id", requestedUserID: victimID},
			}
			for _, tc := range personalCases {
				t.Run(tc.name, func(t *testing.T) {
					ctrl := gomock.NewController(t)
					mockStore := store.NewMockStore(ctrl)
					fixture.expectQueries(mockStore, ownerID, "")

					service := NewFinanceService(mockStore, nil, nil)
					if err := fixture.invoke(service, testProContext(ownerID), tc.requestedUserID, ""); err != nil {
						t.Fatalf("handler returned unexpected error: %v", err)
					}
				})
			}

			t.Run("group_member", func(t *testing.T) {
				ctrl := gomock.NewController(t)
				mockStore := store.NewMockStore(ctrl)
				mockStore.EXPECT().
					GetGroup(gomock.Any(), groupID).
					Return(&pfinancev1.FinanceGroup{
						Id:        groupID,
						OwnerId:   "someone-else",
						MemberIds: []string{ownerID},
					}, nil)
				fixture.expectQueries(mockStore, "", groupID)

				service := NewFinanceService(mockStore, nil, nil)
				if err := fixture.invoke(service, testProContext(ownerID), victimID, groupID); err != nil {
					t.Fatalf("handler returned unexpected error: %v", err)
				}
			})

			t.Run("group_non_member", func(t *testing.T) {
				ctrl := gomock.NewController(t)
				mockStore := store.NewMockStore(ctrl)
				mockStore.EXPECT().
					GetGroup(gomock.Any(), groupID).
					Return(&pfinancev1.FinanceGroup{
						Id:        groupID,
						OwnerId:   "someone-else",
						MemberIds: []string{victimID},
					}, nil)

				service := NewFinanceService(mockStore, nil, nil)
				err := fixture.invoke(service, testProContext(ownerID), victimID, groupID)
				if code := connect.CodeOf(err); code != connect.CodePermissionDenied {
					t.Fatalf("handler error code = %v, want %v (error: %v)", code, connect.CodePermissionDenied, err)
				}
			})
		})
	}
}

func TestGroupAnalyticsIncludesAllMembersWithMemoryStore(t *testing.T) {
	const (
		groupID  = "group-1"
		memberA  = "member-a"
		memberB  = "member-b"
		forgedID = "victim"
	)

	ctx := testProContext(memberA)
	memoryStore := store.NewMemoryStore()
	service := NewFinanceService(memoryStore, nil, nil)
	if err := memoryStore.CreateGroup(ctx, &pfinancev1.FinanceGroup{
		Id:        groupID,
		OwnerId:   memberA,
		MemberIds: []string{memberA, memberB},
	}); err != nil {
		t.Fatalf("CreateGroup() error: %v", err)
	}

	expenseDate := time.Date(2026, time.January, 15, 12, 0, 0, 0, time.UTC)
	for _, expense := range []*pfinancev1.Expense{
		{
			Id:          "expense-a",
			UserId:      memberA,
			GroupId:     groupID,
			Amount:      10,
			AmountCents: 1000,
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			Date:        timestamppb.New(expenseDate),
		},
		{
			Id:          "expense-b",
			UserId:      memberB,
			GroupId:     groupID,
			Amount:      20,
			AmountCents: 2000,
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
			Date:        timestamppb.New(expenseDate),
		},
	} {
		if err := memoryStore.CreateExpense(ctx, expense); err != nil {
			t.Fatalf("CreateExpense(%q) error: %v", expense.Id, err)
		}
	}

	response, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
		UserId:    forgedID,
		GroupId:   groupID,
		StartDate: timestamppb.New(expenseDate.Add(-time.Hour)),
		EndDate:   timestamppb.New(expenseDate.Add(time.Hour)),
	}))
	if err != nil {
		t.Fatalf("GetDailyAggregates() error: %v", err)
	}
	if len(response.Msg.Aggregates) != 1 {
		t.Fatalf("GetDailyAggregates() aggregate count = %d, want 1", len(response.Msg.Aggregates))
	}
	aggregate := response.Msg.Aggregates[0]
	if aggregate.TransactionCount != 2 {
		t.Fatalf("GetDailyAggregates() transaction count = %d, want 2", aggregate.TransactionCount)
	}
	if aggregate.TotalAmountCents != 3000 {
		t.Fatalf("GetDailyAggregates() total cents = %d, want 3000", aggregate.TotalAmountCents)
	}
}

func TestAnalyticsHandlerScopeCoversFallbackBranches(t *testing.T) {
	const (
		ownerID = "owner"
		groupID = "group-1"
	)

	t.Run("spending_trends_historical_and_anchored_queries", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		mockStore := store.NewMockStore(ctrl)
		service := NewFinanceService(mockStore, nil, nil)
		anchor := time.Date(2025, time.October, 15, 12, 0, 0, 0, time.UTC)

		gomock.InOrder(
			mockStore.EXPECT().
				GetGroup(gomock.Any(), groupID).
				Return(&pfinancev1.FinanceGroup{
					Id:        groupID,
					OwnerId:   "someone-else",
					MemberIds: []string{ownerID},
				}, nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return(nil, "", nil),
			mockStore.EXPECT().
				ListIncomes(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return(nil, "", nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, nil, nil, int32(10000), "").
				Return([]*pfinancev1.Expense{{
					Id:       "historical-expense",
					UserId:   "another-member",
					GroupId:  groupID,
					Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Date:     timestamppb.New(anchor),
				}}, "", nil),
			mockStore.EXPECT().
				ListIncomes(gomock.Any(), "", groupID, nil, nil, int32(10000), "").
				Return(nil, "", nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return([]*pfinancev1.Expense{{
					Id:       "anchored-expense",
					UserId:   "another-member",
					GroupId:  groupID,
					Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Date:     timestamppb.New(anchor),
				}}, "", nil),
			mockStore.EXPECT().
				ListIncomes(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(10000), "").
				Return(nil, "", nil),
		)

		_, err := service.GetSpendingTrends(testProContext(ownerID), connect.NewRequest(&pfinancev1.GetSpendingTrendsRequest{
			UserId:      "victim",
			GroupId:     groupID,
			Granularity: pfinancev1.Granularity_GRANULARITY_MONTH,
			Periods:     2,
		}))
		if err != nil {
			t.Fatalf("GetSpendingTrends() error: %v", err)
		}
	})

	t.Run("category_comparison_historical_anchored_and_budget_queries", func(t *testing.T) {
		ctrl := gomock.NewController(t)
		mockStore := store.NewMockStore(ctrl)
		service := NewFinanceService(mockStore, nil, nil)
		anchor := time.Date(2025, time.October, 15, 12, 0, 0, 0, time.UTC)

		gomock.InOrder(
			mockStore.EXPECT().
				GetGroup(gomock.Any(), groupID).
				Return(&pfinancev1.FinanceGroup{
					Id:        groupID,
					OwnerId:   "someone-else",
					MemberIds: []string{ownerID},
				}, nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return(nil, "", nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return(nil, "", nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, nil, nil, int32(1000), "").
				Return([]*pfinancev1.Expense{{
					Id:       "historical-expense",
					UserId:   "another-member",
					GroupId:  groupID,
					Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Date:     timestamppb.New(anchor),
				}}, "", nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return([]*pfinancev1.Expense{{
					Id:          "anchored-expense",
					UserId:      "another-member",
					GroupId:     groupID,
					Amount:      25,
					AmountCents: 2500,
					Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Date:        timestamppb.New(anchor),
				}}, "", nil),
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "", groupID, gomock.Any(), gomock.Any(), int32(1000), "").
				Return(nil, "", nil),
			mockStore.EXPECT().
				ListBudgets(gomock.Any(), "", groupID, false, int32(1000), "").
				Return([]*pfinancev1.Budget{{
					Id:          "group-budget",
					GroupId:     groupID,
					Amount:      100,
					AmountCents: 10000,
					CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
				}}, "", nil),
		)

		_, err := service.GetCategoryComparison(testProContext(ownerID), connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
			UserId:         "victim",
			GroupId:        groupID,
			CurrentPeriod:  "month",
			IncludeBudgets: true,
		}))
		if err != nil {
			t.Fatalf("GetCategoryComparison() error: %v", err)
		}
	})
}
