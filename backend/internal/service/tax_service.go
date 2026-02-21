package service

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"strconv"
	"strings"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// taxPipeline is the tax classification pipeline instance (set via SetTaxClassificationPipeline).
var taxPipeline *extraction.TaxClassificationPipeline

// SetTaxClassificationPipeline sets the tax classification pipeline for the handlers.
func SetTaxClassificationPipeline(p *extraction.TaxClassificationPipeline) {
	taxPipeline = p
}

// ============================================================================
// Australian Tax Bracket Definitions
// ============================================================================

// taxBracket represents a single tax bracket
type taxBracket struct {
	Min  float64 // Inclusive lower bound (dollars)
	Max  float64 // Inclusive upper bound (0 = no limit)
	Rate float64 // Marginal rate as a decimal (e.g., 0.30 = 30%)
}

// australianBrackets returns the Stage 3 tax brackets for 2024-25 onwards.
// Source: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
func australianBrackets(fy string) []taxBracket {
	switch fy {
	case "2023-24":
		return []taxBracket{
			{Min: 0, Max: 18200, Rate: 0},
			{Min: 18201, Max: 45000, Rate: 0.19},
			{Min: 45001, Max: 120000, Rate: 0.325},
			{Min: 120001, Max: 180000, Rate: 0.37},
			{Min: 180001, Max: 0, Rate: 0.45},
		}
	default: // 2024-25 onwards (Stage 3)
		return []taxBracket{
			{Min: 0, Max: 18200, Rate: 0},
			{Min: 18201, Max: 45000, Rate: 0.16},
			{Min: 45001, Max: 135000, Rate: 0.30},
			{Min: 135001, Max: 190000, Rate: 0.37},
			{Min: 190001, Max: 0, Rate: 0.45},
		}
	}
}

// ============================================================================
// Tax Calculation Functions
// ============================================================================

// parseFYDateRange converts a financial year string (e.g., "2025-26") to start and end dates.
// Australian FY: July 1 to June 30.
func parseFYDateRange(fy string) (time.Time, time.Time, error) {
	parts := strings.SplitN(fy, "-", 2)
	if len(parts) != 2 {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid financial year format: %s (expected YYYY-YY)", fy)
	}
	startYear, err := strconv.Atoi(parts[0])
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid start year in FY: %s", fy)
	}
	start := time.Date(startYear, time.July, 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(startYear+1, time.June, 30, 23, 59, 59, 0, time.UTC)
	return start, end, nil
}

// calculateBracketTax calculates the progressive tax based on taxable income in dollars.
func calculateBracketTax(taxableIncome float64, brackets []taxBracket) float64 {
	if taxableIncome <= 0 {
		return 0
	}
	var totalTax float64
	for _, b := range brackets {
		if b.Min > taxableIncome {
			break
		}
		upper := taxableIncome
		if b.Max > 0 && upper > b.Max {
			upper = b.Max
		}
		taxableInBracket := upper - b.Min + 1
		if b.Min == 0 {
			taxableInBracket = upper
		}
		if taxableInBracket < 0 {
			taxableInBracket = 0
		}
		totalTax += taxableInBracket * b.Rate
	}
	return totalTax
}

// calculateMedicareLevy calculates the 2% Medicare levy.
// Exemption at low income; phase-in for singles.
func calculateMedicareLevy(taxableIncome float64, exempt bool) float64 {
	if exempt {
		return 0
	}
	if taxableIncome <= 0 {
		return 0
	}
	// Medicare levy phase-in threshold for singles 2024-25
	const phaseInLower = 24276.0
	const phaseInUpper = 30345.0
	const levyRate = 0.02

	if taxableIncome <= phaseInLower {
		return 0
	}
	if taxableIncome <= phaseInUpper {
		// Phase-in: 10% of excess over lower threshold
		return (taxableIncome - phaseInLower) * 0.10
	}
	return taxableIncome * levyRate
}

