package service

import (
	"context"
	"fmt"
	"log"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// NotificationTrigger handles creating notifications based on financial events.
type NotificationTrigger struct {
	store store.Store
}

func NewNotificationTrigger(store store.Store) *NotificationTrigger {
	return &NotificationTrigger{store: store}
}

// CheckBudgetThreshold creates a notification if budget spending exceeds a threshold.
// Deduplication: only one notification per budget+threshold per 30 days.
func (t *NotificationTrigger) CheckBudgetThreshold(ctx context.Context, userID string, budget *pfinancev1.Budget, spentCents int64, thresholdPct float64) {
	if budget.AmountCents <= 0 {
		return
	}

	pct := float64(spentCents) / float64(budget.AmountCents) * 100
	if pct < thresholdPct {
		return
	}

	// Check user preferences
	prefs, err := t.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.BudgetAlerts {
		return
	}

	// Dedup: check if we already sent this threshold notification within 30 days
	thresholdStr := fmt.Sprintf("%.0f", thresholdPct)
	exists, err := t.store.HasNotification(ctx, userID,
		pfinancev1.NotificationType_NOTIFICATION_TYPE_BUDGET_THRESHOLD,
		budget.Id, "threshold", thresholdStr, 720) // 720 hours = 30 days
	if err != nil {
		log.Printf("[NotificationTrigger] Failed to check for existing budget notification: %v", err)
		return
	}
	if exists {
		return
	}

	title := fmt.Sprintf("Budget Alert: %s", budget.Name)
	message := fmt.Sprintf("You've spent %.0f%% of your %s budget.", pct, budget.Name)
	if pct >= 100 {
		message = fmt.Sprintf("You've exceeded your %s budget!", budget.Name)
	}

	notification := &pfinancev1.Notification{
		Id:            uuid.New().String(),
		UserId:        userID,
		Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_BUDGET_THRESHOLD,
		Title:         title,
		Message:       message,
		IsRead:        false,
		ActionUrl:     "/personal/budgets/",
		ReferenceId:   budget.Id,
		ReferenceType: "budget",
		CreatedAt:     timestamppb.Now(),
		Metadata:      map[string]string{"threshold": thresholdStr},
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create budget threshold notification: %v", err)
	}
}

// GoalMilestoneReached creates a notification when a goal hits a milestone (25%, 50%, 75%, 100%).
// Deduplication: only one notification per goal+milestone per year.
func (t *NotificationTrigger) GoalMilestoneReached(ctx context.Context, userID string, goal *pfinancev1.FinancialGoal, currentCents int64) {
	if goal.TargetAmountCents <= 0 {
		return
	}

	prefs, err := t.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.GoalMilestones {
		return
	}

	pct := float64(currentCents) / float64(goal.TargetAmountCents) * 100

	var milestone string
	switch {
	case pct >= 100:
		milestone = "100"
	case pct >= 75:
		milestone = "75"
	case pct >= 50:
		milestone = "50"
	case pct >= 25:
		milestone = "25"
	default:
		return
	}

	// Dedup: check if we already sent this milestone notification within 1 year
	exists, err := t.store.HasNotification(ctx, userID,
		pfinancev1.NotificationType_NOTIFICATION_TYPE_GOAL_MILESTONE,
		goal.Id, "milestone", milestone, 8760) // 8760 hours = 1 year
	if err != nil {
		log.Printf("[NotificationTrigger] Failed to check for existing goal notification: %v", err)
		return
	}
	if exists {
		return
	}

	notification := &pfinancev1.Notification{
		Id:            uuid.New().String(),
		UserId:        userID,
		Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_GOAL_MILESTONE,
		Title:         fmt.Sprintf("Goal Milestone: %s", goal.Name),
		Message:       fmt.Sprintf("You've reached %s%% of your %s goal!", milestone, goal.Name),
		IsRead:        false,
		ActionUrl:     "/personal/goals/",
		ReferenceId:   goal.Id,
		ReferenceType: "goal",
		CreatedAt:     timestamppb.Now(),
		Metadata:      map[string]string{"milestone": milestone},
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create goal milestone notification: %v", err)
	}
}

// BillReminder creates a notification for upcoming recurring transactions.
// Deduplication: only one reminder per recurring transaction per billing cycle (30 days).
func (t *NotificationTrigger) BillReminder(ctx context.Context, userID string, rt *pfinancev1.RecurringTransaction) {
	prefs, err := t.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.BillReminders {
		return
	}

	// Dedup: check if we already sent a reminder for this transaction within 30 days
	exists, err := t.store.HasNotification(ctx, userID,
		pfinancev1.NotificationType_NOTIFICATION_TYPE_BILL_REMINDER,
		rt.Id, "", "", 720)
	if err != nil {
		log.Printf("[NotificationTrigger] Failed to check for existing bill reminder: %v", err)
		return
	}
	if exists {
		return
	}

	notification := &pfinancev1.Notification{
		Id:            uuid.New().String(),
		UserId:        userID,
		Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_BILL_REMINDER,
		Title:         fmt.Sprintf("Upcoming Bill: %s", rt.Description),
		Message:       fmt.Sprintf("Your %s payment is coming up soon.", rt.Description),
		IsRead:        false,
		ActionUrl:     "/personal/recurring/",
		ReferenceId:   rt.Id,
		ReferenceType: "recurring_transaction",
		CreatedAt:     timestamppb.Now(),
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create bill reminder notification: %v", err)
	}
}

// ExtractionComplete creates a notification when document extraction finishes.
func (t *NotificationTrigger) ExtractionComplete(ctx context.Context, userID string, importedCount int32, skippedCount int32) {
	title := "Document Import Complete"
	msg := fmt.Sprintf("Successfully imported %d transactions.", importedCount)
	if skippedCount > 0 {
		msg = fmt.Sprintf("Imported %d transactions (%d skipped).", importedCount, skippedCount)
	}

	notification := &pfinancev1.Notification{
		Id:        uuid.New().String(),
		UserId:    userID,
		Type:      pfinancev1.NotificationType_NOTIFICATION_TYPE_EXTRACTION_COMPLETE,
		Title:     title,
		Message:   msg,
		IsRead:    false,
		ActionUrl: "/personal/expenses/",
		CreatedAt: timestamppb.Now(),
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create extraction complete notification: %v", err)
	}
}

// SubscriptionAlert creates a notification about a detected subscription change.
func (t *NotificationTrigger) SubscriptionAlert(ctx context.Context, userID string, subscriptionName string, message string) {
	prefs, err := t.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.SubscriptionAlerts {
		return
	}

	notification := &pfinancev1.Notification{
		Id:        uuid.New().String(),
		UserId:    userID,
		Type:      pfinancev1.NotificationType_NOTIFICATION_TYPE_SUBSCRIPTION_ALERT,
		Title:     fmt.Sprintf("Subscription: %s", subscriptionName),
		Message:   message,
		IsRead:    false,
		ActionUrl: "/personal/recurring/",
		CreatedAt: timestamppb.Now(),
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create subscription alert notification: %v", err)
	}
}

// GroupExpenseAdded notifies all group members (except the actor) about a new group expense.
func (t *NotificationTrigger) GroupExpenseAdded(ctx context.Context, actorUID string, group *pfinancev1.FinanceGroup, expense *pfinancev1.Expense) {
	for _, memberID := range group.MemberIds {
		if memberID == actorUID {
			continue
		}

		// Find actor display name
		actorName := actorUID
		for _, m := range group.Members {
			if m.UserId == actorUID {
				actorName = m.DisplayName
				break
			}
		}

		amountStr := fmt.Sprintf("$%.2f", float64(expense.AmountCents)/100)
		if expense.AmountCents == 0 {
			amountStr = fmt.Sprintf("$%.2f", expense.Amount)
		}

		notification := &pfinancev1.Notification{
			Id:            uuid.New().String(),
			UserId:        memberID,
			Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_GROUP_ACTIVITY,
			Title:         fmt.Sprintf("New Group Expense in %s", group.Name),
			Message:       fmt.Sprintf("%s added %s expense: %s", actorName, amountStr, expense.Description),
			IsRead:        false,
			ActionUrl:     fmt.Sprintf("/groups/%s/", group.Id),
			ReferenceId:   expense.Id,
			ReferenceType: "expense",
			CreatedAt:     timestamppb.Now(),
			Metadata:      map[string]string{"group_id": group.Id, "actor": actorUID},
		}

		if err := t.store.CreateNotification(ctx, notification); err != nil {
			log.Printf("[NotificationTrigger] Failed to create group expense notification for %s: %v", memberID, err)
		}
	}
}

// GroupIncomeAdded notifies all group members (except the actor) about a new group income.
func (t *NotificationTrigger) GroupIncomeAdded(ctx context.Context, actorUID string, group *pfinancev1.FinanceGroup, income *pfinancev1.Income) {
	for _, memberID := range group.MemberIds {
		if memberID == actorUID {
			continue
		}

		actorName := actorUID
		for _, m := range group.Members {
			if m.UserId == actorUID {
				actorName = m.DisplayName
				break
			}
		}

		amountStr := fmt.Sprintf("$%.2f", float64(income.AmountCents)/100)
		if income.AmountCents == 0 {
			amountStr = fmt.Sprintf("$%.2f", income.Amount)
		}

		notification := &pfinancev1.Notification{
			Id:            uuid.New().String(),
			UserId:        memberID,
			Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_GROUP_ACTIVITY,
			Title:         fmt.Sprintf("New Group Income in %s", group.Name),
			Message:       fmt.Sprintf("%s added %s income: %s", actorName, amountStr, income.Source),
			IsRead:        false,
			ActionUrl:     fmt.Sprintf("/groups/%s/", group.Id),
			ReferenceId:   income.Id,
			ReferenceType: "income",
			CreatedAt:     timestamppb.Now(),
			Metadata:      map[string]string{"group_id": group.Id, "actor": actorUID},
		}

		if err := t.store.CreateNotification(ctx, notification); err != nil {
			log.Printf("[NotificationTrigger] Failed to create group income notification for %s: %v", memberID, err)
		}
	}
}
