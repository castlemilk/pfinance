package service

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"math"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// ============================================================================
// Unit tests for tax calculation functions
// ============================================================================

func TestParseFYDateRange(t *testing.T) {
	tests := []struct {
		fy        string
		wantStart time.Time
		wantEnd   time.Time
		wantErr   bool
	}{
		{
			fy:        "2025-26",
			wantStart: time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC),
			wantEnd:   time.Date(2026, time.July, 1, 0, 0, 0, 0, time.UTC),
		},
		{
			fy:        "2024-25",
			wantStart: time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC),
			wantEnd:   time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC),
		},
		{fy: "invalid", wantErr: true},
		{fy: "abc-de", wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.fy, func(t *testing.T) {
			start, end, err := parseFYDateRange(tt.fy)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error for fy=%q", tt.fy)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !start.Equal(tt.wantStart) {
				t.Errorf("start = %v, want %v", start, tt.wantStart)
			}
			if !end.Equal(tt.wantEnd) {
				t.Errorf("end = %v, want %v", end, tt.wantEnd)
			}
		})
	}
}

func TestCalculateBracketTax(t *testing.T) {
	brackets := australianBrackets("2024-25")
	tests := []struct {
		name    string
		income  float64
		wantMin float64
		wantMax float64
	}{
		{"zero income", 0, 0, 0},
		{"below tax-free threshold", 18200, 0, 0.01},
		{"$50,000 income", 50000, 5700, 5900},     // ~$5,788
		{"$90,000 income", 90000, 17700, 17900},   // ~$17,788
		{"$120,000 income", 120000, 26700, 26900}, // ~$26,788
		{"$200,000 income", 200000, 56000, 56300}, // ~$56,138
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tax := calculateBracketTax(tt.income, brackets)
			if tax < tt.wantMin || tax > tt.wantMax {
				t.Errorf("calculateBracketTax(%v) = %.2f, want between %.2f and %.2f", tt.income, tax, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestCalculateLITO(t *testing.T) {
	tests := []struct {
		name   string
		income float64
		want   float64
	}{
		{"low income gets full LITO", 30000, 700},
		{"at first threshold", 37500, 700},
		{"in first phase-out", 40000, 575},
		{"at second threshold", 45000, 325},
		{"in second phase-out", 55000, 175},
		{"above cutoff", 70000, 0},
		{"high income", 200000, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calculateLITO(tt.income)
			if math.Abs(got-tt.want) > 1.0 {
				t.Errorf("calculateLITO(%v) = %.2f, want ~%.2f", tt.income, got, tt.want)
			}
		})
	}
}

func TestCalculateMedicareLevy(t *testing.T) {
	tests := []struct {
		name   string
		income float64
		exempt bool
		want   float64
	}{
		{"exempt", 100000, true, 0},
		{"below threshold", 20000, false, 0},
		{"phase-in", 28000, false, 372.4},       // 10% of (28000-24276) = 372.4
		{"above phase-in", 100000, false, 2000}, // 2% of 100000
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calculateMedicareLevy(tt.income, tt.exempt)
			if math.Abs(got-tt.want) > 1.0 {
				t.Errorf("calculateMedicareLevy(%v, %v) = %.2f, want ~%.2f", tt.income, tt.exempt, got, tt.want)
			}
		})
	}
}

func TestCalculateHELPRepayment(t *testing.T) {
	tests := []struct {
		name    string
		income  float64
		hasHELP bool
		wantMin float64
		wantMax float64
	}{
		{"no HELP", 100000, false, 0, 0},
		{"below threshold", 50000, true, 0, 0},
		{"at 1% bracket", 55000, true, 500, 600},
		{"at 6% bracket", 105000, true, 6000, 7000},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calculateHELPRepayment(tt.income, tt.hasHELP)
			if got < tt.wantMin || got > tt.wantMax {
				t.Errorf("calculateHELPRepayment(%v, %v) = %.2f, want between %.2f and %.2f", tt.income, tt.hasHELP, got, tt.wantMin, tt.wantMax)
			}
		})
	}
}

