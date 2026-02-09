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
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create budget threshold notification: %v", err)
	}
}

// GoalMilestoneReached creates a notification when a goal hits a milestone (25%, 50%, 75%, 100%).
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
		milestone = "100%"
	case pct >= 75:
		milestone = "75%"
	case pct >= 50:
		milestone = "50%"
	case pct >= 25:
		milestone = "25%"
	default:
		return
	}

	notification := &pfinancev1.Notification{
		Id:            uuid.New().String(),
		UserId:        userID,
		Type:          pfinancev1.NotificationType_NOTIFICATION_TYPE_GOAL_MILESTONE,
		Title:         fmt.Sprintf("Goal Milestone: %s", goal.Name),
		Message:       fmt.Sprintf("You've reached %s of your %s goal!", milestone, goal.Name),
		IsRead:        false,
		ActionUrl:     "/personal/goals/",
		ReferenceId:   goal.Id,
		ReferenceType: "goal",
		CreatedAt:     timestamppb.Now(),
	}

	if err := t.store.CreateNotification(ctx, notification); err != nil {
		log.Printf("[NotificationTrigger] Failed to create goal milestone notification: %v", err)
	}
}

// BillReminder creates a notification for upcoming recurring transactions.
func (t *NotificationTrigger) BillReminder(ctx context.Context, userID string, rt *pfinancev1.RecurringTransaction) {
	prefs, err := t.store.GetNotificationPreferences(ctx, userID)
	if err != nil || !prefs.BillReminders {
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
