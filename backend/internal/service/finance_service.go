package service

import (
	"context"
	"fmt"
	"sort"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"github.com/castlemilk/pfinance/backend/internal/auth"
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
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal expenses, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot create expense for another user"))
		}
	} else {
		// For group expenses, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

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
		return nil, auth.WrapStoreError("create expense", err)
	}

	return connect.NewResponse(&pfinancev1.CreateExpenseResponse{
		Expense: expense,
	}), nil
}

// GetExpense retrieves a single expense by ID
func (s *FinanceService) GetExpense(ctx context.Context, req *connect.Request[pfinancev1.GetExpenseRequest]) (*connect.Response[pfinancev1.GetExpenseResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("expense not found"))
	}

	// For personal expenses, verify ownership
	if expense.GroupId == "" {
		if expense.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's expense"))
		}
	} else {
		// For group expenses, verify group membership
		group, err := s.store.GetGroup(ctx, expense.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	return connect.NewResponse(&pfinancev1.GetExpenseResponse{
		Expense: expense,
	}), nil
}

// ListExpenses lists expenses for a user or group
func (s *FinanceService) ListExpenses(ctx context.Context, req *connect.Request[pfinancev1.ListExpensesRequest]) (*connect.Response[pfinancev1.ListExpensesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal expenses, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != "" && req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot list another user's expenses"))
		}
	} else {
		// For group expenses, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	startTime, endTime := auth.ConvertDateRange(req.Msg.StartDate, req.Msg.EndDate)
	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	// Use authenticated user ID if not specified
	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	expenses, nextPageToken, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, startTime, endTime, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}

	return connect.NewResponse(&pfinancev1.ListExpensesResponse{
		Expenses:      expenses,
		NextPageToken: nextPageToken,
	}), nil
}

// CreateGroup creates a new finance group
func (s *FinanceService) CreateGroup(ctx context.Context, req *connect.Request[pfinancev1.CreateGroupRequest]) (*connect.Response[pfinancev1.CreateGroupResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// User can only create a group where they are the owner
	if req.Msg.OwnerId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot create group owned by another user"))
	}

	// Try to get user details for the owner
	var email, displayName string

	// 1. Try fetching from store
	user, err := s.store.GetUser(ctx, req.Msg.OwnerId)
	if err == nil {
		email = user.Email
		displayName = user.DisplayName
	}

	// 2. If missing details, try context claims
	if email == "" {
		email = claims.Email
	}
	if displayName == "" {
		displayName = claims.DisplayName
	}

	group := &pfinancev1.FinanceGroup{
		Id:          uuid.New().String(),
		Name:        req.Msg.Name,
		Description: req.Msg.Description,
		OwnerId:     req.Msg.OwnerId,
		MemberIds:   []string{req.Msg.OwnerId},
		Members: []*pfinancev1.GroupMember{
			{
				UserId:      req.Msg.OwnerId,
				Role:        pfinancev1.GroupRole_GROUP_ROLE_OWNER,
				JoinedAt:    timestamppb.Now(),
				Email:       email,
				DisplayName: displayName,
			},
		},
		CreatedAt: timestamppb.Now(),
		UpdatedAt: timestamppb.Now(),
	}

	if err := s.store.CreateGroup(ctx, group); err != nil {
		return nil, auth.WrapStoreError("create group", err)
	}

	return connect.NewResponse(&pfinancev1.CreateGroupResponse{
		Group: group,
	}), nil
}

func (s *FinanceService) GetUser(ctx context.Context, req *connect.Request[pfinancev1.GetUserRequest]) (*connect.Response[pfinancev1.GetUserResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Users can only get their own profile, or profiles of group co-members
	if req.Msg.UserId != claims.UID {
		// Check if they share a group
		sharedGroup, err := s.checkSharedGroupMembership(ctx, claims.UID, req.Msg.UserId)
		if err != nil || !sharedGroup {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access user profile"))
		}
	}

	user, err := s.store.GetUser(ctx, req.Msg.UserId)
	if err != nil {
		// If user not found in store, return a basic object (fallback behavior)
		return connect.NewResponse(&pfinancev1.GetUserResponse{
			User: &pfinancev1.User{
				Id: req.Msg.UserId,
			},
		}), nil
	}

	return connect.NewResponse(&pfinancev1.GetUserResponse{
		User: user,
	}), nil
}

func (s *FinanceService) UpdateUser(ctx context.Context, req *connect.Request[pfinancev1.UpdateUserRequest]) (*connect.Response[pfinancev1.UpdateUserResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Users can only update their own profile
	if req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot update another user's profile"))
	}

	user := &pfinancev1.User{
		Id:          req.Msg.UserId,
		DisplayName: req.Msg.DisplayName,
		UpdatedAt:   timestamppb.Now(),
	}

	// Try to get email from existing record
	existing, err := s.store.GetUser(ctx, req.Msg.UserId)
	if err == nil {
		user.Email = existing.Email
		user.CreatedAt = existing.CreatedAt
	} else {
		user.CreatedAt = timestamppb.Now()
	}

	// Fall back to auth claims for missing data
	if user.Email == "" {
		user.Email = claims.Email
	}
	if user.DisplayName == "" {
		user.DisplayName = claims.DisplayName
	}

	if err := s.store.UpdateUser(ctx, user); err != nil {
		return nil, auth.WrapStoreError("update user", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateUserResponse{
		User: user,
	}), nil
}

// InviteToGroup creates an invitation to join a group
func (s *FinanceService) InviteToGroup(ctx context.Context, req *connect.Request[pfinancev1.InviteToGroupRequest]) (*connect.Response[pfinancev1.InviteToGroupResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify inviter is the authenticated user
	if req.Msg.InviterId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot create invitation as another user"))
	}

	// Verify inviter is group admin/owner
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}

	if !auth.CanInviteToGroup(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("only owners or admins can invite to the group"))
	}

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
		return nil, auth.WrapStoreError("create invitation", err)
	}

	return connect.NewResponse(&pfinancev1.InviteToGroupResponse{
		Invitation: invitation,
	}), nil
}

// AcceptInvitation accepts a group invitation
func (s *FinanceService) AcceptInvitation(ctx context.Context, req *connect.Request[pfinancev1.AcceptInvitationRequest]) (*connect.Response[pfinancev1.AcceptInvitationResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify userId matches authenticated user
	if req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot accept invitation as another user"))
	}

	// Get the invitation
	invitation, err := s.store.GetInvitation(ctx, req.Msg.InvitationId)
	if err != nil {
		return nil, auth.WrapStoreError("get invitation", err)
	}

	// Verify user's email matches invitation
	if claims.Email != invitation.InviteeEmail {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("invitation is for a different email address"))
	}

	// Check if invitation is still pending
	if invitation.Status != pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invitation is no longer pending"))
	}

	// Check if invitation is expired
	if invitation.ExpiresAt.AsTime().Before(timestamppb.Now().AsTime()) {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invitation has expired"))
	}

	// Get the group
	group, err := s.store.GetGroup(ctx, invitation.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}

	// Add user to group
	newMember := &pfinancev1.GroupMember{
		UserId:      req.Msg.UserId,
		Email:       claims.Email,
		DisplayName: claims.DisplayName,
		Role:        invitation.Role,
		JoinedAt:    timestamppb.Now(),
	}

	group.MemberIds = append(group.MemberIds, req.Msg.UserId)
	group.Members = append(group.Members, newMember)
	group.UpdatedAt = timestamppb.Now()

	// Update group
	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, auth.WrapStoreError("update group", err)
	}

	// Update invitation status
	invitation.Status = pfinancev1.InvitationStatus_INVITATION_STATUS_ACCEPTED
	if err := s.store.UpdateInvitation(ctx, invitation); err != nil {
		return nil, auth.WrapStoreError("update invitation", err)
	}

	return connect.NewResponse(&pfinancev1.AcceptInvitationResponse{
		Group: group,
	}), nil
}