func TestCalculateAustralianTax(t *testing.T) {
	t.Run("basic calculation with $100k income no deductions", func(t *testing.T) {
		calc := calculateAustralianTax(
			10000000, // $100,000 gross
			nil,      // no deductions
			2000000,  // $20,000 withheld
			false,    // no HELP
			false,    // no medicare exemption
			"2024-25",
		)

		if calc.GrossIncome != 100000 {
			t.Errorf("GrossIncome = %v, want 100000", calc.GrossIncome)
		}
		if calc.TaxableIncome != 100000 {
			t.Errorf("TaxableIncome = %v, want 100000", calc.TaxableIncome)
		}
		if calc.TotalTax <= 0 {
			t.Error("TotalTax should be > 0")
		}
		if calc.EffectiveRate <= 0 || calc.EffectiveRate >= 1 {
			t.Errorf("EffectiveRate = %v, should be between 0 and 1", calc.EffectiveRate)
		}
		if calc.FinancialYear != "2024-25" {
			t.Errorf("FinancialYear = %v, want 2024-25", calc.FinancialYear)
		}
	})

	t.Run("$100k income with $5k deductions", func(t *testing.T) {
		deductions := []*pfinancev1.TaxDeductionSummary{
			{
				Category:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
				TotalCents: 300000, // $3,000
			},
			{
				Category:   pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
				TotalCents: 200000, // $2,000
			},
		}
		calc := calculateAustralianTax(10000000, deductions, 2000000, false, false, "2024-25")

		if calc.TaxableIncome != 95000 {
			t.Errorf("TaxableIncome = %v, want 95000", calc.TaxableIncome)
		}
		if calc.TotalDeductions != 5000 {
			t.Errorf("TotalDeductions = %v, want 5000", calc.TotalDeductions)
		}
	})

	t.Run("refund when withheld > owed", func(t *testing.T) {
		calc := calculateAustralianTax(5000000, nil, 1500000, false, false, "2024-25")
		// $50k income, $15k withheld — should get a refund since tax on $50k is ~$6,717
		if calc.RefundOrOwedCents <= 0 {
			t.Errorf("expected refund (positive), got %d cents", calc.RefundOrOwedCents)
		}
	})
}

// ============================================================================
// RPC Handler Tests
// ============================================================================

