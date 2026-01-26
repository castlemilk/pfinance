package tests

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/bufbuild/connect-go"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"github.com/castlemilk/pfinance/backend/internal/service"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestE2EFinanceService(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	// Create mock store
	mockStore := store.NewMockStore(ctrl)

	// Create service
	financeService := service.NewFinanceService(mockStore)

	// Create Connect handler
	path, handler := pfinancev1connect.NewFinanceServiceHandler(financeService)

	// Create test server
	mux := http.NewServeMux()
	mux.Handle(path, handler)
	server := httptest.NewServer(mux)
	defer server.Close()

	// Create client
	client := pfinancev1connect.NewFinanceServiceClient(
		http.DefaultClient,
		server.URL,
		connect.WithGRPC(),
	)

	t.Run("health check", func(t *testing.T) {
		// Simple test to verify server is running
		resp, err := http.Get(server.URL + "/")
		if err != nil {
			t.Fatalf("Failed to make request: %v", err)
		}
		defer resp.Body.Close()

		// Expect 404 for root path since only our service endpoints are registered
		if resp.StatusCode != http.StatusNotFound {
			t.Errorf("Expected 404, got %d", resp.StatusCode)
		}
	})

	t.Run("create expense with mock", func(t *testing.T) {
		// Set up mock expectation
		mockStore.EXPECT().
			CreateExpense(gomock.Any(), gomock.Any()).
			Return(nil)

		ctx := context.Background()

		resp, err := client.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
			UserId:      "test-user",
			Description: "Test expense",
			Amount:      10.50,
			Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
			Date:        timestamppb.Now(),
		}))

		if err != nil {
			t.Fatalf("Failed to create expense: %v", err)
		}

		if resp.Msg.Expense == nil {
			t.Error("Expected expense in response")
		}

		if resp.Msg.Expense.UserId != "test-user" {
			t.Errorf("Expected UserId 'test-user', got %s", resp.Msg.Expense.UserId)
		}
	})

	t.Run("list expenses with mock", func(t *testing.T) {
		// Set up mock expectation
		mockExpenses := []*pfinancev1.Expense{
			{
				Id:          "exp-1",
				UserId:      "test-user",
				Description: "Mock expense",
				Amount:      25.00,
				Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			},
		}

		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "test-user", "", gomock.Any(), gomock.Any(), int32(10)).
			Return(mockExpenses, nil)

		ctx := context.Background()

		resp, err := client.ListExpenses(ctx, connect.NewRequest(&pfinancev1.ListExpensesRequest{
			UserId:   "test-user",
			PageSize: 10,
		}))

		if err != nil {
			t.Fatalf("Failed to list expenses: %v", err)
		}

		if len(resp.Msg.Expenses) != 1 {
			t.Errorf("Expected 1 expense, got %d", len(resp.Msg.Expenses))
		}

		if resp.Msg.Expenses[0].Description != "Mock expense" {
			t.Errorf("Expected 'Mock expense', got %s", resp.Msg.Expenses[0].Description)
		}
	})
}

// TestConnectIntegration tests that our service correctly implements the Connect interface
func TestConnectIntegration(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	service := service.NewFinanceService(mockStore)

	// Verify that our service implements the Connect interface
	var _ pfinancev1connect.FinanceServiceHandler = service

	t.Log("Service correctly implements Connect interface")
}

// TestStoreInterface verifies our store mock implements the interface correctly
func TestStoreInterface(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)

	// Verify that our mock implements the Store interface
	var _ store.Store = mockStore

	t.Log("Mock store correctly implements Store interface")
}
