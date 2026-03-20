package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// SubmitCorrections stores correction records and updates merchant mappings.
func (s *FinanceService) SubmitCorrections(ctx context.Context, req *connect.Request[pfinancev1.SubmitCorrectionsRequest]) (*connect.Response[pfinancev1.SubmitCorrectionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("cannot submit corrections for another user"))
	}

	processedCount := int32(0)
	merchantMappingsUpdated := int32(0)

	for _, correction := range req.Msg.Corrections {
		correction.UserId = claims.UID
		if correction.Id == "" {
			correction.Id = uuid.New().String()
		}
		if correction.CreatedAt == nil {
			correction.CreatedAt = timestamppb.Now()
		}

		if err := s.store.CreateCorrectionRecord(ctx, correction); err != nil {
			log.Printf("Failed to store correction record %s: %v", correction.Id, err)
			continue
		}
		processedCount++

		// If merchant was corrected, upsert a MerchantMapping
		if correction.OriginalMerchant != "" && correction.CorrectedMerchant != "" &&
			correction.OriginalMerchant != correction.CorrectedMerchant {
			updated, err := s.upsertMerchantFromCorrection(ctx, claims.UID, correction)
			if err == nil && updated {
				merchantMappingsUpdated++
			}
		}

		// Also upsert if category was corrected (even without merchant change)
		if correction.OriginalCategory != correction.CorrectedCategory &&
			correction.CorrectedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
			merchant := correction.CorrectedMerchant
			if merchant == "" {
				merchant = correction.OriginalMerchant
			}
			if merchant != "" {
				updated, err := s.upsertCategoryMapping(ctx, claims.UID, merchant, correction.CorrectedCategory)
				if err == nil && updated {
					merchantMappingsUpdated++
				}
			}
		}

		// Upsert category override when category was corrected
		if correction.CorrectedCategory != correction.OriginalCategory &&
			correction.CorrectedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
			merchant := correction.CorrectedMerchant
			if merchant == "" {
				merchant = correction.OriginalMerchant
			}
			if merchant != "" {
				s.upsertCategoryOverride(ctx, claims.UID, merchant, correction.CorrectedCategory)
			}
		}

		// Feed category corrections into TaxDeductibilityMapping when the corrected
		// category implies deductibility (education, transportation, etc.)
		if correction.CorrectedCategory != correction.OriginalCategory {
			merchant := correction.CorrectedMerchant
			if merchant == "" {
				merchant = correction.OriginalMerchant
			}
			if merchant != "" {
				s.learnTaxFromCategoryCorrection(ctx, claims.UID, merchant, correction.CorrectedCategory)
			}
		}
	}

	return connect.NewResponse(&pfinancev1.SubmitCorrectionsResponse{
		ProcessedCount:          processedCount,
		MerchantMappingsUpdated: merchantMappingsUpdated,
	}), nil
}

// upsertMerchantFromCorrection creates or updates a merchant mapping from a correction.
func (s *FinanceService) upsertMerchantFromCorrection(ctx context.Context, userID string, correction *pfinancev1.CorrectionRecord) (bool, error) {
	mappings, err := s.store.GetMerchantMappings(ctx, userID)
	if err != nil {
		return false, err
	}

	rawPattern := strings.ToLower(strings.TrimSpace(correction.OriginalMerchant))

	// Find existing mapping
	for _, m := range mappings {
		if strings.EqualFold(m.RawPattern, rawPattern) {
			m.NormalizedName = correction.CorrectedMerchant
			if correction.CorrectedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
				m.Category = correction.CorrectedCategory
			}
			m.CorrectionCount++
			m.Confidence = merchantConfidence(m.CorrectionCount)
			m.LastUsed = timestamppb.Now()
			return true, s.store.UpsertMerchantMapping(ctx, m)
		}
	}

	// Create new mapping
	mapping := &pfinancev1.MerchantMapping{
		Id:              uuid.New().String(),
		UserId:          userID,
		RawPattern:      rawPattern,
		NormalizedName:  correction.CorrectedMerchant,
		Category:        correction.CorrectedCategory,
		CorrectionCount: 1,
		Confidence:      merchantConfidence(1),
		LastUsed:        timestamppb.Now(),
		CreatedAt:       timestamppb.Now(),
	}
	return true, s.store.UpsertMerchantMapping(ctx, mapping)
}

