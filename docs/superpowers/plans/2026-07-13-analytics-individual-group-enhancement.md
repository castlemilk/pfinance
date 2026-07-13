# Individual and Group Analytics Enhancement Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a decision-first, scope-safe analytics workspace for individuals and groups, close the audited analytics correctness gaps, and ship a polished responsive and accessible UI.

**Architecture:** Add exact protobuf contracts for an authoritative overview and richer category/anomaly status, then enforce personal or verified-group scope in the Go service. Build a shared React `AnalyticsWorkspace` whose routes provide an explicit discriminated scope, whose hooks propagate that scope, and whose focused views consume the existing visx charts plus accessible summaries. Preserve the current shadcn/Radix, Tailwind, Lucide, visx, theme, and subscription systems.

**Tech Stack:** Go 1.25, Connect-RPC, protobuf, Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, shadcn/Radix, visx, Jest/RTL, Playwright.

**Required skills during execution:** `@protobuf-workflow`, `@go-backend`, `@nextjs-frontend`, `@make-interfaces-feel-better`, `@design-taste-frontend` for applicable redesign checks only, `@superpowers:test-driven-development`, and `@superpowers:verification-before-completion`.

**Workspace note:** Execute in the current workspace rather than a fresh worktree because the authoritative analytics page, subscription gate, proto files, generated files, E2E spec, and adjacent routes already contain user-owned uncommitted changes. Immediately before Task 1, record the post-plan commit with `rtk git rev-parse HEAD > /tmp/pfinance-analytics-base-commit` and capture `rtk git status --short > /tmp/pfinance-analytics-baseline-status.txt`. For every file marked dirty in that baseline, never use whole-file `rtk git add`; stage only implementation-owned hunks with `rtk git add -p`, then inspect `rtk git diff --cached --name-only`, `rtk git diff --cached`, and `rtk git diff --cached --check` before committing. If a generated or overlapping hunk cannot be separated safely, leave it uncommitted and report it rather than staging user work. New/clean files may use exact-path `rtk git add`. Never format, stage, or rewrite unrelated CDR/open-banking files. Keep backend port 8111 and frontend port 1234 unchanged.

---

## File Responsibility Map

### Backend contracts and services

- `proto/pfinance/v1/types.proto`: analytics enums and reusable response value types only.
- `proto/pfinance/v1/finance_service.proto`: RPC declarations and request/response messages.
- `backend/internal/service/analytics_scope.go`: one helper that resolves authenticated personal or verified group scope.
- `backend/internal/service/analytics_period.go`: UTC month/quarter/year bounds only.
- `backend/internal/service/analytics_pagination.go`: page-token-safe complete scoped expense/income loading shared by analytics handlers and group summary.
- `backend/internal/service/analytics_budget.go`: category comparison and budget normalisation.
- `backend/internal/service/analytics_anomaly.go`: anomaly detection, deduplication, coverage, and expected ranges.
- `backend/internal/service/analytics_waterfall.go`: personal and group money-flow construction.
- `backend/internal/service/analytics_overview.go`: `GetAnalyticsOverview` handler and overview aggregation only.
- `backend/internal/service/analytics_service.go`: existing daily aggregate, trend, and forecast handlers.
- Focused `*_test.go` files mirror those responsibilities instead of further growing `analytics_service_test.go`.

### Frontend data and formatting

- `web/src/app/components/analytics/types.ts`: `AnalyticsScope`, `AnalyticsPeriod`, and mapped view models.
- `web/src/app/components/analytics/periods.ts`: the exact global-period-to-view mapping.
- `web/src/app/components/analytics/formatting.ts`: formatter creation from personal tax country with `en-AU`/AUD fallback.
- `web/src/app/metrics/hooks/useAnalyticsOverview.ts`: overview RPC mapping.
- `web/src/app/metrics/hooks/useAnalyticsData.ts`: existing deep-view hooks made scope-aware and stale-response-safe.

### Frontend workspace

- `web/src/app/components/analytics/AnalyticsWorkspaceShell.tsx`: presentational scope header, period, active view navigation, and content slot.
- `web/src/app/components/analytics/AnalyticsWorkspace.tsx`: subscription gate and composition of completed analytics views.
- `web/src/app/components/analytics/AnalyticsViewNav.tsx`: responsive view navigation.
- `web/src/app/components/analytics/AnalyticsStates.tsx`: loading, empty, insufficient, error, and locked presentation.
- `web/src/app/components/analytics/AnalyticsMetricStrip.tsx`: compact overview metrics.
- `web/src/app/components/analytics/AccessibleDataSummary.tsx`: reusable keyboard and screen-reader data alternative.
- `web/src/app/metrics/hooks/useGroupAnalyticsSummary.ts`: bounded group summary mapping with stale-response protection.
- `web/src/app/components/analytics/views/*.tsx`: one file per Overview, Spending, Categories, Attention, Forecast, and Data Quality view.
- Personal and shared route files construct scope only; they do not fetch analytics data themselves.

### Integration and validation

- Sidebar and command-palette files expose shared analytics.
- Expense routes parse the documented analytics query contract.
- Existing chart files change only when the chart itself owns the audited defect.
- Unit tests live beside the new hooks/components; Playwright covers complete personal and group journeys.

---

## Chunk 1: Contracts and Backend Correctness

### Task 1: Centralise analytics scope enforcement

**Files:**
- Create: `backend/internal/service/analytics_scope.go`
- Create: `backend/internal/service/analytics_scope_test.go`
- Create: `backend/internal/service/analytics_scope_handlers_test.go`
- Modify: `backend/internal/service/analytics_service.go`

- [ ] **Step 1: Write failing scope tests**

Cover personal requests with an empty ID, personal requests with a forged ID, verified group membership, missing group, and non-member denial. The core assertion is that personal scope always returns the claims UID:

```go
claims := &auth.UserClaims{UID: "owner"}
scope, err := service.resolveAnalyticsScope(context.Background(), claims, "victim", "")
require.NoError(t, err)
assert.Equal(t, "owner", scope.userID)
assert.Empty(t, scope.groupID)
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run: `cd backend && rtk go test ./internal/service -run TestResolveAnalyticsScope -count=1`

Expected: FAIL because `resolveAnalyticsScope` does not exist.

- [ ] **Step 3: Implement the scope helper**

Create a small value type and helper:

```go
type analyticsScope struct {
    userID  string
    groupID string
}

func (s *FinanceService) resolveAnalyticsScope(
    ctx context.Context,
    claims *auth.UserClaims,
    requestedUserID string,
    groupID string,
) (analyticsScope, error) {
    if groupID == "" {
        return analyticsScope{userID: claims.UID}, nil
    }
    group, err := s.store.GetGroup(ctx, groupID)
    if err != nil {
        return analyticsScope{}, auth.WrapStoreError("get group", err)
    }
    if !auth.IsGroupMember(claims.UID, group) {
        return analyticsScope{}, connect.NewError(connect.CodePermissionDenied, errors.New("user is not a member of this group"))
    }
    return analyticsScope{groupID: groupID}, nil
}
```

Keep the ignored `requestedUserID` argument until all callers and generated requests remain wire-compatible; document why it is ignored.

- [ ] **Step 4: Write handler-level empty-user, forged-user, and group-access tests before changing handlers**

Create named subtests for `GetDailyAggregates`, `GetSpendingTrends`, `GetCategoryComparison`, `DetectAnomalies`, `GetCashFlowForecast`, and `GetWaterfallData`. For every handler, one personal subtest sends `UserId: ""` and one sends `UserId: "victim"`; both authenticate as `owner` and set store expectations only for `owner`. Each group pair authenticates a member and non-member against the same group. Use this table shape, with a focused fixture function per RPC so request construction remains type-safe:

```go
tests := []struct {
    name string
    call func(t *testing.T, svc *FinanceService, ctx context.Context)
}{
    {name: "daily aggregates", call: callDailyAggregatesWithForgedUser},
    {name: "spending trends", call: callSpendingTrendsWithForgedUser},
    {name: "category comparison", call: callCategoryComparisonWithForgedUser},
    {name: "anomalies", call: callDetectAnomaliesWithForgedUser},
    {name: "forecast", call: callCashFlowForecastWithForgedUser},
    {name: "waterfall", call: callWaterfallWithForgedUser},
}
```

- [ ] **Step 5: Run handler security tests and confirm the forged-ID failure**

Run: `cd backend && rtk go test ./internal/service -run TestAnalyticsHandlersEnforceScope -count=1`

Expected: FAIL because at least one existing handler queries with `victim` or does not share the helper.

- [ ] **Step 6: Migrate `GetDailyAggregates` and rerun only its subtests**

Resolve scope immediately after auth/Pro checks, delete the inline group-membership block, and pass only `scope.userID` and `scope.groupID` to `GetDailyAggregates`.

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsHandlersEnforceScope/daily_aggregates' -count=1`

Expected: PASS.

- [ ] **Step 7: Migrate `GetSpendingTrends` and rerun only its subtests**

Replace every current, historical, and anchored expense/income query with resolved scope values.

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsHandlersEnforceScope/spending_trends' -count=1`

Expected: PASS.

- [ ] **Step 8: Migrate `GetCategoryComparison` and rerun only its subtests**

Replace current, previous, historical, and budget queries with resolved scope values.

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsHandlersEnforceScope/category_comparison' -count=1`

Expected: PASS.

- [ ] **Step 9: Migrate `DetectAnomalies` and rerun only its subtests**

Replace lookback and history queries with resolved scope values.

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsHandlersEnforceScope/anomalies' -count=1`

Expected: PASS.

- [ ] **Step 10: Migrate `GetCashFlowForecast` and rerun only its subtests**

Replace history and recurring-transaction queries with resolved scope values.

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsHandlersEnforceScope/forecast' -count=1`

Expected: PASS.

- [ ] **Step 11: Migrate `GetWaterfallData` and rerun only its subtests**