func TestTaxGetTaxSummary(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user-1"
	ctx := testProContext(userID)

	t.Run("success with income and deductions", func(t *testing.T) {
		fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
		fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

		incomes := []*pfinancev1.Income{
			{
				Id:          "inc-1",
				UserId:      userID,
				AmountCents: 8000000, // $80,000
				Date:        timestamppb.New(time.Date(2024, 8, 15, 0, 0, 0, 0, time.UTC)),
				Deductions: []*pfinancev1.Deduction{
					{Name: "PAYG Tax", Amount: 18000, AmountCents: 1800000, IsTaxDeductible: true},
				},
			},
		}
		mockStore.EXPECT().ListIncomes(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
			Return(incomes, "", nil)

		deductionSummaries := []*pfinancev1.TaxDeductionSummary{
			{
				Category:     pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
				TotalCents:   200000,
				TotalAmount:  2000.0,
				ExpenseCount: 5,
			},
		}
		mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
			Return(deductionSummaries, nil)

		resp, err := svc.GetTaxSummary(ctx, connect.NewRequest(&pfinancev1.GetTaxSummaryRequest{
			UserId:        userID,
			FinancialYear: "2024-25",
		}))
		if err != nil {
			t.Fatalf("GetTaxSummary failed: %v", err)
		}

		calc := resp.Msg.Calculation
		if calc.GrossIncomeCents != 8000000 {
			t.Errorf("GrossIncomeCents = %d, want 8000000", calc.GrossIncomeCents)
		}
		if calc.TotalDeductionsCents != 200000 {
			t.Errorf("TotalDeductionsCents = %d, want 200000", calc.TotalDeductionsCents)
		}
		if calc.TaxWithheldCents != 1800000 {
			t.Errorf("TaxWithheldCents = %d, want 1800000", calc.TaxWithheldCents)
		}
		if calc.TotalTaxCents <= 0 {
			t.Error("TotalTaxCents should be > 0")
		}
	})
}

func TestTaxBatchUpdateExpenseTaxStatus(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user-2"
	ctx := testProContext(userID)

	t.Run("successfully update 2 expenses", func(t *testing.T) {
		expense1 := &pfinancev1.Expense{Id: "exp-1", UserId: userID, AmountCents: 5000}
		expense2 := &pfinancev1.Expense{Id: "exp-2", UserId: userID, AmountCents: 3000}

		mockStore.EXPECT().GetExpense(gomock.Any(), "exp-1").Return(expense1, nil)
		mockStore.EXPECT().GetExpense(gomock.Any(), "exp-2").Return(expense2, nil)
		mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(nil).Times(2)

		resp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
			UserId: userID,
			Updates: []*pfinancev1.ExpenseTaxUpdate{
				{
					ExpenseId:            "exp-1",
					IsTaxDeductible:      true,
					TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
					TaxDeductiblePercent: 1.0,
				},
				{
					ExpenseId:            "exp-2",
					IsTaxDeductible:      true,
					TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_DONATIONS,
					TaxDeductiblePercent: 0.5,
				},
			},
		}))
		if err != nil {
			t.Fatalf("BatchUpdateExpenseTaxStatus failed: %v", err)
		}
		if resp.Msg.UpdatedCount != 2 {
			t.Errorf("UpdatedCount = %d, want 2", resp.Msg.UpdatedCount)
		}
		if len(resp.Msg.FailedExpenseIds) != 0 {
			t.Errorf("FailedExpenseIds = %v, want empty", resp.Msg.FailedExpenseIds)
		}
	})

	t.Run("rejects batch over 100", func(t *testing.T) {
		updates := make([]*pfinancev1.ExpenseTaxUpdate, 101)
		for i := range updates {
			updates[i] = &pfinancev1.ExpenseTaxUpdate{ExpenseId: fmt.Sprintf("exp-%d", i)}
		}
		_, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
			UserId:  userID,
			Updates: updates,
		}))
		if err == nil {
			t.Fatal("expected error for >100 updates")
		}
	})
}

func TestTaxListDeductibleExpenses(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user-3"
	ctx := testProContext(userID)

	t.Run("lists deductible expenses for FY", func(t *testing.T) {
		fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
		fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

		expenses := []*pfinancev1.Expense{
			{
				Id:                   "exp-d1",
				UserId:               userID,
				AmountCents:          10000,
				IsTaxDeductible:      true,
				TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
				TaxDeductiblePercent: 1.0,
			},
			{
				Id:                   "exp-d2",
				UserId:               userID,
				AmountCents:          20000,
				IsTaxDeductible:      true,
				TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_VEHICLE,
				TaxDeductiblePercent: 0.5,
			},
		}

		mockStore.EXPECT().ListDeductibleExpenses(gomock.Any(), userID, "", &fyStart, &fyEnd, pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED, int32(0), "").
			Return(expenses, "", nil)

		resp, err := svc.ListDeductibleExpenses(ctx, connect.NewRequest(&pfinancev1.ListDeductibleExpensesRequest{
			UserId:        userID,
			FinancialYear: "2024-25",
		}))
		if err != nil {
			t.Fatalf("ListDeductibleExpenses failed: %v", err)
		}
		if len(resp.Msg.Expenses) != 2 {
			t.Errorf("got %d expenses, want 2", len(resp.Msg.Expenses))
		}
		// 10000*1.0 + 20000*0.5 = 20000
		if resp.Msg.TotalDeductibleCents != 20000 {
			t.Errorf("TotalDeductibleCents = %d, want 20000", resp.Msg.TotalDeductibleCents)
		}
	})
}