// calculateHELPRepayment calculates the HELP/HECS repayment based on repayment income.
// 2024-25 thresholds. Source: ATO HELP repayment thresholds.
func calculateHELPRepayment(taxableIncome float64, hasHELP bool) float64 {
	if !hasHELP || taxableIncome <= 0 {
		return 0
	}

	// 2024-25 HELP repayment rates
	type helpBracket struct {
		threshold float64
		rate      float64
	}
	brackets := []helpBracket{
		{threshold: 54435, rate: 0.01},
		{threshold: 62850, rate: 0.02},
		{threshold: 66620, rate: 0.025},
		{threshold: 70618, rate: 0.03},
		{threshold: 74855, rate: 0.035},
		{threshold: 79346, rate: 0.04},
		{threshold: 84107, rate: 0.045},
		{threshold: 89154, rate: 0.05},
		{threshold: 94503, rate: 0.055},
		{threshold: 100174, rate: 0.06},
		{threshold: 106185, rate: 0.065},
		{threshold: 112556, rate: 0.07},
		{threshold: 119309, rate: 0.075},
		{threshold: 126467, rate: 0.08},
		{threshold: 134056, rate: 0.085},
		{threshold: 142100, rate: 0.09},
		{threshold: 150626, rate: 0.095},
		{threshold: 159663, rate: 0.10},
	}

	if taxableIncome < brackets[0].threshold {
		return 0
	}

	var rate float64
	for _, b := range brackets {
		if taxableIncome >= b.threshold {
			rate = b.rate
		} else {
			break
		}
	}
	return taxableIncome * rate
}

// calculateLITO calculates the Low Income Tax Offset.
// 2024-25 rates:
// - Income <= $37,500: LITO = $700
// - $37,500 < Income <= $45,000: reduces by 5c per $1
// - $45,000 < Income <= $66,667: reduces by 1.5c per $1
// - Income > $66,667: LITO = $0
func calculateLITO(taxableIncome float64) float64 {
	if taxableIncome <= 37500 {
		return 700
	}
	if taxableIncome <= 45000 {
		return math.Max(0, 700-(taxableIncome-37500)*0.05)
	}
	if taxableIncome <= 66667 {
		firstReduction := (45000 - 37500) * 0.05
		remaining := 700 - firstReduction
		return math.Max(0, remaining-(taxableIncome-45000)*0.015)
	}
	return 0
}

// calculateAustralianTax computes the full tax calculation.
func calculateAustralianTax(grossIncomeCents int64, deductions []*pfinancev1.TaxDeductionSummary, taxWithheldCents int64, includeHELP, medicareExempt bool, fy string) *pfinancev1.TaxCalculation {
	grossIncome := float64(grossIncomeCents) / 100.0

	var totalDeductionsCents int64
	for _, d := range deductions {
		totalDeductionsCents += d.TotalCents
	}
	totalDeductions := float64(totalDeductionsCents) / 100.0

	taxableIncome := math.Max(0, grossIncome-totalDeductions)
	taxableIncomeCents := int64(taxableIncome * 100)

	brackets := australianBrackets(fy)
	baseTax := calculateBracketTax(taxableIncome, brackets)
	baseTaxCents := int64(math.Round(baseTax * 100))

	medicareLevyDollars := calculateMedicareLevy(taxableIncome, medicareExempt)
	medicareLevyCents := int64(math.Round(medicareLevyDollars * 100))

	helpRepaymentDollars := calculateHELPRepayment(taxableIncome, includeHELP)
	helpRepaymentCents := int64(math.Round(helpRepaymentDollars * 100))

	litoDollars := calculateLITO(taxableIncome)
	litoCents := int64(math.Round(litoDollars * 100))

	totalTaxCents := baseTaxCents + medicareLevyCents + helpRepaymentCents - litoCents
	if totalTaxCents < 0 {
		totalTaxCents = 0
	}
	totalTax := float64(totalTaxCents) / 100.0

	var effectiveRate float64
	if grossIncome > 0 {
		effectiveRate = totalTax / grossIncome
	}

	// Positive = refund, negative = owed
	taxWithheld := float64(taxWithheldCents) / 100.0
	refundOrOwedCents := taxWithheldCents - totalTaxCents

	return &pfinancev1.TaxCalculation{
		FinancialYear:        fy,
		GrossIncomeCents:     grossIncomeCents,
		GrossIncome:          grossIncome,
		Deductions:           deductions,
		TotalDeductionsCents: totalDeductionsCents,
		TotalDeductions:      totalDeductions,
		TaxableIncomeCents:   taxableIncomeCents,
		TaxableIncome:        taxableIncome,
		BaseTaxCents:         baseTaxCents,
		BaseTax:              baseTax,
		MedicareLevyCents:    medicareLevyCents,
		MedicareLevy:         medicareLevyDollars,
		HelpRepaymentCents:   helpRepaymentCents,
		HelpRepayment:        helpRepaymentDollars,
		LitoCents:            litoCents,
		Lito:                 litoDollars,
		TotalTaxCents:        totalTaxCents,
		TotalTax:             totalTax,
		EffectiveRate:        effectiveRate,
		RefundOrOwedCents:    refundOrOwedCents,
		RefundOrOwed:         float64(refundOrOwedCents) / 100.0,
		TaxWithheldCents:     taxWithheldCents,
		TaxWithheld:          taxWithheld,
	}
}