Replace income, expense, and tax-config calls with resolved scope values. Do not change group tax semantics until Task 4.

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsHandlersEnforceScope/waterfall' -count=1`

Expected: PASS.

- [ ] **Step 12: Run all scope and analytics regressions**

Run: `cd backend && rtk go test ./internal/service -run 'TestResolveAnalyticsScope|TestAnalyticsHandlersEnforceScope|TestAnalytics' -count=1`

Expected: PASS and no store expectation using the forged personal UID.

- [ ] **Step 13: Commit only scope files**

```bash
rtk git add backend/internal/service/analytics_scope.go backend/internal/service/analytics_scope_test.go backend/internal/service/analytics_scope_handlers_test.go backend/internal/service/analytics_service.go
rtk git commit -m "fix: enforce authenticated analytics scope"
```

### Task 2: Add exact analytics protobuf contracts

**Files:**
- Modify: `proto/pfinance/v1/types.proto`
- Modify: `proto/pfinance/v1/finance_service.proto`
- Generated: `backend/gen/pfinance/v1/*.go`
- Generated: `backend/gen/pfinance/v1/pfinancev1connect/finance_service.connect.go`
- Generated: `web/src/gen/pfinance/v1/*.ts`

- [ ] **Step 1: Add the exact reusable analytics types**

Append these unused-number additions to `types.proto` without renumbering existing fields:

```proto
enum AnalyticsPeriod {
  ANALYTICS_PERIOD_UNSPECIFIED = 0;
  ANALYTICS_PERIOD_MONTH = 1;
  ANALYTICS_PERIOD_QUARTER = 2;
  ANALYTICS_PERIOD_YEAR = 3;
}

message CombinedBudgetComparison {
  string budget_id = 1;
  string name = 2;
  repeated ExpenseCategory categories = 3;
  int64 allowance_cents = 4;
  int64 current_spend_cents = 5;
}

message AnomalyCategoryCoverage {
  ExpenseCategory category = 1;
  int32 sample_count = 2;
  bool has_sufficient_history = 3;
}
```

Add fields 13-15 to `SpendingAnomaly`:

```proto
int64 expected_lower_cents = 13;
int64 expected_upper_cents = 14;
bool has_expected_range = 15;
```

- [ ] **Step 2: Add exact overview and extended response contracts**

Add to `finance_service.proto`:

```proto
message GetAnalyticsOverviewRequest {
  string user_id = 1;
  string group_id = 2;
  AnalyticsPeriod period = 3;
}

message GetAnalyticsOverviewResponse {
  google.protobuf.Timestamp current_start = 1;
  google.protobuf.Timestamp current_end = 2;
  google.protobuf.Timestamp previous_start = 3;
  google.protobuf.Timestamp previous_end = 4;
  int64 current_income_cents = 5;
  int64 current_expense_cents = 6;
  int64 current_net_cents = 7;
  int64 previous_income_cents = 8;
  int64 previous_expense_cents = 9;
  int64 previous_net_cents = 10;
  double savings_rate_percent = 11;
  bool has_savings_rate = 12;
  double income_change_percent = 13;
  bool has_income_change = 14;
  double expense_change_percent = 15;
  bool has_expense_change = 16;
  ExpenseCategory largest_category = 17;
  int64 largest_category_amount_cents = 18;
  int32 current_transaction_count = 19;
  int32 previous_transaction_count = 20;
  bool has_current_data = 21;
}
```

Add `repeated CombinedBudgetComparison combined_budgets = 2;` to `GetCategoryComparisonResponse`. Add fields 6-10 to `DetectAnomaliesResponse`:

```proto
int32 analyzed_expense_count = 6;
int32 eligible_category_count = 7;
int32 minimum_category_sample = 8;
bool has_sufficient_history = 9;
repeated AnomalyCategoryCoverage category_coverage = 10;
```

- [ ] **Step 3: Add `GetAnalyticsOverview` to `FinanceService`**

Place `rpc GetAnalyticsOverview(GetAnalyticsOverviewRequest) returns (GetAnalyticsOverviewResponse);` with the other Pro analytics methods. Preserve all existing field numbers.

- [ ] **Step 4: Generate all protobuf outputs**

Run: `rtk make proto`

Expected: buf/protoc succeeds; Go and TypeScript generated files contain `getAnalyticsOverview`, `AnalyticsPeriod`, combined budgets, and anomaly coverage fields.

- [ ] **Step 5: Verify generated contract presence**

Run: `rtk rg -n 'GetAnalyticsOverview|AnalyticsPeriod|CombinedBudgetComparison|AnomalyCategoryCoverage' backend/gen web/src/gen`

Expected: matches in both backend and web generated trees.

- [ ] **Step 6: Run protobuf and type baselines**

Run: `cd proto && rtk buf lint && cd ../backend && rtk go test ./gen/... && cd ../web && rtk npm run type-check`

Expected: PASS. If current user-owned generated changes expose unrelated errors, record them separately and do not rewrite unrelated contracts.

- [ ] **Step 7: Commit contract and generated files explicitly**

Stage the exact contract files plus generated files under only these pfinance directories:

```bash
rtk git add proto/pfinance/v1/types.proto proto/pfinance/v1/finance_service.proto backend/gen/pfinance/v1 web/src/gen/pfinance/v1
rtk git commit -m "feat: define scoped analytics overview contracts"
```

### Task 3: Implement deterministic period and overview aggregation

**Files:**
- Create: `backend/internal/service/analytics_period.go`
- Create: `backend/internal/service/analytics_period_test.go`
- Create: `backend/internal/service/analytics_pagination.go`
- Create: `backend/internal/service/analytics_pagination_test.go`
- Create: `backend/internal/service/analytics_overview.go`
- Create: `backend/internal/service/analytics_overview_test.go`

- [ ] **Step 1: Write failing UTC period-bound and money-helper tests**

Use a fixed timestamp and cover month, quarter, year, unspecified-to-month, previous equal elapsed duration, previous-period end cap, and leap year.

```go
now := time.Date(2026, 7, 13, 10, 30, 0, 0, time.UTC)
bounds := analyticsPeriodBounds(now, pfinancev1.AnalyticsPeriod_ANALYTICS_PERIOD_MONTH)
assert.Equal(t, time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC), bounds.currentStart)
assert.Equal(t, now, bounds.currentEnd)
assert.Equal(t, time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC), bounds.previousStart)
assert.Equal(t, time.Date(2026, 6, 13, 10, 30, 0, 0, time.UTC), bounds.previousEnd)
```

In the same focused file, add RED cases proving non-zero cents override legacy doubles, zero cents round legacy doubles with `math.Round`, `percentageChange` is unavailable when previous is zero, and `savingsRate` is unavailable when income is zero.

- [ ] **Step 2: Run period tests and confirm failure**

Run: `cd backend && rtk go test ./internal/service -run TestAnalyticsPeriodBounds -count=1`

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement the exact UTC bounds and cents helpers**

Use these signatures so calculation is independently testable:

```go
type analyticsBounds struct {
    currentStart, currentEnd   time.Time
    previousStart, previousEnd time.Time
}

func analyticsPeriodBounds(now time.Time, period pfinancev1.AnalyticsPeriod) analyticsBounds
func expenseCents(expense *pfinancev1.Expense) int64
func incomeCents(income *pfinancev1.Income) int64
func percentageChange(current, previous int64) (value float64, available bool)
func savingsRate(income, expenses int64) (value float64, available bool)
```

Convert `now` to UTC. For legacy doubles use `int64(math.Round(amount * 100))`. Treat unspecified period as month. Calculate the previous interval by applying the current elapsed duration to the previous calendar start and cap it at the previous calendar end.

- [ ] **Step 4: Write failing complete-pagination tests before overview**

Mock two expense pages, two income pages, an empty final token, and a repeated-token response. Assert ordered concatenation, no dropped page, and `connect.CodeInternal` for a repeated token.

- [ ] **Step 5: Run pagination tests and confirm failure**

Run: `cd backend && rtk go test ./internal/service -run TestListAllAnalytics -count=1`

Expected: FAIL because complete loaders do not exist.

- [ ] **Step 6: Implement shared complete loaders**

Use page size 1,000 and these signatures:

```go
func (s *FinanceService) listAllAnalyticsExpenses(ctx context.Context, scope analyticsScope, start, end *time.Time) ([]*pfinancev1.Expense, error)
func (s *FinanceService) listAllAnalyticsIncomes(ctx context.Context, scope analyticsScope, start, end *time.Time) ([]*pfinancev1.Income, error)
```

Track every non-empty next token in a `map[string]struct{}`. If the store returns a token already seen, return `connect.CodeInternal` with `pagination token repeated`. These loaders are the only full-history path used by overview, merchant novelty, and group summary.

- [ ] **Step 7: Run pagination tests and confirm pass**

Run: `cd backend && rtk go test ./internal/service -run TestListAllAnalytics -count=1`

Expected: PASS.

- [ ] **Step 8: Write failing overview handler tests**

Cover personal scope with both empty and forged `user_id`, group member, non-member, zero previous values, zero income, largest category, cents preference, Pro gate, multiple store pages, store errors, and returned timestamps. Assert current and previous transaction counts independently. Add empty-current cases for no expenses, no income, and neither, proving `has_current_data=false` only when neither current collection contains a transaction and that zero-amount but present transactions still count as current data. Invoke an internal fixed-clock seam:

```go
resp, err := svc.getAnalyticsOverviewAt(ctx, req, time.Date(2026, 7, 13, 10, 30, 0, 0, time.UTC))
```

- [ ] **Step 9: Run overview tests and confirm failure**

Run: `cd backend && rtk go test ./internal/service -run TestGetAnalyticsOverview -count=1`

Expected: FAIL because the handler is not implemented.

- [ ] **Step 10: Implement `GetAnalyticsOverview`**

The public handler calls `getAnalyticsOverviewAt(ctx, req, time.Now().UTC())`. The internal method requires auth and Pro, resolves scope once, calls the complete loaders for current and previous bounds, sums cents, calculates `net = income - expense`, selects the largest category with stable enum-order tie-breaking, maps explicit presence booleans, and returns the exact bounds used.

