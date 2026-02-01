//go:build ignore
// +build ignore

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func main() {
	// Get API URL from environment or use default
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8111"
	}

	// Get user ID from environment or use default local dev user
	userID := os.Getenv("USER_ID")
	if userID == "" {
		userID = "local-dev-user"
	}

	// Get auth token if provided (for authenticated requests)
	authToken := os.Getenv("AUTH_TOKEN")

	log.Printf("🌱 Seeding data for user: %s", userID)
	log.Printf("📡 API URL: %s", apiURL)

	// Create HTTP client with optional auth
	httpClient := &http.Client{}

	var opts []connect.ClientOption
	if authToken != "" {
		log.Println("🔐 Using provided auth token")
		opts = append(opts, connect.WithInterceptors(authInterceptor(authToken)))
	} else {
		log.Println("ℹ️  No auth token provided - backend must be running with SKIP_AUTH=true")
		log.Println("   Run 'make dev-backend-seed' (memory) or 'make dev-backend-firebase-seed' (Firestore)")
	}

	// Create Connect client
	client := pfinancev1connect.NewFinanceServiceClient(httpClient, apiURL, opts...)

	ctx := context.Background()

	// Create test data
	if err := seedExpenses(ctx, client, userID); err != nil {
		log.Fatalf("Failed to seed expenses: %v", err)
	}

	if err := seedIncomes(ctx, client, userID); err != nil {
		log.Fatalf("Failed to seed incomes: %v", err)
	}

	if err := seedBudgets(ctx, client, userID); err != nil {
		log.Fatalf("Failed to seed budgets: %v", err)
	}

	if err := seedGroup(ctx, client, userID); err != nil {
		log.Fatalf("Failed to seed group: %v", err)
	}

	log.Println("✅ Successfully seeded all test data!")

	// Verify seeded data is queryable
	log.Println("")
	log.Println("🔍 Verifying seeded data is queryable...")
	if err := verifySeededData(ctx, client, userID); err != nil {
		log.Fatalf("❌ Verification failed: %v", err)
	}
	log.Println("✅ All data verified successfully!")
}

// authInterceptor adds the Authorization header to requests
func authInterceptor(token string) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			req.Header().Set("Authorization", "Bearer "+token)
			return next(ctx, req)
		}
	}
}

func seedExpenses(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) error {
	log.Println("📝 Creating expenses...")

	expenses := []struct {
		description string
		amount      float64
		category    pfinancev1.ExpenseCategory
		daysAgo     int
	}{
		// Recent expenses (this week)
		{"Grocery shopping at Woolworths", 156.80, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 0},
		{"Netflix subscription", 22.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 1},
		{"Uber ride to work", 18.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, 1},
		{"Coffee at local cafe", 6.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 2},
		{"Electricity bill", 185.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 3},
		{"Dinner at restaurant", 78.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 4},
		{"Gym membership", 65.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, 5},
		{"Amazon purchase - headphones", 149.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, 5},

		// Last week
		{"Petrol", 95.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, 8},
		{"Phone bill", 79.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 9},
		{"Lunch with colleagues", 32.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 10},
		{"Movie tickets", 36.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 11},
		{"Pharmacy - vitamins", 42.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, 12},

		// Two weeks ago
		{"Weekly groceries", 142.30, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 14},
		{"Internet bill", 89.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 15},
		{"Spotify subscription", 12.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 16},
		{"Car service", 350.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, 18},

		// Three weeks ago
		{"Home insurance", 125.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING, 21},
		{"New shoes", 189.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, 22},
		{"Doctor visit", 85.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, 23},
		{"Takeaway dinner", 45.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 24},

		// Last month
		{"Rent payment", 2200.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING, 30},
		{"Water bill", 65.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 32},
		{"Birthday gift", 75.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, 35},
		{"Concert tickets", 120.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 38},
	}

	for _, exp := range expenses {
		date := time.Now().AddDate(0, 0, -exp.daysAgo)
		_, err := client.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
			UserId:      userID,
			Description: exp.description,
			Amount:      exp.amount,
			Category:    exp.category,
			Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
			Date:        timestamppb.New(date),
		}))
		if err != nil {
			return fmt.Errorf("failed to create expense '%s': %w", exp.description, err)
		}
		log.Printf("  ✓ Created expense: %s ($%.2f)", exp.description, exp.amount)
	}

	return nil
}

