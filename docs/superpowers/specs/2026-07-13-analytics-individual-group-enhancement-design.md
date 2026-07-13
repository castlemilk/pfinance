# Individual and Group Analytics Enhancement Design

Date: 2026-07-13
Status: Approved through persistent goal continuation

## Summary

PFinance will replace its chart-first analytics page with a decision-first analytics workspace that supports both personal and active-group scopes. The existing analytics RPCs, visx charts, shadcn/Radix components, and palette system remain the foundation. The work also closes correctness, security, responsive, and accessibility defects discovered during the feature review.

The primary success criterion is that a returning user can identify the most important change or risk in under thirty seconds, then inspect the supporting data without losing scope or period context.

## Product Goals

1. Give individuals a useful overview before asking them to choose a chart type.
2. Add a first-class analytics route for shared groups using the active group as an explicit scope.
3. Preserve deep exploration for spending, categories, attention items, and forecasts.
4. Prevent personal data from appearing in group analytics and prevent cross-user or cross-group access.
5. Make analytics responsive, keyboard-accessible, palette-aware, and clear in loading, empty, error, locked, and populated states.
6. Preserve the existing retro-futurist identity while improving typography, rhythm, control ergonomics, and data hierarchy.

## Non-Goals

- Building a new analytics warehouse or persisted insight engine.
- Adding net-worth or investment analytics.
- Changing subscription ownership semantics for groups. Advanced analytics continues to use the current caller-level Pro entitlement.
- Replacing visx, shadcn/Radix, Tailwind, Lucide, or the existing palette system.
- Redesigning unrelated application routes.
- Removing personal extraction metrics in this iteration. They remain personal-only and are excluded from group analytics.

## Feature Review Findings Addressed

### Individual experience

- Seven chart-technique tabs provide depth but no immediate conclusion.
- Forecast history returned by the API is discarded, weakening context.
- The trend line is not fitted from the regression represented by its R-squared value.
- Anomaly results can double-count a transaction and overstate certainty when sample sizes are insufficient.
- Currency and locale are hardcoded in charts.
- Mobile tab navigation overflows and chart controls do not collapse reliably.
- Most chart meaning is available only through pointer tooltips.

### Group experience

- There is no shared analytics route or navigation entry.
- Existing advanced analytics RPCs already accept `group_id` and verify membership, but frontend hooks always send an empty group ID.
- Shared summaries and reports can use personal context data.
- Group waterfall analysis assumes personal tax and defaults to an invented 25 percent rate.
- Group overview calculations can be incomplete because local context data is capped by page size.

### Security and financial correctness

- Personal analytics handlers accept an arbitrary non-empty `user_id` instead of forcing the authenticated UID.
- Category budget comparisons ignore budget period and duplicate a multi-category budget on every category axis.
- Group summary response cents fields are not consistently populated.

## Information Architecture

### Routes

- `/personal/analytics` renders the personal workspace.
- `/shared/analytics` renders the active-group workspace.
- The shared sidebar and command palette gain an Analytics entry without changing existing route labels.
- The shared route uses the existing group selector in the shared layout.

### Workspace views

1. **Overview**
   - Current-period income, spending, remaining cash flow, and savings rate.
   - Change from the previous equivalent period.
   - Largest spending driver.
   - Most important attention item, qualified by data sufficiency.
   - Group scope additionally shows unsettled total, unsettled count, and member balances.

2. **Spending**
   - Spending and income trend.
   - Category spending over time.
   - Heatmap with scope-correct transaction drill-down.

3. **Categories**
   - Current versus previous period.
   - Correctly normalised single-category budgets.
   - Ranked category drivers and plain-language changes.
   - Combined multi-category budgets are shown as combined budget context, not duplicated on category axes.

4. **Attention**
   - Anomalous transactions with reason, expected range, and direct expense navigation.
   - Qualified empty state when there is insufficient history.

5. **Forecast**
   - Historical income and expense context joined to future predictions.
   - Clear Today marker.
   - Confidence ranges only where the API provides meaningful bounds.
   - Group forecasts do not infer personal tax.

6. **Data quality**
   - Personal scope only.
   - Existing extraction metrics, presented as review quality rather than internal system telemetry where possible.

### Global period contract

The global period has exactly three values: `month`, `quarter`, and `year`. The default is `month`. Backend calendar boundaries use UTC because PFinance does not yet store a user or group timezone.