- [ ] **Step 11: Run focused and package tests**

Run: `cd backend && rtk go test ./internal/service -run 'TestAnalyticsPeriodBounds|TestGetAnalyticsOverview' -count=1 && rtk go test ./internal/service -count=1`

Expected: PASS.

- [ ] **Step 12: Commit overview files**

```bash
rtk git add backend/internal/service/analytics_period.go backend/internal/service/analytics_period_test.go backend/internal/service/analytics_pagination.go backend/internal/service/analytics_pagination_test.go backend/internal/service/analytics_overview.go backend/internal/service/analytics_overview_test.go
rtk git commit -m "feat: add authoritative analytics overview"
```

### Task 4: Correct budgets, anomalies, group summary, and group money flow

**Files:**
- Modify: `backend/internal/service/analytics_service.go`
- Create: `backend/internal/service/analytics_budget.go`
- Create: `backend/internal/service/analytics_budget_test.go`
- Create: `backend/internal/service/analytics_anomaly.go`
- Create: `backend/internal/service/analytics_anomaly_test.go`
- Create: `backend/internal/service/analytics_waterfall.go`
- Create: `backend/internal/service/analytics_group_test.go`
- Modify: `backend/internal/service/finance_service.go`
- Modify: `backend/internal/service/finance_service_test.go`

- [ ] **Step 1: Write failing budget normalisation tests**

Cover weekly, fortnightly, monthly, quarterly, yearly, unspecified-to-month, multiple single-category budgets, and combined budgets excluded from axes but present once in `combined_budgets`. Add `include_budgets=false` with active single- and multi-category budgets and assert every category budget is zero while `combined_budgets` is empty.

- [ ] **Step 2: Run budget tests and confirm the current maths fails**

Run: `cd backend && rtk go test ./internal/service -run TestCategoryComparisonBudget -count=1`

Expected: FAIL on period conversion and multi-category duplication.

- [ ] **Step 3: Move category comparison into `analytics_budget.go` and implement exact budget helpers**

Remove the old method from `analytics_service.go` after moving it unchanged, then add:

```go
func budgetPeriodsPerYear(period pfinancev1.BudgetPeriod) int64
func analyticsPeriodsPerYear(period string) int64
func normaliseBudgetCents(amountCents int64, source pfinancev1.BudgetPeriod, target string) int64
```

Use 52, 26, 12, 4, and 1 for weekly through yearly; unspecified is 12. Calculate `math.Round(float64(amountCents*sourcePeriods) / float64(targetPeriods))`. Prefer `AmountCents`, falling back to `math.Round(Amount*100)`. Sum only active single-category budgets into category axes. Deduplicate category IDs in a combined budget, sum current expenses once per matching category, sort combined budget output by name then ID, and return combined budgets only when `include_budgets=true`.

- [ ] **Step 4: Run budget tests and confirm pass before anomaly work**

Run: `cd backend && rtk go test ./internal/service -run TestCategoryComparisonBudget -count=1`

Expected: PASS.

- [ ] **Step 5: Write failing anomaly coverage and deduplication tests**

Cover one expense matching amount and new-merchant reasons, expected range presence, non-amount range absence, full-history merchant lookup, category coverage counts, and partially sufficient categories.

- [ ] **Step 6: Run anomaly tests and confirm failure**

Run: `cd backend && rtk go test ./internal/service -run TestDetectAnomalies -count=1`

Expected: FAIL on duplicate totals or missing coverage fields.

- [ ] **Step 7: Move anomaly handling into `analytics_anomaly.go` and implement exact deduplication**

Remove the old method from `analytics_service.go` after moving it. Use `listAllAnalyticsExpenses` for both lookback and full-history merchant queries. Build `map[string]*SpendingAnomaly` keyed by expense ID. When reasons collide, retain the higher severity, breaking ties in this order: amount outlier, category spike, unusual timing, new merchant. Add cents to the total only on first insertion. For amount outliers set cents bounds from mean plus or minus threshold times standard deviation and clamp the lower bound to zero; all other reasons set `HasExpectedRange=false`. Emit coverage for every present category in enum order with `SampleCount` and a ten-sample sufficiency threshold. Set `AnalyzedExpenseCount` to the lookback expense count, `EligibleCategoryCount` to the number of sufficient categories, `MinimumCategorySample` to 10, and `HasSufficientHistory` to `EligibleCategoryCount > 0`. Derive `AnomalousSpendTotal` as `float64(AnomalousSpendTotalCents)/100`.

- [ ] **Step 8: Run anomaly tests and confirm pass**

Run: `cd backend && rtk go test ./internal/service -run TestDetectAnomalies -count=1`

Expected: PASS, including multi-page merchant history.

- [ ] **Step 9: Write failing complete-group-summary tests**

Use mock pages containing more than 1,000 total records and a repeated-token fixture. Assert every valid page is counted once, the loop terminates, cents fields are populated, and doubles equal cents divided by 100.

- [ ] **Step 10: Reuse complete analytics loaders in `GetGroupSummary`**

Construct `analyticsScope{groupID: req.Msg.GroupId}` only after the existing membership check, then call `listAllAnalyticsExpenses` and `listAllAnalyticsIncomes` with request bounds. Sum `expenseCents`, `incomeCents`, and allocation cents fallbacks. Populate total, unsettled, `ExpenseBreakdown.AmountCents`, `MemberBalance` cents, and `MemberDebt.AmountCents`; derive every legacy double as `float64(cents)/100`. Reuse the complete expense slice for balances.

- [ ] **Step 11: Run complete-group-summary tests and confirm pass**

Run: `cd backend && rtk go test ./internal/service -run 'TestGetGroupSummary|TestListAllAnalytics' -count=1`

Expected: PASS for two pages and repeated-token termination.

- [ ] **Step 12: Write failing group waterfall tests**

Assert group flow has Income, category, and Remaining entries; has no Tax entry; and never calls `GetTaxConfig`. Preserve personal configured-tax behaviour.

- [ ] **Step 13: Move waterfall handling into `analytics_waterfall.go` and implement scope-specific entries**

Remove the old method from `analytics_service.go` after moving it. Personal scope keeps Gross Income, configured Tax, category expenses, and Net Savings. Group scope emits Group Income, sorted category expenses, and Remaining Group Cash; it never calls `GetTaxConfig`. Use cents for running totals and derive doubles at response construction.

- [ ] **Step 14: Run waterfall tests and confirm pass**

Run: `cd backend && rtk go test ./internal/service -run 'Test.*Waterfall' -count=1`

Expected: PASS for both scopes.

- [ ] **Step 15: Run all backend analytics and group summary tests**

Run: `cd backend && rtk go test ./internal/service -run 'Analytics|CategoryComparison|DetectAnomalies|GroupSummary|Waterfall' -count=1`

Expected: PASS.

- [ ] **Step 16: Commit backend correctness files**

Stage only the exact files listed here:

```bash
rtk git add backend/internal/service/analytics_service.go backend/internal/service/analytics_budget.go backend/internal/service/analytics_budget_test.go backend/internal/service/analytics_anomaly.go backend/internal/service/analytics_anomaly_test.go backend/internal/service/analytics_waterfall.go backend/internal/service/analytics_group_test.go backend/internal/service/finance_service.go backend/internal/service/finance_service_test.go
rtk git commit -m "fix: make analytics financially and group correct"
```

---

## Chunk 2: Scoped Frontend Data and Chart Correctness

### Task 5: Define frontend scope, periods, and formatting

**Files:**
- Create: `web/src/app/components/analytics/types.ts`
- Create: `web/src/app/components/analytics/periods.ts`
- Create: `web/src/app/components/analytics/formatting.ts`
- Create: `web/src/app/components/analytics/links.ts`
- Create: `web/src/app/components/analytics/__tests__/periods.test.ts`
- Create: `web/src/app/components/analytics/__tests__/formatting.test.ts`
- Create: `web/src/app/components/analytics/__tests__/links.test.ts`

- [ ] **Step 1: Write failing period mapping tests**

Assert the exact month, quarter, and year mapping for trends, heatmap, category comparison, anomaly lookback, forecast, and waterfall from the approved spec.

- [ ] **Step 2: Write failing formatter tests**

Cover Australia/AUD, UK/GBP, simple/USD, group viewer country, unknown fallback to `en-AU`/AUD, compact values, and date formatting. The existing utility defaults are not used implicitly: the factory always supplies both locale and currency.

- [ ] **Step 3: Write failing canonical analytics-link tests**

Define canonical slugs exactly as `food`, `housing`, `transportation`, `entertainment`, `healthcare`, `utilities`, `shopping`, `education`, `travel`, and `other`. Test personal and group base paths plus stable query ordering: `date`, `category`, `from`, `to`, `expenseId`. Expected group example: `/shared/expenses?category=food&from=2026-07-01&to=2026-07-13`.

- [ ] **Step 4: Run tests and confirm missing modules**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/periods.test.ts src/app/components/analytics/__tests__/formatting.test.ts src/app/components/analytics/__tests__/links.test.ts`

Expected: FAIL because the modules do not exist.

- [ ] **Step 5: Implement analytics types and the period mapping**

```ts
export type AnalyticsScope =
  | { kind: 'personal' }
  | { kind: 'group'; groupId: string; groupName: string };

export type AnalyticsPeriod = 'month' | 'quarter' | 'year';

export type AnalyticsPeriodConfig = {
  trendGranularity: 'week' | 'month';
  trendPeriods: 8 | 16 | 24;
  heatmapMonths: 3 | 6 | 12;
  categoryPeriod: AnalyticsPeriod;
  anomalyLookbackDays: 90 | 180 | 365;
  forecastDays: 30 | 60 | 90;
  waterfallDays: 30 | 90 | 365;
};

