package store

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// MemoryStore implements Store interface with in-memory storage
type MemoryStore struct {
	mu sync.RWMutex

	// Storage maps
	expenses                 map[string]*pfinancev1.Expense
	incomes                  map[string]*pfinancev1.Income
	groups                   map[string]*pfinancev1.FinanceGroup
	invitations              map[string]*pfinancev1.GroupInvitation
	inviteLinks              map[string]*pfinancev1.GroupInviteLink
	contributions            map[string]*pfinancev1.ExpenseContribution
	incomeContributions      map[string]*pfinancev1.IncomeContribution
	taxConfigs               map[string]*pfinancev1.TaxConfig
	budgets                  map[string]*pfinancev1.Budget
	users                    map[string]*pfinancev1.User
	goals                    map[string]*pfinancev1.FinancialGoal
	goalContributions        map[string]*pfinancev1.GoalContribution
	recurringTransactions    map[string]*pfinancev1.RecurringTransaction
	notifications            map[string]*pfinancev1.Notification
	notificationPreferences  map[string]*pfinancev1.NotificationPreferences
	correctionRecords        map[string]*pfinancev1.CorrectionRecord
	merchantMappings         map[string]*pfinancev1.MerchantMapping
	extractionEvents         map[string]*pfinancev1.ExtractionEvent
	taxDeductibilityMappings map[string]*pfinancev1.TaxDeductibilityMapping
	apiTokens                map[string]*pfinancev1.ApiToken
	processedStatements      []*pfinancev1.ProcessedStatement
}

// NewMemoryStore creates a new in-memory store
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		expenses:                 make(map[string]*pfinancev1.Expense),
		incomes:                  make(map[string]*pfinancev1.Income),
		groups:                   make(map[string]*pfinancev1.FinanceGroup),
		invitations:              make(map[string]*pfinancev1.GroupInvitation),
		inviteLinks:              make(map[string]*pfinancev1.GroupInviteLink),
		contributions:            make(map[string]*pfinancev1.ExpenseContribution),
		incomeContributions:      make(map[string]*pfinancev1.IncomeContribution),
		taxConfigs:               make(map[string]*pfinancev1.TaxConfig),
		budgets:                  make(map[string]*pfinancev1.Budget),
		users:                    make(map[string]*pfinancev1.User),
		goals:                    make(map[string]*pfinancev1.FinancialGoal),
		goalContributions:        make(map[string]*pfinancev1.GoalContribution),
		recurringTransactions:    make(map[string]*pfinancev1.RecurringTransaction),
		notifications:            make(map[string]*pfinancev1.Notification),
		notificationPreferences:  make(map[string]*pfinancev1.NotificationPreferences),
		correctionRecords:        make(map[string]*pfinancev1.CorrectionRecord),
		merchantMappings:         make(map[string]*pfinancev1.MerchantMapping),
		extractionEvents:         make(map[string]*pfinancev1.ExtractionEvent),
		taxDeductibilityMappings: make(map[string]*pfinancev1.TaxDeductibilityMapping),
		apiTokens:                make(map[string]*pfinancev1.ApiToken),
	}
}

// paginateIDs applies cursor-based pagination to a sorted slice of IDs.
// Returns the paginated IDs and the next page token (empty if no more pages).
func paginateIDs(ids []string, pageSize int32, pageToken string) ([]string, string) {
	if pageSize <= 0 {
		pageSize = 100
	}

	sort.Strings(ids)

	// Find cursor position
	startIdx := 0
	if pageToken != "" {
		cursorID, err := DecodePageToken(pageToken)
		if err == nil {
			for i, id := range ids {
				if id > cursorID {
					startIdx = i
					break
				}
				// If we've reached the end without finding a greater ID
				if i == len(ids)-1 {
					return nil, ""
				}
			}
		}
	}

	// Slice from startIdx
	ids = ids[startIdx:]

	// Apply page size
	var nextToken string
	if int32(len(ids)) > pageSize {
		nextToken = EncodePageToken(ids[pageSize-1])
		ids = ids[:pageSize]
	}

	return ids, nextToken
}

// Expense operations

func (m *MemoryStore) CreateExpense(ctx context.Context, expense *pfinancev1.Expense) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if expense.Id == "" {
		expense.Id = uuid.New().String()
	}

	m.expenses[expense.Id] = expense
	return nil
}

// BatchCreateExpenses creates multiple expenses in the memory store.
func (m *MemoryStore) BatchCreateExpenses(ctx context.Context, expenses []*pfinancev1.Expense) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, expense := range expenses {
		if expense.Id == "" {
			expense.Id = uuid.New().String()
		}
		m.expenses[expense.Id] = expense
	}
	return nil
}

// BatchDeleteExpenses deletes multiple expenses from the memory store.
func (m *MemoryStore) BatchDeleteExpenses(ctx context.Context, expenseIDs []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, id := range expenseIDs {
		delete(m.expenses, id)
	}
	return nil
}

func (m *MemoryStore) GetExpense(ctx context.Context, expenseID string) (*pfinancev1.Expense, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	expense, ok := m.expenses[expenseID]
	if !ok {
		return nil, fmt.Errorf("expense not found: %s", expenseID)
	}

	return expense, nil
}

func (m *MemoryStore) UpdateExpense(ctx context.Context, expense *pfinancev1.Expense) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.expenses[expense.Id]; !ok {
		return fmt.Errorf("expense not found: %s", expense.Id)
	}

	m.expenses[expense.Id] = expense
	return nil
}

