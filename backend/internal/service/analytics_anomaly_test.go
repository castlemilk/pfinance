package service

import (
	"context"
	"math"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestDetectAnomaliesDeduplicatesReasonsAndReportsCoverage(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	now := time.Now().UTC()

	expenses := make([]*pfinancev1.Expense, 0, 14)
	for i := 0; i < 10; i++ {
		expenses = append(expenses, &pfinancev1.Expense{
			Id: "routine-" + string(rune('a'+i)), Description: "Routine Cafe",
			AmountCents: 100, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			Date: timestamppb.New(now.Add(-time.Duration(i+1) * time.Hour)),
		})
	}
	outlierDate := timestamppb.New(now.Add(-30 * time.Minute))
	expenses = append(expenses,
		&pfinancev1.Expense{
			Id: "amount-and-new", Description: "Once Only Restaurant",
			AmountCents: 10_000, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			Date: outlierDate,
		},
		&pfinancev1.Expense{
			Id: "new-shop-a", Description: "New Shop A",
			AmountCents: 2_500, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			Date: timestamppb.New(now.Add(-2 * time.Hour)),
		},
		&pfinancev1.Expense{
			Id: "new-shop-b", Description: "New Shop B",
			AmountCents: 500, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			Date: timestamppb.New(now.Add(-3 * time.Hour)),
		},
		&pfinancev1.Expense{
			Id: "established-current", Description: "Established Shop",
			AmountCents: 600, Amount: 999, Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			Date: timestamppb.New(now.Add(-4 * time.Hour)),
		},
	)
	history := append([]*pfinancev1.Expense{
		{
			Id: "established-old", Description: "Established Shop", AmountCents: 700,
			Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			Date:     timestamppb.New(now.AddDate(0, 0, -120)),
		},
	}, expenses...)

	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "anomaly-user", "", gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, _, _ string, start, end *time.Time, _ int32, _ string) ([]*pfinancev1.Expense, string, error) {
			if start == nil && end == nil {
				return history, "", nil
			}
			return expenses, "", nil
		}).
		AnyTimes()

	resp, err := service.DetectAnomalies(testProContext("anomaly-user"), connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
		LookbackDays: 90,
		Sensitivity:  1,
	}))
	if err != nil {
		t.Fatalf("DetectAnomalies: %v", err)
	}
	if len(resp.Msg.Anomalies) != 3 {
		t.Fatalf("anomaly count = %d, want 3 deduplicated expenses", len(resp.Msg.Anomalies))
	}

	byExpense := make(map[string]*pfinancev1.SpendingAnomaly)
	for _, anomaly := range resp.Msg.Anomalies {
		if _, duplicate := byExpense[anomaly.ExpenseId]; duplicate {
			t.Fatalf("expense %s emitted more than once", anomaly.ExpenseId)
		}
		byExpense[anomaly.ExpenseId] = anomaly
	}
	outlier := byExpense["amount-and-new"]
	if outlier == nil {
		t.Fatal("amount-and-new anomaly missing")
	}
	if outlier.AnomalyType != pfinancev1.AnomalyType_ANOMALY_TYPE_AMOUNT_OUTLIER ||
		outlier.Severity != pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_HIGH {
		t.Fatalf("outlier type/severity = %s/%s, want amount-outlier/high", outlier.AnomalyType, outlier.Severity)
	}
	if outlier.Description != "Once Only Restaurant" || outlier.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD || outlier.Date != outlierDate {
		t.Fatalf("outlier identity metadata was not preserved: %+v", outlier)
	}
	if outlier.AmountCents != 10_000 || outlier.Amount != 100 || outlier.ExpectedAmountCents != 1_000 || outlier.ExpectedAmount != 10 {
		t.Fatalf("outlier amount metadata = amount %d/%.2f expected %d/%.2f",
			outlier.AmountCents, outlier.Amount, outlier.ExpectedAmountCents, outlier.ExpectedAmount)
	}
	if math.Abs(outlier.ZScore-math.Sqrt(10)) > 0.000001 {
		t.Fatalf("outlier z-score = %.8f, want %.8f", outlier.ZScore, math.Sqrt(10))
	}
	if !outlier.HasExpectedRange || outlier.ExpectedLowerCents != 0 || outlier.ExpectedUpperCents != 3_846 {
		t.Fatalf("outlier range = present:%t [%d,%d], want true [0,3846]",
			outlier.HasExpectedRange, outlier.ExpectedLowerCents, outlier.ExpectedUpperCents)
	}

	for _, expenseID := range []string{"new-shop-a", "new-shop-b"} {
		anomaly := byExpense[expenseID]
		if anomaly == nil || anomaly.AnomalyType != pfinancev1.AnomalyType_ANOMALY_TYPE_NEW_MERCHANT {
			t.Fatalf("%s new-merchant anomaly missing: %+v", expenseID, anomaly)
		}
		if anomaly.HasExpectedRange || anomaly.ExpectedLowerCents != 0 || anomaly.ExpectedUpperCents != 0 {
			t.Fatalf("%s unexpectedly has an expected range: %+v", expenseID, anomaly)
		}
	}

	if resp.Msg.AnomalousSpendTotalCents != 13_000 || resp.Msg.AnomalousSpendTotal != 130 {
		t.Fatalf("anomalous total = %d/%.2f, want 13000/130.00",
			resp.Msg.AnomalousSpendTotalCents, resp.Msg.AnomalousSpendTotal)
	}
	if resp.Msg.TotalAnomalies != 3 || resp.Msg.TopAnomalyCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING.String() {
		t.Fatalf("summary anomaly count/top category = %d/%q", resp.Msg.TotalAnomalies, resp.Msg.TopAnomalyCategory)
	}
	if resp.Msg.AnalyzedExpenseCount != 14 || resp.Msg.EligibleCategoryCount != 1 ||
		resp.Msg.MinimumCategorySample != 10 || !resp.Msg.HasSufficientHistory {
		t.Fatalf("history metadata = analyzed:%d eligible:%d minimum:%d sufficient:%t",
			resp.Msg.AnalyzedExpenseCount, resp.Msg.EligibleCategoryCount,
			resp.Msg.MinimumCategorySample, resp.Msg.HasSufficientHistory)
	}
	if len(resp.Msg.CategoryCoverage) != 2 {
		t.Fatalf("coverage count = %d, want 2 present categories", len(resp.Msg.CategoryCoverage))
	}
	if got := resp.Msg.CategoryCoverage[0]; got.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD || got.SampleCount != 11 || !got.HasSufficientHistory {
		t.Fatalf("food coverage = %+v, want count 11 sufficient", got)
	}
	if got := resp.Msg.CategoryCoverage[1]; got.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING || got.SampleCount != 3 || got.HasSufficientHistory {
		t.Fatalf("shopping coverage = %+v, want count 3 insufficient", got)
	}
}