// ============================================================================
// Tax RPC Handlers
// ============================================================================

// GetTaxSummary computes the full tax return summary for a financial year.
func (s *FinanceService) GetTaxSummary(ctx context.Context, req *connect.Request[pfinancev1.GetTaxSummaryRequest]) (*connect.Response[pfinancev1.GetTaxSummaryResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	fy := req.Msg.FinancialYear
	if fy == "" {
		fy = currentAustralianFY()
	}

	calc, err := s.computeTaxForFY(ctx, claims.UID, fy, 0, 0, false, false)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&pfinancev1.GetTaxSummaryResponse{
		Calculation: calc,
	}), nil
}

// GetTaxEstimate computes a what-if tax estimate with optional overrides.
func (s *FinanceService) GetTaxEstimate(ctx context.Context, req *connect.Request[pfinancev1.GetTaxEstimateRequest]) (*connect.Response[pfinancev1.GetTaxEstimateResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	fy := req.Msg.FinancialYear
	if fy == "" {
		fy = currentAustralianFY()
	}

	grossOverrideCents := req.Msg.GrossIncomeOverrideCents
	if grossOverrideCents == 0 && req.Msg.GrossIncomeOverride > 0 {
		grossOverrideCents = int64(req.Msg.GrossIncomeOverride * 100)
	}
	addDeductionsCents := req.Msg.AdditionalDeductionsCents
	if addDeductionsCents == 0 && req.Msg.AdditionalDeductions > 0 {
		addDeductionsCents = int64(req.Msg.AdditionalDeductions * 100)
	}

	calc, err := s.computeTaxForFY(ctx, claims.UID, fy, grossOverrideCents, addDeductionsCents, req.Msg.IncludeHelp, req.Msg.MedicareExemption)
	if err != nil {
		return nil, err
	}

	return connect.NewResponse(&pfinancev1.GetTaxEstimateResponse{
		Calculation: calc,
	}), nil
}

// computeTaxForFY fetches incomes + deductible expenses and computes the tax calculation.
func (s *FinanceService) computeTaxForFY(ctx context.Context, userID, fy string, grossOverrideCents, additionalDeductionsCents int64, includeHELP, medicareExempt bool) (*pfinancev1.TaxCalculation, error) {
	start, end, err := parseFYDateRange(fy)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Compute gross income
	var grossIncomeCents int64
	var taxWithheldCents int64

	if grossOverrideCents > 0 {
		grossIncomeCents = grossOverrideCents
	} else {
		// Sum all incomes in the FY
		var pageToken string
		for {
			incomes, nextToken, err := s.store.ListIncomes(ctx, userID, "", &start, &end, 500, pageToken)
			if err != nil {
				return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list incomes: %w", err))
			}
			for _, inc := range incomes {
				cents := inc.AmountCents
				if cents == 0 {
					cents = int64(inc.Amount * 100)
				}
				grossIncomeCents += cents

				// Accumulate tax withheld from deductions marked as tax_deductible
				for _, ded := range inc.Deductions {
					if ded.IsTaxDeductible {
						dedCents := ded.AmountCents
						if dedCents == 0 {
							dedCents = int64(ded.Amount * 100)
						}
						taxWithheldCents += dedCents
					}
				}
			}
			if nextToken == "" {
				break
			}
			pageToken = nextToken
		}
	}

	// Aggregate deductions by category
	deductions, err := s.store.AggregateDeductionsByCategory(ctx, userID, "", start, end)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("aggregate deductions: %w", err))
	}

	// Add additional deductions if specified
	if additionalDeductionsCents > 0 {
		deductions = append(deductions, &pfinancev1.TaxDeductionSummary{
			Category:     pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_OTHER,
			TotalCents:   additionalDeductionsCents,
			TotalAmount:  float64(additionalDeductionsCents) / 100.0,
			ExpenseCount: 0,
		})
	}

	calc := calculateAustralianTax(grossIncomeCents, deductions, taxWithheldCents, includeHELP, medicareExempt, fy)
	return calc, nil
}

