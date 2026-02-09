package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// testContext creates a context with authenticated user claims for testing
func testContext(userID string) context.Context {
	return auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:         userID,
		Email:       userID + "@test.com",
		DisplayName: "Test User",
		Verified:    true,
	})
}

func TestCreateExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.CreateExpenseRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful expense creation",
			request: &pfinancev1.CreateExpenseRequest{
				UserId:      "user-123",
				Description: "Coffee",
				Amount:      5.50,
				Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
				Date:        timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "successful group expense creation",
			request: &pfinancev1.CreateExpenseRequest{
				UserId:      "user-123",
				GroupId:     "group-456",
				Description: "Team lunch",
				Amount:      50.00,
				Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
				Date:        timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "store error during creation",
			request: &pfinancev1.CreateExpenseRequest{
				UserId:      "user-123",
				Description: "Coffee",
				Amount:      5.50,
				Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
				Date:        timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)

			resp, err := service.CreateExpense(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Expense == nil {
				t.Error("Expected expense in response")
				return
			}

			// Verify expense fields
			if resp.Msg.Expense.UserId != tt.request.UserId {
				t.Errorf("Expected UserId %s, got %s", tt.request.UserId, resp.Msg.Expense.UserId)
			}
			if resp.Msg.Expense.Description != tt.request.Description {
				t.Errorf("Expected Description %s, got %s", tt.request.Description, resp.Msg.Expense.Description)
			}
			if resp.Msg.Expense.Amount != tt.request.Amount {
				t.Errorf("Expected Amount %f, got %f", tt.request.Amount, resp.Msg.Expense.Amount)
			}
		})
	}
}

func TestGetExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	userID := "user-123"
	ctx := testContextWithUser(userID)

	mockExpense := &pfinancev1.Expense{
		Id:          "exp-123",
		UserId:      userID,
		Description: "Test Expense",
		Amount:      50.00,
		Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
	}

	mockGroupExpense := &pfinancev1.Expense{
		Id:          "exp-456",
		UserId:      "other-user",
		GroupId:     "group-123",
		Description: "Group Expense",
		Amount:      100.00,
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetExpenseRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful retrieval of personal expense",
			request: &pfinancev1.GetExpenseRequest{
				ExpenseId: "exp-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)
			},
			expectedError: false,
		},
		{
			name: "successful retrieval of group expense",
			request: &pfinancev1.GetExpenseRequest{
				ExpenseId: "exp-456",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-456").
					Return(mockGroupExpense, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   userID,
						MemberIds: []string{userID, "other-user"},
					}, nil)
			},
			expectedError: false,
		},
		{
			name: "expense not found",
			request: &pfinancev1.GetExpenseRequest{
				ExpenseId: "exp-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "permission denied for another user's expense",
			request: &pfinancev1.GetExpenseRequest{
				ExpenseId: "exp-789",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-789").
					Return(&pfinancev1.Expense{
						Id:     "exp-789",
						UserId: "different-user",
					}, nil)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.GetExpense(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Expense == nil {
				t.Error("Expected expense in response")
			}
		})
	}
}

func TestCreateExpenseWithAllocation(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name               string
		request            *pfinancev1.CreateExpenseRequest
		expectedAllocCount int
		expectedAmount     float64
	}{
		{
			name: "equal split among 4 users",
			request: &pfinancev1.CreateExpenseRequest{
				UserId:           "user-123",
				GroupId:          "group-456",
				Description:      "Shared dinner",
				Amount:           100.00,
				Category:         pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Frequency:        pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
				Date:             timestamppb.Now(),
				PaidByUserId:     "user-123",
				SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
				AllocatedUserIds: []string{"user-123", "user-456", "user-789", "user-012"},
			},
			expectedAllocCount: 4,
			expectedAmount:     25.00,
		},
		{
			name: "no split specified - defaults to payer only",
			request: &pfinancev1.CreateExpenseRequest{
				UserId:       "user-123",
				Description:  "Personal expense",
				Amount:       50.00,
				Category:     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Frequency:    pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
				Date:         timestamppb.Now(),
				PaidByUserId: "user-123",
			},
			expectedAllocCount: 0, // No allocations for unspecified split type
			expectedAmount:     0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Add GetGroup mock for group expenses
			if tt.request.GroupId != "" {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), tt.request.GroupId).
					Return(&pfinancev1.FinanceGroup{
						Id:        tt.request.GroupId,
						OwnerId:   tt.request.UserId,
						MemberIds: []string{tt.request.UserId},
					}, nil)
			}

			mockStore.EXPECT().
				CreateExpense(gomock.Any(), gomock.Any()).
				DoAndReturn(func(_ context.Context, expense *pfinancev1.Expense) error {
					// Verify allocations
					if len(expense.Allocations) != tt.expectedAllocCount {
						t.Errorf("Expected %d allocations, got %d", tt.expectedAllocCount, len(expense.Allocations))
					}

					if tt.expectedAllocCount > 0 {
						for _, alloc := range expense.Allocations {
							if alloc.Amount != tt.expectedAmount {
								t.Errorf("Expected allocation amount %f, got %f", tt.expectedAmount, alloc.Amount)
							}
							if alloc.IsPaid != false {
								t.Error("Expected IsPaid to be false for new allocations")
							}
						}
					}

					// Verify paid_by_user_id is set correctly
					if expense.PaidByUserId != tt.request.PaidByUserId {
						t.Errorf("Expected PaidByUserId %s, got %s", tt.request.PaidByUserId, expense.PaidByUserId)
					}

					return nil
				})

			ctx := testContext(tt.request.UserId)
			_, err := service.CreateExpense(ctx, connect.NewRequest(tt.request))
			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestListExpenses(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockExpenses := []*pfinancev1.Expense{
		{
			Id:          "exp-1",
			UserId:      "user-123",
			Description: "Coffee",
			Amount:      5.50,
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
		{
			Id:          "exp-2",
			UserId:      "user-123",
			Description: "Lunch",
			Amount:      15.00,
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.ListExpensesRequest
		setupMock     func()
		expectedCount int
		expectedError bool
	}{
		{
			name: "successful list personal expenses",
			request: &pfinancev1.ListExpensesRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(10), "").
					Return(mockExpenses, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "successful list group expenses",
			request: &pfinancev1.ListExpensesRequest{
				UserId:   "user-123",
				GroupId:  "group-456",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "user-123", "group-456", gomock.Any(), gomock.Any(), int32(10), "").
					Return(mockExpenses, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "store error during listing",
			request: &pfinancev1.ListExpensesRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)

			resp, err := service.ListExpenses(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.Expenses) != tt.expectedCount {
				t.Errorf("Expected %d expenses, got %d", tt.expectedCount, len(resp.Msg.Expenses))
			}
		})
	}
}

func TestCreateGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.CreateGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful group creation",
			request: &pfinancev1.CreateGroupRequest{
				OwnerId:     "user-123",
				Name:        "Family Budget",
				Description: "Family expense tracking",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetUser(gomock.Any(), "user-123").
					Return(nil, errors.New("not found"))
				mockStore.EXPECT().
					CreateGroup(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "store error during creation",
			request: &pfinancev1.CreateGroupRequest{
				OwnerId: "user-123",
				Name:    "Family Budget",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetUser(gomock.Any(), "user-123").
					Return(nil, errors.New("not found"))
				mockStore.EXPECT().
					CreateGroup(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.OwnerId)

			resp, err := service.CreateGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Group == nil {
				t.Error("Expected group in response")
				return
			}

			// Verify group fields
			if resp.Msg.Group.Name != tt.request.Name {
				t.Errorf("Expected Name %s, got %s", tt.request.Name, resp.Msg.Group.Name)
			}
			if resp.Msg.Group.OwnerId != tt.request.OwnerId {
				t.Errorf("Expected OwnerId %s, got %s", tt.request.OwnerId, resp.Msg.Group.OwnerId)
			}
			if len(resp.Msg.Group.Members) != 1 {
				t.Errorf("Expected 1 member, got %d", len(resp.Msg.Group.Members))
			}
		})
	}
}

func TestInviteToGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.InviteToGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful invitation creation",
			request: &pfinancev1.InviteToGroupRequest{
				GroupId:      "group-123",
				InviterId:    "user-456",
				InviteeEmail: "invite@example.com",
				Role:         pfinancev1.GroupRole_GROUP_ROLE_MEMBER,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-456",
						MemberIds: []string{"user-456"},
					}, nil)
				mockStore.EXPECT().
					CreateInvitation(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "store error during invitation creation",
			request: &pfinancev1.InviteToGroupRequest{
				GroupId:      "group-123",
				InviterId:    "user-456",
				InviteeEmail: "invite@example.com",
				Role:         pfinancev1.GroupRole_GROUP_ROLE_MEMBER,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-456",
						MemberIds: []string{"user-456"},
					}, nil)
				mockStore.EXPECT().
					CreateInvitation(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.InviterId)

			resp, err := service.InviteToGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Invitation == nil {
				t.Error("Expected invitation in response")
				return
			}

			// Verify invitation fields
			if resp.Msg.Invitation.GroupId != tt.request.GroupId {
				t.Errorf("Expected GroupId %s, got %s", tt.request.GroupId, resp.Msg.Invitation.GroupId)
			}
			if resp.Msg.Invitation.InviteeEmail != tt.request.InviteeEmail {
				t.Errorf("Expected InviteeEmail %s, got %s", tt.request.InviteeEmail, resp.Msg.Invitation.InviteeEmail)
			}
			if resp.Msg.Invitation.Status != pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING {
				t.Errorf("Expected PENDING status, got %v", resp.Msg.Invitation.Status)
			}
		})
	}
}

