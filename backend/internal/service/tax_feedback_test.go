package service

import (
	"fmt"
	"testing"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestExtractMerchantPattern(t *testing.T) {
	tests := []struct {
		desc string
		want string
	}{
		{"officeworks", "officeworks"},
		{"officeworks - ref:12345", "officeworks"},
		{"uber trip card 1234", "uber trip"},
		{"starbucks visa 9876", "starbucks"},
		{"bunnings #456", "bunnings"},
		{"jb hi-fi eftpos purchase", "jb hi-fi"},
		{"ab", ""},
		{"", ""},
	}

	for _, tt := range tests {
		t.Run(tt.desc, func(t *testing.T) {
			got := extractMerchantPattern(tt.desc)
			if got != tt.want {
				t.Errorf("extractMerchantPattern(%q) = %q, want %q", tt.desc, got, tt.want)
			}
		})
	}
}

func TestTaxMappingConfidence(t *testing.T) {
	tests := []struct {
		count int32
		want  float64
	}{
		{1, 0.75},
		{2, 0.80},
		{5, 0.95},
		{6, 0.99},
		{10, 0.99},
	}

	for _, tt := range tests {
		t.Run(fmt.Sprintf("count=%d", tt.count), func(t *testing.T) {
			got := taxMappingConfidence(tt.count)
			diff := got - tt.want
			if diff < 0 {
				diff = -diff
			}
			if diff > 1e-9 {
				t.Errorf("taxMappingConfidence(%d) = %f, want %f", tt.count, got, tt.want)
			}
		})
	}
}

func TestAggregateCorrectionPatterns_Empty(t *testing.T) {
	signals := AggregateCorrectionPatterns(nil)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals for nil input, got %d", len(signals))
	}

	signals = AggregateCorrectionPatterns([]*pfinancev1.CorrectionRecord{})
	if len(signals) != 0 {
		t.Errorf("expected 0 signals for empty input, got %d", len(signals))
	}
}

func TestAggregateCorrectionPatterns_NeedsTwoCorrections(t *testing.T) {
	corrections := []*pfinancev1.CorrectionRecord{
		{
			OriginalMerchant:  "Officeworks",
			CorrectedMerchant: "Officeworks",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
		},
	}

	signals := AggregateCorrectionPatterns(corrections)
	if len(signals) != 0 {
		t.Errorf("expected 0 signals for single correction, got %d", len(signals))
	}
}

func TestAggregateCorrectionPatterns_ConsistentPattern(t *testing.T) {
	corrections := []*pfinancev1.CorrectionRecord{
		{
			OriginalMerchant:  "Officeworks",
			CorrectedMerchant: "Officeworks",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
		},
		{
			OriginalMerchant:  "Officeworks",
			CorrectedMerchant: "Officeworks",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
		},
		{
			OriginalMerchant:  "Officeworks",
			CorrectedMerchant: "Officeworks",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
		},
	}

	signals := AggregateCorrectionPatterns(corrections)
	if len(signals) != 1 {
		t.Fatalf("expected 1 signal, got %d", len(signals))
	}

	s := signals[0]
	if s.CorrectedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION {
		t.Errorf("expected category EDUCATION, got %v", s.CorrectedCategory)
	}
	if s.CorrectionCount != 3 {
		t.Errorf("expected 3 corrections, got %d", s.CorrectionCount)
	}
	if s.Consistency != 1.0 {
		t.Errorf("expected consistency 1.0, got %f", s.Consistency)
	}
}

