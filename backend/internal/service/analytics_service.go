package service

import (
	"context"
	"fmt"
	"math"
	"sort"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
	"github.com/google/uuid"
)

// ============================================================================
// Analytics Handlers
// ============================================================================

// GetDailyAggregates returns daily spending aggregates for a date range.
func (s *FinanceService) GetDailyAggregates(ctx context.Context, req *connect.Request[pfinancev1.GetDailyAggregatesRequest]) (*connect.Response[pfinancev1.GetDailyAggregatesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := auth.RequireProTier(ctx); err != nil {
		return nil, err
	}

	// Verify group membership if groupID is set
	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	if req.Msg.StartDate == nil || req.Msg.EndDate == nil {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("start_date and end_date are required"))
	}

	startDate := req.Msg.StartDate.AsTime()
	endDate := req.Msg.EndDate.AsTime()

	// Validate date range <= 366 days
	if endDate.Sub(startDate).Hours()/24 > 366 {
		return nil, connect.NewError(connect.CodeInvalidArgument,
			fmt.Errorf("date range must not exceed 366 days"))
	}

	aggregates, err := s.store.GetDailyAggregates(ctx, userID, req.Msg.GroupId, startDate, endDate)
	if err != nil {
		return nil, auth.WrapStoreError("get daily aggregates", err)
	}

	// Compute max daily amount
	var maxDailyAmount float64
	var maxDailyAmountCents int64
	for _, agg := range aggregates {
		if agg.TotalAmount > maxDailyAmount {
			maxDailyAmount = agg.TotalAmount
		}
		if agg.TotalAmountCents > maxDailyAmountCents {
			maxDailyAmountCents = agg.TotalAmountCents
		}
	}

	return connect.NewResponse(&pfinancev1.GetDailyAggregatesResponse{
		Aggregates:          aggregates,
		MaxDailyAmount:      maxDailyAmount,
		MaxDailyAmountCents: maxDailyAmountCents,
	}), nil
}

// GetSpendingTrends returns time-series spending/income data with trend analysis.
func (s *FinanceService) GetSpendingTrends(ctx context.Context, req *connect.Request[pfinancev1.GetSpendingTrendsRequest]) (*connect.Response[pfinancev1.GetSpendingTrendsResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := auth.RequireProTier(ctx); err != nil {
		return nil, err
	}

	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	// Defaults
	granularity := req.Msg.Granularity
	if granularity == pfinancev1.Granularity_GRANULARITY_UNSPECIFIED {
		granularity = pfinancev1.Granularity_GRANULARITY_MONTH
	}
	periods := req.Msg.Periods
	if periods <= 0 {
		periods = 6
	}

	now := time.Now()
	var expenseSeries []*pfinancev1.TimeSeriesDataPoint
	var incomeSeries []*pfinancev1.TimeSeriesDataPoint

	// Compute date ranges for N periods and fetch data for each
	for i := int32(0); i < periods; i++ {
		var periodStart, periodEnd time.Time
		var label string
		// Periods are ordered oldest first: offset = periods-1-i
		offset := periods - 1 - i

		switch granularity {
		case pfinancev1.Granularity_GRANULARITY_DAY:
			periodStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -int(offset))
			periodEnd = periodStart.Add(24*time.Hour - time.Second)
			label = periodStart.Format("2006-01-02")
		case pfinancev1.Granularity_GRANULARITY_WEEK:
			weekStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			weekStart = weekStart.AddDate(0, 0, -int(weekStart.Weekday())) // Sunday
			periodStart = weekStart.AddDate(0, 0, -int(offset)*7)
			periodEnd = periodStart.AddDate(0, 0, 6)
			periodEnd = time.Date(periodEnd.Year(), periodEnd.Month(), periodEnd.Day(), 23, 59, 59, 0, periodEnd.Location())
			label = periodStart.Format("Jan 02")
		default: // MONTH
			periodStart = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).AddDate(0, -int(offset), 0)
			periodEnd = periodStart.AddDate(0, 1, -1)
			periodEnd = time.Date(periodEnd.Year(), periodEnd.Month(), periodEnd.Day(), 23, 59, 59, 0, periodEnd.Location())
			label = periodStart.Format("Jan 2006")
		}

		// Fetch expenses for this period
		expenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &periodStart, &periodEnd, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list expenses", err)
		}

		var expenseTotal float64
		for _, e := range expenses {
			// Filter by category if specified
			if req.Msg.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED && e.Category != req.Msg.Category {
				continue
			}
			expenseTotal += e.Amount
		}

		// Fetch incomes for this period
		incomes, _, err := s.store.ListIncomes(ctx, userID, req.Msg.GroupId, &periodStart, &periodEnd, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list incomes", err)
		}

		var incomeTotal float64
		for _, inc := range incomes {
			incomeTotal += inc.Amount
		}

		expenseSeries = append(expenseSeries, &pfinancev1.TimeSeriesDataPoint{
			Date:       periodStart.Format("2006-01-02"),
			Value:      expenseTotal,
			ValueCents: int64(expenseTotal * 100),
			Label:      label,
		})
		incomeSeries = append(incomeSeries, &pfinancev1.TimeSeriesDataPoint{
			Date:       periodStart.Format("2006-01-02"),
			Value:      incomeTotal,
			ValueCents: int64(incomeTotal * 100),
			Label:      label,
		})
	}

	// Compute linear regression on expense series
	expenseValues := make([]float64, len(expenseSeries))
	for i, pt := range expenseSeries {
		expenseValues[i] = pt.Value
	}
	slope, rSquared := computeLinearRegression(expenseValues)

	return connect.NewResponse(&pfinancev1.GetSpendingTrendsResponse{
		ExpenseSeries: expenseSeries,
		IncomeSeries:  incomeSeries,
		TrendSlope:    slope,
		TrendRSquared: rSquared,
	}), nil
}

