package service

import (
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"go.uber.org/mock/gomock"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestSubmitCorrections(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("stores corrections and upserts merchant mapping", func(t *testing.T) {
		mockStore.EXPECT().
			CreateCorrectionRecord(gomock.Any(), gomock.Any()).
			Return(nil)

		// Merchant corrected → triggers merchant upsert (GetMerchantMappings + UpsertMerchantMapping)
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertMerchantMapping(gomock.Any(), gomock.Any()).
			Return(nil)

		// Category also corrected → triggers category upsert (second GetMerchantMappings + UpsertMerchantMapping)
		// The merchant upsert already created the mapping, but the code queries again
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return([]*pfinancev1.MerchantMapping{
				{
					Id:              "new-id",
					UserId:          "user-1",
					RawPattern:      "woolwrths 1234",
					NormalizedName:  "Woolworths",
					Category:        pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					CorrectionCount: 1,
					Confidence:      0.75,
				},
			}, nil)
		mockStore.EXPECT().
			UpsertMerchantMapping(gomock.Any(), gomock.Any()).
			Return(nil)

		// Category override upsert (category changed OTHER → FOOD)
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertCategoryOverride(gomock.Any(), gomock.Any()).
			Return(nil)

		resp, err := svc.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: "user-1",
			Corrections: []*pfinancev1.CorrectionRecord{
				{
					OriginalMerchant:  "WOOLWRTHS 1234",
					CorrectedMerchant: "Woolworths",
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.ProcessedCount != 1 {
			t.Errorf("expected processed_count=1, got %d", resp.Msg.ProcessedCount)
		}
		if resp.Msg.MerchantMappingsUpdated != 2 {
			t.Errorf("expected merchant_mappings_updated=2, got %d", resp.Msg.MerchantMappingsUpdated)
		}
	})

	t.Run("updates existing merchant mapping and increments count", func(t *testing.T) {
		mockStore.EXPECT().
			CreateCorrectionRecord(gomock.Any(), gomock.Any()).
			Return(nil)

		existing := &pfinancev1.MerchantMapping{
			Id:              "m-1",
			UserId:          "user-1",
			RawPattern:      "coles express",
			NormalizedName:  "Coles Express",
			Category:        pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			CorrectionCount: 2,
			Confidence:      0.8,
		}
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return([]*pfinancev1.MerchantMapping{existing}, nil)
		mockStore.EXPECT().
			UpsertMerchantMapping(gomock.Any(), gomock.Any()).
			DoAndReturn(func(_ interface{}, m *pfinancev1.MerchantMapping) error {
				if m.CorrectionCount != 3 {
					t.Errorf("expected correction_count=3, got %d", m.CorrectionCount)
				}
				if m.NormalizedName != "Coles" {
					t.Errorf("expected normalized_name=Coles, got %s", m.NormalizedName)
				}
				return nil
			})

		_, err := svc.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: "user-1",
			Corrections: []*pfinancev1.CorrectionRecord{
				{
					OriginalMerchant:  "Coles Express",
					CorrectedMerchant: "Coles",
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("rejects request for different user", func(t *testing.T) {
		_, err := svc.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: "other-user",
		}))
		if err == nil {
			t.Fatal("expected permission denied error")
		}
		if connect.CodeOf(err) != connect.CodePermissionDenied {
			t.Errorf("expected CodePermissionDenied, got %v", connect.CodeOf(err))
		}
	})

	t.Run("category-only correction upserts mapping", func(t *testing.T) {
		mockStore.EXPECT().
			CreateCorrectionRecord(gomock.Any(), gomock.Any()).
			Return(nil)

		// No merchant change, so no merchant upsert
		// But category changed, so category mapping upsert happens
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertMerchantMapping(gomock.Any(), gomock.Any()).
			Return(nil)

		// Category override upsert (category changed OTHER → TRANSPORTATION)
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertCategoryOverride(gomock.Any(), gomock.Any()).
			Return(nil)

		// Transportation maps to Work Travel, so tax feedback loop fires
		mockStore.EXPECT().
			GetTaxDeductibilityMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertTaxDeductibilityMapping(gomock.Any(), gomock.Any()).
			Return(nil)

		resp, err := svc.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: "user-1",
			Corrections: []*pfinancev1.CorrectionRecord{
				{
					OriginalMerchant:  "Uber",
					CorrectedMerchant: "Uber",
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.MerchantMappingsUpdated != 1 {
			t.Errorf("expected 1 mapping updated, got %d", resp.Msg.MerchantMappingsUpdated)
		}
	})
}

func TestCheckDuplicates(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("detects exact duplicate", func(t *testing.T) {
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "user-1", "group-1", gomock.Any(), gomock.Any(), int32(100), "").
			Return([]*pfinancev1.Expense{
				{
					Id:          "exp-1",
					Description: "Woolworths",
					Amount:      42.50,
					Date:        timestamppb.New(time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC)),
					Category:    pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
				},
			}, "", nil)

		resp, err := svc.CheckDuplicates(ctx, connect.NewRequest(&pfinancev1.CheckDuplicatesRequest{
			UserId:  "user-1",
			GroupId: "group-1",
			Transactions: []*pfinancev1.ExtractedTransaction{
				{
					Id:                 "tx-1",
					Description:        "Woolworths",
					NormalizedMerchant: "Woolworths",
					Amount:             42.50,
					Date:               "2025-01-15",
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		dups := resp.Msg.Duplicates
		if len(dups) != 1 {
			t.Fatalf("expected 1 duplicate group, got %d", len(dups))
		}
		candidates := dups["tx-1"]
		if candidates == nil || len(candidates.Candidates) != 1 {
			t.Fatalf("expected 1 candidate for tx-1")
		}
		if candidates.Candidates[0].ExistingExpenseId != "exp-1" {
			t.Errorf("expected existing_expense_id=exp-1")
		}
		if candidates.Candidates[0].MatchScore < 0.6 {
			t.Errorf("expected score >= 0.6, got %f", candidates.Candidates[0].MatchScore)
		}
	})

	t.Run("no duplicates for different amounts", func(t *testing.T) {
		mockStore.EXPECT().
			ListExpenses(gomock.Any(), "user-1", "", gomock.Any(), gomock.Any(), int32(100), "").
			Return([]*pfinancev1.Expense{
				{
					Id:          "exp-2",
					Description: "Cafe",
					Amount:      15.00,
					Date:        timestamppb.New(time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC)),
				},
			}, "", nil)

		resp, err := svc.CheckDuplicates(ctx, connect.NewRequest(&pfinancev1.CheckDuplicatesRequest{
			UserId: "user-1",
			Transactions: []*pfinancev1.ExtractedTransaction{
				{
					Id:          "tx-2",
					Description: "Restaurant",
					Amount:      250.00,
					Date:        "2025-01-15",
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Msg.Duplicates) != 0 {
			t.Errorf("expected 0 duplicates, got %d", len(resp.Msg.Duplicates))
		}
	})

	t.Run("rejects request for different user", func(t *testing.T) {
		_, err := svc.CheckDuplicates(ctx, connect.NewRequest(&pfinancev1.CheckDuplicatesRequest{
			UserId: "other-user",
		}))
		if err == nil {
			t.Fatal("expected permission denied")
		}
	})
}

func TestGetMerchantSuggestions(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("returns user mapping when matched", func(t *testing.T) {
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return([]*pfinancev1.MerchantMapping{
				{
					RawPattern:     "woolies",
					NormalizedName: "Woolworths",
					Category:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					Confidence:     0.95,
				},
			}, nil)

		resp, err := svc.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       "user-1",
			MerchantText: "woolies supermarket",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.SuggestedName != "Woolworths" {
			t.Errorf("expected Woolworths, got %s", resp.Msg.SuggestedName)
		}
		if resp.Msg.Source != "user_history" {
			t.Errorf("expected source=user_history, got %s", resp.Msg.Source)
		}
		if resp.Msg.Confidence != 0.95 {
			t.Errorf("expected confidence=0.95, got %f", resp.Msg.Confidence)
		}
	})

	t.Run("falls back to static normalizer", func(t *testing.T) {
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil) // No user mappings
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return(nil, nil) // No overrides

		resp, err := svc.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       "user-1",
			MerchantText: "NETFLIX.COM",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.SuggestedName != "Netflix" {
			t.Errorf("expected Netflix, got %s", resp.Msg.SuggestedName)
		}
		if resp.Msg.Source != "static" {
			t.Errorf("expected source=static, got %s", resp.Msg.Source)
		}
	})

	t.Run("returns empty for blank text", func(t *testing.T) {
		resp, err := svc.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       "user-1",
			MerchantText: "",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.SuggestedName != "" {
			t.Errorf("expected empty suggested_name, got %s", resp.Msg.SuggestedName)
		}
	})
}

func TestGetExtractionMetrics(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("aggregates metrics correctly", func(t *testing.T) {
		now := time.Now()
		mockStore.EXPECT().
			ListExtractionEvents(gomock.Any(), "user-1", gomock.Any()).
			Return([]*pfinancev1.ExtractionEvent{
				{
					Id:                "e-1",
					TransactionCount:  5,
					OverallConfidence: 0.8,
					CreatedAt:         timestamppb.New(now),
				},
				{
					Id:                "e-2",
					TransactionCount:  3,
					OverallConfidence: 0.9,
					CreatedAt:         timestamppb.New(now.Add(-time.Hour)),
				},
			}, nil)
		mockStore.EXPECT().
			ListCorrectionRecords(gomock.Any(), "user-1", 0).
			Return([]*pfinancev1.CorrectionRecord{
				{
					Id:                "c-1",
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					CreatedAt:         timestamppb.New(now),
					Corrections: []*pfinancev1.FieldCorrection{
						{Field: pfinancev1.CorrectionFieldType_CORRECTION_FIELD_TYPE_CATEGORY},
					},
				},
			}, nil)

		resp, err := svc.GetExtractionMetrics(ctx, connect.NewRequest(&pfinancev1.GetExtractionMetricsRequest{
			UserId: "user-1",
			Days:   30,
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if resp.Msg.TotalExtractions != 2 {
			t.Errorf("expected total_extractions=2, got %d", resp.Msg.TotalExtractions)
		}
		if resp.Msg.TotalTransactions != 8 {
			t.Errorf("expected total_transactions=8, got %d", resp.Msg.TotalTransactions)
		}
		if resp.Msg.TotalCorrections != 1 {
			t.Errorf("expected total_corrections=1, got %d", resp.Msg.TotalCorrections)
		}
		// avg confidence: (0.8*5 + 0.9*3) / 8 = (4.0+2.7)/8 = 0.8375
		expectedConf := 0.8375
		if diff := resp.Msg.AverageConfidence - expectedConf; diff > 0.001 || diff < -0.001 {
			t.Errorf("expected avg_confidence≈%.4f, got %.4f", expectedConf, resp.Msg.AverageConfidence)
		}
	})

	t.Run("rejects request for different user", func(t *testing.T) {
		_, err := svc.GetExtractionMetrics(ctx, connect.NewRequest(&pfinancev1.GetExtractionMetricsRequest{
			UserId: "other-user",
			Days:   30,
		}))
		if err == nil {
			t.Fatal("expected permission denied")
		}
	})
}

func TestMerchantConfidence(t *testing.T) {
	tests := []struct {
		count    int32
		expected float64
	}{
		{1, 0.75},
		{2, 0.80},
		{5, 0.95},
		{6, 0.99}, // Capped at 0.99
		{10, 0.99},
	}

	for _, tt := range tests {
		got := merchantConfidence(tt.count)
		if diff := got - tt.expected; diff > 0.001 || diff < -0.001 {
			t.Errorf("merchantConfidence(%d) = %f, want %f", tt.count, got, tt.expected)
		}
	}
}

func TestScoreDuplicate(t *testing.T) {
	t.Run("exact match scores high", func(t *testing.T) {
		tx := &pfinancev1.ExtractedTransaction{
			Description:        "Woolworths",
			NormalizedMerchant: "Woolworths",
			Amount:             42.50,
			Date:               "2025-01-15",
		}
		exp := &pfinancev1.Expense{
			Description: "Woolworths",
			Amount:      42.50,
			Date:        timestamppb.New(time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC)),
		}

		score, reason := scoreDuplicate(tx, exp)
		if score < 0.8 {
			t.Errorf("expected score >= 0.8 for exact match, got %f (reason: %s)", score, reason)
		}
	})

	t.Run("different amount and description scores low", func(t *testing.T) {
		tx := &pfinancev1.ExtractedTransaction{
			Description: "Coffee shop",
			Amount:      5.50,
			Date:        "2025-01-15",
		}
		exp := &pfinancev1.Expense{
			Description: "Electricity bill",
			Amount:      150.00,
			Date:        timestamppb.New(time.Date(2025, 1, 15, 0, 0, 0, 0, time.UTC)),
		}

		score, _ := scoreDuplicate(tx, exp)
		if score >= 0.6 {
			t.Errorf("expected score < 0.6 for different items, got %f", score)
		}
	})
}

func TestCategoryOverrideRPCs(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("GetCategoryOverrides returns user overrides", func(t *testing.T) {
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return([]*pfinancev1.CategoryOverride{
				{
					Id:                 "o-1",
					UserId:             "user-1",
					MerchantNormalized: "woolworths",
					UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
					CorrectionCount:    3,
				},
			}, nil)

		resp, err := svc.GetCategoryOverrides(ctx, connect.NewRequest(&pfinancev1.GetCategoryOverridesRequest{
			UserId: "user-1",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Msg.Overrides) != 1 {
			t.Fatalf("expected 1 override, got %d", len(resp.Msg.Overrides))
		}
		if resp.Msg.Overrides[0].MerchantNormalized != "woolworths" {
			t.Errorf("expected woolworths, got %s", resp.Msg.Overrides[0].MerchantNormalized)
		}
	})

	t.Run("SetCategoryOverride creates new override", func(t *testing.T) {
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertCategoryOverride(gomock.Any(), gomock.Any()).
			DoAndReturn(func(_ interface{}, o *pfinancev1.CategoryOverride) error {
				if o.MerchantNormalized != "coles" {
					t.Errorf("expected merchant=coles, got %s", o.MerchantNormalized)
				}
				if o.UserCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
					t.Errorf("expected category=FOOD, got %v", o.UserCategory)
				}
				if o.CorrectionCount != 1 {
					t.Errorf("expected correction_count=1, got %d", o.CorrectionCount)
				}
				return nil
			})

		resp, err := svc.SetCategoryOverride(ctx, connect.NewRequest(&pfinancev1.SetCategoryOverrideRequest{
			UserId:             "user-1",
			MerchantNormalized: "Coles",
			Category:           pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.Override.MerchantNormalized != "coles" {
			t.Errorf("expected normalized merchant=coles, got %s", resp.Msg.Override.MerchantNormalized)
		}
	})

	t.Run("SetCategoryOverride updates existing override", func(t *testing.T) {
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return([]*pfinancev1.CategoryOverride{
				{
					Id:                 "o-1",
					UserId:             "user-1",
					MerchantNormalized: "uber",
					UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectionCount:    2,
					LastCorrected:      timestamppb.Now(),
				},
			}, nil)
		mockStore.EXPECT().
			UpsertCategoryOverride(gomock.Any(), gomock.Any()).
			DoAndReturn(func(_ interface{}, o *pfinancev1.CategoryOverride) error {
				if o.CorrectionCount != 3 {
					t.Errorf("expected correction_count=3, got %d", o.CorrectionCount)
				}
				if o.UserCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION {
					t.Errorf("expected category=TRANSPORTATION")
				}
				return nil
			})

		_, err := svc.SetCategoryOverride(ctx, connect.NewRequest(&pfinancev1.SetCategoryOverrideRequest{
			UserId:             "user-1",
			MerchantNormalized: "uber",
			Category:           pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("SetCategoryOverride rejects empty merchant", func(t *testing.T) {
		_, err := svc.SetCategoryOverride(ctx, connect.NewRequest(&pfinancev1.SetCategoryOverrideRequest{
			UserId:             "user-1",
			MerchantNormalized: "",
			Category:           pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		}))
		if err == nil {
			t.Fatal("expected error for empty merchant")
		}
		if connect.CodeOf(err) != connect.CodeInvalidArgument {
			t.Errorf("expected CodeInvalidArgument, got %v", connect.CodeOf(err))
		}
	})

	t.Run("DeleteCategoryOverride removes override", func(t *testing.T) {
		mockStore.EXPECT().
			DeleteCategoryOverride(gomock.Any(), "user-1", "woolworths").
			Return(nil)

		_, err := svc.DeleteCategoryOverride(ctx, connect.NewRequest(&pfinancev1.DeleteCategoryOverrideRequest{
			UserId:             "user-1",
			MerchantNormalized: "Woolworths",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCategoryOverrideInSuggestions(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("override with 2+ corrections takes priority over static", func(t *testing.T) {
		// No user merchant mappings
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		// User has category override for "netflix" → EDUCATION (2 corrections)
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return([]*pfinancev1.CategoryOverride{
				{
					MerchantNormalized: "netflix",
					UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
					CorrectionCount:    2,
				},
			}, nil)

		resp, err := svc.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       "user-1",
			MerchantText: "NETFLIX.COM",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp.Msg.SuggestedCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION {
			t.Errorf("expected EDUCATION from override, got %v", resp.Msg.SuggestedCategory)
		}
		if resp.Msg.Source != "user_override" {
			t.Errorf("expected source=user_override, got %s", resp.Msg.Source)
		}
	})

	t.Run("override with 1 correction does not apply", func(t *testing.T) {
		// No user merchant mappings
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		// User has override but only 1 correction (below threshold)
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return([]*pfinancev1.CategoryOverride{
				{
					MerchantNormalized: "netflix",
					UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION,
					CorrectionCount:    1,
				},
			}, nil)

		resp, err := svc.GetMerchantSuggestions(ctx, connect.NewRequest(&pfinancev1.GetMerchantSuggestionsRequest{
			UserId:       "user-1",
			MerchantText: "NETFLIX.COM",
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		// Should fall through to static normalizer → ENTERTAINMENT (not EDUCATION)
		if resp.Msg.SuggestedCategory == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_EDUCATION {
			t.Error("override with 1 correction should NOT apply")
		}
		if resp.Msg.Source == "user_override" {
			t.Error("source should not be user_override for 1-correction override")
		}
	})
}

func TestSubmitCorrectionsUpsertsOverride(t *testing.T) {
	ctrl := gomock.NewController(t)
	defer ctrl.Finish()

	mockStore := store.NewMockStore(ctrl)
	svc := NewFinanceService(mockStore, nil, nil)
	ctx := testContext("user-1")

	t.Run("category correction creates override and increments on repeat", func(t *testing.T) {
		// First correction: creates new override
		mockStore.EXPECT().
			CreateCorrectionRecord(gomock.Any(), gomock.Any()).
			Return(nil)
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertMerchantMapping(gomock.Any(), gomock.Any()).
			Return(nil)
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return(nil, nil) // No existing override
		mockStore.EXPECT().
			UpsertCategoryOverride(gomock.Any(), gomock.Any()).
			DoAndReturn(func(_ interface{}, o *pfinancev1.CategoryOverride) error {
				if o.CorrectionCount != 1 {
					t.Errorf("expected correction_count=1, got %d", o.CorrectionCount)
				}
				if o.MerchantNormalized != "uber" {
					t.Errorf("expected merchant=uber, got %s", o.MerchantNormalized)
				}
				if o.UserCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION {
					t.Errorf("expected category=TRANSPORTATION")
				}
				return nil
			})
		// Tax feedback for Transportation → Work Travel
		mockStore.EXPECT().
			GetTaxDeductibilityMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertTaxDeductibilityMapping(gomock.Any(), gomock.Any()).
			Return(nil)

		_, err := svc.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: "user-1",
			Corrections: []*pfinancev1.CorrectionRecord{
				{
					OriginalMerchant:  "Uber",
					CorrectedMerchant: "Uber",
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})

	t.Run("second correction increments existing override", func(t *testing.T) {
		mockStore.EXPECT().
			CreateCorrectionRecord(gomock.Any(), gomock.Any()).
			Return(nil)
		mockStore.EXPECT().
			GetMerchantMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertMerchantMapping(gomock.Any(), gomock.Any()).
			Return(nil)
		// Existing override with count=1
		mockStore.EXPECT().
			GetCategoryOverrides(gomock.Any(), "user-1").
			Return([]*pfinancev1.CategoryOverride{
				{
					Id:                 "o-1",
					UserId:             "user-1",
					MerchantNormalized: "uber",
					UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
					CorrectionCount:    1,
				},
			}, nil)
		mockStore.EXPECT().
			UpsertCategoryOverride(gomock.Any(), gomock.Any()).
			DoAndReturn(func(_ interface{}, o *pfinancev1.CategoryOverride) error {
				if o.CorrectionCount != 2 {
					t.Errorf("expected correction_count=2, got %d", o.CorrectionCount)
				}
				return nil
			})
		// Tax feedback
		mockStore.EXPECT().
			GetTaxDeductibilityMappings(gomock.Any(), "user-1").
			Return(nil, nil)
		mockStore.EXPECT().
			UpsertTaxDeductibilityMapping(gomock.Any(), gomock.Any()).
			Return(nil)

		_, err := svc.SubmitCorrections(ctx, connect.NewRequest(&pfinancev1.SubmitCorrectionsRequest{
			UserId: "user-1",
			Corrections: []*pfinancev1.CorrectionRecord{
				{
					OriginalMerchant:  "Uber",
					CorrectedMerchant: "Uber",
					OriginalCategory:  pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_OTHER,
					CorrectedCategory: pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
				},
			},
		}))
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
	})
}

func TestCategoryOverrideMemoryStore(t *testing.T) {
	s := store.NewMemoryStore()
	ctx := t.Context()

	t.Run("empty overrides for new user", func(t *testing.T) {
		overrides, err := s.GetCategoryOverrides(ctx, "user-1")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(overrides) != 0 {
			t.Errorf("expected 0 overrides, got %d", len(overrides))
		}
	})

	t.Run("upsert creates override", func(t *testing.T) {
		err := s.UpsertCategoryOverride(ctx, &pfinancev1.CategoryOverride{
			UserId:             "user-1",
			MerchantNormalized: "woolworths",
			UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			CorrectionCount:    1,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		overrides, _ := s.GetCategoryOverrides(ctx, "user-1")
		if len(overrides) != 1 {
			t.Fatalf("expected 1 override, got %d", len(overrides))
		}
		if overrides[0].MerchantNormalized != "woolworths" {
			t.Errorf("expected woolworths, got %s", overrides[0].MerchantNormalized)
		}
	})

	t.Run("upsert updates existing override", func(t *testing.T) {
		err := s.UpsertCategoryOverride(ctx, &pfinancev1.CategoryOverride{
			UserId:             "user-1",
			MerchantNormalized: "woolworths",
			UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			CorrectionCount:    2,
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		overrides, _ := s.GetCategoryOverrides(ctx, "user-1")
		if len(overrides) != 1 {
			t.Fatalf("expected still 1 override, got %d", len(overrides))
		}
		if overrides[0].UserCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING {
			t.Errorf("expected SHOPPING, got %v", overrides[0].UserCategory)
		}
		if overrides[0].CorrectionCount != 2 {
			t.Errorf("expected count=2, got %d", overrides[0].CorrectionCount)
		}
	})

	t.Run("delete removes override", func(t *testing.T) {
		err := s.DeleteCategoryOverride(ctx, "user-1", "woolworths")
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		overrides, _ := s.GetCategoryOverrides(ctx, "user-1")
		if len(overrides) != 0 {
			t.Errorf("expected 0 overrides after delete, got %d", len(overrides))
		}
	})

	t.Run("delete nonexistent is no-op", func(t *testing.T) {
		err := s.DeleteCategoryOverride(ctx, "user-1", "nonexistent")
		if err != nil {
			t.Fatalf("expected no error for deleting nonexistent override")
		}
	})

	t.Run("overrides are user-scoped", func(t *testing.T) {
		_ = s.UpsertCategoryOverride(ctx, &pfinancev1.CategoryOverride{
			UserId:             "user-1",
			MerchantNormalized: "coles",
			UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
			CorrectionCount:    1,
		})
		_ = s.UpsertCategoryOverride(ctx, &pfinancev1.CategoryOverride{
			UserId:             "user-2",
			MerchantNormalized: "coles",
			UserCategory:       pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
			CorrectionCount:    1,
		})

		u1, _ := s.GetCategoryOverrides(ctx, "user-1")
		u2, _ := s.GetCategoryOverrides(ctx, "user-2")
		if len(u1) != 1 || u1[0].UserCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD {
			t.Errorf("user-1 override wrong")
		}
		if len(u2) != 1 || u2[0].UserCategory != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING {
			t.Errorf("user-2 override wrong")
		}
	})
}

func TestLevenshteinRatio(t *testing.T) {
	tests := []struct {
		a, b     string
		minRatio float64
	}{
		{"woolworths", "woolworths", 1.0},
		{"woolworths", "woolworts", 0.8},
		{"abc", "xyz", 0.0},
		{"", "", 1.0},
	}

	for _, tt := range tests {
		ratio := levenshteinRatio(tt.a, tt.b)
		if ratio < tt.minRatio {
			t.Errorf("levenshteinRatio(%q, %q) = %f, want >= %f", tt.a, tt.b, ratio, tt.minRatio)
		}
	}
}
