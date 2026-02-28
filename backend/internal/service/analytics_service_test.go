package service

import (
	"context"
	"fmt"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// testProContext creates a context with authenticated user claims AND Pro subscription for testing
func testProContext(userID string) context.Context {
	ctx := auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:         userID,
		Email:       userID + "@test.com",
		DisplayName: "Test User",
		Verified:    true,
	})
	ctx = auth.WithSubscription(ctx, &auth.SubscriptionInfo{
		Tier:   pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO,
		Status: pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE,
	})
	return ctx
}

// --------------------------------------------------------------------------
// TestAnalyticsGetDailyAggregates
// --------------------------------------------------------------------------

func TestAnalyticsGetDailyAggregates(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	// Pro tier fallback may call GetUser for non-Pro contexts
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "user-123"

	t.Run("success with 3 daily aggregates", func(t *testing.T) {
		ctx := testProContext(userID)

		startDate := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
		endDate := time.Date(2025, 1, 3, 23, 59, 59, 0, time.UTC)

		mockAggregates := []*pfinancev1.DailyAggregate{
			{
				Date:             "2025-01-01",
				TotalAmount:      50.00,
				TotalAmountCents: 5000,
				TransactionCount: 3,
			},
			{
				Date:             "2025-01-02",
				TotalAmount:      120.50,
				TotalAmountCents: 12050,
				TransactionCount: 5,
			},
			{
				Date:             "2025-01-03",
				TotalAmount:      30.00,
				TotalAmountCents: 3000,
				TransactionCount: 1,
			},
		}

		mockStore.EXPECT().
			GetDailyAggregates(gomock.Any(), userID, "", startDate, endDate).
			Return(mockAggregates, nil)

		resp, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
			UserId:    userID,
			StartDate: timestamppb.New(startDate),
			EndDate:   timestamppb.New(endDate),
		}))

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Msg.Aggregates) != 3 {
			t.Errorf("expected 3 aggregates, got %d", len(resp.Msg.Aggregates))
		}
		if resp.Msg.MaxDailyAmount != 120.50 {
			t.Errorf("expected max daily amount 120.50, got %f", resp.Msg.MaxDailyAmount)
		}
		if resp.Msg.MaxDailyAmountCents != 12050 {
			t.Errorf("expected max daily amount cents 12050, got %d", resp.Msg.MaxDailyAmountCents)
		}
	})

	t.Run("requires missing dates returns error", func(t *testing.T) {
		ctx := testProContext(userID)

		_, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
			UserId: userID,
			// missing StartDate and EndDate
		}))

		if err == nil {
			t.Fatal("expected error for missing dates, got nil")
		}
		if connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
		}
	})

	t.Run("date range exceeding 366 days returns error", func(t *testing.T) {
		ctx := testProContext(userID)

		startDate := time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)
		endDate := time.Date(2025, 6, 1, 0, 0, 0, 0, time.UTC) // > 366 days

		_, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
			UserId:    userID,
			StartDate: timestamppb.New(startDate),
			EndDate:   timestamppb.New(endDate),
		}))

		if err == nil {
			t.Fatal("expected error for date range exceeding 366 days, got nil")
		}
		if connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		// Use context without Pro subscription
		ctx := testContextWithUser(userID)

		_, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
			UserId:    userID,
			StartDate: timestamppb.New(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
			EndDate:   timestamppb.New(time.Date(2025, 1, 3, 0, 0, 0, 0, time.UTC)),
		}))

		if err == nil {
			t.Fatal("expected permission denied error for non-Pro user, got nil")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires auth", func(t *testing.T) {
		// Use empty context with no auth
		ctx := context.Background()

		_, err := service.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
			UserId:    userID,
			StartDate: timestamppb.New(time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)),
			EndDate:   timestamppb.New(time.Date(2025, 1, 3, 0, 0, 0, 0, time.UTC)),
		}))

		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
		}
	})
}