// GetCategoryComparison compares category spending between current and previous periods.
func (s *FinanceService) GetCategoryComparison(ctx context.Context, req *connect.Request[pfinancev1.GetCategoryComparisonRequest]) (*connect.Response[pfinancev1.GetCategoryComparisonResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := auth.RequireProTier(ctx); err != nil {
		return nil, err
	}

	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	period := req.Msg.CurrentPeriod
	if period == "" {
		period = "month"
	}

	now := time.Now()
	var currentStart, currentEnd, prevStart, prevEnd time.Time

	switch period {
	case "week":
		daysFromSunday := int(now.Weekday())
		currentStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -daysFromSunday)
		currentEnd = currentStart.AddDate(0, 0, 6)
		currentEnd = time.Date(currentEnd.Year(), currentEnd.Month(), currentEnd.Day(), 23, 59, 59, 0, currentEnd.Location())
		prevStart = currentStart.AddDate(0, 0, -7)
		prevEnd = currentStart.AddDate(0, 0, -1)
		prevEnd = time.Date(prevEnd.Year(), prevEnd.Month(), prevEnd.Day(), 23, 59, 59, 0, prevEnd.Location())
	case "quarter":
		month := now.Month()
		quarterStartMonth := time.Month(((int(month)-1)/3)*3 + 1)
		currentStart = time.Date(now.Year(), quarterStartMonth, 1, 0, 0, 0, 0, now.Location())
		currentEnd = currentStart.AddDate(0, 3, -1)
		currentEnd = time.Date(currentEnd.Year(), currentEnd.Month(), currentEnd.Day(), 23, 59, 59, 0, currentEnd.Location())
		prevStart = currentStart.AddDate(0, -3, 0)
		prevEnd = currentStart.AddDate(0, 0, -1)
		prevEnd = time.Date(prevEnd.Year(), prevEnd.Month(), prevEnd.Day(), 23, 59, 59, 0, prevEnd.Location())
	default: // "month"
		currentStart = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		currentEnd = currentStart.AddDate(0, 1, -1)
		currentEnd = time.Date(currentEnd.Year(), currentEnd.Month(), currentEnd.Day(), 23, 59, 59, 0, currentEnd.Location())
		prevStart = currentStart.AddDate(0, -1, 0)
		prevEnd = currentStart.AddDate(0, 0, -1)
		prevEnd = time.Date(prevEnd.Year(), prevEnd.Month(), prevEnd.Day(), 23, 59, 59, 0, prevEnd.Location())
	}

	// Fetch current period expenses
	currentExpenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &currentStart, &currentEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list current expenses", err)
	}

	// Fetch previous period expenses
	prevExpenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &prevStart, &prevEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list previous expenses", err)
	}

	// Group by category
	currentByCategory := make(map[pfinancev1.ExpenseCategory]float64)
	prevByCategory := make(map[pfinancev1.ExpenseCategory]float64)

	for _, e := range currentExpenses {
		currentByCategory[e.Category] += e.Amount
	}
	for _, e := range prevExpenses {
		prevByCategory[e.Category] += e.Amount
	}

	// Collect all categories
	allCategories := make(map[pfinancev1.ExpenseCategory]bool)
	for cat := range currentByCategory {
		allCategories[cat] = true
	}
	for cat := range prevByCategory {
		allCategories[cat] = true
	}

	// Optionally fetch budgets
	var budgetByCategory map[pfinancev1.ExpenseCategory]float64
	if req.Msg.IncludeBudgets {
		budgetByCategory = make(map[pfinancev1.ExpenseCategory]float64)
		budgets, _, err := s.store.ListBudgets(ctx, userID, req.Msg.GroupId, false, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list budgets", err)
		}
		for _, b := range budgets {
			for _, catID := range b.CategoryIds {
				budgetByCategory[catID] = b.Amount
			}
		}
	}

	var categories []*pfinancev1.CategorySpending
	for cat := range allCategories {
		current := currentByCategory[cat]
		previous := prevByCategory[cat]
		var changePercent float64
		if previous > 0 {
			changePercent = ((current - previous) / previous) * 100
		}

		cs := &pfinancev1.CategorySpending{
			Category:            cat,
			CurrentAmount:       current,
			CurrentAmountCents:  int64(current * 100),
			PreviousAmount:      previous,
			PreviousAmountCents: int64(previous * 100),
			ChangePercent:       changePercent,
		}

		if budgetByCategory != nil {
			if budgetAmt, ok := budgetByCategory[cat]; ok {
				cs.BudgetAmount = budgetAmt
				cs.BudgetAmountCents = int64(budgetAmt * 100)
			}
		}

		categories = append(categories, cs)
	}

	// Sort by current amount descending
	sort.Slice(categories, func(i, j int) bool {
		return categories[i].CurrentAmount > categories[j].CurrentAmount
	})

	return connect.NewResponse(&pfinancev1.GetCategoryComparisonResponse{
		Categories: categories,
	}), nil
}