// ============================================================================
// ClassifyTaxDeductibility RPC Tests
// ============================================================================

func TestTaxClassify_HighConfidenceAutoApply(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	userID := "tax-user"
	ctx := testProContext(userID)

	expense := &pfinancev1.Expense{
		Id:          "exp-tax-1",
		UserId:      userID,
		Description: "h&r block tax prep",
		AmountCents: 25000,
	}

	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-tax-1").Return(expense, nil)
	mockStore.EXPECT().GetTaxDeductibilityMappings(gomock.Any(), userID).Return(nil, nil)
	mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(nil)

	resp, err := svc.ClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.ClassifyTaxDeductibilityRequest{
		UserId:    userID,
		ExpenseId: "exp-tax-1",
	}))
	if err != nil {
		t.Fatalf("ClassifyTaxDeductibility failed: %v", err)
	}

	result := resp.Msg.Result
	if !result.AutoApplied {
		t.Error("expected AutoApplied=true for high-confidence classification")
	}
	if result.Category != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_TAX_AFFAIRS {
		t.Errorf("Category = %v, want TAX_AFFAIRS", result.Category)
	}
	if !result.IsDeductible {
		t.Error("expected IsDeductible=true")
	}
}

func TestTaxClassify_NotDeductible(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	userID := "tax-user"
	ctx := testProContext(userID)

	expense := &pfinancev1.Expense{
		Id:          "exp-grocery",
		UserId:      userID,
		Description: "woolworths groceries",
		AmountCents: 15000,
	}

	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-grocery").Return(expense, nil)
	mockStore.EXPECT().GetTaxDeductibilityMappings(gomock.Any(), userID).Return(nil, nil)
	// Woolworths matches as not-deductible with confidence 0.90 (>= 0.85), so auto-apply fires
	mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(nil)

	resp, err := svc.ClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.ClassifyTaxDeductibilityRequest{
		UserId:    userID,
		ExpenseId: "exp-grocery",
	}))
	if err != nil {
		t.Fatalf("ClassifyTaxDeductibility failed: %v", err)
	}

	result := resp.Msg.Result
	if result.IsDeductible {
		t.Error("expected IsDeductible=false for groceries")
	}
	if result.Confidence < 0.85 {
		t.Errorf("Confidence = %v, want >= 0.85 for known non-deductible", result.Confidence)
	}
}

func TestTaxClassify_MissingExpenseId(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	ctx := testProContext("tax-user")

	_, err := svc.ClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.ClassifyTaxDeductibilityRequest{
		UserId:    "tax-user",
		ExpenseId: "",
	}))
	if err == nil {
		t.Fatal("expected error for missing expense_id")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("error code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestTaxClassify_ExpenseNotFound(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	ctx := testProContext("tax-user")

	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-missing").Return(nil, fmt.Errorf("not found"))

	_, err := svc.ClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.ClassifyTaxDeductibilityRequest{
		UserId:    "tax-user",
		ExpenseId: "exp-missing",
	}))
	if err == nil {
		t.Fatal("expected error for missing expense")
	}
	if connect.CodeOf(err) != connect.CodeNotFound {
		t.Errorf("error code = %v, want NotFound", connect.CodeOf(err))
	}
}

func TestTaxClassify_WrongOwner(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	ctx := testProContext("tax-user")

	expense := &pfinancev1.Expense{
		Id:          "exp-other",
		UserId:      "other-user",
		Description: "some expense",
		AmountCents: 5000,
	}
	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-other").Return(expense, nil)

	_, err := svc.ClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.ClassifyTaxDeductibilityRequest{
		UserId:    "tax-user",
		ExpenseId: "exp-other",
	}))
	if err == nil {
		t.Fatal("expected error for wrong owner")
	}
	if connect.CodeOf(err) != connect.CodePermissionDenied {
		t.Errorf("error code = %v, want PermissionDenied", connect.CodeOf(err))
	}
}