func (m *MemoryStore) ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32, pageToken string) ([]*pfinancev1.Expense, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// First pass: collect matching IDs
	var matchingIDs []string
	for id, expense := range m.expenses {
		if userID != "" && expense.UserId != userID {
			continue
		}
		if groupID != "" && expense.GroupId != groupID {
			continue
		}
		if startDate != nil || endDate != nil {
			expenseTime := expense.Date.AsTime()
			if startDate != nil && expenseTime.Before(*startDate) {
				continue
			}
			if endDate != nil && expenseTime.After(*endDate) {
				continue
			}
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.Expense, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.expenses[id])
	}
	return result, nextToken, nil
}

func (m *MemoryStore) DeleteExpense(ctx context.Context, expenseID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.expenses, expenseID)
	return nil
}

// Income operations

func (m *MemoryStore) CreateIncome(ctx context.Context, income *pfinancev1.Income) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if income.Id == "" {
		income.Id = uuid.New().String()
	}

	m.incomes[income.Id] = income
	return nil
}

func (m *MemoryStore) GetIncome(ctx context.Context, incomeID string) (*pfinancev1.Income, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	income, ok := m.incomes[incomeID]
	if !ok {
		return nil, fmt.Errorf("income not found: %s", incomeID)
	}

	return income, nil
}

func (m *MemoryStore) UpdateIncome(ctx context.Context, income *pfinancev1.Income) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.incomes[income.Id]; !ok {
		return fmt.Errorf("income not found: %s", income.Id)
	}

	m.incomes[income.Id] = income
	return nil
}

func (m *MemoryStore) DeleteIncome(ctx context.Context, incomeID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.incomes, incomeID)
	return nil
}

func (m *MemoryStore) ListIncomes(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32, pageToken string) ([]*pfinancev1.Income, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, income := range m.incomes {
		if userID != "" && income.UserId != userID {
			continue
		}
		if groupID != "" && income.GroupId != groupID {
			continue
		}
		if startDate != nil || endDate != nil {
			incomeTime := income.Date.AsTime()
			if startDate != nil && incomeTime.Before(*startDate) {
				continue
			}
			if endDate != nil && incomeTime.After(*endDate) {
				continue
			}
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.Income, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.incomes[id])
	}
	return result, nextToken, nil
}

// Group operations

func (m *MemoryStore) CreateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if group.Id == "" {
		group.Id = uuid.New().String()
	}

	m.groups[group.Id] = group
	return nil
}

func (m *MemoryStore) GetGroup(ctx context.Context, groupID string) (*pfinancev1.FinanceGroup, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	group, ok := m.groups[groupID]
	if !ok {
		return nil, fmt.Errorf("group not found: %s", groupID)
	}

	return group, nil
}

func (m *MemoryStore) UpdateGroup(ctx context.Context, group *pfinancev1.FinanceGroup) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.groups[group.Id]; !ok {
		return fmt.Errorf("group not found: %s", group.Id)
	}

	m.groups[group.Id] = group
	return nil
}

func (m *MemoryStore) ListGroups(ctx context.Context, userID string, pageSize int32, pageToken string) ([]*pfinancev1.FinanceGroup, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, group := range m.groups {
		isMember := false
		for _, member := range group.Members {
			if member.UserId == userID {
				isMember = true
				break
			}
		}
		if !isMember {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.FinanceGroup, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.groups[id])
	}
	return result, nextToken, nil
}

func (m *MemoryStore) DeleteGroup(ctx context.Context, groupID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.groups, groupID)
	return nil
}

// Invitation operations

func (m *MemoryStore) CreateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if invitation.Id == "" {
		invitation.Id = uuid.New().String()
	}

	m.invitations[invitation.Id] = invitation
	return nil
}

func (m *MemoryStore) GetInvitation(ctx context.Context, invitationID string) (*pfinancev1.GroupInvitation, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	invitation, ok := m.invitations[invitationID]
	if !ok {
		return nil, fmt.Errorf("invitation not found: %s", invitationID)
	}

	return invitation, nil
}

func (m *MemoryStore) UpdateInvitation(ctx context.Context, invitation *pfinancev1.GroupInvitation) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.invitations[invitation.Id]; !ok {
		return fmt.Errorf("invitation not found: %s", invitation.Id)
	}

	m.invitations[invitation.Id] = invitation
	return nil
}

func (m *MemoryStore) ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32, pageToken string) ([]*pfinancev1.GroupInvitation, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, invitation := range m.invitations {
		if invitation.InviteeEmail != userEmail {
			continue
		}
		if status != nil && invitation.Status != *status {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.GroupInvitation, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.invitations[id])
	}
	return result, nextToken, nil
}

// Invite link operations

func (m *MemoryStore) CreateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if link.Id == "" {
		link.Id = uuid.New().String()
	}

	m.inviteLinks[link.Id] = link
	return nil
}

func (m *MemoryStore) GetInviteLink(ctx context.Context, linkID string) (*pfinancev1.GroupInviteLink, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	link, ok := m.inviteLinks[linkID]
	if !ok {
		return nil, fmt.Errorf("invite link not found: %s", linkID)
	}

	return link, nil
}

func (m *MemoryStore) GetInviteLinkByCode(ctx context.Context, code string) (*pfinancev1.GroupInviteLink, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, link := range m.inviteLinks {
		if link.Code == code {
			return link, nil
		}
	}

	return nil, fmt.Errorf("invite link not found with code: %s", code)
}

