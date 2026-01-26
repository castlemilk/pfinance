package service

import (
	"context"
	"testing"
	"time"

	"github.com/bufbuild/connect-go"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestCreateBudget(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

	ctx := context.Background()
	req := &pfinancev1.CreateBudgetRequest{
		UserId:      "user123",
		Name:        "Monthly Food Budget",
		Description: "Budget for dining and groceries",
		Amount:      500.00,
		Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
		CategoryIds: []pfinancev1.ExpenseCategory{
			pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
		StartDate: timestamppb.Now(),
	}

	// Set up expectations
	mockStore.EXPECT().
		CreateBudget(ctx, gomock.Any()).
		DoAndReturn(func(ctx context.Context, budget *pfinancev1.Budget) error {
			// Verify the budget has expected fields
			assert.Equal(t, req.UserId, budget.UserId)
			assert.Equal(t, req.Name, budget.Name)
			assert.Equal(t, req.Description, budget.Description)
			assert.Equal(t, req.Amount, budget.Amount)
			assert.Equal(t, req.Period, budget.Period)
			assert.Equal(t, req.CategoryIds, budget.CategoryIds)
			assert.True(t, budget.IsActive)
			assert.NotEmpty(t, budget.Id)
			assert.NotNil(t, budget.CreatedAt)
			assert.NotNil(t, budget.UpdatedAt)
			return nil
		})

	// Execute
	resp, err := service.CreateBudget(ctx, connect.NewRequest(req))

	// Verify
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, req.Name, resp.Msg.Budget.Name)
	assert.NotEmpty(t, resp.Msg.Budget.Id)
}

func TestGetBudgetProgress(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

	ctx := context.Background()
	budgetID := "budget123"
	now := time.Now()

	// Create test progress
	testProgress := &pfinancev1.BudgetProgress{
		BudgetId:        budgetID,
		AllocatedAmount: 500.00,
		SpentAmount:     150.00,
		RemainingAmount: 350.00,
		PercentageUsed:  30.0,
		DaysRemaining:   15,
		PeriodStart:     timestamppb.New(time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())),
		PeriodEnd:       timestamppb.New(time.Date(now.Year(), now.Month()+1, 0, 23, 59, 59, 999999999, now.Location())),
		CategoryBreakdown: []*pfinancev1.ExpenseBreakdown{
			{
				Category:   pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				Amount:     150.00,
				Percentage: 100.0,
			},
		},
	}

	req := &pfinancev1.GetBudgetProgressRequest{
		BudgetId: budgetID,
	}

	// Set up expectations
	mockStore.EXPECT().
		GetBudgetProgress(ctx, budgetID, gomock.Any()).
		Return(testProgress, nil)

	// Execute
	resp, err := service.GetBudgetProgress(ctx, connect.NewRequest(req))

	// Verify
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Equal(t, testProgress.BudgetId, resp.Msg.Progress.BudgetId)
	assert.Equal(t, testProgress.AllocatedAmount, resp.Msg.Progress.AllocatedAmount)
	assert.Equal(t, testProgress.SpentAmount, resp.Msg.Progress.SpentAmount)
	assert.Equal(t, testProgress.RemainingAmount, resp.Msg.Progress.RemainingAmount)
	assert.Equal(t, testProgress.PercentageUsed, resp.Msg.Progress.PercentageUsed)
}

func TestListBudgets(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

	ctx := context.Background()
	userID := "user123"

	// Create test budgets
	testBudgets := []*pfinancev1.Budget{
		{
			Id:       "budget1",
			UserId:   userID,
			Name:     "Food Budget",
			Amount:   500.00,
			Period:   pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			IsActive: true,
		},
		{
			Id:       "budget2",
			UserId:   userID,
			Name:     "Entertainment Budget",
			Amount:   200.00,
			Period:   pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY,
			IsActive: true,
		},
	}

	req := &pfinancev1.ListBudgetsRequest{
		UserId:          userID,
		IncludeInactive: false,
		PageSize:        10,
	}

	// Set up expectations
	mockStore.EXPECT().
		ListBudgets(ctx, userID, "", false, int32(10)).
		Return(testBudgets, nil)

	// Execute
	resp, err := service.ListBudgets(ctx, connect.NewRequest(req))

	// Verify
	require.NoError(t, err)
	require.NotNil(t, resp)
	assert.Len(t, resp.Msg.Budgets, 2)
	assert.Equal(t, testBudgets[0].Name, resp.Msg.Budgets[0].Name)
	assert.Equal(t, testBudgets[1].Name, resp.Msg.Budgets[1].Name)
}