// DetectAnomalies detects unusual spending patterns using z-score analysis.
func (s *FinanceService) DetectAnomalies(ctx context.Context, req *connect.Request[pfinancev1.DetectAnomaliesRequest]) (*connect.Response[pfinancev1.DetectAnomaliesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := auth.RequireProTier(ctx); err != nil {
		return nil, err
	}

	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	lookbackDays := req.Msg.LookbackDays
	if lookbackDays <= 0 {
		lookbackDays = 90
	}
	sensitivity := req.Msg.Sensitivity
	if sensitivity <= 0 {
		sensitivity = 0.5
	}
	// Threshold: sensitivity=0 → 3.0, sensitivity=0.5 → 2.0, sensitivity=1.0 → 1.0
	threshold := 3.0 - (sensitivity * 2.0)

	now := time.Now()
	startDate := now.AddDate(0, 0, -int(lookbackDays))
	endDate := now

	// Fetch expenses for lookback period
	expenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &startDate, &endDate, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}

	// Group by category: collect amounts
	type categoryStats struct {
		amounts  []float64
		expenses []*pfinancev1.Expense
	}
	byCat := make(map[pfinancev1.ExpenseCategory]*categoryStats)
	merchantFirstSeen := make(map[string]time.Time)

	for _, e := range expenses {
		cs, ok := byCat[e.Category]
		if !ok {
			cs = &categoryStats{}
			byCat[e.Category] = cs
		}
		cs.amounts = append(cs.amounts, e.Amount)
		cs.expenses = append(cs.expenses, e)

		// Track merchant first occurrence
		desc := e.Description
		if desc != "" {
			if _, exists := merchantFirstSeen[desc]; !exists {
				if e.Date != nil {
					merchantFirstSeen[desc] = e.Date.AsTime()
				} else {
					merchantFirstSeen[desc] = e.CreatedAt.AsTime()
				}
			} else {
				existing := merchantFirstSeen[desc]
				expDate := e.CreatedAt.AsTime()
				if e.Date != nil {
					expDate = e.Date.AsTime()
				}
				if expDate.Before(existing) {
					merchantFirstSeen[desc] = expDate
				}
			}
		}
	}

	var anomalies []*pfinancev1.SpendingAnomaly

	// Z-score anomaly detection per category
	for cat, cs := range byCat {
		if len(cs.amounts) < 10 {
			continue
		}
		// Compute mean and stddev
		var sum float64
		for _, a := range cs.amounts {
			sum += a
		}
		mean := sum / float64(len(cs.amounts))

		var varianceSum float64
		for _, a := range cs.amounts {
			diff := a - mean
			varianceSum += diff * diff
		}
		stddev := math.Sqrt(varianceSum / float64(len(cs.amounts)))
		if stddev == 0 {
			continue
		}

		for _, e := range cs.expenses {
			zScore := (e.Amount - mean) / stddev
			absZ := math.Abs(zScore)
			if absZ > threshold {
				// Map z-score to severity
				var severity pfinancev1.AnomalySeverity
				if absZ > 3.0 {
					severity = pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_HIGH
				} else if absZ > 2.5 {
					severity = pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_MEDIUM
				} else {
					severity = pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_LOW
				}

				anomalies = append(anomalies, &pfinancev1.SpendingAnomaly{
					Id:             uuid.New().String(),
					ExpenseId:      e.Id,
					Description:    e.Description,
					Amount:         e.Amount,
					AmountCents:    int64(e.Amount * 100),
					Category:       cat,
					Date:           e.Date,
					ZScore:         zScore,
					ExpectedAmount: mean,
					AnomalyType:    pfinancev1.AnomalyType_ANOMALY_TYPE_AMOUNT_OUTLIER,
					Severity:       severity,
				})
			}
		}
	}

	// Flag new merchants (first occurrence within this lookback is the only occurrence)
	for _, e := range expenses {
		if e.Description == "" {
			continue
		}
		firstSeen := merchantFirstSeen[e.Description]
		// Count how many times this merchant appears
		count := 0
		for _, e2 := range expenses {
			if e2.Description == e.Description {
				count++
			}
		}
		// If the merchant was first seen in the lookback and appears only once
		if count == 1 && !firstSeen.Before(startDate) {
			anomalies = append(anomalies, &pfinancev1.SpendingAnomaly{
				Id:          uuid.New().String(),
				ExpenseId:   e.Id,
				Description: fmt.Sprintf("New merchant: %s", e.Description),
				Amount:      e.Amount,
				AmountCents: int64(e.Amount * 100),
				Category:    e.Category,
				Date:        e.Date,
				AnomalyType: pfinancev1.AnomalyType_ANOMALY_TYPE_NEW_MERCHANT,
				Severity:    pfinancev1.AnomalySeverity_ANOMALY_SEVERITY_LOW,
			})
		}
	}

	// Sort by severity desc, then amount desc
	sort.Slice(anomalies, func(i, j int) bool {
		if anomalies[i].Severity != anomalies[j].Severity {
			return anomalies[i].Severity > anomalies[j].Severity
		}
		return anomalies[i].Amount > anomalies[j].Amount
	})

	// Compute summary stats
	var anomalousTotal float64
	catCounts := make(map[string]int)
	for _, a := range anomalies {
		anomalousTotal += a.Amount
		catCounts[a.Category.String()]++
	}
	var topCategory string
	var topCount int
	for cat, count := range catCounts {
		if count > topCount {
			topCount = count
			topCategory = cat
		}
	}

	return connect.NewResponse(&pfinancev1.DetectAnomaliesResponse{
		Anomalies:                anomalies,
		TotalAnomalies:           int32(len(anomalies)),
		AnomalousSpendTotal:      anomalousTotal,
		AnomalousSpendTotalCents: int64(anomalousTotal * 100),
		TopAnomalyCategory:       topCategory,
	}), nil
}

