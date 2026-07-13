package service

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"connectrpc.com/connect"
	pfinancev1 "github.com/castlemilk/pfinance/backend/gen/pfinance/v1"
	"github.com/castlemilk/pfinance/backend/internal/auth"
)

// requireProWithFallback checks Pro tier from context (token claims), falling back
// to a store lookup if token claims are stale (e.g., issued before subscription was set).
func (s *FinanceService) requireProWithFallback(ctx context.Context, claims *auth.UserClaims) error {
	if err := auth.RequireProTier(ctx); err != nil {
		// Token claims may be stale; check store as fallback
		user, userErr := s.store.GetUser(ctx, claims.UID)
		if userErr == nil && user != nil &&
			user.SubscriptionTier == pfinancev1.SubscriptionTier_SUBSCRIPTION_TIER_PRO &&
			(user.SubscriptionStatus == pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_ACTIVE ||
				user.SubscriptionStatus == pfinancev1.SubscriptionStatus_SUBSCRIPTION_STATUS_TRIALING) {
			log.Printf("[Auth] User %s has Pro in store but stale token claims — allowing access", claims.UID)
			return nil
		}
		return err
	}
	return nil
}

// effectiveDollars returns the effective amount in dollars, preferring the cents field when available.
func effectiveDollars(amountCents int64, amountDollars float64) float64 {
	if amountCents != 0 {
		return float64(amountCents) / 100.0
	}
	return amountDollars
}

type analyticsPeriodInfo struct {
	start time.Time
	end   time.Time
	label string
}

func buildTrendPeriods(anchor time.Time, granularity pfinancev1.Granularity, periods int32) []analyticsPeriodInfo {
	periodInfos := make([]analyticsPeriodInfo, periods)
	for i := int32(0); i < periods; i++ {
		offset := periods - 1 - i
		var ps, pe time.Time
		var label string
		switch granularity {
		case pfinancev1.Granularity_GRANULARITY_DAY:
			ps = time.Date(anchor.Year(), anchor.Month(), anchor.Day(), 0, 0, 0, 0, anchor.Location()).AddDate(0, 0, -int(offset))
			pe = ps.Add(24*time.Hour - time.Second)
			label = ps.Format("2006-01-02")
		case pfinancev1.Granularity_GRANULARITY_WEEK:
			weekStart := time.Date(anchor.Year(), anchor.Month(), anchor.Day(), 0, 0, 0, 0, anchor.Location())
			weekStart = weekStart.AddDate(0, 0, -int(weekStart.Weekday()))
			ps = weekStart.AddDate(0, 0, -int(offset)*7)
			pe = ps.AddDate(0, 0, 6)
			pe = time.Date(pe.Year(), pe.Month(), pe.Day(), 23, 59, 59, 0, pe.Location())
			label = ps.Format("Jan 02")
		default:
			ps = time.Date(anchor.Year(), anchor.Month(), 1, 0, 0, 0, 0, anchor.Location()).AddDate(0, -int(offset), 0)
			pe = ps.AddDate(0, 1, -1)
			pe = time.Date(pe.Year(), pe.Month(), pe.Day(), 23, 59, 59, 0, pe.Location())
			label = ps.Format("Jan 2006")
		}
		periodInfos[i] = analyticsPeriodInfo{start: ps, end: pe, label: label}
	}
	return periodInfos
}