func seedIncomes(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) error {
	log.Println("💰 Creating incomes...")

	incomes := []struct {
		source    string
		amount    float64
		frequency pfinancev1.IncomeFrequency
		taxStatus pfinancev1.TaxStatus
		daysAgo   int
	}{
		// Regular salary
		{"Software Engineer Salary", 8500.00, pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY, pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX, 0},
		{"Software Engineer Salary", 8500.00, pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY, pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX, 30},

		// Side income
		{"Freelance project", 1500.00, pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY, pfinancev1.TaxStatus_TAX_STATUS_POST_TAX, 15},
		{"Dividend payment", 250.00, pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY, pfinancev1.TaxStatus_TAX_STATUS_POST_TAX, 20},

		// One-off income
		{"Tax refund", 1200.00, pfinancev1.IncomeFrequency_INCOME_FREQUENCY_ANNUALLY, pfinancev1.TaxStatus_TAX_STATUS_POST_TAX, 45},
		{"Sold old laptop", 450.00, pfinancev1.IncomeFrequency_INCOME_FREQUENCY_ANNUALLY, pfinancev1.TaxStatus_TAX_STATUS_POST_TAX, 25},
	}

	for _, inc := range incomes {
		date := time.Now().AddDate(0, 0, -inc.daysAgo)
		_, err := client.CreateIncome(ctx, connect.NewRequest(&pfinancev1.CreateIncomeRequest{
			UserId:    userID,
			Source:    inc.source,
			Amount:    inc.amount,
			Frequency: inc.frequency,
			TaxStatus: inc.taxStatus,
			Date:      timestamppb.New(date),
		}))
		if err != nil {
			return fmt.Errorf("failed to create income '%s': %w", inc.source, err)
		}
		log.Printf("  ✓ Created income: %s ($%.2f)", inc.source, inc.amount)
	}

	return nil
}

func seedBudgets(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) error {
	log.Println("📊 Creating budgets...")

	budgets := []struct {
		name        string
		description string
		amount      float64
		period      pfinancev1.BudgetPeriod
		categories  []pfinancev1.ExpenseCategory
	}{
		{
			name:        "Monthly Food Budget",
			description: "Groceries, dining out, and takeaway",
			amount:      800.00,
			period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			categories: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			},
		},
		{
			name:        "Entertainment Budget",
			description: "Movies, streaming, concerts",
			amount:      200.00,
			period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			categories: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
			},
		},
		{
			name:        "Transport Budget",
			description: "Fuel, public transport, rideshare",
			amount:      400.00,
			period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			categories: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
			},
		},
		{
			name:        "Utilities Budget",
			description: "Electricity, water, internet, phone",
			amount:      450.00,
			period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			categories: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES,
			},
		},
		{
			name:        "Shopping Budget",
			description: "Clothes, electronics, general shopping",
			amount:      300.00,
			period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY,
			categories: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			},
		},
		{
			name:        "Weekly Groceries",
			description: "Weekly grocery shopping limit",
			amount:      150.00,
			period:      pfinancev1.BudgetPeriod_BUDGET_PERIOD_WEEKLY,
			categories: []pfinancev1.ExpenseCategory{
				pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			},
		},
	}

	for _, b := range budgets {
		_, err := client.CreateBudget(ctx, connect.NewRequest(&pfinancev1.CreateBudgetRequest{
			UserId:      userID,
			Name:        b.name,
			Description: b.description,
			Amount:      b.amount,
			Period:      b.period,
			CategoryIds: b.categories,
			StartDate:   timestamppb.New(time.Now().AddDate(0, 0, -30)), // Started 30 days ago
		}))
		if err != nil {
			return fmt.Errorf("failed to create budget '%s': %w", b.name, err)
		}
		log.Printf("  ✓ Created budget: %s ($%.2f/%s)", b.name, b.amount, b.period.String())
	}

	return nil
}