func TestTaxClassify_NoPipeline(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	// Pipeline not set on svc — should return Unavailable
	ctx := testProContext("tax-user")

	_, err := svc.ClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.ClassifyTaxDeductibilityRequest{
		UserId:    "tax-user",
		ExpenseId: "exp-1",
	}))
	if err == nil {
		t.Fatal("expected error when pipeline is nil")
	}
	if connect.CodeOf(err) != connect.CodeUnavailable {
		t.Errorf("error code = %v, want Unavailable", connect.CodeOf(err))
	}
}

// ============================================================================
// BatchClassifyTaxDeductibility RPC Tests
// ============================================================================

func TestTaxBatchClassify_EmptyExpenses(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().GetTaxDeductibilityMappings(gomock.Any(), userID).Return(nil, nil)
	mockStore.EXPECT().ListExpenses(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
		Return([]*pfinancev1.Expense{}, "", nil)

	resp, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
	}))
	if err != nil {
		t.Fatalf("BatchClassifyTaxDeductibility failed: %v", err)
	}
	if resp.Msg.TotalProcessed != 0 {
		t.Errorf("TotalProcessed = %d, want 0", resp.Msg.TotalProcessed)
	}
}

func TestTaxBatchClassify_AutoApplyFalse(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	expenses := []*pfinancev1.Expense{
		{
			Id:          "exp-hrblock",
			UserId:      userID,
			Description: "h&r block",
			AmountCents: 30000,
		},
	}

	mockStore.EXPECT().GetTaxDeductibilityMappings(gomock.Any(), userID).Return(nil, nil)
	mockStore.EXPECT().ListExpenses(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
		Return(expenses, "", nil)
	// UpdateExpense should NOT be called because auto_apply=false

	resp, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
		AutoApply:     false,
	}))
	if err != nil {
		t.Fatalf("BatchClassifyTaxDeductibility failed: %v", err)
	}
	if resp.Msg.TotalProcessed != 1 {
		t.Errorf("TotalProcessed = %d, want 1", resp.Msg.TotalProcessed)
	}
	if resp.Msg.AutoApplied != 0 {
		t.Errorf("AutoApplied = %d, want 0 (auto_apply=false)", resp.Msg.AutoApplied)
	}
}

func TestTaxBatchClassify_InvalidFY(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	svc.SetTaxClassificationPipeline(extraction.NewTaxClassificationPipeline(""))

	ctx := testProContext("tax-user")

	// parseFYDateRange runs before GetTaxDeductibilityMappings, so no store calls expected

	_, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		UserId:        "tax-user",
		FinancialYear: "bad",
	}))
	if err == nil {
		t.Fatal("expected error for invalid FY")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("error code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestTaxBatchClassify_NoPipeline(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	// Pipeline not set on svc — should return Unavailable
	ctx := testProContext("tax-user")

	_, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		UserId:        "tax-user",
		FinancialYear: "2024-25",
	}))
	if err == nil {
		t.Fatal("expected error when pipeline is nil")
	}
	if connect.CodeOf(err) != connect.CodeUnavailable {
		t.Errorf("error code = %v, want Unavailable", connect.CodeOf(err))
	}
}

// ============================================================================
// ExportTaxReturn RPC Tests
// ============================================================================