func TestGetBudget(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

	ctx := context.Background()

	testBudget := &pfinancev1.Budget{
		Id:          "budget-123",
		UserId:      "user-123",
		Name:        "Food Budget",
		Description: "Monthly food spending",
		Amount:      500.00,
		Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
		CategoryIds: []pfinancev1.ExpenseCategory{
			pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
		IsActive:  true,
		CreatedAt: timestamppb.Now(),
		UpdatedAt: timestamppb.Now(),
	}

	tests := []struct {
		name          string
		request       *pfinancev1.GetBudgetRequest
		setupMock     func()
		expectedError bool
		validate      func(*testing.T, *pfinancev1.GetBudgetResponse)
	}{
		{
			name: "successful retrieval",
			request: &pfinancev1.GetBudgetRequest{
				BudgetId: "budget-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetBudget(ctx, "budget-123").
					Return(testBudget, nil)
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.GetBudgetResponse) {
				require.NotNil(t, resp.Budget)
				assert.Equal(t, testBudget.Id, resp.Budget.Id)
				assert.Equal(t, testBudget.Name, resp.Budget.Name)
				assert.Equal(t, testBudget.Amount, resp.Budget.Amount)
				assert.Equal(t, testBudget.Period, resp.Budget.Period)
				assert.True(t, resp.Budget.IsActive)
			},
		},
		{
			name: "budget not found",
			request: &pfinancev1.GetBudgetRequest{
				BudgetId: "budget-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetBudget(ctx, "budget-999").
					Return(nil, assert.AnError)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.GetBudget(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			if tt.validate != nil {
				tt.validate(t, resp.Msg)
			}
		})
	}
}

func TestUpdateBudget(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

	ctx := context.Background()

	existingBudget := &pfinancev1.Budget{
		Id:          "budget-123",
		UserId:      "user-123",
		Name:        "Original Budget",
		Description: "Original description",
		Amount:      500.00,
		Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
		CategoryIds: []pfinancev1.ExpenseCategory{
			pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		},
		IsActive:  true,
		CreatedAt: timestamppb.Now(),
		UpdatedAt: timestamppb.Now(),
	}

	tests := []struct {
		name          string
		request       *pfinancev1.UpdateBudgetRequest
		setupMock     func()
		expectedError bool
		validate      func(*testing.T, *pfinancev1.UpdateBudgetResponse)
	}{
		{
			name: "successful update",
			request: &pfinancev1.UpdateBudgetRequest{
				BudgetId:    "budget-123",
				Name:        "Updated Budget",
				Description: "Updated description",
				Amount:      750.00,
				Period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY,
				CategoryIds: []pfinancev1.ExpenseCategory{
					pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
				},
				IsActive: true,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetBudget(ctx, "budget-123").
					Return(existingBudget, nil)

				mockStore.EXPECT().
					UpdateBudget(ctx, gomock.Any()).
					DoAndReturn(func(_ context.Context, budget *pfinancev1.Budget) error {
						assert.Equal(t, "Updated Budget", budget.Name)
						assert.Equal(t, "Updated description", budget.Description)
						assert.Equal(t, 750.00, budget.Amount)
						assert.Equal(t, pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY, budget.Period)
						return nil
					})
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.UpdateBudgetResponse) {
				require.NotNil(t, resp.Budget)
				assert.Equal(t, "Updated Budget", resp.Budget.Name)
				assert.Equal(t, 750.00, resp.Budget.Amount)
			},
		},
		{
			name: "budget not found",
			request: &pfinancev1.UpdateBudgetRequest{
				BudgetId: "budget-999",
				Name:     "Updated Budget",
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetBudget(ctx, "budget-999").
					Return(nil, assert.AnError)
			},
			expectedError: true,
		},
		{
			name: "store error on update",
			request: &pfinancev1.UpdateBudgetRequest{
				BudgetId: "budget-123",
				Name:     "Updated Budget",
				Amount:   600.00,
				Period:   pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetBudget(ctx, "budget-123").
					Return(existingBudget, nil)

				mockStore.EXPECT().
					UpdateBudget(ctx, gomock.Any()).
					Return(assert.AnError)
			},
			expectedError: true,
		},
		{
			name: "deactivate budget",
			request: &pfinancev1.UpdateBudgetRequest{
				BudgetId: "budget-123",
				Name:     existingBudget.Name,
				Amount:   existingBudget.Amount,
				Period:   existingBudget.Period,
				IsActive: false,
			},
			setupMock: func() {
				mockStore.EXPECT().
					GetBudget(ctx, "budget-123").
					Return(existingBudget, nil)

				mockStore.EXPECT().
					UpdateBudget(ctx, gomock.Any()).
					DoAndReturn(func(_ context.Context, budget *pfinancev1.Budget) error {
						assert.False(t, budget.IsActive)
						return nil
					})
			},
			expectedError: false,
			validate: func(t *testing.T, resp *pfinancev1.UpdateBudgetResponse) {
				require.NotNil(t, resp.Budget)
				assert.False(t, resp.Budget.IsActive)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			resp, err := service.UpdateBudget(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			if tt.validate != nil {
				tt.validate(t, resp.Msg)
			}
		})
	}
}

func TestDeleteBudget(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := NewFinanceService(mockStore)

	ctx := context.Background()

	tests := []struct {
		name          string
		request       *pfinancev1.DeleteBudgetRequest
		setupMock     func()
		expectedError bool
	}{
		{
			name: "successful deletion",
			request: &pfinancev1.DeleteBudgetRequest{
				BudgetId: "budget-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					DeleteBudget(ctx, "budget-123").
					Return(nil)
			},
			expectedError: false,
		},
		{
			name: "budget not found",
			request: &pfinancev1.DeleteBudgetRequest{
				BudgetId: "budget-999",
			},
			setupMock: func() {
				mockStore.EXPECT().
					DeleteBudget(ctx, "budget-999").
					Return(assert.AnError)
			},
			expectedError: true,
		},
		{
			name: "store error",
			request: &pfinancev1.DeleteBudgetRequest{
				BudgetId: "budget-123",
			},
			setupMock: func() {
				mockStore.EXPECT().
					DeleteBudget(ctx, "budget-123").
					Return(assert.AnError)
			},
			expectedError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tt.setupMock()

			_, err := service.DeleteBudget(ctx, connect.NewRequest(tt.request))

			if tt.expectedError {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
		})
	}
}
