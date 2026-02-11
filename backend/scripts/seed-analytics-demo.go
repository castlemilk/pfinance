//go:build ignore
// +build ignore

// seed-analytics-demo seeds 6 months of realistic financial data for a demo user.
// It authenticates via Firebase Admin SDK and targets the production backend.
//
// Usage:
//   export GOOGLE_APPLICATION_CREDENTIALS=../pfinance-app-1748773335-firebase-adminsdk-fbsvc-4adcc18be2.json
//   cd backend && go run scripts/seed-analytics-demo.go

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"time"

	"connectrpc.com/connect"
	firebase "firebase.google.com/go/v4"
	firebaseauth "firebase.google.com/go/v4/auth"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/gen/pfinance/v1/pfinancev1connect"
	"google.golang.org/protobuf/types/known/timestamppb"
)

const (
	prodAPIURL     = "https://pfinance-backend-tvj6nmevta-uc.a.run.app"
	firebaseAPIKey = "AIzaSyBbSWgNm4JW3wk_QyzVrUgfTdNruWMI2IM"
	demoEmail      = "demo@pfinance.dev"
	demoPassword   = "DemoP@ss2025!"
)

func main() {
	ctx := context.Background()
	rng := rand.New(rand.NewSource(42)) // deterministic for reproducibility

	apiURL := os.Getenv("API_URL")
	if apiURL == "" {
		apiURL = prodAPIURL
	}

	// Step 1: Initialize Firebase Admin SDK
	log.Println("🔥 Initializing Firebase Admin SDK...")
	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		log.Fatalf("Failed to init Firebase app: %v", err)
	}
	authClient, err := app.Auth(ctx)
	if err != nil {
		log.Fatalf("Failed to get Auth client: %v", err)
	}

	// Step 2: Look up or create the demo user
	log.Printf("👤 Looking up user %s...", demoEmail)
	user, err := authClient.GetUserByEmail(ctx, demoEmail)
	if err != nil {
		log.Printf("  User not found, creating...")
		params := (&firebaseauth.UserToCreate{}).Email(demoEmail).Password(demoPassword).DisplayName("Demo User")
		user, err = authClient.CreateUser(ctx, params)
		if err != nil {
			log.Fatalf("Failed to create demo user: %v", err)
		}
		log.Printf("  ✅ Created user: %s (UID: %s)", demoEmail, user.UID)
	} else {
		log.Printf("  ✅ Found user: %s (UID: %s)", demoEmail, user.UID)
	}

	// Step 3: Ensure user has Pro subscription claims
	log.Println("👑 Setting Pro subscription claims...")
	if err := authClient.SetCustomUserClaims(ctx, user.UID, map[string]interface{}{
		"subscription_tier":   "PRO",
		"subscription_status": "ACTIVE",
	}); err != nil {
		log.Fatalf("Failed to set custom claims: %v", err)
	}

	// Step 4: Get ID token via Firebase REST API
	log.Println("🔐 Getting ID token...")
	idToken, err := signInWithPassword(demoEmail, demoPassword)
	if err != nil {
		log.Fatalf("Failed to sign in: %v", err)
	}
	log.Println("  ✅ Got ID token")

	// Step 5: Create authenticated Connect client
	client := pfinancev1connect.NewFinanceServiceClient(
		http.DefaultClient,
		apiURL,
		connect.WithInterceptors(bearerInterceptor(idToken)),
	)

	userID := user.UID

	// Step 6: Seed data
	log.Printf("🌱 Seeding 6 months of data for %s (UID: %s)...", demoEmail, userID)
	log.Printf("📡 Target: %s", apiURL)
	log.Println()

	seedExpenses(ctx, client, userID, rng)
	seedIncomes(ctx, client, userID, rng)
	seedBudgets(ctx, client, userID)
	seedGoals(ctx, client, userID)

	log.Println()
	log.Println("✅ Successfully seeded analytics demo data!")
	log.Printf("   Login: %s / %s", demoEmail, demoPassword)
}

func bearerInterceptor(token string) connect.UnaryInterceptorFunc {
	return func(next connect.UnaryFunc) connect.UnaryFunc {
		return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
			req.Header().Set("Authorization", "Bearer "+token)
			return next(ctx, req)
		}
	}
}