func (m *MemoryStore) UpdateInviteLink(ctx context.Context, link *pfinancev1.GroupInviteLink) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.inviteLinks[link.Id]; !ok {
		return fmt.Errorf("invite link not found: %s", link.Id)
	}

	m.inviteLinks[link.Id] = link
	return nil
}

func (m *MemoryStore) ListInviteLinks(ctx context.Context, groupID string, includeInactive bool, pageSize int32, pageToken string) ([]*pfinancev1.GroupInviteLink, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, link := range m.inviteLinks {
		if groupID != "" && link.GroupId != groupID {
			continue
		}
		if !includeInactive && !link.IsActive {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.GroupInviteLink, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.inviteLinks[id])
	}
	return result, nextToken, nil
}

// Contribution operations

func (m *MemoryStore) CreateContribution(ctx context.Context, contribution *pfinancev1.ExpenseContribution) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if contribution.Id == "" {
		contribution.Id = uuid.New().String()
	}

	m.contributions[contribution.Id] = contribution
	return nil
}

func (m *MemoryStore) GetContribution(ctx context.Context, contributionID string) (*pfinancev1.ExpenseContribution, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	contribution, ok := m.contributions[contributionID]
	if !ok {
		return nil, fmt.Errorf("contribution not found: %s", contributionID)
	}

	return contribution, nil
}

func (m *MemoryStore) ListContributions(ctx context.Context, groupID, userID string, pageSize int32, pageToken string) ([]*pfinancev1.ExpenseContribution, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, contribution := range m.contributions {
		if groupID != "" && contribution.TargetGroupId != groupID {
			continue
		}
		if userID != "" && contribution.ContributedBy != userID {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.ExpenseContribution, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.contributions[id])
	}
	return result, nextToken, nil
}

// Income contribution operations

func (m *MemoryStore) CreateIncomeContribution(ctx context.Context, contribution *pfinancev1.IncomeContribution) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if contribution.Id == "" {
		contribution.Id = uuid.New().String()
	}

	m.incomeContributions[contribution.Id] = contribution
	return nil
}

func (m *MemoryStore) GetIncomeContribution(ctx context.Context, contributionID string) (*pfinancev1.IncomeContribution, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	contribution, ok := m.incomeContributions[contributionID]
	if !ok {
		return nil, fmt.Errorf("income contribution not found: %s", contributionID)
	}

	return contribution, nil
}

func (m *MemoryStore) ListIncomeContributions(ctx context.Context, groupID, userID string, pageSize int32, pageToken string) ([]*pfinancev1.IncomeContribution, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, contribution := range m.incomeContributions {
		if groupID != "" && contribution.TargetGroupId != groupID {
			continue
		}
		if userID != "" && contribution.ContributedBy != userID {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.IncomeContribution, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.incomeContributions[id])
	}
	return result, nextToken, nil
}

// Tax config operations

func (m *MemoryStore) GetTaxConfig(ctx context.Context, userID, groupID string) (*pfinancev1.TaxConfig, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	key := userID
	if groupID != "" {
		key = "group:" + groupID
	}

	config, ok := m.taxConfigs[key]
	if !ok {
		// Return default config
		return &pfinancev1.TaxConfig{
			Enabled:           true,
			Country:           pfinancev1.TaxCountry_TAX_COUNTRY_SIMPLE,
			TaxRate:           0.25,
			IncludeDeductions: false,
		}, nil
	}

	return config, nil
}

func (m *MemoryStore) UpdateTaxConfig(ctx context.Context, userID, groupID string, config *pfinancev1.TaxConfig) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	key := userID
	if groupID != "" {
		key = "group:" + groupID
	}

	m.taxConfigs[key] = config
	return nil
}

// Budget operations

func (m *MemoryStore) CreateBudget(ctx context.Context, budget *pfinancev1.Budget) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if budget.Id == "" {
		budget.Id = uuid.New().String()
	}

	m.budgets[budget.Id] = budget
	return nil
}

func (m *MemoryStore) GetBudget(ctx context.Context, budgetID string) (*pfinancev1.Budget, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	budget, ok := m.budgets[budgetID]
	if !ok {
		return nil, fmt.Errorf("budget not found: %s", budgetID)
	}

	return budget, nil
}

func (m *MemoryStore) UpdateBudget(ctx context.Context, budget *pfinancev1.Budget) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.budgets[budget.Id]; !ok {
		return fmt.Errorf("budget not found: %s", budget.Id)
	}

	m.budgets[budget.Id] = budget
	return nil
}

func (m *MemoryStore) DeleteBudget(ctx context.Context, budgetID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.budgets, budgetID)
	return nil
}

func (m *MemoryStore) ListBudgets(ctx context.Context, userID, groupID string, includeInactive bool, pageSize int32, pageToken string) ([]*pfinancev1.Budget, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, budget := range m.budgets {
		if userID != "" && budget.UserId != userID {
			continue
		}
		if groupID != "" && budget.GroupId != groupID {
			continue
		}
		if !includeInactive && !budget.IsActive {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.Budget, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.budgets[id])
	}
	return result, nextToken, nil
}