func categoryComparisonBounds(anchor time.Time, period string) (currentStart, currentEnd, prevStart, prevEnd time.Time) {
	switch period {
	case "week":
		daysFromSunday := int(anchor.Weekday())
		currentStart = time.Date(anchor.Year(), anchor.Month(), anchor.Day(), 0, 0, 0, 0, anchor.Location()).AddDate(0, 0, -daysFromSunday)
		currentEnd = currentStart.AddDate(0, 0, 6)
		currentEnd = time.Date(currentEnd.Year(), currentEnd.Month(), currentEnd.Day(), 23, 59, 59, 0, currentEnd.Location())
		prevStart = currentStart.AddDate(0, 0, -7)
		prevEnd = currentStart.AddDate(0, 0, -1)
		prevEnd = time.Date(prevEnd.Year(), prevEnd.Month(), prevEnd.Day(), 23, 59, 59, 0, prevEnd.Location())
	case "quarter":
		month := anchor.Month()
		quarterStartMonth := time.Month(((int(month)-1)/3)*3 + 1)
		currentStart = time.Date(anchor.Year(), quarterStartMonth, 1, 0, 0, 0, 0, anchor.Location())
		currentEnd = currentStart.AddDate(0, 3, -1)
		currentEnd = time.Date(currentEnd.Year(), currentEnd.Month(), currentEnd.Day(), 23, 59, 59, 0, currentEnd.Location())
		prevStart = currentStart.AddDate(0, -3, 0)
		prevEnd = currentStart.AddDate(0, 0, -1)
		prevEnd = time.Date(prevEnd.Year(), prevEnd.Month(), prevEnd.Day(), 23, 59, 59, 0, prevEnd.Location())
	case "year":
		currentStart = time.Date(anchor.Year(), time.January, 1, 0, 0, 0, 0, anchor.Location())
		currentEnd = time.Date(anchor.Year(), time.December, 31, 23, 59, 59, 0, anchor.Location())
		prevStart = time.Date(anchor.Year()-1, time.January, 1, 0, 0, 0, 0, anchor.Location())
		prevEnd = time.Date(anchor.Year()-1, time.December, 31, 23, 59, 59, 0, anchor.Location())
	default: // "month"
		currentStart = time.Date(anchor.Year(), anchor.Month(), 1, 0, 0, 0, 0, anchor.Location())
		currentEnd = currentStart.AddDate(0, 1, -1)
		currentEnd = time.Date(currentEnd.Year(), currentEnd.Month(), currentEnd.Day(), 23, 59, 59, 0, currentEnd.Location())
		prevStart = currentStart.AddDate(0, -1, 0)
		prevEnd = currentStart.AddDate(0, 0, -1)
		prevEnd = time.Date(prevEnd.Year(), prevEnd.Month(), prevEnd.Day(), 23, 59, 59, 0, prevEnd.Location())
	}
	return currentStart, currentEnd, prevStart, prevEnd
}

func latestExpenseDate(expenses []*pfinancev1.Expense, category pfinancev1.ExpenseCategory) (time.Time, bool) {
	var latest time.Time
	found := false
	for _, expense := range expenses {
		if expense.Date == nil {
			continue
		}
		if category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED && expense.Category != category {
			continue
		}
		date := expense.Date.AsTime()
		if !found || date.After(latest) {
			latest = date
			found = true
		}
	}
	return latest, found
}

func latestIncomeDate(incomes []*pfinancev1.Income) (time.Time, bool) {
	var latest time.Time
	found := false
	for _, income := range incomes {
		if income.Date == nil {
			continue
		}
		date := income.Date.AsTime()
		if !found || date.After(latest) {
			latest = date
			found = true
		}
	}
	return latest, found
}

func hasExpenseForCategory(expenses []*pfinancev1.Expense, category pfinancev1.ExpenseCategory) bool {
	_, ok := latestExpenseDate(expenses, category)
	return ok
}

// ============================================================================
// Analytics Handlers
// ============================================================================

