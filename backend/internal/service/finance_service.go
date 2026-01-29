package service

import (
	"context"
	"fmt"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type FinanceService struct {
	pfinancev1connect.UnimplementedFinanceServiceHandler
	store store.Store
}

func NewFinanceService(store store.Store) *FinanceService {
	return &FinanceService{
		store: store,
	}
}

// CreateExpense creates a new expense
func (s *FinanceService) CreateExpense(ctx context.Context, req *connect.Request[pfinancev1.CreateExpenseRequest]) (*connect.Response[pfinancev1.CreateExpenseResponse], error) {
	// Default paid_by_user_id to user_id if not specified
	paidByUserId := req.Msg.PaidByUserId
	if paidByUserId == "" {
		paidByUserId = req.Msg.UserId
	}

	expense := &pfinancev1.Expense{
		Id:           uuid.New().String(),
		UserId:       req.Msg.UserId,
		GroupId:      req.Msg.GroupId,
		Description:  req.Msg.Description,
		Amount:       req.Msg.Amount,
		Category:     req.Msg.Category,
		Frequency:    req.Msg.Frequency,
		Date:         req.Msg.Date,
		CreatedAt:    timestamppb.Now(),
		UpdatedAt:    timestamppb.Now(),
		PaidByUserId: paidByUserId,
		SplitType:    req.Msg.SplitType,
		Tags:         req.Msg.Tags,
		IsSettled:    false,
	}

	// Calculate allocations based on split type
	if req.Msg.SplitType != pfinancev1.SplitType_SPLIT_TYPE_UNSPECIFIED {
		allocations, err := s.calculateAllocations(req.Msg)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate allocations: %w", err)
		}
		expense.Allocations = allocations
	}

	if err := s.store.CreateExpense(ctx, expense); err != nil {
		return nil, fmt.Errorf("failed to create expense: %w", err)
	}

	return connect.NewResponse(&pfinancev1.CreateExpenseResponse{
		Expense: expense,
	}), nil
}

// ListExpenses lists expenses for a user or group
func (s *FinanceService) ListExpenses(ctx context.Context, req *connect.Request[pfinancev1.ListExpensesRequest]) (*connect.Response[pfinancev1.ListExpensesResponse], error) {
	var startTime, endTime *time.Time
	if req.Msg.StartDate != nil {
		t := req.Msg.StartDate.AsTime()
		startTime = &t
	}
	if req.Msg.EndDate != nil {
		t := req.Msg.EndDate.AsTime()
		endTime = &t
	}

	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	expenses, err := s.store.ListExpenses(ctx, req.Msg.UserId, req.Msg.GroupId, startTime, endTime, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list expenses: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListExpensesResponse{
		Expenses: expenses,
		// TODO: Implement pagination token
	}), nil
}

// CreateGroup creates a new finance group
func (s *FinanceService) CreateGroup(ctx context.Context, req *connect.Request[pfinancev1.CreateGroupRequest]) (*connect.Response[pfinancev1.CreateGroupResponse], error) {
	group := &pfinancev1.FinanceGroup{
		Id:          uuid.New().String(),
		Name:        req.Msg.Name,
		Description: req.Msg.Description,
		OwnerId:     req.Msg.OwnerId,
		MemberIds:   []string{req.Msg.OwnerId},
		Members: []*pfinancev1.GroupMember{
			{
				UserId:   req.Msg.OwnerId,
				Role:     pfinancev1.GroupRole_GROUP_ROLE_OWNER,
				JoinedAt: timestamppb.Now(),
			},
		},
		CreatedAt: timestamppb.Now(),
		UpdatedAt: timestamppb.Now(),
	}

	if err := s.store.CreateGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to create group: %w", err)
	}

	return connect.NewResponse(&pfinancev1.CreateGroupResponse{
		Group: group,
	}), nil
}

// InviteToGroup creates an invitation to join a group
func (s *FinanceService) InviteToGroup(ctx context.Context, req *connect.Request[pfinancev1.InviteToGroupRequest]) (*connect.Response[pfinancev1.InviteToGroupResponse], error) {
	// TODO: Add validation to ensure inviter has permission to invite

	invitation := &pfinancev1.GroupInvitation{
		Id:           uuid.New().String(),
		GroupId:      req.Msg.GroupId,
		InviterId:    req.Msg.InviterId,
		InviteeEmail: req.Msg.InviteeEmail,
		Role:         req.Msg.Role,
		Status:       pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING,
		CreatedAt:    timestamppb.Now(),
		ExpiresAt:    timestamppb.New(timestamppb.Now().AsTime().AddDate(0, 0, 7)), // 7 days expiry
	}

	if err := s.store.CreateInvitation(ctx, invitation); err != nil {
		return nil, fmt.Errorf("failed to create invitation: %w", err)
	}

	// TODO: Send email notification to invitee

	return connect.NewResponse(&pfinancev1.InviteToGroupResponse{
		Invitation: invitation,
	}), nil
}

