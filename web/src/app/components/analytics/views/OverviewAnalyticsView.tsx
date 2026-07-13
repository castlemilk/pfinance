'use client';

import Link from 'next/link';

import LazySpendingTrendChart from '@/app/components/charts/LazySpendingTrendChart';
import LazyWaterfallChart from '@/app/components/charts/LazyWaterfallChart';
import {
  useAnomalies,
  useSpendingTrends,
  useWaterfallData,
} from '@/app/metrics/hooks/useAnalyticsData';
import { useAnalyticsOverview } from '@/app/metrics/hooks/useAnalyticsOverview';
import { useGroupAnalyticsSummary } from '@/app/metrics/hooks/useGroupAnalyticsSummary';
import type { AnalyticsOverviewData } from '@/app/metrics/types';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import { AnalyticsAttentionSummary } from '../AnalyticsAttentionSummary';
import { AnalyticsMetricStrip } from '../AnalyticsMetricStrip';
import {
  AnalyticsChartSkeleton,
  AnalyticsEmptyState,
  AnalyticsErrorState,
} from '../AnalyticsStates';
import {
  ANALYTICS_CATEGORY_SLUGS,
  buildAnalyticsExpenseUrl,
} from '../links';
import { getAnalyticsPeriodConfig } from '../periods';

import type { AnalyticsMetricTuple } from '../AnalyticsMetricStrip';
import type { AnalyticsCategorySlug } from '../links';
import type {
  AnalyticsCurrencyContext,
  AnalyticsScope,
  AnalyticsViewProps,
} from '../types';

const CATEGORY_SLUGS = new Set<string>(ANALYTICS_CATEGORY_SLUGS);

function scopeKey(scope: AnalyticsScope): string {
  return scope.kind === 'group'
    ? JSON.stringify(['group', scope.groupId])
    : 'personal';
}

function percentValue(
  value: number,
  locale: string,
  signDisplay: 'auto' | 'always'
): string {
  return (
    new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay,
    }).format(value / 100)
  );
}

function comparisonDetail(
  value: number,
  isAvailable: boolean,
  locale: string
): string {
  return isAvailable
    ? 'Change: ' + percentValue(value, locale, 'always')
    : 'Not available';
}

function metricTone(value: number): 'positive' | 'negative' | 'neutral' {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return 'neutral';
}

function overviewMetrics(
  data: AnalyticsOverviewData,
  currency: AnalyticsCurrencyContext
): AnalyticsMetricTuple {
  return [
    {
      label: 'Income',
      value: currency.formatMoney(data.currentIncome),
      detail: comparisonDetail(
        data.incomeChange,
        data.hasIncomeChange,
        currency.locale
      ),
      tone: metricTone(data.currentIncome),
    },
    {
      label: 'Spending',
      value: currency.formatMoney(data.currentExpense),
      detail: comparisonDetail(
        data.expenseChange,
        data.hasExpenseChange,
        currency.locale
      ),
      tone: 'neutral',
    },
    {
      label: 'Net',
      value: currency.formatMoney(data.currentNet),
      detail: 'Income minus spending',
      tone: metricTone(data.currentNet),
    },
    {
      label: 'Savings rate',
      value: data.hasSavingsRate
        ? percentValue(data.savingsRate, currency.locale, 'auto')
        : 'Not available',
      detail: 'Share of income kept',
      tone: data.hasSavingsRate ? metricTone(data.savingsRate) : 'neutral',
    },
  ];
}

function missingCurrentData(data: AnalyticsOverviewData) {
  const hasIncome = data.currentIncome !== 0;
  const hasExpenses = data.currentExpense !== 0;
  if (!hasIncome && !hasExpenses) return 'both' as const;
  if (!hasIncome) return 'income' as const;
  if (!hasExpenses) return 'expenses' as const;
  return 'both' as const;
}

function categorySlug(label: string): AnalyticsCategorySlug | null {
  const normalized = label.trim().toLowerCase();
  return CATEGORY_SLUGS.has(normalized)
    ? (normalized as AnalyticsCategorySlug)
    : null;
}