func (m *MemoryStore) GetBudgetProgress(ctx context.Context, budgetID string, asOfDate time.Time) (*pfinancev1.BudgetProgress, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	budget, ok := m.budgets[budgetID]
	if !ok {
		return nil, fmt.Errorf("budget not found: %s", budgetID)
	}

	// Calculate spent amount by summing matching expenses
	var spentAmount float64
	for _, expense := range m.expenses {
		// Match by user/group
		if budget.UserId != "" && expense.UserId != budget.UserId {
			continue
		}
		if budget.GroupId != "" && expense.GroupId != budget.GroupId {
			continue
		}

		// Match by category if specified in budget
		if len(budget.CategoryIds) > 0 {
			categoryMatch := false
			for _, catId := range budget.CategoryIds {
				if expense.Category == catId {
					categoryMatch = true
					break
				}
			}
			if !categoryMatch {
				continue
			}
		}

		// Check if expense is within budget period
		expenseTime := expense.Date.AsTime()
		budgetStart := budget.StartDate.AsTime()
		budgetEnd := budget.EndDate.AsTime()

		if expenseTime.Before(budgetStart) || expenseTime.After(budgetEnd) {
			continue
		}

		spentAmount += expense.Amount
	}

	remainingAmount := budget.Amount - spentAmount
	percentageUsed := (spentAmount / budget.Amount) * 100

	return &pfinancev1.BudgetProgress{
		BudgetId:        budgetID,
		SpentAmount:     spentAmount,
		RemainingAmount: remainingAmount,
		PercentageUsed:  percentageUsed,
	}, nil
}

// User operations

func (m *MemoryStore) GetUser(ctx context.Context, userID string) (*pfinancev1.User, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	user, ok := m.users[userID]
	if !ok {
		return nil, fmt.Errorf("user not found: %s", userID)
	}

	return user, nil
}

func (m *MemoryStore) UpdateUser(ctx context.Context, user *pfinancev1.User) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.users[user.Id] = user
	return nil
}

func (m *MemoryStore) DeleteUser(ctx context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Delete the user record
	delete(m.users, userID)

	// Delete all user's expenses
	for id, expense := range m.expenses {
		if expense.UserId == userID {
			delete(m.expenses, id)
		}
	}

	// Delete all user's incomes
	for id, income := range m.incomes {
		if income.UserId == userID {
			delete(m.incomes, id)
		}
	}

	// Delete all user's budgets
	for id, budget := range m.budgets {
		if budget.UserId == userID {
			delete(m.budgets, id)
		}
	}

	// Delete all user's goals
	for id, goal := range m.goals {
		if goal.UserId == userID {
			delete(m.goals, id)
		}
	}

	// Delete all user's goal contributions
	for id, gc := range m.goalContributions {
		if gc.UserId == userID {
			delete(m.goalContributions, id)
		}
	}

	// Delete all user's recurring transactions
	for id, rt := range m.recurringTransactions {
		if rt.UserId == userID {
			delete(m.recurringTransactions, id)
		}
	}

	// Delete all user's notifications
	for id, n := range m.notifications {
		if n.UserId == userID {
			delete(m.notifications, id)
		}
	}

	// Delete user's notification preferences
	delete(m.notificationPreferences, userID)

	// Delete user's tax config
	delete(m.taxConfigs, userID)

	// Delete all user's contributions
	for id, c := range m.contributions {
		if c.ContributedBy == userID {
			delete(m.contributions, id)
		}
	}

	// Delete all user's income contributions
	for id, ic := range m.incomeContributions {
		if ic.ContributedBy == userID {
			delete(m.incomeContributions, id)
		}
	}

	// Delete all user's correction records
	for id, cr := range m.correctionRecords {
		if cr.UserId == userID {
			delete(m.correctionRecords, id)
		}
	}

	// Delete all user's merchant mappings
	for id, mm := range m.merchantMappings {
		if mm.UserId == userID {
			delete(m.merchantMappings, id)
		}
	}

	// Delete all user's extraction events
	for id, ee := range m.extractionEvents {
		if ee.UserId == userID {
			delete(m.extractionEvents, id)
		}
	}

	return nil
}

// ClearUserData deletes all financial data for a user but keeps the account, notification preferences, and API tokens
func (m *MemoryStore) ClearUserData(ctx context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Delete all user's expenses
	for id, expense := range m.expenses {
		if expense.UserId == userID {
			delete(m.expenses, id)
		}
	}

	// Delete all user's incomes
	for id, income := range m.incomes {
		if income.UserId == userID {
			delete(m.incomes, id)
		}
	}

	// Delete all user's budgets
	for id, budget := range m.budgets {
		if budget.UserId == userID {
			delete(m.budgets, id)
		}
	}

	// Delete all user's goals
	for id, goal := range m.goals {
		if goal.UserId == userID {
			delete(m.goals, id)
		}
	}

	// Delete all user's goal contributions
	for id, gc := range m.goalContributions {
		if gc.UserId == userID {
			delete(m.goalContributions, id)
		}
	}

	// Delete all user's recurring transactions
	for id, rt := range m.recurringTransactions {
		if rt.UserId == userID {
			delete(m.recurringTransactions, id)
		}
	}

	// Delete all user's notifications
	for id, n := range m.notifications {
		if n.UserId == userID {
			delete(m.notifications, id)
		}
	}

	// Delete user's tax config
	delete(m.taxConfigs, userID)

	// Delete all user's contributions
	for id, c := range m.contributions {
		if c.ContributedBy == userID {
			delete(m.contributions, id)
		}
	}

	// Delete all user's income contributions
	for id, ic := range m.incomeContributions {
		if ic.ContributedBy == userID {
			delete(m.incomeContributions, id)
		}
	}

	// Delete all user's correction records
	for id, cr := range m.correctionRecords {
		if cr.UserId == userID {
			delete(m.correctionRecords, id)
		}
	}

	// Delete all user's merchant mappings
	for id, mm := range m.merchantMappings {
		if mm.UserId == userID {
			delete(m.merchantMappings, id)
		}
	}

	// Delete all user's extraction events
	for id, ee := range m.extractionEvents {
		if ee.UserId == userID {
			delete(m.extractionEvents, id)
		}
	}

	// NOTE: Keeps user doc, notification preferences, and API tokens

	return nil
}

