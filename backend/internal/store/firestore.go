package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"google.golang.org/protobuf/types/known/timestamppb"
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

// applyDateAwarePagination handles pagination for queries with date range filters.
// Firestore requires OrderBy on inequality fields first, so we use OrderBy("Date") + OrderBy(__name__).
// The cursor must include both the Date value and the document ID.
func (s *FirestoreStore) applyDateAwarePagination(ctx context.Context, query firestore.Query, collection string, pageSize int32, pageToken string) (firestore.Query, error) {
	query = query.OrderBy("Date", firestore.Asc).OrderBy(firestore.DocumentID, firestore.Asc)

	if pageToken != "" {
		docID, err := DecodePageToken(pageToken)
		if err != nil {
			return query, fmt.Errorf("invalid page token: %w", err)
		}
		// Fetch the cursor document to get its Date value for composite StartAfter
		cursorDoc, err := s.client.Collection(collection).Doc(docID).Get(ctx)
		if err != nil {
			return query, fmt.Errorf("failed to fetch cursor document: %w", err)
		}
		dateVal := cursorDoc.Data()["Date"]
		query = query.StartAfter(dateVal, docID)
	}

	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize) + 1)
	return query, nil
}

// applyCursorPagination adds OrderBy + StartAfter + Limit to a query for cursor-based pagination.
// It fetches pageSize+1 docs so the caller can detect whether a next page exists.
func (s *FirestoreStore) applyCursorPagination(query firestore.Query, pageSize int32, pageToken string) (firestore.Query, error) {
	query = query.OrderBy(firestore.DocumentID, firestore.Asc)

	if pageToken != "" {
		docID, err := DecodePageToken(pageToken)
		if err != nil {
			return query, fmt.Errorf("invalid page token: %w", err)
		}
		query = query.StartAfter(docID)
	}

	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize) + 1) // +1 to detect next page
	return query, nil
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

// GetExpense retrieves an expense from Firestore
func (s *FirestoreStore) GetExpense(ctx context.Context, expenseID string) (*pfinancev1.Expense, error) {
	// Try personal expenses first
	doc, err := s.client.Collection("expenses").Doc(expenseID).Get(ctx)
	if err == nil {
		var expense pfinancev1.Expense
		if err := doc.DataTo(&expense); err != nil {
			return nil, fmt.Errorf("failed to parse expense: %w", err)
		}
		return &expense, nil
	}

	// Try group expenses
	doc, err = s.client.Collection("groupExpenses").Doc(expenseID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("expense not found: %w", err)
	}

	var expense pfinancev1.Expense
	if err := doc.DataTo(&expense); err != nil {
		return nil, fmt.Errorf("failed to parse expense: %w", err)
	}
	return &expense, nil
}

// UpdateExpense updates an existing expense in Firestore
func (s *FirestoreStore) UpdateExpense(ctx context.Context, expense *pfinancev1.Expense) error {
	collection := "expenses"
	if expense.GroupId != "" {
		collection = "groupExpenses"
	}

	_, err := s.client.Collection(collection).Doc(expense.Id).Set(ctx, expense)
	return err
}

