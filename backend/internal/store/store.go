package store

import (
	"context"
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
	ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Expense, error)

	// Income operations
	CreateIncome(ctx context.Context, income *pfinancev1.Income) error
	GetIncome(ctx context.Context, incomeID string) (*pfinancev1.Income, error)
	UpdateIncome(ctx context.Context, income *pfinancev1.Income) error
	DeleteIncome(ctx context.Context, incomeID string) error
	ListIncomes(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Income, error)

	// Group operations
	CreateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error
	GetGroup(ctx context.Context, groupID string) (*pfinancev1.FinanceGroup, error)
	UpdateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error
	DeleteGroup(ctx context.Context, groupID string) error
	ListGroups(ctx context.Context, userID string, pageSize int32) ([]*pfinancev1.FinanceGroup, error)

	// Invitation operations
	CreateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error
	GetInvitation(ctx context.Context, invitationID string) (*pfinancev1.GroupInvitation, error)
	UpdateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error
	ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32) ([]*pfinancev1.GroupInvitation, error)

	// Invite link operations
	CreateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error
	GetInviteLink(ctx context.Context, linkID string) (*pfinancev1.GroupInviteLink, error)
	GetInviteLinkByCode(ctx context.Context, code string) (*pfinancev1.GroupInviteLink, error)
	UpdateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error
	ListInviteLinks(ctx context.Context, groupID string, includeInactive bool, pageSize int32) ([]*pfinancev1.GroupInviteLink, error)

	// Contribution operations
	CreateContribution(ctx context.Context, contribution *pfinancev1.ExpenseContribution) error
	GetContribution(ctx context.Context, contributionID string) (*pfinancev1.ExpenseContribution, error)
	ListContributions(ctx context.Context, groupID, userID string, pageSize int32) ([]*pfinancev1.ExpenseContribution, error)

	// Tax config operations
	GetTaxConfig(ctx context.Context, userID, groupID string) (*pfinancev1.TaxConfig, error)
	UpdateTaxConfig(ctx context.Context, userID, groupID string, config *pfinancev1.TaxConfig) error

	// Budget operations
	CreateBudget(ctx context.Context, budget *pfinancev1.Budget) error
	GetBudget(ctx context.Context, budgetID string) (*pfinancev1.Budget, error)
	UpdateBudget(ctx context.Context, budget *pfinancev1.Budget) error
	DeleteBudget(ctx context.Context, budgetID string) error
	ListBudgets(ctx context.Context, userID, groupID string, includeInactive bool, pageSize int32) ([]*pfinancev1.Budget, error)
	GetBudgetProgress(ctx context.Context, budgetID string, asOfDate time.Time) (*pfinancev1.BudgetProgress, error)
}