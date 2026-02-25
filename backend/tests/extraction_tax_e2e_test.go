package tests

import (
	"context"
	"encoding/csv"
	"strings"
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/castlemilk/pfinance/backend/internal/service"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// taxTestContext creates an authenticated context with Pro subscription for tax tests.
func taxTestContext(userID string) context.Context {
	ctx := auth.WithUserClaims(context.Background(), &auth.UserClaims{
		UID:         userID,
		Email:       userID + "@test.com",
		DisplayName: "Test User",
		Verified:    true,
	})
	ctx = auth.WithSubscription(ctx, &auth.SubscriptionInfo{
		Tier:   pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO,
		Status: pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE,
	})
	return ctx
}

// setupTaxE2E creates an in-memory store, finance service, and tax pipeline for E2E tests.
func setupTaxE2E(t *testing.T) (*service.FinanceService, store.Store, context.Context) {
	memStore := store.NewMemoryStore()
	svc := service.NewFinanceService(memStore, nil, nil)

	// Set up tax pipeline on the service (no Gemini API key — rule-based only)
	pipeline := extraction.NewTaxClassificationPipeline("")
	svc.SetTaxClassificationPipeline(pipeline)

	ctx := taxTestContext("e2e-tax-user")
	return svc, memStore, ctx
}

// createExpenseHelper is a convenience wrapper around CreateExpense for the tax E2E tests.
func createExpenseHelper(t *testing.T, svc *service.FinanceService, ctx context.Context, description string, amount float64, category pfinancev1.ExpenseCategory, date time.Time) string {
	t.Helper()
	resp, err := svc.CreateExpense(ctx, connect.NewRequest(&pfinancev1.CreateExpenseRequest{
		UserId:      "e2e-tax-user",
		Description: description,
		Amount:      amount,
		Category:    category,
		Frequency:   pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
		Date:        timestamppb.New(date),
	}))
	if err != nil {
		t.Fatalf("Failed to create expense %q: %v", description, err)
	}
	return resp.Msg.Expense.Id
}

// createIncomeHelper is a convenience wrapper around CreateIncome for the tax E2E tests.
func createIncomeHelper(t *testing.T, svc *service.FinanceService, ctx context.Context, source string, amount float64, date time.Time) string {
	t.Helper()
	resp, err := svc.CreateIncome(ctx, connect.NewRequest(&pfinancev1.CreateIncomeRequest{
		UserId:    "e2e-tax-user",
		Source:    source,
		Amount:    amount,
		Frequency: pfinancev1.IncomeFrequency_INCOME_FREQUENCY_MONTHLY,
		Date:      timestamppb.New(date),
	}))
	if err != nil {
		t.Fatalf("Failed to create income %q: %v", source, err)
	}
	return resp.Msg.Income.Id
}

// TestFullPipeline_ImportAndClassify tests creating expenses and running batch classification.
// It creates 10 expenses spanning clearly not-deductible, clearly deductible, keyword matches,
// and ambiguous items, then verifies the batch classification pipeline processes them correctly.
func TestFullPipeline_ImportAndClassify(t *testing.T) {
	svc, _, ctx := setupTaxE2E(t)

	// FY 2024-25: July 2024 to June 2025
	fyDate := func(month time.Month, day int) time.Time {
		year := 2024
		if month < time.July {
			year = 2025
		}
		return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
	}

	// --- Create 10 expenses ---

	// 3 clearly NOT deductible (merchants in the not-deductible list)
	createExpenseHelper(t, svc, ctx, "Woolworths groceries", 85.50, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, fyDate(time.August, 10))
	createExpenseHelper(t, svc, ctx, "Netflix monthly subscription", 16.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, fyDate(time.September, 1))
	createExpenseHelper(t, svc, ctx, "McDonalds lunch", 12.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, fyDate(time.October, 5))

	// 3 clearly deductible (merchants in the deductible merchant map)
	createExpenseHelper(t, svc, ctx, "H&R Block tax return preparation", 250.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, fyDate(time.November, 15))
	createExpenseHelper(t, svc, ctx, "Red Cross annual donation", 100.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, fyDate(time.December, 20))
	createExpenseHelper(t, svc, ctx, "Xero accounting subscription", 50.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, fyDate(time.January, 10))

	// 2 keyword matches (work-related keywords)
	createExpenseHelper(t, svc, ctx, "Officeworks office supplies", 45.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, fyDate(time.February, 5))
	createExpenseHelper(t, svc, ctx, "Tech conference registration", 350.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION, fyDate(time.March, 12))

	// 2 ambiguous (no matching rules)
	createExpenseHelper(t, svc, ctx, "Random shop purchase", 30.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, fyDate(time.April, 1))
	createExpenseHelper(t, svc, ctx, "Misc payment transfer", 75.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, fyDate(time.May, 20))

	// --- Run batch classification ---
	classifyResp, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		FinancialYear: "2024-25",
		AutoApply:     true,
	}))
	if err != nil {
		t.Fatalf("BatchClassifyTaxDeductibility failed: %v", err)
	}

	resp := classifyResp.Msg

	// Verify TotalProcessed == 10
	if resp.TotalProcessed != 10 {
		t.Errorf("Expected TotalProcessed=10, got %d", resp.TotalProcessed)
	}

	// Verify AutoApplied > 0 (at least the high-confidence deductible and not-deductible)
	if resp.AutoApplied <= 0 {
		t.Errorf("Expected AutoApplied > 0, got %d", resp.AutoApplied)
	}

	// Verify Skipped >= 0 (ambiguous/low-confidence items may be skipped)
	if resp.Skipped < 0 {
		t.Errorf("Expected Skipped >= 0, got %d", resp.Skipped)
	}

	// Verify we got results back
	if len(resp.Results) == 0 {
		t.Error("Expected classification results, got none")
	}

	// Log the classification breakdown for debugging
	t.Logf("Classification results: TotalProcessed=%d, AutoApplied=%d, NeedsReview=%d, Skipped=%d, Results=%d",
		resp.TotalProcessed, resp.AutoApplied, resp.NeedsReview, resp.Skipped, len(resp.Results))
	for _, r := range resp.Results {
		t.Logf("  Expense=%s deductible=%v category=%s confidence=%.2f auto_applied=%v reasoning=%q",
			r.ExpenseId, r.IsDeductible, r.Category, r.Confidence, r.AutoApplied, r.Reasoning)
	}
}