// upsertCategoryMapping updates category for an existing merchant mapping or creates a new one.
func (s *FinanceService) upsertCategoryMapping(ctx context.Context, userID, merchant string, category pfinancev1.ExpenseCategory) (bool, error) {
	mappings, err := s.store.GetMerchantMappings(ctx, userID)
	if err != nil {
		return false, err
	}

	rawPattern := strings.ToLower(strings.TrimSpace(merchant))

	for _, m := range mappings {
		if strings.EqualFold(m.RawPattern, rawPattern) {
			m.Category = category
			m.CorrectionCount++
			m.Confidence = merchantConfidence(m.CorrectionCount)
			m.LastUsed = timestamppb.Now()
			return true, s.store.UpsertMerchantMapping(ctx, m)
		}
	}

	mapping := &pfinancev1.MerchantMapping{
		Id:              uuid.New().String(),
		UserId:          userID,
		RawPattern:      rawPattern,
		NormalizedName:  merchant,
		Category:        category,
		CorrectionCount: 1,
		Confidence:      merchantConfidence(1),
		LastUsed:        timestamppb.Now(),
		CreatedAt:       timestamppb.Now(),
	}
	return true, s.store.UpsertMerchantMapping(ctx, mapping)
}

// merchantConfidence returns confidence derived from correction count.
func merchantConfidence(count int32) float64 {
	return math.Min(0.99, 0.7+0.05*float64(count))
}

// CheckDuplicates checks for duplicate transactions among existing expenses.
func (s *FinanceService) CheckDuplicates(ctx context.Context, req *connect.Request[pfinancev1.CheckDuplicatesRequest]) (*connect.Response[pfinancev1.CheckDuplicatesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	if req.Msg.UserId != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("cannot check duplicates for another user"))
	}

	duplicates := make(map[string]*pfinancev1.DuplicateCandidateList)

	for _, tx := range req.Msg.Transactions {
		candidates := s.findDuplicatesForTransaction(ctx, claims.UID, req.Msg.GroupId, tx)
		if len(candidates) > 0 {
			txID := tx.Id
			if txID == "" {
				txID = tx.Description
			}
			duplicates[txID] = &pfinancev1.DuplicateCandidateList{
				Candidates: candidates,
			}
		}
	}

	return connect.NewResponse(&pfinancev1.CheckDuplicatesResponse{
		Duplicates: duplicates,
	}), nil
}

// findDuplicatesForTransaction finds existing expenses that match a transaction.
func (s *FinanceService) findDuplicatesForTransaction(ctx context.Context, userID, groupID string, tx *pfinancev1.ExtractedTransaction) []*pfinancev1.DuplicateCandidate {
	// Parse the transaction date for date range query
	var startDate, endDate *time.Time
	if tx.Date != "" {
		if t, err := time.Parse("2006-01-02", tx.Date); err == nil {
			sd := t.AddDate(0, 0, -2)
			ed := t.AddDate(0, 0, 2)
			startDate = &sd
			endDate = &ed
		}
	}

	expenses, _, err := s.store.ListExpenses(ctx, userID, groupID, startDate, endDate, 100, "")
	if err != nil {
		return nil
	}

	var candidates []*pfinancev1.DuplicateCandidate
	for _, exp := range expenses {
		score, reason := scoreDuplicate(tx, exp)
		if score >= 0.6 {
			dateStr := ""
			if exp.Date != nil {
				dateStr = exp.Date.AsTime().Format("2006-01-02")
			}
			candidates = append(candidates, &pfinancev1.DuplicateCandidate{
				ExistingExpenseId: exp.Id,
				Description:       exp.Description,
				Amount:            exp.Amount,
				AmountCents:       exp.AmountCents,
				Date:              dateStr,
				Category:          exp.Category,
				MatchScore:        score,
				MatchReason:       reason,
			})
		}
	}
	return candidates
}