export type AnalyticsCurrencyContext = {
  locale: string;
  currency: string;
  formatMoney: (amount: number, compact?: boolean) => string;
  formatDate: (date: Date | string, options?: Intl.DateTimeFormatOptions) => string;
};

export type AnalyticsViewProps = {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  currency: AnalyticsCurrencyContext;
};

export type PrimaryAnalyticsAttention = {
  expenseId: string;
  description: string;
  reason: string;
  amount: number;
  expectedContext?: string;
  severity: 'low' | 'medium' | 'high';
};

export function scopeGroupId(scope?: AnalyticsScope): string {
  return scope?.kind === 'group' ? scope.groupId : '';
}
```

`periods.ts` exports `ANALYTICS_PERIOD_CONFIG: Record<AnalyticsPeriod, AnalyticsPeriodConfig>`, `getAnalyticsPeriodConfig(period)`, and `analyticsHeatmapRange(period, now)`; the last helper returns UTC `startDate`/`endDate` using the configured 3, 6, or 12 calendar months. Month maps to `week`/8, 3 months, month, 90, 30, 30; quarter maps to `week`/16, 6 months, quarter, 180, 60, 90; year maps to `month`/24, 12 months, year, 365, 90, 365, matching the existing hook literals exactly.

`formatting.ts` exports `createAnalyticsCurrencyContext(country: TaxCountry | null | undefined): AnalyticsCurrencyContext`, importing `TaxCountry` from `@/app/types`.

`links.ts` exports `AnalyticsCategorySlug`, `AnalyticsExpenseFilters = { date?: string; category?: AnalyticsCategorySlug; from?: string; to?: string; expenseId?: string }`, and `buildAnalyticsExpenseUrl(scope: AnalyticsScope, filters: AnalyticsExpenseFilters): string`.

- [ ] **Step 6: Implement the explicit formatter factory**

Use `getCurrencyForCountry` and `formatCurrency`; do not create another country map or embed currency symbols. Map Australia to `en-AU`, UK to `en-GB`, simple to `en-US`, and missing/unknown country to `en-AU` with AUD.

- [ ] **Step 7: Implement the canonical link builder**

`buildAnalyticsExpenseUrl(scope, filters)` owns serialisation. It maps generated enums through the fixed slug record and appends only validated values in the tested order.

- [ ] **Step 8: Run focused tests and type-check**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/periods.test.ts src/app/components/analytics/__tests__/formatting.test.ts src/app/components/analytics/__tests__/links.test.ts && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 9: Commit the pure frontend foundation**

```bash
rtk git add web/src/app/components/analytics/types.ts web/src/app/components/analytics/periods.ts web/src/app/components/analytics/formatting.ts web/src/app/components/analytics/links.ts web/src/app/components/analytics/__tests__/periods.test.ts web/src/app/components/analytics/__tests__/formatting.test.ts web/src/app/components/analytics/__tests__/links.test.ts
rtk git commit -m "feat: define analytics scope and period model"
```

### Task 6: Add overview and scope-aware deep-view hooks

**Files:**
- Create: `web/src/app/metrics/hooks/useAnalyticsOverview.ts`
- Create: `web/src/app/metrics/hooks/__tests__/useAnalyticsOverview.test.ts`
- Create: `web/src/app/metrics/analyticsMappers.ts`
- Create: `web/src/app/metrics/__tests__/analyticsMappers.test.ts`
- Modify: `web/src/app/metrics/types.ts`
- Modify: `web/src/app/metrics/hooks/useAnalyticsData.ts`
- Modify: `web/src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts`
- Modify: `web/src/app/metrics/hooks/index.ts`

- [ ] **Step 1: Write failing pure response-mapper tests**

Define mapped contracts in `metrics/types.ts` and test them without React: category comparison includes `combinedBudgets`; anomaly points include expected lower/upper values and `hasExpectedRange`; anomaly result includes analysed count, eligible count, minimum sample, overall sufficiency, per-category coverage, and a deterministic `primaryAttention: PrimaryAnalyticsAttention | null`; forecast points include `hasBounds`; forecast result includes income/expense history and future arrays. Select primary attention from the highest-severity anomaly, then largest amount, then stable expense ID. Its `expectedContext` is present only when that anomaly has an expected range. Cents override doubles in every mapper.

- [ ] **Step 2: Run mapper tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/metrics/__tests__/analyticsMappers.test.ts`

Expected: FAIL because the mapper module and mapped fields do not exist.

- [ ] **Step 3: Implement the pure response mappers**

Keep all protobuf-to-view conversion in `analyticsMappers.ts`. Set forecast `hasBounds` only when any lower/upper cents or legacy bound is non-zero; net forecast points therefore omit meaningless zero ranges.

- [ ] **Step 4: Run pure mapper tests and confirm they are green**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/metrics/__tests__/analyticsMappers.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing overview hook tests**

Assert the hook returns `{ data, loading, error, refetch }`, explicit scope propagation, cents-first mapping, period enum mapping, presence flags, returned bounds, group ID, a stable `refetch` that retries the current scope/period after failure, and stale response rejection after a period or group switch.

- [ ] **Step 6: Write failing scope tests for every existing hook using exact compatible signatures**

The optional scope is always the final argument:

```ts
useHeatmapData(startDate, endDate, scope?)
useSpendingTrends(granularity, periods, category?, scope?)
useCategorySpendingTrends(granularity, periods, scope?)
useCategoryComparison(includeBudgets, currentPeriod?, scope?)
useAnomalies(lookbackDays, sensitivity, scope?)
useCashFlowForecast(forecastDays, scope?)
useWaterfallData(periodDays, scope?)
```

Use table-driven cases to assert every personal and group request sends `userId: ''`; personal sends `groupId: ''`; group sends the active ID. This preserves the existing `category` third argument on `useSpendingTrends`.

- [ ] **Step 7: Write deferred-promise stale-response tests for all eight hooks**

For overview and each seven deep hooks, start request A, change scope or filter, resolve request B, then resolve or reject A. Assert B data remains, A cannot replace the error, and loading remains false after B completes. Include the raw category-expense path.

- [ ] **Step 8: Run focused hooks and confirm failures**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/metrics/hooks/__tests__/useAnalyticsOverview.test.ts src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts`

Expected: FAIL because overview is missing and existing hooks hardcode empty group IDs.

- [ ] **Step 9: Implement `useAnalyticsOverview` with the pure mapper**

Map `AnalyticsPeriod` to the generated enum, send explicit scope, map cents and presence flags, expose a stable `refetch`, and use a monotonically increasing request ID so stale results cannot commit.

- [ ] **Step 10: Add scope and request sequencing to heatmap, trends, and category-trend hooks**

Use the exact signatures above, one monotonically increasing request ID per hook instance, and the `scopeGroupId(scope)` helper exported by `components/analytics/types.ts`. Preserve each hook's `refetch` contract.

- [ ] **Step 11: Add scope and request sequencing to comparison, anomaly, forecast, and waterfall hooks**

Delegate response conversion to `analyticsMappers.ts`; do not grow `useAnalyticsData.ts` with additional mapping logic.

- [ ] **Step 12: Run mapper, hook, and type tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/metrics/__tests__/analyticsMappers.test.ts src/app/metrics/hooks/__tests__/useAnalyticsOverview.test.ts src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 13: Commit exact hook and mapper files**

```bash
rtk git add web/src/app/metrics/analyticsMappers.ts web/src/app/metrics/__tests__/analyticsMappers.test.ts web/src/app/metrics/types.ts web/src/app/metrics/hooks/useAnalyticsOverview.ts web/src/app/metrics/hooks/useAnalyticsData.ts web/src/app/metrics/hooks/index.ts web/src/app/metrics/hooks/__tests__/useAnalyticsOverview.test.ts web/src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts
rtk git commit -m "feat: make analytics hooks scope aware"
```

### Task 7: Correct trend fitting and forecast history rendering

**Files:**
- Create: `web/src/app/components/charts/analyticsChartMath.ts`
- Create: `web/src/app/components/charts/__tests__/analyticsChartMath.test.ts`
- Modify: `web/src/app/components/charts/SpendingTrendChart.tsx`
- Modify: `web/src/app/components/charts/CashFlowForecast.tsx`
- Create: `web/src/app/components/charts/__tests__/SpendingTrendChart.test.tsx`
- Create: `web/src/app/components/charts/__tests__/CashFlowForecast.test.tsx`

- [ ] **Step 1: Write failing pure regression endpoint tests**

In `analyticsChartMath.test.ts`, provide a non-zero-intercept series and assert `fittedTrendEndpoints(values, slope)` uses `intercept = meanY - slope * meanX`, returns unchanged fitted values, and exposes endpoints that can expand the chart y-domain.

- [ ] **Step 2: Write failing pure forecast-domain tests**

Assert `forecastDomain(history, future)` spans the earliest history and latest future date and includes Today when both sides exist. Bound mapping remains owned by Task 6 mapper tests; rendered range-row suppression remains owned by Step 6 below.

- [ ] **Step 3: Run pure chart-math tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/charts/__tests__/analyticsChartMath.test.ts`

Expected: FAIL because the helpers do not exist.

- [ ] **Step 4: Implement the pure chart math helpers**

Return immutable fitted endpoints and a combined date domain. Do not clamp regression values. The chart y-domain must include observed and fitted endpoint values so the fitted line is never clipped or altered.

- [ ] **Step 5: Run pure chart-math tests and confirm they are green**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/charts/__tests__/analyticsChartMath.test.ts`

Expected: PASS.

- [ ] **Step 6: Write failing rendered-chart formatting and history tests**

Pass spies as `formatMoney` and `formatDate` props. Assert both charts call them for axes/tooltips/summary text, no rendered string assumes `$` or `en-US`, trend endpoints are visible in the SVG domain, forecast history renders before Today, and net points with `hasBounds=false` omit a range.

- [ ] **Step 7: Run rendered chart tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/charts/__tests__/SpendingTrendChart.test.tsx src/app/components/charts/__tests__/CashFlowForecast.test.tsx`

