package service

import (
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestProcessRecurringTransactions_CreatesExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	pastDate := time.Now().Add(-24 * time.Hour) // yesterday
	rt := &pfinancev1.RecurringTransaction{
		Id:             "rt-1",
		UserId:         "user-1",
		Description:    "Netflix",
		Amount:         15.99,
		AmountCents:    1599,
		Category:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
		Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
		StartDate:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
		NextOccurrence: timestamppb.New(pastDate),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      true,
		Tags:           []string{"subscription"},
		PaidByUserId:   "user-1",
		CreatedAt:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
		UpdatedAt:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
	}

	// ListRecurringTransactions returns one active transaction
	mockStore.EXPECT().
		ListRecurringTransactions(
			gomock.Any(),
			"", // all users
			"", // all groups
			pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
			false, // filterIsExpense
			false, // isExpense (unused)
			int32(1000),
			"",
		).
		Return([]*pfinancev1.RecurringTransaction{rt}, "", nil)

	// Expect CreateExpense to be called with the correct fields
	mockStore.EXPECT().
		CreateExpense(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ interface{}, expense *pfinancev1.Expense) error {
			if expense.Description != "Netflix" {
				t.Errorf("expected description 'Netflix', got %q", expense.Description)
			}
			if expense.AmountCents != 1599 {
				t.Errorf("expected amount_cents 1599, got %d", expense.AmountCents)
			}
			if expense.Amount != 15.99 {
				t.Errorf("expected amount 15.99, got %f", expense.Amount)
			}
			if expense.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT {
				t.Errorf("expected category ENTERTAINMENT, got %v", expense.Category)
			}
			if expense.Frequency != pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE {
				t.Errorf("expected frequency ONCE, got %v", expense.Frequency)
			}
			if expense.UserId != "user-1" {
				t.Errorf("expected user_id 'user-1', got %q", expense.UserId)
			}
			if expense.PaidByUserId != "user-1" {
				t.Errorf("expected paid_by_user_id 'user-1', got %q", expense.PaidByUserId)
			}
			// Check tags include both original and "auto-recurring"
			foundAutoRecurring := false
			foundSubscription := false
			for _, tag := range expense.Tags {
				if tag == "auto-recurring" {
					foundAutoRecurring = true
				}
				if tag == "subscription" {
					foundSubscription = true
				}
			}
			if !foundAutoRecurring {
				t.Error("expected 'auto-recurring' tag")
			}
			if !foundSubscription {
				t.Error("expected 'subscription' tag to be preserved")
			}
			// Expense date should match the recurring transaction's next occurrence
			if expense.Date.AsTime().Unix() != pastDate.Unix() {
				t.Errorf("expected date to match next_occurrence, got %v", expense.Date.AsTime())
			}
			return nil
		})

	// Expect UpdateRecurringTransaction to be called with advanced next_occurrence
	mockStore.EXPECT().
		UpdateRecurringTransaction(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ interface{}, updatedRT *pfinancev1.RecurringTransaction) error {
			// Next occurrence should be advanced by 1 month from the old next_occurrence
			newNext := updatedRT.NextOccurrence.AsTime()
			if !newNext.After(time.Now()) {
				t.Errorf("expected next_occurrence to be in the future, got %v", newNext)
			}
			return nil
		})

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.ProcessedCount != 1 {
		t.Errorf("expected processed_count=1, got %d", resp.Msg.ProcessedCount)
	}
	if resp.Msg.SkippedCount != 0 {
		t.Errorf("expected skipped_count=0, got %d", resp.Msg.SkippedCount)
	}
	if resp.Msg.EndedCount != 0 {
		t.Errorf("expected ended_count=0, got %d", resp.Msg.EndedCount)
	}
	if resp.Msg.ErrorCount != 0 {
		t.Errorf("expected error_count=0, got %d", resp.Msg.ErrorCount)
	}
}

