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
	ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Expense, error)
	
	// Income operations
	CreateIncome(ctx context.Context, income *pfinancev1.Income) error
	
	// Group operations
	CreateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error
	GetGroup(ctx context.Context, groupID string) (*pfinancev1.FinanceGroup, error)
	UpdateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error
	ListGroups(ctx context.Context, userID string, pageSize int32) ([]*pfinancev1.FinanceGroup, error)
	
	// Invitation operations
	CreateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error
	GetInvitation(ctx context.Context, invitationID string) (*pfinancev1.GroupInvitation, error)
	UpdateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error
	ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32) ([]*pfinancev1.GroupInvitation, error)
	
	// Tax config operations
	GetTaxConfig(ctx context.Context, userID, groupID string) (*pfinancev1.TaxConfig, error)
}