// CreateIncome creates a new income entry
func (s *FinanceService) CreateIncome(ctx context.Context, req *connect.Request[pfinancev1.CreateIncomeRequest]) (*connect.Response[pfinancev1.CreateIncomeResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal income, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot create income for another user"))
		}
	} else {
		// For group income, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

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
		return nil, auth.WrapStoreError("create income", err)
	}

	return connect.NewResponse(&pfinancev1.CreateIncomeResponse{
		Income: income,
	}), nil
}

// GetIncome retrieves a single income by ID
func (s *FinanceService) GetIncome(ctx context.Context, req *connect.Request[pfinancev1.GetIncomeRequest]) (*connect.Response[pfinancev1.GetIncomeResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	income, err := s.store.GetIncome(ctx, req.Msg.IncomeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("income not found"))
	}

	// For personal income, verify ownership
	if income.GroupId == "" {
		if income.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's income"))
		}
	} else {
		// For group income, verify group membership
		group, err := s.store.GetGroup(ctx, income.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	return connect.NewResponse(&pfinancev1.GetIncomeResponse{
		Income: income,
	}), nil
}

// GetTaxConfig gets tax configuration for a user or group
func (s *FinanceService) GetTaxConfig(ctx context.Context, req *connect.Request[pfinancev1.GetTaxConfigRequest]) (*connect.Response[pfinancev1.GetTaxConfigResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal tax config, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's tax config"))
		}
	} else {
		// For group tax config, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	taxConfig, err := s.store.GetTaxConfig(ctx, req.Msg.UserId, req.Msg.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get tax config", err)
	}

	return connect.NewResponse(&pfinancev1.GetTaxConfigResponse{
		TaxConfig: taxConfig,
	}), nil
}