// GetDailyAggregates returns daily spending aggregates for a date range.
func (s *FinanceService) GetDailyAggregates(ctx context.Context, req *connect.Request[pfinancev1.GetDailyAggregatesRequest]) (*connect.Response[pfinancev1.GetDailyAggregatesResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	scope, err := s.resolveAnalyticsScope(ctx, claims, req.Msg.UserId, req.Msg.GroupId)
	if err != nil {
		return nil, err
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

	aggregates, err := s.store.GetDailyAggregates(ctx, scope.userID, scope.groupID, startDate, endDate)
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
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	scope, err := s.resolveAnalyticsScope(ctx, claims, req.Msg.UserId, req.Msg.GroupId)
	if err != nil {
		return nil, err
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

	periodInfos := buildTrendPeriods(time.Now(), granularity, periods)

	// Single fetch for the entire date range (oldest start → newest end) instead of N+1 queries
	overallStart := periodInfos[0].start
	overallEnd := periodInfos[len(periodInfos)-1].end
	allExpenses, _, err := s.store.ListExpenses(ctx, scope.userID, scope.groupID, &overallStart, &overallEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}
	allIncomes, _, err := s.store.ListIncomes(ctx, scope.userID, scope.groupID, &overallStart, &overallEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list incomes", err)
	}

	hasCurrentWindowData := hasExpenseForCategory(allExpenses, req.Msg.Category) || len(allIncomes) > 0
	if req.Msg.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
		hasCurrentWindowData = hasExpenseForCategory(allExpenses, req.Msg.Category)
	}
	if !hasCurrentWindowData {
		historicalExpenses, _, err := s.store.ListExpenses(ctx, scope.userID, scope.groupID, nil, nil, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list historical expenses", err)
		}
		historicalIncomes, _, err := s.store.ListIncomes(ctx, scope.userID, scope.groupID, nil, nil, 10000, "")
		if err != nil {
			return nil, auth.WrapStoreError("list historical incomes", err)
		}

		anchor, hasAnchor := latestExpenseDate(historicalExpenses, req.Msg.Category)
		if req.Msg.Category == pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED {
			if incomeAnchor, ok := latestIncomeDate(historicalIncomes); ok && (!hasAnchor || incomeAnchor.After(anchor)) {
				anchor = incomeAnchor
				hasAnchor = true
			}
		}

		if hasAnchor {
			periodInfos = buildTrendPeriods(anchor, granularity, periods)
			overallStart = periodInfos[0].start
			overallEnd = periodInfos[len(periodInfos)-1].end
			allExpenses, _, err = s.store.ListExpenses(ctx, scope.userID, scope.groupID, &overallStart, &overallEnd, 10000, "")
			if err != nil {
				return nil, auth.WrapStoreError("list anchored expenses", err)
			}
			allIncomes, _, err = s.store.ListIncomes(ctx, scope.userID, scope.groupID, &overallStart, &overallEnd, 10000, "")
			if err != nil {
				return nil, auth.WrapStoreError("list anchored incomes", err)
			}
		}
	}

	// In-memory bucketing by period
	expenseSeries := make([]*pfinancev1.TimeSeriesDataPoint, periods)
	incomeSeries := make([]*pfinancev1.TimeSeriesDataPoint, periods)
	expenseTotals := make([]float64, periods)
	incomeTotals := make([]float64, periods)

	for _, e := range allExpenses {
		if req.Msg.Category != pfinancev1.ExpenseCategory_EXPENSE_CATEGORY_UNSPECIFIED && e.Category != req.Msg.Category {
			continue
		}
		if e.Date == nil {
			continue
		}
		t := e.Date.AsTime()
		for i, pi := range periodInfos {
			if !t.Before(pi.start) && !t.After(pi.end) {
				expenseTotals[i] += effectiveDollars(e.AmountCents, e.Amount)
				break
			}
		}
	}

	for _, inc := range allIncomes {
		if inc.Date == nil {
			continue
		}
		t := inc.Date.AsTime()
		for i, pi := range periodInfos {
			if !t.Before(pi.start) && !t.After(pi.end) {
				incomeTotals[i] += effectiveDollars(inc.AmountCents, inc.Amount)
				break
			}
		}
	}

	for i, pi := range periodInfos {
		expenseSeries[i] = &pfinancev1.TimeSeriesDataPoint{
			Date:       pi.start.Format("2006-01-02"),
			Value:      expenseTotals[i],
			ValueCents: int64(expenseTotals[i] * 100),
			Label:      pi.label,
		}
		incomeSeries[i] = &pfinancev1.TimeSeriesDataPoint{
			Date:       pi.start.Format("2006-01-02"),
			Value:      incomeTotals[i],
			ValueCents: int64(incomeTotals[i] * 100),
			Label:      pi.label,
		}
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

// GetCashFlowForecast forecasts future cash flow using historical data and recurring transactions.
func (s *FinanceService) GetCashFlowForecast(ctx context.Context, req *connect.Request[pfinancev1.GetCashFlowForecastRequest]) (*connect.Response[pfinancev1.GetCashFlowForecastResponse], error) {
	claims, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.requireProWithFallback(ctx, claims); err != nil {
		return nil, err
	}

	scope, err := s.resolveAnalyticsScope(ctx, claims, req.Msg.UserId, req.Msg.GroupId)
	if err != nil {
		return nil, err
	}

	forecastDays := req.Msg.ForecastDays
	if forecastDays <= 0 {
		forecastDays = 30
	}

	now := time.Now()
	historyStart := now.AddDate(0, 0, -90)
	historyEnd := now

	// Fetch historical expenses and incomes
	expenses, _, err := s.store.ListExpenses(ctx, scope.userID, scope.groupID, &historyStart, &historyEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list expenses", err)
	}
	incomes, _, err := s.store.ListIncomes(ctx, scope.userID, scope.groupID, &historyStart, &historyEnd, 10000, "")
	if err != nil {
		return nil, auth.WrapStoreError("list incomes", err)
	}

	// Group by day for history
	expenseByDay := make(map[string]float64)
	incomeByDay := make(map[string]float64)

	for _, e := range expenses {
		if e.Date != nil {
			day := e.Date.AsTime().Format("2006-01-02")
			expenseByDay[day] += effectiveDollars(e.AmountCents, e.Amount)
		}
	}
	for _, inc := range incomes {
		if inc.Date != nil {
			day := inc.Date.AsTime().Format("2006-01-02")
			incomeByDay[day] += effectiveDollars(inc.AmountCents, inc.Amount)
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
	recurringTxns, _, err := s.store.ListRecurringTransactions(ctx, scope.userID, scope.groupID,
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
				rtAmt := effectiveDollars(rt.AmountCents, rt.Amount)
				if rt.IsExpense {
					recurringExpenseByDay[dayStr] += rtAmt
				} else {
					recurringIncomeByDay[dayStr] += rtAmt
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
