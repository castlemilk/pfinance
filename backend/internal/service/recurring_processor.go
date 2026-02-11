package service

import (
	"context"
	"fmt"
	"log"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// ProcessRecurringTransactions processes all active recurring transactions that are due.
// It creates corresponding expenses or incomes and advances the next occurrence date.
// This endpoint is designed to be called by Cloud Scheduler without user authentication.
func (s *FinanceService) ProcessRecurringTransactions(
	ctx context.Context,
	req *connect.Request[pfinancev1.ProcessRecurringTransactionsRequest],
) (*connect.Response[pfinancev1.ProcessRecurringTransactionsResponse], error) {

	now := time.Now()
	var processedCount, skippedCount, endedCount, errorCount int32

	// Paginate through all active recurring transactions across all users.
	// We pass empty userID/groupID and ACTIVE status to get everything.
	pageToken := ""
	for {
		rts, nextToken, err := s.store.ListRecurringTransactions(
			ctx,
			"", // all users
			"", // all groups
			pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
			false, // don't filter by is_expense
			false, // unused when filterIsExpense is false
			1000,  // large page size
			pageToken,
		)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal,
				fmt.Errorf("failed to list recurring transactions: %w", err))
		}

		for _, rt := range rts {
			processed, ended, procErr := s.processOneRecurringTransaction(ctx, rt, now)
			if procErr != nil {
				log.Printf("[RecurringProcessor] error processing rt %s (user %s): %v", rt.Id, rt.UserId, procErr)
				errorCount++
				continue
			}
			if ended {
				endedCount++
			} else if processed {
				processedCount++
			} else {
				skippedCount++
			}
		}

		if nextToken == "" {
			break
		}
		pageToken = nextToken
	}

	log.Printf("[RecurringProcessor] completed: processed=%d skipped=%d ended=%d errors=%d",
		processedCount, skippedCount, endedCount, errorCount)

	return connect.NewResponse(&pfinancev1.ProcessRecurringTransactionsResponse{
		ProcessedCount: processedCount,
		SkippedCount:   skippedCount,
		EndedCount:     endedCount,
		ErrorCount:     errorCount,
	}), nil
}

// processOneRecurringTransaction handles a single recurring transaction.
// Returns (processed, ended, error).
func (s *FinanceService) processOneRecurringTransaction(
	ctx context.Context,
	rt *pfinancev1.RecurringTransaction,
	now time.Time,
) (bool, bool, error) {
	if rt.NextOccurrence == nil {
		return false, false, fmt.Errorf("recurring transaction %s has nil next_occurrence", rt.Id)
	}

	nextOccurrence := rt.NextOccurrence.AsTime()

	// Not yet due -- skip
	if nextOccurrence.After(now) {
		return false, false, nil
	}

	// Check if past end_date -- mark as ENDED
	if rt.EndDate != nil && !rt.EndDate.AsTime().IsZero() && nextOccurrence.After(rt.EndDate.AsTime()) {
		rt.Status = pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ENDED
		rt.UpdatedAt = timestamppb.Now()
		if err := s.store.UpdateRecurringTransaction(ctx, rt); err != nil {
			return false, false, fmt.Errorf("failed to mark recurring transaction as ended: %w", err)
		}
		return false, true, nil
	}

	// Create the expense or income
	if rt.IsExpense {
		if err := s.createExpenseFromRecurring(ctx, rt); err != nil {
			return false, false, fmt.Errorf("failed to create expense: %w", err)
		}
	} else {
		if err := s.createIncomeFromRecurring(ctx, rt); err != nil {
			return false, false, fmt.Errorf("failed to create income: %w", err)
		}
	}

	// Advance next_occurrence
	newNext := calculateNextOccurrence(nextOccurrence, rt.Frequency)
	rt.NextOccurrence = timestamppb.New(newNext)
	rt.UpdatedAt = timestamppb.Now()

	// If the new next_occurrence is past end_date, mark as ENDED
	if rt.EndDate != nil && !rt.EndDate.AsTime().IsZero() && newNext.After(rt.EndDate.AsTime()) {
		rt.Status = pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ENDED
	}

	if err := s.store.UpdateRecurringTransaction(ctx, rt); err != nil {
		return false, false, fmt.Errorf("failed to update recurring transaction next_occurrence: %w", err)
	}

	return true, false, nil
}

// createExpenseFromRecurring creates a one-time expense from a recurring transaction.
func (s *FinanceService) createExpenseFromRecurring(ctx context.Context, rt *pfinancev1.RecurringTransaction) error {
	// Build tags: copy existing tags and add "auto-recurring"
	tags := make([]string, 0, len(rt.Tags)+1)
	tags = append(tags, rt.Tags...)
	tags = append(tags, "auto-recurring")

	// Default paid_by_user_id to user_id if not set
	paidByUserID := rt.PaidByUserId
	if paidByUserID == "" {
		paidByUserID = rt.UserId
	}

	expense := &pfinancev1.Expense{
		Id:           uuid.New().String(),
		UserId:       rt.UserId,
		GroupId:      rt.GroupId,
		Description:  rt.Description,
		Amount:       rt.Amount,
		AmountCents:  rt.AmountCents,
		Category:     rt.Category,
		Frequency:    pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
		Date:         rt.NextOccurrence,
		CreatedAt:    timestamppb.Now(),
		UpdatedAt:    timestamppb.Now(),
		PaidByUserId: paidByUserID,
		SplitType:    rt.SplitType,
		Allocations:  rt.Allocations,
		Tags:         tags,
		IsSettled:    false,
	}

	return s.store.CreateExpense(ctx, expense)
}

// createIncomeFromRecurring creates a one-time income from a recurring transaction.
func (s *FinanceService) createIncomeFromRecurring(ctx context.Context, rt *pfinancev1.RecurringTransaction) error {
	income := &pfinancev1.Income{
		Id:          uuid.New().String(),
		UserId:      rt.UserId,
		GroupId:     rt.GroupId,
		Source:      rt.Description,
		Amount:      rt.Amount,
		AmountCents: rt.AmountCents,
		Frequency:   pfinancev1.IncomeFrequency_INCOME_FREQUENCY_UNSPECIFIED,
		Date:        rt.NextOccurrence,
		CreatedAt:   timestamppb.Now(),
		UpdatedAt:   timestamppb.Now(),
	}

	return s.store.CreateIncome(ctx, income)
}