// --------------------------------------------------------------------------
// TestAnalyticsGetSpendingTrends
// --------------------------------------------------------------------------

func TestAnalyticsGetSpendingTrends(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	// Pro tier fallback may call GetUser for non-Pro contexts
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "user-123"

	t.Run("success with monthly trends across 3 periods", func(t *testing.T) {
		ctx := testProContext(userID)

		// The handler now does a single ListExpenses + ListIncomes call for the entire range,
		// then buckets results in memory.
		now := time.Now()

		// Build test data with expenses/incomes in each of the 3 periods
		var allExpenses []*pfinancev1.Expense
		var allIncomes []*pfinancev1.Income
		for i := int32(0); i < 3; i++ {
			offset := 3 - 1 - i
			periodStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -int(offset), 0)

			expenseAmount := float64((i + 1) * 100)
			allExpenses = append(allExpenses, &pfinancev1.Expense{
				Id:       fmt.Sprintf("exp-%d", i+1),
				UserId:   userID,
				Amount:   expenseAmount,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Date:     timestamppb.New(periodStart.AddDate(0, 0, 5)),
			})

			incomeAmount := float64((i + 1) * 500)
			allIncomes = append(allIncomes, &pfinancev1.Income{
				Id:     fmt.Sprintf("inc-%d", i+1),
				UserId: userID,
				Amount: incomeAmount,
				Date:   timestamppb.New(periodStart.AddDate(0, 0, 1)),
			})
		}

		// Single call for the entire date range
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(allExpenses, "", nil)

		mockStore.EXPECT().
			ListIncomes(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(allIncomes, "", nil)

		resp, err := service.GetSpendingTrends(ctx, connect.NewRequest(&pfinancev1.GetSpendingTrendsRequest{
			UserId:      userID,
			Granularity: pfinancev1.Granularity_GRANULARITY_MONTH,
			Periods:     3,
		}))

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Msg.ExpenseSeries) != 3 {
			t.Errorf("expected 3 expense data points, got %d", len(resp.Msg.ExpenseSeries))
		}
		if len(resp.Msg.IncomeSeries) != 3 {
			t.Errorf("expected 3 income data points, got %d", len(resp.Msg.IncomeSeries))
		}
		// Expense series should have increasing values: 100, 200, 300
		if resp.Msg.ExpenseSeries[0].Value != 100.0 {
			t.Errorf("expected first expense period value 100.0, got %f", resp.Msg.ExpenseSeries[0].Value)
		}
		if resp.Msg.ExpenseSeries[2].Value != 300.0 {
			t.Errorf("expected third expense period value 300.0, got %f", resp.Msg.ExpenseSeries[2].Value)
		}
		// TrendSlope should be positive (increasing expenses)
		if resp.Msg.TrendSlope <= 0 {
			t.Errorf("expected positive trend slope for increasing expenses, got %f", resp.Msg.TrendSlope)
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		ctx := testContextWithUser(userID)

		_, err := service.GetSpendingTrends(ctx, connect.NewRequest(&pfinancev1.GetSpendingTrendsRequest{
			UserId:  userID,
			Periods: 3,
		}))

		if err == nil {
			t.Fatal("expected permission denied error for non-Pro user, got nil")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires auth", func(t *testing.T) {
		ctx := context.Background()

		_, err := service.GetSpendingTrends(ctx, connect.NewRequest(&pfinancev1.GetSpendingTrendsRequest{
			UserId:  userID,
			Periods: 3,
		}))

		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
		}
	})
}

// --------------------------------------------------------------------------
// TestAnalyticsGetCategoryComparison
// --------------------------------------------------------------------------

