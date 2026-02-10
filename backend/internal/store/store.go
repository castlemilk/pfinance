package store

import (
	"context"
	"encoding/base64"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

//go:generate mockgen -source=store.go -destination=store_mock.go -package=store

// Store defines the interface for all database operations used by the service
type Store interface {
	// Expense operations
	CreateExpense(ctx context.Context, expense *pfinancev1.Expense) error
	GetExpense(ctx context.Context, expenseID string) (*pfinancev1.Expense, error)
	UpdateExpense(ctx context.Context, expense *pfinancev1.Expense) error
	DeleteExpense(ctx context.Context, expenseID string) error
	ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32, pageToken string) ([]*pfinancev1.Expense, string, error)

	// Income operations
	CreateIncome(ctx context.Context, income *pfinancev1.Income) error
	GetIncome(ctx context.Context, incomeID string) (*pfinancev1.Income, error)
	UpdateIncome(ctx context.Context, income *pfinancev1.Income) error
	DeleteIncome(ctx context.Context, incomeID string) error
	ListIncomes(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32, pageToken string) ([]*pfinancev1.Income, string, error)

	// Group operations
	CreateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error
	GetGroup(ctx context.Context, groupID string) (*pfinancev1.FinanceGroup, error)
	UpdateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error
	DeleteGroup(ctx context.Context, groupID string) error
	ListGroups(ctx context.Context, userID string, pageSize int32, pageToken string) ([]*pfinancev1.FinanceGroup, string, error)

	// Invitation operations
	CreateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error
	GetInvitation(ctx context.Context, invitationID string) (*pfinancev1.GroupInvitation, error)
	UpdateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error
	ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32, pageToken string) ([]*pfinancev1.GroupInvitation, string, error)

	// Invite link operations
	CreateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error
	GetInviteLink(ctx context.Context, linkID string) (*pfinancev1.GroupInviteLink, error)
	GetInviteLinkByCode(ctx context.Context, code string) (*pfinancev1.GroupInviteLink, error)
	UpdateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error
	ListInviteLinks(ctx context.Context, groupID string, includeInactive bool, pageSize int32, pageToken string) ([]*pfinancev1.GroupInviteLink, string, error)

	// Expense contribution operations
	CreateContribution(ctx context.Context, contribution *pfinancev1.ExpenseContribution) error
	GetContribution(ctx context.Context, contributionID string) (*pfinancev1.ExpenseContribution, error)
	ListContributions(ctx context.Context, groupID, userID string, pageSize int32, pageToken string) ([]*pfinancev1.ExpenseContribution, string, error)

	// Income contribution operations
	CreateIncomeContribution(ctx context.Context, contribution *pfinancev1.IncomeContribution) error
	GetIncomeContribution(ctx context.Context, contributionID string) (*pfinancev1.IncomeContribution, error)
	ListIncomeContributions(ctx context.Context, groupID, userID string, pageSize int32, pageToken string) ([]*pfinancev1.IncomeContribution, string, error)

	// Tax config operations
	GetTaxConfig(ctx context.Context, userID, groupID string) (*pfinancev1.TaxConfig, error)
	UpdateTaxConfig(ctx context.Context, userID, groupID string, config *pfinancev1.TaxConfig) error

	// Budget operations
	CreateBudget(ctx context.Context, budget *pfinancev1.Budget) error
	GetBudget(ctx context.Context, budgetID string) (*pfinancev1.Budget, error)
	UpdateBudget(ctx context.Context, budget *pfinancev1.Budget) error
	DeleteBudget(ctx context.Context, budgetID string) error
	ListBudgets(ctx context.Context, userID, groupID string, includeInactive bool, pageSize int32, pageToken string) ([]*pfinancev1.Budget, string, error)
	GetBudgetProgress(ctx context.Context, budgetID string, asOfDate time.Time) (*pfinancev1.BudgetProgress, error)

	// User operations
	GetUser(ctx context.Context, userID string) (*pfinancev1.User, error)
	UpdateUser(ctx context.Context, user *pfinancev1.User) error

	// Goal operations
	CreateGoal(ctx context.Context, goal *pfinancev1.FinancialGoal) error
	GetGoal(ctx context.Context, goalID string) (*pfinancev1.FinancialGoal, error)
	UpdateGoal(ctx context.Context, goal *pfinancev1.FinancialGoal) error
	DeleteGoal(ctx context.Context, goalID string) error
	ListGoals(ctx context.Context, userID, groupID string, status pfinancev1.GoalStatus, goalType pfinancev1.GoalType, pageSize int32, pageToken string) ([]*pfinancev1.FinancialGoal, string, error)
	GetGoalProgress(ctx context.Context, goalID string, asOfDate time.Time) (*pfinancev1.GoalProgress, error)

	// Goal contribution operations
	CreateGoalContribution(ctx context.Context, contribution *pfinancev1.GoalContribution) error
	ListGoalContributions(ctx context.Context, goalID string, pageSize int32, pageToken string) ([]*pfinancev1.GoalContribution, string, error)

	// Search operations
	SearchTransactions(ctx context.Context, userID, groupID, query, category string, amountMin, amountMax float64, startDate, endDate *time.Time, txType pfinancev1.TransactionType, pageSize int32, pageToken string) ([]*pfinancev1.SearchResult, string, int, error)

	// Recurring transaction operations
	CreateRecurringTransaction(ctx context.Context, rt *pfinancev1.RecurringTransaction) error
	GetRecurringTransaction(ctx context.Context, rtID string) (*pfinancev1.RecurringTransaction, error)
	UpdateRecurringTransaction(ctx context.Context, rt *pfinancev1.RecurringTransaction) error
	DeleteRecurringTransaction(ctx context.Context, rtID string) error
	ListRecurringTransactions(ctx context.Context, userID, groupID string, status pfinancev1.RecurringTransactionStatus, filterIsExpense bool, isExpense bool, pageSize int32, pageToken string) ([]*pfinancev1.RecurringTransaction, string, error)

	// Notification operations
	CreateNotification(ctx context.Context, notification *pfinancev1.Notification) error
	ListNotifications(ctx context.Context, userID string, unreadOnly bool, pageSize int32, pageToken string) ([]*pfinancev1.Notification, string, error)
	MarkNotificationRead(ctx context.Context, notificationID string) error
	MarkAllNotificationsRead(ctx context.Context, userID string) error
	GetUnreadNotificationCount(ctx context.Context, userID string) (int32, error)
	GetNotificationPreferences(ctx context.Context, userID string) (*pfinancev1.NotificationPreferences, error)
	UpdateNotificationPreferences(ctx context.Context, prefs *pfinancev1.NotificationPreferences) error

	// Analytics operations
	GetDailyAggregates(ctx context.Context, userID, groupID string, startDate, endDate time.Time) ([]*pfinancev1.DailyAggregate, error)

	// ML Feedback operations
	CreateCorrectionRecord(ctx context.Context, record *pfinancev1.CorrectionRecord) error
	ListCorrectionRecords(ctx context.Context, userID string, limit int) ([]*pfinancev1.CorrectionRecord, error)
	UpsertMerchantMapping(ctx context.Context, mapping *pfinancev1.MerchantMapping) error
	GetMerchantMappings(ctx context.Context, userID string) ([]*pfinancev1.MerchantMapping, error)
	CreateExtractionEvent(ctx context.Context, event *pfinancev1.ExtractionEvent) error
	ListExtractionEvents(ctx context.Context, userID string, since time.Time) ([]*pfinancev1.ExtractionEvent, error)
}

// EncodePageToken encodes a document ID into a page token.
func EncodePageToken(docID string) string {
	if docID == "" {
		return ""
	}
	return base64.URLEncoding.EncodeToString([]byte(docID))
}

// DecodePageToken decodes a page token back to a document ID.
func DecodePageToken(token string) (string, error) {
	if token == "" {
		return "", nil
	}
	b, err := base64.URLEncoding.DecodeString(token)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