// AcceptInvitation accepts a group invitation
func (s *FinanceService) AcceptInvitation(ctx context.Context, req *connect.Request[pfinancev1.AcceptInvitationRequest]) (*connect.Response[pfinancev1.AcceptInvitationResponse], error) {
	// Get the invitation
	invitation, err := s.store.GetInvitation(ctx, req.Msg.InvitationId)
	if err != nil {
		return nil, fmt.Errorf("failed to get invitation: %w", err)
	}

	// Check if invitation is still pending
	if invitation.Status != pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING {
		return nil, fmt.Errorf("invitation is no longer pending")
	}

	// Check if invitation is expired
	if invitation.ExpiresAt.AsTime().Before(timestamppb.Now().AsTime()) {
		return nil, fmt.Errorf("invitation has expired")
	}

	// Get the group
	group, err := s.store.GetGroup(ctx, invitation.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	// Add user to group
	newMember := &pfinancev1.GroupMember{
		UserId:   req.Msg.UserId,
		Email:    invitation.InviteeEmail,
		Role:     invitation.Role,
		JoinedAt: timestamppb.Now(),
	}

	group.MemberIds = append(group.MemberIds, req.Msg.UserId)
	group.Members = append(group.Members, newMember)
	group.UpdatedAt = timestamppb.Now()

	// Update group
	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to update group: %w", err)
	}

	// Update invitation status
	invitation.Status = pfinancev1.InvitationStatus_INVITATION_STATUS_ACCEPTED
	if err := s.store.UpdateInvitation(ctx, invitation); err != nil {
		return nil, fmt.Errorf("failed to update invitation: %w", err)
	}

	return connect.NewResponse(&pfinancev1.AcceptInvitationResponse{
		Group: group,
	}), nil
}

// CreateIncome creates a new income entry
func (s *FinanceService) CreateIncome(ctx context.Context, req *connect.Request[pfinancev1.CreateIncomeRequest]) (*connect.Response[pfinancev1.CreateIncomeResponse], error) {
	income := &pfinancev1.Income{
		Id:         uuid.New().String(),
		UserId:     req.Msg.UserId,
		GroupId:    req.Msg.GroupId,
		Source:     req.Msg.Source,
		Amount:     req.Msg.Amount,
		Frequency:  req.Msg.Frequency,
		TaxStatus:  req.Msg.TaxStatus,
		Deductions: req.Msg.Deductions,
		Date:       req.Msg.Date,
		CreatedAt:  timestamppb.Now(),
		UpdatedAt:  timestamppb.Now(),
	}

	if err := s.store.CreateIncome(ctx, income); err != nil {
		return nil, fmt.Errorf("failed to create income: %w", err)
	}

	return connect.NewResponse(&pfinancev1.CreateIncomeResponse{
		Income: income,
	}), nil
}

// GetTaxConfig gets tax configuration for a user or group
func (s *FinanceService) GetTaxConfig(ctx context.Context, req *connect.Request[pfinancev1.GetTaxConfigRequest]) (*connect.Response[pfinancev1.GetTaxConfigResponse], error) {
	taxConfig, err := s.store.GetTaxConfig(ctx, req.Msg.UserId, req.Msg.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get tax config: %w", err)
	}

	return connect.NewResponse(&pfinancev1.GetTaxConfigResponse{
		TaxConfig: taxConfig,
	}), nil
}

// ListGroups lists groups for a user
func (s *FinanceService) ListGroups(ctx context.Context, req *connect.Request[pfinancev1.ListGroupsRequest]) (*connect.Response[pfinancev1.ListGroupsResponse], error) {
	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	groups, err := s.store.ListGroups(ctx, req.Msg.UserId, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list groups: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListGroupsResponse{
		Groups: groups,
		// TODO: Implement pagination token
	}), nil
}

// ListInvitations lists invitations for a user
func (s *FinanceService) ListInvitations(ctx context.Context, req *connect.Request[pfinancev1.ListInvitationsRequest]) (*connect.Response[pfinancev1.ListInvitationsResponse], error) {
	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	var status *pfinancev1.InvitationStatus
	if req.Msg.Status != pfinancev1.InvitationStatus_INVITATION_STATUS_UNSPECIFIED {
		status = &req.Msg.Status
	}

	invitations, err := s.store.ListInvitations(ctx, req.Msg.UserEmail, status, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list invitations: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListInvitationsResponse{
		Invitations: invitations,
		// TODO: Implement pagination token
	}), nil
}

// UpdateExpense updates an existing expense
func (s *FinanceService) UpdateExpense(ctx context.Context, req *connect.Request[pfinancev1.UpdateExpenseRequest]) (*connect.Response[pfinancev1.UpdateExpenseResponse], error) {
	// Get existing expense
	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, fmt.Errorf("failed to get expense: %w", err)
	}

	// Update fields
	if req.Msg.Description != "" {
		expense.Description = req.Msg.Description
	}
	if req.Msg.Amount > 0 {
		expense.Amount = req.Msg.Amount
	}
	if req.Msg.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
		expense.Category = req.Msg.Category
	}
	if req.Msg.Frequency != pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED {
		expense.Frequency = req.Msg.Frequency
	}
	if req.Msg.PaidByUserId != "" {
		expense.PaidByUserId = req.Msg.PaidByUserId
	}
	if req.Msg.SplitType != pfinancev1.SplitType_SPLIT_TYPE_UNSPECIFIED {
		expense.SplitType = req.Msg.SplitType
	}
	if len(req.Msg.Tags) > 0 {
		expense.Tags = req.Msg.Tags
	}

	// Recalculate allocations if split type or amount changed
	if req.Msg.SplitType != pfinancev1.SplitType_SPLIT_TYPE_UNSPECIFIED || req.Msg.Amount > 0 {
		// Create a temporary CreateExpenseRequest for allocation calculation
		createReq := &pfinancev1.CreateExpenseRequest{
			UserId:           expense.UserId,
			Amount:           expense.Amount,
			SplitType:        expense.SplitType,
			PaidByUserId:     expense.PaidByUserId,
			AllocatedUserIds: req.Msg.AllocatedUserIds,
			Allocations:      req.Msg.Allocations,
		}

		allocations, err := s.calculateAllocations(createReq)
		if err != nil {
			return nil, fmt.Errorf("failed to calculate allocations: %w", err)
		}
		expense.Allocations = allocations
	}

	expense.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateExpense(ctx, expense); err != nil {
		return nil, fmt.Errorf("failed to update expense: %w", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateExpenseResponse{
		Expense: expense,
	}), nil
}