function utcDateBound(date: Date | null): string | null {
  if (
    !date ||
    !Number.isFinite(date.getTime()) ||
    date.getUTCFullYear() < 1 ||
    date.getUTCFullYear() > 9_999
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function driverUrl(
  data: AnalyticsOverviewData,
  scope: AnalyticsScope
): string | null {
  const slug = categorySlug(data.largestCategory);
  const from = utcDateBound(data.currentStart);
  const to = utcDateBound(data.currentEnd);
  if (
    !slug ||
    !from ||
    !to ||
    !Number.isFinite(data.largestCategoryAmount) ||
    data.largestCategoryAmount <= 0 ||
    !data.currentStart ||
    !data.currentEnd ||
    data.currentStart > data.currentEnd
  ) {
    return null;
  }
  return buildAnalyticsExpenseUrl(scope, { category: slug, from, to });
}

function DriverBand({
  data,
  scope,
  formatMoney,
}: Readonly<{
  data: AnalyticsOverviewData;
  scope: AnalyticsScope;
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
}>) {
  const href = driverUrl(data, scope);
  const Heading = scope.kind === 'personal' ? 'h2' : 'h3';
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">
          Largest spending driver
        </p>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Heading className="text-balance text-xl font-semibold text-foreground">
            {data.largestCategory || 'Not available'}
          </Heading>
          <p className="font-mono text-base font-semibold tabular-nums text-foreground">
            {Number.isFinite(data.largestCategoryAmount)
              ? formatMoney(data.largestCategoryAmount)
              : 'Not available'}
          </p>
        </div>
      </div>
      {href ? (
        <Link
          href={href}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          Review {data.largestCategory} spending
        </Link>
      ) : (
        <p className="max-w-xs text-pretty text-sm text-muted-foreground">
          A detailed review link will appear when the category and period are available.
        </p>
      )}
    </section>
  );
}

function LocalLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-40 items-center justify-center rounded-[10px] bg-muted/40 p-4 text-sm text-muted-foreground"
    >
      <span className="motion-safe:animate-pulse motion-reduce:animate-none">
        {label}
      </span>
    </div>
  );
}

function LocalError({
  message,
  actionLabel,
  onRetry,
}: Readonly<{
  message: string;
  actionLabel: string;
  onRetry: () => void;
}>) {
  return (
    <div
      role="alert"
      className="rounded-[10px] border border-destructive/40 bg-destructive/5 p-4"
    >
      <p className="text-pretty text-sm text-destructive">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 min-h-10 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {actionLabel}
      </button>
    </div>
  );
}

type TrendPoint = Readonly<{ date: string; value: number }>;

function trendRows(
  expenseSeries: readonly TrendPoint[],
  incomeSeries: readonly TrendPoint[],
  currency: AnalyticsCurrencyContext
): readonly (readonly string[])[] {
  const pointsByDate = new Map<
    string,
    { expense?: number; income?: number }
  >();
  for (const point of expenseSeries) {
    pointsByDate.set(point.date, {
      ...pointsByDate.get(point.date),
      expense: point.value,
    });
  }
  for (const point of incomeSeries) {
    pointsByDate.set(point.date, {
      ...pointsByDate.get(point.date),
      income: point.value,
    });
  }

  return [...pointsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, values]) => [
      currency.formatDate(date, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      values.expense === undefined
        ? 'Not available'
        : currency.formatMoney(values.expense),
      values.income === undefined
        ? 'Not available'
        : currency.formatMoney(values.income),
    ]);
}

function anomalyCents(amount: number): number {
  const cents = Math.round(amount * 100);
  return Number.isFinite(amount) && Number.isSafeInteger(cents)
    ? cents
    : Number.NaN;
}

function groupMemberLabel(
  scope: Extract<AnalyticsScope, { kind: 'group' }>,
  userId: string,
  index: number
): string {
  const member = scope.members?.find((candidate) => candidate.userId === userId);
  const displayName = member?.displayName?.trim();
  if (displayName) return displayName;
  const email = member?.email?.trim();
  return email || `Member ${index + 1}`;
}