// TestFullPipeline_ClassifyThenSummary tests the full flow from expense creation through
// classification to tax summary generation. It creates incomes and expenses, classifies
// the expenses, then verifies the tax summary calculations.
func TestFullPipeline_ClassifyThenSummary(t *testing.T) {
	svc, _, ctx := setupTaxE2E(t)

	// --- Create 2 incomes totalling $80,000 ---
	createIncomeHelper(t, svc, ctx, "Salary - Employer A", 50000.00, time.Date(2024, 10, 1, 0, 0, 0, 0, time.UTC))
	createIncomeHelper(t, svc, ctx, "Freelance income", 30000.00, time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC))

	// --- Create 5 expenses ---
	createExpenseHelper(t, svc, ctx, "H&R Block tax prep", 200.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2024, 8, 15, 0, 0, 0, 0, time.UTC))
	createExpenseHelper(t, svc, ctx, "Red Cross donation", 150.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2024, 12, 25, 0, 0, 0, 0, time.UTC))
	createExpenseHelper(t, svc, ctx, "Office supplies for work", 80.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2025, 2, 10, 0, 0, 0, 0, time.UTC))
	createExpenseHelper(t, svc, ctx, "Woolworths groceries", 120.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, time.Date(2025, 3, 5, 0, 0, 0, 0, time.UTC))
	createExpenseHelper(t, svc, ctx, "Netflix subscription", 16.99, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT, time.Date(2025, 4, 1, 0, 0, 0, 0, time.UTC))

	// --- Classify expenses ---
	_, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		FinancialYear: "2024-25",
		AutoApply:     true,
	}))
	if err != nil {
		t.Fatalf("BatchClassifyTaxDeductibility failed: %v", err)
	}

	// --- Get tax summary ---
	summaryResp, err := svc.GetTaxSummary(ctx, connect.NewRequest(&pfinancev1.GetTaxSummaryRequest{
		FinancialYear: "2024-25",
	}))
	if err != nil {
		t.Fatalf("GetTaxSummary failed: %v", err)
	}

	calc := summaryResp.Msg.Calculation
	if calc == nil {
		t.Fatal("Expected tax calculation in response, got nil")
	}

	// Verify GrossIncomeCents == 8_000_000 ($80,000.00)
	if calc.GrossIncomeCents != 8000000 {
		t.Errorf("Expected GrossIncomeCents=8000000, got %d", calc.GrossIncomeCents)
	}

	// Verify TotalTaxCents > 0 (on $80k income, tax should be non-trivial)
	if calc.TotalTaxCents <= 0 {
		t.Errorf("Expected TotalTaxCents > 0, got %d", calc.TotalTaxCents)
	}

	// Verify TaxableIncome <= GrossIncome (deductions should reduce it)
	if calc.TaxableIncomeCents > calc.GrossIncomeCents {
		t.Errorf("Expected TaxableIncomeCents <= GrossIncomeCents, got %d > %d", calc.TaxableIncomeCents, calc.GrossIncomeCents)
	}

	// Verify effective rate is reasonable (should be between 0 and 0.45 for Australian tax)
	if calc.EffectiveRate < 0 || calc.EffectiveRate > 0.45 {
		t.Errorf("Expected EffectiveRate in [0, 0.45], got %f", calc.EffectiveRate)
	}

	t.Logf("Tax Summary: GrossIncome=$%.2f, Deductions=$%.2f, TaxableIncome=$%.2f, TotalTax=$%.2f, EffectiveRate=%.2f%%",
		calc.GrossIncome, calc.TotalDeductions, calc.TaxableIncome, calc.TotalTax, calc.EffectiveRate*100)
}

