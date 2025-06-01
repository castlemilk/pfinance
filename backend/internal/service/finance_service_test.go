package service

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/bufbuild/connect-go"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestCreateExpense(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

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

			resp, err := service.CreateExpense(context.Background(), connect.NewRequest(tt.request))

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

func TestListExpenses(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

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
					ListExpenses(gomock.Any(), "user-123", "", gomock.Any(), gomock.Any(), int32(10)).
					Return(mockExpenses, nil)
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
					ListExpenses(gomock.Any(), "user-123", "group-456", gomock.Any(), gomock.Any(), int32(10)).
					Return(mockExpenses, nil)
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
					ListExpenses(gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any(), gomock.Any()).
					Return(nil, errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.ListExpenses(context.Background(), connect.NewRequest(tt.request))

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
	service := NewFinanceService(mockStore)

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
					CreateGroup(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.CreateGroup(context.Background(), connect.NewRequest(tt.request))

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
	service := NewFinanceService(mockStore)

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
					CreateInvitation(gomock.Any(), gomock.Any()).
					Return(errors.New("store error"))
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.InviteToGroup(context.Background(), connect.NewRequest(tt.request))

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
	service := NewFinanceService(mockStore)

	mockInvitation := &pfinancev1.GroupInvitation{
		Id:           "inv-123",
		GroupId:      "group-456",
		InviterId:    "user-789",
		InviteeEmail: "invite@example.com",
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

			resp, err := service.AcceptInvitation(context.Background(), connect.NewRequest(tt.request))

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
	service := NewFinanceService(mockStore)

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

			resp, err := service.CreateIncome(context.Background(), connect.NewRequest(tt.request))

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

func TestGetTaxConfig(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

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

			resp, err := service.GetTaxConfig(context.Background(), connect.NewRequest(tt.request))

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