package service

import (
	"context"
	"fmt"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

// FindPotentialDeductions scans unclassified expenses and returns suggestions
// with confidence scores and potential tax savings. Does NOT auto-apply.
func (s *FinanceService) FindPotentialDeductions(ctx context.Context, req *connect.Request[pfinancev1.FindPotentialDeductionsRequest]) (*connect.Response[pfinancev1.FindPotentialDeductionsResponse], error) {
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

	// Fetch all expenses in the FY
	var allExpenses []*pfinancev1.Expense
	var pageToken string
	for {
		expenses, nextToken, listErr := s.store.ListExpenses(ctx, claims.UID, "", &start, &end, 500, pageToken)
		if listErr != nil {
			return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("list expenses: %w", listErr))
		}
		allExpenses = append(allExpenses, expenses...)
		if nextToken == "" {
			break
		}
		pageToken = nextToken
	}

	// Filter to unclassified expenses only
	var unclassified []*pfinancev1.Expense
	for _, e := range allExpenses {
		if !e.IsTaxDeductible && e.TaxDeductionCategory == pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_UNSPECIFIED {
			unclassified = append(unclassified, e)
		}
	}

	if len(unclassified) == 0 {
		return connect.NewResponse(&pfinancev1.FindPotentialDeductionsResponse{
			ScannedCount: int32(len(allExpenses)),
		}), nil
	}

	// Get user's tax config for marginal rate calculation
	taxCfg, _ := s.store.GetTaxConfig(ctx, claims.UID, "")
	marginalRate := 0.325 // Default to 32.5c/$1 (ATO 2024-25 bracket)
	if taxCfg != nil && taxCfg.TaxRate > 0 {
		marginalRate = taxCfg.TaxRate / 100.0
	}

	// Run classification pipeline with lower threshold (0.40 vs 0.85)
	if s.taxPipeline == nil {
		return connect.NewResponse(&pfinancev1.FindPotentialDeductionsResponse{
			ScannedCount: int32(len(allExpenses)),
		}), nil
	}

	userMappings, _ := s.store.GetTaxDeductibilityMappings(ctx, claims.UID)

	results := s.taxPipeline.ClassifyExpenses(ctx, unclassified, userMappings, req.Msg.Occupation, 0.40)

	var suggestions []*pfinancev1.PotentialDeduction
	var totalSavingsCents int64

	for _, r := range results {
		if !r.Classification.IsDeductible || r.Classification.Confidence < 0.40 {
			continue
		}

		amt := effectiveDollars(r.Expense.AmountCents, r.Expense.Amount)
		amtCents := r.Expense.AmountCents
		if amtCents == 0 {
			amtCents = int64(amt * 100)
		}

		deductibleAmt := float64(amtCents) * r.Classification.DeductiblePct
		savingsCents := int64(deductibleAmt * marginalRate)
		totalSavingsCents += savingsCents

		suggestions = append(suggestions, &pfinancev1.PotentialDeduction{
			ExpenseId:                  r.Expense.Id,
			Description:                r.Expense.Description,
			Amount:                     amt,
			AmountCents:                amtCents,
			Date:                       r.Expense.Date,
			Category:                   r.Expense.Category,
			SuggestedDeductionCategory: r.Classification.Category,
			Confidence:                 r.Classification.Confidence,
			Reasoning:                  r.Classification.Reasoning,
			DeductiblePercent:          r.Classification.DeductiblePct,
			PotentialSavingsCents:      savingsCents,
			PotentialSavings:           float64(savingsCents) / 100.0,
		})
	}

	return connect.NewResponse(&pfinancev1.FindPotentialDeductionsResponse{
		Suggestions:                suggestions,
		TotalPotentialSavingsCents: totalSavingsCents,
		TotalPotentialSavings:      float64(totalSavingsCents) / 100.0,
		ScannedCount:               int32(len(allExpenses)),
	}), nil
}

// CompareTaxYears computes tax for two financial years and returns per-category deltas.
func (s *FinanceService) CompareTaxYears(ctx context.Context, req *connect.Request[pfinancev1.CompareTaxYearsRequest]) (*connect.Response[pfinancev1.CompareTaxYearsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	if req.Msg.YearA == "" || req.Msg.YearB == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("both year_a and year_b are required"))
	}

	calcA, err := s.computeTaxForFY(ctx, claims.UID, req.Msg.YearA, 0, 0, false, false)
	if err != nil {
		return nil, fmt.Errorf("compute tax for %s: %w", req.Msg.YearA, err)
	}
	calcB, err := s.computeTaxForFY(ctx, claims.UID, req.Msg.YearB, 0, 0, false, false)
	if err != nil {
		return nil, fmt.Errorf("compute tax for %s: %w", req.Msg.YearB, err)
	}

	// Build per-category deltas
	catMapA := make(map[pfinancev1.TaxDeductionCategory]int64)
	for _, d := range calcA.Deductions {
		catMapA[d.Category] = d.TotalCents
	}
	catMapB := make(map[pfinancev1.TaxDeductionCategory]int64)
	for _, d := range calcB.Deductions {
		catMapB[d.Category] = d.TotalCents
	}

	// Union of all categories
	allCats := make(map[pfinancev1.TaxDeductionCategory]bool)
	for c := range catMapA {
		allCats[c] = true
	}
	for c := range catMapB {
		allCats[c] = true
	}

	var deltas []*pfinancev1.CategoryDelta
	for cat := range allCats {
		aCents := catMapA[cat]
		bCents := catMapB[cat]
		changeCents := bCents - aCents
		var changePct float64
		if aCents > 0 {
			changePct = float64(changeCents) / float64(aCents) * 100
		}
		deltas = append(deltas, &pfinancev1.CategoryDelta{
			Category:      cat,
			YearACents:    aCents,
			YearBCents:    bCents,
			ChangeCents:   changeCents,
			ChangePercent: changePct,
		})
	}

	return connect.NewResponse(&pfinancev1.CompareTaxYearsResponse{
		Comparison: &pfinancev1.TaxYearComparison{
			YearA:                req.Msg.YearA,
			YearB:                req.Msg.YearB,
			CalculationA:         calcA,
			CalculationB:         calcB,
			CategoryDeltas:       deltas,
			IncomeChangeCents:    calcB.GrossIncomeCents - calcA.GrossIncomeCents,
			DeductionChangeCents: calcB.TotalDeductionsCents - calcA.TotalDeductionsCents,
			TaxChangeCents:       calcB.TotalTaxCents - calcA.TotalTaxCents,
		},
	}), nil
}