func signInWithPassword(email, password string) (string, error) {
	url := fmt.Sprintf("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=%s", firebaseAPIKey)
	body, _ := json.Marshal(map[string]interface{}{
		"email":             email,
		"password":          password,
		"returnSecureToken": true,
	})
	resp, err := http.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return "", fmt.Errorf("sign in failed (%d): %s", resp.StatusCode, data)
	}
	var result struct {
		IDToken string `json:"idToken"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		return "", err
	}
	return result.IDToken, nil
}

// ============================================================================
// Expense seeding - 6 months of realistic expenses
// ============================================================================

type expenseTemplate struct {
	description string
	minAmount   float64
	maxAmount   float64
	category    pfinancev1.ExpenseCategory
	frequency   string // "daily", "weekly", "biweekly", "monthly", "random"
}

var recurringExpenses = []expenseTemplate{
	// Monthly bills
	{"Rent payment", 2200, 2200, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING, "monthly"},
	{"Electricity bill", 120, 220, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, "monthly"},
	{"Water bill", 45, 75, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, "monthly"},
	{"Internet bill", 89, 89, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, "monthly"},
	{"Phone bill", 65, 85, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES, "monthly"},
	{"Car insurance", 145, 145, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "monthly"},
	{"Netflix", 22.99, 22.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "monthly"},
	{"Spotify", 12.99, 12.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "monthly"},
	{"Gym membership", 65, 65, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, "monthly"},
	{"Home insurance", 125, 125, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING, "monthly"},

	// Weekly
	{"Grocery shopping", 80, 200, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "weekly"},
	{"Petrol", 55, 110, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "weekly"},
}

var randomExpenses = []expenseTemplate{
	// Food
	{"Coffee", 4.5, 8, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "random"},
	{"Lunch out", 15, 35, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "random"},
	{"Dinner at restaurant", 45, 120, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "random"},
	{"Takeaway", 20, 55, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "random"},
	{"Snacks", 5, 15, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, "random"},

	// Transport
	{"Uber ride", 12, 45, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "random"},
	{"Parking", 5, 20, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "random"},
	{"Train ticket", 8, 25, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION, "random"},

	// Entertainment
	{"Movie tickets", 18, 40, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "random"},
	{"Concert tickets", 60, 180, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "random"},
	{"Books", 15, 45, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "random"},
	{"Video game", 30, 80, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, "random"},

	// Shopping
	{"Clothing", 40, 200, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, "random"},
	{"Electronics", 50, 350, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, "random"},
	{"Home supplies", 15, 80, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, "random"},
	{"Amazon purchase", 20, 150, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, "random"},

	// Healthcare
	{"Pharmacy", 10, 60, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, "random"},
	{"Doctor visit", 50, 150, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, "random"},
	{"Dental checkup", 100, 250, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE, "random"},

	// Education
	{"Online course", 30, 200, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION, "random"},
	{"Technical books", 25, 60, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION, "random"},

	// Travel
	{"Weekend trip accommodation", 150, 400, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, "random"},
	{"Flight tickets", 200, 800, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRAVEL, "random"},
}

func seedExpenses(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string, rng *rand.Rand) {
	log.Println("📝 Seeding expenses (6 months)...")

	now := time.Now()
	startDate := now.AddDate(0, -6, 0)
	count := 0

	// Monthly recurring
	for _, tmpl := range recurringExpenses {
		if tmpl.frequency == "monthly" {
			for m := 0; m < 6; m++ {
				date := startDate.AddDate(0, m, rng.Intn(5)) // Slight variation in day
				amount := randAmount(rng, tmpl.minAmount, tmpl.maxAmount)
				createExpense(ctx, client, userID, tmpl.description, amount, tmpl.category, date)
				count++
			}
		} else if tmpl.frequency == "weekly" {
			d := startDate
			for d.Before(now) {
				amount := randAmount(rng, tmpl.minAmount, tmpl.maxAmount)
				createExpense(ctx, client, userID, tmpl.description, amount, tmpl.category, d)
				count++
				d = d.AddDate(0, 0, 7+rng.Intn(2)-1) // 6-8 day intervals
			}
		}
	}

	// Random expenses: generate 3-6 per day
	d := startDate
	for d.Before(now) {
		numExpenses := 2 + rng.Intn(4) // 2-5 expenses per day

		// Weekend spending boost
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			numExpenses += 1 + rng.Intn(2)
		}

		// Holiday spending spikes (December)
		if d.Month() == time.December && d.Day() >= 15 {
			numExpenses += 2 + rng.Intn(3)
		}

		for i := 0; i < numExpenses; i++ {
			tmpl := randomExpenses[rng.Intn(len(randomExpenses))]
			amount := randAmount(rng, tmpl.minAmount, tmpl.maxAmount)

			// Occasional anomaly: unusually large purchase (1 in 50)
			if rng.Intn(50) == 0 {
				amount *= 3 + rng.Float64()*2
			}

			createExpense(ctx, client, userID, tmpl.description, amount, tmpl.category, d)
			count++
		}

		d = d.AddDate(0, 0, 1)
	}

	log.Printf("  ✅ Created %d expenses", count)
}

func createExpense(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID, desc string, amount float64, cat pfinancev1.ExpenseCategory, date time.Time) {
	cents := int64(math.Round(amount * 100))
	_, err := client.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
		UserId:      userID,
		Description: desc,
		Amount:      amount,
		AmountCents: cents,
		Category:    cat,
		Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
		Date:        timestamppb.New(date),
	}))
	if err != nil {
		log.Printf("  ⚠ Failed to create expense '%s': %v", desc, err)
	}
}

// ============================================================================
// Income seeding - 6 months of incomes
// ============================================================================

func seedIncomes(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string, rng *rand.Rand) {
	log.Println("💰 Seeding incomes (6 months)...")

	now := time.Now()
	startDate := now.AddDate(0, -6, 0)
	count := 0

	// Monthly salary - paid on the 15th and last day of month
	for m := 0; m < 6; m++ {
		payday := time.Date(startDate.Year(), startDate.Month()+time.Month(m), 15, 0, 0, 0, 0, time.UTC)
		if payday.Before(now) {
			amount := 8500.0 + rng.Float64()*200 - 100 // slight variation
			cents := int64(math.Round(amount * 100))
			_, err := client.CreateIncome(ctx, connect.NewRequest(&pfinancev1.CreateIncomeRequest{
				UserId:      userID,
				Source:      "Software Engineer Salary",
				Amount:      amount,
				AmountCents: cents,
				Frequency:   pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
				TaxStatus:   pfinancev1.TaxStatus_TAX_STATUS_PRE_TAX,
				Date:        timestamppb.New(payday),
			}))
			if err != nil {
				log.Printf("  ⚠ Failed to create salary: %v", err)
			}
			count++
		}
	}

	// Freelance income - every 2-3 months
	freelanceDates := []int{1, 3, 5}
	for _, m := range freelanceDates {
		date := startDate.AddDate(0, m, 10+rng.Intn(10))
		if date.Before(now) {
			amount := 800 + rng.Float64()*1200
			cents := int64(math.Round(amount * 100))
			_, err := client.CreateIncome(ctx, connect.NewRequest(&pfinancev1.CreateIncomeRequest{
				UserId:      userID,
				Source:      "Freelance project",
				Amount:      amount,
				AmountCents: cents,
				Frequency:   pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
				TaxStatus:   pfinancev1.TaxStatus_TAX_STATUS_POST_TAX,
				Date:        timestamppb.New(date),
			}))
			if err != nil {
				log.Printf("  ⚠ Failed to create freelance income: %v", err)
			}
			count++
		}
	}

	// Dividend income - quarterly
	for m := 0; m < 6; m += 3 {
		date := startDate.AddDate(0, m, 25)
		if date.Before(now) {
			amount := 200 + rng.Float64()*150
			cents := int64(math.Round(amount * 100))
			_, err := client.CreateIncome(ctx, connect.NewRequest(&pfinancev1.CreateIncomeRequest{
				UserId:      userID,
				Source:      "Investment dividends",
				Amount:      amount,
				AmountCents: cents,
				Frequency:   pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
				TaxStatus:   pfinancev1.TaxStatus_TAX_STATUS_POST_TAX,
				Date:        timestamppb.New(date),
			}))
			if err != nil {
				log.Printf("  ⚠ Failed to create dividend: %v", err)
			}
			count++
		}
	}

	log.Printf("  ✅ Created %d incomes", count)
}

// ============================================================================
// Budget seeding
// ============================================================================

func seedBudgets(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) {
	log.Println("📊 Seeding budgets...")

	budgets := []struct {
		name       string
		desc       string
		amount     float64
		period     pfinancev1.BudgetPeriod
		categories []pfinancev1.ExpenseCategory
	}{
		{"Food & Dining", "All food, groceries, and dining out", 1200, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD}},
		{"Housing", "Rent and home insurance", 2500, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HOUSING}},
		{"Transport", "Car, fuel, and rides", 500, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION}},
		{"Entertainment", "Streaming, movies, and fun", 250, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT}},
		{"Utilities", "Bills and subscriptions", 400, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UTILITIES}},
		{"Shopping", "Clothes, electronics, misc", 400, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING}},
		{"Healthcare", "Medical, dental, pharmacy", 300, pfinancev1.BudgetPeriod_BUDGET_PERIOD_MONTHLY, []pfinancev1.ExpenseCategory{pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_HEALTHCARE}},
	}

	for _, b := range budgets {
		cents := int64(math.Round(b.amount * 100))
		_, err := client.CreateBudget(ctx, connect.NewRequest(&pfinancev1.CreateBudgetRequest{
			UserId:      userID,
			Name:        b.name,
			Description: b.desc,
			Amount:      b.amount,
			AmountCents: cents,
			Period:      b.period,
			CategoryIds: b.categories,
			StartDate:   timestamppb.New(time.Now().AddDate(0, -6, 0)),
		}))
		if err != nil {
			log.Printf("  ⚠ Failed to create budget '%s': %v", b.name, err)
		} else {
			log.Printf("  ✓ Budget: %s ($%.0f/mo)", b.name, b.amount)
		}
	}
}

// ============================================================================
// Goal seeding
// ============================================================================

func seedGoals(ctx context.Context, client pfinancev1connect.FinanceServiceClient, userID string) {
	log.Println("🎯 Seeding goals...")

	goals := []struct {
		name   string
		target float64
		saved  float64
	}{
		{"Emergency Fund", 20000, 12500},
		{"Japan Trip", 5000, 3200},
		{"New Laptop", 3000, 2800},
	}

	for _, g := range goals {
		resp, err := client.CreateGoal(ctx, connect.NewRequest(&pfinancev1.CreateGoalRequest{
			UserId:       userID,
			Name:         g.name,
			TargetAmount: g.target,
			TargetDate:   timestamppb.New(time.Now().AddDate(0, 6, 0)),
		}))
		if err != nil {
			log.Printf("  ⚠ Failed to create goal '%s': %v", g.name, err)
			continue
		}
		log.Printf("  ✓ Goal: %s ($%.0f / $%.0f)", g.name, g.saved, g.target)

		// Add contributions
		goalID := resp.Msg.Goal.Id
		remaining := g.saved
		date := time.Now().AddDate(0, -6, 0)
		for remaining > 0 {
			contrib := math.Min(remaining, 500+rand.Float64()*500)
			contribCents := int64(math.Round(contrib * 100))
			_, err := client.ContributeToGoal(ctx, connect.NewRequest(&pfinancev1.ContributeToGoalRequest{
				UserId:      userID,
				GoalId:      goalID,
				Amount:      contrib,
				AmountCents: contribCents,
			}))
			if err != nil {
				log.Printf("    ⚠ Failed to contribute: %v", err)
				break
			}
			remaining -= contrib
			date = date.AddDate(0, 0, 14+rand.Intn(7)) // Every 2-3 weeks
		}
	}
}

// ============================================================================
// Helpers
// ============================================================================

func randAmount(rng *rand.Rand, min, max float64) float64 {
	v := min + rng.Float64()*(max-min)
	return math.Round(v*100) / 100
}