// ListGroups lists groups for a user
func (s *FinanceService) ListGroups(ctx context.Context, req *connect.Request[pfinancev1.ListGroupsRequest]) (*connect.Response[pfinancev1.ListGroupsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Users can only list their own groups
	userID := req.Msg.UserId
	if userID == "" {
		userID = claims.UID
	} else if userID != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot list another user's groups"))
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	groups, nextPageToken, err := s.store.ListGroups(ctx, userID, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list groups", err)
	}

	return connect.NewResponse(&pfinancev1.ListGroupsResponse{
		Groups:        groups,
		NextPageToken: nextPageToken,
	}), nil
}

// ListInvitations lists invitations for a user
func (s *FinanceService) ListInvitations(ctx context.Context, req *connect.Request[pfinancev1.ListInvitationsRequest]) (*connect.Response[pfinancev1.ListInvitationsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Users can only list invitations for their own email
	userEmail := req.Msg.UserEmail
	if userEmail == "" {
		userEmail = claims.Email
	} else if userEmail != claims.Email {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot list invitations for another email address"))
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	var status *pfinancev1.InvitationStatus
	if req.Msg.Status != pfinancev1.InvitationStatus_INVITATION_STATUS_UNSPECIFIED {
		status = &req.Msg.Status
	}

	invitations, nextPageToken, err := s.store.ListInvitations(ctx, userEmail, status, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list invitations", err)
	}

	return connect.NewResponse(&pfinancev1.ListInvitationsResponse{
		Invitations:   invitations,
		NextPageToken: nextPageToken,
	}), nil
}

// UpdateExpense updates an existing expense
func (s *FinanceService) UpdateExpense(ctx context.Context, req *connect.Request[pfinancev1.UpdateExpenseRequest]) (*connect.Response[pfinancev1.UpdateExpenseResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Get existing expense
	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("expense not found"))
	}

	// Check authorization
	if expense.GroupId == "" {
		// Personal expense - must be owner
		if expense.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot update another user's expense"))
		}
	} else {
		// Group expense - must be group member
		group, err := s.store.GetGroup(ctx, expense.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
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
		return nil, auth.WrapStoreError("update expense", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateExpenseResponse{
		Expense: expense,
	}), nil
}

func (s *FinanceService) DeleteExpense(ctx context.Context, req *connect.Request[pfinancev1.DeleteExpenseRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Get expense to check ownership
	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("expense not found"))
	}

	// Check authorization
	if expense.GroupId == "" {
		// Personal expense - must be owner
		if expense.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot delete another user's expense"))
		}
	} else {
		// Group expense - must be group admin/owner or expense creator
		group, err := s.store.GetGroup(ctx, expense.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		isCreator := expense.UserId == claims.UID || expense.PaidByUserId == claims.UID
		if !isCreator && !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only expense creator or group admin can delete this expense"))
		}
	}

	if err := s.store.DeleteExpense(ctx, req.Msg.ExpenseId); err != nil {
		return nil, auth.WrapStoreError("delete expense", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) BatchCreateExpenses(ctx context.Context, req *connect.Request[pfinancev1.BatchCreateExpensesRequest]) (*connect.Response[pfinancev1.BatchCreateExpensesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify group membership if group expenses
	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	expenses := make([]*pfinancev1.Expense, 0, len(req.Msg.Expenses))

	for _, expReq := range req.Msg.Expenses {
		// Verify each expense is for the authenticated user
		if req.Msg.GroupId == "" && expReq.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot create expense for another user"))
		}

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
			return nil, auth.WrapStoreError("create expense", err)
		}

		expenses = append(expenses, expense)
	}

	return connect.NewResponse(&pfinancev1.BatchCreateExpensesResponse{
		Expenses: expenses,
	}), nil
}

func (s *FinanceService) UpdateIncome(ctx context.Context, req *connect.Request[pfinancev1.UpdateIncomeRequest]) (*connect.Response[pfinancev1.UpdateIncomeResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	income, err := s.store.GetIncome(ctx, req.Msg.IncomeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("income not found"))
	}

	// Check authorization
	if income.GroupId == "" {
		// Personal income - must be owner
		if income.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot update another user's income"))
		}
	} else {
		// Group income - must be group member
		group, err := s.store.GetGroup(ctx, income.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
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
		return nil, auth.WrapStoreError("update income", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateIncomeResponse{
		Income: income,
	}), nil
}

func (s *FinanceService) DeleteIncome(ctx context.Context, req *connect.Request[pfinancev1.DeleteIncomeRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	income, err := s.store.GetIncome(ctx, req.Msg.IncomeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("income not found"))
	}

	// Check authorization
	if income.GroupId == "" {
		// Personal income - must be owner
		if income.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot delete another user's income"))
		}
	} else {
		// Group income - must be creator or group admin
		group, err := s.store.GetGroup(ctx, income.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		isCreator := income.UserId == claims.UID
		if !isCreator && !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only income creator or group admin can delete this income"))
		}
	}

	if err := s.store.DeleteIncome(ctx, req.Msg.IncomeId); err != nil {
		return nil, auth.WrapStoreError("delete income", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) ListIncomes(ctx context.Context, req *connect.Request[pfinancev1.ListIncomesRequest]) (*connect.Response[pfinancev1.ListIncomesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal income, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != "" && req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot list another user's income"))
		}
	} else {
		// For group income, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	startTime, endTime := auth.ConvertDateRange(req.Msg.StartDate, req.Msg.EndDate)
	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	// Use authenticated user ID if not specified
	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	incomes, nextPageToken, err := s.store.ListIncomes(ctx, userID, req.Msg.GroupId, startTime, endTime, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list incomes", err)
	}

	return connect.NewResponse(&pfinancev1.ListIncomesResponse{
		Incomes:       incomes,
		NextPageToken: nextPageToken,
	}), nil
}

func (s *FinanceService) UpdateTaxConfig(ctx context.Context, req *connect.Request[pfinancev1.UpdateTaxConfigRequest]) (*connect.Response[pfinancev1.UpdateTaxConfigResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal tax config, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot update another user's tax config"))
		}
	} else {
		// For group tax config, verify user is group admin/owner
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only group admins can update group tax config"))
		}
	}

	if err := s.store.UpdateTaxConfig(ctx, req.Msg.UserId, req.Msg.GroupId, req.Msg.TaxConfig); err != nil {
		return nil, auth.WrapStoreError("update tax config", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateTaxConfigResponse{
		TaxConfig: req.Msg.TaxConfig,
	}), nil
}

// Budget operations

// CreateBudget creates a new budget
func (s *FinanceService) CreateBudget(ctx context.Context, req *connect.Request[pfinancev1.CreateBudgetRequest]) (*connect.Response[pfinancev1.CreateBudgetResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal budget, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot create budget for another user"))
		}
	} else {
		// For group budget, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

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
		return nil, auth.WrapStoreError("create budget", err)
	}

	return connect.NewResponse(&pfinancev1.CreateBudgetResponse{
		Budget: budget,
	}), nil
}

// GetBudget retrieves a budget by ID
func (s *FinanceService) GetBudget(ctx context.Context, req *connect.Request[pfinancev1.GetBudgetRequest]) (*connect.Response[pfinancev1.GetBudgetResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	budget, err := s.store.GetBudget(ctx, req.Msg.BudgetId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("budget not found"))
	}

	// Check authorization
	if budget.GroupId == "" {
		// Personal budget - must be owner
		if budget.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's budget"))
		}
	} else {
		// Group budget - must be group member
		group, err := s.store.GetGroup(ctx, budget.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	return connect.NewResponse(&pfinancev1.GetBudgetResponse{
		Budget: budget,
	}), nil
}

// UpdateBudget updates an existing budget
func (s *FinanceService) UpdateBudget(ctx context.Context, req *connect.Request[pfinancev1.UpdateBudgetRequest]) (*connect.Response[pfinancev1.UpdateBudgetResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := s.store.GetBudget(ctx, req.Msg.BudgetId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("budget not found"))
	}

	// Check authorization
	if existing.GroupId == "" {
		// Personal budget - must be owner
		if existing.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot update another user's budget"))
		}
	} else {
		// Group budget - must be group admin/owner
		group, err := s.store.GetGroup(ctx, existing.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only group admins can update group budgets"))
		}
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
		return nil, auth.WrapStoreError("update budget", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateBudgetResponse{
		Budget: existing,
	}), nil
}

// DeleteBudget deletes a budget
func (s *FinanceService) DeleteBudget(ctx context.Context, req *connect.Request[pfinancev1.DeleteBudgetRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	budget, err := s.store.GetBudget(ctx, req.Msg.BudgetId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("budget not found"))
	}

	// Check authorization
	if budget.GroupId == "" {
		// Personal budget - must be owner
		if budget.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot delete another user's budget"))
		}
	} else {
		// Group budget - must be group admin/owner
		group, err := s.store.GetGroup(ctx, budget.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only group admins can delete group budgets"))
		}
	}

	if err := s.store.DeleteBudget(ctx, req.Msg.BudgetId); err != nil {
		return nil, auth.WrapStoreError("delete budget", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

// ListBudgets lists budgets for a user or group
func (s *FinanceService) ListBudgets(ctx context.Context, req *connect.Request[pfinancev1.ListBudgetsRequest]) (*connect.Response[pfinancev1.ListBudgetsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal budgets, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != "" && req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot list another user's budgets"))
		}
	} else {
		// For group budgets, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	// Use authenticated user ID if not specified
	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	budgets, nextPageToken, err := s.store.ListBudgets(ctx, userID, req.Msg.GroupId, req.Msg.IncludeInactive, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list budgets", err)
	}

	return connect.NewResponse(&pfinancev1.ListBudgetsResponse{
		Budgets:       budgets,
		NextPageToken: nextPageToken,
	}), nil
}

// GetBudgetProgress gets the current progress of a budget
func (s *FinanceService) GetBudgetProgress(ctx context.Context, req *connect.Request[pfinancev1.GetBudgetProgressRequest]) (*connect.Response[pfinancev1.GetBudgetProgressResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	budget, err := s.store.GetBudget(ctx, req.Msg.BudgetId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("budget not found"))
	}

	// Check authorization
	if budget.GroupId == "" {
		// Personal budget - must be owner
		if budget.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's budget progress"))
		}
	} else {
		// Group budget - must be group member
		group, err := s.store.GetGroup(ctx, budget.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	asOfDate := time.Now()
	if req.Msg.AsOfDate != nil {
		asOfDate = req.Msg.AsOfDate.AsTime()
	}

	progress, err := s.store.GetBudgetProgress(ctx, req.Msg.BudgetId, asOfDate)
	if err != nil {
		return nil, auth.WrapStoreError("get budget progress", err)
	}

	return connect.NewResponse(&pfinancev1.GetBudgetProgressResponse{
		Progress: progress,
	}), nil
}

func (s *FinanceService) GetGroup(ctx context.Context, req *connect.Request[pfinancev1.GetGroupRequest]) (*connect.Response[pfinancev1.GetGroupResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}

	// Verify user is group member
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}

	return connect.NewResponse(&pfinancev1.GetGroupResponse{
		Group: group,
	}), nil
}

func (s *FinanceService) UpdateGroup(ctx context.Context, req *connect.Request[pfinancev1.UpdateGroupRequest]) (*connect.Response[pfinancev1.UpdateGroupResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}

	// Only admins and owners can update group
	if !auth.IsGroupAdminOrOwner(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("only group admins can update group settings"))
	}

	if req.Msg.Name != "" {
		group.Name = req.Msg.Name
	}
	if req.Msg.Description != "" {
		group.Description = req.Msg.Description
	}
	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, auth.WrapStoreError("update group", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateGroupResponse{
		Group: group,
	}), nil
}

func (s *FinanceService) DeleteGroup(ctx context.Context, req *connect.Request[pfinancev1.DeleteGroupRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}

	// Only owners and admins can delete
	if !auth.IsGroupAdminOrOwner(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("only group owners or admins can delete the group"))
	}

	if err := s.store.DeleteGroup(ctx, req.Msg.GroupId); err != nil {
		return nil, auth.WrapStoreError("delete group", err)
	}
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) DeclineInvitation(ctx context.Context, req *connect.Request[pfinancev1.DeclineInvitationRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	invitation, err := s.store.GetInvitation(ctx, req.Msg.InvitationId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("invitation not found"))
	}

	// Verify user's email matches invitation
	if claims.Email != invitation.InviteeEmail {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("can only decline your own invitations"))
	}

	invitation.Status = pfinancev1.InvitationStatus_INVITATION_STATUS_DECLINED
	if err := s.store.UpdateInvitation(ctx, invitation); err != nil {
		return nil, auth.WrapStoreError("update invitation", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) RemoveFromGroup(ctx context.Context, req *connect.Request[pfinancev1.RemoveFromGroupRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}

	// Users can remove themselves, or admins/owners can remove others
	if req.Msg.UserId != claims.UID {
		if !auth.CanModifyGroupMember(claims.UID, req.Msg.UserId, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot remove this member from the group"))
		}
	}

	// Cannot remove the owner
	if req.Msg.UserId == group.OwnerId {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("cannot remove the group owner"))
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
		return nil, auth.WrapStoreError("update group", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) UpdateMemberRole(ctx context.Context, req *connect.Request[pfinancev1.UpdateMemberRoleRequest]) (*connect.Response[pfinancev1.UpdateMemberRoleResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}

	// Only admins and owners can update roles
	if !auth.IsGroupAdminOrOwner(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("only group admins can update member roles"))
	}

	// Cannot change owner's role
	if req.Msg.UserId == group.OwnerId {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("cannot change the owner's role"))
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
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("member not found in group"))
	}

	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, auth.WrapStoreError("update group", err)
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
		return nil, fmt.Errorf("percentage split requires custom allocations with percentages")

	case pfinancev1.SplitType_SPLIT_TYPE_SHARES:
		return nil, fmt.Errorf("share-based split requires custom allocations with share counts")

	default:
		return nil, fmt.Errorf("unsupported split type: %v", req.SplitType)
	}

	return allocations, nil
}

// GetMemberBalances calculates member balances for a group
func (s *FinanceService) GetMemberBalances(ctx context.Context, req *connect.Request[pfinancev1.GetMemberBalancesRequest]) (*connect.Response[pfinancev1.GetMemberBalancesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify user is group member
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}

	startTime, endTime := auth.ConvertDateRange(req.Msg.StartDate, req.Msg.EndDate)

	expenses, _, err := s.store.ListExpenses(ctx, "", req.Msg.GroupId, startTime, endTime, 1000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
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
		balance := paid - owed

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
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("expense not found"))
	}

	// Verify user is settling their own allocation OR is group admin
	if req.Msg.UserId != claims.UID {
		if expense.GroupId == "" {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot settle expense for another user"))
		}
		group, err := s.store.GetGroup(ctx, expense.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only user or group admin can settle this allocation"))
		}
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
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("user allocation not found for expense"))
	}

	expense.IsSettled = allSettled
	expense.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateExpense(ctx, expense); err != nil {
		return nil, auth.WrapStoreError("update expense", err)
	}

	return connect.NewResponse(&pfinancev1.SettleExpenseResponse{
		Expense:           expense,
		UpdatedAllocation: updatedAllocation,
	}), nil
}