// BatchUpdateExpenseTaxStatus updates the tax deductibility status of multiple expenses.
func (s *FinanceService) BatchUpdateExpenseTaxStatus(ctx context.Context, req *connect.Request[pfinancev1.BatchUpdateExpenseTaxStatusRequest]) (*connect.Response[pfinancev1.BatchUpdateExpenseTaxStatusResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if len(req.Msg.Updates) > 100 {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("max 100 updates per batch"))
	}

	var updatedCount int32
	var failedIDs []string

	for _, update := range req.Msg.Updates {
		expense, err := s.store.GetExpense(ctx, update.ExpenseId)
		if err != nil {
			failedIDs = append(failedIDs, update.ExpenseId)
			continue
		}

		// Verify ownership
		if expense.UserId != claims.UID {
			failedIDs = append(failedIDs, update.ExpenseId)
			continue
		}

		expense.IsTaxDeductible = update.IsTaxDeductible
		expense.TaxDeductionCategory = update.TaxDeductionCategory
		expense.TaxDeductionNote = update.TaxDeductionNote
		if update.TaxDeductiblePercent > 0 {
			expense.TaxDeductiblePercent = update.TaxDeductiblePercent
		} else if update.IsTaxDeductible {
			expense.TaxDeductiblePercent = 1.0
		}
		expense.UpdatedAt = timestamppb.Now()

		if err := s.store.UpdateExpense(ctx, expense); err != nil {
			failedIDs = append(failedIDs, update.ExpenseId)
			continue
		}
		updatedCount++
	}

	return connect.NewResponse(&pfinancev1.BatchUpdateExpenseTaxStatusResponse{
		UpdatedCount:     updatedCount,
		FailedExpenseIds: failedIDs,
	}), nil
}