// GetCashFlowForecast forecasts future cash flow using historical data and recurring transactions.
func (s *FinanceService) GetCashFlowForecast(ctx context.Context, req *connect.Request[pfinancev1.GetCashFlowForecastRequest]) (*connect.Response[pfinancev1.GetCashFlowForecastResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := auth.RequireProTier(ctx); err != nil {
		return nil, err
	}

	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	forecastDays := req.Msg.ForecastDays
	if forecastDays <= 0 {
		forecastDays = 30
	}

	now := time.Now()
	historyStart := now.AddDate(0, 0, -90)
	historyEnd := now

	// Fetch historical expenses and incomes
	expenses, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &historyStart, &historyEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}
	incomes, _, err := s.store.ListIncomes(ctx, userID, req.Msg.GroupId, &historyStart, &historyEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list incomes", err)
	}

	// Group by day for history
	expenseByDay := make(map[string]float64)
	incomeByDay := make(map[string]float64)

	for _, e := range expenses {
		if e.Date != nil {
			day := e.Date.AsTime().Format("2006-01-02")
			expenseByDay[day] += e.Amount
		}
	}
	for _, inc := range incomes {
		if inc.Date != nil {
			day := inc.Date.AsTime().Format("2006-01-02")
			incomeByDay[day] += inc.Amount
		}
	}

	// Build history series
	var expenseHistory []*pfinancev1.TimeSeriesDataPoint
	var incomeHistory []*pfinancev1.TimeSeriesDataPoint
	var dailyExpenses []float64
	var dailyIncomes []float64

	for d := historyStart; !d.After(historyEnd); d = d.AddDate(0, 0, 1) {
		dayStr := d.Format("2006-01-02")
		expAmt := expenseByDay[dayStr]
		incAmt := incomeByDay[dayStr]
		dailyExpenses = append(dailyExpenses, expAmt)
		dailyIncomes = append(dailyIncomes, incAmt)

		expenseHistory = append(expenseHistory, &pfinancev1.TimeSeriesDataPoint{
			Date:       dayStr,
			Value:      expAmt,
			ValueCents: int64(expAmt * 100),
		})
		incomeHistory = append(incomeHistory, &pfinancev1.TimeSeriesDataPoint{
			Date:       dayStr,
			Value:      incAmt,
			ValueCents: int64(incAmt * 100),
		})
	}

	// Compute historical daily averages and stddev
	var expenseSum, incomeSum float64
	for _, v := range dailyExpenses {
		expenseSum += v
	}
	for _, v := range dailyIncomes {
		incomeSum += v
	}
	numDays := float64(len(dailyExpenses))
	if numDays == 0 {
		numDays = 1
	}
	avgDailyExpense := expenseSum / numDays
	avgDailyIncome := incomeSum / numDays

	var expenseVariance, incomeVariance float64
	for _, v := range dailyExpenses {
		diff := v - avgDailyExpense
		expenseVariance += diff * diff
	}
	for _, v := range dailyIncomes {
		diff := v - avgDailyIncome
		incomeVariance += diff * diff
	}
	expenseStddev := math.Sqrt(expenseVariance / numDays)
	incomeStddev := math.Sqrt(incomeVariance / numDays)

	// Fetch active recurring transactions
	recurringTxns, _, err := s.store.ListRecurringTransactions(ctx, userID, req.Msg.GroupId,
		pfinancev1.RecurringTransactionStatus_RECURRING_TRANSACTION_STATUS_ACTIVE,
		false, false, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list recurring transactions", err)
	}

	// Build recurring amounts by date for forecast period
	recurringExpenseByDay := make(map[string]float64)
	recurringIncomeByDay := make(map[string]float64)
	recurringDays := make(map[string]bool)

	for _, rt := range recurringTxns {
		// Project forward for each recurring transaction
		current := now
		if rt.NextOccurrence != nil {
			current = rt.NextOccurrence.AsTime()
		} else if rt.StartDate != nil {
			current = rt.StartDate.AsTime()
		}

		forecastEnd := now.AddDate(0, 0, int(forecastDays))
		for !current.After(forecastEnd) {
			if current.After(now) {
				dayStr := current.Format("2006-01-02")
				if rt.IsExpense {
					recurringExpenseByDay[dayStr] += rt.Amount
				} else {
					recurringIncomeByDay[dayStr] += rt.Amount
				}
				recurringDays[dayStr] = true
			}
			current = nextOccurrence(current, rt.Frequency)
		}
	}

	// Build forecast arrays
	var incomeForecast []*pfinancev1.ForecastPoint
	var expenseForecast []*pfinancev1.ForecastPoint
	var netForecast []*pfinancev1.ForecastPoint

	for i := int32(1); i <= forecastDays; i++ {
		forecastDate := now.AddDate(0, 0, int(i))
		dayStr := forecastDate.Format("2006-01-02")

		// Expense prediction
		predictedExpense := avgDailyExpense
		isRecurringExpense := false
		if recurringAmt, ok := recurringExpenseByDay[dayStr]; ok {
			predictedExpense = recurringAmt
			isRecurringExpense = true
		}
		expenseLower := predictedExpense - 1.645*expenseStddev
		if expenseLower < 0 {
			expenseLower = 0
		}
		expenseUpper := predictedExpense + 1.645*expenseStddev

		// Income prediction
		predictedIncome := avgDailyIncome
		isRecurringIncome := false
		if recurringAmt, ok := recurringIncomeByDay[dayStr]; ok {
			predictedIncome = recurringAmt
			isRecurringIncome = true
		}
		incomeLower := predictedIncome - 1.645*incomeStddev
		if incomeLower < 0 {
			incomeLower = 0
		}
		incomeUpper := predictedIncome + 1.645*incomeStddev

		// Net
		predictedNet := predictedIncome - predictedExpense

		expenseForecast = append(expenseForecast, &pfinancev1.ForecastPoint{
			Date:            dayStr,
			Predicted:       predictedExpense,
			PredictedCents:  int64(predictedExpense * 100),
			LowerBound:      expenseLower,
			LowerBoundCents: int64(expenseLower * 100),
			UpperBound:      expenseUpper,
			UpperBoundCents: int64(expenseUpper * 100),
			IsRecurring:     isRecurringExpense,
		})

		incomeForecast = append(incomeForecast, &pfinancev1.ForecastPoint{
			Date:            dayStr,
			Predicted:       predictedIncome,
			PredictedCents:  int64(predictedIncome * 100),
			LowerBound:      incomeLower,
			LowerBoundCents: int64(incomeLower * 100),
			UpperBound:      incomeUpper,
			UpperBoundCents: int64(incomeUpper * 100),
			IsRecurring:     isRecurringIncome,
		})

		netForecast = append(netForecast, &pfinancev1.ForecastPoint{
			Date:           dayStr,
			Predicted:      predictedNet,
			PredictedCents: int64(predictedNet * 100),
		})
	}

	return connect.NewResponse(&pfinancev1.GetCashFlowForecastResponse{
		IncomeForecast:  incomeForecast,
		ExpenseForecast: expenseForecast,
		NetForecast:     netForecast,
		IncomeHistory:   incomeHistory,
		ExpenseHistory:  expenseHistory,
	}), nil
}

