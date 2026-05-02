package service

import (
	"testing"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/castlemilk/pfinance/backend/internal/extraction"
	"github.com/castlemilk/pfinance/backend/internal/store"
	"google.golang.org/protobuf/types/known/timestamppb"
)

// TestAnalyticsAfterImportRepro reproduces a user-reported bug: after importing
// transactions via ImportExtractedTransactions, analytics views appear empty.
// This test wires up the real MemoryStore + real ExtractionService, imports a
// realistic batch of transactions, then queries every analytics endpoint.
func TestAnalyticsAfterImportRepro(t *testing.T) {
	mem := store.NewMemoryStore()
	svc := NewFinanceService(mem, nil, nil)

	// Wire the real extraction service (no ML / no Gemini needed for ImportTransactions)
	SetExtractionService(extraction.NewExtractionService(extraction.Config{}))

	const userID = "repro-user"
	ctx := testProContext(userID)

	// Build 30 days of synthetic extracted transactions ending today.
	now := time.Now().UTC()
	categories := []pfinancev1.ExpenseCategory{
		pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_FOOD,
		pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_TRANSPORTATION,
		pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_SHOPPING,
		pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_ENTERTAINMENT,
	}
	merchants := []string{"Woolworths", "Uber", "Amazon", "Netflix"}

	var txs []*pfinancev1.ExtractedTransaction
	for i := 0; i < 30; i++ {
		d := now.AddDate(0, 0, -i)
		// Half the transactions have only Description (no NormalizedMerchant)
		// — simulating extractor output where normalization didn't run.
		tx := &pfinancev1.ExtractedTransaction{
			Date:              d.Format("2006-01-02"),
			Description:       merchants[i%len(merchants)] + " purchase",
			Amount:            10.0 + float64(i),
			SuggestedCategory: categories[i%len(categories)],
			Confidence:        0.9,
			IsDebit:           true,
		}
		if i%2 == 0 {
			tx.NormalizedMerchant = merchants[i%len(merchants)]
		}
		txs = append(txs, tx)
	}

	importResp, err := svc.ImportExtractedTransactions(ctx, connect.NewRequest(&pfinancev1.ImportExtractedTransactionsRequest{
		UserId:           userID,
		Transactions:     txs,
		SkipDuplicates:   false,
		DefaultFrequency: pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ONCE,
	}))
	if err != nil {
		t.Fatalf("ImportExtractedTransactions failed: %v", err)
	}
	if importResp.Msg.ImportedCount != int32(len(txs)) {
		t.Fatalf("expected %d imported, got %d (skipped=%d reasons=%v)",
			len(txs), importResp.Msg.ImportedCount,
			importResp.Msg.SkippedCount, importResp.Msg.SkippedReasons)
	}
	t.Logf("Imported %d expenses", importResp.Msg.ImportedCount)

	// Inspect first persisted expense to confirm Amount/AmountCents/Date shape.
	listed, _, err := mem.ListExpenses(ctx, userID, "", nil, nil, 100, "")
	if err != nil {
		t.Fatalf("ListExpenses failed: %v", err)
	}
	t.Logf("Store contains %d expenses", len(listed))
	if len(listed) == 0 {
		t.Fatal("no expenses persisted after import")
	}
	emptyDesc := 0
	zeroCents := 0
	for _, e := range listed {
		if e.Description == "" {
			emptyDesc++
		}
		if e.AmountCents == 0 {
			zeroCents++
		}
	}
	t.Logf("BUG indicators: %d/%d expenses have empty Description, %d/%d have AmountCents=0",
		emptyDesc, len(listed), zeroCents, len(listed))
	if emptyDesc > 0 {
		t.Errorf("BUG: %d/%d imported expenses have empty Description", emptyDesc, len(listed))
	}
	if zeroCents > 0 {
		t.Errorf("BUG: %d/%d imported expenses have AmountCents=0", zeroCents, len(listed))
	}
	for i, e := range listed[:5] {
		t.Logf("  expense[%d]: desc=%q amount=%.2f amount_cents=%d date=%s category=%v",
			i, e.Description, e.Amount, e.AmountCents,
			e.Date.AsTime().Format("2006-01-02"), e.Category)
	}

	startDate := now.AddDate(0, 0, -45)
	endDate := now.AddDate(0, 0, 1)

	t.Run("GetDailyAggregates", func(t *testing.T) {
		resp, err := svc.GetDailyAggregates(ctx, connect.NewRequest(&pfinancev1.GetDailyAggregatesRequest{
			UserId:    userID,
			StartDate: timestamppb.New(startDate),
			EndDate:   timestamppb.New(endDate),
		}))
		if err != nil {
			t.Fatalf("GetDailyAggregates: %v", err)
		}
		t.Logf("aggregates=%d max_daily=%.2f max_daily_cents=%d",
			len(resp.Msg.Aggregates), resp.Msg.MaxDailyAmount, resp.Msg.MaxDailyAmountCents)
		if len(resp.Msg.Aggregates) == 0 {
			t.Error("BUG: heatmap got zero aggregates after importing 30 transactions")
		}
		for i, a := range resp.Msg.Aggregates {
			if i < 3 {
				t.Logf("  agg[%d] date=%s total=%.2f cents=%d count=%d cats=%d",
					i, a.Date, a.TotalAmount, a.TotalAmountCents, a.TransactionCount, len(a.CategoryAmounts))
			}
		}
	})

	t.Run("GetCategoryComparison", func(t *testing.T) {
		resp, err := svc.GetCategoryComparison(ctx, connect.NewRequest(&pfinancev1.GetCategoryComparisonRequest{
			UserId:        userID,
			CurrentPeriod: "month",
		}))
		if err != nil {
			t.Fatalf("GetCategoryComparison: %v", err)
		}
		t.Logf("category rows=%d", len(resp.Msg.Categories))
		if len(resp.Msg.Categories) == 0 {
			t.Error("BUG: category comparison empty after import")
		}
		for _, c := range resp.Msg.Categories {
			t.Logf("  cat=%v current=%.2f prev=%.2f", c.Category, c.CurrentAmount, c.PreviousAmount)
		}
	})

	t.Run("DetectAnomalies", func(t *testing.T) {
		resp, err := svc.DetectAnomalies(ctx, connect.NewRequest(&pfinancev1.DetectAnomaliesRequest{
			UserId:       userID,
			LookbackDays: 90,
			Sensitivity:  0.5,
		}))
		if err != nil {
			t.Fatalf("DetectAnomalies: %v", err)
		}
		t.Logf("anomalies=%d total=%.2f", len(resp.Msg.Anomalies), resp.Msg.AnomalousSpendTotal)
	})

	t.Run("GetSpendingTrends", func(t *testing.T) {
		resp, err := svc.GetSpendingTrends(ctx, connect.NewRequest(&pfinancev1.GetSpendingTrendsRequest{
			UserId:      userID,
			Granularity: pfinancev1.Granularity_GRANULARITY_WEEK,
			Periods:     8,
		}))
		if err != nil {
			t.Fatalf("GetSpendingTrends: %v", err)
		}
		t.Logf("trend points expense=%d income=%d slope=%.2f",
			len(resp.Msg.ExpenseSeries), len(resp.Msg.IncomeSeries), resp.Msg.TrendSlope)
		if len(resp.Msg.ExpenseSeries) == 0 {
			t.Error("BUG: trends empty after import")
		}
	})

	t.Run("GetWaterfallData", func(t *testing.T) {
		resp, err := svc.GetWaterfallData(ctx, connect.NewRequest(&pfinancev1.GetWaterfallDataRequest{
			UserId: userID,
			Period: "month",
		}))
		if err != nil {
			t.Fatalf("GetWaterfallData: %v", err)
		}
		t.Logf("waterfall entries=%d", len(resp.Msg.Entries))
	})
}

var _ = auth.RequireAuth