func TestProcessRecurringTransactions_CreatesIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	pastDate := time.Now().Add(-2 * time.Hour)
	rt := &pfinancev1.RecurringTransaction{
		Id:             "rt-2",
		UserId:         "user-2",
		Description:    "Monthly Salary",
		Amount:         5000.00,
		AmountCents:    500000,
		Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
		StartDate:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
		NextOccurrence: timestamppb.New(pastDate),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      false, // income
		CreatedAt:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
		UpdatedAt:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
	}

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return([]*pfinancev1.RecurringTransaction{rt}, "", nil)

	mockStore.EXPECT().
		CreateIncome(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ interface{}, income *pfinancev1.Income) error {
			if income.Source != "Monthly Salary" {
				t.Errorf("expected source 'Monthly Salary', got %q", income.Source)
			}
			if income.AmountCents != 500000 {
				t.Errorf("expected amount_cents 500000, got %d", income.AmountCents)
			}
			if income.UserId != "user-2" {
				t.Errorf("expected user_id 'user-2', got %q", income.UserId)
			}
			return nil
		})

	mockStore.EXPECT().
		UpdateRecurringTransaction(gomock.Any(), gomock.Any()).
		Return(nil)

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.ProcessedCount != 1 {
		t.Errorf("expected processed_count=1, got %d", resp.Msg.ProcessedCount)
	}
}

func TestProcessRecurringTransactions_SkipsNotYetDue(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	futureDate := time.Now().Add(7 * 24 * time.Hour) // 1 week from now
	rt := &pfinancev1.RecurringTransaction{
		Id:             "rt-3",
		UserId:         "user-3",
		Description:    "Future Bill",
		Amount:         50.00,
		AmountCents:    5000,
		Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
		NextOccurrence: timestamppb.New(futureDate),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      true,
	}

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return([]*pfinancev1.RecurringTransaction{rt}, "", nil)

	// No CreateExpense or UpdateRecurringTransaction calls expected

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.ProcessedCount != 0 {
		t.Errorf("expected processed_count=0, got %d", resp.Msg.ProcessedCount)
	}
	if resp.Msg.SkippedCount != 1 {
		t.Errorf("expected skipped_count=1, got %d", resp.Msg.SkippedCount)
	}
}

func TestProcessRecurringTransactions_MarksEnded(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	pastDate := time.Now().Add(-24 * time.Hour)
	endDate := time.Now().Add(-48 * time.Hour) // end date is before next occurrence

	rt := &pfinancev1.RecurringTransaction{
		Id:             "rt-4",
		UserId:         "user-4",
		Description:    "Expired Sub",
		Amount:         9.99,
		AmountCents:    999,
		Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
		NextOccurrence: timestamppb.New(pastDate),
		EndDate:        timestamppb.New(endDate),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      true,
	}

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return([]*pfinancev1.RecurringTransaction{rt}, "", nil)

	// Expect UpdateRecurringTransaction to be called to mark as ENDED
	mockStore.EXPECT().
		UpdateRecurringTransaction(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ interface{}, updatedRT *pfinancev1.RecurringTransaction) error {
			if updatedRT.Status != pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ENDED {
				t.Errorf("expected status ENDED, got %v", updatedRT.Status)
			}
			return nil
		})

	// No CreateExpense expected since it's past end date

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.EndedCount != 1 {
		t.Errorf("expected ended_count=1, got %d", resp.Msg.EndedCount)
	}
	if resp.Msg.ProcessedCount != 0 {
		t.Errorf("expected processed_count=0, got %d", resp.Msg.ProcessedCount)
	}
}

func TestProcessRecurringTransactions_MultipleTransactions(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	pastDate := time.Now().Add(-24 * time.Hour)
	futureDate := time.Now().Add(7 * 24 * time.Hour)

	rts := []*pfinancev1.RecurringTransaction{
		{
			Id:             "rt-due",
			UserId:         "user-1",
			Description:    "Due Bill",
			Amount:         20.00,
			AmountCents:    2000,
			Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_WEEKLY,
			StartDate:      timestamppb.New(pastDate.Add(-7 * 24 * time.Hour)),
			NextOccurrence: timestamppb.New(pastDate),
			Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
			IsExpense:      true,
		},
		{
			Id:             "rt-not-due",
			UserId:         "user-2",
			Description:    "Future Bill",
			Amount:         30.00,
			AmountCents:    3000,
			Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
			NextOccurrence: timestamppb.New(futureDate),
			Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
			IsExpense:      true,
		},
	}

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return(rts, "", nil)

	mockStore.EXPECT().
		CreateExpense(gomock.Any(), gomock.Any()).
		Return(nil)

	mockStore.EXPECT().
		UpdateRecurringTransaction(gomock.Any(), gomock.Any()).
		Return(nil)

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.ProcessedCount != 1 {
		t.Errorf("expected processed_count=1, got %d", resp.Msg.ProcessedCount)
	}
	if resp.Msg.SkippedCount != 1 {
		t.Errorf("expected skipped_count=1, got %d", resp.Msg.SkippedCount)
	}
}