func TestDetectAnomaliesUsesEveryFullHistoryPageForMerchantLookup(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	now := time.Now().UTC()
	current := &pfinancev1.Expense{
		Id: "established-current", Description: "Established Merchant", AmountCents: 500,
		Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
		Date:     timestamppb.New(now.Add(-time.Hour)),
	}
	old := &pfinancev1.Expense{
		Id: "established-old", Description: "Established Merchant", AmountCents: 400,
		Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
		Date:     timestamppb.New(now.AddDate(0, 0, -180)),
	}
	var historyTokens []string
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "history-user", "", gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ context.Context, _, _ string, start, end *time.Time, _ int32, token string) ([]*pfinancev1.Expense, string, error) {
			if start != nil || end != nil {
				return []*pfinancev1.Expense{current}, "", nil
			}
			historyTokens = append(historyTokens, token)
			if token == "" {
				return []*pfinancev1.Expense{old}, "history-2", nil
			}
			return []*pfinancev1.Expense{current}, "", nil
		}).
		AnyTimes()

	resp, err := service.DetectAnomalies(testProContext("history-user"), connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
		LookbackDays: 30,
		Sensitivity:  0.5,
	}))
	if err != nil {
		t.Fatalf("DetectAnomalies: %v", err)
	}
	if len(historyTokens) != 2 || historyTokens[0] != "" || historyTokens[1] != "history-2" {
		t.Fatalf("full-history page tokens = %v, want [\"\" history-2]", historyTokens)
	}
	if len(resp.Msg.Anomalies) != 0 || resp.Msg.AnomalousSpendTotalCents != 0 {
		t.Fatalf("established merchant flagged as new: anomalies=%d total=%d",
			len(resp.Msg.Anomalies), resp.Msg.AnomalousSpendTotalCents)
	}
	if resp.Msg.AnalyzedExpenseCount != 1 || resp.Msg.EligibleCategoryCount != 0 ||
		resp.Msg.MinimumCategorySample != 10 || resp.Msg.HasSufficientHistory {
		t.Fatalf("partial history metadata = analyzed:%d eligible:%d minimum:%d sufficient:%t",
			resp.Msg.AnalyzedExpenseCount, resp.Msg.EligibleCategoryCount,
			resp.Msg.MinimumCategorySample, resp.Msg.HasSufficientHistory)
	}
	if len(resp.Msg.CategoryCoverage) != 1 ||
		resp.Msg.CategoryCoverage[0].Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING ||
		resp.Msg.CategoryCoverage[0].SampleCount != 1 || resp.Msg.CategoryCoverage[0].HasSufficientHistory {
		t.Fatalf("partial category coverage = %+v", resp.Msg.CategoryCoverage)
	}
}

