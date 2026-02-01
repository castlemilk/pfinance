package store

import (
	"context"
	"fmt"
	"sync"
	"time"

	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/google/uuid"
)

// MemoryStore implements Store interface with in-memory storage
type MemoryStore struct {
	mu sync.RWMutex

	// Storage maps
	expenses            map[string]*pfinancev1.Expense
	incomes             map[string]*pfinancev1.Income
	groups              map[string]*pfinancev1.FinanceGroup
	invitations         map[string]*pfinancev1.GroupInvitation
	inviteLinks         map[string]*pfinancev1.GroupInviteLink
	contributions       map[string]*pfinancev1.ExpenseContribution
	incomeContributions map[string]*pfinancev1.IncomeContribution
	taxConfigs          map[string]*pfinancev1.TaxConfig
	budgets             map[string]*pfinancev1.Budget
	users               map[string]*pfinancev1.User
}

// NewMemoryStore creates a new in-memory store
func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		expenses:            make(map[string]*pfinancev1.Expense),
		incomes:             make(map[string]*pfinancev1.Income),
		groups:              make(map[string]*pfinancev1.FinanceGroup),
		invitations:         make(map[string]*pfinancev1.GroupInvitation),
		inviteLinks:         make(map[string]*pfinancev1.GroupInviteLink),
		contributions:       make(map[string]*pfinancev1.ExpenseContribution),
		incomeContributions: make(map[string]*pfinancev1.IncomeContribution),
		taxConfigs:          make(map[string]*pfinancev1.TaxConfig),
		budgets:             make(map[string]*pfinancev1.Budget),
		users:               make(map[string]*pfinancev1.User),
	}
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

func (m *MemoryStore) ListExpenses(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Expense, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.Expense

	for _, expense := range m.expenses {
		// Filter by user or group
		if userID != "" && expense.UserId != userID {
			continue
		}
		if groupID != "" && expense.GroupId != groupID {
			continue
		}

		// Filter by date range if provided
		if startDate != nil || endDate != nil {
			expenseTime := expense.Date.AsTime()
			if startDate != nil && expenseTime.Before(*startDate) {
				continue
			}
			if endDate != nil && expenseTime.After(*endDate) {
				continue
			}
		}

		result = append(result, expense)

		// Limit by page size
		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListIncomes(ctx context.Context, userID, groupID string, startDate, endDate *time.Time, pageSize int32) ([]*pfinancev1.Income, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.Income

	for _, income := range m.incomes {
		// Filter by user or group
		if userID != "" && income.UserId != userID {
			continue
		}
		if groupID != "" && income.GroupId != groupID {
			continue
		}

		// Filter by date range if provided
		if startDate != nil || endDate != nil {
			incomeTime := income.Date.AsTime()
			if startDate != nil && incomeTime.Before(*startDate) {
				continue
			}
			if endDate != nil && incomeTime.After(*endDate) {
				continue
			}
		}

		result = append(result, income)

		// Limit by page size
		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListGroups(ctx context.Context, userID string, pageSize int32) ([]*pfinancev1.FinanceGroup, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.FinanceGroup

	for _, group := range m.groups {
		// Check if user is a member
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

		result = append(result, group)

		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListInvitations(ctx context.Context, userEmail string, status *pfinancev1.InvitationStatus, pageSize int32) ([]*pfinancev1.GroupInvitation, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.GroupInvitation

	for _, invitation := range m.invitations {
		if invitation.InviteeEmail != userEmail {
			continue
		}

		if status != nil && invitation.Status != *status {
			continue
		}

		result = append(result, invitation)

		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListInviteLinks(ctx context.Context, groupID string, includeInactive bool, pageSize int32) ([]*pfinancev1.GroupInviteLink, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.GroupInviteLink

	for _, link := range m.inviteLinks {
		if groupID != "" && link.GroupId != groupID {
			continue
		}

		if !includeInactive && !link.IsActive {
			continue
		}

		result = append(result, link)

		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListContributions(ctx context.Context, groupID, userID string, pageSize int32) ([]*pfinancev1.ExpenseContribution, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.ExpenseContribution

	for _, contribution := range m.contributions {
		if groupID != "" && contribution.TargetGroupId != groupID {
			continue
		}
		if userID != "" && contribution.ContributedBy != userID {
			continue
		}

		result = append(result, contribution)

		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListIncomeContributions(ctx context.Context, groupID, userID string, pageSize int32) ([]*pfinancev1.IncomeContribution, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.IncomeContribution

	for _, contribution := range m.incomeContributions {
		if groupID != "" && contribution.TargetGroupId != groupID {
			continue
		}
		if userID != "" && contribution.ContributedBy != userID {
			continue
		}

		result = append(result, contribution)

		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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

func (m *MemoryStore) ListBudgets(ctx context.Context, userID, groupID string, includeInactive bool, pageSize int32) ([]*pfinancev1.Budget, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*pfinancev1.Budget

	for _, budget := range m.budgets {
		if userID != "" && budget.UserId != userID {
			continue
		}
		if groupID != "" && budget.GroupId != groupID {
			continue
		}

		if !includeInactive && !budget.IsActive {
			continue
		}

		result = append(result, budget)

		if pageSize > 0 && int32(len(result)) >= pageSize {
			break
		}
	}

	return result, nil
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
		// IsOverBudget field removed from proto, calculate on frontend
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