func TestAnalyticsGetCategoryComparison(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	// Pro tier fallback may call GetUser for non-Pro contexts
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "user-123"

	t.Run("success with category comparison and budgets", func(t *testing.T) {
		ctx := testProContext(userID)

		// The handler fetches current period expenses, previous period expenses,
		// and optionally budgets. We mock with gomock.Any() for date params
		// since the handler computes them based on time.Now().
		currentExpenses := []*pfinancev1.Expense{
			{
				Id:       "exp-1",
				UserId:   userID,
				Amount:   200.00,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Date:     timestamppb.Now(),
			},
			{
				Id:       "exp-2",
				UserId:   userID,
				Amount:   80.00,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
				Date:     timestamppb.Now(),
			},
		}

		prevExpenses := []*pfinancev1.Expense{
			{
				Id:       "exp-prev-1",
				UserId:   userID,
				Amount:   150.00,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Date:     timestamppb.Now(),
			},
		}

		budgets := []*pfinancev1.Budget{
			{
				Id:          "budget-1",
				UserId:      userID,
				Amount:      300.00,
				CategoryIds: []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD},
			},
		}

		// Current period ListExpenses
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(currentExpenses, "", nil)

		// Previous period ListExpenses
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(prevExpenses, "", nil)

		// ListBudgets (IncludeBudgets=true)
		mockStore.EXPECT().
			ListBudgets(gomock.Any(), userID, "", false, int32(10000), "").
			Return(budgets, "", nil)

		resp, err := service.GetCategoryComparison(ctx, connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
			UserId:         userID,
			CurrentPeriod:  "month",
			IncludeBudgets: true,
		}))

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Msg.Categories) == 0 {
			t.Fatal("expected at least one category, got 0")
		}

		// Categories should be sorted by current amount descending
		// Food=200, Transportation=80
		if resp.Msg.Categories[0].Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
			t.Errorf("expected Food as top category, got %v", resp.Msg.Categories[0].Category)
		}
		if resp.Msg.Categories[0].CurrentAmount != 200.00 {
			t.Errorf("expected current food amount 200.00, got %f", resp.Msg.Categories[0].CurrentAmount)
		}
		if resp.Msg.Categories[0].PreviousAmount != 150.00 {
			t.Errorf("expected previous food amount 150.00, got %f", resp.Msg.Categories[0].PreviousAmount)
		}
		// Food budget should be 300
		if resp.Msg.Categories[0].BudgetAmount != 300.00 {
			t.Errorf("expected food budget 300.00, got %f", resp.Msg.Categories[0].BudgetAmount)
		}
		// Change percent for Food: (200-150)/150 * 100 = 33.33...
		expectedChange := ((200.0 - 150.0) / 150.0) * 100.0
		if resp.Msg.Categories[0].ChangePercent < expectedChange-0.01 || resp.Msg.Categories[0].ChangePercent > expectedChange+0.01 {
			t.Errorf("expected change percent ~%.2f, got %f", expectedChange, resp.Msg.Categories[0].ChangePercent)
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		ctx := testContextWithUser(userID)

		_, err := service.GetCategoryComparison(ctx, connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected permission denied error for non-Pro user, got nil")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires auth", func(t *testing.T) {
		ctx := context.Background()

		_, err := service.GetCategoryComparison(ctx, connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
		}
	})
}

// --------------------------------------------------------------------------
// TestAnalyticsDetectAnomalies
// --------------------------------------------------------------------------