func TestTaxExport_CSV(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().GetTaxConfig(gomock.Any(), userID, "").Return(nil, fmt.Errorf("not found"))

	incomes := []*pfinancev1.Income{
		{
			Id:          "inc-1",
			UserId:      userID,
			AmountCents: 10000000, // $100,000
			Date:        timestamppb.New(time.Date(2024, 8, 1, 0, 0, 0, 0, time.UTC)),
		},
	}
	mockStore.EXPECT().ListIncomes(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
		Return(incomes, "", nil)

	deductions := []*pfinancev1.TaxDeductionSummary{
		{
			Category:     pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
			TotalCents:   100000,
			TotalAmount:  1000.0,
			ExpenseCount: 3,
		},
	}
	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return(deductions, nil)

	resp, err := svc.ExportTaxReturn(ctx, connect.NewRequest(&pfinancev1.ExportTaxReturnRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
		Format:        pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_CSV,
	}))
	if err != nil {
		t.Fatalf("ExportTaxReturn CSV failed: %v", err)
	}

	if resp.Msg.ContentType != "text/csv" {
		t.Errorf("ContentType = %q, want text/csv", resp.Msg.ContentType)
	}
	if !strings.Contains(resp.Msg.Filename, "csv") {
		t.Errorf("Filename = %q, expected to contain 'csv'", resp.Msg.Filename)
	}

	// Parse CSV data and verify headers
	reader := csv.NewReader(strings.NewReader(string(resp.Msg.Data)))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("failed to parse CSV: %v", err)
	}
	if len(records) < 2 {
		t.Fatal("CSV has fewer than 2 rows")
	}
	header := records[0]
	if header[0] != "Field" || header[1] != "Amount ($)" || header[2] != "Amount (cents)" {
		t.Errorf("CSV headers = %v, want [Field, Amount ($), Amount (cents)]", header)
	}
}

func TestTaxExport_JSON(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().GetTaxConfig(gomock.Any(), userID, "").Return(nil, fmt.Errorf("not found"))

	incomes := []*pfinancev1.Income{
		{
			Id:          "inc-1",
			UserId:      userID,
			AmountCents: 10000000,
			Date:        timestamppb.New(time.Date(2024, 8, 1, 0, 0, 0, 0, time.UTC)),
		},
	}
	mockStore.EXPECT().ListIncomes(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
		Return(incomes, "", nil)

	deductions := []*pfinancev1.TaxDeductionSummary{
		{
			Category:     pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_HOME_OFFICE,
			TotalCents:   100000,
			TotalAmount:  1000.0,
			ExpenseCount: 3,
		},
	}
	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return(deductions, nil)

	resp, err := svc.ExportTaxReturn(ctx, connect.NewRequest(&pfinancev1.ExportTaxReturnRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
		Format:        pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_JSON,
	}))
	if err != nil {
		t.Fatalf("ExportTaxReturn JSON failed: %v", err)
	}

	if resp.Msg.ContentType != "application/json" {
		t.Errorf("ContentType = %q, want application/json", resp.Msg.ContentType)
	}

	// Verify JSON can be unmarshalled and has gross_income field
	// Note: encoding/json uses Go struct tags which are snake_case for proto-generated types
	var parsed map[string]interface{}
	if err := json.Unmarshal(resp.Msg.Data, &parsed); err != nil {
		t.Fatalf("failed to unmarshal JSON: %v", err)
	}
	if _, ok := parsed["gross_income"]; !ok {
		t.Error("JSON does not contain gross_income field")
	}
}

func TestTaxExport_NoIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().GetTaxConfig(gomock.Any(), userID, "").Return(nil, fmt.Errorf("not found"))
	mockStore.EXPECT().ListIncomes(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
		Return([]*pfinancev1.Income{}, "", nil)
	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return([]*pfinancev1.TaxDeductionSummary{}, nil)

	resp, err := svc.ExportTaxReturn(ctx, connect.NewRequest(&pfinancev1.ExportTaxReturnRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
		Format:        pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_JSON,
	}))
	if err != nil {
		t.Fatalf("ExportTaxReturn with no income failed: %v", err)
	}
	if resp.Msg.Calculation.GrossIncomeCents != 0 {
		t.Errorf("GrossIncomeCents = %d, want 0", resp.Msg.Calculation.GrossIncomeCents)
	}
}

// ============================================================================
// GetTaxEstimate RPC Tests
// ============================================================================