// GetGroupSummary gets a summary of group finances
func (s *FinanceService) GetGroupSummary(ctx context.Context, req *connect.Request[pfinancev1.GetGroupSummaryRequest]) (*connect.Response[pfinancev1.GetGroupSummaryResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify user is group member
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}

	startTime, endTime := auth.ConvertDateRange(req.Msg.StartDate, req.Msg.EndDate)

	expenses, _, err := s.store.ListExpenses(ctx, "", req.Msg.GroupId, startTime, endTime, 1000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}

	incomes, _, err := s.store.ListIncomes(ctx, "", req.Msg.GroupId, startTime, endTime, 1000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list incomes", err)
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
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify createdBy matches authenticated user
	if req.Msg.CreatedBy != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot create invite link as another user"))
	}

	// Verify user has permission in the group
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}

	if !auth.CanInviteToGroup(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("only owners or admins can create invite links"))
	}

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
		return nil, auth.WrapStoreError("create invite link", err)
	}

	return connect.NewResponse(&pfinancev1.CreateInviteLinkResponse{
		InviteLink: link,
	}), nil
}

// GetInviteLinkByCode retrieves an invite link and group preview by code
// This is a public endpoint (no auth required for previewing invite)
func (s *FinanceService) GetInviteLinkByCode(ctx context.Context, req *connect.Request[pfinancev1.GetInviteLinkByCodeRequest]) (*connect.Response[pfinancev1.GetInviteLinkByCodeResponse], error) {
	link, err := s.store.GetInviteLinkByCode(ctx, req.Msg.Code)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("invite link not found"))
	}

	// Check if link is active and not expired
	if !link.IsActive {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invite link is no longer active"))
	}
	if link.ExpiresAt != nil && link.ExpiresAt.AsTime().Before(time.Now()) {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invite link has expired"))
	}
	if link.MaxUses > 0 && link.CurrentUses >= link.MaxUses {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invite link has reached maximum uses"))
	}

	group, err := s.store.GetGroup(ctx, link.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}

	return connect.NewResponse(&pfinancev1.GetInviteLinkByCodeResponse{
		InviteLink: link,
		Group:      group,
	}), nil
}

// JoinGroupByLink allows a user to join a group using an invite code
func (s *FinanceService) JoinGroupByLink(ctx context.Context, req *connect.Request[pfinancev1.JoinGroupByLinkRequest]) (*connect.Response[pfinancev1.JoinGroupByLinkResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify userId matches authenticated user
	if req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot join group as another user"))
	}

	link, err := s.store.GetInviteLinkByCode(ctx, req.Msg.Code)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("invite link not found"))
	}

	// Validate link
	if !link.IsActive {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invite link is no longer active"))
	}
	if link.ExpiresAt != nil && link.ExpiresAt.AsTime().Before(time.Now()) {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invite link has expired"))
	}
	if link.MaxUses > 0 && link.CurrentUses >= link.MaxUses {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("invite link has reached maximum uses"))
	}

	group, err := s.store.GetGroup(ctx, link.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}

	// Check if user is already a member
	if auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodeAlreadyExists,
			fmt.Errorf("user is already a member of this group"))
	}

	// Add user to group using authenticated claims
	newMember := &pfinancev1.GroupMember{
		UserId:      claims.UID,
		Email:       claims.Email,
		DisplayName: claims.DisplayName,
		Role:        link.DefaultRole,
		JoinedAt:    timestamppb.Now(),
	}

	group.MemberIds = append(group.MemberIds, claims.UID)
	group.Members = append(group.Members, newMember)
	group.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGroup(ctx, group); err != nil {
		return nil, auth.WrapStoreError("update group", err)
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
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify user is group member
	group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("group not found"))
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of this group"))
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	links, nextPageToken, err := s.store.ListInviteLinks(ctx, req.Msg.GroupId, req.Msg.IncludeInactive, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list invite links", err)
	}

	return connect.NewResponse(&pfinancev1.ListInviteLinksResponse{
		InviteLinks:   links,
		NextPageToken: nextPageToken,
	}), nil
}

// DeactivateInviteLink deactivates an invite link
func (s *FinanceService) DeactivateInviteLink(ctx context.Context, req *connect.Request[pfinancev1.DeactivateInviteLinkRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	link, err := s.store.GetInviteLink(ctx, req.Msg.LinkId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("invite link not found"))
	}

	// Verify user has permission in the group
	group, err := s.store.GetGroup(ctx, link.GroupId)
	if err != nil {
		return nil, auth.WrapStoreError("get group", err)
	}

	if !auth.IsGroupAdminOrOwner(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("only owners or admins can deactivate invite links"))
	}

	link.IsActive = false
	if err := s.store.UpdateInviteLink(ctx, link); err != nil {
		return nil, auth.WrapStoreError("deactivate invite link", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

// Contribution operations

// ContributeExpenseToGroup contributes a personal expense to a group
func (s *FinanceService) ContributeExpenseToGroup(ctx context.Context, req *connect.Request[pfinancev1.ContributeExpenseToGroupRequest]) (*connect.Response[pfinancev1.ContributeExpenseToGroupResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify contributedBy matches authenticated user
	if req.Msg.ContributedBy != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot contribute as another user"))
	}

	// Get the source expense
	sourceExpense, err := s.store.GetExpense(ctx, req.Msg.SourceExpenseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("source expense not found"))
	}

	// Verify user owns the source expense
	if sourceExpense.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("can only contribute your own expenses"))
	}

	// Get the target group to validate membership
	group, err := s.store.GetGroup(ctx, req.Msg.TargetGroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("target group not found"))
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of the target group"))
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
		Description:  sourceExpense.Description,
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
		allocatedUserIds = group.MemberIds
	}

	if req.Msg.SplitType == pfinancev1.SplitType_SPLIT_TYPE_EQUAL {
		shareAmount := amount / float64(len(allocatedUserIds))
		for _, userId := range allocatedUserIds {
			groupExpense.Allocations = append(groupExpense.Allocations, &pfinancev1.ExpenseAllocation{
				UserId: userId,
				Amount: shareAmount,
				IsPaid: userId == req.Msg.ContributedBy,
			})
		}
	} else if len(req.Msg.Allocations) > 0 {
		groupExpense.Allocations = req.Msg.Allocations
	}

	if err := s.store.CreateExpense(ctx, groupExpense); err != nil {
		return nil, auth.WrapStoreError("create group expense", err)
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
		return nil, auth.WrapStoreError("create contribution record", err)
	}

	return connect.NewResponse(&pfinancev1.ContributeExpenseToGroupResponse{
		Contribution:        contribution,
		CreatedGroupExpense: groupExpense,
	}), nil
}

