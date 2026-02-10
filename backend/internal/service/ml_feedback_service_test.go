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