// ListDeductibleExpenses lists tax-deductible expenses for a financial year.
func (s *FinanceService) ListDeductibleExpenses(ctx context.Context, req *connect.Request[pfinancev1.ListDeductibleExpensesRequest]) (*connect.Response[pfinancev1.ListDeductibleExpensesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	fy := req.Msg.FinancialYear
	if fy == "" {
		fy = currentAustralianFY()
	}

	start, end, err := parseFYDateRange(fy)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	userID := req.Msg.UserId
	if userID == "" {
		userID = claims.UID
	}

	expenses, nextToken, err := s.store.ListDeductibleExpenses(ctx, userID, req.Msg.GroupId, &start, &end, req.Msg.Category, req.Msg.PageSize, req.Msg.PageToken)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list deductible expenses: %w", err))
	}

	// Compute total deductible amount
	var totalCents int64
	for _, e := range expenses {
		pct := e.TaxDeductiblePercent
		if pct <= 0 {
			pct = 1.0
		}
		cents := e.AmountCents
		if cents == 0 {
			cents = int64(e.Amount * 100)
		}
		totalCents += int64(float64(cents) * pct)
	}

	return connect.NewResponse(&pfinancev1.ListDeductibleExpensesResponse{
		Expenses:             expenses,
		NextPageToken:        nextToken,
		TotalDeductibleCents: totalCents,
		TotalDeductible:      float64(totalCents) / 100.0,
	}), nil
}

// ExportTaxReturn exports the tax return data as CSV or JSON.
func (s *FinanceService) ExportTaxReturn(ctx context.Context, req *connect.Request[pfinancev1.ExportTaxReturnRequest]) (*connect.Response[pfinancev1.ExportTaxReturnResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	fy := req.Msg.FinancialYear
	if fy == "" {
		fy = currentAustralianFY()
	}

	calc, err := s.computeTaxForFY(ctx, claims.UID, fy, 0, 0, false, false)
	if err != nil {
		return nil, err
	}

	format := req.Msg.Format
	if format == pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_UNSPECIFIED {
		format = pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_CSV
	}

	var data []byte
	var contentType, filename string

	switch format {
	case pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_JSON:
		data, err = json.MarshalIndent(calc, "", "  ")
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("marshal JSON: %w", err))
		}
		contentType = "application/json"
		filename = fmt.Sprintf("tax-return-%s.json", fy)

	case pfinancev1.TaxExportFormat_TAX_EXPORT_FORMAT_CSV:
		var buf strings.Builder
		w := csv.NewWriter(&buf)
		_ = w.Write([]string{"Field", "Amount ($)", "Amount (cents)"})
		_ = w.Write([]string{"Financial Year", fy, ""})
		_ = w.Write([]string{"Gross Income", fmt.Sprintf("%.2f", calc.GrossIncome), fmt.Sprintf("%d", calc.GrossIncomeCents)})
		for _, d := range calc.Deductions {
			label := d.Category.String()
			_ = w.Write([]string{fmt.Sprintf("Deduction: %s", label), fmt.Sprintf("%.2f", d.TotalAmount), fmt.Sprintf("%d", d.TotalCents)})
		}
		_ = w.Write([]string{"Total Deductions", fmt.Sprintf("%.2f", calc.TotalDeductions), fmt.Sprintf("%d", calc.TotalDeductionsCents)})
		_ = w.Write([]string{"Taxable Income", fmt.Sprintf("%.2f", calc.TaxableIncome), fmt.Sprintf("%d", calc.TaxableIncomeCents)})
		_ = w.Write([]string{"Base Tax", fmt.Sprintf("%.2f", calc.BaseTax), fmt.Sprintf("%d", calc.BaseTaxCents)})
		_ = w.Write([]string{"Medicare Levy", fmt.Sprintf("%.2f", calc.MedicareLevy), fmt.Sprintf("%d", calc.MedicareLevyCents)})
		_ = w.Write([]string{"HELP Repayment", fmt.Sprintf("%.2f", calc.HelpRepayment), fmt.Sprintf("%d", calc.HelpRepaymentCents)})
		_ = w.Write([]string{"LITO (offset)", fmt.Sprintf("%.2f", calc.Lito), fmt.Sprintf("%d", calc.LitoCents)})
		_ = w.Write([]string{"Total Tax", fmt.Sprintf("%.2f", calc.TotalTax), fmt.Sprintf("%d", calc.TotalTaxCents)})
		_ = w.Write([]string{"Effective Rate", fmt.Sprintf("%.4f", calc.EffectiveRate), ""})
		_ = w.Write([]string{"Tax Withheld", fmt.Sprintf("%.2f", calc.TaxWithheld), fmt.Sprintf("%d", calc.TaxWithheldCents)})
		_ = w.Write([]string{"Refund/Owed", fmt.Sprintf("%.2f", calc.RefundOrOwed), fmt.Sprintf("%d", calc.RefundOrOwedCents)})
		w.Flush()
		data = []byte(buf.String())
		contentType = "text/csv"
		filename = fmt.Sprintf("tax-return-%s.csv", fy)
	}

	return connect.NewResponse(&pfinancev1.ExportTaxReturnResponse{
		Data:        data,
		Filename:    filename,
		ContentType: contentType,
		Calculation: calc,
	}), nil
}