Expected: FAIL because the charts do not accept formatters/history and the regression remains anchored to the first point.

- [ ] **Step 8: Integrate fitted endpoints and explicit formatters into `SpendingTrendChart`**

Add required `formatMoney` and `formatDate` props at the analytics view boundary, with an `en-AU`/AUD fallback only for backward-compatible direct callers. Use the pure endpoints, include them in the y-domain, and expose a plain-language trend summary outside SVG.

- [ ] **Step 9: Integrate history, `hasBounds`, and explicit formatters into `CashFlowForecast`**

Accept separate income/expense history props, include them in the pure date domain, render history before Today, render forecasts after Today, and gate confidence copy on forecast-specific `hasBounds` only.

- [ ] **Step 10: Run chart, mapper, hook, page-regression, and type tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/charts/__tests__/analyticsChartMath.test.ts src/app/components/charts/__tests__/SpendingTrendChart.test.tsx src/app/components/charts/__tests__/CashFlowForecast.test.tsx src/app/metrics/__tests__/analyticsMappers.test.ts src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts 'src/app/(app)/personal/analytics/__tests__/AnalyticsPage.test.tsx' && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 11: Commit exact chart correctness files**

```bash
rtk git add web/src/app/components/charts/analyticsChartMath.ts web/src/app/components/charts/__tests__/analyticsChartMath.test.ts web/src/app/components/charts/SpendingTrendChart.tsx web/src/app/components/charts/CashFlowForecast.tsx web/src/app/components/charts/__tests__/SpendingTrendChart.test.tsx web/src/app/components/charts/__tests__/CashFlowForecast.test.tsx
rtk git commit -m "fix: show truthful analytics trends and forecasts"
```

---

## Chunk 3: Decision-First Workspace and UI

### Task 8: Build presentational workspace primitives and the full state model

**Files:**
- Create: `web/src/app/components/analytics/AnalyticsWorkspaceShell.tsx`
- Create: `web/src/app/components/analytics/AnalyticsViewNav.tsx`
- Create: `web/src/app/components/analytics/AnalyticsStates.tsx`
- Create: `web/src/app/components/analytics/AccessibleDataSummary.tsx`
- Create: `web/src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx`
- Create: `web/src/app/components/analytics/__tests__/AccessibleDataSummary.test.tsx`

- [ ] **Step 1: Write failing shell tests with an explicit interface**

Test this owned interface without importing any not-yet-created view:

```ts
type AnalyticsWorkspaceShellProps = {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
  availableViews: readonly AnalyticsView[];
  children: React.ReactNode;
};
```

Cover personal and named-group headings, period selection, active-view callbacks, one visible content slot, and personal/group view lists. `AnalyticsView` is a local union of `overview | spending | categories | attention | forecast | data-quality`.

- [ ] **Step 2: Write failing mobile navigation semantics and visibility tests**

Assert the nav has an accessible label, each trigger is at least 40px high, active view is selected, the rail allows horizontal overflow without page overflow, and Data Quality is absent for groups. Mock `scrollIntoView` and prove a newly active off-screen trigger is brought into view with `block: 'nearest'`, `inline: 'nearest'`, and `behavior: 'auto'` under reduced motion or `'smooth'` otherwise.

- [ ] **Step 3: Write failing state and accessible-summary tests**

Test `AnalyticsChartSkeleton`, `AnalyticsEmptyState`, `AnalyticsInsufficientState`, and `AnalyticsErrorState`. Error state receives `{ message, onRetry }`; empty receives `{ scope, missing: 'expenses' | 'income' | 'both', action?: { href: string; label: string } }`, uses the existing scope-aware default action when omitted, and renders the exact override when supplied; insufficient receives `{ title, coveredCategories, uncoveredCategories }`. Test `AccessibleDataSummary` with exact `{ caption, columns, rows }` props, keyboard focus on its disclosure control, and semantic table output.

- [ ] **Step 4: Run primitive tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx src/app/components/analytics/__tests__/AccessibleDataSummary.test.tsx`

Expected: FAIL because the primitives do not exist.

- [ ] **Step 5: Implement the shell using local controlled state only**

Render the explicit scope label, page title, global period select, view nav, and children. The final `AnalyticsWorkspace` will own local `useState` for active view and period; this shell is controlled and never reads URL query state. Keep a ref per view trigger and, after active-view changes, call `scrollIntoView` with the tested nearest/smooth-or-auto options so keyboard and programmatic selection never leave the active tab off-screen.

- [ ] **Step 6: Implement state and summary components**

Provide geometry-matched skeletons, `role="alert"` errors with retry, personal/group empty actions plus the tested optional exact action override, and insufficient-history copy. Use `text-balance`, `text-pretty`, `tabular-nums`, 40px targets, and exact transitions.

- [ ] **Step 7: Run primitive tests and type-check**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx src/app/components/analytics/__tests__/AccessibleDataSummary.test.tsx && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 8: Commit exact primitive files**

```bash
rtk git add web/src/app/components/analytics/AnalyticsWorkspaceShell.tsx web/src/app/components/analytics/AnalyticsViewNav.tsx web/src/app/components/analytics/AnalyticsStates.tsx web/src/app/components/analytics/AccessibleDataSummary.tsx web/src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx web/src/app/components/analytics/__tests__/AccessibleDataSummary.test.tsx
rtk git commit -m "feat: add accessible analytics workspace primitives"
```

### Task 9: Build the decision-first Overview and bounded group summary

**Files:**
- Create: `web/src/app/components/analytics/AnalyticsMetricStrip.tsx`
- Create: `web/src/app/components/analytics/AnalyticsAttentionSummary.tsx`
- Create: `web/src/app/components/analytics/views/OverviewAnalyticsView.tsx`
- Create: `web/src/app/components/analytics/views/__tests__/OverviewAnalyticsView.test.tsx`
- Create: `web/src/app/metrics/hooks/useGroupAnalyticsSummary.ts`
- Create: `web/src/app/metrics/hooks/__tests__/useGroupAnalyticsSummary.test.ts`

- [ ] **Step 1: Write failing group-summary hook tests**

The hook takes `{ scope, start, end, enabled }` and returns `{ data, loading, error, refetch }`. Assert it stays idle for personal scope or missing bounds, sends exact overview bounds for group scope, prefers cents, maps member balances, exposes a stable `refetch`, retries after failure, and rejects a delayed old-group response after scope changes.

- [ ] **Step 2: Run the hook test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/metrics/hooks/__tests__/useGroupAnalyticsSummary.test.ts`

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the group-summary hook**

Convert overview timestamps to generated timestamps, call `financeClient.getGroupSummary`, map total/unsettled/member cents, expose `refetch`, and use the same request-ID stale-response pattern as the overview hook.

- [ ] **Step 4: Write failing Overview component tests, including every overview state**

Use mocked `useAnalyticsOverview`, `useSpendingTrends`, `useAnomalies`, `useWaterfallData`, and `useGroupAnalyticsSummary`. Assert current income/spend/net/savings, unavailable-rate label, previous changes, largest driver, trend figure, money-flow figure, the exact primary-attention description/reason/amount/expected-context model, qualified coverage copy, group unsettled metrics, member balances, and scope-correct largest-category URL. Add explicit cases for:

- overview loading: one chart-shaped skeleton and no stale metrics;
- overview failure: `AnalyticsErrorState` with the overview hook's `refetch` as retry;
- `hasCurrentData=false`: `AnalyticsEmptyState` with `missing='income'`, `'expenses'`, or `'both'` inferred from the two current cents totals;
- deep trend, anomaly, waterfall, and group-summary loading/errors: local supporting-panel states that do not replace a successfully loaded metric strip, with group-summary failure retry wired to `useGroupAnalyticsSummary.refetch`;
- delayed old-period and old-group results: the current scope/period remains visible.

- [ ] **Step 5: Run Overview test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/OverviewAnalyticsView.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 6: Implement metrics and attention primitives**

`AnalyticsMetricStrip` accepts exactly four `{ label, value, detail, tone }` items and renders them as one divided surface with tabular values. `AnalyticsAttentionSummary` accepts `primary: PrimaryAnalyticsAttention | null`, anomaly count, anomalous cents, covered/uncovered category counts, formatter, and an expense-ID attention URL. It renders the primary description, reason, formatted amount, and optional expected context; it never says all clear for uncovered categories.

- [ ] **Step 7: Implement Overview without equal-card repetition**

Use `AnalyticsViewProps = { scope, period, currency }`. Render the overview loading, error/retry, and `hasCurrentData=false` empty states before any loaded composition. Compose the overview hook first; once its returned bounds exist, enable group summary with those exact bounds. Add a dominant spending trend, attention surface, and existing Waterfall chart as the money-flow section, with local panel states for each supporting hook; the group-summary error action calls its returned `refetch`. Group scope adds settlement/member information without reading `FinanceContext` personal transactions. Apply 16px outer and 10px nested radii when padding makes them concentric.

- [ ] **Step 8: Add accessible equivalents for Overview charts**

Wrap each chart in a labelled `figure` and provide `AccessibleDataSummary` rows from the same trend and waterfall arrays.

- [ ] **Step 9: Run Overview, hook, and type tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/metrics/hooks/__tests__/useGroupAnalyticsSummary.test.ts src/app/components/analytics/views/__tests__/OverviewAnalyticsView.test.tsx && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 10: Commit exact Overview files**

```bash
rtk git add web/src/app/components/analytics/AnalyticsMetricStrip.tsx web/src/app/components/analytics/AnalyticsAttentionSummary.tsx web/src/app/components/analytics/views/OverviewAnalyticsView.tsx web/src/app/components/analytics/views/__tests__/OverviewAnalyticsView.test.tsx web/src/app/metrics/hooks/useGroupAnalyticsSummary.ts web/src/app/metrics/hooks/__tests__/useGroupAnalyticsSummary.test.ts
rtk git commit -m "feat: add actionable analytics overview"
```

### Task 10: Build the scoped Spending view