// Goal operations

func (m *MemoryStore) CreateGoal(ctx context.Context, goal *pfinancev1.FinancialGoal) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if goal.Id == "" {
		goal.Id = uuid.New().String()
	}

	m.goals[goal.Id] = goal
	return nil
}

func (m *MemoryStore) GetGoal(ctx context.Context, goalID string) (*pfinancev1.FinancialGoal, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	goal, ok := m.goals[goalID]
	if !ok {
		return nil, fmt.Errorf("goal not found: %s", goalID)
	}

	return goal, nil
}

func (m *MemoryStore) UpdateGoal(ctx context.Context, goal *pfinancev1.FinancialGoal) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.goals[goal.Id]; !ok {
		return fmt.Errorf("goal not found: %s", goal.Id)
	}

	m.goals[goal.Id] = goal
	return nil
}

func (m *MemoryStore) DeleteGoal(ctx context.Context, goalID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.goals, goalID)
	return nil
}

func (m *MemoryStore) ListGoals(ctx context.Context, userID, groupID string, status pfinancev1.GoalStatus, goalType pfinancev1.GoalType, pageSize int32, pageToken string) ([]*pfinancev1.FinancialGoal, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, goal := range m.goals {
		if userID != "" && goal.UserId != userID {
			continue
		}
		if groupID != "" && goal.GroupId != groupID {
			continue
		}
		if status != pfinancev1.GoalStatus_GOAL_STATUS_UNSPECIFIED && goal.Status != status {
			continue
		}
		if goalType != pfinancev1.GoalType_GOAL_TYPE_UNSPECIFIED && goal.GoalType != goalType {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.FinancialGoal, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.goals[id])
	}
	return result, nextToken, nil
}