func TestAcceptInvitation(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockInvitation := &pfinancev1.GroupInvitation{
		Id:           "inv-123",
		GroupId:      "group-456",
		InviterId:    "user-789",
		InviteeEmail: "user-999@test.com", // Must match test context email
		Role:         pfinancev1.GroupRole_GROUP_ROLE_MEMBER,
		Status:       pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING,
		ExpiresAt:    timestamppb.New(time.Now().Add(24 * time.Hour)), // Not expired
	}

	mockGroup := &pfinancev1.FinanceGroup{
		Id:        "group-456",
		Name:      "Test Group",
		OwnerId:   "user-789",
		MemberIds: []string{"user-789"},
		Members: []*pfinancev1.GroupMember{
			{
				UserId: "user-789",
				Role:   pfinancev1.GroupRole_GROUP_ROLE_OWNER,
			},
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.AcceptInvitationRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful invitation acceptance",
			request: &pfinancev1.AcceptInvitationRequest{
				InvitationId: "inv-123",
				UserId:       "user-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInvitation(gomock.Any(), "inv-123").
					Return(mockInvitation, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(mockGroup, nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					Return(nil)

				mockStore.EXPECT().
					UpdateInvitation(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "invitation not found",
			request: &pfinancev1.AcceptInvitationRequest{
				InvitationId: "inv-123",
				UserId:       "user-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInvitation(gomock.Any(), "inv-123").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)

			resp, err := service.AcceptInvitation(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Group == nil {
				t.Error("Expected group in response")
			}
		})
	}
}

func TestCreateIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.CreateIncomeRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful income creation",
			request: &pfinancev1.CreateIncomeRequest{
				UserId:    "user-123",
				Source:    "Salary",
				Amount:    5000.00,
				Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
				TaxStatus: pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX,
				Date:      timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					CreateIncome(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "store error during creation",
			request: &pfinancev1.CreateIncomeRequest{
				UserId:    "user-123",
				Source:    "Salary",
				Amount:    5000.00,
				Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
				TaxStatus: pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX,
				Date:      timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					CreateIncome(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)

			resp, err := service.CreateIncome(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Income == nil {
				t.Error("Expected income in response")
				return
			}

			// Verify income fields
			if resp.Msg.Income.UserId != tt.request.UserId {
				t.Errorf("Expected UserId %s, got %s", tt.request.UserId, resp.Msg.Income.UserId)
			}
			if resp.Msg.Income.Source != tt.request.Source {
				t.Errorf("Expected Source %s, got %s", tt.request.Source, resp.Msg.Income.Source)
			}
			if resp.Msg.Income.Amount != tt.request.Amount {
				t.Errorf("Expected Amount %f, got %f", tt.request.Amount, resp.Msg.Income.Amount)
			}
		})
	}
}

func TestGetIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	userID := "user-123"
	ctx := testContextWithUser(userID)

	mockIncome := &pfinancev1.Income{
		Id:        "inc-123",
		UserId:    userID,
		Source:    "Salary",
		Amount:    5000.00,
		Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
	}

	mockGroupIncome := &pfinancev1.Income{
		Id:      "inc-456",
		UserId:  "other-user",
		GroupId: "group-123",
		Source:  "Shared Income",
		Amount:  1000.00,
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetIncomeRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful retrieval of personal income",
			request: &pfinancev1.GetIncomeRequest{
				IncomeId: "inc-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "inc-123").
					Return(mockIncome, nil)
			},
			expectedError: false,
		},
		{
			name: "successful retrieval of group income",
			request: &pfinancev1.GetIncomeRequest{
				IncomeId: "inc-456",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "inc-456").
					Return(mockGroupIncome, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   userID,
						MemberIds: []string{userID, "other-user"},
					}, nil)
			},
			expectedError: false,
		},
		{
			name: "income not found",
			request: &pfinancev1.GetIncomeRequest{
				IncomeId: "inc-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "inc-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "permission denied for another user's income",
			request: &pfinancev1.GetIncomeRequest{
				IncomeId: "inc-789",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "inc-789").
					Return(&pfinancev1.Income{
						Id:     "inc-789",
						UserId: "different-user",
					}, nil)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.GetIncome(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Income == nil {
				t.Error("Expected income in response")
			}
		})
	}
}

func TestGetTaxConfig(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockTaxConfig := &pfinancev1.TaxConfig{
		Enabled:           true,
		Country:           pfinancev1.TaxCountry_TAX_COUNTRY_AUSTRALIA,
		TaxRate:           0.30,
		IncludeDeductions: true,
		Settings: &pfinancev1.TaxSettings{
			IncludeSuper:    true,
			SuperRate:       11.5,
			IncludeMedicare: true,
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetTaxConfigRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful tax config retrieval",
			request: &pfinancev1.GetTaxConfigRequest{
				UserId: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetTaxConfig(gomock.Any(), "user-123", "").
					Return(mockTaxConfig, nil)
			},
			expectedError: false,
		},
		{
			name: "store error during retrieval",
			request: &pfinancev1.GetTaxConfigRequest{
				UserId: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetTaxConfig(gomock.Any(), "user-123", "").
					Return(nil, errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)

			resp, err := service.GetTaxConfig(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.TaxConfig == nil {
				t.Error("Expected tax config in response")
			}
		})
	}
}

func TestUpdateExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	existingExpense := &pfinancev1.Expense{
		Id:           "expense-123",
		UserId:       "user-123",
		GroupId:      "group-456",
		Description:  "Original dinner",
		Amount:       50.00,
		Category:     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		PaidByUserId: "user-123",
		SplitType:    pfinancev1.SplitType_SPLIT_TYPE_UNSPECIFIED,
	}

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateExpenseRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful update with new split",
			request: &pfinancev1.UpdateExpenseRequest{
				ExpenseId:        "expense-123",
				Description:      "Updated dinner",
				Amount:           100.00,
				SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
				AllocatedUserIds: []string{"user-123", "user-456"},
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "expense-123").
					Return(existingExpense, nil)

				// Group membership check for group expense
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					UpdateExpense(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, expense *pfinancev1.Expense) error {
						// Verify updates
						if expense.Description != "Updated dinner" {
							t.Errorf("Expected description 'Updated dinner', got %s", expense.Description)
						}
						if expense.Amount != 100.00 {
							t.Errorf("Expected amount 100.00, got %f", expense.Amount)
						}
						if len(expense.Allocations) != 2 {
							t.Errorf("Expected 2 allocations, got %d", len(expense.Allocations))
						}
						for _, alloc := range expense.Allocations {
							if alloc.Amount != 50.00 {
								t.Errorf("Expected allocation amount 50.00, got %f", alloc.Amount)
							}
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "expense not found",
			request: &pfinancev1.UpdateExpenseRequest{
				ExpenseId:   "expense-999",
				Description: "Updated",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "expense-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123") // Use same user as existingExpense

			resp, err := service.UpdateExpense(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Expense == nil {
				t.Error("Expected expense in response")
			}
		})
	}
}

func TestDeleteExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	// Mock expense for authorization check
	mockExpense := &pfinancev1.Expense{
		Id:     "expense-123",
		UserId: "user-123",
	}

	tests := []struct {
		name          string
		request       *pfinancev1.DeleteExpenseRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful deletion",
			request: &pfinancev1.DeleteExpenseRequest{
				ExpenseId: "expense-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "expense-123").
					Return(mockExpense, nil)
				mockStore.EXPECT().
					DeleteExpense(gomock.Any(), "expense-123").
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "expense not found",
			request: &pfinancev1.DeleteExpenseRequest{
				ExpenseId: "expense-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "expense-999").
					Return(nil, errors.New("expense not found"))
			},
			expectedError: true,
		},
		{
			name: "store error",
			request: &pfinancev1.DeleteExpenseRequest{
				ExpenseId: "expense-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "expense-123").
					Return(mockExpense, nil)
				mockStore.EXPECT().
					DeleteExpense(gomock.Any(), "expense-123").
					Return(errors.New("database connection error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			_, err := service.DeleteExpense(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestBatchCreateExpenses(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.BatchCreateExpensesRequest
		setupMock     func()
		expectedError bool
		expectedCount int
	}{
		{
			name: "successful batch creation",
			request: &pfinancev1.BatchCreateExpensesRequest{
				GroupId: "group-456",
				Expenses: []*pfinancev1.CreateExpenseRequest{
					{
						UserId:      "user-123",
						Description: "Coffee",
						Amount:      5.50,
						Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
						Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
						Date:        timestamppb.Now(),
					},
					{
						UserId:      "user-123",
						Description: "Lunch",
						Amount:      15.00,
						Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
						Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
						Date:        timestamppb.Now(),
					},
				},
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					Return(nil).
					Times(2)
			},
			expectedError: false,
			expectedCount: 2,
		},
		{
			name: "empty batch",
			request: &pfinancev1.BatchCreateExpensesRequest{
				GroupId:  "group-456",
				Expenses: []*pfinancev1.CreateExpenseRequest{},
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
			},
			expectedError: false,
			expectedCount: 0,
		},
		{
			name: "batch with split allocation",
			request: &pfinancev1.BatchCreateExpensesRequest{
				GroupId: "group-456",
				Expenses: []*pfinancev1.CreateExpenseRequest{
					{
						UserId:           "user-123",
						Description:      "Team dinner",
						Amount:           100.00,
						Category:         pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
						Frequency:        pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
						Date:             timestamppb.Now(),
						PaidByUserId:     "user-123",
						SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
						AllocatedUserIds: []string{"user-123", "user-456"},
					},
				},
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, expense *pfinancev1.Expense) error {
						if len(expense.Allocations) != 2 {
							t.Errorf("Expected 2 allocations, got %d", len(expense.Allocations))
						}
						for _, alloc := range expense.Allocations {
							if alloc.Amount != 50.00 {
								t.Errorf("Expected allocation amount 50.00, got %f", alloc.Amount)
							}
						}
						return nil
					})
			},
			expectedError: false,
			expectedCount: 1,
		},
		{
			name: "store error on first expense",
			request: &pfinancev1.BatchCreateExpensesRequest{
				GroupId: "group-456",
				Expenses: []*pfinancev1.CreateExpenseRequest{
					{
						UserId:      "user-123",
						Description: "Coffee",
						Amount:      5.50,
						Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
						Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
						Date:        timestamppb.Now(),
					},
					{
						UserId:      "user-123",
						Description: "Lunch",
						Amount:      15.00,
						Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
						Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
						Date:        timestamppb.Now(),
					},
				},
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.BatchCreateExpenses(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.Expenses) != tt.expectedCount {
				t.Errorf("Expected %d expenses, got %d", tt.expectedCount, len(resp.Msg.Expenses))
			}

			// Verify each expense has required fields
			for i, expense := range resp.Msg.Expenses {
				if expense.Id == "" {
					t.Errorf("Expense %d missing ID", i)
				}
				if expense.GroupId != tt.request.GroupId {
					t.Errorf("Expense %d has wrong GroupId: expected %s, got %s", i, tt.request.GroupId, expense.GroupId)
				}
			}
		})
	}
}

func TestUpdateIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	// Helper function to create fresh mock income for each test
	createMockIncome := func() *pfinancev1.Income {
		return &pfinancev1.Income{
			Id:        "income-123",
			UserId:    "user-123",
			Source:    "Salary",
			Amount:    5000.00,
			Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
			TaxStatus: pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX,
		}
	}

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateIncomeRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful update",
			request: &pfinancev1.UpdateIncomeRequest{
				IncomeId: "income-123",
				Source:   "Updated Salary",
				Amount:   6000.00,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-123").
					Return(createMockIncome(), nil)

				mockStore.EXPECT().
					UpdateIncome(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, income *pfinancev1.Income) error {
						if income.Source != "Updated Salary" {
							t.Errorf("Expected source 'Updated Salary', got %s", income.Source)
						}
						if income.Amount != 6000.00 {
							t.Errorf("Expected amount 6000.00, got %f", income.Amount)
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "income not found",
			request: &pfinancev1.UpdateIncomeRequest{
				IncomeId: "income-999",
				Source:   "Updated",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.UpdateIncomeRequest{
				IncomeId: "income-123",
				Amount:   7000.00,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-123").
					Return(createMockIncome(), nil)

				mockStore.EXPECT().
					UpdateIncome(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
		{
			name: "partial update - only frequency",
			request: &pfinancev1.UpdateIncomeRequest{
				IncomeId:  "income-123",
				Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_WEEKLY,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-123").
					Return(createMockIncome(), nil)

				mockStore.EXPECT().
					UpdateIncome(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, income *pfinancev1.Income) error {
						if income.Frequency != pfinancev1.IncomeFrequency_INCOME_FREQUENCY_WEEKLY {
							t.Errorf("Expected weekly frequency, got %v", income.Frequency)
						}
						// Original values should be preserved
						if income.Source != "Salary" {
							t.Errorf("Expected source 'Salary' preserved, got %s", income.Source)
						}
						return nil
					})
			},
			expectedError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.UpdateIncome(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Income == nil {
				t.Error("Expected income in response")
			}
		})
	}
}

func TestDeleteIncome(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockIncome := &pfinancev1.Income{
		Id:     "income-123",
		UserId: "user-123",
	}

	tests := []struct {
		name          string
		request       *pfinancev1.DeleteIncomeRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful deletion",
			request: &pfinancev1.DeleteIncomeRequest{
				IncomeId: "income-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-123").
					Return(mockIncome, nil)
				mockStore.EXPECT().
					DeleteIncome(gomock.Any(), "income-123").
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "income not found",
			request: &pfinancev1.DeleteIncomeRequest{
				IncomeId: "income-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-999").
					Return(nil, errors.New("income not found"))
			},
			expectedError: true,
		},
		{
			name: "store error",
			request: &pfinancev1.DeleteIncomeRequest{
				IncomeId: "income-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetIncome(gomock.Any(), "income-123").
					Return(mockIncome, nil)
				mockStore.EXPECT().
					DeleteIncome(gomock.Any(), "income-123").
					Return(errors.New("database connection error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			_, err := service.DeleteIncome(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestListIncomes(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockIncomes := []*pfinancev1.Income{
		{
			Id:        "income-1",
			UserId:    "user-123",
			Source:    "Salary",
			Amount:    5000.00,
			Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
		},
		{
			Id:        "income-2",
			UserId:    "user-123",
			Source:    "Freelance",
			Amount:    1500.00,
			Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_WEEKLY,
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.ListIncomesRequest
		setupMock     func()
		expectedCount int
		expectedError bool
	}{
		{
			name: "successful list personal incomes",
			request: &pfinancev1.ListIncomesRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(10), "").
					Return(mockIncomes, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "successful list group incomes",
			request: &pfinancev1.ListIncomesRequest{
				UserId:   "user-123",
				GroupId:  "group-456",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-456").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-456",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "user-123", "group-456", gomock.Any(), gomock.Any(), int32(10), "").
					Return(mockIncomes, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "empty results",
			request: &pfinancev1.ListIncomesRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListIncomes(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return([]*pfinancev1.Income{}, "", nil)
			},
			expectedCount: 0,
			expectedError: false,
		},
		{
			name: "with date filters",
			request: &pfinancev1.ListIncomesRequest{
				UserId:    "user-123",
				StartDate: timestamppb.New(time.Now().AddDate(0, -1, 0)),
				EndDate:   timestamppb.Now(),
				PageSize:  10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(10), "").
					Return(mockIncomes, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.ListIncomesRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListIncomes(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
		{
			name: "default page size",
			request: &pfinancev1.ListIncomesRequest{
				UserId: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(100), "").
					Return(mockIncomes, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.ListIncomes(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.Incomes) != tt.expectedCount {
				t.Errorf("Expected %d incomes, got %d", tt.expectedCount, len(resp.Msg.Incomes))
			}
		})
	}
}

// Phase 2: Group Operations

func TestListGroups(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockGroups := []*pfinancev1.FinanceGroup{
		{
			Id:        "group-1",
			Name:      "Family Budget",
			OwnerId:   "user-123",
			MemberIds: []string{"user-123", "user-456"},
		},
		{
			Id:        "group-2",
			Name:      "Roommates",
			OwnerId:   "user-123",
			MemberIds: []string{"user-123", "user-789"},
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.ListGroupsRequest
		setupMock     func()
		expectedCount int
		expectedError bool
	}{
		{
			name: "successful list",
			request: &pfinancev1.ListGroupsRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListGroups(gomock.Any(), "user-123", int32(10), "").
					Return(mockGroups, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "empty list",
			request: &pfinancev1.ListGroupsRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListGroups(gomock.Any(), "user-123", int32(10), "").
					Return([]*pfinancev1.FinanceGroup{}, "", nil)
			},
			expectedCount: 0,
			expectedError: false,
		},
		{
			name: "default page size",
			request: &pfinancev1.ListGroupsRequest{
				UserId: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListGroups(gomock.Any(), "user-123", int32(100), "").
					Return(mockGroups, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.ListGroupsRequest{
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListGroups(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.ListGroups(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.Groups) != tt.expectedCount {
				t.Errorf("Expected %d groups, got %d", tt.expectedCount, len(resp.Msg.Groups))
			}
		})
	}
}

func TestGetGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockGroup := &pfinancev1.FinanceGroup{
		Id:          "group-123",
		Name:        "Family Budget",
		Description: "Family expense tracking",
		OwnerId:     "user-123",
		MemberIds:   []string{"user-123", "user-456"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
			{UserId: "user-456", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful retrieval",
			request: &pfinancev1.GetGroupRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(mockGroup, nil)
			},
			expectedError: false,
		},
		{
			name: "group not found",
			request: &pfinancev1.GetGroupRequest{
				GroupId: "group-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-999").
					Return(nil, errors.New("group not found"))
			},
			expectedError: true,
		},
		{
			name: "store error",
			request: &pfinancev1.GetGroupRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(nil, errors.New("database error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.GetGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Group == nil {
				t.Error("Expected group in response")
				return
			}

			if resp.Msg.Group.Id != mockGroup.Id {
				t.Errorf("Expected group ID %s, got %s", mockGroup.Id, resp.Msg.Group.Id)
			}
			if resp.Msg.Group.Name != mockGroup.Name {
				t.Errorf("Expected group name %s, got %s", mockGroup.Name, resp.Msg.Group.Name)
			}
		})
	}
}

func TestUpdateGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	// Helper to create fresh mock group for each test
	createMockGroup := func() *pfinancev1.FinanceGroup {
		return &pfinancev1.FinanceGroup{
			Id:          "group-123",
			Name:        "Original Name",
			Description: "Original description",
			OwnerId:     "user-123",
			MemberIds:   []string{"user-123"},
			Members: []*pfinancev1.GroupMember{
				{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
			},
		}
	}

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful update",
			request: &pfinancev1.UpdateGroupRequest{
				GroupId:     "group-123",
				Name:        "Updated Name",
				Description: "Updated description",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(createMockGroup(), nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, group *pfinancev1.FinanceGroup) error {
						if group.Name != "Updated Name" {
							t.Errorf("Expected name 'Updated Name', got %s", group.Name)
						}
						if group.Description != "Updated description" {
							t.Errorf("Expected description 'Updated description', got %s", group.Description)
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "partial update - only name",
			request: &pfinancev1.UpdateGroupRequest{
				GroupId: "group-123",
				Name:    "New Name Only",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(createMockGroup(), nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, group *pfinancev1.FinanceGroup) error {
						if group.Name != "New Name Only" {
							t.Errorf("Expected name 'New Name Only', got %s", group.Name)
						}
						// Description should be preserved
						if group.Description != "Original description" {
							t.Errorf("Expected description to be preserved as 'Original description', got %s", group.Description)
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "group not found",
			request: &pfinancev1.UpdateGroupRequest{
				GroupId: "group-999",
				Name:    "Updated",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.UpdateGroupRequest{
				GroupId: "group-123",
				Name:    "Updated",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(createMockGroup(), nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.UpdateGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Group == nil {
				t.Error("Expected group in response")
			}
		})
	}
}

func TestDeleteGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.DeleteGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful deletion",
			request: &pfinancev1.DeleteGroupRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:      "group-123",
						OwnerId: "user-123",
					}, nil)
				mockStore.EXPECT().
					DeleteGroup(gomock.Any(), "group-123").
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "group not found",
			request: &pfinancev1.DeleteGroupRequest{
				GroupId: "group-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-999").
					Return(nil, errors.New("group not found"))
			},
			expectedError: true,
		},
		{
			name: "store error",
			request: &pfinancev1.DeleteGroupRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:      "group-123",
						OwnerId: "user-123",
					}, nil)
				mockStore.EXPECT().
					DeleteGroup(gomock.Any(), "group-123").
					Return(errors.New("database error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			_, err := service.DeleteGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

// Phase 2: User Operations

func TestGetUser(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.GetUserRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful retrieval",
			request: &pfinancev1.GetUserRequest{
				UserId: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetUser(gomock.Any(), "user-123").
					Return(&pfinancev1.User{
						Id:          "user-123",
						DisplayName: "Test User",
						Email:       "test@example.com",
					}, nil)
			},
			expectedError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)
			resp, err := service.GetUser(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.User == nil {
				t.Error("Expected user in response")
				return
			}

			if resp.Msg.User.Id != tt.request.UserId {
				t.Errorf("Expected user ID %s, got %s", tt.request.UserId, resp.Msg.User.Id)
			}
		})
	}
}

func TestUpdateUser(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateUserRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful update",
			request: &pfinancev1.UpdateUserRequest{
				UserId:      "user-123",
				DisplayName: "John Doe",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetUser(gomock.Any(), "user-123").
					Return(nil, errors.New("not found"))
				mockStore.EXPECT().
					UpdateUser(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)
			resp, err := service.UpdateUser(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.User == nil {
				t.Error("Expected user in response")
				return
			}

			if resp.Msg.User.Id != tt.request.UserId {
				t.Errorf("Expected user ID %s, got %s", tt.request.UserId, resp.Msg.User.Id)
			}
			if resp.Msg.User.DisplayName != tt.request.DisplayName {
				t.Errorf("Expected display name %s, got %s", tt.request.DisplayName, resp.Msg.User.DisplayName)
			}
		})
	}
}

// Phase 2: Invitation Operations

func TestListInvitations(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockInvitations := []*pfinancev1.GroupInvitation{
		{
			Id:           "inv-1",
			GroupId:      "group-123",
			InviterId:    "user-456",
			InviteeEmail: "test@example.com",
			Status:       pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING,
		},
		{
			Id:           "inv-2",
			GroupId:      "group-789",
			InviterId:    "user-012",
			InviteeEmail: "test@example.com",
			Status:       pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING,
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.ListInvitationsRequest
		setupMock     func()
		expectedCount int
		expectedError bool
	}{
		{
			name: "successful list all pending",
			request: &pfinancev1.ListInvitationsRequest{
				UserEmail: "test@example.com",
				PageSize:  10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListInvitations(gomock.Any(), "test@example.com", gomock.Nil(), int32(10), "").
					Return(mockInvitations, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "filter by status",
			request: &pfinancev1.ListInvitationsRequest{
				UserEmail: "test@example.com",
				Status:    pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING,
				PageSize:  10,
			},
			setupMock: func() {
				status := pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING
				mockStore.EXPECT().
					ListInvitations(gomock.Any(), "test@example.com", &status, int32(10), "").
					Return(mockInvitations, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "empty results",
			request: &pfinancev1.ListInvitationsRequest{
				UserEmail: "test@example.com",
				PageSize:  10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListInvitations(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return([]*pfinancev1.GroupInvitation{}, "", nil)
			},
			expectedCount: 0,
			expectedError: false,
		},
		{
			name: "default page size",
			request: &pfinancev1.ListInvitationsRequest{
				UserEmail: "test@example.com",
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListInvitations(gomock.Any(), "test@example.com", gomock.Nil(), int32(100), "").
					Return(mockInvitations, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.ListInvitationsRequest{
				UserEmail: "test@example.com",
				PageSize:  10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					ListInvitations(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			// Use email matching the test request
			ctx := testContextWithUserEmail("user-123", tt.request.UserEmail)

			resp, err := service.ListInvitations(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.Invitations) != tt.expectedCount {
				t.Errorf("Expected %d invitations, got %d", tt.expectedCount, len(resp.Msg.Invitations))
			}
		})
	}
}

func TestDeclineInvitation(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockInvitation := &pfinancev1.GroupInvitation{
		Id:           "inv-123",
		GroupId:      "group-456",
		InviterId:    "user-789",
		InviteeEmail: "test@example.com",
		Status:       pfinancev1.InvitationStatus_INVITATION_STATUS_PENDING,
		ExpiresAt:    timestamppb.New(time.Now().Add(24 * time.Hour)),
	}

	tests := []struct {
		name          string
		request       *pfinancev1.DeclineInvitationRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful decline",
			request: &pfinancev1.DeclineInvitationRequest{
				InvitationId: "inv-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInvitation(gomock.Any(), "inv-123").
					Return(mockInvitation, nil)

				mockStore.EXPECT().
					UpdateInvitation(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, inv *pfinancev1.GroupInvitation) error {
						if inv.Status != pfinancev1.InvitationStatus_INVITATION_STATUS_DECLINED {
							t.Errorf("Expected DECLINED status, got %v", inv.Status)
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "invitation not found",
			request: &pfinancev1.DeclineInvitationRequest{
				InvitationId: "inv-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInvitation(gomock.Any(), "inv-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.DeclineInvitationRequest{
				InvitationId: "inv-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInvitation(gomock.Any(), "inv-123").
					Return(mockInvitation, nil)

				mockStore.EXPECT().
					UpdateInvitation(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			// Use email matching the invitation
			ctx := testContextWithUserEmail("user-123", "test@example.com")

			_, err := service.DeclineInvitation(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

// Phase 3: Group Member Management

func TestRemoveFromGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	existingGroup := &pfinancev1.FinanceGroup{
		Id:        "group-123",
		Name:      "Family Budget",
		OwnerId:   "user-123",
		MemberIds: []string{"user-123", "user-456", "user-789"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
			{UserId: "user-456", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
			{UserId: "user-789", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.RemoveFromGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful removal",
			request: &pfinancev1.RemoveFromGroupRequest{
				GroupId: "group-123",
				UserId:  "user-456",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(existingGroup, nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, group *pfinancev1.FinanceGroup) error {
						// Verify user was removed
						for _, id := range group.MemberIds {
							if id == "user-456" {
								t.Error("user-456 should have been removed from MemberIds")
							}
						}
						for _, member := range group.Members {
							if member.UserId == "user-456" {
								t.Error("user-456 should have been removed from Members")
							}
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "group not found",
			request: &pfinancev1.RemoveFromGroupRequest{
				GroupId: "group-999",
				UserId:  "user-456",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.RemoveFromGroupRequest{
				GroupId: "group-123",
				UserId:  "user-456",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(existingGroup, nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			_, err := service.RemoveFromGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

func TestUpdateMemberRole(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	existingGroup := &pfinancev1.FinanceGroup{
		Id:        "group-123",
		Name:      "Family Budget",
		OwnerId:   "user-123",
		MemberIds: []string{"user-123", "user-456"},
		Members: []*pfinancev1.GroupMember{
			{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
			{UserId: "user-456", Role: pfinancev1.GroupRole_GROUP_ROLE_MEMBER},
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateMemberRoleRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful role update",
			request: &pfinancev1.UpdateMemberRoleRequest{
				GroupId: "group-123",
				UserId:  "user-456",
				NewRole: pfinancev1.GroupRole_GROUP_ROLE_ADMIN,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(existingGroup, nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, group *pfinancev1.FinanceGroup) error {
						for _, member := range group.Members {
							if member.UserId == "user-456" {
								if member.Role != pfinancev1.GroupRole_GROUP_ROLE_ADMIN {
									t.Errorf("Expected ADMIN role, got %v", member.Role)
								}
							}
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "member not found",
			request: &pfinancev1.UpdateMemberRoleRequest{
				GroupId: "group-123",
				UserId:  "user-999",
				NewRole: pfinancev1.GroupRole_GROUP_ROLE_ADMIN,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(existingGroup, nil)
			},
			expectedError: true,
		},
		{
			name: "group not found",
			request: &pfinancev1.UpdateMemberRoleRequest{
				GroupId: "group-999",
				UserId:  "user-456",
				NewRole: pfinancev1.GroupRole_GROUP_ROLE_ADMIN,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.UpdateMemberRoleRequest{
				GroupId: "group-123",
				UserId:  "user-456",
				NewRole: pfinancev1.GroupRole_GROUP_ROLE_ADMIN,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(existingGroup, nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.UpdateMemberRole(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Member == nil {
				t.Error("Expected member in response")
			}
		})
	}
}

// Phase 3: Balance & Settlement

func TestGetMemberBalances(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockExpenses := []*pfinancev1.Expense{
		{
			Id:           "exp-1",
			GroupId:      "group-123",
			Amount:       100.00,
			PaidByUserId: "user-123",
			Allocations: []*pfinancev1.ExpenseAllocation{
				{UserId: "user-123", Amount: 50.00, IsPaid: false},
				{UserId: "user-456", Amount: 50.00, IsPaid: false},
			},
		},
		{
			Id:           "exp-2",
			GroupId:      "group-123",
			Amount:       60.00,
			PaidByUserId: "user-456",
			Allocations: []*pfinancev1.ExpenseAllocation{
				{UserId: "user-123", Amount: 30.00, IsPaid: false},
				{UserId: "user-456", Amount: 30.00, IsPaid: false},
			},
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetMemberBalancesRequest
		setupMock     func()
		expectedError bool
		validate      func(*testing.T, *pfinancev1.GetMemberBalancesResponse)
	}{
		{
			name: "successful balance calculation",
			request: &pfinancev1.GetMemberBalancesRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockExpenses, "", nil)
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.GetMemberBalancesResponse) {
				if resp.TotalGroupExpenses != 160.00 {
					t.Errorf("Expected total expenses 160.00, got %f", resp.TotalGroupExpenses)
				}
				if len(resp.Balances) == 0 {
					t.Error("Expected at least one balance")
				}
			},
		},
		{
			name: "empty group",
			request: &pfinancev1.GetMemberBalancesRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return([]*pfinancev1.Expense{}, "", nil)
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.GetMemberBalancesResponse) {
				if resp.TotalGroupExpenses != 0 {
					t.Errorf("Expected total expenses 0, got %f", resp.TotalGroupExpenses)
				}
			},
		},
		{
			name: "with date filters",
			request: &pfinancev1.GetMemberBalancesRequest{
				GroupId:   "group-123",
				StartDate: timestamppb.New(time.Now().AddDate(0, -1, 0)),
				EndDate:   timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockExpenses, "", nil)
			},
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.GetMemberBalancesRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)
				mockStore.EXPECT().
					ListExpenses(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.GetMemberBalances(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if tt.validate != nil {
				tt.validate(t, resp.Msg)
			}
		})
	}
}

func TestSettleExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.SettleExpenseRequest
		setupMock     func()
		expectedError bool
		validate      func(*testing.T, *pfinancev1.SettleExpenseResponse)
	}{
		{
			name: "successful settlement",
			request: &pfinancev1.SettleExpenseRequest{
				ExpenseId: "exp-123",
				UserId:    "user-456",
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:           "exp-123",
					Amount:       100.00,
					PaidByUserId: "user-123",
					Allocations: []*pfinancev1.ExpenseAllocation{
						{UserId: "user-123", Amount: 50.00, IsPaid: false},
						{UserId: "user-456", Amount: 50.00, IsPaid: false},
					},
					IsSettled: false,
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)

				mockStore.EXPECT().
					UpdateExpense(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, expense *pfinancev1.Expense) error {
						// Verify user's allocation is marked as paid
						for _, alloc := range expense.Allocations {
							if alloc.UserId == "user-456" {
								if !alloc.IsPaid {
									t.Error("Expected allocation to be marked as paid")
								}
								if alloc.PaidAt == nil {
									t.Error("Expected PaidAt timestamp to be set")
								}
							}
						}
						return nil
					})
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.SettleExpenseResponse) {
				if resp.Expense == nil {
					t.Error("Expected expense in response")
				}
				if resp.UpdatedAllocation == nil {
					t.Error("Expected updated allocation in response")
				}
			},
		},
		{
			name: "all allocations settled",
			request: &pfinancev1.SettleExpenseRequest{
				ExpenseId: "exp-123",
				UserId:    "user-456",
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:           "exp-123",
					Amount:       100.00,
					PaidByUserId: "user-123",
					Allocations: []*pfinancev1.ExpenseAllocation{
						{UserId: "user-123", Amount: 50.00, IsPaid: true, PaidAt: timestamppb.Now()},
						{UserId: "user-456", Amount: 50.00, IsPaid: false},
					},
					IsSettled: false,
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)

				mockStore.EXPECT().
					UpdateExpense(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, expense *pfinancev1.Expense) error {
						// Expense should be marked as fully settled
						if !expense.IsSettled {
							t.Error("Expected expense to be marked as settled")
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "expense not found",
			request: &pfinancev1.SettleExpenseRequest{
				ExpenseId: "exp-999",
				UserId:    "user-456",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "allocation not found for user",
			request: &pfinancev1.SettleExpenseRequest{
				ExpenseId: "exp-123",
				UserId:    "user-999",
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:           "exp-123",
					Amount:       100.00,
					PaidByUserId: "user-123",
					Allocations: []*pfinancev1.ExpenseAllocation{
						{UserId: "user-123", Amount: 50.00, IsPaid: false},
						{UserId: "user-456", Amount: 50.00, IsPaid: false},
					},
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.SettleExpenseRequest{
				ExpenseId: "exp-123",
				UserId:    "user-456",
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:           "exp-123",
					Amount:       100.00,
					PaidByUserId: "user-123",
					Allocations: []*pfinancev1.ExpenseAllocation{
						{UserId: "user-456", Amount: 50.00, IsPaid: false},
					},
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)

				mockStore.EXPECT().
					UpdateExpense(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			// Use the user ID from the request for the context
			ctx := testContextWithUser(tt.request.UserId)

			resp, err := service.SettleExpense(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if tt.validate != nil {
				tt.validate(t, resp.Msg)
			}
		})
	}
}

// Phase 3: Group Summary

func TestGetGroupSummary(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockExpenses := []*pfinancev1.Expense{
		{
			Id:           "exp-1",
			GroupId:      "group-123",
			Amount:       100.00,
			Category:     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			PaidByUserId: "user-123",
			IsSettled:    false,
			Allocations: []*pfinancev1.ExpenseAllocation{
				{UserId: "user-123", Amount: 50.00, IsPaid: false},
				{UserId: "user-456", Amount: 50.00, IsPaid: false},
			},
		},
		{
			Id:           "exp-2",
			GroupId:      "group-123",
			Amount:       50.00,
			Category:     pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
			PaidByUserId: "user-456",
			IsSettled:    true,
			Allocations: []*pfinancev1.ExpenseAllocation{
				{UserId: "user-123", Amount: 25.00, IsPaid: true},
				{UserId: "user-456", Amount: 25.00, IsPaid: true},
			},
		},
	}

	mockIncomes := []*pfinancev1.Income{
		{
			Id:      "inc-1",
			GroupId: "group-123",
			Amount:  500.00,
			Source:  "Shared",
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetGroupSummaryRequest
		setupMock     func()
		expectedError bool
		validate      func(*testing.T, *pfinancev1.GetGroupSummaryResponse)
	}{
		{
			name: "successful summary",
			request: &pfinancev1.GetGroupSummaryRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil).
					Times(2) // Once for GetGroupSummary auth, once for GetMemberBalances auth

				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockExpenses, "", nil).
					Times(2) // Once for summary, once for balances

				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockIncomes, "", nil)
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.GetGroupSummaryResponse) {
				if resp.TotalExpenses != 150.00 {
					t.Errorf("Expected total expenses 150.00, got %f", resp.TotalExpenses)
				}
				if resp.TotalIncome != 500.00 {
					t.Errorf("Expected total income 500.00, got %f", resp.TotalIncome)
				}
				if resp.UnsettledExpenseCount != 1 {
					t.Errorf("Expected 1 unsettled expense, got %d", resp.UnsettledExpenseCount)
				}
				if len(resp.ExpenseByCategory) < 2 {
					t.Error("Expected at least 2 category breakdowns")
				}
			},
		},
		{
			name: "empty group",
			request: &pfinancev1.GetGroupSummaryRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil).
					Times(2) // Once for GetGroupSummary auth, once for GetMemberBalances auth

				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return([]*pfinancev1.Expense{}, "", nil).
					Times(2)

				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return([]*pfinancev1.Income{}, "", nil)
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.GetGroupSummaryResponse) {
				if resp.TotalExpenses != 0 {
					t.Errorf("Expected total expenses 0, got %f", resp.TotalExpenses)
				}
				if resp.TotalIncome != 0 {
					t.Errorf("Expected total income 0, got %f", resp.TotalIncome)
				}
			},
		},
		{
			name: "with date filters",
			request: &pfinancev1.GetGroupSummaryRequest{
				GroupId:   "group-123",
				StartDate: timestamppb.New(time.Now().AddDate(0, -1, 0)),
				EndDate:   timestamppb.Now(),
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil).
					Times(2) // Once for GetGroupSummary auth, once for GetMemberBalances auth

				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockExpenses, "", nil).
					Times(2)

				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockIncomes, "", nil)
			},
			expectedError: false,
		},
		{
			name: "store error on expenses",
			request: &pfinancev1.GetGroupSummaryRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					ListExpenses(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
		{
			name: "store error on incomes",
			request: &pfinancev1.GetGroupSummaryRequest{
				GroupId: "group-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					ListExpenses(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(mockExpenses, "", nil)

				mockStore.EXPECT().
					ListIncomes(gomock.Any(), "", "group-123", gomock.Any(), gomock.Any(), int32(1000), "").
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.GetGroupSummary(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if tt.validate != nil {
				tt.validate(t, resp.Msg)
			}
		})
	}
}

// Phase 4: Invite Link Operations

func TestCreateInviteLink(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.CreateInviteLinkRequest
		setupMock     func()
		expectedError bool
		validate      func(*testing.T, *pfinancev1.CreateInviteLinkResponse)
	}{
		{
			name: "successful creation",
			request: &pfinancev1.CreateInviteLinkRequest{
				GroupId:       "group-123",
				CreatedBy:     "user-123",
				DefaultRole:   pfinancev1.GroupRole_GROUP_ROLE_MEMBER,
				ExpiresInDays: 7,
				MaxUses:       10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					CreateInviteLink(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, link *pfinancev1.GroupInviteLink) error {
						if link.GroupId != "group-123" {
							t.Errorf("Expected GroupId 'group-123', got %s", link.GroupId)
						}
						if link.CreatedBy != "user-123" {
							t.Errorf("Expected CreatedBy 'user-123', got %s", link.CreatedBy)
						}
						if link.DefaultRole != pfinancev1.GroupRole_GROUP_ROLE_MEMBER {
							t.Errorf("Expected MEMBER role, got %v", link.DefaultRole)
						}
						if link.MaxUses != 10 {
							t.Errorf("Expected MaxUses 10, got %d", link.MaxUses)
						}
						if link.Code == "" {
							t.Error("Expected Code to be generated")
						}
						if !link.IsActive {
							t.Error("Expected IsActive to be true")
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "default role when unspecified",
			request: &pfinancev1.CreateInviteLinkRequest{
				GroupId:   "group-123",
				CreatedBy: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					CreateInviteLink(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, link *pfinancev1.GroupInviteLink) error {
						if link.DefaultRole != pfinancev1.GroupRole_GROUP_ROLE_MEMBER {
							t.Errorf("Expected default MEMBER role, got %v", link.DefaultRole)
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.CreateInviteLinkRequest{
				GroupId:   "group-123",
				CreatedBy: "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					CreateInviteLink(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.CreateInviteLink(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.InviteLink == nil {
				t.Error("Expected invite link in response")
				return
			}

			if tt.validate != nil {
				tt.validate(t, resp.Msg)
			}
		})
	}
}

func TestGetInviteLinkByCode(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockGroup := &pfinancev1.FinanceGroup{
		Id:      "group-123",
		Name:    "Test Group",
		OwnerId: "user-123",
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetInviteLinkByCodeRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful retrieval",
			request: &pfinancev1.GetInviteLinkByCodeRequest{
				Code: "ABC12345",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:          "link-123",
					GroupId:     "group-123",
					Code:        "ABC12345",
					IsActive:    true,
					CurrentUses: 0,
					MaxUses:     10,
				}

				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "ABC12345").
					Return(mockLink, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(mockGroup, nil)
			},
			expectedError: false,
		},
		{
			name: "link not found",
			request: &pfinancev1.GetInviteLinkByCodeRequest{
				Code: "INVALID",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "INVALID").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "link inactive",
			request: &pfinancev1.GetInviteLinkByCodeRequest{
				Code: "ABC12345",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:       "link-123",
					GroupId:  "group-123",
					Code:     "ABC12345",
					IsActive: false,
				}

				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "ABC12345").
					Return(mockLink, nil)
			},
			expectedError: true,
		},
		{
			name: "link expired",
			request: &pfinancev1.GetInviteLinkByCodeRequest{
				Code: "ABC12345",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:        "link-123",
					GroupId:   "group-123",
					Code:      "ABC12345",
					IsActive:  true,
					ExpiresAt: timestamppb.New(time.Now().Add(-24 * time.Hour)), // Expired
				}

				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "ABC12345").
					Return(mockLink, nil)
			},
			expectedError: true,
		},
		{
			name: "max uses reached",
			request: &pfinancev1.GetInviteLinkByCodeRequest{
				Code: "ABC12345",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:          "link-123",
					GroupId:     "group-123",
					Code:        "ABC12345",
					IsActive:    true,
					MaxUses:     5,
					CurrentUses: 5,
				}

				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "ABC12345").
					Return(mockLink, nil)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.GetInviteLinkByCode(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.InviteLink == nil {
				t.Error("Expected invite link in response")
			}
			if resp.Msg.Group == nil {
				t.Error("Expected group in response")
			}
		})
	}
}

func TestJoinGroupByLink(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.JoinGroupByLinkRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful join",
			request: &pfinancev1.JoinGroupByLinkRequest{
				Code:        "ABC12345",
				UserId:      "user-new",
				UserEmail:   "new@example.com",
				DisplayName: "New User",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:          "link-123",
					GroupId:     "group-123",
					Code:        "ABC12345",
					IsActive:    true,
					DefaultRole: pfinancev1.GroupRole_GROUP_ROLE_MEMBER,
					CurrentUses: 0,
					MaxUses:     10,
				}

				mockGroup := &pfinancev1.FinanceGroup{
					Id:        "group-123",
					Name:      "Test Group",
					OwnerId:   "user-123",
					MemberIds: []string{"user-123"},
					Members: []*pfinancev1.GroupMember{
						{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
					},
				}

				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "ABC12345").
					Return(mockLink, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(mockGroup, nil)

				mockStore.EXPECT().
					UpdateGroup(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, group *pfinancev1.FinanceGroup) error {
						if len(group.MemberIds) != 2 {
							t.Errorf("Expected 2 members, got %d", len(group.MemberIds))
						}
						return nil
					})

				mockStore.EXPECT().
					UpdateInviteLink(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, link *pfinancev1.GroupInviteLink) error {
						if link.CurrentUses != 1 {
							t.Errorf("Expected CurrentUses 1, got %d", link.CurrentUses)
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "link not found",
			request: &pfinancev1.JoinGroupByLinkRequest{
				Code:   "INVALID",
				UserId: "user-new",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "INVALID").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "user already member",
			request: &pfinancev1.JoinGroupByLinkRequest{
				Code:   "ABC12345",
				UserId: "user-123",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:       "link-123",
					GroupId:  "group-123",
					Code:     "ABC12345",
					IsActive: true,
				}

				mockGroup := &pfinancev1.FinanceGroup{
					Id:        "group-123",
					Name:      "Test Group",
					MemberIds: []string{"user-123"},
					Members: []*pfinancev1.GroupMember{
						{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
					},
				}

				mockStore.EXPECT().
					GetInviteLinkByCode(gomock.Any(), "ABC12345").
					Return(mockLink, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(mockGroup, nil)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			// Use the user ID from the request for the context
			ctx := testContextWithUser(tt.request.UserId)

			resp, err := service.JoinGroupByLink(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Group == nil {
				t.Error("Expected group in response")
			}
		})
	}
}

func TestListInviteLinks(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockLinks := []*pfinancev1.GroupInviteLink{
		{
			Id:       "link-1",
			GroupId:  "group-123",
			Code:     "ABC11111",
			IsActive: true,
		},
		{
			Id:       "link-2",
			GroupId:  "group-123",
			Code:     "ABC22222",
			IsActive: true,
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.ListInviteLinksRequest
		setupMock     func()
		expectedCount int
		expectedError bool
	}{
		{
			name: "successful list",
			request: &pfinancev1.ListInviteLinksRequest{
				GroupId:  "group-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					ListInviteLinks(gomock.Any(), "group-123", false, int32(10), "").
					Return(mockLinks, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "include inactive",
			request: &pfinancev1.ListInviteLinksRequest{
				GroupId:         "group-123",
				IncludeInactive: true,
				PageSize:        10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					ListInviteLinks(gomock.Any(), "group-123", true, int32(10), "").
					Return(mockLinks, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.ListInviteLinksRequest{
				GroupId:  "group-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					ListInviteLinks(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContextWithUser("user-123")

			resp, err := service.ListInviteLinks(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.InviteLinks) != tt.expectedCount {
				t.Errorf("Expected %d links, got %d", tt.expectedCount, len(resp.Msg.InviteLinks))
			}
		})
	}
}

func TestDeactivateInviteLink(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.DeactivateInviteLinkRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful deactivation",
			request: &pfinancev1.DeactivateInviteLinkRequest{
				LinkId: "link-123",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:       "link-123",
					GroupId:  "group-123",
					IsActive: true,
				}

				mockStore.EXPECT().
					GetInviteLink(gomock.Any(), "link-123").
					Return(mockLink, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					UpdateInviteLink(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, link *pfinancev1.GroupInviteLink) error {
						if link.IsActive {
							t.Error("Expected IsActive to be false")
						}
						return nil
					})
			},
			expectedError: false,
		},
		{
			name: "link not found",
			request: &pfinancev1.DeactivateInviteLinkRequest{
				LinkId: "link-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetInviteLink(gomock.Any(), "link-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.DeactivateInviteLinkRequest{
				LinkId: "link-123",
			},
			setupMock: func() {
				mockLink := &pfinancev1.GroupInviteLink{
					Id:       "link-123",
					GroupId:  "group-123",
					IsActive: true,
				}

				mockStore.EXPECT().
					GetInviteLink(gomock.Any(), "link-123").
					Return(mockLink, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
						Members: []*pfinancev1.GroupMember{
							{UserId: "user-123", Role: pfinancev1.GroupRole_GROUP_ROLE_OWNER},
						},
					}, nil)

				mockStore.EXPECT().
					UpdateInviteLink(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContextWithUser("user-123")

			_, err := service.DeactivateInviteLink(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
			}
		})
	}
}

// Phase 4: Contribution Operations

func TestContributeExpenseToGroup(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.ContributeExpenseToGroupRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful contribution",
			request: &pfinancev1.ContributeExpenseToGroupRequest{
				SourceExpenseId:  "exp-123",
				TargetGroupId:    "group-123",
				ContributedBy:    "user-123",
				Amount:           100.00,
				SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
				AllocatedUserIds: []string{"user-123", "user-456"},
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:          "exp-123",
					UserId:      "user-123",
					Description: "Personal expense",
					Amount:      100.00,
					Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
					Date:        timestamppb.Now(),
				}

				mockGroup := &pfinancev1.FinanceGroup{
					Id:        "group-123",
					Name:      "Test Group",
					MemberIds: []string{"user-123", "user-456"},
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(mockGroup, nil)

				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					DoAndReturn(func(_ context.Context, expense *pfinancev1.Expense) error {
						if expense.GroupId != "group-123" {
							t.Errorf("Expected GroupId 'group-123', got %s", expense.GroupId)
						}
						if len(expense.Allocations) != 2 {
							t.Errorf("Expected 2 allocations, got %d", len(expense.Allocations))
						}
						return nil
					})

				mockStore.EXPECT().
					CreateContribution(gomock.Any(), gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "source expense not found",
			request: &pfinancev1.ContributeExpenseToGroupRequest{
				SourceExpenseId: "exp-999",
				TargetGroupId:   "group-123",
				ContributedBy:   "user-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "target group not found",
			request: &pfinancev1.ContributeExpenseToGroupRequest{
				SourceExpenseId: "exp-123",
				TargetGroupId:   "group-999",
				ContributedBy:   "user-123",
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:     "exp-123",
					UserId: "user-123", // Must match auth context for ownership check
					Amount: 100.00,
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-999").
					Return(nil, errors.New("not found"))
			},
			expectedError: true,
		},
		{
			name: "store error on create expense",
			request: &pfinancev1.ContributeExpenseToGroupRequest{
				SourceExpenseId:  "exp-123",
				TargetGroupId:    "group-123",
				ContributedBy:    "user-123",
				SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
				AllocatedUserIds: []string{"user-123"},
			},
			setupMock: func() {
				mockExpense := &pfinancev1.Expense{
					Id:          "exp-123",
					UserId:      "user-123", // Must match auth context for ownership check
					Amount:      100.00,
					Description: "Test",
					Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
					Date:        timestamppb.Now(),
				}

				mockGroup := &pfinancev1.FinanceGroup{
					Id:        "group-123",
					MemberIds: []string{"user-123"},
				}

				mockStore.EXPECT().
					GetExpense(gomock.Any(), "exp-123").
					Return(mockExpense, nil)

				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(mockGroup, nil)

				mockStore.EXPECT().
					CreateExpense(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext("user-123")

			resp, err := service.ContributeExpenseToGroup(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.Contribution == nil {
				t.Error("Expected contribution in response")
			}
			if resp.Msg.CreatedGroupExpense == nil {
				t.Error("Expected created group expense in response")
			}
		})
	}
}

func TestListContributions(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	mockContributions := []*pfinancev1.ExpenseContribution{
		{
			Id:            "contrib-1",
			TargetGroupId: "group-123",
			ContributedBy: "user-123",
			Amount:        50.00,
		},
		{
			Id:            "contrib-2",
			TargetGroupId: "group-123",
			ContributedBy: "user-456",
			Amount:        75.00,
		},
	}

	tests := []struct {
		name          string
		request       *pfinancev1.ListContributionsRequest
		setupMock     func()
		expectedCount int
		expectedError bool
	}{
		{
			name: "successful list by group",
			request: &pfinancev1.ListContributionsRequest{
				GroupId:  "group-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					ListContributions(gomock.Any(), "group-123", "", int32(10), "").
					Return(mockContributions, "", nil)
			},
			expectedCount: 2,
			expectedError: false,
		},
		{
			name: "filter by user",
			request: &pfinancev1.ListContributionsRequest{
				GroupId:  "group-123",
				UserId:   "user-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					ListContributions(gomock.Any(), "group-123", "user-123", int32(10), "").
					Return(mockContributions[:1], "", nil)
			},
			expectedCount: 1,
			expectedError: false,
		},
		{
			name: "empty results",
			request: &pfinancev1.ListContributionsRequest{
				GroupId:  "group-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					ListContributions(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return([]*pfinancev1.ExpenseContribution{}, "", nil)
			},
			expectedCount: 0,
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.ListContributionsRequest{
				GroupId:  "group-123",
				PageSize: 10,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:        "group-123",
						OwnerId:   "user-123",
						MemberIds: []string{"user-123"},
					}, nil)

				mockStore.EXPECT().
					ListContributions(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, "", errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContextWithUser("user-123")

			resp, err := service.ListContributions(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if len(resp.Msg.Contributions) != tt.expectedCount {
				t.Errorf("Expected %d contributions, got %d", tt.expectedCount, len(resp.Msg.Contributions))
			}
		})
	}
}

// Phase 4: Tax Operations

func TestUpdateTaxConfig(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore, nil, nil)

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateTaxConfigRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful update",
			request: &pfinancev1.UpdateTaxConfigRequest{
				UserId: "user-123",
				TaxConfig: &pfinancev1.TaxConfig{
					Enabled:           true,
					Country:           pfinancev1.TaxCountry_TAX_COUNTRY_AUSTRALIA,
					TaxRate:           0.32,
					IncludeDeductions: true,
					Settings: &pfinancev1.TaxSettings{
						IncludeSuper:    true,
						SuperRate:       11.5,
						IncludeMedicare: true,
					},
				},
			},
			setupMock: func() {
				mockStore.EXPECT().
					UpdateTaxConfig(gomock.Any(), "user-123", "", gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "update for group",
			request: &pfinancev1.UpdateTaxConfigRequest{
				UserId:  "user-123",
				GroupId: "group-123",
				TaxConfig: &pfinancev1.TaxConfig{
					Enabled: true,
					Country: pfinancev1.TaxCountry_TAX_COUNTRY_AUSTRALIA,
				},
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetGroup(gomock.Any(), "group-123").
					Return(&pfinancev1.FinanceGroup{
						Id:      "group-123",
						OwnerId: "user-123",
					}, nil)
				mockStore.EXPECT().
					UpdateTaxConfig(gomock.Any(), "user-123", "group-123", gomock.Any()).
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "store error",
			request: &pfinancev1.UpdateTaxConfigRequest{
				UserId: "user-123",
				TaxConfig: &pfinancev1.TaxConfig{
					Enabled: true,
				},
			},
			setupMock: func() {
				mockStore.EXPECT().
					UpdateTaxConfig(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()
			ctx := testContext(tt.request.UserId)

			resp, err := service.UpdateTaxConfig(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				if err == nil {
					t.Error("Expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("Unexpected error: %v", err)
				return
			}

			if resp.Msg.TaxConfig == nil {
				t.Error("Expected tax config in response")
			}
		})
	}
}
