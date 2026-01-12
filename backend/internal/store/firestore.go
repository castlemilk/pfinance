package store

import (
	"context"
	"fmt"
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
func (s *FirestoreStore) ListIncomes(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Income, error) {
	collection := "incomes"
	if groupID != "" {
		collection = "groupIncomes"
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
		return nil, fmt.Errorf("failed to list incomes: %w", err)
	}

	incomes := make([]*pfinancev1.Income, 0, len(docs))
	for _, doc := range docs {
		var income pfinancev1.Income
		if err := doc.DataTo(&income); err != nil {
			return nil, fmt.Errorf("failed to parse income: %w", err)
		}
		incomes = append(incomes, &income)
	}

	return incomes, nil
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
	docs, err := s.client.Collection("groupInviteLinks").Where("code", "==", code).Limit(1).Documents(ctx).GetAll()
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
func (s *FirestoreStore) ListInviteLinks(ctx context.Context, groupID string, includeInactive bool, pageSize int32) ([]*pfinancev1.GroupInviteLink, error) {
	var query firestore.Query
	query = s.client.Collection("groupInviteLinks").Query

	if groupID != "" {
		query = query.Where("group_id", "==", groupID)
	}

	if !includeInactive {
		query = query.Where("is_active", "==", true)
	}

	// Apply pagination
	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize))

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to list invite links: %w", err)
	}

	links := make([]*pfinancev1.GroupInviteLink, 0, len(docs))
	for _, doc := range docs {
		var link pfinancev1.GroupInviteLink
		if err := doc.DataTo(&link); err != nil {
			return nil, fmt.Errorf("failed to parse invite link: %w", err)
		}
		links = append(links, &link)
	}

	return links, nil
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
func (s *FirestoreStore) ListContributions(ctx context.Context, groupID, userID string, pageSize int32) ([]*pfinancev1.ExpenseContribution, error) {
	var query firestore.Query
	query = s.client.Collection("expenseContributions").Query

	if groupID != "" {
		query = query.Where("target_group_id", "==", groupID)
	}
	if userID != "" {
		query = query.Where("contributed_by", "==", userID)
	}

	// Apply pagination
	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize))

	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to list contributions: %w", err)
	}

	contributions := make([]*pfinancev1.ExpenseContribution, 0, len(docs))
	for _, doc := range docs {
		var contribution pfinancev1.ExpenseContribution
		if err := doc.DataTo(&contribution); err != nil {
			return nil, fmt.Errorf("failed to parse contribution: %w", err)
		}
		contributions = append(contributions, &contribution)
	}

	return contributions, nil
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
func (s *FirestoreStore) ListBudgets(ctx context.Context, userID, groupID string, includeInactive bool, pageSize int32) ([]*pfinancev1.Budget, error) {
	collection := "budgets"
	if groupID != "" {
		collection = "groupBudgets"
	}
	
	var query firestore.Query
	query = s.client.Collection(collection).Query
	
	// Apply filters
	if groupID != "" {
		query = query.Where("group_id", "==", groupID)
	} else if userID != "" {
		query = query.Where("user_id", "==", userID)
	}
	
	// Filter by active status unless includeInactive is true
	if !includeInactive {
		query = query.Where("is_active", "==", true)
	}
	
	// Apply pagination
	if pageSize <= 0 {
		pageSize = 100
	}
	query = query.Limit(int(pageSize))
	
	// Execute query
	docs, err := query.Documents(ctx).GetAll()
	if err != nil {
		return nil, fmt.Errorf("failed to list budgets: %w", err)
	}
	
	budgets := make([]*pfinancev1.Budget, 0, len(docs))
	for _, doc := range docs {
		var budget pfinancev1.Budget
		if err := doc.DataTo(&budget); err != nil {
			return nil, fmt.Errorf("failed to parse budget: %w", err)
		}
		budgets = append(budgets, &budget)
	}
	
	return budgets, nil
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
	if budget.GroupId != "" {
		query = query.Where("group_id", "==", budget.GroupId)
	} else {
		query = query.Where("user_id", "==", budget.UserId)
	}
	
	// Filter by date range
	query = query.Where("date", ">=", periodStart)
	query = query.Where("date", "<=", periodEnd)
	
	// Filter by categories if specified
	if len(budget.CategoryIds) > 0 {
		query = query.Where("category", "in", budget.CategoryIds)
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
		BudgetId:           budgetID,
		AllocatedAmount:    budget.Amount,
		SpentAmount:        totalSpent,
		RemainingAmount:    remainingAmount,
		PercentageUsed:     percentageUsed,
		DaysRemaining:      daysRemaining,
		PeriodStart:        timestamppb.New(periodStart),
		PeriodEnd:          timestamppb.New(periodEnd),
		CategoryBreakdown:  categoryBreakdown,
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
		quarterStartMonth := time.Month(((int(month) - 1) / 3) * 3 + 1)
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