// scoreDuplicate scores how similar a transaction is to an existing expense.
func scoreDuplicate(tx *pfinancev1.ExtractedTransaction, exp *pfinancev1.Expense) (float64, string) {
	score := 0.0
	var reasons []string

	// Amount match
	if tx.Amount > 0 && exp.Amount > 0 {
		diff := math.Abs(tx.Amount - exp.Amount)
		if diff < 0.01 {
			score += 0.5
			reasons = append(reasons, "Exact amount match")
		} else if diff/tx.Amount < 0.05 {
			score += 0.3
			reasons = append(reasons, "Similar amount")
		}
	}

	// Date match
	if tx.Date != "" && exp.Date != nil {
		txDate, err := time.Parse("2006-01-02", tx.Date)
		if err == nil {
			expDate := exp.Date.AsTime()
			dayDiff := math.Abs(txDate.Sub(expDate).Hours() / 24)
			if dayDiff < 1 {
				score += 0.3
				reasons = append(reasons, "Same date")
			} else if dayDiff <= 2 {
				score += 0.2
				reasons = append(reasons, "Adjacent date")
			}
		}
	}

	// Description similarity
	txDesc := strings.ToLower(strings.TrimSpace(tx.NormalizedMerchant))
	if txDesc == "" {
		txDesc = strings.ToLower(strings.TrimSpace(tx.Description))
	}
	expDesc := strings.ToLower(strings.TrimSpace(exp.Description))
	if txDesc != "" && expDesc != "" {
		ratio := levenshteinRatio(txDesc, expDesc)
		if ratio > 0.7 {
			score += 0.2
			reasons = append(reasons, "Similar description")
		}
	}

	reason := strings.Join(reasons, " + ")
	return score, reason
}

// levenshteinRatio returns a 0-1 similarity ratio between two strings.
func levenshteinRatio(a, b string) float64 {
	d := levenshteinDistance(a, b)
	maxLen := len(a)
	if len(b) > maxLen {
		maxLen = len(b)
	}
	if maxLen == 0 {
		return 1.0
	}
	return 1.0 - float64(d)/float64(maxLen)
}

// levenshteinDistance computes the edit distance between two strings.
func levenshteinDistance(a, b string) int {
	la, lb := len(a), len(b)
	if la == 0 {
		return lb
	}
	if lb == 0 {
		return la
	}

	prev := make([]int, lb+1)
	curr := make([]int, lb+1)
	for j := 0; j <= lb; j++ {
		prev[j] = j
	}
	for i := 1; i <= la; i++ {
		curr[0] = i
		for j := 1; j <= lb; j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			curr[j] = min(curr[j-1]+1, min(prev[j]+1, prev[j-1]+cost))
		}
		prev, curr = curr, prev
	}
	return prev[lb]
}

