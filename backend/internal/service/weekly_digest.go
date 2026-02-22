package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// GenerateWeeklyDigest creates weekly financial summary notifications for users
// who have opted in via their notification preferences.
// If user_id is provided, it generates a digest for that single user.
// Otherwise, it's designed to be called by Cloud Scheduler to process all opted-in users.
//
// Authentication: requires either a valid user auth token (Firebase/API key) or
// a valid X-Scheduler-Secret header matching the SCHEDULER_SECRET env var.
func (s *FinanceService) GenerateWeeklyDigest(
	ctx context.Context,
	req *connect.Request[pfinancev1.GenerateWeeklyDigestRequest],
) (*connect.Response[pfinancev1.GenerateWeeklyDigestResponse], error) {

	// Check authentication: either user auth or scheduler secret must be present.
	claims, hasAuth := auth.GetUserClaims(ctx)
	if !hasAuth {
		// No user auth -- validate scheduler secret
		schedulerSecret := os.Getenv("SCHEDULER_SECRET")
		providedSecret := req.Header().Get("X-Scheduler-Secret")
		if schedulerSecret == "" || providedSecret != schedulerSecret {
			return nil, connect.NewError(connect.CodeUnauthenticated,
				fmt.Errorf("missing or invalid authentication: provide a valid auth token or X-Scheduler-Secret header"))
		}
		log.Printf("[WeeklyDigest] Authenticated via scheduler secret")
	}

	// If an authenticated user is calling this, enforce they can only generate for themselves.
	if hasAuth && req.Msg.UserId != "" && req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot generate digest for another user"))
	}

	// Default user_id to the authenticated user if present and not specified
	userID := req.Msg.UserId
	if userID == "" && hasAuth {
		userID = claims.UID
	}

	now := time.Now()
	periodEnd := now
	periodStart := now.AddDate(0, 0, -7)

	var usersProcessed, digestsSent int32

	if userID != "" {
		// Single user mode
		sent, err := s.generateDigestForUser(ctx, userID, periodStart, periodEnd)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal,
				fmt.Errorf("failed to generate digest for user %s: %w", userID, err))
		}
		usersProcessed = 1
		if sent {
			digestsSent = 1
		}
	} else {
		// Scheduler mode with no user_id: no users to enumerate yet.
		log.Printf("[WeeklyDigest] WARNING: scheduler invocation completed with 0 users processed — user enumeration not yet implemented")
	}
	// Note: full user enumeration for Cloud Scheduler would iterate through all users
	// with weekly_digest=true. For now we only support single-user mode.

	return connect.NewResponse(&pfinancev1.GenerateWeeklyDigestResponse{
		UsersProcessed: usersProcessed,
		DigestsSent:    digestsSent,
	}), nil
}

