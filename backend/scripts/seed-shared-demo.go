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

func main() {
	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = "http://localhost:8111"
	}

	// Primary user (already seeded)
	primaryUserID := os.Getenv("PRIMARY_USER_ID")
	if primaryUserID == "" {
		primaryUserID = "fBW9xq2TWOWpPC7EPh2aPhLHllP2"
	}

	// Second user for shared expenses demo
	secondUserID := os.Getenv("SECOND_USER_ID")
	if secondUserID == "" {
		secondUserID = "demo-roommate-user"
	}

	log.Printf("🏠 Setting up shared expenses demo")
	log.Printf("👤 Primary user: %s", primaryUserID)
	log.Printf("👤 Second user (roommate): %s", secondUserID)
	log.Printf("📡 API URL: %s", apiURL)

	httpClient := &http.Client{}
	client := pfinancev1connect.NewFinanceServiceClient(httpClient, apiURL)
	ctx := context.Background()

	// First, find the existing group for primary user
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
		// Create a new group if none exists
		groupResp, err := client.CreateGroup(ctx, connect.NewRequest(&pfinancev1.CreateGroupRequest{
			OwnerId:     primaryUserID,
			Name:        "Household Expenses",
			Description: "Shared expenses with roommates",
		}))
		if err != nil {
			log.Fatalf("Failed to create group: %v", err)
		}
		groupID = groupResp.Msg.Group.Id
		log.Printf("✓ Created new group: Household Expenses (ID: %s)", groupID)
	}

	// Create expenses paid by the second user (roommate)
	log.Println("")
	log.Println("💸 Creating expenses paid by roommate...")
	
	secondUserExpenses := []struct {
		description string
		amount      float64
		category    pfinancev1.ExpenseCategory
		daysAgo     int
	}{
		{"Shared groceries (roommate paid)", 187.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 1},
		{"Streaming services bundle", 45.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, 3},
		{"Utilities - Gas bill", 125.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 8},
		{"House party supplies", 95.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, 12},
		{"Shared Uber to airport", 68.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, 15},
		{"Wifi router replacement", 149.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, 20},
	}

	for _, exp := range secondUserExpenses {
		date := time.Now().AddDate(0, 0, -exp.daysAgo)
		_, err := client.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
			UserId:       secondUserID,
			GroupId:      groupID,
			Description:  exp.description,
			Amount:       exp.amount,
			Category:     exp.category,
			Frequency:    pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
			Date:         timestamppb.New(date),
			PaidByUserId: secondUserID, // Paid by roommate
			SplitType:    pfinancev1.SplitType_SPLIT_TYPE_EQUAL,
			AllocatedUserIds: []string{primaryUserID, secondUserID}, // Split between both
		}))
		if err != nil {
			log.Printf("  ✗ Failed to create expense '%s': %v", exp.description, err)
		} else {
			log.Printf("  ✓ Created: %s ($%.2f) - paid by roommate", exp.description, exp.amount)
		}
	}

	// Summary
	log.Println("")
	log.Println("✅ Shared expenses demo setup complete!")
	log.Println("")
	log.Println("📋 What was created:")
	log.Println("   - 6 shared expenses paid by the roommate")
	log.Println("   - Each expense split 50/50 between users")
	log.Println("")
	log.Println("💡 To test: Check the 'Shared' section in the app")
	log.Println("   You should see expenses you owe to your roommate!")
}