func seedGroup(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) error {
	log.Println("👥 Creating group with shared expenses...")

	// Create a group
	groupResp, err := client.CreateGroup(ctx, connect.NewRequest(&pfinancev1.CreateGroupRequest{
		OwnerId:     userID,
		Name:        "Household Expenses",
		Description: "Shared expenses with roommates",
	}))
	if err != nil {
		return fmt.Errorf("failed to create group: %w", err)
	}
	groupID := groupResp.Msg.Group.Id
	log.Printf("  ✓ Created group: %s", groupResp.Msg.Group.Name)

	// Create shared expenses for the group
	sharedExpenses := []struct {
		description string
		amount      float64
		category    pfinancev1.ExpenseCategory
		daysAgo     int
	}{
		{"Shared groceries", 245.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 2},
		{"Household cleaning supplies", 65.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, 5},
		{"Shared Netflix account", 22.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 7},
		{"Group dinner party", 180.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 10},
		{"Shared electricity bill", 285.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 12},
		{"Internet bill (shared)", 99.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 15},
	}

	for _, exp := range sharedExpenses {
		date := time.Now().AddDate(0, 0, -exp.daysAgo)
		_, err := client.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
			UserId:           userID,
			GroupId:          groupID,
			Description:      exp.description,
			Amount:           exp.amount,
			Category:         exp.category,
			Frequency:        pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
			Date:             timestamppb.New(date),
			PaidByUserId:     userID,
			SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
			AllocatedUserIds: []string{userID}, // In real scenario, would have multiple users
		}))
		if err != nil {
			return fmt.Errorf("failed to create shared expense '%s': %w", exp.description, err)
		}
		log.Printf("  ✓ Created shared expense: %s ($%.2f)", exp.description, exp.amount)
	}

	// Create an invite link for the group
	_, err = client.CreateInviteLink(ctx, connect.NewRequest(&pfinancev1.CreateInviteLinkRequest{
		GroupId:       groupID,
		CreatedBy:     userID,
		DefaultRole:   pfinancev1.GroupRole_GROUP_ROLE_MEMBER,
		ExpiresInDays: 30,
		MaxUses:       5,
	}))
	if err != nil {
		log.Printf("  ⚠ Could not create invite link: %v", err)
	} else {
		log.Println("  ✓ Created invite link for group")
	}

	return nil
}

func verifySeededData(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) error {
	// Verify expenses
	expensesResp, err := client.ListExpenses(ctx, connect.NewRequest(&pfinancev1.ListExpensesRequest{
		UserId:   userID,
		PageSize: 100,
	}))
	if err != nil {
		return fmt.Errorf("failed to list expenses: %w", err)
	}
	expenseCount := len(expensesResp.Msg.Expenses)
	if expenseCount == 0 {
		return fmt.Errorf("no expenses found for user %s - data may not have been stored correctly", userID)
	}
	log.Printf("  ✓ Found %d expenses for user", expenseCount)

	// Verify incomes
	incomesResp, err := client.ListIncomes(ctx, connect.NewRequest(&pfinancev1.ListIncomesRequest{
		UserId:   userID,
		PageSize: 100,
	}))
	if err != nil {
		return fmt.Errorf("failed to list incomes: %w", err)
	}
	incomeCount := len(incomesResp.Msg.Incomes)
	if incomeCount == 0 {
		return fmt.Errorf("no incomes found for user %s - data may not have been stored correctly", userID)
	}
	log.Printf("  ✓ Found %d incomes for user", incomeCount)

	// Verify budgets
	budgetsResp, err := client.ListBudgets(ctx, connect.NewRequest(&pfinancev1.ListBudgetsRequest{
		UserId:          userID,
		IncludeInactive: true,
		PageSize:        100,
	}))
	if err != nil {
		return fmt.Errorf("failed to list budgets: %w", err)
	}
	budgetCount := len(budgetsResp.Msg.Budgets)
	if budgetCount == 0 {
		return fmt.Errorf("no budgets found for user %s - data may not have been stored correctly", userID)
	}
	log.Printf("  ✓ Found %d budgets for user", budgetCount)

	// Verify groups
	groupsResp, err := client.ListGroups(ctx, connect.NewRequest(&pfinancev1.ListGroupsRequest{
		UserId:   userID,
		PageSize: 100,
	}))
	if err != nil {
		return fmt.Errorf("failed to list groups: %w", err)
	}
	groupCount := len(groupsResp.Msg.Groups)
	if groupCount == 0 {
		return fmt.Errorf("no groups found for user %s - data may not have been stored correctly", userID)
	}
	log.Printf("  ✓ Found %d groups for user", groupCount)

	log.Printf("")
	log.Printf("📊 Summary: %d expenses, %d incomes, %d budgets, %d groups", expenseCount, incomeCount, budgetCount, groupCount)

	return nil
}