func (m *MemoryStore) GetGoalProgress(ctx context.Context, goalID string, asOfDate time.Time) (*pfinancev1.GoalProgress, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	goal, ok := m.goals[goalID]
	if !ok {
		return nil, fmt.Errorf("goal not found: %s", goalID)
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

func (m *MemoryStore) CreateGoalContribution(ctx context.Context, contribution *pfinancev1.GoalContribution) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if contribution.Id == "" {
		contribution.Id = uuid.New().String()
	}

	m.goalContributions[contribution.Id] = contribution
	return nil
}

func (m *MemoryStore) ListGoalContributions(ctx context.Context, goalID string, pageSize int32, pageToken string) ([]*pfinancev1.GoalContribution, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, contribution := range m.goalContributions {
		if goalID != "" && contribution.GoalId != goalID {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.GoalContribution, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.goalContributions[id])
	}
	return result, nextToken, nil
}

// Search operations

func (m *MemoryStore) SearchTransactions(ctx context.Context, userID, groupID, query, category string, amountMin, amountMax float64, startDate, endDate *time.Time, txType pfinancev1.TransactionType, pageSize int32, pageToken string) ([]*pfinancev1.SearchResult, string, int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	queryLower := strings.ToLower(query)
	var results []*pfinancev1.SearchResult

	// Search expenses
	if txType == pfinancev1.TransactionType_TRANSACTION_TYPE_UNSPECIFIED || txType == pfinancev1.TransactionType_TRANSACTION_TYPE_EXPENSE {
		for _, expense := range m.expenses {
			if userID != "" && expense.UserId != userID {
				continue
			}
			if groupID != "" && expense.GroupId != groupID {
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
		for _, income := range m.incomes {
			if userID != "" && income.UserId != userID {
				continue
			}
			if groupID != "" && income.GroupId != groupID {
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

func (m *MemoryStore) CreateRecurringTransaction(ctx context.Context, rt *pfinancev1.RecurringTransaction) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if rt.Id == "" {
		rt.Id = uuid.New().String()
	}

	m.recurringTransactions[rt.Id] = rt
	return nil
}

func (m *MemoryStore) GetRecurringTransaction(ctx context.Context, rtID string) (*pfinancev1.RecurringTransaction, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	rt, ok := m.recurringTransactions[rtID]
	if !ok {
		return nil, fmt.Errorf("recurring transaction not found: %s", rtID)
	}

	return rt, nil
}

func (m *MemoryStore) UpdateRecurringTransaction(ctx context.Context, rt *pfinancev1.RecurringTransaction) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.recurringTransactions[rt.Id]; !ok {
		return fmt.Errorf("recurring transaction not found: %s", rt.Id)
	}

	m.recurringTransactions[rt.Id] = rt
	return nil
}

func (m *MemoryStore) DeleteRecurringTransaction(ctx context.Context, rtID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.recurringTransactions, rtID)
	return nil
}

func (m *MemoryStore) ListRecurringTransactions(ctx context.Context, userID, groupID string, status pfinancev1.RecurringTransactionStatus, filterIsExpense bool, isExpense bool, pageSize int32, pageToken string) ([]*pfinancev1.RecurringTransaction, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, rt := range m.recurringTransactions {
		if userID != "" && rt.UserId != userID {
			continue
		}
		if groupID != "" && rt.GroupId != groupID {
			continue
		}
		if status != pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_UNSPECIFIED && rt.Status != status {
			continue
		}
		if filterIsExpense && rt.IsExpense != isExpense {
			continue
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.RecurringTransaction, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.recurringTransactions[id])
	}
	return result, nextToken, nil
}

// Notification operations

func (m *MemoryStore) CreateNotification(ctx context.Context, notification *pfinancev1.Notification) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if notification.Id == "" {
		notification.Id = uuid.New().String()
	}

	m.notifications[notification.Id] = notification
	return nil
}

func (m *MemoryStore) ListNotifications(ctx context.Context, userID string, unreadOnly bool, typeFilter pfinancev1.NotificationType, pageSize int32, pageToken string) ([]*pfinancev1.Notification, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Collect matching notifications
	var matching []*pfinancev1.Notification
	for _, n := range m.notifications {
		if n.UserId != userID {
			continue
		}
		if unreadOnly && n.IsRead {
			continue
		}
		if typeFilter != pfinancev1.NotificationType_NOTIFICATION_TYPE_UNSPECIFIED && n.Type != typeFilter {
			continue
		}
		matching = append(matching, n)
	}

	// Sort by created_at descending (newest first)
	sort.Slice(matching, func(i, j int) bool {
		if matching[i].CreatedAt == nil || matching[j].CreatedAt == nil {
			return matching[i].CreatedAt != nil
		}
		return matching[i].CreatedAt.AsTime().After(matching[j].CreatedAt.AsTime())
	})

	// Paginate
	if pageSize <= 0 {
		pageSize = 50
	}

	startIdx := 0
	if pageToken != "" {
		cursorID, err := DecodePageToken(pageToken)
		if err == nil {
			for i, n := range matching {
				if n.Id == cursorID {
					startIdx = i + 1
					break
				}
			}
		}
	}

	if startIdx >= len(matching) {
		return nil, "", nil
	}

	matching = matching[startIdx:]
	var nextToken string
	if int32(len(matching)) > pageSize {
		nextToken = EncodePageToken(matching[pageSize-1].Id)
		matching = matching[:pageSize]
	}

	return matching, nextToken, nil
}

func (m *MemoryStore) MarkNotificationRead(ctx context.Context, notificationID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	notification, ok := m.notifications[notificationID]
	if !ok {
		return fmt.Errorf("notification not found: %s", notificationID)
	}

	notification.IsRead = true
	notification.ReadAt = timestamppb.Now()
	return nil
}

func (m *MemoryStore) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := timestamppb.Now()
	for _, notification := range m.notifications {
		if notification.UserId == userID && !notification.IsRead {
			notification.IsRead = true
			notification.ReadAt = now
		}
	}
	return nil
}

func (m *MemoryStore) GetUnreadNotificationCount(ctx context.Context, userID string) (int32, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var count int32
	for _, notification := range m.notifications {
		if notification.UserId == userID && !notification.IsRead {
			count++
		}
	}
	return count, nil
}

func (m *MemoryStore) GetNotificationPreferences(ctx context.Context, userID string) (*pfinancev1.NotificationPreferences, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	prefs, ok := m.notificationPreferences[userID]
	if !ok {
		// Return default preferences
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

	return prefs, nil
}

func (m *MemoryStore) UpdateNotificationPreferences(ctx context.Context, prefs *pfinancev1.NotificationPreferences) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.notificationPreferences[prefs.UserId] = prefs
	return nil
}

func (m *MemoryStore) HasNotification(ctx context.Context, userID string, notifType pfinancev1.NotificationType, referenceID string, metadataKey string, metadataValue string, withinHours int) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	cutoff := time.Time{}
	if withinHours > 0 {
		cutoff = time.Now().Add(-time.Duration(withinHours) * time.Hour)
	}

	for _, n := range m.notifications {
		if n.UserId != userID || n.Type != notifType || n.ReferenceId != referenceID {
			continue
		}
		if withinHours > 0 && n.CreatedAt != nil && n.CreatedAt.AsTime().Before(cutoff) {
			continue
		}
		if metadataKey != "" {
			if n.Metadata == nil || n.Metadata[metadataKey] != metadataValue {
				continue
			}
		}
		return true, nil
	}
	return false, nil
}

// Analytics operations

func (m *MemoryStore) GetDailyAggregates(ctx context.Context, userID, groupID string, startDate, endDate time.Time) ([]*pfinancev1.DailyAggregate, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Map of date string -> aggregate data
	type categoryKey struct {
		date     string
		category pfinancev1.ExpenseCategory
	}
	type dayData struct {
		totalAmount      float64
		totalAmountCents int64
		transactionCount int32
		categoryAmounts  map[pfinancev1.ExpenseCategory]*pfinancev1.CategoryAmount
	}

	days := make(map[string]*dayData)

	for _, expense := range m.expenses {
		if userID != "" && expense.UserId != userID {
			continue
		}
		if groupID != "" && expense.GroupId != groupID {
			continue
		}
		if expense.Date == nil {
			continue
		}

		expenseTime := expense.Date.AsTime()
		if expenseTime.Before(startDate) || expenseTime.After(endDate) {
			continue
		}

		dateStr := expenseTime.Format("2006-01-02")

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
func (m *MemoryStore) CreateCorrectionRecord(ctx context.Context, record *pfinancev1.CorrectionRecord) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if record.Id == "" {
		record.Id = uuid.New().String()
	}
	m.correctionRecords[record.Id] = record
	return nil
}

// ListCorrectionRecords lists correction records for a user
func (m *MemoryStore) ListCorrectionRecords(ctx context.Context, userID string, limit int) ([]*pfinancev1.CorrectionRecord, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var records []*pfinancev1.CorrectionRecord
	for _, r := range m.correctionRecords {
		if r.UserId == userID {
			records = append(records, r)
		}
	}
	sort.Slice(records, func(i, j int) bool {
		if records[i].CreatedAt == nil || records[j].CreatedAt == nil {
			return false
		}
		return records[i].CreatedAt.AsTime().After(records[j].CreatedAt.AsTime())
	})
	if limit > 0 && len(records) > limit {
		records = records[:limit]
	}
	return records, nil
}

// UpsertMerchantMapping creates or updates a merchant mapping
func (m *MemoryStore) UpsertMerchantMapping(ctx context.Context, mapping *pfinancev1.MerchantMapping) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	// Check for existing mapping with same user + raw_pattern
	for id, existing := range m.merchantMappings {
		if existing.UserId == mapping.UserId && strings.EqualFold(existing.RawPattern, mapping.RawPattern) {
			existing.NormalizedName = mapping.NormalizedName
			existing.Category = mapping.Category
			existing.CorrectionCount = mapping.CorrectionCount
			existing.Confidence = mapping.Confidence
			existing.LastUsed = mapping.LastUsed
			m.merchantMappings[id] = existing
			return nil
		}
	}
	if mapping.Id == "" {
		mapping.Id = uuid.New().String()
	}
	m.merchantMappings[mapping.Id] = mapping
	return nil
}

// GetMerchantMappings returns all merchant mappings for a user
func (m *MemoryStore) GetMerchantMappings(ctx context.Context, userID string) ([]*pfinancev1.MerchantMapping, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var mappings []*pfinancev1.MerchantMapping
	for _, mm := range m.merchantMappings {
		if mm.UserId == userID {
			mappings = append(mappings, mm)
		}
	}
	return mappings, nil
}

// CreateExtractionEvent stores an extraction event
func (m *MemoryStore) CreateExtractionEvent(ctx context.Context, event *pfinancev1.ExtractionEvent) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if event.Id == "" {
		event.Id = uuid.New().String()
	}
	m.extractionEvents[event.Id] = event
	return nil
}