**Files:**
- Create: `web/src/app/components/analytics/views/SpendingAnalyticsView.tsx`
- Create: `web/src/app/components/analytics/views/__tests__/SpendingAnalyticsView.test.tsx`

- [ ] **Step 1: Write the failing Spending view test**

Mock `useHeatmapData`, `useSpendingTrends`, and `useCategorySpendingTrends`. Assert the global period maps to the exact hook parameters, every call receives scope, date clicks use `buildAnalyticsExpenseUrl`, headers stack with mobile classes, and trend, category, and heatmap figures each have a shared-data accessible summary. For each of the three hooks, add RED cases proving its chart-shaped loading state is local, its error action calls that hook's `refetch`, and its settled empty state does not hide successfully loaded sibling figures.

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/SpendingAnalyticsView.test.tsx`

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement the scoped layout, controls, and local states**

Use `AnalyticsViewProps`, the exact period map, and all three scope-aware hooks. Build the stacked mobile header/controls and local loading, empty, and error/retry boundaries for each data source. Replace local dollar formatters with the supplied currency formatter.

- [ ] **Step 4: Integrate the heatmap with exact drill-down and accessibility**

Keep the existing lazy visx heatmap, wrap it in a labelled figure, build date links only through `buildAnalyticsExpenseUrl`, and add an `AccessibleDataSummary` from the same daily rows.

- [ ] **Step 5: Integrate spending and category trends with truthful formatting**

Pass the currency/date formatters into the corrected trend chart, keep category trends separately labelled, and add accessible summaries from the same arrays. Do not derive a second range or scope locally.

- [ ] **Step 6: Run the focused and existing stacked-chart tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/SpendingAnalyticsView.test.tsx src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 7: Commit exact Spending files**

```bash
rtk git add web/src/app/components/analytics/views/SpendingAnalyticsView.tsx web/src/app/components/analytics/views/__tests__/SpendingAnalyticsView.test.tsx
rtk git commit -m "feat: add scoped spending analytics view"
```

### Task 11: Build the Categories view and combined budgets

**Files:**
- Create: `web/src/app/components/analytics/views/CategoriesAnalyticsView.tsx`
- Create: `web/src/app/components/analytics/views/__tests__/CategoriesAnalyticsView.test.tsx`

- [ ] **Step 1: Write the failing Categories view test**

Mock `useAnalyticsOverview` and `useCategoryComparison`. Assert `includeBudgets=true`, period and scope propagation to both hooks, single-category axes, each combined budget rendered exactly once with allowance and current spend, scope-correct category links with the exact overview `currentStart` and `currentEnd`, a programmatically labelled show/hide-budget control with `aria-pressed`, and a ranked accessible summary. Add a delayed-period test proving old overview bounds cannot replace the active period's category URLs. Cover loading from either required hook with a chart-shaped skeleton, overview or comparison failures with the owning retry callback, and no category data with the local empty state.

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/CategoriesAnalyticsView.test.tsx`

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement Categories with backend-authoritative budget data**

Call `useAnalyticsOverview(scope, period)` solely for its authoritative current bounds and `useCategoryComparison` for category/budget data. Do not rederive calendar bounds on the client. Render a chart-shaped skeleton while either required response is loading; wire each error state to its owning hook's `refetch`; render the category empty state only after both settle. Use the radar chart for single-category comparison. Render combined budgets in one supporting section outside the chart. Use only response budget values, not a second `ListBudgets` request. Apply the supplied formatter and tabular numbers; category links remain disabled until current bounds are available.

- [ ] **Step 4: Run the focused view and hook tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/CategoriesAnalyticsView.test.tsx src/app/metrics/hooks/__tests__/useAnalyticsData.test.ts && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit exact Categories files**

```bash
rtk git add web/src/app/components/analytics/views/CategoriesAnalyticsView.tsx web/src/app/components/analytics/views/__tests__/CategoriesAnalyticsView.test.tsx
rtk git commit -m "feat: add budget-aware category analytics"
```

### Task 12: Build Attention with qualified anomaly coverage

**Files:**
- Create: `web/src/app/components/analytics/views/AttentionAnalyticsView.tsx`
- Create: `web/src/app/components/analytics/views/__tests__/AttentionAnalyticsView.test.tsx`

- [ ] **Step 1: Write the failing Attention view test**

Assert the period lookback and scope reach `useAnomalies`; slider has an associated `Sensitivity` label, `aria-valuetext`, and updates the hook on commit rather than every pointer move; each expense appears once; amount ranges appear only when `hasExpectedRange`; under-sampled categories are named or counted; zero anomalies never implies coverage for insufficient categories; rows use exact `expenseId` drill-down URLs; and chart data has an accessible table. Cover a chart-shaped loading skeleton, a retryable hook error, a qualified zero-anomaly empty state only when overall history is sufficient, and `AnalyticsInsufficientState` when it is not.

- [ ] **Step 2: Run the test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/AttentionAnalyticsView.test.tsx`

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement Attention and its local state**

Keep a visual sensitivity value and commit it through Radix Slider `onValueCommit`. Render a chart-shaped skeleton before settled data and wire the error retry to `useAnomalies.refetch`. Render qualified coverage before the anomaly scatter plot and transaction list. The view owns empty and insufficient states because they derive from its hook response; never render the zero-anomaly all-clear copy unless overall history is sufficient.

- [ ] **Step 4: Run the focused view and accessibility tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/AttentionAnalyticsView.test.tsx && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 5: Commit exact Attention files**

```bash
rtk git add web/src/app/components/analytics/views/AttentionAnalyticsView.tsx web/src/app/components/analytics/views/__tests__/AttentionAnalyticsView.test.tsx
rtk git commit -m "feat: add coverage-aware anomaly analytics"
```

### Task 13: Build Forecast and personal Data Quality views

**Files:**
- Create: `web/src/app/components/analytics/views/ForecastAnalyticsView.tsx`
- Create: `web/src/app/components/analytics/views/DataQualityAnalyticsView.tsx`
- Create: `web/src/app/components/analytics/views/__tests__/ForecastAnalyticsView.test.tsx`
- Create: `web/src/app/components/analytics/views/__tests__/DataQualityAnalyticsView.test.tsx`

- [ ] **Step 1: Write the failing Forecast view test**

Assert exact forecast horizon and scope, history and future props passed to the corrected chart, no net zero-range copy, a labelled figure, accessible date/value rows, a chart-shaped loading skeleton, a hook error wired to `refetch`, and a settled no-history/no-future empty state.

- [ ] **Step 2: Run Forecast test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/ForecastAnalyticsView.test.tsx`

Expected: FAIL because the view does not exist.

- [ ] **Step 3: Implement Forecast and verify it**

Use `AnalyticsViewProps`, the mapped forecast configuration, corrected chart, supplied formatter, and `AccessibleDataSummary`. Resolve loading first, then retryable error, then empty data before mounting the chart.

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/ForecastAnalyticsView.test.tsx`

Expected: PASS.

- [ ] **Step 4: Write the failing Data Quality test with exact states and destinations**

Assert correction/review quality is primary, raw processing milliseconds are secondary, loading renders a geometry-matched skeleton, failure renders `AnalyticsErrorState` wired to the metrics hook's `refetch`, and zero extractions renders `AnalyticsEmptyState` with `{ href: '/personal/expenses#smart-expense-entry', label: 'Import a receipt or statement' }`. A recent event with a non-empty stable `event.id` links to that existing import anchor, while an event without a stable ID remains non-interactive. Events never create an analytics query parameter outside the approved drill-down contract. Controls have programmatic labels and dynamic values use tabular numerals.

- [ ] **Step 5: Run Data Quality test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/DataQualityAnalyticsView.test.tsx`

Expected: FAIL because the view does not exist.

- [ ] **Step 6: Implement Data Quality and verify both views**

Keep `useExtractionMetrics` inside this view so group workspaces never mount it. Implement the exact loading/error/retry/empty cases above. Pass the exact action override to `AnalyticsEmptyState`; link only stable-ID events to the existing import anchor and render identifier-less events as non-interactive detail. Do not serialise event IDs into analytics drill-down URLs.

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/views/__tests__/ForecastAnalyticsView.test.tsx src/app/components/analytics/views/__tests__/DataQualityAnalyticsView.test.tsx && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 7: Commit exact Forecast and Data Quality files**

```bash
rtk git add web/src/app/components/analytics/views/ForecastAnalyticsView.tsx web/src/app/components/analytics/views/DataQualityAnalyticsView.tsx web/src/app/components/analytics/views/__tests__/ForecastAnalyticsView.test.tsx web/src/app/components/analytics/views/__tests__/DataQualityAnalyticsView.test.tsx
rtk git commit -m "feat: add forecast and data quality analytics"
```

### Task 14: Compose `AnalyticsWorkspace` and migrate the personal route

**Files:**
- Create: `web/src/app/components/analytics/AnalyticsWorkspace.tsx`
- Create: `web/src/app/components/analytics/__tests__/AnalyticsWorkspace.test.tsx`
- Modify: `web/src/app/(app)/personal/analytics/page.tsx`
- Modify: `web/src/app/(app)/personal/analytics/__tests__/AnalyticsPage.test.tsx`

- [ ] **Step 1: Write failing composition and subscription tests**

Mock every completed view. Assert local default state is `{ period: 'month', activeView: 'overview' }`; period and view changes select the right component; personal view list includes Data Quality; subscription loading renders a workspace-shaped skeleton and mounts no view; non-Pro renders one `UpgradePrompt` and mounts no view; Pro mounts the workspace.

- [ ] **Step 2: Run composition tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/AnalyticsWorkspace.test.tsx`

Expected: FAIL because the composition component does not exist.

- [ ] **Step 3: Implement the composition component**

Own local period and active-view state, derive currency context from `FinanceContext.taxConfig.country`, choose the completed view in an exhaustive switch, and pass the same `{ scope, period, currency }` contract. Keep subscription resolution outside the Pro view subtree so locked hooks never mount.

- [ ] **Step 4: Rewrite the personal page test before replacing the route**

Change the existing test to assert the route constructs personal scope and renders the new workspace. Move old tab-specific assertions into the focused view tests created above.

- [ ] **Step 5: Run the rewritten personal route test and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath 'src/app/(app)/personal/analytics/__tests__/AnalyticsPage.test.tsx'`