// ============================================================================
// Tax Classification Handlers
// ============================================================================

// ClassifyTaxDeductibility classifies a single expense for tax deductibility using the ML pipeline.
func (s *FinanceService) ClassifyTaxDeductibility(ctx context.Context, req *connect.Request[pfinancev1.ClassifyTaxDeductibilityRequest]) (*connect.Response[pfinancev1.ClassifyTaxDeductibilityResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if taxPipeline == nil {
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("tax classification service is not available"))
	}

	if req.Msg.ExpenseId == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("expense_id is required"))
	}

	expense, err := s.store.GetExpense(ctx, req.Msg.ExpenseId)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, fmt.Errorf("expense not found: %w", err))
	}
	if expense.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("not your expense"))
	}

	// Fetch user's learned mappings
	userMappings, err := s.store.GetTaxDeductibilityMappings(ctx, claims.UID)
	if err != nil {
		log.Printf("[TaxClassify] Failed to fetch user mappings: %v", err)
		userMappings = nil
	}

	results := taxPipeline.ClassifyExpenses(ctx, []*pfinancev1.Expense{expense}, userMappings, req.Msg.Occupation, 0.85)
	if len(results) == 0 {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("classification returned no results"))
	}

	cls := results[0].Classification
	autoApplied := cls.Confidence >= 0.85
	needsReview := cls.Confidence >= 0.60 && cls.Confidence < 0.85

	// Auto-apply high-confidence results to the expense
	if autoApplied {
		expense.IsTaxDeductible = cls.IsDeductible
		expense.TaxDeductionCategory = cls.Category
		expense.TaxDeductionNote = cls.Reasoning
		if cls.DeductiblePct > 0 {
			expense.TaxDeductiblePercent = cls.DeductiblePct
		} else if cls.IsDeductible {
			expense.TaxDeductiblePercent = 1.0
		}
		expense.UpdatedAt = timestamppb.Now()
		if err := s.store.UpdateExpense(ctx, expense); err != nil {
			log.Printf("[TaxClassify] Failed to auto-apply classification: %v", err)
		}
	}

	return connect.NewResponse(&pfinancev1.ClassifyTaxDeductibilityResponse{
		Result: &pfinancev1.TaxClassificationResult{
			ExpenseId:         expense.Id,
			IsDeductible:      cls.IsDeductible,
			Category:          cls.Category,
			DeductiblePercent: cls.DeductiblePct,
			Confidence:        cls.Confidence,
			Reasoning:         cls.Reasoning,
			AutoApplied:       autoApplied,
			NeedsReview:       needsReview,
		},
	}), nil
}

