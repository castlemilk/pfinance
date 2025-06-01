package service

import (
	"context"
	"fmt"
	"time"

	"github.com/bufbuild/connect-go"
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
	expense := &pfinancev1.Expense{
		Id:          uuid.New().String(),
		UserId:      req.Msg.UserId,
		GroupId:     req.Msg.GroupId,
		Description: req.Msg.Description,
		Amount:      req.Msg.Amount,
		Category:    req.Msg.Category,
		Frequency:   req.Msg.Frequency,
		Date:        req.Msg.Date,
		CreatedAt:   timestamppb.Now(),
		UpdatedAt:   timestamppb.Now(),
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

// Placeholder implementations for remaining methods
func (s *FinanceService) UpdateExpense(ctx context.Context, req *connect.Request[pfinancev1.UpdateExpenseRequest]) (*connect.Response[pfinancev1.UpdateExpenseResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) DeleteExpense(ctx context.Context, req *connect.Request[pfinancev1.DeleteExpenseRequest]) (*connect.Response[emptypb.Empty], error) {
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) BatchCreateExpenses(ctx context.Context, req *connect.Request[pfinancev1.BatchCreateExpensesRequest]) (*connect.Response[pfinancev1.BatchCreateExpensesResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) GetUser(ctx context.Context, req *connect.Request[pfinancev1.GetUserRequest]) (*connect.Response[pfinancev1.GetUserResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) UpdateUser(ctx context.Context, req *connect.Request[pfinancev1.UpdateUserRequest]) (*connect.Response[pfinancev1.UpdateUserResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) UpdateIncome(ctx context.Context, req *connect.Request[pfinancev1.UpdateIncomeRequest]) (*connect.Response[pfinancev1.UpdateIncomeResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) DeleteIncome(ctx context.Context, req *connect.Request[pfinancev1.DeleteIncomeRequest]) (*connect.Response[emptypb.Empty], error) {
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) ListIncomes(ctx context.Context, req *connect.Request[pfinancev1.ListIncomesRequest]) (*connect.Response[pfinancev1.ListIncomesResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) UpdateTaxConfig(ctx context.Context, req *connect.Request[pfinancev1.UpdateTaxConfigRequest]) (*connect.Response[pfinancev1.UpdateTaxConfigResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) GetGroup(ctx context.Context, req *connect.Request[pfinancev1.GetGroupRequest]) (*connect.Response[pfinancev1.GetGroupResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) UpdateGroup(ctx context.Context, req *connect.Request[pfinancev1.UpdateGroupRequest]) (*connect.Response[pfinancev1.UpdateGroupResponse], error) {
	return nil, fmt.Errorf("not implemented")
}

func (s *FinanceService) DeleteGroup(ctx context.Context, req *connect.Request[pfinancev1.DeleteGroupRequest]) (*connect.Response[emptypb.Empty], error) {
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) DeclineInvitation(ctx context.Context, req *connect.Request[pfinancev1.DeclineInvitationRequest]) (*connect.Response[emptypb.Empty], error) {
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) RemoveFromGroup(ctx context.Context, req *connect.Request[pfinancev1.RemoveFromGroupRequest]) (*connect.Response[emptypb.Empty], error) {
	return connect.NewResponse(&emptypb.Empty{}), nil
}

func (s *FinanceService) UpdateMemberRole(ctx context.Context, req *connect.Request[pfinancev1.UpdateMemberRoleRequest]) (*connect.Response[pfinancev1.UpdateMemberRoleResponse], error) {
	return nil, fmt.Errorf("not implemented")
}