Expected: FAIL because the route still owns the legacy seven-tab implementation.

- [ ] **Step 6: Replace the 655-line page with the thin personal wrapper**

```tsx
export default function AnalyticsPage() {
  return <AnalyticsWorkspace scope={{ kind: 'personal' }} />;
}
```

- [ ] **Step 7: Run all workspace, view, hook, and personal route tests**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/AnalyticsWorkspace.test.tsx src/app/components/analytics/__tests__/AnalyticsWorkspaceShell.test.tsx src/app/components/analytics/views/__tests__/OverviewAnalyticsView.test.tsx src/app/components/analytics/views/__tests__/SpendingAnalyticsView.test.tsx src/app/components/analytics/views/__tests__/CategoriesAnalyticsView.test.tsx src/app/components/analytics/views/__tests__/AttentionAnalyticsView.test.tsx src/app/components/analytics/views/__tests__/ForecastAnalyticsView.test.tsx src/app/components/analytics/views/__tests__/DataQualityAnalyticsView.test.tsx 'src/app/(app)/personal/analytics/__tests__/AnalyticsPage.test.tsx' && rtk npm run type-check`

Expected: PASS.

- [ ] **Step 8: Commit exact workspace integration files**

```bash
rtk git add web/src/app/components/analytics/AnalyticsWorkspace.tsx web/src/app/components/analytics/__tests__/AnalyticsWorkspace.test.tsx web/src/app/'(app)'/personal/analytics/page.tsx web/src/app/'(app)'/personal/analytics/__tests__/AnalyticsPage.test.tsx
rtk git commit -m "feat: ship decision-first personal analytics"
```

### Task 15: Add the shared route and navigation integration

**Files:**
- Create: `web/src/app/(app)/shared/analytics/page.tsx`
- Create: `web/src/app/(app)/shared/analytics/__tests__/SharedAnalyticsPage.test.tsx`
- Modify: `web/src/app/components/SidebarNav.tsx`
- Modify: `web/src/app/components/SearchCommandPalette.tsx`
- Create: `web/src/app/components/__tests__/SidebarNavAnalytics.test.tsx`
- Modify: `web/src/app/components/__tests__/SearchCommandPalette.test.tsx`

- [ ] **Step 1: Write failing shared route tests**

Cover no active group guidance, active group scope construction, group name in the heading, subscription states, and group-only view list.

- [ ] **Step 2: Write failing Sidebar and command-palette tests**

Assert Shared Analytics appears once in the shared sidebar and command palette with `/shared/analytics`.

- [ ] **Step 3: Run all three exact tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath 'src/app/(app)/shared/analytics/__tests__/SharedAnalyticsPage.test.tsx' src/app/components/__tests__/SidebarNavAnalytics.test.tsx src/app/components/__tests__/SearchCommandPalette.test.tsx`

Expected: FAIL because the route and entries do not exist.

- [ ] **Step 4: Implement the shared wrapper**

Read `activeGroup` only. The shared layout already owns auth and group selection; render a named empty state if no group is active, otherwise pass `{ kind: 'group', groupId, groupName }`.

- [ ] **Step 5: Add navigation entries without changing existing labels**

Use the installed Lucide family and existing `BarChart3` icon. Do not introduce another icon package.

- [ ] **Step 6: Run shared and navigation tests by exact path**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath 'src/app/(app)/shared/analytics/__tests__/SharedAnalyticsPage.test.tsx' src/app/components/__tests__/SidebarNavAnalytics.test.tsx src/app/components/__tests__/SearchCommandPalette.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit shared integration**

```bash
rtk git add web/src/app/'(app)'/shared/analytics/page.tsx web/src/app/'(app)'/shared/analytics/__tests__/SharedAnalyticsPage.test.tsx web/src/app/components/SidebarNav.tsx web/src/app/components/SearchCommandPalette.tsx web/src/app/components/__tests__/SidebarNavAnalytics.test.tsx web/src/app/components/__tests__/SearchCommandPalette.test.tsx
rtk git commit -m "feat: add shared group analytics route"
```

### Task 16: Implement scope-correct expense drill-down filters

**Files:**
- Create: `web/src/app/utils/analyticsExpenseFilters.ts`
- Create: `web/src/app/utils/__tests__/analyticsExpenseFilters.test.ts`
- Create: `web/src/app/components/analytics/AnalyticsExpenseFilterSummary.tsx`
- Create: `web/src/app/components/analytics/__tests__/AnalyticsExpenseFilterSummary.test.tsx`
- Modify: `web/src/app/(app)/personal/expenses/page.tsx`
- Create: `web/src/app/(app)/personal/expenses/__tests__/ExpensesPageAnalyticsFilters.test.tsx`
- Modify: `web/src/app/(app)/shared/expenses/page.tsx`
- Modify: `web/src/app/components/ExpenseList.tsx`
- Modify: `web/src/app/components/GroupExpenseList.tsx`
- Modify: `web/src/app/__tests__/ExpenseList.test.tsx`
- Modify: `web/src/app/(app)/shared/__tests__/SharedGroupSurfaces.test.tsx`

- [ ] **Step 1: Write failing query parser tests**

Cover valid and malformed `date`, the ten canonical category slugs exported by `links.ts`, inclusive `from`/`to`, and `expenseId`. Assert malformed values are ignored and parser/serializer round-trips cannot disagree. Reject and ignore unknown parameters so analytics creates only the approved contract.

- [ ] **Step 2: Write failing personal and group list filter tests**

Use sentinel transactions to prove date, category, range, and focused-ID filtering while retaining personal or active-group isolation.

- [ ] **Step 3: Write the failing personal expense-route integration test**

Mock `useSearchParams`, `ExpenseList`, and the route's surrounding context. Assert valid analytics query values are parsed and passed to `ExpenseList`, the active-filter summary is rendered with its clear action, malformed values are omitted, and the Smart Expense Entry wrapper has `id="smart-expense-entry"` so the Data Quality anchor resolves.

- [ ] **Step 4: Write the failing filter-summary test**

Assert it names the active date/category/range/focused expense without pills over data visualisations, exposes one clear-filter button, and provides a 40px target with `active:scale-[0.96]` and exact transform transition.