// GetWaterfallData returns waterfall chart data showing income to savings flow.
func (s *FinanceService) GetWaterfallData(ctx context.Context, req *connect.Request[pfinancev1.GetWaterfallDataRequest]) (*connect.Response[pfinancev1.GetWaterfallDataResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := auth.RequireProTier(ctx); err != nil {
		return nil, err
	}

	if req.Msg.GroupId != "" {
		group, err := s.store.GetGroup(ctx, req.Msg.GroupId)
		if err != nil {
			return nil, auth.WrapStoreError("get group", err)
		}
		if !auth.IsGroupMember(claims.UID, group) {
			return nil, connect.NewError(connect.CodePermissionDenied,
				fmt.Errorf("user is not a member of this group"))
		}
	}

	userID := req.Msg.UserId
	if userID == "" && req.Msg.GroupId == "" {
		userID = claims.UID
	}

	period := req.Msg.Period
	if period == "" {
		period = "month"
	}

	now := time.Now()
	var startDate, endDate time.Time
	var periodLabel string

	switch period {
	case "week":
		daysFromSunday := int(now.Weekday())
		startDate = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -daysFromSunday)
		endDate = startDate.AddDate(0, 0, 6)
		endDate = time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 23, 59, 59, 0, endDate.Location())
		periodLabel = fmt.Sprintf("Week of %s", startDate.Format("Jan 02, 2006"))
	case "quarter":
		month := now.Month()
		quarterStartMonth := time.Month(((int(month)-1)/3)*3 + 1)
		startDate = time.Date(now.Year(), quarterStartMonth, 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 3, -1)
		endDate = time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 23, 59, 59, 0, endDate.Location())
		q := ((int(month) - 1) / 3) + 1
		periodLabel = fmt.Sprintf("Q%d %d", q, now.Year())
	case "year":
		startDate = time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		endDate = time.Date(now.Year(), 12, 31, 23, 59, 59, 0, now.Location())
		periodLabel = fmt.Sprintf("%d", now.Year())
	default: // "month"
		startDate = time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		endDate = startDate.AddDate(0, 1, -1)
		endDate = time.Date(endDate.Year(), endDate.Month(), endDate.Day(), 23, 59, 59, 0, endDate.Location())
		periodLabel = now.Format("January 2006")
	}

	// Fetch incomes and expenses
	incomesList, _, err := s.store.ListIncomes(ctx, userID, req.Msg.GroupId, &startDate, &endDate, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list incomes", err)
	}
	expensesList, _, err := s.store.ListExpenses(ctx, userID, req.Msg.GroupId, &startDate, &endDate, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}

	// Sum incomes
	var totalIncome float64
	for _, inc := range incomesList {
		totalIncome += inc.Amount
	}

	// Group expenses by category
	expenseByCategory := make(map[pfinancev1.ExpenseCategory]float64)
	var totalExpenses float64
	for _, e := range expensesList {
		expenseByCategory[e.Category] += e.Amount
		totalExpenses += e.Amount
	}

	// Build waterfall entries
	var entries []*pfinancev1.WaterfallEntry
	runningTotal := totalIncome

	// 1. Gross Income
	entries = append(entries, &pfinancev1.WaterfallEntry{
		Label:             "Gross Income",
		Amount:            totalIncome,
		AmountCents:       int64(totalIncome * 100),
		EntryType:         pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_INCOME,
		RunningTotal:      runningTotal,
		RunningTotalCents: int64(runningTotal * 100),
	})

	// 2. Tax (estimated at a simple rate)
	estimatedTaxRate := 0.25
	estimatedTax := totalIncome * estimatedTaxRate
	runningTotal -= estimatedTax
	entries = append(entries, &pfinancev1.WaterfallEntry{
		Label:             "Tax",
		Amount:            estimatedTax,
		AmountCents:       int64(estimatedTax * 100),
		EntryType:         pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_TAX,
		RunningTotal:      runningTotal,
		RunningTotalCents: int64(runningTotal * 100),
	})

	// 3. Expense categories sorted by amount desc
	type catAmount struct {
		category pfinancev1.ExpenseCategory
		amount   float64
	}
	var sortedCategories []catAmount
	for cat, amt := range expenseByCategory {
		sortedCategories = append(sortedCategories, catAmount{category: cat, amount: amt})
	}
	sort.Slice(sortedCategories, func(i, j int) bool {
		return sortedCategories[i].amount > sortedCategories[j].amount
	})

	for _, ca := range sortedCategories {
		runningTotal -= ca.amount
		entries = append(entries, &pfinancev1.WaterfallEntry{
			Label:             ca.category.String(),
			Amount:            ca.amount,
			AmountCents:       int64(ca.amount * 100),
			EntryType:         pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_EXPENSE,
			RunningTotal:      runningTotal,
			RunningTotalCents: int64(runningTotal * 100),
		})
	}

	// 4. Net Savings
	netSavings := totalIncome - totalExpenses - estimatedTax
	entries = append(entries, &pfinancev1.WaterfallEntry{
		Label:             "Net Savings",
		Amount:            netSavings,
		AmountCents:       int64(netSavings * 100),
		EntryType:         pfinancev1.WaterfallEntryType_WATERFALL_ENTRY_TYPE_SAVINGS,
		RunningTotal:      netSavings,
		RunningTotalCents: int64(netSavings * 100),
	})

	return connect.NewResponse(&pfinancev1.GetWaterfallDataResponse{
		Entries:     entries,
		PeriodLabel: periodLabel,
	}), nil
}