// BatchClassifyTaxDeductibility classifies all expenses in a financial year for tax deductibility.
func (s *FinanceService) BatchClassifyTaxDeductibility(ctx context.Context, req *connect.Request[pfinancev1.BatchClassifyTaxDeductibilityRequest]) (*connect.Response[pfinancev1.BatchClassifyTaxDeductibilityResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if taxPipeline == nil {
		return nil, connect.NewError(connect.CodeUnavailable, fmt.Errorf("tax classification service is not available"))
	}

	fy := req.Msg.FinancialYear
	if fy == "" {
		fy = currentAustralianFY()
	}

	start, end, err := parseFYDateRange(fy)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}

	// Fetch user's learned mappings
	userMappings, err := s.store.GetTaxDeductibilityMappings(ctx, claims.UID)
	if err != nil {
		log.Printf("[TaxBatchClassify] Failed to fetch user mappings: %v", err)
		userMappings = nil
	}

	// Page through all expenses in the FY
	var allExpenses []*pfinancev1.Expense
	var pageToken string
	for {
		expenses, nextToken, err := s.store.ListExpenses(ctx, claims.UID, "", &start, &end, 500, pageToken)
		if err != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list expenses: %w", err))
		}
		allExpenses = append(allExpenses, expenses...)
		if nextToken == "" {
			break
		}
		pageToken = nextToken
	}

	if len(allExpenses) == 0 {
		return connect.NewResponse(&pfinancev1.BatchClassifyTaxDeductibilityResponse{
			TotalProcessed: 0,
		}), nil
	}

	// Run the classification pipeline
	classResults := taxPipeline.ClassifyExpenses(ctx, allExpenses, userMappings, req.Msg.Occupation, 0.85)

	var (
		totalProcessed int32
		autoApplied    int32
		needsReview    int32
		skipped        int32
		results        []*pfinancev1.TaxClassificationResult
	)

	for _, cr := range classResults {
		totalProcessed++
		cls := cr.Classification

		isAutoApply := cls.Confidence >= 0.85
		isNeedsReview := cls.Confidence >= 0.60 && cls.Confidence < 0.85
		isSkipped := cls.Confidence < 0.40

		// Skip expenses already classified by user (source == "user")
		if cls.Source == "user" {
			skipped++
			continue
		}

		if isAutoApply && req.Msg.AutoApply {
			// Apply classification to expense
			cr.Expense.IsTaxDeductible = cls.IsDeductible
			cr.Expense.TaxDeductionCategory = cls.Category
			cr.Expense.TaxDeductionNote = cls.Reasoning
			if cls.DeductiblePct > 0 {
				cr.Expense.TaxDeductiblePercent = cls.DeductiblePct
			} else if cls.IsDeductible {
				cr.Expense.TaxDeductiblePercent = 1.0
			}
			cr.Expense.UpdatedAt = timestamppb.Now()
			if err := s.store.UpdateExpense(ctx, cr.Expense); err != nil {
				log.Printf("[TaxBatchClassify] Failed to update expense %s: %v", cr.Expense.Id, err)
			} else {
				autoApplied++
			}
		} else if isNeedsReview {
			needsReview++
		} else if isSkipped {
			skipped++
		}

		results = append(results, &pfinancev1.TaxClassificationResult{
			ExpenseId:         cr.Expense.Id,
			IsDeductible:      cls.IsDeductible,
			Category:          cls.Category,
			DeductiblePercent: cls.DeductiblePct,
			Confidence:        cls.Confidence,
			Reasoning:         cls.Reasoning,
			AutoApplied:       isAutoApply && req.Msg.AutoApply,
			NeedsReview:       isNeedsReview,
		})
	}

	return connect.NewResponse(&pfinancev1.BatchClassifyTaxDeductibilityResponse{
		TotalProcessed: totalProcessed,
		AutoApplied:    autoApplied,
		NeedsReview:    needsReview,
		Skipped:        skipped,
		Results:        results,
	}), nil
}

// ============================================================================
// Helper Functions
// ============================================================================

// currentAustralianFY returns the current Australian financial year string.
// If the current month is July or later, FY starts this year, otherwise last year.
func currentAustralianFY() string {
	now := time.Now()
	startYear := now.Year()
	if now.Month() < time.July {
		startYear--
	}
	endYear := (startYear + 1) % 100
	return fmt.Sprintf("%d-%02d", startYear, endYear)
}