func TestDetectAnomaliesSensitivityValidation(t *testing.T) {
	tests := []struct {
		name        string
		sensitivity float64
		wantCode    connect.Code
		wantValid   bool
	}{
		{name: "negative", sensitivity: -0.01, wantCode: connect.CodeInvalidArgument},
		{name: "above one", sensitivity: 1.01, wantCode: connect.CodeInvalidArgument},
		{name: "one is valid", sensitivity: 1, wantValid: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctrl := gomock.NewController(t)
			mockStore := store.NewMockStore(ctrl)
			service := NewFinanceService(mockStore, nil, nil)
			mockStore.EXPECT().
				ListExpenses(gomock.Any(), "sensitivity-user", "", gomock.Any(), gomock.Any(), int32(1000), gomock.Any()).
				Return(nil, "", nil).
				AnyTimes()

			_, err := service.DetectAnomalies(testProContext("sensitivity-user"), connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
				Sensitivity: tt.sensitivity,
			}))
			if tt.wantValid {
				if err != nil {
					t.Fatalf("DetectAnomalies with valid sensitivity: %v", err)
				}
				return
			}
			if got := connect.CodeOf(err); got != tt.wantCode {
				t.Fatalf("error code = %s, want %s (err=%v)", got, tt.wantCode, err)
			}
		})
	}
}

func TestDetectAnomaliesProtoZeroSensitivityDefaultsToHalf(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	now := time.Now().UTC()
	expenses := make([]*pfinancev1.Expense, 0, 11)
	for i := 0; i < 10; i++ {
		expenses = append(expenses, &pfinancev1.Expense{
			Id: "routine-" + string(rune('a'+i)), Description: "Established Merchant", AmountCents: 100,
			Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Date: timestamppb.New(now.Add(-time.Duration(i+1) * time.Hour)),
		})
	}
	expenses = append(expenses, &pfinancev1.Expense{
		Id: "outlier", Description: "Established Merchant", AmountCents: 10_000,
		Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Date: timestamppb.New(now.Add(-30 * time.Minute)),
	})
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "default-user", "", gomock.Any(), gomock.Any(), int32(1000), gomock.Any()).
		Return(expenses, "", nil).
		Times(2)

	resp, err := service.DetectAnomalies(testProContext("default-user"), connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{}))
	if err != nil {
		t.Fatalf("DetectAnomalies: %v", err)
	}
	if len(resp.Msg.Anomalies) != 1 {
		t.Fatalf("anomaly count = %d, want 1", len(resp.Msg.Anomalies))
	}
	anomaly := resp.Msg.Anomalies[0]
	if anomaly.ExpenseId != "outlier" || anomaly.ExpectedLowerCents != 0 || anomaly.ExpectedUpperCents != 6_692 {
		t.Fatalf("default sensitivity anomaly = %+v, want outlier range [0,6692]", anomaly)
	}
	if anomaly.ExpectedLowerCents > anomaly.ExpectedUpperCents {
		t.Fatalf("expected range is inverted: [%d,%d]", anomaly.ExpectedLowerCents, anomaly.ExpectedUpperCents)
	}
}

func TestDetectAnomaliesNormalisesMerchantCaseAndWhitespace(t *testing.T) {
	ctrl := gomock.NewController(t)
	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)
	now := time.Now().UTC()
	current := &pfinancev1.Expense{
		Id: "current", Description: "  Woolworths ", AmountCents: 500,
		Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Date: timestamppb.New(now.Add(-time.Hour)),
	}
	old := &pfinancev1.Expense{
		Id: "old", Description: "woolworths", AmountCents: 400,
		Category: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, Date: timestamppb.New(now.AddDate(0, 0, -180)),
	}
	mockStore.EXPECT().
		ListExpenses(gomock.Any(), "merchant-user", "", gomock.Any(), gomock.Any(), int32(1000), gomock.Any()).
		DoAndReturn(func(_ context.Context, _, _ string, start, end *time.Time, _ int32, _ string) ([]*pfinancev1.Expense, string, error) {
			if start == nil && end == nil {
				return []*pfinancev1.Expense{old, current}, "", nil
			}
			return []*pfinancev1.Expense{current}, "", nil
		}).
		Times(2)

	resp, err := service.DetectAnomalies(testProContext("merchant-user"), connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
		LookbackDays: 30,
		Sensitivity:  0.5,
	}))
	if err != nil {
		t.Fatalf("DetectAnomalies: %v", err)
	}
	if len(resp.Msg.Anomalies) != 0 {
		t.Fatalf("case/whitespace variant was flagged as new: %+v", resp.Msg.Anomalies)
	}
}