function GroupSettlementPanel({
  scope,
  summary,
  formatMoney,
}: Readonly<{
  scope: Extract<AnalyticsScope, { kind: 'group' }>;
  summary: NonNullable<ReturnType<typeof useGroupAnalyticsSummary>['data']>;
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
}>) {
  const unsettledLabel =
    String(summary.unsettledExpenseCount) +
    ' unsettled ' +
    (summary.unsettledExpenseCount === 1 ? 'expense' : 'expenses');
  return (
    <section
      aria-labelledby="group-settlement-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3
            id="group-settlement-heading"
            className="text-balance text-lg font-semibold text-foreground"
          >
            Group settlement
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Authoritative balances for this period
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm font-medium tabular-nums text-foreground">
            {unsettledLabel}
          </p>
          <p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
            {formatMoney(summary.unsettledAmount)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Period income{' '}
        <span className="font-mono font-medium tabular-nums text-foreground">
          {formatMoney(summary.totalIncome, true)}
        </span>
        {', period spending '}
        <span className="font-mono font-medium tabular-nums text-foreground">
          {formatMoney(summary.totalExpenses, true)}
        </span>
      </p>

      <section
        aria-label="Member balances"
        className="mt-4 overflow-hidden rounded-[10px] bg-muted/40"
      >
        {summary.memberBalances.length > 0 ? (
          <div className="divide-y divide-border">
            {summary.memberBalances.map((member, index) => {
              const status =
                member.balance > 0
                  ? { label: 'Is owed', accentClassName: 'bg-chart-2' }
                  : member.balance < 0
                    ? { label: 'Owes', accentClassName: 'bg-destructive' }
                    : { label: 'Settled', accentClassName: 'bg-muted-foreground' };
              return (
                <article
                  key={JSON.stringify([member.groupId, member.userId, index])}
                  data-testid="member-balance"
                  className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(8rem,1.3fr)_repeat(3,minmax(6rem,1fr))] sm:items-center"
                >
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold text-foreground">
                      {groupMemberLabel(scope, member.userId, index)}
                    </h4>
                    <p className="mt-1 inline-flex items-center gap-2 text-xs font-medium text-foreground">
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${status.accentClassName}`}
                      />
                      <span>{status.label}</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Paid</p>
                    <p className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground">
                      {formatMoney(member.totalPaid)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Allocated</p>
                    <p className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground">
                      {formatMoney(member.totalOwed)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Balance</p>
                    <p
                      className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground"
                    >
                      {formatMoney(Math.abs(member.balance))}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            No member balances are available for this period.
          </p>
        )}
      </section>
    </section>
  );
}

function LoadedOverview({
  scope,
  period,
  currency,
  overview,
}: AnalyticsViewProps & Readonly<{ overview: AnalyticsOverviewData }>) {
  const config = getAnalyticsPeriodConfig(period);
  const trends = useSpendingTrends(
    config.trendGranularity,
    config.trendPeriods,
    undefined,
    scope
  );
  const anomalies = useAnomalies(config.anomalyLookbackDays, 0.5, scope);
  const waterfall = useWaterfallData(config.waterfallDays, scope);
  const groupSummary = useGroupAnalyticsSummary({
    scope,
    start: overview.currentStart,
    end: overview.currentEnd,
    ...(overview.currentStartTimestamp
      ? { startTimestamp: overview.currentStartTimestamp }
      : {}),
    ...(overview.currentEndTimestamp
      ? { endTimestamp: overview.currentEndTimestamp }
      : {}),
    enabled:
      scope.kind === 'group' &&
      overview.currentStart !== null &&
      overview.currentEnd !== null,
  });

  const hasTrendData =
    trends.expenseSeries.length > 0 || trends.incomeSeries.length > 0;
  const trendTableRows = trendRows(
    trends.expenseSeries,
    trends.incomeSeries,
    currency
  );
  const coveredCategoryCount = anomalies.categoryCoverage
    .filter((coverage) => coverage.hasSufficientHistory)
    .length;
  const uncoveredCategoryCount = anomalies.categoryCoverage
    .filter((coverage) => !coverage.hasSufficientHistory)
    .length;
  const attentionUrl = anomalies.primaryAttention?.expenseId.trim()
    ? buildAnalyticsExpenseUrl(scope, {
        expenseId: anomalies.primaryAttention.expenseId,
      })
    : null;
  const flowRows = (waterfall.data ?? []).map((bar) => [
    bar.label,
    currency.formatMoney(bar.amount),
    bar.type,
    currency.formatMoney(bar.runningTotal),
  ]);
  const trendCaption =
    (config.trendGranularity === 'week' ? 'Weekly' : 'Monthly') +
    ' income and spending';
  const SectionHeading = scope.kind === 'personal' ? 'h2' : 'h3';

  return (
    <div className="space-y-5">
      <AnalyticsMetricStrip metrics={overviewMetrics(overview, currency)} />
      <DriverBand
        data={overview}
        scope={scope}
        formatMoney={currency.formatMoney}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,0.85fr)]">
        <figure
          aria-labelledby="spending-trend-heading"
          className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <figcaption>
            <SectionHeading
              id="spending-trend-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Spending trend
            </SectionHeading>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              {trendCaption}
            </p>
          </figcaption>
          <div className="mt-4">
            {trends.loading ? (
              <LocalLoading label="Loading spending trend" />
            ) : trends.error ? (
              <LocalError
                message={trends.error}
                actionLabel="Retry spending trend"
                onRetry={() => void trends.refetch()}
              />
            ) : hasTrendData ? (
              <>
                <div className="h-[320px] rounded-[10px] bg-muted/20 p-2">
                  <LazySpendingTrendChart
                    expenseSeries={trends.expenseSeries}
                    incomeSeries={trends.incomeSeries}
                    trendSlope={trends.trendSlope}
                    trendRSquared={trends.trendRSquared}
                    formatMoney={currency.formatMoney}
                    formatDate={currency.formatDate}
                  />
                </div>
                <div className="mt-3">
                  <AccessibleDataSummary
                    caption="Spending trend values"
                    columns={['Date', 'Spending', 'Income']}
                    rows={trendTableRows}
                  />
                </div>
              </>
            ) : (
              <p className="rounded-[10px] bg-muted/40 p-4 text-sm text-muted-foreground">
                No trend data is available yet.
              </p>
            )}
          </div>
        </figure>

        <section
          aria-labelledby="spending-attention-heading"
          className="rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <SectionHeading
            id="spending-attention-heading"
            className="text-balance text-lg font-semibold text-foreground"
          >
            Spending attention
          </SectionHeading>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            Evidence worth reviewing, with coverage limits kept visible.
          </p>
          <div className="mt-4">
            {anomalies.loading ? (
              <LocalLoading label="Loading spending attention" />
            ) : anomalies.error ? (
              <LocalError
                message={anomalies.error}
                actionLabel="Retry spending attention"
                onRetry={() => void anomalies.refetch()}
              />
            ) : (
              <AnalyticsAttentionSummary
                primary={anomalies.primaryAttention}
                anomalyCount={anomalies.data?.length ?? 0}
                anomalousCents={anomalyCents(anomalies.totalAnomalousSpend)}
                coveredCategoryCount={coveredCategoryCount}
                uncoveredCategoryCount={uncoveredCategoryCount}
                formatMoney={currency.formatMoney}
                attentionUrl={attentionUrl}
                headingLevel={scope.kind === 'personal' ? 3 : 4}
              />
            )}
          </div>
        </section>
      </div>

      <figure
        aria-labelledby="money-flow-heading"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <figcaption>
          <SectionHeading
            id="money-flow-heading"
            className="text-balance text-lg font-semibold text-foreground"
          >
            Money flow
          </SectionHeading>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            {waterfall.periodLabel ||
              'Income through spending to the period balance'}
          </p>
        </figcaption>
        <div className="mt-4">
          {waterfall.loading ? (
            <LocalLoading label="Loading money flow" />
          ) : waterfall.error ? (
            <LocalError
              message={waterfall.error}
              actionLabel="Retry money flow"
              onRetry={() => void waterfall.refetch()}
            />
          ) : waterfall.data && waterfall.data.length > 0 ? (
            <>
              <div className="h-[340px] rounded-[10px] bg-muted/20 p-2">
                <LazyWaterfallChart
                  data={waterfall.data}
                  formatMoney={currency.formatMoney}
                />
              </div>
              <div className="mt-3">
                <AccessibleDataSummary
                  caption="Money flow values"
                  columns={['Step', 'Amount', 'Type', 'Running total']}
                  rows={flowRows}
                />
              </div>
            </>
          ) : (
            <p className="rounded-[10px] bg-muted/40 p-4 text-sm text-muted-foreground">
              No money-flow data is available yet.
            </p>
          )}
        </div>
      </figure>

      {scope.kind === 'group' ? (
        groupSummary.loading ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-balance text-lg font-semibold text-foreground">
              Group settlement
            </h3>
            <div className="mt-4">
              <LocalLoading label="Loading group settlement" />
            </div>
          </section>
        ) : groupSummary.error ? (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-balance text-lg font-semibold text-foreground">
              Group settlement
            </h3>
            <div className="mt-4">
              <LocalError
                message={groupSummary.error}
                actionLabel="Retry group settlement"
                onRetry={() => void groupSummary.refetch()}
              />
            </div>
          </section>
        ) : groupSummary.data ? (
          <GroupSettlementPanel
            scope={scope}
            summary={groupSummary.data}
            formatMoney={currency.formatMoney}
          />
        ) : (
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h3 className="text-balance text-lg font-semibold text-foreground">
              Group settlement
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              No settlement summary is available for this period.
            </p>
          </section>
        )
      ) : null}
    </div>
  );
}

function OverviewGate({ scope, period, currency }: AnalyticsViewProps) {
  const overview = useAnalyticsOverview(scope, period);

  if (overview.loading) {
    return <AnalyticsChartSkeleton label="Loading analytics overview" />;
  }
  if (overview.error) {
    return (
      <AnalyticsErrorState
        message={overview.error}
        onRetry={() => void overview.refetch()}
        headingLevel={scope.kind === 'personal' ? 2 : 3}
      />
    );
  }
  if (!overview.data) {
    return <AnalyticsChartSkeleton label="Loading analytics overview" />;
  }
  if (!overview.data.hasCurrentData) {
    return (
      <AnalyticsEmptyState
        scope={scope}
        missing={missingCurrentData(overview.data)}
      />
    );
  }

  const loadedKey = scopeKey(scope) + ':' + period + ':loaded';
  return (
    <LoadedOverview
      key={loadedKey}
      scope={scope}
      period={period}
      currency={currency}
      overview={overview.data}
    />
  );
}

export function OverviewAnalyticsView(props: AnalyticsViewProps) {
  const key = scopeKey(props.scope) + ':' + props.period;
  return <OverviewGate key={key} {...props} />;
}