// generateDigestForUser builds the digest data and creates a notification for a single user.
func (s *FinanceService) generateDigestForUser(ctx context.Context, userID string, start, end time.Time) (bool, error) {
	// Check preferences
	prefs, err := s.store.GetNotificationPreferences(ctx, userID)
	if err != nil {
		return false, fmt.Errorf("failed to get notification preferences: %w", err)
	}
	if !prefs.WeeklyDigest {
		return false, nil
	}

	// Fetch expenses for the period
	expenses, _, err := s.store.ListExpenses(ctx, userID, "", &start, &end, 1000, "")
	if err != nil {
		return false, fmt.Errorf("failed to list expenses: %w", err)
	}

	// Fetch incomes for the period
	incomes, _, err := s.store.ListIncomes(ctx, userID, "", &start, &end, 1000, "")
	if err != nil {
		return false, fmt.Errorf("failed to list incomes: %w", err)
	}

	// Calculate totals
	var totalSpentCents int64
	categoryTotals := make(map[pfinancev1.ExpenseCategory]int64)
	for _, e := range expenses {
		cents := e.AmountCents
		if cents == 0 {
			cents = int64(e.Amount * 100)
		}
		totalSpentCents += cents
		categoryTotals[e.Category] += cents
	}

	var totalIncomeCents int64
	for _, i := range incomes {
		cents := i.AmountCents
		if cents == 0 {
			cents = int64(i.Amount * 100)
		}
		totalIncomeCents += cents
	}

	// Build top categories (up to 5)
	var topCategories []*pfinancev1.CategoryAmount
	for cat, cents := range categoryTotals {
		topCategories = append(topCategories, &pfinancev1.CategoryAmount{
			Category:    cat,
			AmountCents: cents,
		})
	}
	// Sort by amount descending
	for i := 0; i < len(topCategories); i++ {
		for j := i + 1; j < len(topCategories); j++ {
			if topCategories[j].AmountCents > topCategories[i].AmountCents {
				topCategories[i], topCategories[j] = topCategories[j], topCategories[i]
			}
		}
	}
	if len(topCategories) > 5 {
		topCategories = topCategories[:5]
	}

	// Fetch active budgets
	budgets, _, err := s.store.ListBudgets(ctx, userID, "", false, 100, "")
	if err != nil {
		log.Printf("[WeeklyDigest] Failed to list budgets for user %s: %v", userID, err)
	}
	var budgetSummaries []*pfinancev1.DigestBudgetSummary
	for _, b := range budgets {
		if !b.IsActive {
			continue
		}
		progress, err := s.store.GetBudgetProgress(ctx, b.Id, end)
		if err != nil {
			continue
		}
		budgetSummaries = append(budgetSummaries, &pfinancev1.DigestBudgetSummary{
			Name:           b.Name,
			SpentCents:     progress.SpentAmountCents,
			BudgetCents:    b.AmountCents,
			PercentageUsed: progress.PercentageUsed,
		})
	}

	// Fetch active goals
	goals, _, err := s.store.ListGoals(ctx, userID, "",
		pfinancev1.GoalStatus_GOAL_STATUS_ACTIVE,
		pfinancev1.GoalType_GOAL_TYPE_UNSPECIFIED,
		100, "")
	if err != nil {
		log.Printf("[WeeklyDigest] Failed to list goals for user %s: %v", userID, err)
	}
	var goalSummaries []*pfinancev1.DigestGoalSummary
	for _, g := range goals {
		pct := float64(0)
		if g.TargetAmountCents > 0 {
			pct = float64(g.CurrentAmountCents) / float64(g.TargetAmountCents) * 100
		}
		goalSummaries = append(goalSummaries, &pfinancev1.DigestGoalSummary{
			Name:               g.Name,
			CurrentCents:       g.CurrentAmountCents,
			TargetCents:        g.TargetAmountCents,
			PercentageComplete: pct,
		})
	}

	// Count upcoming bills (next 7 days)
	rts, _, err := s.store.ListRecurringTransactions(ctx, userID, "",
		pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		true, true, 100, "")
	if err != nil {
		log.Printf("[WeeklyDigest] Failed to list recurring transactions for user %s: %v", userID, err)
	}
	var upcomingBillsCount int32
	weekAhead := end.AddDate(0, 0, 7)
	for _, rt := range rts {
		if rt.NextOccurrence != nil {
			nextOcc := rt.NextOccurrence.AsTime()
			if nextOcc.After(end) && nextOcc.Before(weekAhead) {
				upcomingBillsCount++
			}
		}
	}

	// Build digest data
	digestData := &pfinancev1.WeeklyDigestData{
		TotalSpentCents:    totalSpentCents,
		TotalIncomeCents:   totalIncomeCents,
		NetCents:           totalIncomeCents - totalSpentCents,
		TopCategories:      topCategories,
		BudgetSummaries:    budgetSummaries,
		GoalSummaries:      goalSummaries,
		UpcomingBillsCount: upcomingBillsCount,
		PeriodStart:        start.Format("2006-01-02"),
		PeriodEnd:          end.Format("2006-01-02"),
	}

	// Serialize to JSON for metadata
	digestJSON, err := json.Marshal(digestData)
	if err != nil {
		return false, fmt.Errorf("failed to serialize digest data: %w", err)
	}

	// TODO: The notification message is currently formatted in the backend. Ideally,
	// the backend should only store structured digest data (already in metadata) and
	// let the frontend format the user-facing message for better i18n and presentation control.
	notification := &pfinancev1.Notification{
		Id:            uuid.New().String(),
		UserId:        userID,
		Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_WEEKLY_DIGEST,
		Title:         "Your Weekly Financial Summary",
		Message:       fmt.Sprintf("You spent $%.2f and earned $%.2f this week.", float64(totalSpentCents)/100, float64(totalIncomeCents)/100),
		IsRead:        false,
		ActionUrl:     "/personal/notifications/",
		ReferenceType: "weekly_digest",
		CreatedAt:     timestamppb.Now(),
		Metadata:      map[string]string{"digest_data": string(digestJSON)},
	}

	if err := s.store.CreateNotification(ctx, notification); err != nil {
		return false, fmt.Errorf("failed to create digest notification: %w", err)
	}

	return true, nil
}