func TestTaxEstimate_WithGrossOverride(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	// ListIncomes should NOT be called because gross override is provided
	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return([]*pfinancev1.TaxDeductionSummary{}, nil)

	resp, err := svc.GetTaxEstimate(ctx, connect.NewRequest(&pfinancev1.GetTaxEstimateRequest{
		UserId:                   userID,
		FinancialYear:            "2024-25",
		GrossIncomeOverrideCents: 10000000, // $100k
	}))
	if err != nil {
		t.Fatalf("GetTaxEstimate failed: %v", err)
	}
	calc := resp.Msg.Calculation
	if calc.GrossIncomeCents != 10000000 {
		t.Errorf("GrossIncomeCents = %d, want 10000000", calc.GrossIncomeCents)
	}
}

func TestTaxEstimate_WithHELP(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return([]*pfinancev1.TaxDeductionSummary{}, nil)

	resp, err := svc.GetTaxEstimate(ctx, connect.NewRequest(&pfinancev1.GetTaxEstimateRequest{
		UserId:                   userID,
		FinancialYear:            "2024-25",
		GrossIncomeOverrideCents: 10000000, // $100k
		IncludeHelp:              true,
	}))
	if err != nil {
		t.Fatalf("GetTaxEstimate with HELP failed: %v", err)
	}
	calc := resp.Msg.Calculation
	if calc.HelpRepaymentCents <= 0 {
		t.Errorf("HelpRepaymentCents = %d, want > 0 for $100k income with HELP", calc.HelpRepaymentCents)
	}
}

func TestTaxEstimate_WithMedicareExemption(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return([]*pfinancev1.TaxDeductionSummary{}, nil)

	resp, err := svc.GetTaxEstimate(ctx, connect.NewRequest(&pfinancev1.GetTaxEstimateRequest{
		UserId:                   userID,
		FinancialYear:            "2024-25",
		GrossIncomeOverrideCents: 10000000, // $100k
		MedicareExemption:        true,
	}))
	if err != nil {
		t.Fatalf("GetTaxEstimate with medicare exemption failed: %v", err)
	}
	calc := resp.Msg.Calculation
	if calc.MedicareLevyCents != 0 {
		t.Errorf("MedicareLevyCents = %d, want 0 with exemption", calc.MedicareLevyCents)
	}
}

func TestTaxEstimate_InvalidFY(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	ctx := testProContext("tax-user")

	_, err := svc.GetTaxEstimate(ctx, connect.NewRequest(&pfinancev1.GetTaxEstimateRequest{
		UserId:                   "tax-user",
		FinancialYear:            "bad",
		GrossIncomeOverrideCents: 10000000,
	}))
	if err == nil {
		t.Fatal("expected error for invalid FY")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("error code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

// ============================================================================
// Edge Cases for Existing RPCs
// ============================================================================

func TestTaxGetTaxSummary_NoIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().ListIncomes(gomock.Any(), userID, "", &fyStart, &fyEnd, int32(500), "").
		Return([]*pfinancev1.Income{}, "", nil)
	mockStore.EXPECT().AggregateDeductionsByCategory(gomock.Any(), userID, "", fyStart, fyEnd).
		Return([]*pfinancev1.TaxDeductionSummary{}, nil)

	resp, err := svc.GetTaxSummary(ctx, connect.NewRequest(&pfinancev1.GetTaxSummaryRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
	}))
	if err != nil {
		t.Fatalf("GetTaxSummary with no income failed: %v", err)
	}
	if resp.Msg.Calculation.GrossIncomeCents != 0 {
		t.Errorf("GrossIncomeCents = %d, want 0", resp.Msg.Calculation.GrossIncomeCents)
	}
}

func TestTaxGetTaxSummary_InvalidFY(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	ctx := testProContext("tax-user")

	_, err := svc.GetTaxSummary(ctx, connect.NewRequest(&pfinancev1.GetTaxSummaryRequest{
		UserId:        "tax-user",
		FinancialYear: "bad",
	}))
	if err == nil {
		t.Fatal("expected error for invalid FY")
	}
	if connect.CodeOf(err) != connect.CodeInvalidArgument {
		t.Errorf("error code = %v, want InvalidArgument", connect.CodeOf(err))
	}
}

func TestTaxBatchUpdate_OwnershipRejection(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	wrongOwnerExpense := &pfinancev1.Expense{
		Id:          "exp-wrong-owner",
		UserId:      "different-user",
		AmountCents: 5000,
	}
	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-wrong-owner").Return(wrongOwnerExpense, nil)

	resp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
		UserId: userID,
		Updates: []*pfinancev1.ExpenseTaxUpdate{
			{
				ExpenseId:       "exp-wrong-owner",
				IsTaxDeductible: true,
			},
		},
	}))
	if err != nil {
		t.Fatalf("BatchUpdateExpenseTaxStatus failed: %v", err)
	}
	if len(resp.Msg.FailedExpenseIds) != 1 || resp.Msg.FailedExpenseIds[0] != "exp-wrong-owner" {
		t.Errorf("FailedExpenseIds = %v, want [exp-wrong-owner]", resp.Msg.FailedExpenseIds)
	}
	if resp.Msg.UpdatedCount != 0 {
		t.Errorf("UpdatedCount = %d, want 0", resp.Msg.UpdatedCount)
	}
}