// GetMerchantSuggestions returns merchant name and category suggestions.
func (s *FinanceService) GetMerchantSuggestions(ctx context.Context, req *connect.Request[pfinancev1.GetMerchantSuggestionsRequest]) (*connect.Response[pfinancev1.GetMerchantSuggestionsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	merchantText := strings.TrimSpace(req.Msg.MerchantText)
	if merchantText == "" {
		return connect.NewResponse(&pfinancev1.GetMerchantSuggestionsResponse{}), nil
	}

	// 1. Check user's learned merchant mappings first
	mappings, err := s.store.GetMerchantMappings(ctx, claims.UID)
	if err == nil {
		lower := strings.ToLower(merchantText)
		for _, m := range mappings {
			if strings.Contains(lower, strings.ToLower(m.RawPattern)) ||
				strings.Contains(strings.ToLower(m.RawPattern), lower) {
				return connect.NewResponse(&pfinancev1.GetMerchantSuggestionsResponse{
					SuggestedName:     m.NormalizedName,
					SuggestedCategory: m.Category,
					Confidence:        m.Confidence,
					Source:            "user_history",
				}), nil
			}
		}
	}

	// 1b. Check per-user category overrides (requires 2+ corrections)
	overrides, err := s.store.GetCategoryOverrides(ctx, claims.UID)
	if err == nil {
		lower := strings.ToLower(merchantText)
		for _, o := range overrides {
			if o.CorrectionCount >= 2 &&
				(strings.Contains(lower, o.MerchantNormalized) ||
					strings.Contains(o.MerchantNormalized, lower)) {
				return connect.NewResponse(&pfinancev1.GetMerchantSuggestionsResponse{
					SuggestedName:     extraction.NormalizeMerchant(merchantText).Name,
					SuggestedCategory: o.UserCategory,
					Confidence:        math.Min(0.99, 0.8+0.05*float64(o.CorrectionCount)),
					Source:            "user_override",
				}), nil
			}
		}
	}

	// 2. Check static normalizer
	info := extraction.NormalizeMerchant(merchantText)
	if info.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER {
		source := "static"
		if info.Confidence < 0.8 {
			source = "keyword"
		}
		return connect.NewResponse(&pfinancev1.GetMerchantSuggestionsResponse{
			SuggestedName:     info.Name,
			SuggestedCategory: info.Category,
			Confidence:        info.Confidence,
			Source:            source,
		}), nil
	}

	// 3. Return the cleaned name with low confidence
	return connect.NewResponse(&pfinancev1.GetMerchantSuggestionsResponse{
		SuggestedName:     info.Name,
		SuggestedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
		Confidence:        0.3,
		Source:            "keyword",
	}), nil
}

// GetExtractionMetrics returns extraction quality metrics.
func (s *FinanceService) GetExtractionMetrics(ctx context.Context, req *connect.Request[pfinancev1.GetExtractionMetricsRequest]) (*connect.Response[pfinancev1.GetExtractionMetricsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	userID := req.Msg.UserId
	if userID == "" {
		userID = claims.UID
	}
	if userID != claims.UID {
		return nil, connect.NewError(connect.CodePermissionDenied, fmt.Errorf("cannot get metrics for another user"))
	}

	days := int(req.Msg.Days)
	if days <= 0 {
		days = 30
	}
	since := time.Now().AddDate(0, 0, -days)

	// Get extraction events
	events, err := s.store.ListExtractionEvents(ctx, claims.UID, since)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list extraction events: %w", err))
	}

	// Get correction records
	corrections, err := s.store.ListCorrectionRecords(ctx, claims.UID, 0)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to list correction records: %w", err))
	}

	// Filter corrections to the lookback period
	var filteredCorrections []*pfinancev1.CorrectionRecord
	for _, c := range corrections {
		if c.CreatedAt != nil && c.CreatedAt.AsTime().After(since) {
			filteredCorrections = append(filteredCorrections, c)
		}
	}

	// Aggregate metrics
	totalTransactions := int32(0)
	totalConfidence := 0.0
	for _, e := range events {
		totalTransactions += e.TransactionCount
		totalConfidence += e.OverallConfidence * float64(e.TransactionCount)
	}

	avgConfidence := 0.0
	if totalTransactions > 0 {
		avgConfidence = totalConfidence / float64(totalTransactions)
	}

	correctionRate := 0.0
	totalCorrections := int32(len(filteredCorrections))
	if totalTransactions > 0 {
		correctionRate = float64(totalCorrections) / float64(totalTransactions)
	}

	// Count corrections by field
	correctionsByField := make(map[string]int32)
	correctionsByCategory := make(map[string]int32)
	for _, c := range filteredCorrections {
		for _, fc := range c.Corrections {
			fieldName := fc.Field.String()
			correctionsByField[fieldName]++
		}
		if c.OriginalCategory != c.CorrectedCategory {
			catName := c.CorrectedCategory.String()
			correctionsByCategory[catName]++
		}
	}

	return connect.NewResponse(&pfinancev1.GetExtractionMetricsResponse{
		TotalExtractions:      int32(len(events)),
		TotalTransactions:     totalTransactions,
		TotalCorrections:      totalCorrections,
		CorrectionRate:        correctionRate,
		AverageConfidence:     avgConfidence,
		CorrectionsByField:    correctionsByField,
		CorrectionsByCategory: correctionsByCategory,
		RecentEvents:          events,
	}), nil
}

// categoryToTaxDeduction maps expense categories that imply tax deductibility
// to their most likely ATO deduction category.
var categoryToTaxDeduction = map[pfinancev1.ExpenseCategory]pfinancev1.TaxDeductionCategory{
	pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION:      pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_SELF_EDUCATION,
	pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION: pfinancev1.TaxDeductionCategory_TAX_DEDUCTION_CATEGORY_WORK_TRAVEL,
}