// ============================================================================
// Analytics Helpers
// ============================================================================

// computeLinearRegression computes slope and R-squared for a series of y-values
// where x = 0, 1, 2, ... (the index).
func computeLinearRegression(points []float64) (slope, rSquared float64) {
	n := float64(len(points))
	if n < 2 {
		return 0, 0
	}
	var sumX, sumY, sumXY, sumX2 float64
	for i, y := range points {
		x := float64(i)
		sumX += x
		sumY += y
		sumXY += x * y
		sumX2 += x * x
	}
	denom := n*sumX2 - sumX*sumX
	if denom == 0 {
		return 0, 0
	}
	slope = (n*sumXY - sumX*sumY) / denom
	intercept := (sumY - slope*sumX) / n
	// R²
	meanY := sumY / n
	var ssRes, ssTot float64
	for i, y := range points {
		predicted := slope*float64(i) + intercept
		ssRes += (y - predicted) * (y - predicted)
		ssTot += (y - meanY) * (y - meanY)
	}
	if ssTot == 0 {
		return slope, 1
	}
	rSquared = 1 - ssRes/ssTot
	return slope, rSquared
}

// nextOccurrence computes the next occurrence date from the given date based on frequency.
func nextOccurrence(current time.Time, freq pfinancev1.ExpenseFrequency) time.Time {
	switch freq {
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_DAILY:
		return current.AddDate(0, 0, 1)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_WEEKLY:
		return current.AddDate(0, 0, 7)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_FORTNIGHTLY:
		return current.AddDate(0, 0, 14)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_MONTHLY:
		return current.AddDate(0, 1, 0)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_QUARTERLY:
		return current.AddDate(0, 3, 0)
	case pfinancev1.ExpenseFrequency_EXPENSE_FREQUENCY_ANNUALLY:
		return current.AddDate(1, 0, 0)
	default:
		// For ONCE or UNSPECIFIED, jump far ahead to end the loop
		return current.AddDate(100, 0, 0)
	}
}