// TestFullPipeline_ClassifyThenExport tests the full flow from expense creation through
// classification to CSV export. It verifies the exported CSV contains the expected rows.
func TestFullPipeline_ClassifyThenExport(t *testing.T) {
	svc, _, ctx := setupTaxE2E(t)

	// --- Create 1 income ($100k) ---
	createIncomeHelper(t, svc, ctx, "Full-time salary", 100000.00, time.Date(2024, 9, 1, 0, 0, 0, 0, time.UTC))

	// --- Create 3 deductible expenses ---
	createExpenseHelper(t, svc, ctx, "H&R Block tax return", 300.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2024, 10, 15, 0, 0, 0, 0, time.UTC))
	createExpenseHelper(t, svc, ctx, "Red Cross donation", 200.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2024, 12, 1, 0, 0, 0, 0, time.UTC))
	createExpenseHelper(t, svc, ctx, "Xero accounting software", 50.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2025, 3, 15, 0, 0, 0, 0, time.UTC))

	// --- Classify with auto_apply ---
	_, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		FinancialYear: "2024-25",
		AutoApply:     true,
	}))
	if err != nil {
		t.Fatalf("BatchClassifyTaxDeductibility failed: %v", err)
	}

	// --- Export as CSV ---
	exportResp, err := svc.ExportTaxReturn(ctx, connect.NewRequest(&pfinancev1.ExportTaxReturnRequest{
		FinancialYear: "2024-25",
		Format:        pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_CSV,
	}))
	if err != nil {
		t.Fatalf("ExportTaxReturn failed: %v", err)
	}

	export := exportResp.Msg

	// Verify filename and content type
	if export.Filename != "tax-return-2024-25.csv" {
		t.Errorf("Expected filename 'tax-return-2024-25.csv', got %q", export.Filename)
	}
	if export.ContentType != "text/csv" {
		t.Errorf("Expected content type 'text/csv', got %q", export.ContentType)
	}

	// Verify data is non-empty
	if len(export.Data) == 0 {
		t.Fatal("Expected non-empty CSV data")
	}

	// Parse the CSV
	reader := csv.NewReader(strings.NewReader(string(export.Data)))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("Failed to parse CSV: %v", err)
	}

	// Verify header row
	if len(records) < 2 {
		t.Fatalf("Expected at least 2 CSV rows (header + data), got %d", len(records))
	}

	// Check for expected rows by looking at the first column (field names)
	fieldNames := make(map[string]bool)
	for _, row := range records {
		if len(row) > 0 {
			fieldNames[row[0]] = true
		}
	}

	expectedFields := []string{"Gross Income", "Total Tax", "Financial Year", "Taxable Income", "Total Deductions"}
	for _, field := range expectedFields {
		if !fieldNames[field] {
			t.Errorf("Expected CSV to contain row with field %q", field)
		}
	}

	// Verify the Gross Income row has correct value
	for _, row := range records {
		if len(row) >= 3 && row[0] == "Gross Income" {
			if row[2] != "10000000" {
				t.Errorf("Expected Gross Income cents=10000000, got %q", row[2])
			}
		}
	}

	// Verify the calculation is also returned
	if export.Calculation == nil {
		t.Error("Expected Calculation in export response")
	} else if export.Calculation.GrossIncomeCents != 10000000 {
		t.Errorf("Expected Calculation.GrossIncomeCents=10000000, got %d", export.Calculation.GrossIncomeCents)
	}

	t.Logf("Exported CSV (%d bytes, %d rows)", len(export.Data), len(records))
	for _, row := range records {
		t.Logf("  %s", strings.Join(row, " | "))
	}
}