// learnTaxFromCategoryCorrection creates or updates a TaxDeductibilityMapping when
// a user correction changes the category to one that implies tax deductibility.
func (s *FinanceService) learnTaxFromCategoryCorrection(ctx context.Context, userID, merchant string, correctedCategory pfinancev1.ExpenseCategory) {
	taxCat, ok := categoryToTaxDeduction[correctedCategory]
	if !ok {
		return
	}

	merchantPattern := extractMerchantPattern(strings.ToLower(strings.TrimSpace(merchant)))
	if merchantPattern == "" {
		return
	}

	mappings, err := s.store.GetTaxDeductibilityMappings(ctx, userID)
	if err != nil {
		log.Printf("[TaxFeedback] Failed to get tax mappings: %v", err)
		return
	}

	for _, m := range mappings {
		if strings.EqualFold(m.MerchantPattern, merchantPattern) {
			// Only update if the category correction aligns with existing mapping
			// or strengthens it with more confirmations
			m.DeductionCategory = taxCat
			m.ConfirmationCount++
			m.Confidence = taxMappingConfidence(m.ConfirmationCount)
			m.LastUsed = timestamppb.Now()
			if err := s.store.UpsertTaxDeductibilityMapping(ctx, m); err != nil {
				log.Printf("[TaxFeedback] Failed to update tax mapping: %v", err)
			}
			return
		}
	}

	// Create new mapping with low initial confidence (category inference is weaker
	// than explicit tax status changes)
	mapping := &pfinancev1.TaxDeductibilityMapping{
		UserId:            userID,
		MerchantPattern:   merchantPattern,
		DeductionCategory: taxCat,
		DeductiblePercent: 0.5, // Conservative default for inferred deductions
		ConfirmationCount: 1,
		Confidence:        0.60, // Below Tier 1 threshold (0.70) until confirmed
		LastUsed:          timestamppb.Now(),
		CreatedAt:         timestamppb.Now(),
	}
	if err := s.store.UpsertTaxDeductibilityMapping(ctx, mapping); err != nil {
		log.Printf("[TaxFeedback] Failed to create tax mapping from category correction: %v", err)
	}
}

// AggregateCorrectionPatterns analyzes correction records to produce supplementary
// tax deductibility signals. It groups corrections by merchant and identifies
// consistent patterns that strengthen classification confidence.
func AggregateCorrectionPatterns(corrections []*pfinancev1.CorrectionRecord) []extraction.CorrectionSignal {
	type merchantStats struct {
		merchant            string
		categoryCorrections map[pfinancev1.ExpenseCategory]int32
		totalCorrections    int32
	}

	byMerchant := make(map[string]*merchantStats)

	for _, c := range corrections {
		merchant := c.CorrectedMerchant
		if merchant == "" {
			merchant = c.OriginalMerchant
		}
		if merchant == "" {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(merchant))

		stats, ok := byMerchant[key]
		if !ok {
			stats = &merchantStats{
				merchant:            merchant,
				categoryCorrections: make(map[pfinancev1.ExpenseCategory]int32),
			}
			byMerchant[key] = stats
		}
		stats.totalCorrections++

		if c.CorrectedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
			stats.categoryCorrections[c.CorrectedCategory]++
		}
	}

	var signals []extraction.CorrectionSignal
	for _, stats := range byMerchant {
		if stats.totalCorrections < 2 {
			continue // Need at least 2 corrections for a pattern
		}

		// Find the most common corrected category
		var topCat pfinancev1.ExpenseCategory
		var topCount int32
		for cat, count := range stats.categoryCorrections {
			if count > topCount {
				topCat = cat
				topCount = count
			}
		}

		consistency := float64(topCount) / float64(stats.totalCorrections)
		if consistency < 0.5 {
			continue // Not consistent enough
		}

		signals = append(signals, extraction.CorrectionSignal{
			MerchantPattern:   stats.merchant,
			CorrectedCategory: topCat,
			CorrectionCount:   stats.totalCorrections,
			Consistency:       consistency,
		})
	}

	return signals
}