The current interval begins at 00:00 UTC on the first day of the current calendar month, quarter, or year and ends at request time. The comparison interval begins at 00:00 UTC on the first day of the immediately preceding calendar period and has the same elapsed duration as the current interval, capped at that period's end. This makes a partial current month compare with the same number of elapsed days in the previous month.

| Global period | Trend request | Heatmap range | Category comparison | Anomaly lookback | Forecast horizon | Money flow |
| --- | --- | --- | --- | --- | --- | --- |
| Month | Weekly, 8 periods | 3 months | Month | 90 days | 30 days | Month |
| Quarter | Weekly, 16 periods | 6 months | Quarter | 180 days | 60 days | Quarter |
| Year | Monthly, 24 periods | 1 year | Year | 365 days | 90 days | Year |

View-specific controls may refine granularity or sensitivity after the user enters a deeper view. They do not change the global Overview period.

## Architecture

### Analytics scope

Create a shared discriminated type:

```ts
type AnalyticsScope =
  | { kind: 'personal' }
  | { kind: 'group'; groupId: string; groupName: string };
```

Every analytics component and hook receives this scope or a derived immutable `groupId`. A group route cannot render the workspace until an active group exists. Personal requests always send an empty `userId`; the backend derives the UID from authentication claims.

### Component boundaries

- `AnalyticsWorkspace`: owns active view, global period, scope label, Pro gate, and page states.
- `AnalyticsOverview`: composes existing scoped analytics responses into decision-oriented metrics.
- `AnalyticsMetricStrip`: renders compact metrics without using four visually identical cards.
- `AnalyticsAttentionSummary`: renders the highest-priority risk or a qualified all-clear state.
- `AnalyticsViewNav`: responsive Radix navigation with horizontal overflow and active-view visibility.
- Existing chart components remain isolated client leaves.
- `AnalyticsEmptyState`, `AnalyticsErrorState`, and `AnalyticsChartSkeleton` provide consistent state handling.
- `GroupAnalyticsSummary`: adapts `GetGroupSummary` into unsettled and member-balance metrics.

Each unit has one responsibility and receives formatted data rather than reaching into unrelated contexts.

### Analytics overview contract

Add a focused `GetAnalyticsOverview` RPC rather than deriving headline values from differently bounded chart responses.

Add the following concrete contract. Field numbers shown are normative for the implementation plan unless an occupied number discovered during generation requires the next available number.