- [ ] **Step 5: Run exact filter tests and confirm failure**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/utils/__tests__/analyticsExpenseFilters.test.ts src/app/components/analytics/__tests__/AnalyticsExpenseFilterSummary.test.tsx src/app/__tests__/ExpenseList.test.tsx 'src/app/(app)/personal/expenses/__tests__/ExpensesPageAnalyticsFilters.test.tsx' 'src/app/(app)/shared/__tests__/SharedGroupSurfaces.test.tsx'`

Expected: FAIL because only personal date filtering exists.

- [ ] **Step 6: Implement the pure parser, serializer inverse, and predicate**

Return a validated filter object and a predicate usable by both local list components. Treat dates as UTC calendar keys and bounds as inclusive.

- [ ] **Step 7: Implement the extracted filter summary and pass parsed filters from both routes**

Use `useSearchParams`, preserve the active group as the only shared scope, show a compact active-filter summary, and provide a clear-filter action with at least a 40px target. Add `id="smart-expense-entry"` to the personal route's existing Smart Expense Entry wrapper; do not create a second entry surface.

- [ ] **Step 8: Make focused expenses visible before highlighting**

Apply date/category/range filters before pagination. If `expenseId` is present in the filtered collection, calculate `targetPage = Math.floor(index / pageSize) + 1`, set that page, then apply `aria-current="true"` and a labelled highlight. Call `scrollIntoView` only after the target row renders, using `behavior: 'auto'` for reduced motion and `smooth` otherwise. If the ID is absent from the scoped collection, show a filtered-empty message and never fetch another scope.

- [ ] **Step 9: Run list, route, summary, and link tests by exact path**

Run: `cd web && rtk npm test -- --runInBand --runTestsByPath src/app/components/analytics/__tests__/links.test.ts src/app/utils/__tests__/analyticsExpenseFilters.test.ts src/app/components/analytics/__tests__/AnalyticsExpenseFilterSummary.test.tsx src/app/__tests__/ExpenseList.test.tsx 'src/app/(app)/personal/expenses/__tests__/ExpensesPageAnalyticsFilters.test.tsx' 'src/app/(app)/shared/__tests__/SharedGroupSurfaces.test.tsx'`

Expected: PASS.

- [ ] **Step 10: Commit drill-down integration**

```bash
rtk git add web/src/app/utils/analyticsExpenseFilters.ts web/src/app/utils/__tests__/analyticsExpenseFilters.test.ts web/src/app/components/analytics/AnalyticsExpenseFilterSummary.tsx web/src/app/components/analytics/__tests__/AnalyticsExpenseFilterSummary.test.tsx web/src/app/'(app)'/personal/expenses/page.tsx web/src/app/'(app)'/personal/expenses/__tests__/ExpensesPageAnalyticsFilters.test.tsx web/src/app/'(app)'/shared/expenses/page.tsx web/src/app/components/ExpenseList.tsx web/src/app/components/GroupExpenseList.tsx web/src/app/__tests__/ExpenseList.test.tsx web/src/app/'(app)'/shared/__tests__/SharedGroupSurfaces.test.tsx
rtk git commit -m "feat: add scoped analytics expense drilldowns"
```

---

## Chunk 4: End-to-End Validation and Final Polish

### Task 17: Expand analytics end-to-end coverage

**Files:**
- Modify: `web/e2e/analytics.spec.ts`
- Create: `web/e2e/shared-analytics.spec.ts`
- Update snapshots only if the test intentionally adds named analytics screenshots

- [ ] **Step 1: Add the personal decision-first fixture and journey**

In the pre-dirty `analytics.spec.ts`, extend only its analytics Connect fixtures for overview, combined budgets, anomaly coverage, forecast history, and subscription. Add one test titled `personal analytics supports a decision-first journey` that asserts Overview is default, period changes update requests, each deep view is reachable, accessible summaries are present, drill-down URLs are correct, and locked hook requests do not occur.

- [ ] **Step 2: Run the exact personal journey**

Run: `cd web && rtk npx playwright test e2e/analytics.spec.ts --project=chromium --grep 'personal analytics supports a decision-first journey'`

Expected: PASS against frontend 1234 and backend 8111.

- [ ] **Step 3: Add the shared scope-isolation journey**

Create shared fixtures with two unique group names and sentinel overview/group-summary values. Add `shared analytics isolates active group responses`: open `/shared/analytics`, assert the active group name and sentinel values, switch groups, delay the first group's responses, and prove stale values never reappear.

- [ ] **Step 4: Run the exact shared isolation journey**

Run: `cd web && rtk npx playwright test e2e/shared-analytics.spec.ts --project=chromium --grep 'shared analytics isolates active group responses'`

Expected: PASS with only the active group's values visible.

- [ ] **Step 5: Add the non-member denial journey**

Add `shared analytics handles non-member denial without leaking data`. Return a Connect permission-denied response for an authenticated user outside the selected group, assert the retryable secure error state, and assert no personal or other-group sentinel appears. Keep the backend handler-level non-member tests from Task 1 as the authority that produces the denial; this E2E proves the browser journey handles it safely.

- [ ] **Step 6: Run the exact non-member denial journey**

Run: `cd web && rtk npx playwright test e2e/shared-analytics.spec.ts --project=chromium --grep 'shared analytics handles non-member denial without leaking data'`

Expected: PASS with a secure error and no scoped-data leak.

- [ ] **Step 7: Add one exact responsive journey**

Add `analytics remains reachable without page overflow on narrow screens` to each spec. At 390px, assert `document.documentElement.scrollWidth <= clientWidth`, every scope-available view is reachable, the active trigger scrolls into the nav viewport, headers stack, and controls remain visible.

- [ ] **Step 8: Run only responsive journeys on both mobile projects**

Run: `cd web && rtk npx playwright test e2e/analytics.spec.ts e2e/shared-analytics.spec.ts --project='Mobile Chrome' --project='Mobile Safari' --grep 'analytics remains reachable without page overflow on narrow screens'`

Expected: PASS with no page-level horizontal overflow or off-screen view timeout.

- [ ] **Step 9: Add keyboard and state journeys**

Add `personal analytics keyboard and states remain actionable`. Tab through period/view controls, open an accessible data alternative, operate the labelled sensitivity slider, then use fixture variants to cover loading, empty, insufficient-history, error/retry, and upgrade states.

- [ ] **Step 10: Run the exact keyboard/state journey**

Run: `cd web && rtk npx playwright test e2e/analytics.spec.ts --project=chromium --grep 'personal analytics keyboard and states remain actionable'`

Expected: PASS with keyboard focus visible and each state actionable.

- [ ] **Step 11: Add theme and reduced-motion journeys**

Add `analytics preserves palettes and reduced motion`. Check Amber Terminal in light and dark plus one alternate palette, emulate reduced motion, switch periods/views, and assert state changes complete with non-essential transitions disabled.

- [ ] **Step 12: Run the exact theme/motion journey**

Run: `cd web && rtk npx playwright test e2e/analytics.spec.ts --project=chromium --grep 'analytics preserves palettes and reduced motion'`

Expected: PASS with palette variables applied and reduced-motion behaviour respected.

- [ ] **Step 13: Run the complete targeted desktop and mobile E2E set**

Run: `cd web && rtk npx playwright test e2e/analytics.spec.ts e2e/shared-analytics.spec.ts --project=chromium --project='Mobile Chrome' --project='Mobile Safari'`

Expected: PASS with frontend 1234 and backend 8111 only.

- [ ] **Step 14: Selectively stage and commit E2E coverage**

Because `web/e2e/analytics.spec.ts` is baseline-dirty, stage only the new analytics-owned hunks with `rtk git add -p web/e2e/analytics.spec.ts`; stage the new clean file with `rtk git add web/e2e/shared-analytics.spec.ts`. Inspect the full staged patch and staged file list, run `rtk git diff --cached --check`, and commit only if no baseline hunk is present:

```bash
rtk git diff --cached --name-only
rtk git diff --cached
rtk git diff --cached --check
rtk git commit -m "test: cover personal and shared analytics journeys"
```

### Task 18: Run design pre-flight and focused code review

**Files:**
- Modify only files with confirmed findings from this review

- [ ] **Step 1: Run the requested `make-interfaces-feel-better` checklist**

Verify concentric radii, optical alignment, layered shadows, tabular numbers, font smoothing inheritance, balanced/pretty wrapping, `scale(0.96)`, exact transitions, no speculative `will-change`, and minimum targets.

- [ ] **Step 2: Run applicable `design-taste-frontend` redesign checks**

Confirm targeted preservation, one existing design system, palette fidelity, consistent radius rules, responsive collapse, full states, motivated motion, reduced motion, no new icon family, and no dashboard-inapplicable marketing patterns.

- [ ] **Step 3: Search mechanically for known UI regressions**

Run:

```bash
rtk rg -n 'transition-all|will-change: all|h-screen|—|–' web/src/app/components/analytics web/src/app/'(app)'/personal/analytics web/src/app/'(app)'/shared/analytics
```

Expected: no matches in new analytics UI. Existing unrelated matches remain out of scope.

- [ ] **Step 4: Inspect all visible analytics strings**

Check scope clarity, plain grammar, Australian spelling consistency, no unqualified all-clear claims, and no internal ML jargon as primary copy.

- [ ] **Step 5: Run a focused review subagent**

Ask for correctness, security, accessibility, performance, and dirty-worktree overlap findings. Fix only verified issues and rerun their tests.

### Task 19: Full verification and completion audit

**Files:**
- No planned edits; any failure returns to the owning task

- [ ] **Step 1: Verify the exact diff scope**

Run:

```bash
rtk git status --short
BASE_COMMIT=$(rtk cat /tmp/pfinance-analytics-base-commit)
rtk git diff --name-only "$BASE_COMMIT"..HEAD
rtk git diff --check "$BASE_COMMIT"..HEAD
rtk git diff --cached --name-only
rtk git diff --cached --check
```

Expected: the commit range contains only analytics implementation files, no whitespace errors, the index is empty after completed task commits, and unrelated baseline changes remain present but were never attributed to the implementation.

- [ ] **Step 2: Run protobuf validation**

Run: `cd proto && rtk buf lint`

Expected: PASS.

- [ ] **Step 3: Run backend analytics and full backend tests**

Run: `cd backend && rtk go test ./internal/service -count=1 && rtk go test ./... -count=1`

Expected: PASS. If unrelated pre-existing CDR failures remain, prove the analytics-focused package passes and report the unrelated baseline precisely.

- [ ] **Step 4: Run frontend unit, type, and lint checks**

Run: `cd web && rtk npm run type-check && rtk npm run lint && rtk npm test -- --runInBand`

Expected: PASS.

- [ ] **Step 5: Run non-mutating production builds**

Avoid `make build` because it runs code generation and overwrites tracked/generated or baseline-dirty files. Run backend outputs outside the repository and build the frontend directly:

```bash
(cd backend && rtk go build -o /tmp/pfinance-analytics-server ./cmd/server && rtk go build -o /tmp/pfinance-analytics-taxeval ./cmd/taxeval)
(cd web && rtk npm run build)
```

Expected: backend and frontend builds succeed without modifying `backend/server`, generated sources, or ports.

- [ ] **Step 6: Run targeted cross-browser E2E**

Run: `cd web && rtk npx playwright test e2e/analytics.spec.ts e2e/shared-analytics.spec.ts --project=chromium --project=firefox --project=webkit --project='Mobile Chrome' --project='Mobile Safari'`

Expected: PASS.

- [ ] **Step 7: Inspect rendered light/dark desktop and mobile analytics**

Use Playwright screenshots or the in-app browser to verify visual hierarchy, no clipping, readable chart labels, correct palette tokens, focus visibility, and actionable states. Do not claim UI completion from DOM tests alone.

- [ ] **Step 8: Audit every acceptance criterion against evidence**

Map all fourteen criteria in the approved spec to a test, source inspection, or rendered runtime observation. Treat missing evidence as incomplete work.

- [ ] **Step 9: Resolve final polish through its owning task**

If Step 7 or 8 finds a defect, return to the owning task, add or update the focused regression test, make the smallest fix, and rerun that task's checks. For a baseline-dirty file, use selective hunk staging and inspect the staged patch as required by the workspace note. Commit with a concrete message naming the corrected behaviour; if a hunk cannot be separated from user work, leave it uncommitted and report it instead of creating a catch-all final commit.

---

## Completion Evidence Checklist

- [ ] `.impeccable.md` contains the persistent design context and `CLAUDE.md` remains unchanged unless the user opts in.
- [ ] Personal analytics defaults to an actionable Overview.
- [ ] Shared analytics is first-class, named, scoped, and navigable.
- [ ] Personal ID forgery and group non-member access are denied by tests.
- [ ] Budget periods and combined budgets are mathematically correct.
- [ ] Group summary has no one-page cap and uses cents.
- [ ] Group flow has no invented tax.
- [ ] Anomalies are deduplicated and coverage-qualified.
- [ ] Forecast history and fitted trends are truthful.
- [ ] Currency is contextual with `en-AU`/AUD fallback.
- [ ] Every chart has an accessible equivalent.
- [ ] Mobile analytics has no page overflow and every view is reachable.
- [ ] Loading, empty, insufficient, error, locked, and populated states are verified.
- [ ] Unit, backend, type, lint, build, and cross-browser E2E evidence is current.
