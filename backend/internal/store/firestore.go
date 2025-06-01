package store

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
)

// FirestoreStore implements the Store interface using Firestore
type FirestoreStore struct {
	client *firestore.Client
}

// NewFirestoreStore creates a new Firestore-backed store
func NewFirestoreStore(client *firestore.Client) Store {
	return &FirestoreStore{
		client: client,
	}
}

// CreateExpense creates a new expense in Firestore
func (s *FirestoreStore) CreateExpense(ctx context.Context, expense *pfinancev1.Expense) error {
	collection := "expenses"
	if expense.GroupId != "" {
		collection = "groupExpenses"
	}
	
	_, err := s.client.Collection(collection).Doc(expense.Id).Set(ctx, expense)
	return err
}

// ListExpenses lists expenses from Firestore
func (s *FirestoreStore) ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Expense, error) {
	collection := "expenses"
	if groupID != "" {
		collection = "groupExpenses"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Apply filters
	if groupID != "" {
		query = query.Where("group_id", "==", groupID)
	} else if userID != "" {
		query = query.Where("user_id", "==", userID)
	}

	if startDate != nil {
		query = query.Where("date", ">=", *startDate)
	}
	if endDate != nil {
		query = query.Where("date", "<=", *endDate)
	}

	// Apply pagination
	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize))

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to list expenses: %w", err)
	}

	expenses := make([]*pfinancev1.Expense, 0, len(docs))
	for _, doc := range docs {
		var expense pfinancev1.Expense
		if err := doc.DataTo(&expense); err != nil {
			return nil, fmt.Errorf("failed to parse expense: %w", err)
		}
		expenses = append(expenses, &expense)
	}

	return expenses, nil
}

// CreateIncome creates a new income in Firestore
func (s *FirestoreStore) CreateIncome(ctx context.Context, income *pfinancev1.Income) error {
	collection := "incomes"
	if income.GroupId != "" {
		collection = "groupIncomes"
	}
	
	_, err := s.client.Collection(collection).Doc(income.Id).Set(ctx, income)
	return err
}

// CreateGroup creates a new group in Firestore
func (s *FirestoreStore) CreateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error {
	_, err := s.client.Collection("financeGroups").Doc(group.Id).Set(ctx, group)
	return err
}

// GetGroup retrieves a group from Firestore
func (s *FirestoreStore) GetGroup(ctx context.Context, groupID string) (*pfinancev1.FinanceGroup, error) {
	doc, err := s.client.Collection("financeGroups").Doc(groupID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("group not found: %w", err)
	}

	var group pfinancev1.FinanceGroup
	if err := doc.DataTo(&group); err != nil {
		return nil, fmt.Errorf("failed to parse group: %w", err)
	}
	return &group, nil
}

// UpdateGroup updates a group in Firestore
func (s *FirestoreStore) UpdateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error {
	_, err := s.client.Collection("financeGroups").Doc(group.Id).Set(ctx, group)
	return err
}

// ListGroups lists groups for a user
func (s *FirestoreStore) ListGroups(ctx context.Context, userID string, pageSize int32) ([]*pfinancev1.FinanceGroup, error) {
	var query firestore.Query
	query = s.client.Collection("financeGroups").Query

	if userID != "" {
		query = query.Where("member_ids", "array-contains", userID)
	}

	// Apply pagination
	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize))

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to list groups: %w", err)
	}

	groups := make([]*pfinancev1.FinanceGroup, 0, len(docs))
	for _, doc := range docs {
		var group pfinancev1.FinanceGroup
		if err := doc.DataTo(&group); err != nil {
			return nil, fmt.Errorf("failed to parse group: %w", err)
		}
		groups = append(groups, &group)
	}

	return groups, nil
}

// CreateInvitation creates a new invitation in Firestore
func (s *FirestoreStore) CreateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error {
	_, err := s.client.Collection("groupInvitations").Doc(invitation.Id).Set(ctx, invitation)
	return err
}

// GetInvitation retrieves an invitation from Firestore
func (s *FirestoreStore) GetInvitation(ctx context.Context, invitationID string) (*pfinancev1.GroupInvitation, error) {
	doc, err := s.client.Collection("groupInvitations").Doc(invitationID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("invitation not found: %w", err)
	}

	var invitation pfinancev1.GroupInvitation
	if err := doc.DataTo(&invitation); err != nil {
		return nil, fmt.Errorf("failed to parse invitation: %w", err)
	}
	return &invitation, nil
}

// UpdateInvitation updates an invitation in Firestore
func (s *FirestoreStore) UpdateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error {
	_, err := s.client.Collection("groupInvitations").Doc(invitation.Id).Set(ctx, invitation)
	return err
}

// ListInvitations lists invitations for a user
func (s *FirestoreStore) ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32) ([]*pfinancev1.GroupInvitation, error) {
	var query firestore.Query
	query = s.client.Collection("groupInvitations").Query

	if userEmail != "" {
		query = query.Where("invitee_email", "==", userEmail)
	}
	if status != nil {
		query = query.Where("status", "==", *status)
	}

	// Apply pagination
	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize))

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to list invitations: %w", err)
	}

	invitations := make([]*pfinancev1.GroupInvitation, 0, len(docs))
	for _, doc := range docs {
		var invitation pfinancev1.GroupInvitation
		if err := doc.DataTo(&invitation); err != nil {
			return nil, fmt.Errorf("failed to parse invitation: %w", err)
		}
		invitations = append(invitations, &invitation)
	}

	return invitations, nil
}

// GetTaxConfig retrieves tax configuration
func (s *FirestoreStore) GetTaxConfig(ctx context.Context, userID, groupID string) (*pfinancev1.TaxConfig, error) {
	var docPath string
	if groupID != "" {
		docPath = fmt.Sprintf("financeGroups/%s/taxConfig", groupID)
	} else {
		docPath = fmt.Sprintf("users/%s/taxConfig", userID)
	}

	doc, err := s.client.Doc(docPath).Get(ctx)
	if err != nil {
		// Return default config if not found
		return &pfinancev1.TaxConfig{
			Enabled:           true,
			Country:           pfinancev1.TaxCountry_TAX_COUNTRY_AUSTRALIA,
			TaxRate:           0,
			IncludeDeductions: true,
			Settings: &pfinancev1.TaxSettings{
				IncludeSuper:    true,
				SuperRate:       11.5,
				IncludeMedicare: true,
			},
		}, nil
	}

	var taxConfig pfinancev1.TaxConfig
	if err := doc.DataTo(&taxConfig); err != nil {
		return nil, fmt.Errorf("failed to parse tax config: %w", err)
	}
	return &taxConfig, nil
}