func TestTaxBatchUpdate_UpdateError(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	expense := &pfinancev1.Expense{
		Id:          "exp-update-fail",
		UserId:      userID,
		AmountCents: 5000,
	}
	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-update-fail").Return(expense, nil)
	mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(fmt.Errorf("store error"))

	resp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
		UserId: userID,
		Updates: []*pfinancev1.ExpenseTaxUpdate{
			{
				ExpenseId:       "exp-update-fail",
				IsTaxDeductible: true,
			},
		},
	}))
	if err != nil {
		t.Fatalf("BatchUpdateExpenseTaxStatus failed: %v", err)
	}
	if len(resp.Msg.FailedExpenseIds) != 1 || resp.Msg.FailedExpenseIds[0] != "exp-update-fail" {
		t.Errorf("FailedExpenseIds = %v, want [exp-update-fail]", resp.Msg.FailedExpenseIds)
	}
}

func TestTaxListDeductible_EmptyResults(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "tax-user"
	ctx := testProContext(userID)

	fyStart := time.Date(2024, time.July, 1, 0, 0, 0, 0, time.UTC)
	fyEnd := time.Date(2025, time.July, 1, 0, 0, 0, 0, time.UTC)

	mockStore.EXPECT().ListDeductibleExpenses(gomock.Any(), userID, "", &fyStart, &fyEnd, pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED, int32(0), "").
		Return([]*pfinancev1.Expense{}, "", nil)

	resp, err := svc.ListDeductibleExpenses(ctx, connect.NewRequest(&pfinancev1.ListDeductibleExpensesRequest{
		UserId:        userID,
		FinancialYear: "2024-25",
	}))
	if err != nil {
		t.Fatalf("ListDeductibleExpenses failed: %v", err)
	}
	if len(resp.Msg.Expenses) != 0 {
		t.Errorf("got %d expenses, want 0", len(resp.Msg.Expenses))
	}
	if resp.Msg.TotalDeductibleCents != 0 {
		t.Errorf("TotalDeductibleCents = %d, want 0", resp.Msg.TotalDeductibleCents)
	}
}

// ============================================================================
// FY Validation Tests
// ============================================================================

func TestParseFYDateRange_MismatchedYears(t *testing.T) {
	_, _, err := parseFYDateRange("2024-99")
	if err == nil {
		t.Fatal("expected error for mismatched FY years 2024-99")
	}
	if !strings.Contains(err.Error(), "does not match") {
		t.Errorf("error message = %q, expected to contain 'does not match'", err.Error())
	}
}