```proto
enum AnalyticsPeriod {
  ANALYTICS_PERIOD_UNSPECIFIED = 0;
  ANALYTICS_PERIOD_MONTH = 1;
  ANALYTICS_PERIOD_QUARTER = 2;
  ANALYTICS_PERIOD_YEAR = 3;
}

message GetAnalyticsOverviewRequest {
  string user_id = 1; // Ignored for personal scope.
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

`ANALYTICS_PERIOD_UNSPECIFIED` is treated as month for backward compatibility. The response contains:

- UTC current and comparison start/end timestamps.
- Current and previous income, expense, and net amounts in cents.
- Current savings rate, with zero income producing `has_savings_rate=false` and `savings_rate_percent=0`.
- Income and expense change percentages, with the matching presence flag false and numeric value zero when the previous value is zero.
- Largest current-period category and its cents amount.
- Current and comparison transaction counts.
- A `has_current_data` flag.

The RPC uses the same Pro gate and scope-enforcement rules as the other advanced analytics handlers. Group Overview additionally requests `GetGroupSummary` with the exact current start/end timestamps returned by `GetAnalyticsOverview`.

### Hook changes

All hooks in `useAnalyticsData.ts` accept an optional scope argument and propagate `groupId` consistently:

- `useHeatmapData`
- `useSpendingTrends`
- `useCategorySpendingTrends`
- `useCategoryComparison`
- `useAnomalies`
- `useCashFlowForecast`
- `useWaterfallData`

Hooks protect against stale responses after scope or filter changes using request sequencing or effect cancellation. Category trend fetching remains based on the existing expense-list API for this iteration, but must carry group scope and cannot overwrite newer results.

`useCashFlowForecast` maps history series already returned by the backend. The forecast chart accepts history and forecast data separately and constructs a domain spanning both.

### View data contracts

| View | Sources | Derived values | Empty or insufficient state | Drill-down |
| --- | --- | --- | --- | --- |
| Overview | `GetAnalyticsOverview`, `GetSpendingTrends`, `DetectAnomalies`; group also `GetGroupSummary` | Savings rate, period changes, largest driver, primary trend, attention priority, unsettled summary | `has_current_data=false` names the missing income or expense entry action; anomaly coverage qualifies attention text | Largest category opens scoped expenses with category and returned date bounds |
| Spending | `GetSpendingTrends`, client-scoped category trend, `GetDailyAggregates` | Fitted trend endpoints and ranked period/category summaries | No points means no transactions in the mapped range | Heatmap opens scoped expenses with `date` |
| Categories | `GetCategoryComparison` including budget context | Normalised single-category budgets and separately grouped combined budgets | No categories means no spending in current or comparison interval | Category opens scoped expenses with category and date bounds |
| Attention | `DetectAnomalies` with new sufficiency metadata | One row and one total contribution per expense | `has_sufficient_history=false` is distinct from zero anomalies | Row opens scoped expenses with `expenseId` |
| Forecast | `GetCashFlowForecast` history and forecast arrays | Joined history/future domain and current-period forecast summary | No history explains that forecasts require recorded history | No transaction drill-down |
| Data quality | `GetExtractionMetrics`, personal only | Review rate and confidence labels | No extractions links to document import | Opens the relevant import/review surface when an event identifier exists |

### Backend scope enforcement

For each advanced analytics handler:

- If `group_id` is empty, use `claims.UID` and ignore any caller-supplied personal `user_id`.
- If `group_id` is present, verify membership before querying.
- Never use an arbitrary request user ID as personal scope.

Tests cover a forged user ID, group membership success, and non-member denial.

### Budget comparison rules

- Prefer `amount_cents` over legacy doubles.
- Convert each single-category budget to the selected comparison window using annual equivalents: weekly 52, fortnightly 26, monthly 12, quarterly 4, yearly 1.
- Sum multiple normalised single-category budgets targeting the same category.
- Do not copy a combined multi-category budget onto each category. Exclude it from per-category axes and surface it as combined budget context.
- Treat an unspecified budget period as monthly for backward compatibility and document this assumption in code.

`GetCategoryComparison` remains the only budget source for the Categories view. Its request sets `include_budgets=true`. The backend applies the normalisation rules above to single-category budgets and returns their sum in each `CategorySpending.budget_amount_cents`.

Extend the response with this concrete combined-budget context:

```proto
message CombinedBudgetComparison {
  string budget_id = 1;
  string name = 2;
  repeated ExpenseCategory categories = 3;
  int64 allowance_cents = 4;
  int64 current_spend_cents = 5;
}

message GetCategoryComparisonResponse {
  repeated CategorySpending categories = 1;
  repeated CombinedBudgetComparison combined_budgets = 2;
}
```

Budgets with more than one category appear only in `combined_budgets` and never contribute to a per-category budget axis. If `include_budgets=false`, every per-category budget amount is zero and `combined_budgets` is empty.

### Group money flow

Personal flow remains gross income, configured tax, expense categories, and net savings.

Group flow is income, shared expense categories, and remaining group cash. It does not fetch personal tax configuration, emit a Tax entry, or use a default tax rate.

### Anomaly correctness

- Combine multiple anomaly reasons for the same expense into one result.
- Count each expense once in totals.
- Use full available history to determine whether a merchant is new while retaining the selected lookback window for displayed anomalies.
- When there are fewer than ten comparable transactions in a category, expose insufficient-history context rather than claiming spending is normal.

The current response shape can represent one anomaly per expense. Choose the highest-severity reason and keep totals deduplicated. `expected_amount` remains the category mean for amount outliers. Extend `SpendingAnomaly` with these fields:

```proto
int64 expected_lower_cents = 13;
int64 expected_upper_cents = 14;
bool has_expected_range = 15;
```

The range is mean plus or minus the active z-score threshold times standard deviation, clamped to zero at the lower bound. Non-amount anomaly types set `has_expected_range=false` and the UI shows reason-specific context instead of a range.

Add this coverage contract:

```proto
message AnomalyCategoryCoverage {
  ExpenseCategory category = 1;
  int32 sample_count = 2;
  bool has_sufficient_history = 3;
}