func TestProcessRecurringTransactions_GroupExpenseWithAllocations(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	pastDate := time.Now().Add(-1 * time.Hour)
	rt := &pfinancev1.RecurringTransaction{
		Id:             "rt-group",
		UserId:         "user-1",
		GroupId:        "group-1",
		Description:    "Shared Rent",
		Amount:         2000.00,
		AmountCents:    200000,
		Category:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING,
		Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
		StartDate:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
		NextOccurrence: timestamppb.New(pastDate),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      true,
		PaidByUserId:   "user-1",
		SplitType:      pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
		Allocations: []*pfinancev1.ExpenseAllocation{
			{UserId: "user-1", Amount: 1000.00, AmountCents: 100000},
			{UserId: "user-2", Amount: 1000.00, AmountCents: 100000},
		},
	}

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return([]*pfinancev1.RecurringTransaction{rt}, "", nil)

	mockStore.EXPECT().
		CreateExpense(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ interface{}, expense *pfinancev1.Expense) error {
			if expense.GroupId != "group-1" {
				t.Errorf("expected group_id 'group-1', got %q", expense.GroupId)
			}
			if expense.SplitType != pfinancev1.SplitType_SPLIT_TYPE_EQUAL {
				t.Errorf("expected split_type EQUAL, got %v", expense.SplitType)
			}
			if len(expense.Allocations) != 2 {
				t.Errorf("expected 2 allocations, got %d", len(expense.Allocations))
			}
			return nil
		})

	mockStore.EXPECT().
		UpdateRecurringTransaction(gomock.Any(), gomock.Any()).
		Return(nil)

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.ProcessedCount != 1 {
		t.Errorf("expected processed_count=1, got %d", resp.Msg.ProcessedCount)
	}
}

func TestProcessRecurringTransactions_EndsAfterProcessing(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	pastDate := time.Now().Add(-1 * time.Hour)
	// End date is in the future relative to next_occurrence but before the NEXT next_occurrence
	// e.g., monthly bill due yesterday, end date is 2 weeks from now (before next month)
	endDate := time.Now().Add(14 * 24 * time.Hour)

	rt := &pfinancev1.RecurringTransaction{
		Id:             "rt-last-run",
		UserId:         "user-5",
		Description:    "Last Month Sub",
		Amount:         12.99,
		AmountCents:    1299,
		Frequency:      pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY,
		StartDate:      timestamppb.New(pastDate.Add(-30 * 24 * time.Hour)),
		NextOccurrence: timestamppb.New(pastDate),
		EndDate:        timestamppb.New(endDate),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      true,
	}

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return([]*pfinancev1.RecurringTransaction{rt}, "", nil)

	// Should create the expense (since next_occurrence is before end_date)
	mockStore.EXPECT().
		CreateExpense(gomock.Any(), gomock.Any()).
		Return(nil)

	// Should update with ENDED status since next next_occurrence would be past end_date
	mockStore.EXPECT().
		UpdateRecurringTransaction(gomock.Any(), gomock.Any()).
		DoAndReturn(func(_ interface{}, updatedRT *pfinancev1.RecurringTransaction) error {
			if updatedRT.Status != pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ENDED {
				t.Errorf("expected status ENDED after final processing, got %v", updatedRT.Status)
			}
			return nil
		})

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// It was processed (expense created) but not counted as ended since the primary action was processing
	if resp.Msg.ProcessedCount != 1 {
		t.Errorf("expected processed_count=1, got %d", resp.Msg.ProcessedCount)
	}
}

func TestProcessRecurringTransactions_Empty(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)

	mockStore.EXPECT().
		ListRecurringTransactions(gomock.Any(), "", "", pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE, false, false, int32(1000), "").
		Return([]*pfinancev1.RecurringTransaction{}, "", nil)

	ctx := testContext("system-scheduler")
	resp, err := svc.ProcessRecurringTransactions(ctx, connect.NewRequest(&pfinancev1.ProcessRecurringTransactionsRequest{}))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if resp.Msg.ProcessedCount != 0 {
		t.Errorf("expected processed_count=0, got %d", resp.Msg.ProcessedCount)
	}
	if resp.Msg.SkippedCount != 0 {
		t.Errorf("expected skipped_count=0, got %d", resp.Msg.SkippedCount)
	}
	if resp.Msg.EndedCount != 0 {
		t.Errorf("expected ended_count=0, got %d", resp.Msg.EndedCount)
	}
	if resp.Msg.ErrorCount != 0 {
		t.Errorf("expected error_count=0, got %d", resp.Msg.ErrorCount)
	}
}