// ListExtractionEvents lists extraction events for a user since a given time
func (m *MemoryStore) ListExtractionEvents(ctx context.Context, userID string, since time.Time) ([]*pfinancev1.ExtractionEvent, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var events []*pfinancev1.ExtractionEvent
	for _, e := range m.extractionEvents {
		if e.UserId == userID {
			if e.CreatedAt != nil && e.CreatedAt.AsTime().Before(since) {
				continue
			}
			events = append(events, e)
		}
	}
	sort.Slice(events, func(i, j int) bool {
		if events[i].CreatedAt == nil || events[j].CreatedAt == nil {
			return false
		}
		return events[i].CreatedAt.AsTime().After(events[j].CreatedAt.AsTime())
	})
	return events, nil
}

// ============================================================================
// Tax Deductibility operations
// ============================================================================

// ListDeductibleExpenses returns tax-deductible expenses filtered by date range and optional category
func (m *MemoryStore) ListDeductibleExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, category pfinancev1.TaxDeductionCategory, pageSize int32, pageToken string) ([]*pfinancev1.Expense, string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var matchingIDs []string
	for id, expense := range m.expenses {
		if !expense.IsTaxDeductible {
			continue
		}
		if userID != "" && expense.UserId != userID {
			continue
		}
		if groupID != "" && expense.GroupId != groupID {
			continue
		}
		if category != pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED && expense.TaxDeductionCategory != category {
			continue
		}
		if startDate != nil || endDate != nil {
			expenseTime := expense.Date.AsTime()
			if startDate != nil && expenseTime.Before(*startDate) {
				continue
			}
			if endDate != nil && expenseTime.After(*endDate) {
				continue
			}
		}
		matchingIDs = append(matchingIDs, id)
	}

	paginatedIDs, nextToken := paginateIDs(matchingIDs, pageSize, pageToken)
	result := make([]*pfinancev1.Expense, 0, len(paginatedIDs))
	for _, id := range paginatedIDs {
		result = append(result, m.expenses[id])
	}
	return result, nextToken, nil
}

// AggregateDeductionsByCategory sums deductible expenses by TaxDeductionCategory for a date range
func (m *MemoryStore) AggregateDeductionsByCategory(ctx context.Context, userID, groupID string, startDate, endDate time.Time) ([]*pfinancev1.TaxDeductionSummary, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	type agg struct {
		totalCents   int64
		expenseCount int32
	}
	byCategory := make(map[pfinancev1.TaxDeductionCategory]*agg)

	for _, expense := range m.expenses {
		if !expense.IsTaxDeductible {
			continue
		}
		if userID != "" && expense.UserId != userID {
			continue
		}
		if groupID != "" && expense.GroupId != groupID {
			continue
		}
		if expense.Date != nil {
			t := expense.Date.AsTime()
			if t.Before(startDate) || t.After(endDate) {
				continue
			}
		}

		cat := expense.TaxDeductionCategory
		pct := expense.TaxDeductiblePercent
		if pct <= 0 {
			pct = 1.0
		}

		cents := expense.AmountCents
		if cents == 0 {
			cents = int64(expense.Amount * 100)
		}
		deductibleCents := int64(float64(cents) * pct)

		if _, ok := byCategory[cat]; !ok {
			byCategory[cat] = &agg{}
		}
		byCategory[cat].totalCents += deductibleCents
		byCategory[cat].expenseCount++
	}

	var summaries []*pfinancev1.TaxDeductionSummary
	for cat, a := range byCategory {
		summaries = append(summaries, &pfinancev1.TaxDeductionSummary{
			Category:     cat,
			TotalCents:   a.totalCents,
			TotalAmount:  float64(a.totalCents) / 100.0,
			ExpenseCount: a.expenseCount,
		})
	}
	return summaries, nil
}