message DetectAnomaliesResponse {
  repeated SpendingAnomaly anomalies = 1;
  int32 total_anomalies = 2;
  double anomalous_spend_total = 3;
  int64 anomalous_spend_total_cents = 4;
  string top_anomaly_category = 5;
  int32 analyzed_expense_count = 6;
  int32 eligible_category_count = 7;
  int32 minimum_category_sample = 8;
  bool has_sufficient_history = 9;
  repeated AnomalyCategoryCoverage category_coverage = 10;
}
```

Extend `DetectAnomaliesResponse` with `analyzed_expense_count`, `eligible_category_count`, `minimum_category_sample`, `has_sufficient_history`, and repeated `category_coverage`. The overall flag is true when at least one category has the minimum ten comparable transactions. An all-clear statement applies only to categories whose coverage entry is sufficient. The UI separately names or counts under-sampled categories and never claims they are normal.

### Complete group summaries

`GetGroupSummary` must aggregate every matching expense and income. Add a service helper that follows store page tokens until exhaustion for both collections, with a repeated-token guard. Calculations prefer cents for expenses, incomes, and allocations, populate all response cents fields, and derive legacy doubles from the cents totals. This removes the existing 1,000-record correctness cap without introducing a new store abstraction.

### Currency and locale

Personal analytics derives its currency from `FinanceContext.taxConfig.country` through the existing currency utility. Group analytics uses the viewing member's configured country because groups do not yet have a currency setting. The fallback is `australia`, locale `en-AU`, and currency `AUD`. This iteration assumes every scoped dataset uses one currency and does not perform conversion.

All chart and workspace formatters receive a formatter or explicit currency context. They must not embed `$`, `en-US`, or a second currency map.

### Drill-down URL contract

This iteration adds query-filter support to both expense routes:

- Personal base: `/personal/expenses`.
- Group base: `/shared/expenses`; active group remains the scope authority.
- `date=YYYY-MM-DD` filters to one UTC calendar date.
- `category=<canonical-category-slug>` filters by category.
- `from=YYYY-MM-DD&to=YYYY-MM-DD` supplies inclusive UTC bounds.
- `expenseId=<id>` focuses or highlights one visible transaction.

Analytics navigation creates only these documented parameters. Expense routes validate and ignore malformed parameters, preserve scope isolation, and show an empty filtered result without discarding the user's data.

## Data Flow

1. A route constructs `AnalyticsScope` from personal context or the active group.
2. `AnalyticsWorkspace` reads subscription status before mounting Pro analytics hooks.
3. Overview requests the authoritative period bounds and headline amounts from `GetAnalyticsOverview`.
4. The active deeper view mounts only the hooks it needs.
5. Hooks send an empty personal user ID plus the optional verified group ID.
6. Backend handlers derive personal identity or verify group membership.
7. Responses are mapped with cents-first money handling and the explicit currency context.
8. Visual charts and accessible summaries consume the same mapped data.
9. Drill-down navigation uses the documented scope, date, period, category, and expense query contract.

## Visual Design

### Design settings

- Redesign mode: targeted preservation.
- `DESIGN_VARIANCE: 5`.
- `MOTION_INTENSITY: 4`.
- `VISUAL_DENSITY: 6`.
- System: existing shadcn/Radix plus Tailwind and visx.

### Layout

- The page header contains scope, title, a short decision-focused description, and the global period control.
- Overview begins with a compact metric strip, then uses an asymmetric two-column layout for the primary trend and attention summary.
- Deeper views use one dominant chart surface plus supporting explanation, not repeated equal cards.
- Multi-column layouts collapse to one column below 768px.
- View navigation scrolls horizontally on small screens and automatically brings the active view into view.

### Typography and numbers

- Use readable system sans for headings and explanatory copy within analytics.
- Use the existing mono family for data labels and financial values.
- Apply tabular numerals to all changing financial values, counts, percentages, and dates where alignment matters.
- Apply balanced wrapping to headings and pretty wrapping to descriptions.

### Surfaces and controls

- Use 16px primary surface radii, 10px nested surface radii, and 6px control radii where the spacing preserves concentric geometry.
- Prefer layered palette-neutral shadows for elevation while retaining borders for form controls, dividers, and chart structure.
- Interactive targets are at least 40 by 40px.
- Press feedback uses `scale(0.96)` and exact transform transitions.
- Remove `transition-all` from analytics components and any shared primitives modified by this work.

### Motion

- Motion communicates view changes, loading completion, and interaction feedback only.
- View content uses short opacity and 8px vertical transitions when state changes after initial load.
- Exit transitions are shorter and softer than entries.
- All motion is disabled or made instant under reduced-motion preferences.

### Accessibility

- Each chart is a labelled `figure` with a concise summary.
- Every interactive chart has an equivalent compact table or ranked list available to keyboard and screen-reader users.
- Slider and toggle controls have programmatic labels and value text.
- Errors use an alert role; loading and refresh status use polite live regions.
- Colour is paired with labels, patterns, line styles, or icons.
- Focus order follows visual order on desktop and mobile.

## State Design

- **Loading**: metric and chart-shaped skeletons matching final geometry.
- **Empty personal**: explain which transaction or income data is missing and link to the relevant entry flow.
- **Empty group**: name the active group and link to shared expense or income entry.
- **Insufficient history**: explain the minimum sample required without implying an all-clear result.
- **Error**: preserve the current view and filters, explain the failure, and offer retry.
- **Locked**: do not mount analytics hooks before subscription status resolves; show one upgrade path.
- **No active group**: reuse the shared layout guidance to select or create a group.

## Testing Strategy

### Backend

- Table-driven tests for all seven analytics handlers, including `GetAnalyticsOverview`, covering authenticated personal scope, forged `user_id`, group member, and group non-member.
- Budget normalisation tests for every budget period, multiple budgets, and combined category budgets.
- Group waterfall tests proving there is no Tax entry or default rate.
- Anomaly deduplication and insufficient-history tests.
- Group summary cents-field tests.
- Group summary tests with more than one store page and a store returning a repeated page token, proving complete aggregation and safe termination.

### Frontend units

- Hook tests prove every request propagates personal or group scope correctly.
- Stale request tests change period or group before the first request resolves.
- Workspace tests cover personal and group view sets, Pro gating, empty states, retries, and period state.
- Formatting tests cover Australian currency and cents-first values.
- Chart tests cover forecast history mapping, accessible summaries, and labelled controls.

### End-to-end

- Desktop Chromium personal analytics journey through overview and every view.
- Mobile Chrome and Mobile Safari navigation without horizontal page overflow.
- Shared analytics with two groups containing distinct sentinel values, proving group isolation on switch.
- Non-member group request denial.
- Keyboard navigation through view controls and chart alternatives.
- Light and dark mode checks using Amber Terminal plus one alternate palette.
- Reduced-motion check proving no non-essential transitions remain active.

## Acceptance Criteria

1. Personal analytics opens on Overview and communicates current financial direction without requiring a tab change.
2. Shared navigation includes Analytics and the route visibly identifies the active group.
3. Group switching refreshes all mounted analytics data and never displays the previous group's values after the switch.
4. Personal analytics ignores forged request user IDs; group analytics denies non-members.
5. Budget values match the selected period and combined budgets are not duplicated per category.
6. Group money flow contains no personal tax assumption.
7. Forecast charts show historical context and omit meaningless zero confidence ranges.
8. Anomaly totals count each expense once and empty messaging distinguishes insufficient history from no anomalies.
9. Every analytics view works at 390px without page-level horizontal overflow.
10. All dynamic financial values use tabular numerals and central locale-aware formatting.
11. Charts expose labelled summaries and keyboard-accessible equivalent data.
12. Loading, empty, insufficient-history, error, locked, and populated states are implemented.
13. Subscription loading mounts no analytics hooks, non-Pro users see one upgrade prompt with no analytics requests, and Pro users receive the workspace in both scopes.
14. Targeted unit, backend, type, lint, build, and Playwright tests pass.

While subscription status is loading, render a workspace-shaped skeleton. For a resolved non-Pro status, render one `UpgradePrompt`. Tests assert the three criterion 13 states explicitly for both personal and shared routes.

## Rollout and Compatibility

- Existing `/personal/analytics` URL remains stable.
- New hook parameters are optional where backward compatibility is useful, but workspace calls always pass an explicit scope.
- Legacy double money fields remain fallback-only.
- Existing chart components are evolved rather than replaced.
- The implementation must preserve unrelated dirty-worktree changes and avoid rewriting generated files unless the API contract changes.