func TestAggregateCorrectionPatterns_InconsistentFiltered(t *testing.T) {
	corrections := []*pfinancev1.CorrectionRecord{
		{
			OriginalMerchant:  "some shop",
			CorrectedMerchant: "Some Shop",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
		{
			OriginalMerchant:  "some shop",
			CorrectedMerchant: "Some Shop",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
		},
		{
			OriginalMerchant:  "some shop",
			CorrectedMerchant: "Some Shop",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
		},
		{
			OriginalMerchant:  "some shop",
			CorrectedMerchant: "Some Shop",
			CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
		},
	}

	signals := AggregateCorrectionPatterns(corrections)
	// 4 different categories, each with count 1 out of 4 = 25% consistency, below 50% threshold
	if len(signals) != 0 {
		t.Errorf("expected 0 signals for inconsistent corrections, got %d", len(signals))
	}
}

func TestBatchUpdateExpenseTaxStatus_FeedbackCreatesMapping(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "feedback-user-1"
	ctx := testProContext(userID)

	expense := &pfinancev1.Expense{
		Id:          "exp-1",
		UserId:      userID,
		Description: "Officeworks supplies",
		Amount:      45.99,
		AmountCents: 4599,
		Date:        timestamppb.Now(),
	}

	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-1").Return(expense, nil)
	mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(nil)

	// Feedback loop: no existing mappings
	mockStore.EXPECT().GetTaxDeductibilityMappings(gomock.Any(), userID).Return(nil, nil)

	// Should create a new mapping
	mockStore.EXPECT().UpsertTaxDeductibilityMapping(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ interface{}, mapping *pfinancev1.TaxDeductibilityMapping) error {
			if mapping.UserId != userID {
				t.Errorf("mapping UserId = %q, want %q", mapping.UserId, userID)
			}
			if mapping.DeductionCategory != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK {
				t.Errorf("mapping DeductionCategory = %v, want OTHER_WORK", mapping.DeductionCategory)
			}
			if mapping.ConfirmationCount != 1 {
				t.Errorf("mapping ConfirmationCount = %d, want 1", mapping.ConfirmationCount)
			}
			if mapping.Confidence != 0.75 {
				t.Errorf("mapping Confidence = %f, want 0.75", mapping.Confidence)
			}
			return nil
		},
	)

	resp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
		UserId: userID,
		Updates: []*pfinancev1.ExpenseTaxUpdate{
			{
				ExpenseId:            "exp-1",
				IsTaxDeductible:      true,
				TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
				TaxDeductiblePercent: 1.0,
			},
		},
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.UpdatedCount != 1 {
		t.Errorf("UpdatedCount = %d, want 1", resp.Msg.UpdatedCount)
	}
}

func TestBatchUpdateExpenseTaxStatus_FeedbackUpdatesExisting(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "feedback-user-2"
	ctx := testProContext(userID)

	expense := &pfinancev1.Expense{
		Id:          "exp-2",
		UserId:      userID,
		Description: "Officeworks printer ink",
		Amount:      29.99,
		AmountCents: 2999,
		Date:        timestamppb.Now(),
	}

	existingMapping := &pfinancev1.TaxDeductibilityMapping{
		Id:                "mapping-1",
		UserId:            userID,
		MerchantPattern:   "officeworks printer ink",
		DeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
		DeductiblePercent: 1.0,
		ConfirmationCount: 2,
		Confidence:        0.80,
	}

	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-2").Return(expense, nil)
	mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(nil)

	// Existing mapping found
	mockStore.EXPECT().GetTaxDeductibilityMappings(gomock.Any(), userID).Return(
		[]*pfinancev1.TaxDeductibilityMapping{existingMapping}, nil,
	)

	// Update with incremented count
	mockStore.EXPECT().UpsertTaxDeductibilityMapping(gomock.Any(), gomock.Any()).DoAndReturn(
		func(_ interface{}, mapping *pfinancev1.TaxDeductibilityMapping) error {
			if mapping.ConfirmationCount != 3 {
				t.Errorf("mapping ConfirmationCount = %d, want 3", mapping.ConfirmationCount)
			}
			if mapping.Confidence != 0.85 {
				t.Errorf("mapping Confidence = %f, want 0.85", mapping.Confidence)
			}
			return nil
		},
	)

	resp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
		UserId: userID,
		Updates: []*pfinancev1.ExpenseTaxUpdate{
			{
				ExpenseId:            "exp-2",
				IsTaxDeductible:      true,
				TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
				TaxDeductiblePercent: 1.0,
			},
		},
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.UpdatedCount != 1 {
		t.Errorf("UpdatedCount = %d, want 1", resp.Msg.UpdatedCount)
	}
}

func TestBatchUpdateExpenseTaxStatus_NoFeedbackForNonDeductible(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	mockStore.EXPECT().GetUser(gomock.Any(), gomock.Any()).Return(nil, fmt.Errorf("not found")).AnyTimes()

	userID := "feedback-user-3"
	ctx := testProContext(userID)

	expense := &pfinancev1.Expense{
		Id:          "exp-3",
		UserId:      userID,
		Description: "Coffee at cafe",
		Amount:      5.50,
		AmountCents: 550,
		Date:        timestamppb.Now(),
	}

	mockStore.EXPECT().GetExpense(gomock.Any(), "exp-3").Return(expense, nil)
	mockStore.EXPECT().UpdateExpense(gomock.Any(), gomock.Any()).Return(nil)

	// No feedback calls expected for non-deductible updates

	resp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
		UserId: userID,
		Updates: []*pfinancev1.ExpenseTaxUpdate{
			{
				ExpenseId:       "exp-3",
				IsTaxDeductible: false,
			},
		},
	}))

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Msg.UpdatedCount != 1 {
		t.Errorf("UpdatedCount = %d, want 1", resp.Msg.UpdatedCount)
	}
}