func (s *FinanceService) DeleteExpense(ctx context.Context, req *connect.Request[pfinancev1.DeleteExpenseRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.store.DeleteExpense(ctx, req.Msg.ExpenseId); err != nil {
		return nil, fmt.Errorf("failed to delete expense: %w", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) BatchCreateExpenses(ctx context.Context, req *connect.Request[pfinancev1.BatchCreateExpensesRequest]) (*connect.Response[pfinancev1.BatchCreateExpensesResponse], error) {
	expenses := make([]*pfinancev1.Expense, 0, len(req.Msg.Expenses))

	for _, expReq := range req.Msg.Expenses {
		paidByUserId := expReq.PaidByUserId
		if paidByUserId == "" {
			paidByUserId = expReq.UserId
		}

		expense := &pfinancev1.Expense{
			Id:           uuid.New().String(),
			UserId:       expReq.UserId,
			GroupId:      req.Msg.GroupId,
			Description:  expReq.Description,
			Amount:       expReq.Amount,
			Category:     expReq.Category,
			Frequency:    expReq.Frequency,
			Date:         expReq.Date,
			CreatedAt:    timestamppb.Now(),
			UpdatedAt:    timestamppb.Now(),
			PaidByUserId: paidByUserId,
			SplitType:    expReq.SplitType,
			Tags:         expReq.Tags,
			IsSettled:    false,
		}

		if expReq.SplitType != pfinancev1.SplitType_SPLIT_TYPE_UNSPECIFIED {
			allocations, err := s.calculateAllocations(expReq)
			if err != nil {
				return nil, fmt.Errorf("failed to calculate allocations: %w", err)
			}
			expense.Allocations = allocations
		}

		if err := s.store.CreateExpense(ctx, expense); err != nil {
			return nil, fmt.Errorf("failed to create expense: %w", err)
		}

		expenses = append(expenses, expense)
	}

	return connect.NewResponse(&pfinancev1.BatchCreateExpensesResponse{
		Expenses: expenses,
	}), nil
}

func (s *FinanceService) GetUser(ctx context.Context, req *connect.Request[pfinancev1.GetUserRequest]) (*connect.Response[pfinancev1.GetUserResponse], error) {
	// For now, return a basic user object based on the ID
	// In a real implementation, this would fetch from a user store
	return connect.NewResponse(&pfinancev1.GetUserResponse{
		User: &pfinancev1.User{
			Id: req.Msg.UserId,
		},
	}), nil
}

func (s *FinanceService) UpdateUser(ctx context.Context, req *connect.Request[pfinancev1.UpdateUserRequest]) (*connect.Response[pfinancev1.UpdateUserResponse], error) {
	// For now, return the updated user
	// In a real implementation, this would update the user store
	return connect.NewResponse(&pfinancev1.UpdateUserResponse{
		User: &pfinancev1.User{
			Id:          req.Msg.UserId,
			DisplayName: req.Msg.DisplayName,
			UpdatedAt:   timestamppb.Now(),
		},
	}), nil
}

func (s *FinanceService) UpdateIncome(ctx context.Context, req *connect.Request[pfinancev1.UpdateIncomeRequest]) (*connect.Response[pfinancev1.UpdateIncomeResponse], error) {
	income, err := s.store.GetIncome(ctx, req.Msg.IncomeId)
	if err != nil {
		return nil, fmt.Errorf("failed to get income: %w", err)
	}

	if req.Msg.Source != "" {
		income.Source = req.Msg.Source
	}
	if req.Msg.Amount > 0 {
		income.Amount = req.Msg.Amount
	}
	if req.Msg.Frequency != pfinancev1.IncomeFrequency_INCOME_FREQUENCY_UNSPECIFIED {
		income.Frequency = req.Msg.Frequency
	}
	if req.Msg.TaxStatus != pfinancev1.TaxStatus_TAX_STATUS_UNSPECIFIED {
		income.TaxStatus = req.Msg.TaxStatus
	}
	if len(req.Msg.Deductions) > 0 {
		income.Deductions = req.Msg.Deductions
	}
	income.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateIncome(ctx, income); err != nil {
		return nil, fmt.Errorf("failed to update income: %w", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateIncomeResponse{
		Income: income,
	}), nil
}

func (s *FinanceService) DeleteIncome(ctx context.Context, req *connect.Request[pfinancev1.DeleteIncomeRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.store.DeleteIncome(ctx, req.Msg.IncomeId); err != nil {
		return nil, fmt.Errorf("failed to delete income: %w", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) ListIncomes(ctx context.Context, req *connect.Request[pfinancev1.ListIncomesRequest]) (*connect.Response[pfinancev1.ListIncomesResponse], error) {
	var startTime, endTime *time.Time
	if req.Msg.StartDate != nil {
		t := req.Msg.StartDate.AsTime()
		startTime = &t
	}
	if req.Msg.EndDate != nil {
		t := req.Msg.EndDate.AsTime()
		endTime = &t
	}

	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	incomes, err := s.store.ListIncomes(ctx, req.Msg.UserId, req.Msg.GroupId, startTime, endTime, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list incomes: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListIncomesResponse{
		Incomes: incomes,
	}), nil
}

func (s *FinanceService) UpdateTaxConfig(ctx context.Context, req *connect.Request[pfinancev1.UpdateTaxConfigRequest]) (*connect.Response[pfinancev1.UpdateTaxConfigResponse], error) {
	if err := s.store.UpdateTaxConfig(ctx, req.Msg.UserId, req.Msg.GroupId, req.Msg.TaxConfig); err != nil {
		return nil, fmt.Errorf("failed to update tax config: %w", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateTaxConfigResponse{
		TaxConfig: req.Msg.TaxConfig,
	}), nil
}

// Budget operations

// CreateBudget creates a new budget
func (s *FinanceService) CreateBudget(ctx context.Context, req *connect.Request[pfinancev1.CreateBudgetRequest]) (*connect.Response[pfinancev1.CreateBudgetResponse], error) {
	budget := &pfinancev1.Budget{
		Id:          uuid.New().String(),
		UserId:      req.Msg.UserId,
		GroupId:     req.Msg.GroupId,
		Name:        req.Msg.Name,
		Description: req.Msg.Description,
		Amount:      req.Msg.Amount,
		Period:      req.Msg.Period,
		CategoryIds: req.Msg.CategoryIds,
		IsActive:    true,
		StartDate:   req.Msg.StartDate,
		EndDate:     req.Msg.EndDate,
		CreatedAt:   timestamppb.Now(),
		UpdatedAt:   timestamppb.Now(),
	}

	if err := s.store.CreateBudget(ctx, budget); err != nil {
		return nil, fmt.Errorf("failed to create budget: %w", err)
	}

	return connect.NewResponse(&pfinancev1.CreateBudgetResponse{
		Budget: budget,
	}), nil
}

// GetBudget retrieves a budget by ID
func (s *FinanceService) GetBudget(ctx context.Context, req *connect.Request[pfinancev1.GetBudgetRequest]) (*connect.Response[pfinancev1.GetBudgetResponse], error) {
	budget, err := s.store.GetBudget(ctx, req.Msg.BudgetId)
	if err != nil {
		return nil, fmt.Errorf("failed to get budget: %w", err)
	}

	return connect.NewResponse(&pfinancev1.GetBudgetResponse{
		Budget: budget,
	}), nil
}

// UpdateBudget updates an existing budget
func (s *FinanceService) UpdateBudget(ctx context.Context, req *connect.Request[pfinancev1.UpdateBudgetRequest]) (*connect.Response[pfinancev1.UpdateBudgetResponse], error) {
	// Get existing budget to preserve fields not being updated
	existing, err := s.store.GetBudget(ctx, req.Msg.BudgetId)
	if err != nil {
		return nil, fmt.Errorf("failed to get existing budget: %w", err)
	}

	// Update fields
	existing.Name = req.Msg.Name
	existing.Description = req.Msg.Description
	existing.Amount = req.Msg.Amount
	existing.Period = req.Msg.Period
	existing.CategoryIds = req.Msg.CategoryIds
	existing.IsActive = req.Msg.IsActive
	if req.Msg.EndDate != nil {
		existing.EndDate = req.Msg.EndDate
	}
	existing.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateBudget(ctx, existing); err != nil {
		return nil, fmt.Errorf("failed to update budget: %w", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateBudgetResponse{
		Budget: existing,
	}), nil
}

// DeleteBudget deletes a budget
func (s *FinanceService) DeleteBudget(ctx context.Context, req *connect.Request[pfinancev1.DeleteBudgetRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.store.DeleteBudget(ctx, req.Msg.BudgetId); err != nil {
		return nil, fmt.Errorf("failed to delete budget: %w", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

// ListBudgets lists budgets for a user or group
func (s *FinanceService) ListBudgets(ctx context.Context, req *connect.Request[pfinancev1.ListBudgetsRequest]) (*connect.Response[pfinancev1.ListBudgetsResponse], error) {
	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	budgets, err := s.store.ListBudgets(ctx, req.Msg.UserId, req.Msg.GroupId, req.Msg.IncludeInactive, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list budgets: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListBudgetsResponse{
		Budgets: budgets,
		// TODO: Implement pagination token
	}), nil
}

// GetBudgetProgress gets the current progress of a budget
func (s *FinanceService) GetBudgetProgress(ctx context.Context, req *connect.Request[pfinancev1.GetBudgetProgressRequest]) (*connect.Response[pfinancev1.GetBudgetProgressResponse], error) {
	asOfDate := time.Now()
	if req.Msg.AsOfDate != nil {
		asOfDate = req.Msg.AsOfDate.AsTime()
	}

	progress, err := s.store.GetBudgetProgress(ctx, req.Msg.BudgetId, asOfDate)
	if err != nil {
		return nil, fmt.Errorf("failed to get budget progress: %w", err)
	}

	return connect.NewResponse(&pfinancev1.GetBudgetProgressResponse{
		Progress: progress,
	}), nil
}

func (s *FinanceService) GetGroup(ctx context.Context, req *connect.Request[pfinancev1.GetGroupRequest]) (*connect.Response[pfinancev1.GetGroupResponse], error) {
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	return connect.NewResponse(&pfinancev1.GetGroupResponse{
		Group: group,
	}), nil
}

func (s *FinanceService) UpdateGroup(ctx context.Context, req *connect.Request[pfinancev1.UpdateGroupRequest]) (*connect.Response[pfinancev1.UpdateGroupResponse], error) {
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	if req.Msg.Name != "" {
		group.Name = req.Msg.Name
	}
	if req.Msg.Description != "" {
		group.Description = req.Msg.Description
	}
	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to update group: %w", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateGroupResponse{
		Group: group,
	}), nil
}

func (s *FinanceService) DeleteGroup(ctx context.Context, req *connect.Request[pfinancev1.DeleteGroupRequest]) (*connect.Response[emptypb.Empty], error) {
	if err := s.store.DeleteGroup(ctx, req.Msg.GroupId); err != nil {
		return nil, fmt.Errorf("failed to delete group: %w", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) DeclineInvitation(ctx context.Context, req *connect.Request[pfinancev1.DeclineInvitationRequest]) (*connect.Response[emptypb.Empty], error) {
	invitation, err := s.store.GetInvitation(ctx, req.Msg.InvitationId)
	if err != nil {
		return nil, fmt.Errorf("failed to get invitation: %w", err)
	}

	invitation.Status = pfinancev1.InvitationStatus_INVITATION_STATUS_DECLINED
	if err := s.store.UpdateInvitation(ctx, invitation); err != nil {
		return nil, fmt.Errorf("failed to update invitation: %w", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) RemoveFromGroup(ctx context.Context, req *connect.Request[pfinancev1.RemoveFromGroupRequest]) (*connect.Response[emptypb.Empty], error) {
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	// Remove user from member IDs
	newMemberIds := make([]string, 0, len(group.MemberIds))
	for _, id := range group.MemberIds {
		if id != req.Msg.UserId {
			newMemberIds = append(newMemberIds, id)
		}
	}
	group.MemberIds = newMemberIds

	// Remove user from members list
	newMembers := make([]*pfinancev1.GroupMember, 0, len(group.Members))
	for _, member := range group.Members {
		if member.UserId != req.Msg.UserId {
			newMembers = append(newMembers, member)
		}
	}
	group.Members = newMembers
	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to update group: %w", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) UpdateMemberRole(ctx context.Context, req *connect.Request[pfinancev1.UpdateMemberRoleRequest]) (*connect.Response[pfinancev1.UpdateMemberRoleResponse], error) {
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	var updatedMember *pfinancev1.GroupMember
	for _, member := range group.Members {
		if member.UserId == req.Msg.UserId {
			member.Role = req.Msg.NewRole
			updatedMember = member
			break
		}
	}

	if updatedMember == nil {
		return nil, fmt.Errorf("member not found in group")
	}

	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to update group: %w", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateMemberRoleResponse{
		Member: updatedMember,
	}), nil
}

// calculateAllocations calculates expense allocations based on split type
func (s *FinanceService) calculateAllocations(req *pfinancev1.CreateExpenseRequest) ([]*pfinancev1.ExpenseAllocation, error) {
	// If custom allocations are provided, validate and use them
	if len(req.Allocations) > 0 {
		// Validate allocations sum to total amount for AMOUNT split type
		if req.SplitType == pfinancev1.SplitType_SPLIT_TYPE_AMOUNT {
			var total float64
			for _, alloc := range req.Allocations {
				total += alloc.Amount
			}
			if total != req.Amount {
				return nil, fmt.Errorf("allocations sum (%f) does not match expense amount (%f)", total, req.Amount)
			}
		}
		return req.Allocations, nil
	}

	// Calculate allocations based on split type
	allocatedUserIds := req.AllocatedUserIds
	if len(allocatedUserIds) == 0 {
		// Default to just the payer if no users specified
		allocatedUserIds = []string{req.PaidByUserId}
		if req.PaidByUserId == "" {
			allocatedUserIds = []string{req.UserId}
		}
	}

	allocations := make([]*pfinancev1.ExpenseAllocation, 0, len(allocatedUserIds))

	switch req.SplitType {
	case pfinancev1.SplitType_SPLIT_TYPE_EQUAL:
		// Split equally among all allocated users
		shareAmount := req.Amount / float64(len(allocatedUserIds))
		for _, userId := range allocatedUserIds {
			allocations = append(allocations, &pfinancev1.ExpenseAllocation{
				UserId: userId,
				Amount: shareAmount,
				IsPaid: false,
			})
		}

	case pfinancev1.SplitType_SPLIT_TYPE_PERCENTAGE:
		// Percentage-based split requires custom allocations
		return nil, fmt.Errorf("percentage split requires custom allocations with percentages")

	case pfinancev1.SplitType_SPLIT_TYPE_SHARES:
		// Share-based split requires custom allocations
		return nil, fmt.Errorf("share-based split requires custom allocations with share counts")

	default:
		return nil, fmt.Errorf("unsupported split type: %v", req.SplitType)
	}

	return allocations, nil
}

// GetMemberBalances calculates member balances for a group
func (s *FinanceService) GetMemberBalances(ctx context.Context, req *connect.Request[pfinancev1.GetMemberBalancesRequest]) (*connect.Response[pfinancev1.GetMemberBalancesResponse], error) {
	var startTime, endTime *time.Time
	if req.Msg.StartDate != nil {
		t := req.Msg.StartDate.AsTime()
		startTime = &t
	}
	if req.Msg.EndDate != nil {
		t := req.Msg.EndDate.AsTime()
		endTime = &t
	}

	expenses, err := s.store.ListExpenses(ctx, "", req.Msg.GroupId, startTime, endTime, 1000)
	if err != nil {
		return nil, fmt.Errorf("failed to list expenses: %w", err)
	}

	// Calculate balances: for each user, track total paid vs total owed
	userPaid := make(map[string]float64)
	userOwed := make(map[string]float64)
	totalExpenses := 0.0

	for _, expense := range expenses {
		totalExpenses += expense.Amount

		// Track what each user paid
		userPaid[expense.PaidByUserId] += expense.Amount

		// Track what each user owes based on allocations
		for _, alloc := range expense.Allocations {
			if !alloc.IsPaid {
				userOwed[alloc.UserId] += alloc.Amount
			}
		}
	}

	// Calculate debts between members
	balances := make([]*pfinancev1.MemberBalance, 0)
	for userID := range userPaid {
		paid := userPaid[userID]
		owed := userOwed[userID]
		balance := paid - owed // Positive = owed money, Negative = owes money

		memberBalance := &pfinancev1.MemberBalance{
			UserId:    userID,
			GroupId:   req.Msg.GroupId,
			TotalPaid: paid,
			TotalOwed: owed,
			Balance:   balance,
			Debts:     make([]*pfinancev1.MemberDebt, 0),
		}

		balances = append(balances, memberBalance)
	}

	// Add users who owe but haven't paid
	for userID := range userOwed {
		if _, exists := userPaid[userID]; !exists {
			owed := userOwed[userID]
			memberBalance := &pfinancev1.MemberBalance{
				UserId:    userID,
				GroupId:   req.Msg.GroupId,
				TotalPaid: 0,
				TotalOwed: owed,
				Balance:   -owed,
				Debts:     make([]*pfinancev1.MemberDebt, 0),
			}
			balances = append(balances, memberBalance)
		}
	}

	return connect.NewResponse(&pfinancev1.GetMemberBalancesResponse{
		Balances:           balances,
		TotalGroupExpenses: totalExpenses,
	}), nil
}

// SettleExpense marks an expense allocation as settled
func (s *FinanceService) SettleExpense(ctx context.Context, req *connect.Request[pfinancev1.SettleExpenseRequest]) (*connect.Response[pfinancev1.SettleExpenseResponse], error) {
	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, fmt.Errorf("failed to get expense: %w", err)
	}

	var updatedAllocation *pfinancev1.ExpenseAllocation
	allSettled := true

	for _, alloc := range expense.Allocations {
		if alloc.UserId == req.Msg.UserId {
			alloc.IsPaid = true
			alloc.PaidAt = timestamppb.Now()
			updatedAllocation = alloc
		}
		if !alloc.IsPaid {
			allSettled = false
		}
	}

	if updatedAllocation == nil {
		return nil, fmt.Errorf("user allocation not found for expense")
	}

	expense.IsSettled = allSettled
	expense.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateExpense(ctx, expense); err != nil {
		return nil, fmt.Errorf("failed to update expense: %w", err)
	}

	return connect.NewResponse(&pfinancev1.SettleExpenseResponse{
		Expense:           expense,
		UpdatedAllocation: updatedAllocation,
	}), nil
}

// GetGroupSummary gets a summary of group finances
func (s *FinanceService) GetGroupSummary(ctx context.Context, req *connect.Request[pfinancev1.GetGroupSummaryRequest]) (*connect.Response[pfinancev1.GetGroupSummaryResponse], error) {
	var startTime, endTime *time.Time
	if req.Msg.StartDate != nil {
		t := req.Msg.StartDate.AsTime()
		startTime = &t
	}
	if req.Msg.EndDate != nil {
		t := req.Msg.EndDate.AsTime()
		endTime = &t
	}

	expenses, err := s.store.ListExpenses(ctx, "", req.Msg.GroupId, startTime, endTime, 1000)
	if err != nil {
		return nil, fmt.Errorf("failed to list expenses: %w", err)
	}

	incomes, err := s.store.ListIncomes(ctx, "", req.Msg.GroupId, startTime, endTime, 1000)
	if err != nil {
		return nil, fmt.Errorf("failed to list incomes: %w", err)
	}

	// Calculate totals
	totalExpenses := 0.0
	totalIncome := 0.0
	unsettledCount := 0
	unsettledAmount := 0.0
	categoryBreakdown := make(map[pfinancev1.ExpenseCategory]float64)

	for _, expense := range expenses {
		totalExpenses += expense.Amount
		categoryBreakdown[expense.Category] += expense.Amount

		if !expense.IsSettled {
			unsettledCount++
			for _, alloc := range expense.Allocations {
				if !alloc.IsPaid {
					unsettledAmount += alloc.Amount
				}
			}
		}
	}

	for _, income := range incomes {
		totalIncome += income.Amount
	}

	// Build category breakdown
	expenseByCategory := make([]*pfinancev1.ExpenseBreakdown, 0, len(categoryBreakdown))
	for cat, amount := range categoryBreakdown {
		percentage := 0.0
		if totalExpenses > 0 {
			percentage = (amount / totalExpenses) * 100
		}
		expenseByCategory = append(expenseByCategory, &pfinancev1.ExpenseBreakdown{
			Category:   cat,
			Amount:     amount,
			Percentage: percentage,
		})
	}

	// Get member balances
	balancesResp, err := s.GetMemberBalances(ctx, connect.NewRequest(&pfinancev1.GetMemberBalancesRequest{
		GroupId:   req.Msg.GroupId,
		StartDate: req.Msg.StartDate,
		EndDate:   req.Msg.EndDate,
	}))
	if err != nil {
		return nil, fmt.Errorf("failed to get member balances: %w", err)
	}

	return connect.NewResponse(&pfinancev1.GetGroupSummaryResponse{
		TotalExpenses:         totalExpenses,
		TotalIncome:           totalIncome,
		ExpenseByCategory:     expenseByCategory,
		MemberBalances:        balancesResp.Msg.Balances,
		UnsettledExpenseCount: int32(unsettledCount),
		UnsettledAmount:       unsettledAmount,
	}), nil
}

// Invite link operations

// generateInviteCode generates a short random invite code
func generateInviteCode() string {
	const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	code := make([]byte, 8)
	id := uuid.New()
	for i := 0; i < 8; i++ {
		code[i] = charset[int(id[i])%len(charset)]
	}
	return string(code)
}

// CreateInviteLink creates a shareable invite link for a group
func (s *FinanceService) CreateInviteLink(ctx context.Context, req *connect.Request[pfinancev1.CreateInviteLinkRequest]) (*connect.Response[pfinancev1.CreateInviteLinkResponse], error) {
	defaultRole := req.Msg.DefaultRole
	if defaultRole == pfinancev1.GroupRole_GROUP_ROLE_UNSPECIFIED {
		defaultRole = pfinancev1.GroupRole_GROUP_ROLE_MEMBER
	}

	var expiresAt *timestamppb.Timestamp
	if req.Msg.ExpiresInDays > 0 {
		expiresAt = timestamppb.New(time.Now().AddDate(0, 0, int(req.Msg.ExpiresInDays)))
	}

	link := &pfinancev1.GroupInviteLink{
		Id:          uuid.New().String(),
		GroupId:     req.Msg.GroupId,
		Code:        generateInviteCode(),
		CreatedBy:   req.Msg.CreatedBy,
		DefaultRole: defaultRole,
		MaxUses:     req.Msg.MaxUses,
		CurrentUses: 0,
		ExpiresAt:   expiresAt,
		IsActive:    true,
		CreatedAt:   timestamppb.Now(),
	}

	if err := s.store.CreateInviteLink(ctx, link); err != nil {
		return nil, fmt.Errorf("failed to create invite link: %w", err)
	}

	return connect.NewResponse(&pfinancev1.CreateInviteLinkResponse{
		InviteLink: link,
	}), nil
}

// GetInviteLinkByCode retrieves an invite link and group preview by code
func (s *FinanceService) GetInviteLinkByCode(ctx context.Context, req *connect.Request[pfinancev1.GetInviteLinkByCodeRequest]) (*connect.Response[pfinancev1.GetInviteLinkByCodeResponse], error) {
	link, err := s.store.GetInviteLinkByCode(ctx, req.Msg.Code)
	if err != nil {
		return nil, fmt.Errorf("invite link not found: %w", err)
	}

	// Check if link is active and not expired
	if !link.IsActive {
		return nil, fmt.Errorf("invite link is no longer active")
	}
	if link.ExpiresAt != nil && link.ExpiresAt.AsTime().Before(time.Now()) {
		return nil, fmt.Errorf("invite link has expired")
	}
	if link.MaxUses > 0 && link.CurrentUses >= link.MaxUses {
		return nil, fmt.Errorf("invite link has reached maximum uses")
	}

	group, err := s.store.GetGroup(ctx, link.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	return connect.NewResponse(&pfinancev1.GetInviteLinkByCodeResponse{
		InviteLink: link,
		Group:      group,
	}), nil
}

// JoinGroupByLink allows a user to join a group using an invite code
func (s *FinanceService) JoinGroupByLink(ctx context.Context, req *connect.Request[pfinancev1.JoinGroupByLinkRequest]) (*connect.Response[pfinancev1.JoinGroupByLinkResponse], error) {
	link, err := s.store.GetInviteLinkByCode(ctx, req.Msg.Code)
	if err != nil {
		return nil, fmt.Errorf("invite link not found: %w", err)
	}

	// Validate link
	if !link.IsActive {
		return nil, fmt.Errorf("invite link is no longer active")
	}
	if link.ExpiresAt != nil && link.ExpiresAt.AsTime().Before(time.Now()) {
		return nil, fmt.Errorf("invite link has expired")
	}
	if link.MaxUses > 0 && link.CurrentUses >= link.MaxUses {
		return nil, fmt.Errorf("invite link has reached maximum uses")
	}

	group, err := s.store.GetGroup(ctx, link.GroupId)
	if err != nil {
		return nil, fmt.Errorf("failed to get group: %w", err)
	}

	// Check if user is already a member
	for _, member := range group.Members {
		if member.UserId == req.Msg.UserId {
			return nil, fmt.Errorf("user is already a member of this group")
		}
	}

	// Add user to group
	newMember := &pfinancev1.GroupMember{
		UserId:      req.Msg.UserId,
		Email:       req.Msg.UserEmail,
		DisplayName: req.Msg.DisplayName,
		Role:        link.DefaultRole,
		JoinedAt:    timestamppb.Now(),
	}

	group.MemberIds = append(group.MemberIds, req.Msg.UserId)
	group.Members = append(group.Members, newMember)
	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, fmt.Errorf("failed to update group: %w", err)
	}

	// Increment link usage
	link.CurrentUses++
	if err := s.store.UpdateInviteLink(ctx, link); err != nil {
		// Log but don't fail - user already joined
		fmt.Printf("failed to update invite link usage: %v\n", err)
	}

	return connect.NewResponse(&pfinancev1.JoinGroupByLinkResponse{
		Group: group,
	}), nil
}

// ListInviteLinks lists invite links for a group
func (s *FinanceService) ListInviteLinks(ctx context.Context, req *connect.Request[pfinancev1.ListInviteLinksRequest]) (*connect.Response[pfinancev1.ListInviteLinksResponse], error) {
	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	links, err := s.store.ListInviteLinks(ctx, req.Msg.GroupId, req.Msg.IncludeInactive, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list invite links: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListInviteLinksResponse{
		InviteLinks: links,
	}), nil
}

// DeactivateInviteLink deactivates an invite link
func (s *FinanceService) DeactivateInviteLink(ctx context.Context, req *connect.Request[pfinancev1.DeactivateInviteLinkRequest]) (*connect.Response[emptypb.Empty], error) {
	link, err := s.store.GetInviteLink(ctx, req.Msg.LinkId)
	if err != nil {
		return nil, fmt.Errorf("invite link not found: %w", err)
	}

	link.IsActive = false
	if err := s.store.UpdateInviteLink(ctx, link); err != nil {
		return nil, fmt.Errorf("failed to deactivate invite link: %w", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

// Contribution operations

// ContributeExpenseToGroup contributes a personal expense to a group
func (s *FinanceService) ContributeExpenseToGroup(ctx context.Context, req *connect.Request[pfinancev1.ContributeExpenseToGroupRequest]) (*connect.Response[pfinancev1.ContributeExpenseToGroupResponse], error) {
	// Get the source expense
	sourceExpense, err := s.store.GetExpense(ctx, req.Msg.SourceExpenseId)
	if err != nil {
		return nil, fmt.Errorf("source expense not found: %w", err)
	}

	// Get the target group to validate it exists and get members
	group, err := s.store.GetGroup(ctx, req.Msg.TargetGroupId)
	if err != nil {
		return nil, fmt.Errorf("target group not found: %w", err)
	}

	// Calculate amount to contribute
	amount := req.Msg.Amount
	if amount <= 0 {
		amount = sourceExpense.Amount
	}

	// Create the group expense
	groupExpense := &pfinancev1.Expense{
		Id:           uuid.New().String(),
		UserId:       req.Msg.ContributedBy,
		GroupId:      req.Msg.TargetGroupId,
		Description:  sourceExpense.Description + " (contributed)",
		Amount:       amount,
		Category:     sourceExpense.Category,
		Frequency:    sourceExpense.Frequency,
		Date:         sourceExpense.Date,
		CreatedAt:    timestamppb.Now(),
		UpdatedAt:    timestamppb.Now(),
		PaidByUserId: req.Msg.ContributedBy,
		SplitType:    req.Msg.SplitType,
		Tags:         sourceExpense.Tags,
		IsSettled:    false,
	}

	// Calculate allocations
	allocatedUserIds := req.Msg.AllocatedUserIds
	if len(allocatedUserIds) == 0 {
		// Default to all group members
		allocatedUserIds = group.MemberIds
	}

	if req.Msg.SplitType == pfinancev1.SplitType_SPLIT_TYPE_EQUAL {
		shareAmount := amount / float64(len(allocatedUserIds))
		for _, userId := range allocatedUserIds {
			groupExpense.Allocations = append(groupExpense.Allocations, &pfinancev1.ExpenseAllocation{
				UserId: userId,
				Amount: shareAmount,
				IsPaid: userId == req.Msg.ContributedBy, // Contributor already "paid" their share
			})
		}
	} else if len(req.Msg.Allocations) > 0 {
		groupExpense.Allocations = req.Msg.Allocations
	}

	if err := s.store.CreateExpense(ctx, groupExpense); err != nil {
		return nil, fmt.Errorf("failed to create group expense: %w", err)
	}

	// Create the contribution record
	contribution := &pfinancev1.ExpenseContribution{
		Id:                    uuid.New().String(),
		SourceExpenseId:       req.Msg.SourceExpenseId,
		TargetGroupId:         req.Msg.TargetGroupId,
		ContributedBy:         req.Msg.ContributedBy,
		Amount:                amount,
		SplitType:             req.Msg.SplitType,
		Allocations:           groupExpense.Allocations,
		CreatedGroupExpenseId: groupExpense.Id,
		ContributedAt:         timestamppb.Now(),
	}

	if err := s.store.CreateContribution(ctx, contribution); err != nil {
		return nil, fmt.Errorf("failed to create contribution record: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ContributeExpenseToGroupResponse{
		Contribution:        contribution,
		CreatedGroupExpense: groupExpense,
	}), nil
}

// ListContributions lists expense contributions
func (s *FinanceService) ListContributions(ctx context.Context, req *connect.Request[pfinancev1.ListContributionsRequest]) (*connect.Response[pfinancev1.ListContributionsResponse], error) {
	pageSize := req.Msg.PageSize
	if pageSize <= 0 {
		pageSize = 100
	}

	contributions, err := s.store.ListContributions(ctx, req.Msg.GroupId, req.Msg.UserId, pageSize)
	if err != nil {
		return nil, fmt.Errorf("failed to list contributions: %w", err)
	}

	return connect.NewResponse(&pfinancev1.ListContributionsResponse{
		Contributions: contributions,
	}), nil
}