// upsertCategoryOverride creates or updates a per-user category override from a correction.
func (s *FinanceService) upsertCategoryOverride(ctx context.Context, userID, merchant string, category pfinancev1.ExpenseCategory) {
	normalized := strings.ToLower(strings.TrimSpace(merchant))
	if normalized == "" {
		return
	}

	overrides, err := s.store.GetCategoryOverrides(ctx, userID)
	if err != nil {
		log.Printf("Failed to get category overrides for user %s: %v", userID, err)
		return
	}

	for _, o := range overrides {
		if o.MerchantNormalized == normalized {
			o.UserCategory = category
			o.CorrectionCount++
			o.LastCorrected = timestamppb.Now()
			if err := s.store.UpsertCategoryOverride(ctx, o); err != nil {
				log.Printf("Failed to update category override: %v", err)
			}
			return
		}
	}

	override := &pfinancev1.CategoryOverride{
		Id:                 uuid.New().String(),
		UserId:             userID,
		MerchantNormalized: normalized,
		UserCategory:       category,
		CorrectionCount:    1,
		LastCorrected:      timestamppb.Now(),
		CreatedAt:          timestamppb.Now(),
	}
	if err := s.store.UpsertCategoryOverride(ctx, override); err != nil {
		log.Printf("Failed to create category override: %v", err)
	}
}

// GetCategoryOverrides returns all category overrides for the authenticated user.
func (s *FinanceService) GetCategoryOverrides(ctx context.Context, req *connect.Request[pfinancev1.GetCategoryOverridesRequest]) (*connect.Response[pfinancev1.GetCategoryOverridesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	overrides, err := s.store.GetCategoryOverrides(ctx, claims.UID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to get category overrides: %w", err))
	}

	return connect.NewResponse(&pfinancev1.GetCategoryOverridesResponse{
		Overrides: overrides,
	}), nil
}

// SetCategoryOverride manually sets a category override for a merchant.
func (s *FinanceService) SetCategoryOverride(ctx context.Context, req *connect.Request[pfinancev1.SetCategoryOverrideRequest]) (*connect.Response[pfinancev1.SetCategoryOverrideResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	normalized := strings.ToLower(strings.TrimSpace(req.Msg.MerchantNormalized))
	if normalized == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("merchant_normalized is required"))
	}
	if req.Msg.Category == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("category is required"))
	}

	// Check if override already exists
	overrides, err := s.store.GetCategoryOverrides(ctx, claims.UID)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to get category overrides: %w", err))
	}

	var override *pfinancev1.CategoryOverride
	for _, o := range overrides {
		if o.MerchantNormalized == normalized {
			o.UserCategory = req.Msg.Category
			o.CorrectionCount++
			o.LastCorrected = timestamppb.Now()
			override = o
			break
		}
	}
	if override == nil {
		override = &pfinancev1.CategoryOverride{
			Id:                 uuid.New().String(),
			UserId:             claims.UID,
			MerchantNormalized: normalized,
			UserCategory:       req.Msg.Category,
			CorrectionCount:    1,
			LastCorrected:      timestamppb.Now(),
			CreatedAt:          timestamppb.Now(),
		}
	}

	if err := s.store.UpsertCategoryOverride(ctx, override); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to set category override: %w", err))
	}

	return connect.NewResponse(&pfinancev1.SetCategoryOverrideResponse{
		Override: override,
	}), nil
}

// DeleteCategoryOverride removes a category override for a merchant.
func (s *FinanceService) DeleteCategoryOverride(ctx context.Context, req *connect.Request[pfinancev1.DeleteCategoryOverrideRequest]) (*connect.Response[pfinancev1.DeleteCategoryOverrideResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}

	normalized := strings.ToLower(strings.TrimSpace(req.Msg.MerchantNormalized))
	if normalized == "" {
		return nil, connect.NewError(connect.CodeInvalidArgument, fmt.Errorf("merchant_normalized is required"))
	}

	if err := s.store.DeleteCategoryOverride(ctx, claims.UID, normalized); err != nil {
		return nil, connect.NewError(connect.CodeInternal, fmt.Errorf("failed to delete category override: %w", err))
	}

	return connect.NewResponse(&pfinancev1.DeleteCategoryOverrideResponse{}), nil
}