// TestFullPipeline_RerunSkipsUserClassified tests that re-running batch classification
// correctly skips expenses that have been manually classified by the user.
func TestFullPipeline_RerunSkipsUserClassified(t *testing.T) {
	svc, _, ctx := setupTaxE2E(t)

	// --- Create 5 expenses ---
	ids := make([]string, 5)
	ids[0] = createExpenseHelper(t, svc, ctx, "Woolworths groceries", 50.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD, time.Date(2024, 8, 1, 0, 0, 0, 0, time.UTC))
	ids[1] = createExpenseHelper(t, svc, ctx, "H&R Block tax prep", 200.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2024, 9, 15, 0, 0, 0, 0, time.UTC))
	ids[2] = createExpenseHelper(t, svc, ctx, "Red Cross donation", 100.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2024, 11, 1, 0, 0, 0, 0, time.UTC))
	ids[3] = createExpenseHelper(t, svc, ctx, "Random shop", 25.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING, time.Date(2025, 1, 20, 0, 0, 0, 0, time.UTC))
	ids[4] = createExpenseHelper(t, svc, ctx, "Misc payment", 60.00, pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER, time.Date(2025, 3, 10, 0, 0, 0, 0, time.UTC))

	// --- First classification run ---
	firstResp, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		FinancialYear: "2024-25",
		AutoApply:     true,
	}))
	if err != nil {
		t.Fatalf("First BatchClassifyTaxDeductibility failed: %v", err)
	}

	firstProcessed := firstResp.Msg.TotalProcessed
	t.Logf("First run: TotalProcessed=%d, AutoApplied=%d, Skipped=%d",
		firstResp.Msg.TotalProcessed, firstResp.Msg.AutoApplied, firstResp.Msg.Skipped)

	if firstProcessed != 5 {
		t.Errorf("Expected first run TotalProcessed=5, got %d", firstProcessed)
	}

	// --- Manually classify 2 expenses as deductible using BatchUpdateExpenseTaxStatus ---
	updateResp, err := svc.BatchUpdateExpenseTaxStatus(ctx, connect.NewRequest(&pfinancev1.BatchUpdateExpenseTaxStatusRequest{
		Updates: []*pfinancev1.ExpenseTaxUpdate{
			{
				ExpenseId:            ids[3], // "Random shop" — mark as deductible
				IsTaxDeductible:      true,
				TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
				TaxDeductionNote:     "Work supplies from local shop",
				TaxDeductiblePercent: 1.0,
			},
			{
				ExpenseId:            ids[4], // "Misc payment" — mark as deductible
				IsTaxDeductible:      true,
				TaxDeductionCategory: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER_WORK,
				TaxDeductionNote:     "Business payment",
				TaxDeductiblePercent: 1.0,
			},
		},
	}))
	if err != nil {
		t.Fatalf("BatchUpdateExpenseTaxStatus failed: %v", err)
	}
	if updateResp.Msg.UpdatedCount != 2 {
		t.Errorf("Expected 2 updates, got %d", updateResp.Msg.UpdatedCount)
	}

	// --- Second classification run ---
	secondResp, err := svc.BatchClassifyTaxDeductibility(ctx, connect.NewRequest(&pfinancev1.BatchClassifyTaxDeductibilityRequest{
		FinancialYear: "2024-25",
		AutoApply:     true,
	}))
	if err != nil {
		t.Fatalf("Second BatchClassifyTaxDeductibility failed: %v", err)
	}

	t.Logf("Second run: TotalProcessed=%d, AutoApplied=%d, Skipped=%d",
		secondResp.Msg.TotalProcessed, secondResp.Msg.AutoApplied, secondResp.Msg.Skipped)

	// The 2 manually classified expenses should be skipped (source="user" in pipeline)
	// Plus any expenses that were auto-applied in the first run (they now have IsTaxDeductible=true
	// and a TaxDeductionCategory set, so the pipeline treats them as "already classified by user")
	if secondResp.Msg.Skipped < 2 {
		t.Errorf("Expected Skipped >= 2 (at least the 2 user-classified), got %d", secondResp.Msg.Skipped)
	}

	// Total processed should still be 5 (all expenses are enumerated)
	if secondResp.Msg.TotalProcessed != 5 {
		t.Errorf("Expected second run TotalProcessed=5, got %d", secondResp.Msg.TotalProcessed)
	}
}