// ListExpenses lists expenses from Firestore
func (s *FirestoreStore) ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32, pageToken string) ([]*pfinancev1.Expense, string, error) {
	collection := "expenses"
	if groupID != "" {
		collection = "groupExpenses"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Apply filters
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	} else if userID != "" {
		query = query.Where("UserId", "==", userID)
	}

	hasDateFilter := startDate != nil || endDate != nil
	if startDate != nil {
		query = query.Where("Date", ">=", *startDate)
	}
	if endDate != nil {
		query = query.Where("Date", "<=", *endDate)
	}

	// When date range filters are present, Firestore requires OrderBy on the range
	// field first. Use date-aware pagination to avoid "cannot contain more fields
	// after the key" errors.
	if hasDateFilter {
		query, err := s.applyDateAwarePagination(ctx, query, collection, pageSize, pageToken)
		if err != nil {
			return nil, "", err
		}

		docs, err := query.Documents(ctx).GetAll()
		if err != nil {
			return nil, "", fmt.Errorf("failed to list expenses: %w", err)
		}

		if pageSize <= 0 {
			pageSize = 100
		}

		var nextPageToken string
		if len(docs) > int(pageSize) {
			docs = docs[:pageSize]
			nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
		}

		expenses := make([]*pfinancev1.Expense, 0, len(docs))
		for _, doc := range docs {
			var expense pfinancev1.Expense
			if err := doc.DataTo(&expense); err != nil {
				return nil, "", fmt.Errorf("failed to parse expense: %w", err)
			}
			expenses = append(expenses, &expense)
		}
		return expenses, nextPageToken, nil
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list expenses: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	// Detect next page
	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	expenses := make([]*pfinancev1.Expense, 0, len(docs))
	for _, doc := range docs {
		var expense pfinancev1.Expense
		if err := doc.DataTo(&expense); err != nil {
			return nil, "", fmt.Errorf("failed to parse expense: %w", err)
		}
		expenses = append(expenses, &expense)
	}

	return expenses, nextPageToken, nil
}

// DeleteExpense deletes an expense from Firestore
func (s *FirestoreStore) DeleteExpense(ctx context.Context, expenseID string) error {
	// Try to delete from personal expenses first
	_, err := s.client.Collection("expenses").Doc(expenseID).Delete(ctx)
	if err == nil {
		return nil
	}

	// Try group expenses
	_, err = s.client.Collection("groupExpenses").Doc(expenseID).Delete(ctx)
	return err
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

// GetIncome retrieves an income from Firestore
func (s *FirestoreStore) GetIncome(ctx context.Context, incomeID string) (*pfinancev1.Income, error) {
	// Try personal incomes first
	doc, err := s.client.Collection("incomes").Doc(incomeID).Get(ctx)
	if err == nil {
		var income pfinancev1.Income
		if err := doc.DataTo(&income); err != nil {
			return nil, fmt.Errorf("failed to parse income: %w", err)
		}
		return &income, nil
	}

	// Try group incomes
	doc, err = s.client.Collection("groupIncomes").Doc(incomeID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("income not found: %w", err)
	}

	var income pfinancev1.Income
	if err := doc.DataTo(&income); err != nil {
		return nil, fmt.Errorf("failed to parse income: %w", err)
	}
	return &income, nil
}

// UpdateIncome updates an income in Firestore
func (s *FirestoreStore) UpdateIncome(ctx context.Context, income *pfinancev1.Income) error {
	collection := "incomes"
	if income.GroupId != "" {
		collection = "groupIncomes"
	}

	_, err := s.client.Collection(collection).Doc(income.Id).Set(ctx, income)
	return err
}

// DeleteIncome deletes an income from Firestore
func (s *FirestoreStore) DeleteIncome(ctx context.Context, incomeID string) error {
	// Try to delete from personal incomes first
	_, err := s.client.Collection("incomes").Doc(incomeID).Delete(ctx)
	if err == nil {
		return nil
	}

	// Try group incomes
	_, err = s.client.Collection("groupIncomes").Doc(incomeID).Delete(ctx)
	return err
}

// ListIncomes lists incomes from Firestore
func (s *FirestoreStore) ListIncomes(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32, pageToken string) ([]*pfinancev1.Income, string, error) {
	collection := "incomes"
	if groupID != "" {
		collection = "groupIncomes"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Apply filters
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	} else if userID != "" {
		query = query.Where("UserId", "==", userID)
	}

	hasDateFilter := startDate != nil || endDate != nil
	if startDate != nil {
		query = query.Where("Date", ">=", *startDate)
	}
	if endDate != nil {
		query = query.Where("Date", "<=", *endDate)
	}

	// When date range filters are present, Firestore requires OrderBy on the range
	// field first. Use date-aware pagination to avoid query ordering conflicts.
	if hasDateFilter {
		query, err := s.applyDateAwarePagination(ctx, query, collection, pageSize, pageToken)
		if err != nil {
			return nil, "", err
		}

		docs, err := query.Documents(ctx).GetAll()
		if err != nil {
			return nil, "", fmt.Errorf("failed to list incomes: %w", err)
		}

		if pageSize <= 0 {
			pageSize = 100
		}

		var nextPageToken string
		if len(docs) > int(pageSize) {
			docs = docs[:pageSize]
			nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
		}

		incomes := make([]*pfinancev1.Income, 0, len(docs))
		for _, doc := range docs {
			var income pfinancev1.Income
			if err := doc.DataTo(&income); err != nil {
				return nil, "", fmt.Errorf("failed to parse income: %w", err)
			}
			incomes = append(incomes, &income)
		}
		return incomes, nextPageToken, nil
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list incomes: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	incomes := make([]*pfinancev1.Income, 0, len(docs))
	for _, doc := range docs {
		var income pfinancev1.Income
		if err := doc.DataTo(&income); err != nil {
			return nil, "", fmt.Errorf("failed to parse income: %w", err)
		}
		incomes = append(incomes, &income)
	}

	return incomes, nextPageToken, nil
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
func (s *FirestoreStore) ListGroups(ctx context.Context, userID string, pageSize int32, pageToken string) ([]*pfinancev1.FinanceGroup, string, error) {
	var query firestore.Query
	query = s.client.Collection("financeGroups").Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if userID != "" {
		query = query.Where("MemberIds", "array-contains", userID)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list groups: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	groups := make([]*pfinancev1.FinanceGroup, 0, len(docs))
	for _, doc := range docs {
		var group pfinancev1.FinanceGroup
		if err := doc.DataTo(&group); err != nil {
			return nil, "", fmt.Errorf("failed to parse group: %w", err)
		}
		groups = append(groups, &group)
	}

	return groups, nextPageToken, nil
}

// DeleteGroup deletes a group from Firestore
func (s *FirestoreStore) DeleteGroup(ctx context.Context, groupID string) error {
	_, err := s.client.Collection("financeGroups").Doc(groupID).Delete(ctx)
	return err
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
func (s *FirestoreStore) ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32, pageToken string) ([]*pfinancev1.GroupInvitation, string, error) {
	var query firestore.Query
	query = s.client.Collection("groupInvitations").Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if userEmail != "" {
		query = query.Where("InviteeEmail", "==", userEmail)
	}
	if status != nil {
		query = query.Where("Status", "==", *status)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list invitations: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	invitations := make([]*pfinancev1.GroupInvitation, 0, len(docs))
	for _, doc := range docs {
		var invitation pfinancev1.GroupInvitation
		if err := doc.DataTo(&invitation); err != nil {
			return nil, "", fmt.Errorf("failed to parse invitation: %w", err)
		}
		invitations = append(invitations, &invitation)
	}

	return invitations, nextPageToken, nil
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

// UpdateTaxConfig updates tax configuration
func (s *FirestoreStore) UpdateTaxConfig(ctx context.Context, userID, groupID string, config *pfinancev1.TaxConfig) error {
	var docPath string
	if groupID != "" {
		docPath = fmt.Sprintf("financeGroups/%s/taxConfig", groupID)
	} else {
		docPath = fmt.Sprintf("users/%s/taxConfig", userID)
	}

	_, err := s.client.Doc(docPath).Set(ctx, config)
	return err
}

// Invite link operations

// CreateInviteLink creates a new invite link in Firestore
func (s *FirestoreStore) CreateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error {
	_, err := s.client.Collection("groupInviteLinks").Doc(link.Id).Set(ctx, link)
	return err
}

// GetInviteLink retrieves an invite link from Firestore
func (s *FirestoreStore) GetInviteLink(ctx context.Context, linkID string) (*pfinancev1.GroupInviteLink, error) {
	doc, err := s.client.Collection("groupInviteLinks").Doc(linkID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("invite link not found: %w", err)
	}

	var link pfinancev1.GroupInviteLink
	if err := doc.DataTo(&link); err != nil {
		return nil, fmt.Errorf("failed to parse invite link: %w", err)
	}
	return &link, nil
}

// GetInviteLinkByCode retrieves an invite link by its code
func (s *FirestoreStore) GetInviteLinkByCode(ctx context.Context, code string) (*pfinancev1.GroupInviteLink, error) {
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	docs, err := s.client.Collection("groupInviteLinks").Where("Code", "==", code).Limit(1).Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to query invite link: %w", err)
	}

	if len(docs) == 0 {
		return nil, fmt.Errorf("invite link not found with code: %s", code)
	}

	var link pfinancev1.GroupInviteLink
	if err := docs[0].DataTo(&link); err != nil {
		return nil, fmt.Errorf("failed to parse invite link: %w", err)
	}
	return &link, nil
}

// UpdateInviteLink updates an invite link in Firestore
func (s *FirestoreStore) UpdateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error {
	_, err := s.client.Collection("groupInviteLinks").Doc(link.Id).Set(ctx, link)
	return err
}

// ListInviteLinks lists invite links for a group
func (s *FirestoreStore) ListInviteLinks(ctx context.Context, groupID string, includeInactive bool, pageSize int32, pageToken string) ([]*pfinancev1.GroupInviteLink, string, error) {
	var query firestore.Query
	query = s.client.Collection("groupInviteLinks").Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	}

	if !includeInactive {
		query = query.Where("IsActive", "==", true)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list invite links: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	links := make([]*pfinancev1.GroupInviteLink, 0, len(docs))
	for _, doc := range docs {
		var link pfinancev1.GroupInviteLink
		if err := doc.DataTo(&link); err != nil {
			return nil, "", fmt.Errorf("failed to parse invite link: %w", err)
		}
		links = append(links, &link)
	}

	return links, nextPageToken, nil
}

// Contribution operations

// CreateContribution creates a new expense contribution in Firestore
func (s *FirestoreStore) CreateContribution(ctx context.Context, contribution *pfinancev1.ExpenseContribution) error {
	_, err := s.client.Collection("expenseContributions").Doc(contribution.Id).Set(ctx, contribution)
	return err
}

// GetContribution retrieves a contribution from Firestore
func (s *FirestoreStore) GetContribution(ctx context.Context, contributionID string) (*pfinancev1.ExpenseContribution, error) {
	doc, err := s.client.Collection("expenseContributions").Doc(contributionID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("contribution not found: %w", err)
	}

	var contribution pfinancev1.ExpenseContribution
	if err := doc.DataTo(&contribution); err != nil {
		return nil, fmt.Errorf("failed to parse contribution: %w", err)
	}
	return &contribution, nil
}

// ListContributions lists contributions for a group or user
func (s *FirestoreStore) ListContributions(ctx context.Context, groupID, userID string, pageSize int32, pageToken string) ([]*pfinancev1.ExpenseContribution, string, error) {
	var query firestore.Query
	query = s.client.Collection("expenseContributions").Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("TargetGroupId", "==", groupID)
	}
	if userID != "" {
		query = query.Where("ContributedBy", "==", userID)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list contributions: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	contributions := make([]*pfinancev1.ExpenseContribution, 0, len(docs))
	for _, doc := range docs {
		var contribution pfinancev1.ExpenseContribution
		if err := doc.DataTo(&contribution); err != nil {
			return nil, "", fmt.Errorf("failed to parse contribution: %w", err)
		}
		contributions = append(contributions, &contribution)
	}

	return contributions, nextPageToken, nil
}

// Income contribution operations

// CreateIncomeContribution creates a new income contribution in Firestore
func (s *FirestoreStore) CreateIncomeContribution(ctx context.Context, contribution *pfinancev1.IncomeContribution) error {
	_, err := s.client.Collection("incomeContributions").Doc(contribution.Id).Set(ctx, contribution)
	return err
}

// GetIncomeContribution retrieves an income contribution from Firestore
func (s *FirestoreStore) GetIncomeContribution(ctx context.Context, contributionID string) (*pfinancev1.IncomeContribution, error) {
	doc, err := s.client.Collection("incomeContributions").Doc(contributionID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("income contribution not found: %w", err)
	}

	var contribution pfinancev1.IncomeContribution
	if err := doc.DataTo(&contribution); err != nil {
		return nil, fmt.Errorf("failed to parse income contribution: %w", err)
	}
	return &contribution, nil
}

// ListIncomeContributions lists income contributions for a group or user
func (s *FirestoreStore) ListIncomeContributions(ctx context.Context, groupID, userID string, pageSize int32, pageToken string) ([]*pfinancev1.IncomeContribution, string, error) {
	var query firestore.Query
	query = s.client.Collection("incomeContributions").Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("TargetGroupId", "==", groupID)
	}
	if userID != "" {
		query = query.Where("ContributedBy", "==", userID)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list income contributions: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	contributions := make([]*pfinancev1.IncomeContribution, 0, len(docs))
	for _, doc := range docs {
		var contribution pfinancev1.IncomeContribution
		if err := doc.DataTo(&contribution); err != nil {
			return nil, "", fmt.Errorf("failed to parse income contribution: %w", err)
		}
		contributions = append(contributions, &contribution)
	}

	return contributions, nextPageToken, nil
}

// Budget operations

// CreateBudget creates a new budget in Firestore
func (s *FirestoreStore) CreateBudget(ctx context.Context, budget *pfinancev1.Budget) error {
	collection := "budgets"
	if budget.GroupId != "" {
		collection = "groupBudgets"
	}

	_, err := s.client.Collection(collection).Doc(budget.Id).Set(ctx, budget)
	return err
}

// GetBudget retrieves a budget from Firestore
func (s *FirestoreStore) GetBudget(ctx context.Context, budgetID string) (*pfinancev1.Budget, error) {
	// Try user budgets first
	doc, err := s.client.Collection("budgets").Doc(budgetID).Get(ctx)
	if err == nil {
		var budget pfinancev1.Budget
		if err := doc.DataTo(&budget); err != nil {
			return nil, fmt.Errorf("failed to parse budget: %w", err)
		}
		return &budget, nil
	}

	// Try group budgets
	doc, err = s.client.Collection("groupBudgets").Doc(budgetID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("budget not found: %w", err)
	}

	var budget pfinancev1.Budget
	if err := doc.DataTo(&budget); err != nil {
		return nil, fmt.Errorf("failed to parse budget: %w", err)
	}
	return &budget, nil
}

// UpdateBudget updates a budget in Firestore
func (s *FirestoreStore) UpdateBudget(ctx context.Context, budget *pfinancev1.Budget) error {
	collection := "budgets"
	if budget.GroupId != "" {
		collection = "groupBudgets"
	}

	_, err := s.client.Collection(collection).Doc(budget.Id).Set(ctx, budget)
	return err
}

// DeleteBudget deletes a budget from Firestore
func (s *FirestoreStore) DeleteBudget(ctx context.Context, budgetID string) error {
	// Try to delete from user budgets first
	_, err := s.client.Collection("budgets").Doc(budgetID).Delete(ctx)
	if err == nil {
		return nil
	}

	// Try group budgets
	_, err = s.client.Collection("groupBudgets").Doc(budgetID).Delete(ctx)
	return err
}

// ListBudgets lists budgets for a user or group
func (s *FirestoreStore) ListBudgets(ctx context.Context, userID, groupID string, includeInactive bool, pageSize int32, pageToken string) ([]*pfinancev1.Budget, string, error) {
	collection := "budgets"
	if groupID != "" {
		collection = "groupBudgets"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Apply filters
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	} else if userID != "" {
		query = query.Where("UserId", "==", userID)
	}

	// Filter by active status unless includeInactive is true
	if !includeInactive {
		query = query.Where("IsActive", "==", true)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list budgets: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	budgets := make([]*pfinancev1.Budget, 0, len(docs))
	for _, doc := range docs {
		var budget pfinancev1.Budget
		if err := doc.DataTo(&budget); err != nil {
			return nil, "", fmt.Errorf("failed to parse budget: %w", err)
		}
		budgets = append(budgets, &budget)
	}

	return budgets, nextPageToken, nil
}

// GetBudgetProgress calculates the current progress of a budget
func (s *FirestoreStore) GetBudgetProgress(ctx context.Context, budgetID string, asOfDate time.Time) (*pfinancev1.BudgetProgress, error) {
	// Get the budget first
	budget, err := s.GetBudget(ctx, budgetID)
	if err != nil {
		return nil, fmt.Errorf("failed to get budget: %w", err)
	}

	// Calculate period start and end dates based on budget period
	periodStart, periodEnd := s.calculateBudgetPeriod(budget, asOfDate)

	// Get expenses within the budget period
	collection := "expenses"
	if budget.GroupId != "" {
		collection = "groupExpenses"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Filter by user or group
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if budget.GroupId != "" {
		query = query.Where("GroupId", "==", budget.GroupId)
	} else {
		query = query.Where("UserId", "==", budget.UserId)
	}

	// Filter by date range
	query = query.Where("Date", ">=", periodStart)
	query = query.Where("Date", "<=", periodEnd)

	// Filter by categories if specified
	if len(budget.CategoryIds) > 0 {
		query = query.Where("Category", "in", budget.CategoryIds)
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to get expenses for budget: %w", err)
	}

	// Calculate spending by category
	categorySpending := make(map[pfinancev1.ExpenseCategory]float64)
	totalSpent := 0.0

	for _, doc := range docs {
		var expense pfinancev1.Expense
		if err := doc.DataTo(&expense); err != nil {
			continue
		}
		categorySpending[expense.Category] += expense.Amount
		totalSpent += expense.Amount
	}

	// Build category breakdown
	var categoryBreakdown []*pfinancev1.ExpenseBreakdown
	for category, amount := range categorySpending {
		percentage := 0.0
		if totalSpent > 0 {
			percentage = (amount / totalSpent) * 100
		}
		categoryBreakdown = append(categoryBreakdown, &pfinancev1.ExpenseBreakdown{
			Category:   category,
			Amount:     amount,
			Percentage: percentage,
		})
	}

	// Calculate progress
	remainingAmount := budget.Amount - totalSpent
	percentageUsed := 0.0
	if budget.Amount > 0 {
		percentageUsed = (totalSpent / budget.Amount) * 100
	}

	// Calculate days remaining
	daysRemaining := int32(periodEnd.Sub(asOfDate).Hours() / 24)
	if daysRemaining < 0 {
		daysRemaining = 0
	}

	return &pfinancev1.BudgetProgress{
		BudgetId:          budgetID,
		AllocatedAmount:   budget.Amount,
		SpentAmount:       totalSpent,
		RemainingAmount:   remainingAmount,
		PercentageUsed:    percentageUsed,
		DaysRemaining:     daysRemaining,
		PeriodStart:       timestamppb.New(periodStart),
		PeriodEnd:         timestamppb.New(periodEnd),
		CategoryBreakdown: categoryBreakdown,
	}, nil
}

// calculateBudgetPeriod calculates the start and end dates for a budget period
func (s *FirestoreStore) calculateBudgetPeriod(budget *pfinancev1.Budget, asOfDate time.Time) (time.Time, time.Time) {
	// If budget has fixed start/end dates, use those
	if budget.StartDate != nil && budget.EndDate != nil {
		return budget.StartDate.AsTime(), budget.EndDate.AsTime()
	}

	// Otherwise, calculate based on period type
	var periodStart, periodEnd time.Time

	switch budget.Period {
	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY:
		// Find start of current week (Sunday)
		daysFromSunday := int(asOfDate.Weekday())
		periodStart = asOfDate.AddDate(0, 0, -daysFromSunday)
		periodEnd = periodStart.AddDate(0, 0, 6)

	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_FORTNIGHTLY:
		// Use budget start date as reference for fortnightly periods
		refDate := budget.StartDate.AsTime()
		daysDiff := int(asOfDate.Sub(refDate).Hours() / 24)
		periodsSince := daysDiff / 14
		periodStart = refDate.AddDate(0, 0, periodsSince*14)
		periodEnd = periodStart.AddDate(0, 0, 13)

	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY:
		// Start of current month
		periodStart = time.Date(asOfDate.Year(), asOfDate.Month(), 1, 0, 0, 0, 0, asOfDate.Location())
		// End of current month
		periodEnd = periodStart.AddDate(0, 1, -1)

	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_QUARTERLY:
		// Find start of current quarter
		month := asOfDate.Month()
		quarterStartMonth := time.Month(((int(month)-1)/3)*3 + 1)
		periodStart = time.Date(asOfDate.Year(), quarterStartMonth, 1, 0, 0, 0, 0, asOfDate.Location())
		periodEnd = periodStart.AddDate(0, 3, -1)

	case pfinancev1.BudgetPeriod_BUDGET_PERIOD_YEARLY:
		// Start of current year
		periodStart = time.Date(asOfDate.Year(), 1, 1, 0, 0, 0, 0, asOfDate.Location())
		periodEnd = time.Date(asOfDate.Year(), 12, 31, 23, 59, 59, 999999999, asOfDate.Location())

	default:
		// Default to monthly
		periodStart = time.Date(asOfDate.Year(), asOfDate.Month(), 1, 0, 0, 0, 0, asOfDate.Location())
		periodEnd = periodStart.AddDate(0, 1, -1)
	}

	// Set to beginning and end of day
	periodStart = time.Date(periodStart.Year(), periodStart.Month(), periodStart.Day(), 0, 0, 0, 0, periodStart.Location())
	periodEnd = time.Date(periodEnd.Year(), periodEnd.Month(), periodEnd.Day(), 23, 59, 59, 999999999, periodEnd.Location())

	return periodStart, periodEnd
}

// User operations

// GetUser retrieves a user from Firestore
func (s *FirestoreStore) GetUser(ctx context.Context, userID string) (*pfinancev1.User, error) {
	doc, err := s.client.Collection("users").Doc(userID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("user not found: %w", err)
	}

	var user pfinancev1.User
	if err := doc.DataTo(&user); err != nil {
		return nil, fmt.Errorf("failed to parse user: %w", err)
	}
	return &user, nil
}

// UpdateUser updates a user in Firestore
func (s *FirestoreStore) UpdateUser(ctx context.Context, user *pfinancev1.User) error {
	_, err := s.client.Collection("users").Doc(user.Id).Set(ctx, user)
	return err
}

// DeleteUser deletes a user and all their associated data from Firestore
func (s *FirestoreStore) DeleteUser(ctx context.Context, userID string) error {
	// Helper to delete all documents in a collection matching a query
	deleteMatching := func(collection, field, value string) error {
		docs, err := s.client.Collection(collection).Where(field, "==", value).Documents(ctx).GetAll()
		if err != nil {
			return fmt.Errorf("failed to query %s: %w", collection, err)
		}
		for i := 0; i < len(docs); i += 500 {
			batch := s.client.Batch()
			end := i + 500
			if end > len(docs) {
				end = len(docs)
			}
			for _, doc := range docs[i:end] {
				batch.Delete(doc.Ref)
			}
			if _, err := batch.Commit(ctx); err != nil {
				return fmt.Errorf("failed to batch delete %s: %w", collection, err)
			}
		}
		return nil
	}

	// Delete user's personal expenses
	if err := deleteMatching("expenses", "UserId", userID); err != nil {
		return err
	}

	// Delete user's personal incomes
	if err := deleteMatching("incomes", "UserId", userID); err != nil {
		return err
	}

	// Delete user's budgets
	if err := deleteMatching("budgets", "UserId", userID); err != nil {
		return err
	}

	// Delete user's goals
	if err := deleteMatching("goals", "UserId", userID); err != nil {
		return err
	}

	// Delete user's recurring transactions
	if err := deleteMatching("recurringTransactions", "UserId", userID); err != nil {
		return err
	}

	// Delete user's notifications
	if err := deleteMatching("notifications", "UserId", userID); err != nil {
		return err
	}

	// Delete user's notification preferences
	_, _ = s.client.Collection("notificationPreferences").Doc(userID).Delete(ctx)

	// Delete user's tax config (subcollection under users)
	_, _ = s.client.Doc(fmt.Sprintf("users/%s/taxConfig", userID)).Delete(ctx)

	// Delete user's expense contributions
	if err := deleteMatching("expenseContributions", "ContributedBy", userID); err != nil {
		return err
	}

	// Delete user's income contributions
	if err := deleteMatching("incomeContributions", "ContributedBy", userID); err != nil {
		return err
	}

	// Delete user's goal contributions
	if err := deleteMatching("goalContributions", "UserId", userID); err != nil {
		return err
	}

	// Delete user's correction records
	if err := deleteMatching("correction_records", "UserId", userID); err != nil {
		return err
	}

	// Delete user's merchant mappings
	if err := deleteMatching("merchant_mappings", "UserId", userID); err != nil {
		return err
	}

	// Delete user's extraction events
	if err := deleteMatching("extraction_events", "UserId", userID); err != nil {
		return err
	}

	// Finally, delete the user document itself
	_, err := s.client.Collection("users").Doc(userID).Delete(ctx)
	if err != nil {
		return fmt.Errorf("failed to delete user document: %w", err)
	}

	return nil
}

// Goal operations

// CreateGoal creates a new goal in Firestore
func (s *FirestoreStore) CreateGoal(ctx context.Context, goal *pfinancev1.FinancialGoal) error {
	collection := "goals"
	if goal.GroupId != "" {
		collection = "groupGoals"
	}

	_, err := s.client.Collection(collection).Doc(goal.Id).Set(ctx, goal)
	return err
}

// GetGoal retrieves a goal from Firestore
func (s *FirestoreStore) GetGoal(ctx context.Context, goalID string) (*pfinancev1.FinancialGoal, error) {
	// Try user goals first
	doc, err := s.client.Collection("goals").Doc(goalID).Get(ctx)
	if err == nil {
		var goal pfinancev1.FinancialGoal
		if err := doc.DataTo(&goal); err != nil {
			return nil, fmt.Errorf("failed to parse goal: %w", err)
		}
		return &goal, nil
	}

	// Try group goals
	doc, err = s.client.Collection("groupGoals").Doc(goalID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("goal not found: %w", err)
	}

	var goal pfinancev1.FinancialGoal
	if err := doc.DataTo(&goal); err != nil {
		return nil, fmt.Errorf("failed to parse goal: %w", err)
	}
	return &goal, nil
}

// UpdateGoal updates a goal in Firestore
func (s *FirestoreStore) UpdateGoal(ctx context.Context, goal *pfinancev1.FinancialGoal) error {
	collection := "goals"
	if goal.GroupId != "" {
		collection = "groupGoals"
	}

	_, err := s.client.Collection(collection).Doc(goal.Id).Set(ctx, goal)
	return err
}

// DeleteGoal deletes a goal from Firestore
func (s *FirestoreStore) DeleteGoal(ctx context.Context, goalID string) error {
	// Try to delete from user goals first
	_, err := s.client.Collection("goals").Doc(goalID).Delete(ctx)
	if err == nil {
		return nil
	}

	// Try group goals
	_, err = s.client.Collection("groupGoals").Doc(goalID).Delete(ctx)
	return err
}

// ListGoals lists goals for a user or group
func (s *FirestoreStore) ListGoals(ctx context.Context, userID, groupID string, status pfinancev1.GoalStatus, goalType pfinancev1.GoalType, pageSize int32, pageToken string) ([]*pfinancev1.FinancialGoal, string, error) {
	collection := "goals"
	if groupID != "" {
		collection = "groupGoals"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Apply filters
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	} else if userID != "" {
		query = query.Where("UserId", "==", userID)
	}

	// Filter by status if specified
	if status != pfinancev1.GoalStatus_GOAL_STATUS_UNSPECIFIED {
		query = query.Where("Status", "==", status)
	}

	// Filter by goal type if specified
	if goalType != pfinancev1.GoalType_GOAL_TYPE_UNSPECIFIED {
		query = query.Where("GoalType", "==", goalType)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list goals: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	goals := make([]*pfinancev1.FinancialGoal, 0, len(docs))
	for _, doc := range docs {
		var goal pfinancev1.FinancialGoal
		if err := doc.DataTo(&goal); err != nil {
			return nil, "", fmt.Errorf("failed to parse goal: %w", err)
		}
		goals = append(goals, &goal)
	}

	return goals, nextPageToken, nil
}

// GetGoalProgress calculates the current progress of a goal
func (s *FirestoreStore) GetGoalProgress(ctx context.Context, goalID string, asOfDate time.Time) (*pfinancev1.GoalProgress, error) {
	// Get the goal first
	goal, err := s.GetGoal(ctx, goalID)
	if err != nil {
		return nil, fmt.Errorf("failed to get goal: %w", err)
	}

	// Calculate progress
	currentAmount := goal.CurrentAmount
	targetAmount := goal.TargetAmount
	percentageComplete := 0.0
	if targetAmount > 0 {
		percentageComplete = (currentAmount / targetAmount) * 100
	}

	// Calculate days remaining
	daysRemaining := int32(0)
	if goal.TargetDate != nil {
		targetDate := goal.TargetDate.AsTime()
		if asOfDate.Before(targetDate) {
			daysRemaining = int32(targetDate.Sub(asOfDate).Hours() / 24)
		}
	}

	// Calculate daily rates
	remainingAmount := targetAmount - currentAmount
	requiredDailyRate := 0.0
	if daysRemaining > 0 && remainingAmount > 0 {
		requiredDailyRate = remainingAmount / float64(daysRemaining)
	}

	// Calculate actual daily rate based on progress so far
	actualDailyRate := 0.0
	if goal.StartDate != nil {
		startDate := goal.StartDate.AsTime()
		daysSinceStart := asOfDate.Sub(startDate).Hours() / 24
		if daysSinceStart > 0 {
			actualDailyRate = currentAmount / daysSinceStart
		}
	}

	// Determine if on track
	onTrack := actualDailyRate >= requiredDailyRate || percentageComplete >= 100

	// Find achieved milestones and next milestone
	var achievedMilestones []*pfinancev1.GoalMilestone
	var nextMilestone *pfinancev1.GoalMilestone
	for _, milestone := range goal.Milestones {
		if milestone.IsAchieved {
			achievedMilestones = append(achievedMilestones, milestone)
		} else if nextMilestone == nil || milestone.TargetPercentage < nextMilestone.TargetPercentage {
			nextMilestone = milestone
		}
	}

	return &pfinancev1.GoalProgress{
		GoalId:             goalID,
		CurrentAmount:      currentAmount,
		TargetAmount:       targetAmount,
		PercentageComplete: percentageComplete,
		DaysRemaining:      daysRemaining,
		RequiredDailyRate:  requiredDailyRate,
		ActualDailyRate:    actualDailyRate,
		OnTrack:            onTrack,
		AchievedMilestones: achievedMilestones,
		NextMilestone:      nextMilestone,
	}, nil
}

// Goal contribution operations

// CreateGoalContribution creates a new goal contribution in Firestore
func (s *FirestoreStore) CreateGoalContribution(ctx context.Context, contribution *pfinancev1.GoalContribution) error {
	_, err := s.client.Collection("goalContributions").Doc(contribution.Id).Set(ctx, contribution)
	return err
}

// ListGoalContributions lists contributions for a goal
func (s *FirestoreStore) ListGoalContributions(ctx context.Context, goalID string, pageSize int32, pageToken string) ([]*pfinancev1.GoalContribution, string, error) {
	var query firestore.Query
	query = s.client.Collection("goalContributions").Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if goalID != "" {
		query = query.Where("GoalId", "==", goalID)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list goal contributions: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	contributions := make([]*pfinancev1.GoalContribution, 0, len(docs))
	for _, doc := range docs {
		var contribution pfinancev1.GoalContribution
		if err := doc.DataTo(&contribution); err != nil {
			return nil, "", fmt.Errorf("failed to parse goal contribution: %w", err)
		}
		contributions = append(contributions, &contribution)
	}

	return contributions, nextPageToken, nil
}

// Search operations

func (s *FirestoreStore) SearchTransactions(ctx context.Context, userID, groupID, query, category string, amountMin, amountMax float64, startDate, endDate *time.Time, txType pfinancev1.TransactionType, pageSize int32, pageToken string) ([]*pfinancev1.SearchResult, string, int, error) {
	queryLower := strings.ToLower(query)
	var results []*pfinancev1.SearchResult

	// Search expenses
	if txType == pfinancev1.TransactionType_TRANSACTION_TYPE_UNSPECIFIED || txType == pfinancev1.TransactionType_TRANSACTION_TYPE_EXPENSE {
		collection := "expenses"
		if groupID != "" {
			collection = "groupExpenses"
		}

		q := s.client.Collection(collection).Query
		if groupID != "" {
			q = q.Where("GroupId", "==", groupID)
		} else if userID != "" {
			q = q.Where("UserId", "==", userID)
		}

		// Firestore can't do substring search, so we fetch and filter client-side
		docs, err := q.Limit(500).Documents(ctx).GetAll()
		if err != nil {
			return nil, "", 0, fmt.Errorf("failed to search expenses: %w", err)
		}

		for _, doc := range docs {
			var expense pfinancev1.Expense
			if err := doc.DataTo(&expense); err != nil {
				continue
			}
			if query != "" && !strings.Contains(strings.ToLower(expense.Description), queryLower) {
				continue
			}
			if category != "" && expense.Category.String() != category {
				continue
			}
			if amountMin > 0 && expense.Amount < amountMin {
				continue
			}
			if amountMax > 0 && expense.Amount > amountMax {
				continue
			}
			if startDate != nil && expense.Date != nil && expense.Date.AsTime().Before(*startDate) {
				continue
			}
			if endDate != nil && expense.Date != nil && expense.Date.AsTime().After(*endDate) {
				continue
			}
			results = append(results, &pfinancev1.SearchResult{
				Id:          expense.Id,
				Type:        pfinancev1.TransactionType_TRANSACTION_TYPE_EXPENSE,
				Description: expense.Description,
				Category:    expense.Category.String(),
				Amount:      expense.Amount,
				AmountCents: expense.AmountCents,
				Date:        expense.Date,
				GroupId:     expense.GroupId,
			})
		}
	}

	// Search incomes
	if txType == pfinancev1.TransactionType_TRANSACTION_TYPE_UNSPECIFIED || txType == pfinancev1.TransactionType_TRANSACTION_TYPE_INCOME {
		collection := "incomes"
		if groupID != "" {
			collection = "groupIncomes"
		}

		q := s.client.Collection(collection).Query
		if groupID != "" {
			q = q.Where("GroupId", "==", groupID)
		} else if userID != "" {
			q = q.Where("UserId", "==", userID)
		}

		docs, err := q.Limit(500).Documents(ctx).GetAll()
		if err != nil {
			return nil, "", 0, fmt.Errorf("failed to search incomes: %w", err)
		}

		for _, doc := range docs {
			var income pfinancev1.Income
			if err := doc.DataTo(&income); err != nil {
				continue
			}
			if query != "" && !strings.Contains(strings.ToLower(income.Source), queryLower) {
				continue
			}
			if amountMin > 0 && income.Amount < amountMin {
				continue
			}
			if amountMax > 0 && income.Amount > amountMax {
				continue
			}
			if startDate != nil && income.Date != nil && income.Date.AsTime().Before(*startDate) {
				continue
			}
			if endDate != nil && income.Date != nil && income.Date.AsTime().After(*endDate) {
				continue
			}
			results = append(results, &pfinancev1.SearchResult{
				Id:          income.Id,
				Type:        pfinancev1.TransactionType_TRANSACTION_TYPE_INCOME,
				Description: income.Source,
				Amount:      income.Amount,
				AmountCents: income.AmountCents,
				Date:        income.Date,
				GroupId:     income.GroupId,
			})
		}
	}

	totalCount := len(results)

	// Sort by date descending
	sort.Slice(results, func(i, j int) bool {
		if results[i].Date == nil || results[j].Date == nil {
			return results[i].Date != nil
		}
		return results[i].Date.AsTime().After(results[j].Date.AsTime())
	})

	// Paginate
	if pageSize <= 0 {
		pageSize = 20
	}

	startIdx := 0
	if pageToken != "" {
		cursorID, err := DecodePageToken(pageToken)
		if err == nil {
			for i, r := range results {
				if r.Id == cursorID {
					startIdx = i + 1
					break
				}
			}
		}
	}

	if startIdx >= len(results) {
		return nil, "", totalCount, nil
	}

	results = results[startIdx:]
	var nextToken string
	if int32(len(results)) > pageSize {
		nextToken = EncodePageToken(results[pageSize-1].Id)
		results = results[:pageSize]
	}

	return results, nextToken, totalCount, nil
}

// Recurring transaction operations

func (s *FirestoreStore) CreateRecurringTransaction(ctx context.Context, rt *pfinancev1.RecurringTransaction) error {
	collection := "recurringTransactions"
	if rt.GroupId != "" {
		collection = "groupRecurringTransactions"
	}

	_, err := s.client.Collection(collection).Doc(rt.Id).Set(ctx, rt)
	return err
}

func (s *FirestoreStore) GetRecurringTransaction(ctx context.Context, rtID string) (*pfinancev1.RecurringTransaction, error) {
	// Try personal first
	doc, err := s.client.Collection("recurringTransactions").Doc(rtID).Get(ctx)
	if err == nil {
		var rt pfinancev1.RecurringTransaction
		if err := doc.DataTo(&rt); err != nil {
			return nil, fmt.Errorf("failed to parse recurring transaction: %w", err)
		}
		return &rt, nil
	}

	// Try group
	doc, err = s.client.Collection("groupRecurringTransactions").Doc(rtID).Get(ctx)
	if err != nil {
		return nil, fmt.Errorf("recurring transaction not found: %w", err)
	}

	var rt pfinancev1.RecurringTransaction
	if err := doc.DataTo(&rt); err != nil {
		return nil, fmt.Errorf("failed to parse recurring transaction: %w", err)
	}
	return &rt, nil
}

func (s *FirestoreStore) UpdateRecurringTransaction(ctx context.Context, rt *pfinancev1.RecurringTransaction) error {
	collection := "recurringTransactions"
	if rt.GroupId != "" {
		collection = "groupRecurringTransactions"
	}

	_, err := s.client.Collection(collection).Doc(rt.Id).Set(ctx, rt)
	return err
}

func (s *FirestoreStore) DeleteRecurringTransaction(ctx context.Context, rtID string) error {
	_, err := s.client.Collection("recurringTransactions").Doc(rtID).Delete(ctx)
	if err == nil {
		return nil
	}

	_, err = s.client.Collection("groupRecurringTransactions").Doc(rtID).Delete(ctx)
	return err
}

func (s *FirestoreStore) ListRecurringTransactions(ctx context.Context, userID, groupID string, status pfinancev1.RecurringTransactionStatus, filterIsExpense bool, isExpense bool, pageSize int32, pageToken string) ([]*pfinancev1.RecurringTransaction, string, error) {
	collection := "recurringTransactions"
	if groupID != "" {
		collection = "groupRecurringTransactions"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	} else if userID != "" {
		query = query.Where("UserId", "==", userID)
	}

	if status != pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_UNSPECIFIED {
		query = query.Where("Status", "==", status)
	}

	if filterIsExpense {
		query = query.Where("IsExpense", "==", isExpense)
	}

	query, err := s.applyCursorPagination(query, pageSize, pageToken)
	if err != nil {
		return nil, "", err
	}

	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list recurring transactions: %w", err)
	}

	if pageSize <= 0 {
		pageSize = 100
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	results := make([]*pfinancev1.RecurringTransaction, 0, len(docs))
	for _, doc := range docs {
		var rt pfinancev1.RecurringTransaction
		if err := doc.DataTo(&rt); err != nil {
			return nil, "", fmt.Errorf("failed to parse recurring transaction: %w", err)
		}
		results = append(results, &rt)
	}

	return results, nextPageToken, nil
}

// Notification operations

func (s *FirestoreStore) CreateNotification(ctx context.Context, notification *pfinancev1.Notification) error {
	_, err := s.client.Collection("notifications").Doc(notification.Id).Set(ctx, notification)
	return err
}

func (s *FirestoreStore) ListNotifications(ctx context.Context, userID string, unreadOnly bool, typeFilter pfinancev1.NotificationType, pageSize int32, pageToken string) ([]*pfinancev1.Notification, string, error) {
	query := s.client.Collection("notifications").Where("UserId", "==", userID)

	if unreadOnly {
		query = query.Where("IsRead", "==", false)
	}

	if typeFilter != pfinancev1.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED {
		query = query.Where("Type", "==", int32(typeFilter))
	}

	query = query.OrderBy("CreatedAt", firestore.Desc)

	if pageToken != "" {
		docID, err := DecodePageToken(pageToken)
		if err != nil {
			return nil, "", fmt.Errorf("invalid page token: %w", err)
		}
		cursorDoc, err := s.client.Collection("notifications").Doc(docID).Get(ctx)
		if err != nil {
			return nil, "", fmt.Errorf("invalid page token document: %w", err)
		}
		query = query.StartAfter(cursorDoc.Data()["CreatedAt"])
	}

	if pageSize <= 0 {
		pageSize = 50
	}
	query = query.Limit(int(pageSize) + 1)

	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, "", fmt.Errorf("failed to list notifications: %w", err)
	}

	var nextPageToken string
	if len(docs) > int(pageSize) {
		docs = docs[:pageSize]
		nextPageToken = EncodePageToken(docs[pageSize-1].Ref.ID)
	}

	notifications := make([]*pfinancev1.Notification, 0, len(docs))
	for _, doc := range docs {
		var notification pfinancev1.Notification
		if err := doc.DataTo(&notification); err != nil {
			return nil, "", fmt.Errorf("failed to parse notification: %w", err)
		}
		notifications = append(notifications, &notification)
	}

	return notifications, nextPageToken, nil
}

func (s *FirestoreStore) MarkNotificationRead(ctx context.Context, notificationID string) error {
	_, err := s.client.Collection("notifications").Doc(notificationID).Update(ctx, []firestore.Update{
		{Path: "IsRead", Value: true},
		{Path: "ReadAt", Value: timestamppb.Now()},
	})
	if err != nil {
		return fmt.Errorf("notification not found: %w", err)
	}
	return nil
}

func (s *FirestoreStore) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	docs, err := s.client.Collection("notifications").
		Where("UserId", "==", userID).
		Where("IsRead", "==", false).
		Documents(ctx).GetAll()
	if err != nil {
		return fmt.Errorf("failed to query unread notifications: %w", err)
	}

	now := timestamppb.Now()
	batch := s.client.Batch()
	for _, doc := range docs {
		batch.Update(doc.Ref, []firestore.Update{
			{Path: "IsRead", Value: true},
			{Path: "ReadAt", Value: now},
		})
	}

	_, err = batch.Commit(ctx)
	return err
}

func (s *FirestoreStore) GetUnreadNotificationCount(ctx context.Context, userID string) (int32, error) {
	docs, err := s.client.Collection("notifications").
		Where("UserId", "==", userID).
		Where("IsRead", "==", false).
		Documents(ctx).GetAll()
	if err != nil {
		return 0, fmt.Errorf("failed to count unread notifications: %w", err)
	}

	return int32(len(docs)), nil
}

func (s *FirestoreStore) GetNotificationPreferences(ctx context.Context, userID string) (*pfinancev1.NotificationPreferences, error) {
	doc, err := s.client.Collection("notificationPreferences").Doc(userID).Get(ctx)
	if err != nil {
		return &pfinancev1.NotificationPreferences{
			UserId:             userID,
			BudgetAlerts:       true,
			GoalMilestones:     true,
			BillReminders:      true,
			UnusualSpending:    true,
			SubscriptionAlerts: true,
			WeeklyDigest:       false,
			BillReminderDays:   3,
		}, nil
	}

	var prefs pfinancev1.NotificationPreferences
	if err := doc.DataTo(&prefs); err != nil {
		return nil, fmt.Errorf("failed to parse notification preferences: %w", err)
	}
	return &prefs, nil
}

func (s *FirestoreStore) UpdateNotificationPreferences(ctx context.Context, prefs *pfinancev1.NotificationPreferences) error {
	_, err := s.client.Collection("notificationPreferences").Doc(prefs.UserId).Set(ctx, prefs)
	return err
}

func (s *FirestoreStore) HasNotification(ctx context.Context, userID string, notifType pfinancev1.NotificationType, referenceID string, metadataKey string, metadataValue string, withinHours int) (bool, error) {
	query := s.client.Collection("notifications").
		Where("UserId", "==", userID).
		Where("Type", "==", int32(notifType)).
		Where("ReferenceId", "==", referenceID)

	if withinHours > 0 {
		cutoff := time.Now().Add(-time.Duration(withinHours) * time.Hour)
		query = query.Where("CreatedAt", ">=", timestamppb.New(cutoff))
	}

	query = query.OrderBy("CreatedAt", firestore.Asc).Limit(50)

	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return false, fmt.Errorf("failed to check for existing notification: %w", err)
	}

	if metadataKey == "" {
		return len(docs) > 0, nil
	}

	// Check metadata match
	for _, doc := range docs {
		var n pfinancev1.Notification
		if err := doc.DataTo(&n); err != nil {
			continue
		}
		if n.Metadata != nil && n.Metadata[metadataKey] == metadataValue {
			return true, nil
		}
	}
	return false, nil
}

// Analytics operations

func (s *FirestoreStore) GetDailyAggregates(ctx context.Context, userID, groupID string, startDate, endDate time.Time) ([]*pfinancev1.DailyAggregate, error) {
	collection := "expenses"
	if groupID != "" {
		collection = "groupExpenses"
	}

	var query firestore.Query
	query = s.client.Collection(collection).Query

	// Apply filters
	// NOTE: Field names must match Go struct field names (PascalCase) as that's how Firestore serializes protobuf structs
	if groupID != "" {
		query = query.Where("GroupId", "==", groupID)
	} else if userID != "" {
		query = query.Where("UserId", "==", userID)
	}

	query = query.Where("Date", ">=", startDate)
	query = query.Where("Date", "<=", endDate)

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to get daily aggregates: %w", err)
	}

	// Group results client-side by day
	type dayData struct {
		totalAmount      float64
		totalAmountCents int64
		transactionCount int32
		categoryAmounts  map[pfinancev1.ExpenseCategory]*pfinancev1.CategoryAmount
	}

	days := make(map[string]*dayData)

	for _, doc := range docs {
		var expense pfinancev1.Expense
		if err := doc.DataTo(&expense); err != nil {
			continue
		}
		if expense.Date == nil {
			continue
		}

		dateStr := expense.Date.AsTime().Format("2006-01-02")

		day, ok := days[dateStr]
		if !ok {
			day = &dayData{
				categoryAmounts: make(map[pfinancev1.ExpenseCategory]*pfinancev1.CategoryAmount),
			}
			days[dateStr] = day
		}

		day.totalAmount += expense.Amount
		day.totalAmountCents += expense.AmountCents
		day.transactionCount++

		ca, ok := day.categoryAmounts[expense.Category]
		if !ok {
			ca = &pfinancev1.CategoryAmount{
				Category: expense.Category,
			}
			day.categoryAmounts[expense.Category] = ca
		}
		ca.Amount += expense.Amount
		ca.AmountCents += expense.AmountCents
		ca.Count++
	}

	// Build result slice
	result := make([]*pfinancev1.DailyAggregate, 0, len(days))
	for dateStr, day := range days {
		categoryAmounts := make([]*pfinancev1.CategoryAmount, 0, len(day.categoryAmounts))
		for _, ca := range day.categoryAmounts {
			categoryAmounts = append(categoryAmounts, ca)
		}

		result = append(result, &pfinancev1.DailyAggregate{
			Date:             dateStr,
			TotalAmount:      day.totalAmount,
			TotalAmountCents: day.totalAmountCents,
			TransactionCount: day.transactionCount,
			CategoryAmounts:  categoryAmounts,
		})
	}

	// Sort by date ascending
	sort.Slice(result, func(i, j int) bool {
		return result[i].Date < result[j].Date
	})

	return result, nil
}

// CreateCorrectionRecord stores a correction record
func (s *FirestoreStore) CreateCorrectionRecord(ctx context.Context, record *pfinancev1.CorrectionRecord) error {
	_, err := s.client.Collection("correction_records").Doc(record.Id).Set(ctx, record)
	return err
}

// ListCorrectionRecords lists correction records for a user
func (s *FirestoreStore) ListCorrectionRecords(ctx context.Context, userID string, limit int) ([]*pfinancev1.CorrectionRecord, error) {
	query := s.client.Collection("correction_records").Where("UserId", "==", userID).OrderBy("CreatedAt", firestore.Desc)
	if limit > 0 {
		query = query.Limit(limit)
	}
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("list correction records: %w", err)
	}
	var records []*pfinancev1.CorrectionRecord
	for _, doc := range docs {
		var r pfinancev1.CorrectionRecord
		if err := doc.DataTo(&r); err != nil {
			continue
		}
		records = append(records, &r)
	}
	return records, nil
}

// UpsertMerchantMapping creates or updates a merchant mapping.
// Uses a deterministic document ID derived from userId+rawPattern to prevent race conditions.
func (s *FirestoreStore) UpsertMerchantMapping(ctx context.Context, mapping *pfinancev1.MerchantMapping) error {
	docID := fmt.Sprintf("%s_%s", mapping.UserId, mapping.RawPattern)
	_, err := s.client.Collection("merchant_mappings").Doc(docID).Set(ctx, mapping)
	return err
}

// GetMerchantMappings returns all merchant mappings for a user
func (s *FirestoreStore) GetMerchantMappings(ctx context.Context, userID string) ([]*pfinancev1.MerchantMapping, error) {
	docs, err := s.client.Collection("merchant_mappings").Where("UserId", "==", userID).Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("get merchant mappings: %w", err)
	}
	var mappings []*pfinancev1.MerchantMapping
	for _, doc := range docs {
		var mm pfinancev1.MerchantMapping
		if err := doc.DataTo(&mm); err != nil {
			continue
		}
		mappings = append(mappings, &mm)
	}
	return mappings, nil
}

// CreateExtractionEvent stores an extraction event
func (s *FirestoreStore) CreateExtractionEvent(ctx context.Context, event *pfinancev1.ExtractionEvent) error {
	_, err := s.client.Collection("extraction_events").Doc(event.Id).Set(ctx, event)
	return err
}

// ListExtractionEvents lists extraction events for a user since a given time
func (s *FirestoreStore) ListExtractionEvents(ctx context.Context, userID string, since time.Time) ([]*pfinancev1.ExtractionEvent, error) {
	query := s.client.Collection("extraction_events").
		Where("UserId", "==", userID).
		Where("CreatedAt", ">=", timestamppb.New(since)).
		OrderBy("CreatedAt", firestore.Desc)
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("list extraction events: %w", err)
	}
	var events []*pfinancev1.ExtractionEvent
	for _, doc := range docs {
		var e pfinancev1.ExtractionEvent
		if err := doc.DataTo(&e); err != nil {
			continue
		}
		events = append(events, &e)
	}
	return events, nil
}