// ListContributions lists expense contributions
func (s *FinanceService) ListContributions(ctx context.Context, req *connect.Request[pfinancev1.ListContributionsRequest]) (*connect.Response[pfinancev1.ListContributionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// If group is specified, verify group membership
	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, connect.NewError(connect.CodeNotFound,
				fmt.Errorf("group not found"))
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// If user is specified, verify it's the authenticated user
	userID := req.Msg.UserId
	if userID != "" && userID != claims.UID && req.Msg.GroupId == "" {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot list another user's contributions"))
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	contributions, nextPageToken, err := s.store.ListContributions(ctx, req.Msg.GroupId, req.Msg.UserId, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list contributions", err)
	}

	return connect.NewResponse(&pfinancev1.ListContributionsResponse{
		Contributions: contributions,
		NextPageToken: nextPageToken,
	}), nil
}

// ContributeIncomeToGroup contributes personal income to a group
func (s *FinanceService) ContributeIncomeToGroup(ctx context.Context, req *connect.Request[pfinancev1.ContributeIncomeToGroupRequest]) (*connect.Response[pfinancev1.ContributeIncomeToGroupResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify contributedBy matches authenticated user
	if req.Msg.ContributedBy != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot contribute as another user"))
	}

	// Get the source income
	sourceIncome, err := s.store.GetIncome(ctx, req.Msg.SourceIncomeId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("source income not found"))
	}

	// Verify user owns the source income
	if sourceIncome.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("can only contribute your own income"))
	}

	// Validate the target group exists and user is member
	group, err := s.store.GetGroup(ctx, req.Msg.TargetGroupId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("target group not found"))
	}
	if !auth.IsGroupMember(claims.UID, group) {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("user is not a member of the target group"))
	}

	// Calculate amount to contribute
	amount := req.Msg.Amount
	if amount <= 0 {
		amount = sourceIncome.Amount
	}

	// Create the group income
	groupIncome := &pfinancev1.Income{
		Id:        uuid.New().String(),
		UserId:    req.Msg.ContributedBy,
		GroupId:   req.Msg.TargetGroupId,
		Source:    sourceIncome.Source + " (contributed)",
		Amount:    amount,
		Frequency: sourceIncome.Frequency,
		TaxStatus: pfinancev1.TaxStatus_TAX_STATUS_POST_TAX,
		Date:      sourceIncome.Date,
		CreatedAt: timestamppb.Now(),
		UpdatedAt: timestamppb.Now(),
	}

	if err := s.store.CreateIncome(ctx, groupIncome); err != nil {
		return nil, auth.WrapStoreError("create group income", err)
	}

	// Create the contribution record
	contribution := &pfinancev1.IncomeContribution{
		Id:                   uuid.New().String(),
		SourceIncomeId:       req.Msg.SourceIncomeId,
		TargetGroupId:        req.Msg.TargetGroupId,
		ContributedBy:        req.Msg.ContributedBy,
		Amount:               amount,
		CreatedGroupIncomeId: groupIncome.Id,
		ContributedAt:        timestamppb.Now(),
	}

	if err := s.store.CreateIncomeContribution(ctx, contribution); err != nil {
		return nil, auth.WrapStoreError("create income contribution record", err)
	}

	return connect.NewResponse(&pfinancev1.ContributeIncomeToGroupResponse{
		Contribution:       contribution,
		CreatedGroupIncome: groupIncome,
	}), nil
}