func TestAnalyticsDetectAnomalies(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	// Pro tier fallback may call GetUser for non-Pro contexts
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "user-123"

	t.Run("detects amount outlier anomalies", func(t *testing.T) {
		ctx := testProContext(userID)

		now := time.Now()

		// Create 12 normal expenses (need >= 10 for z-score) plus 1 outlier
		// All in the same category so z-score applies
		var expenses []*pfinancev1.Expense
		for i := 0; i < 12; i++ {
			expenses = append(expenses, &pfinancev1.Expense{
				Id:          "exp-normal-" + string(rune('a'+i)),
				UserId:      userID,
				Description: "Coffee",
				Amount:      5.00, // consistent normal amount
				Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Date:        timestamppb.New(now.AddDate(0, 0, -i)),
				CreatedAt:   timestamppb.New(now.AddDate(0, 0, -i)),
			})
		}

		// Add a large outlier in the same category
		expenses = append(expenses, &pfinancev1.Expense{
			Id:          "exp-outlier",
			UserId:      userID,
			Description: "Expensive Restaurant",
			Amount:      500.00, // way above the ~5.00 average
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			Date:        timestamppb.New(now.AddDate(0, 0, -1)),
			CreatedAt:   timestamppb.New(now.AddDate(0, 0, -1)),
		})

		// Add a unique new merchant expense (will be flagged as new merchant)
		expenses = append(expenses, &pfinancev1.Expense{
			Id:          "exp-new-merchant",
			UserId:      userID,
			Description: "BrandNewShop",
			Amount:      25.00,
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			Date:        timestamppb.New(now.AddDate(0, 0, -2)),
			CreatedAt:   timestamppb.New(now.AddDate(0, 0, -2)),
		})

		mockStore.EXPECT().
			ListExpenses(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(expenses, "", nil)

		resp, err := service.DetectAnomalies(ctx, connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
			UserId:       userID,
			LookbackDays: 90,
			Sensitivity:  0.5,
		}))

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.TotalAnomalies == 0 {
			t.Fatal("expected at least one anomaly to be detected, got 0")
		}

		// Check that we have at least one AMOUNT_OUTLIER anomaly
		foundAmountOutlier := false
		foundNewMerchant := false
		for _, a := range resp.Msg.Anomalies {
			if a.AnomalyType == pfinancev1.AnomalyType_ANOMALY_TYPE_AMOUNT_OUTLIER {
				foundAmountOutlier = true
			}
			if a.AnomalyType == pfinancev1.AnomalyType_ANOMALY_TYPE_NEW_MERCHANT {
				foundNewMerchant = true
			}
		}
		if !foundAmountOutlier {
			t.Error("expected at least one AMOUNT_OUTLIER anomaly")
		}
		if !foundNewMerchant {
			t.Error("expected at least one NEW_MERCHANT anomaly for BrandNewShop")
		}

		// Summary stats
		if resp.Msg.AnomalousSpendTotal <= 0 {
			t.Errorf("expected positive anomalous spend total, got %f", resp.Msg.AnomalousSpendTotal)
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		ctx := testContextWithUser(userID)

		_, err := service.DetectAnomalies(ctx, connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected permission denied error for non-Pro user, got nil")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires auth", func(t *testing.T) {
		ctx := context.Background()

		_, err := service.DetectAnomalies(ctx, connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
		}
	})
}

// --------------------------------------------------------------------------
// TestAnalyticsGetCashFlowForecast
// --------------------------------------------------------------------------

func TestAnalyticsGetCashFlowForecast(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	// Pro tier fallback may call GetUser for non-Pro contexts
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "user-123"

	t.Run("success with forecast using history and recurring transactions", func(t *testing.T) {
		ctx := testProContext(userID)

		now := time.Now()

		// Historical expenses
		expenses := []*pfinancev1.Expense{
			{
				Id:     "exp-1",
				UserId: userID,
				Amount: 50.00,
				Date:   timestamppb.New(now.AddDate(0, 0, -10)),
			},
			{
				Id:     "exp-2",
				UserId: userID,
				Amount: 30.00,
				Date:   timestamppb.New(now.AddDate(0, 0, -20)),
			},
			{
				Id:     "exp-3",
				UserId: userID,
				Amount: 45.00,
				Date:   timestamppb.New(now.AddDate(0, 0, -30)),
			},
		}

		// Historical incomes
		incomes := []*pfinancev1.Income{
			{
				Id:     "inc-1",
				UserId: userID,
				Amount: 3000.00,
				Date:   timestamppb.New(now.AddDate(0, 0, -30)),
			},
			{
				Id:     "inc-2",
				UserId: userID,
				Amount: 3000.00,
				Date:   timestamppb.New(now.AddDate(0, 0, -60)),
			},
		}

		// Recurring transactions
		recurringTxns := []*pfinancev1.RecurringTransaction{
			{
				Id:             "rt-1",
				UserId:         userID,
				Description:    "Monthly Rent",
				Amount:         1500.00,
				Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
				IsExpense:      true,
				NextOccurrence: timestamppb.New(now.AddDate(0, 0, 5)),
				Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
			},
		}

		mockStore.EXPECT().
			ListExpenses(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(expenses, "", nil)

		mockStore.EXPECT().
			ListIncomes(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(incomes, "", nil)

		mockStore.EXPECT().
			ListRecurringTransactions(gomock.Any(), userID, "",
				pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
				false, false, int32(10000), "").
			Return(recurringTxns, "", nil)

		resp, err := service.GetCashFlowForecast(ctx, connect.NewRequest(&pfinancev1.GetCashFlowForecastRequest{
			UserId:       userID,
			ForecastDays: 30,
		}))

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Should have 30 forecast points
		if len(resp.Msg.ExpenseForecast) != 30 {
			t.Errorf("expected 30 expense forecast points, got %d", len(resp.Msg.ExpenseForecast))
		}
		if len(resp.Msg.IncomeForecast) != 30 {
			t.Errorf("expected 30 income forecast points, got %d", len(resp.Msg.IncomeForecast))
		}
		if len(resp.Msg.NetForecast) != 30 {
			t.Errorf("expected 30 net forecast points, got %d", len(resp.Msg.NetForecast))
		}

		// History should have entries (91 days from -90 days to today inclusive)
		if len(resp.Msg.ExpenseHistory) == 0 {
			t.Error("expected non-empty expense history")
		}
		if len(resp.Msg.IncomeHistory) == 0 {
			t.Error("expected non-empty income history")
		}

		// Check that some forecast points have IsRecurring set
		foundRecurring := false
		for _, fp := range resp.Msg.ExpenseForecast {
			if fp.IsRecurring {
				foundRecurring = true
				// The recurring rent should show up as 1500.00
				if fp.Predicted != 1500.00 {
					t.Errorf("expected recurring expense predicted amount 1500.00, got %f", fp.Predicted)
				}
				break
			}
		}
		if !foundRecurring {
			t.Error("expected at least one recurring expense forecast point")
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		ctx := testContextWithUser(userID)

		_, err := service.GetCashFlowForecast(ctx, connect.NewRequest(&pfinancev1.GetCashFlowForecastRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected permission denied error for non-Pro user, got nil")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires auth", func(t *testing.T) {
		ctx := context.Background()

		_, err := service.GetCashFlowForecast(ctx, connect.NewRequest(&pfinancev1.GetCashFlowForecastRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
		}
	})
}

// --------------------------------------------------------------------------
// TestAnalyticsGetWaterfallData
// --------------------------------------------------------------------------

func TestAnalyticsGetWaterfallData(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	// Pro tier fallback may call GetUser for non-Pro contexts
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "user-123"

	t.Run("success with waterfall entries for income, tax, expenses, and savings", func(t *testing.T) {
		ctx := testProContext(userID)

		incomes := []*pfinancev1.Income{
			{
				Id:     "inc-1",
				UserId: userID,
				Source: "Salary",
				Amount: 5000.00,
				Date:   timestamppb.Now(),
			},
		}

		expenses := []*pfinancev1.Expense{
			{
				Id:       "exp-1",
				UserId:   userID,
				Amount:   1200.00,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING,
				Date:     timestamppb.Now(),
			},
			{
				Id:       "exp-2",
				UserId:   userID,
				Amount:   400.00,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Date:     timestamppb.Now(),
			},
			{
				Id:       "exp-3",
				UserId:   userID,
				Amount:   100.00,
				Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
				Date:     timestamppb.Now(),
			},
		}

		// ListIncomes for the current period
		mockStore.EXPECT().
			ListIncomes(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(incomes, "", nil)

		// ListExpenses for the current period
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), userID, "", gomock.Any(), gomock.Any(), int32(10000), "").
			Return(expenses, "", nil)

		// GetTaxConfig for tax rate (returns error → falls back to 25%)
		mockStore.EXPECT().
			GetTaxConfig(gomock.Any(), userID, "").
			Return(nil, fmt.Errorf("not found"))

		resp, err := service.GetWaterfallData(ctx, connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
			UserId: userID,
			Period: "month",
		}))

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		// Should have entries: Gross Income, Tax, Housing, Food, Transportation, Net Savings = 6
		if len(resp.Msg.Entries) < 4 {
			t.Errorf("expected at least 4 waterfall entries (income, tax, expenses, savings), got %d", len(resp.Msg.Entries))
		}

		// Verify first entry is Gross Income
		if resp.Msg.Entries[0].Label != "Gross Income" {
			t.Errorf("expected first entry to be 'Gross Income', got %q", resp.Msg.Entries[0].Label)
		}
		if resp.Msg.Entries[0].Amount != 5000.00 {
			t.Errorf("expected gross income 5000.00, got %f", resp.Msg.Entries[0].Amount)
		}
		if resp.Msg.Entries[0].EntryType != pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_INCOME {
			t.Errorf("expected INCOME entry type, got %v", resp.Msg.Entries[0].EntryType)
		}

		// Verify second entry is Tax (25% of 5000 = 1250)
		if resp.Msg.Entries[1].Label != "Tax" {
			t.Errorf("expected second entry to be 'Tax', got %q", resp.Msg.Entries[1].Label)
		}
		if resp.Msg.Entries[1].Amount != 1250.00 {
			t.Errorf("expected tax amount 1250.00, got %f", resp.Msg.Entries[1].Amount)
		}
		if resp.Msg.Entries[1].EntryType != pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_TAX {
			t.Errorf("expected TAX entry type, got %v", resp.Msg.Entries[1].EntryType)
		}

		// Verify last entry is Net Savings
		lastEntry := resp.Msg.Entries[len(resp.Msg.Entries)-1]
		if lastEntry.Label != "Net Savings" {
			t.Errorf("expected last entry to be 'Net Savings', got %q", lastEntry.Label)
		}
		if lastEntry.EntryType != pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_SAVINGS {
			t.Errorf("expected SAVINGS entry type, got %v", lastEntry.EntryType)
		}

		// Net savings = 5000 - 1700 - 1250 = 2050
		expectedSavings := 5000.00 - (1200.00 + 400.00 + 100.00) - 1250.00
		if lastEntry.Amount < expectedSavings-0.01 || lastEntry.Amount > expectedSavings+0.01 {
			t.Errorf("expected net savings ~%.2f, got %f", expectedSavings, lastEntry.Amount)
		}

		// Verify expense entries are sorted by amount descending
		// Housing=1200, Food=400, Transportation=100
		expenseEntries := resp.Msg.Entries[2 : len(resp.Msg.Entries)-1]
		if len(expenseEntries) != 3 {
			t.Errorf("expected 3 expense category entries, got %d", len(expenseEntries))
		}
		if len(expenseEntries) >= 2 && expenseEntries[0].Amount < expenseEntries[1].Amount {
			t.Error("expense entries should be sorted by amount descending")
		}

		// Verify period label is set
		if resp.Msg.PeriodLabel == "" {
			t.Error("expected non-empty period label")
		}
	})

	t.Run("requires pro tier", func(t *testing.T) {
		ctx := testContextWithUser(userID)

		_, err := service.GetWaterfallData(ctx, connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected permission denied error for non-Pro user, got nil")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("requires auth", func(t *testing.T) {
		ctx := context.Background()

		_, err := service.GetWaterfallData(ctx, connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
			UserId: userID,
		}))

		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
		if connect.CodeOf(err) != connect.CodeUnauthenticated {
			t.Errorf("expected CodeUnauthenticated, got %v", connect.CodeOf(err))
		}
	})
}