// UpsertTaxDeductibilityMapping upserts a tax deductibility mapping
func (m *MemoryStore) UpsertTaxDeductibilityMapping(ctx context.Context, mapping *pfinancev1.TaxDeductibilityMapping) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for id, existing := range m.taxDeductibilityMappings {
		if existing.UserId == mapping.UserId && strings.EqualFold(existing.MerchantPattern, mapping.MerchantPattern) {
			existing.DeductionCategory = mapping.DeductionCategory
			existing.DeductiblePercent = mapping.DeductiblePercent
			existing.ConfirmationCount = mapping.ConfirmationCount
			existing.Confidence = mapping.Confidence
			existing.LastUsed = mapping.LastUsed
			m.taxDeductibilityMappings[id] = existing
			return nil
		}
	}
	if mapping.Id == "" {
		mapping.Id = uuid.New().String()
	}
	m.taxDeductibilityMappings[mapping.Id] = mapping
	return nil
}

// GetTaxDeductibilityMappings returns all tax deductibility mappings for a user
func (m *MemoryStore) GetTaxDeductibilityMappings(ctx context.Context, userID string) ([]*pfinancev1.TaxDeductibilityMapping, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var mappings []*pfinancev1.TaxDeductibilityMapping
	for _, mm := range m.taxDeductibilityMappings {
		if mm.UserId == userID {
			mappings = append(mappings, mm)
		}
	}
	return mappings, nil
}

// ============================================================================
// API Token operations
// ============================================================================

// CreateApiToken stores a new API token
func (m *MemoryStore) CreateApiToken(ctx context.Context, token *pfinancev1.ApiToken) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.apiTokens[token.Id] = token
	return nil
}

// GetApiTokenByHash looks up an active (non-revoked) API token by its hash
func (m *MemoryStore) GetApiTokenByHash(ctx context.Context, tokenHash string) (*pfinancev1.ApiToken, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, t := range m.apiTokens {
		if t.TokenHash == tokenHash && !t.IsRevoked {
			return t, nil
		}
	}
	return nil, fmt.Errorf("api token not found")
}

// ListApiTokens returns all API tokens for a user
func (m *MemoryStore) ListApiTokens(ctx context.Context, userID string) ([]*pfinancev1.ApiToken, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var tokens []*pfinancev1.ApiToken
	for _, t := range m.apiTokens {
		if t.UserId == userID {
			tokens = append(tokens, t)
		}
	}
	return tokens, nil
}

// RevokeApiToken marks an API token as revoked
func (m *MemoryStore) RevokeApiToken(ctx context.Context, tokenID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.apiTokens[tokenID]
	if !ok {
		return fmt.Errorf("api token not found")
	}
	t.IsRevoked = true
	return nil
}

// UpdateApiTokenLastUsed updates the last_used_at timestamp for a token
func (m *MemoryStore) UpdateApiTokenLastUsed(ctx context.Context, tokenID string, lastUsed time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	t, ok := m.apiTokens[tokenID]
	if !ok {
		return fmt.Errorf("api token not found")
	}
	t.LastUsedAt = timestamppb.New(lastUsed)
	return nil
}

// CountActiveApiTokens counts non-revoked tokens for a user
func (m *MemoryStore) CountActiveApiTokens(ctx context.Context, userID string) (int, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, t := range m.apiTokens {
		if t.UserId == userID && !t.IsRevoked {
			count++
		}
	}
	return count, nil
}

// ============================================================================
// Processed Statement operations (dedup)
// ============================================================================

// CreateProcessedStatement stores a processed statement record
func (m *MemoryStore) CreateProcessedStatement(ctx context.Context, stmt *pfinancev1.ProcessedStatement) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if stmt.Id == "" {
		stmt.Id = uuid.New().String()
	}

	m.processedStatements = append(m.processedStatements, stmt)
	return nil
}

// FindProcessedStatement finds a processed statement by userID and fingerprint
func (m *MemoryStore) FindProcessedStatement(ctx context.Context, userID, fingerprint string) (*pfinancev1.ProcessedStatement, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, stmt := range m.processedStatements {
		if stmt.UserId == userID && stmt.Fingerprint == fingerprint {
			return stmt, nil
		}
	}
	return nil, fmt.Errorf("processed statement not found for fingerprint: %s", fingerprint)
}

// FindOverlappingStatements finds statements that overlap with the given period
func (m *MemoryStore) FindOverlappingStatements(ctx context.Context, userID, bankName, accountID string, periodStart, periodEnd time.Time) ([]*pfinancev1.ProcessedStatement, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var results []*pfinancev1.ProcessedStatement
	for _, stmt := range m.processedStatements {
		if stmt.UserId != userID || stmt.BankName != bankName || stmt.AccountIdentifier != accountID {
			continue
		}

		// Parse stored period dates
		existingStart, err := time.Parse("2006-01-02", stmt.PeriodStart)
		if err != nil {
			continue
		}
		existingEnd, err := time.Parse("2006-01-02", stmt.PeriodEnd)
		if err != nil {
			continue
		}

		// Check overlap: periodStart <= existingEnd AND periodEnd >= existingStart
		if !periodStart.After(existingEnd) && !periodEnd.Before(existingStart) {
			results = append(results, stmt)
		}
	}
	return results, nil
}