// ListIncomeContributions lists income contributions
func (s *FinanceService) ListIncomeContributions(ctx context.Context, req *connect.Request[pfinancev1.ListIncomeContributionsRequest]) (*connect.Response[pfinancev1.ListIncomeContributionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// If group is specified, verify group membership
	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, connect.NewError(connect.CodeNotFound,
				fmt.Errorf("group not found"))
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// If user is specified, verify it's the authenticated user
	userID := req.Msg.UserId
	if userID != "" && userID != claims.UID && req.Msg.GroupId == "" {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot list another user's income contributions"))
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	contributions, nextPageToken, err := s.store.ListIncomeContributions(ctx, req.Msg.GroupId, req.Msg.UserId, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list income contributions", err)
	}

	return connect.NewResponse(&pfinancev1.ListIncomeContributionsResponse{
		Contributions: contributions,
		NextPageToken: nextPageToken,
	}), nil
}

// checkSharedGroupMembership checks if two users share a group
func (s *FinanceService) checkSharedGroupMembership(ctx context.Context, userID1, userID2 string) (bool, error) {
	// Get all groups for user1
	groups, _, err := s.store.ListGroups(ctx, userID1, 100, "")
	if err != nil {
		return false, err
	}

	// Check if user2 is a member of any of these groups
	for _, group := range groups {
		if auth.IsGroupMember(userID2, group) {
			return true, nil
		}
	}

	return false, nil
}

// ============================================================================
// Goal operations
// ============================================================================

// CreateGoal creates a new financial goal
func (s *FinanceService) CreateGoal(ctx context.Context, req *connect.Request[pfinancev1.CreateGoalRequest]) (*connect.Response[pfinancev1.CreateGoalResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal goals, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot create goal for another user"))
		}
	} else {
		// For group goals, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Create default milestones (25%, 50%, 75%, 100%)
	milestones := []*pfinancev1.GoalMilestone{
		{Id: uuid.New().String(), Name: "Quarter way there!", TargetPercentage: 25, IsAchieved: false},
		{Id: uuid.New().String(), Name: "Halfway point!", TargetPercentage: 50, IsAchieved: false},
		{Id: uuid.New().String(), Name: "Three-quarters done!", TargetPercentage: 75, IsAchieved: false},
		{Id: uuid.New().String(), Name: "Goal achieved!", TargetPercentage: 100, IsAchieved: false},
	}

	goal := &pfinancev1.FinancialGoal{
		Id:            uuid.New().String(),
		UserId:        req.Msg.UserId,
		GroupId:       req.Msg.GroupId,
		Name:          req.Msg.Name,
		Description:   req.Msg.Description,
		GoalType:      req.Msg.GoalType,
		TargetAmount:  req.Msg.TargetAmount,
		CurrentAmount: req.Msg.InitialAmount,
		StartDate:     req.Msg.StartDate,
		TargetDate:    req.Msg.TargetDate,
		Status:        pfinancev1.GoalStatus_GOAL_STATUS_ACTIVE,
		CategoryIds:   req.Msg.CategoryIds,
		Icon:          req.Msg.Icon,
		Color:         req.Msg.Color,
		Milestones:    milestones,
		CreatedAt:     timestamppb.Now(),
		UpdatedAt:     timestamppb.Now(),
	}

	if err := s.store.CreateGoal(ctx, goal); err != nil {
		return nil, auth.WrapStoreError("create goal", err)
	}

	return connect.NewResponse(&pfinancev1.CreateGoalResponse{
		Goal: goal,
	}), nil
}

// GetGoal retrieves a goal by ID
func (s *FinanceService) GetGoal(ctx context.Context, req *connect.Request[pfinancev1.GetGoalRequest]) (*connect.Response[pfinancev1.GetGoalResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	goal, err := s.store.GetGoal(ctx, req.Msg.GoalId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("goal not found"))
	}

	// Check authorization
	if goal.GroupId == "" {
		// Personal goal - must be owner
		if goal.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's goal"))
		}
	} else {
		// Group goal - must be group member
		group, err := s.store.GetGroup(ctx, goal.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	return connect.NewResponse(&pfinancev1.GetGoalResponse{
		Goal: goal,
	}), nil
}

// UpdateGoal updates an existing goal
func (s *FinanceService) UpdateGoal(ctx context.Context, req *connect.Request[pfinancev1.UpdateGoalRequest]) (*connect.Response[pfinancev1.UpdateGoalResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := s.store.GetGoal(ctx, req.Msg.GoalId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("goal not found"))
	}

	// Check authorization
	if existing.GroupId == "" {
		// Personal goal - must be owner
		if existing.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot update another user's goal"))
		}
	} else {
		// Group goal - must be group admin/owner
		group, err := s.store.GetGroup(ctx, existing.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only group admins can update group goals"))
		}
	}

	// Update fields
	if req.Msg.Name != "" {
		existing.Name = req.Msg.Name
	}
	if req.Msg.Description != "" {
		existing.Description = req.Msg.Description
	}
	if req.Msg.TargetAmount > 0 {
		existing.TargetAmount = req.Msg.TargetAmount
	}
	if req.Msg.TargetDate != nil {
		existing.TargetDate = req.Msg.TargetDate
	}
	if req.Msg.Status != pfinancev1.GoalStatus_GOAL_STATUS_UNSPECIFIED {
		existing.Status = req.Msg.Status
	}
	if len(req.Msg.CategoryIds) > 0 {
		existing.CategoryIds = req.Msg.CategoryIds
	}
	if req.Msg.Icon != "" {
		existing.Icon = req.Msg.Icon
	}
	if req.Msg.Color != "" {
		existing.Color = req.Msg.Color
	}
	existing.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateGoal(ctx, existing); err != nil {
		return nil, auth.WrapStoreError("update goal", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateGoalResponse{
		Goal: existing,
	}), nil
}

// DeleteGoal deletes a goal
func (s *FinanceService) DeleteGoal(ctx context.Context, req *connect.Request[pfinancev1.DeleteGoalRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	existing, err := s.store.GetGoal(ctx, req.Msg.GoalId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("goal not found"))
	}

	// Check authorization
	if existing.GroupId == "" {
		// Personal goal - must be owner
		if existing.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot delete another user's goal"))
		}
	} else {
		// Group goal - must be group admin/owner
		group, err := s.store.GetGroup(ctx, existing.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupAdminOrOwner(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("only group admins can delete group goals"))
		}
	}

	if err := s.store.DeleteGoal(ctx, req.Msg.GoalId); err != nil {
		return nil, auth.WrapStoreError("delete goal", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

// ListGoals lists goals for a user or group
func (s *FinanceService) ListGoals(ctx context.Context, req *connect.Request[pfinancev1.ListGoalsRequest]) (*connect.Response[pfinancev1.ListGoalsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal goals, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != "" && req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot list another user's goals"))
		}
	} else {
		// For group goals, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Use authenticated user ID if not specified
	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	goals, nextPageToken, err := s.store.ListGoals(ctx, userID, req.Msg.GroupId, req.Msg.Status, req.Msg.GoalType, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list goals", err)
	}

	return connect.NewResponse(&pfinancev1.ListGoalsResponse{
		Goals:         goals,
		NextPageToken: nextPageToken,
	}), nil
}

// GetGoalProgress retrieves the progress of a goal
func (s *FinanceService) GetGoalProgress(ctx context.Context, req *connect.Request[pfinancev1.GetGoalProgressRequest]) (*connect.Response[pfinancev1.GetGoalProgressResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// First get the goal to check authorization
	goal, err := s.store.GetGoal(ctx, req.Msg.GoalId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("goal not found"))
	}

	// Check authorization
	if goal.GroupId == "" {
		// Personal goal - must be owner
		if goal.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's goal progress"))
		}
	} else {
		// Group goal - must be group member
		group, err := s.store.GetGroup(ctx, goal.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Determine as-of date
	asOfDate := time.Now()
	if req.Msg.AsOfDate != nil {
		asOfDate = req.Msg.AsOfDate.AsTime()
	}

	progress, err := s.store.GetGoalProgress(ctx, req.Msg.GoalId, asOfDate)
	if err != nil {
		return nil, auth.WrapStoreError("get goal progress", err)
	}

	return connect.NewResponse(&pfinancev1.GetGoalProgressResponse{
		Progress: progress,
	}), nil
}

// ContributeToGoal adds a contribution to a goal
func (s *FinanceService) ContributeToGoal(ctx context.Context, req *connect.Request[pfinancev1.ContributeToGoalRequest]) (*connect.Response[pfinancev1.ContributeToGoalResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Get the goal
	goal, err := s.store.GetGoal(ctx, req.Msg.GoalId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("goal not found"))
	}

	// Check authorization
	if goal.GroupId == "" {
		// Personal goal - must be owner
		if goal.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot contribute to another user's goal"))
		}
	} else {
		// Group goal - must be group member
		group, err := s.store.GetGroup(ctx, goal.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Verify goal is active
	if goal.Status != pfinancev1.GoalStatus_GOAL_STATUS_ACTIVE {
		return nil, connect.NewError(connect.CodeFailedPrecondition,
			fmt.Errorf("can only contribute to active goals"))
	}

	// Create the contribution record
	contribution := &pfinancev1.GoalContribution{
		Id:            uuid.New().String(),
		GoalId:        req.Msg.GoalId,
		UserId:        claims.UID,
		Amount:        req.Msg.Amount,
		Note:          req.Msg.Note,
		ContributedAt: timestamppb.Now(),
	}

	if err := s.store.CreateGoalContribution(ctx, contribution); err != nil {
		return nil, auth.WrapStoreError("create goal contribution", err)
	}

	// Update goal current amount
	goal.CurrentAmount += req.Msg.Amount
	goal.UpdatedAt = timestamppb.Now()

	// Check and update milestones
	percentageComplete := (goal.CurrentAmount / goal.TargetAmount) * 100
	for _, milestone := range goal.Milestones {
		if !milestone.IsAchieved && percentageComplete >= milestone.TargetPercentage {
			milestone.IsAchieved = true
			milestone.AchievedAt = timestamppb.Now()
		}
	}

	// Check if goal is completed
	if goal.CurrentAmount >= goal.TargetAmount {
		goal.Status = pfinancev1.GoalStatus_GOAL_STATUS_COMPLETED
	}

	if err := s.store.UpdateGoal(ctx, goal); err != nil {
		return nil, auth.WrapStoreError("update goal", err)
	}

	return connect.NewResponse(&pfinancev1.ContributeToGoalResponse{
		Goal:         goal,
		Contribution: contribution,
	}), nil
}

// ListGoalContributions lists contributions for a goal
func (s *FinanceService) ListGoalContributions(ctx context.Context, req *connect.Request[pfinancev1.ListGoalContributionsRequest]) (*connect.Response[pfinancev1.ListGoalContributionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Get the goal to check authorization
	goal, err := s.store.GetGoal(ctx, req.Msg.GoalId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound,
			fmt.Errorf("goal not found"))
	}

	// Check authorization
	if goal.GroupId == "" {
		// Personal goal - must be owner
		if goal.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's goal contributions"))
		}
	} else {
		// Group goal - must be group member
		group, err := s.store.GetGroup(ctx, goal.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	pageSize := auth.NormalizePageSize(req.Msg.PageSize)

	contributions, nextPageToken, err := s.store.ListGoalContributions(ctx, req.Msg.GoalId, pageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list goal contributions", err)
	}

	return connect.NewResponse(&pfinancev1.ListGoalContributionsResponse{
		Contributions: contributions,
		NextPageToken: nextPageToken,
	}), nil
}

// ============================================================================
// Spending insights operations
// ============================================================================

// GetSpendingInsights generates spending insights for a user or group
func (s *FinanceService) GetSpendingInsights(ctx context.Context, req *connect.Request[pfinancev1.GetSpendingInsightsRequest]) (*connect.Response[pfinancev1.GetSpendingInsightsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// For personal insights, verify ownership
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != "" && req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot view another user's insights"))
		}
	} else {
		// For group insights, verify group membership
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Use authenticated user ID if not specified
	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	// Determine period dates
	period := req.Msg.Period
	if period == "" {
		period = "month"
	}

	var startDate, endDate time.Time
	now := time.Now()

	switch period {
	case "week":
		// Start of current week (Sunday)
		daysFromSunday := int(now.Weekday())
		startDate = now.AddDate(0, 0, -daysFromSunday)
		endDate = startDate.AddDate(0, 0, 6)
	case "month":
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, -1)
	case "quarter":
		month := now.Month()
		quarterStartMonth := time.Month(((int(month)-1)/3)*3 + 1)
		startDate = time.Date(now.Year(), quarterStartMonth, 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 3, -1)
	case "year":
		startDate = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		endDate = time.Date(now.Year(), 12, 31, 23, 59, 59, 999999999, now.Location())
	default:
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, -1)
	}

	// Get current period expenses
	currentExpenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &startDate, &endDate, 1000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}

	// Get previous period expenses for comparison
	prevStartDate := startDate.AddDate(0, -1, 0)
	prevEndDate := endDate.AddDate(0, -1, 0)
	if period == "year" {
		prevStartDate = startDate.AddDate(-1, 0, 0)
		prevEndDate = endDate.AddDate(-1, 0, 0)
	}

	prevExpenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &prevStartDate, &prevEndDate, 1000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list previous expenses", err)
	}

	// Calculate spending by category for current and previous periods
	currentByCategory := make(map[pfinancev1.ExpenseCategory]float64)
	prevByCategory := make(map[pfinancev1.ExpenseCategory]float64)
	var currentTotal, prevTotal float64

	for _, e := range currentExpenses {
		currentByCategory[e.Category] += e.Amount
		currentTotal += e.Amount
	}

	for _, e := range prevExpenses {
		prevByCategory[e.Category] += e.Amount
		prevTotal += e.Amount
	}

	// Generate insights
	var insights []*pfinancev1.SpendingInsight
	limit := req.Msg.Limit
	if limit <= 0 {
		limit = 5
	}

	// Total spending change insight
	if prevTotal > 0 {
		changePercent := ((currentTotal - prevTotal) / prevTotal) * 100
		insightType := pfinancev1.InsightType_INSIGHT_TYPE_SPENDING_DECREASE
		title := fmt.Sprintf("You've spent %.0f%% less this %s", -changePercent, period)
		isPositive := true
		icon := "📉"

		if changePercent > 0 {
			insightType = pfinancev1.InsightType_INSIGHT_TYPE_SPENDING_INCREASE
			title = fmt.Sprintf("Spending is up %.0f%% this %s", changePercent, period)
			isPositive = false
			icon = "📈"
		}

		insights = append(insights, &pfinancev1.SpendingInsight{
			Id:            uuid.New().String(),
			Type:          insightType,
			Title:         title,
			Description:   fmt.Sprintf("Current: $%.2f vs Previous: $%.2f", currentTotal, prevTotal),
			Amount:        currentTotal,
			ChangePercent: changePercent,
			Period:        period,
			Icon:          icon,
			IsPositive:    isPositive,
			CreatedAt:     timestamppb.Now(),
		})
	}

	// Category-specific insights
	for category, currentAmount := range currentByCategory {
		if len(insights) >= int(limit) {
			break
		}

		prevAmount := prevByCategory[category]
		if prevAmount == 0 {
			continue
		}

		changePercent := ((currentAmount - prevAmount) / prevAmount) * 100
		if changePercent > 20 || changePercent < -20 {
			insightType := pfinancev1.InsightType_INSIGHT_TYPE_CATEGORY_TREND
			categoryName := category.String()
			title := fmt.Sprintf("%s spending down %.0f%%", categoryName, -changePercent)
			isPositive := true
			icon := "✅"

			if changePercent > 0 {
				title = fmt.Sprintf("%s spending up %.0f%%", categoryName, changePercent)
				isPositive = false
				icon = "⚠️"
			}

			insights = append(insights, &pfinancev1.SpendingInsight{
				Id:            uuid.New().String(),
				Type:          insightType,
				Title:         title,
				Description:   fmt.Sprintf("$%.2f vs $%.2f last %s", currentAmount, prevAmount, period),
				Category:      categoryName,
				Amount:        currentAmount,
				ChangePercent: changePercent,
				Period:        period,
				Icon:          icon,
				IsPositive:    isPositive,
				CreatedAt:     timestamppb.Now(),
			})
		}
	}

	// Add savings tip if spending increased
	if currentTotal > prevTotal && len(insights) < int(limit) {
		// Find highest spending category
		var highestCategory pfinancev1.ExpenseCategory
		var highestAmount float64
		for cat, amount := range currentByCategory {
			if amount > highestAmount {
				highestAmount = amount
				highestCategory = cat
			}
		}

		insights = append(insights, &pfinancev1.SpendingInsight{
			Id:          uuid.New().String(),
			Type:        pfinancev1.InsightType_INSIGHT_TYPE_SAVINGS_TIP,
			Title:       "Savings tip",
			Description: fmt.Sprintf("Consider reducing %s spending to meet your savings goals. This category accounts for %.0f%% of your spending.", highestCategory.String(), (highestAmount/currentTotal)*100),
			Category:    highestCategory.String(),
			Icon:        "💡",
			IsPositive:  true,
			CreatedAt:   timestamppb.Now(),
		})
	}

	return connect.NewResponse(&pfinancev1.GetSpendingInsightsResponse{
		Insights:    insights,
		GeneratedAt: timestamppb.Now(),
	}), nil
}

// ============================================================================
// Recurring Transaction Handlers
// ============================================================================

// calculateNextOccurrence computes the next occurrence date from startDate by advancing
// according to the given frequency until the result is in the future.
func calculateNextOccurrence(startDate time.Time, frequency pfinancev1.ExpenseFrequency) time.Time {
	now := time.Now()
	next := startDate

	for !next.After(now) {
		switch frequency {
		case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_DAILY:
			next = next.AddDate(0, 0, 1)
		case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_WEEKLY:
			next = next.AddDate(0, 0, 7)
		case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_FORTNIGHTLY:
			next = next.AddDate(0, 0, 14)
		case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY:
			next = next.AddDate(0, 1, 0)
		case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_QUARTERLY:
			next = next.AddDate(0, 3, 0)
		case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ANNUALLY:
			next = next.AddDate(1, 0, 0)
		default:
			// For ONCE or UNSPECIFIED, just return the start date
			return startDate
		}
	}
	return next
}

func (s *FinanceService) CreateRecurringTransaction(ctx context.Context, req *connect.Request[pfinancev1.CreateRecurringTransactionRequest]) (*connect.Response[pfinancev1.CreateRecurringTransactionResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	// Verify ownership for personal, membership for group
	if req.Msg.GroupId == "" {
		if req.Msg.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot create recurring transaction for another user"))
		}
	} else {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Validate frequency is not ONCE
	if req.Msg.Frequency == pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE || req.Msg.Frequency == pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("recurring transaction frequency must not be once or unspecified"))
	}

	startDate := time.Now()
	if req.Msg.StartDate != nil {
		startDate = req.Msg.StartDate.AsTime()
	}

	// Dual-write amount/cents
	amount := req.Msg.Amount
	amountCents := req.Msg.AmountCents
	if amountCents != 0 && amount == 0 {
		amount = float64(amountCents) / 100.0
	} else if amount != 0 && amountCents == 0 {
		amountCents = int64(amount * 100)
	}

	rt := &pfinancev1.RecurringTransaction{
		Id:             uuid.New().String(),
		UserId:         req.Msg.UserId,
		GroupId:        req.Msg.GroupId,
		Description:    req.Msg.Description,
		Amount:         amount,
		AmountCents:    amountCents,
		Category:       req.Msg.Category,
		Frequency:      req.Msg.Frequency,
		StartDate:      timestamppb.New(startDate),
		NextOccurrence: timestamppb.New(calculateNextOccurrence(startDate, req.Msg.Frequency)),
		Status:         pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		IsExpense:      req.Msg.IsExpense,
		CreatedAt:      timestamppb.Now(),
		UpdatedAt:      timestamppb.Now(),
		Tags:           req.Msg.Tags,
		PaidByUserId:   req.Msg.PaidByUserId,
		SplitType:      req.Msg.SplitType,
		Allocations:    req.Msg.Allocations,
	}

	if req.Msg.EndDate != nil {
		rt.EndDate = req.Msg.EndDate
	}

	if err := s.store.CreateRecurringTransaction(ctx, rt); err != nil {
		return nil, auth.WrapStoreError("create recurring transaction", err)
	}

	return connect.NewResponse(&pfinancev1.CreateRecurringTransactionResponse{
		RecurringTransaction: rt,
	}), nil
}

func (s *FinanceService) GetRecurringTransaction(ctx context.Context, req *connect.Request[pfinancev1.GetRecurringTransactionRequest]) (*connect.Response[pfinancev1.GetRecurringTransactionResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	rt, err := s.store.GetRecurringTransaction(ctx, req.Msg.RecurringTransactionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("recurring transaction not found"))
	}

	// Check authorization
	if rt.GroupId == "" {
		if rt.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot access another user's recurring transaction"))
		}
	} else {
		group, err := s.store.GetGroup(ctx, rt.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	return connect.NewResponse(&pfinancev1.GetRecurringTransactionResponse{
		RecurringTransaction: rt,
	}), nil
}

func (s *FinanceService) UpdateRecurringTransaction(ctx context.Context, req *connect.Request[pfinancev1.UpdateRecurringTransactionRequest]) (*connect.Response[pfinancev1.UpdateRecurringTransactionResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	rt, err := s.store.GetRecurringTransaction(ctx, req.Msg.RecurringTransactionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("recurring transaction not found"))
	}

	// Check authorization
	if rt.GroupId == "" {
		if rt.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot update another user's recurring transaction"))
		}
	} else {
		group, err := s.store.GetGroup(ctx, rt.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	// Merge fields
	if req.Msg.Description != "" {
		rt.Description = req.Msg.Description
	}
	if req.Msg.Amount != 0 || req.Msg.AmountCents != 0 {
		rt.Amount = req.Msg.Amount
		rt.AmountCents = req.Msg.AmountCents
		if rt.AmountCents != 0 && rt.Amount == 0 {
			rt.Amount = float64(rt.AmountCents) / 100.0
		} else if rt.Amount != 0 && rt.AmountCents == 0 {
			rt.AmountCents = int64(rt.Amount * 100)
		}
	}
	if req.Msg.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
		rt.Category = req.Msg.Category
	}

	frequencyChanged := false
	if req.Msg.Frequency != pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_UNSPECIFIED {
		if req.Msg.Frequency == pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE {
			return nil, connect.NewError(connect.CodeInvalidArgument,
				fmt.Errorf("recurring transaction frequency must not be once"))
		}
		frequencyChanged = req.Msg.Frequency != rt.Frequency
		rt.Frequency = req.Msg.Frequency
	}

	if req.Msg.EndDate != nil {
		rt.EndDate = req.Msg.EndDate
	}
	rt.IsExpense = req.Msg.IsExpense
	if len(req.Msg.Tags) > 0 {
		rt.Tags = req.Msg.Tags
	}
	if req.Msg.PaidByUserId != "" {
		rt.PaidByUserId = req.Msg.PaidByUserId
	}
	if req.Msg.SplitType != pfinancev1.SplitType_SPLIT_TYPE_UNSPECIFIED {
		rt.SplitType = req.Msg.SplitType
	}
	if len(req.Msg.Allocations) > 0 {
		rt.Allocations = req.Msg.Allocations
	}

	// Recalculate next_occurrence if frequency changed
	if frequencyChanged && rt.StartDate != nil {
		rt.NextOccurrence = timestamppb.New(calculateNextOccurrence(rt.StartDate.AsTime(), rt.Frequency))
	}

	rt.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateRecurringTransaction(ctx, rt); err != nil {
		return nil, auth.WrapStoreError("update recurring transaction", err)
	}

	return connect.NewResponse(&pfinancev1.UpdateRecurringTransactionResponse{
		RecurringTransaction: rt,
	}), nil
}

func (s *FinanceService) DeleteRecurringTransaction(ctx context.Context, req *connect.Request[pfinancev1.DeleteRecurringTransactionRequest]) (*connect.Response[emptypb.Empty], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	rt, err := s.store.GetRecurringTransaction(ctx, req.Msg.RecurringTransactionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("recurring transaction not found"))
	}

	// Check authorization
	if rt.GroupId == "" {
		if rt.UserId != claims.UID {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("cannot delete another user's recurring transaction"))
		}
	} else {
		group, err := s.store.GetGroup(ctx, rt.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	if err := s.store.DeleteRecurringTransaction(ctx, req.Msg.RecurringTransactionId); err != nil {
		return nil, auth.WrapStoreError("delete recurring transaction", err)
	}

	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) ListRecurringTransactions(ctx context.Context, req *connect.Request[pfinancev1.ListRecurringTransactionsRequest]) (*connect.Response[pfinancev1.ListRecurringTransactionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	userID := req.Msg.UserId
	if userID == "" {
		userID = claims.UID
	}

	// For personal, verify ownership
	if req.Msg.GroupId == "" && userID != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot list another user's recurring transactions"))
	}

	results, nextToken, err := s.store.ListRecurringTransactions(ctx, userID, req.Msg.GroupId, req.Msg.Status, req.Msg.FilterIsExpense, req.Msg.IsExpense, req.Msg.PageSize, req.Msg.PageToken)
	if err != nil {
		return nil, auth.WrapStoreError("list recurring transactions", err)
	}

	return connect.NewResponse(&pfinancev1.ListRecurringTransactionsResponse{
		RecurringTransactions: results,
		NextPageToken:         nextToken,
	}), nil
}

func (s *FinanceService) PauseRecurringTransaction(ctx context.Context, req *connect.Request[pfinancev1.PauseRecurringTransactionRequest]) (*connect.Response[pfinancev1.PauseRecurringTransactionResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	rt, err := s.store.GetRecurringTransaction(ctx, req.Msg.RecurringTransactionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("recurring transaction not found"))
	}

	if rt.GroupId == "" && rt.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot pause another user's recurring transaction"))
	}

	rt.Status = pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_PAUSED
	rt.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateRecurringTransaction(ctx, rt); err != nil {
		return nil, auth.WrapStoreError("pause recurring transaction", err)
	}

	return connect.NewResponse(&pfinancev1.PauseRecurringTransactionResponse{
		RecurringTransaction: rt,
	}), nil
}

func (s *FinanceService) ResumeRecurringTransaction(ctx context.Context, req *connect.Request[pfinancev1.ResumeRecurringTransactionRequest]) (*connect.Response[pfinancev1.ResumeRecurringTransactionResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	rt, err := s.store.GetRecurringTransaction(ctx, req.Msg.RecurringTransactionId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("recurring transaction not found"))
	}

	if rt.GroupId == "" && rt.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied,
			fmt.Errorf("cannot resume another user's recurring transaction"))
	}

	rt.Status = pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE
	// Recalculate next occurrence from now
	if rt.StartDate != nil {
		rt.NextOccurrence = timestamppb.New(calculateNextOccurrence(rt.StartDate.AsTime(), rt.Frequency))
	}
	rt.UpdatedAt = timestamppb.Now()

	if err := s.store.UpdateRecurringTransaction(ctx, rt); err != nil {
		return nil, auth.WrapStoreError("resume recurring transaction", err)
	}

	return connect.NewResponse(&pfinancev1.ResumeRecurringTransactionResponse{
		RecurringTransaction: rt,
	}), nil
}

func (s *FinanceService) GetUpcomingBills(ctx context.Context, req *connect.Request[pfinancev1.GetUpcomingBillsRequest]) (*connect.Response[pfinancev1.GetUpcomingBillsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	userID := req.Msg.UserId
	if userID == "" {
		userID = claims.UID
	}

	// List active recurring transactions
	results, _, err := s.store.ListRecurringTransactions(ctx, userID, req.Msg.GroupId,
		pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		false, false, 100, "")
	if err != nil {
		return nil, auth.WrapStoreError("list recurring transactions", err)
	}

	daysAhead := int32(30)
	if req.Msg.DaysAhead > 0 {
		daysAhead = req.Msg.DaysAhead
	}
	limit := int32(10)
	if req.Msg.Limit > 0 {
		limit = req.Msg.Limit
	}

	cutoff := time.Now().Add(time.Duration(daysAhead) * 24 * time.Hour)

	// Filter by next_occurrence within window and sort
	type rtWithTime struct {
		rt   *pfinancev1.RecurringTransaction
		next time.Time
	}
	var upcoming []rtWithTime
	for _, rt := range results {
		if rt.NextOccurrence == nil {
			continue
		}
		nextTime := rt.NextOccurrence.AsTime()
		if nextTime.Before(cutoff) {
			upcoming = append(upcoming, rtWithTime{rt: rt, next: nextTime})
		}
	}

	// Sort by next occurrence ascending
	sort.Slice(upcoming, func(i, j int) bool {
		return upcoming[i].next.Before(upcoming[j].next)
	})

	// Apply limit
	if int32(len(upcoming)) > limit {
		upcoming = upcoming[:limit]
	}

	bills := make([]*pfinancev1.RecurringTransaction, 0, len(upcoming))
	for _, u := range upcoming {
		bills = append(bills, u.rt)
	}

	return connect.NewResponse(&pfinancev1.GetUpcomingBillsResponse{
		UpcomingBills: bills,
	}), nil
}
