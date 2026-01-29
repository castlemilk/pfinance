//go:build ignore
// +build ignore

package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// Demo users for testing
var demoUsers = []struct {
	id    string
	name  string
	email string
}{
	{"demo-roommate-user", "Alex Roommate", "roommate@demo.local"},
	{"demo-partner-user", "Sam Partner", "partner@demo.local"},
	{"demo-friend-user", "Jordan Friend", "friend@demo.local"},
}

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8111"
	}

	primaryUserID := os.Getenv("PRIMARY_USER_ID")
	if primaryUserID == "" {
		primaryUserID = "fBW9xq2TWOWpPC7EPh2aPhLHllP2" // Your Firebase UID
	}

	log.Println("🏠 Comprehensive Shared Expenses Seed Script")
	log.Printf("👤 Primary user: %s", primaryUserID)
	log.Printf("📡 API URL: %s", apiURL)
	log.Println("")

	httpClient := &http.Client{}
	client := pfinancev1connect.NewFinanceServiceClient(httpClient, apiURL)
	ctx := context.Background()

	// Find or create the group
	log.Println("📋 Finding/creating group...")
	groupsResp, err := client.ListGroups(ctx, connect.NewRequest(&pfinancev1.ListGroupsRequest{
		UserId:   primaryUserID,
		PageSize: 10,
	}))
	if err != nil {
		log.Fatalf("Failed to list groups: %v", err)
	}

	var groupID string
	if len(groupsResp.Msg.Groups) > 0 {
		groupID = groupsResp.Msg.Groups[0].Id
		log.Printf("✓ Found existing group: %s (ID: %s)", groupsResp.Msg.Groups[0].Name, groupID)
	} else {
		groupResp, err := client.CreateGroup(ctx, connect.NewRequest(&pfinancev1.CreateGroupRequest{
			OwnerId:     primaryUserID,
			Name:        "Household Expenses",
			Description: "Shared expenses with roommates and friends",
		}))
		if err != nil {
			log.Fatalf("Failed to create group: %v", err)
		}
		groupID = groupResp.Msg.Group.Id
		log.Printf("✓ Created new group: Household Expenses (ID: %s)", groupID)
	}

	// All users including primary
	allUserIDs := []string{primaryUserID}
	for _, u := range demoUsers {
		allUserIDs = append(allUserIDs, u.id)
	}

	// Create expenses from each demo user
	log.Println("")
	log.Println("💸 Creating shared expenses from demo users...")

	// Expenses from demo-roommate-user (Alex)
	createGroupExpenses(ctx, client, groupID, demoUsers[0].id, demoUsers[0].name, allUserIDs, []expenseData{
		{"Weekly grocery run at Costco", 287.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 1},
		{"House cleaning supplies", 45.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, 3},
		{"Netflix + Disney+ Bundle", 32.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 5},
		{"Shared Uber to concert", 48.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, 7},
		{"Monthly internet bill", 99.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 10},
	})

	// Expenses from demo-partner-user (Sam)
	createGroupExpenses(ctx, client, groupID, demoUsers[1].id, demoUsers[1].name, allUserIDs, []expenseData{
		{"Dinner at Italian restaurant", 156.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 2},
		{"Electricity bill Q1", 245.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 4},
		{"Board game night supplies", 67.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 6},
		{"Shared gym membership (monthly)", 120.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, 8},
		{"Emergency plumber visit", 350.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING, 12},
	})

	// Expenses from demo-friend-user (Jordan)
	createGroupExpenses(ctx, client, groupID, demoUsers[2].id, demoUsers[2].name, allUserIDs, []expenseData{
		{"BBQ supplies for weekend party", 189.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 3},
		{"Spotify Family Plan", 24.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 5},
		{"Gas bill - heating", 178.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 9},
		{"House party decorations", 55.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, 11},
		{"Takeaway Thai food", 72.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 14},
	})

	// Create some incomes for demo users
	log.Println("")
	log.Println("💰 Creating demo user incomes...")
	createDemoIncomes(ctx, client)

	// Summary
	log.Println("")
	log.Println("✅ Comprehensive seed complete!")
	log.Println("")
	log.Println("📊 What was created:")
	log.Println("   - 15 shared expenses from 3 different demo users")
	log.Println("   - Each expense split equally among all 4 users")
	log.Println("   - Demo user incomes for testing")
	log.Println("")
	log.Println("💡 Testing tips:")
	log.Println("   1. Open the Debug Panel (bottom-right)")
	log.Println("   2. Impersonate 'demo-roommate-user' to see Alex's perspective")
	log.Println("   3. Check the Shared section to see who owes who")
	log.Println("   4. Switch between users to see different balances")
}

type expenseData struct {
	description string
	amount      float64
	category    pfinancev1.ExpenseCategory
	daysAgo     int
}

func createGroupExpenses(ctx context.Context, client pfinancev1connect.FinanceServiceClient, groupID, paidByUserID, userName string, allUserIDs []string, expenses []expenseData) {
	log.Printf("\n  👤 %s's expenses:", userName)

	for _, exp := range expenses {
		date := time.Now().AddDate(0, 0, -exp.daysAgo)
		_, err := client.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
			UserId:           paidByUserID,
			GroupId:          groupID,
			Description:      exp.description,
			Amount:           exp.amount,
			Category:         exp.category,
			Frequency:        pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
			Date:             timestamppb.New(date),
			PaidByUserId:     paidByUserID,
			SplitType:        pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
			AllocatedUserIds: allUserIDs,
		}))
		if err != nil {
			log.Printf("     ✗ Failed: %s - %v", exp.description, err)
		} else {
			shareAmount := exp.amount / float64(len(allUserIDs))
			log.Printf("     ✓ %s ($%.2f total, $%.2f per person)", exp.description, exp.amount, shareAmount)
		}
	}
}

func createDemoIncomes(ctx context.Context, client pfinancev1connect.FinanceServiceClient) {
	incomes := []struct {
		userID string
		name   string
		source string
		amount float64
	}{
		{"demo-roommate-user", "Alex", "Software Developer Salary", 7500.00},
		{"demo-partner-user", "Sam", "Marketing Manager Salary", 6800.00},
		{"demo-friend-user", "Jordan", "Product Designer Salary", 7200.00},
	}

	for _, inc := range incomes {
		_, err := client.CreateIncome(ctx, connect.NewRequest(&pfinancev1.CreateIncomeRequest{
			UserId:    inc.userID,
			Source:    inc.source,
			Amount:    inc.amount,
			Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
			TaxStatus: pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX,
			Date:      timestamppb.New(time.Now()),
		}))
		if err != nil {
			log.Printf("  ✗ Failed to create income for %s: %v", inc.name, err)
		} else {
			log.Printf("  ✓ %s: %s ($%.2f/month)", inc.name, inc.source, inc.amount)
		}
	}
}
