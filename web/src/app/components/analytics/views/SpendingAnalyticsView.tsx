'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import LazyCategoryStackedTrendChart from '@/app/components/charts/LazyCategoryStackedTrendChart';
import LazySpendingHeatmap from '@/app/components/charts/LazySpendingHeatmap';
import LazySpendingTrendChart from '@/app/components/charts/LazySpendingTrendChart';
import {
  useCategorySpendingTrends,
  useHeatmapData,
  useSpendingTrends,
} from '@/app/metrics/hooks/useAnalyticsData';
import type {
  CategoryStackedTrendPoint,
  HeatmapData,
} from '@/app/metrics/types';

import {
  normalizeCategoryStackedTrendData,
  normalizeHeatmapData,
  normalizeTrendSeries,
} from '@/app/components/charts/spendingChartModels';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import { buildAnalyticsExpenseUrl } from '../links';
import {
  analyticsHeatmapRange,
  getAnalyticsPeriodConfig,
} from '../periods';
import type {
  AnalyticsCurrencyContext,
  AnalyticsViewProps,
} from '../types';

type TrendPoint = Readonly<{ date: string; value: number }>;

function nextUtcMidnightDelay(nowMilliseconds: number): number {
  const now = new Date(nowMilliseconds);
  const next = new Date(nowMilliseconds);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1_000, next.getTime() - now.getTime());
}

function useUtcRangeAnchor(): Date {
  const [anchorMilliseconds, setAnchorMilliseconds] = useState(() => Date.now());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      timeout = setTimeout(() => {
        setAnchorMilliseconds(Date.now());
        schedule();
      }, nextUtcMidnightDelay(Date.now()));
    };
    schedule();
    return () => {
      if (timeout !== null) clearTimeout(timeout);
    };
  }, []);

  return useMemo(() => new Date(anchorMilliseconds), [anchorMilliseconds]);
}

function PanelLoading({ label }: Readonly<{ label: string }>) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-48 items-center justify-center rounded-[10px] bg-muted/40 p-4 text-sm text-muted-foreground"
    >
      <span className="motion-safe:animate-pulse motion-reduce:animate-none">
        {label}
      </span>
    </div>
  );
}

function PanelError({
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
      className="min-h-48 rounded-[10px] border border-destructive/40 bg-destructive/5 p-4"
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

function PanelEmpty({ children }: Readonly<{ children: string }>) {
  return (
    <p className="min-h-48 rounded-[10px] bg-muted/40 p-4 text-pretty text-sm text-muted-foreground">
      {children}
    </p>
  );
}

function heatmapHasActivity(data: HeatmapData | null): data is HeatmapData {
  return Boolean(
    data?.days.some(
      (day) =>
        (Number.isFinite(day.value) && day.value !== 0) ||
        (Number.isFinite(day.count) && day.count !== 0)
    )
  );
}

function heatmapRows(
  data: HeatmapData,
  currency: AnalyticsCurrencyContext
): readonly (readonly string[])[] {
  return [...data.days]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => [
      currency.formatDate(day.date, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      currency.formatMoney(day.value),
      String(day.count),
    ]);
}

function trendRows(
  expenseSeries: readonly TrendPoint[],
  incomeSeries: readonly TrendPoint[],
  currency: AnalyticsCurrencyContext
): readonly (readonly string[])[] {
  const byDate = new Map<string, { expense?: number; income?: number }>();
  for (const point of expenseSeries) {
    byDate.set(point.date, { ...byDate.get(point.date), expense: point.value });
  }
  for (const point of incomeSeries) {
    byDate.set(point.date, { ...byDate.get(point.date), income: point.value });
  }
  return [...byDate.entries()]
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

function categoryRows(
  points: readonly CategoryStackedTrendPoint[],
  categories: readonly string[],
  currency: AnalyticsCurrencyContext
): readonly (readonly string[])[] {
  return [...points]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((point) => [
      currency.formatDate(point.date, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
      currency.formatMoney(point.total),
      ...categories.map((category) =>
        currency.formatMoney(point.categories[category] ?? 0)
      ),
    ]);
}

function SpendingAnalyticsContent({
  scope,
  period,
  currency,
}: AnalyticsViewProps) {
  const router = useRouter();
  const config = getAnalyticsPeriodConfig(period);
  const rangeAnchor = useUtcRangeAnchor();
  const { startDate, endDate } = useMemo(
    () => analyticsHeatmapRange(period, rangeAnchor),
    [period, rangeAnchor]
  );
  const heatmap = useHeatmapData(startDate, endDate, scope);
  const trends = useSpendingTrends(
    config.trendGranularity,
    config.trendPeriods,
    undefined,
    scope
  );
  const categoryTrends = useCategorySpendingTrends(
    config.trendGranularity,
    config.trendPeriods,
    scope
  );

  const normalizedHeatmap = useMemo(
    () => (heatmap.data ? normalizeHeatmapData(heatmap.data) : null),
    [heatmap.data]
  );
  const expenseTrendModel = useMemo(
    () => normalizeTrendSeries(trends.expenseSeries),
    [trends.expenseSeries]
  );
  const incomeTrendModel = useMemo(
    () => normalizeTrendSeries(trends.incomeSeries),
    [trends.incomeSeries]
  );
  const normalizedExpenseSeries = expenseTrendModel.series;
  const normalizedIncomeSeries = incomeTrendModel.series;
  const normalizedCategoryTrends = useMemo(
    () =>
      normalizeCategoryStackedTrendData(
        categoryTrends.points,
        categoryTrends.categories
      ),
    [categoryTrends.categories, categoryTrends.points]
  );
  const heatmapData = heatmapHasActivity(normalizedHeatmap)
    ? normalizedHeatmap
    : null;
  const hasHeatmap = heatmapData !== null;
  const hasTrends =
    normalizedExpenseSeries.length > 0 || normalizedIncomeSeries.length > 0;
  const hasCategoryTrends =
    normalizedCategoryTrends.points.length > 0 &&
    normalizedCategoryTrends.categories.length > 0;
  const dailyRows = useMemo(
    () => (heatmapData ? heatmapRows(heatmapData, currency) : []),
    [currency, heatmapData]
  );
  const spendingRows = useMemo(
    () => trendRows(normalizedExpenseSeries, normalizedIncomeSeries, currency),
    [currency, normalizedExpenseSeries, normalizedIncomeSeries]
  );
  const mixRows = useMemo(
    () =>
      categoryRows(
        normalizedCategoryTrends.points,
        normalizedCategoryTrends.categories,
        currency
      ),
    [currency, normalizedCategoryTrends]
  );
  const handleDayClick = useCallback(
    (date: string) => {
      router.push(buildAnalyticsExpenseUrl(scope, { date }));
    },
    [router, scope]
  );
  const scopeLabel =
    scope.kind === 'group' ? scope.groupName.trim() || 'Group' : 'Your finances';
  const cadence = config.trendGranularity === 'week' ? 'Weekly' : 'Monthly';
  const ViewHeading = scope.kind === 'personal' ? 'h2' : 'h3';
  const PanelHeading = scope.kind === 'personal' ? 'h3' : 'h4';

  return (
    <div className="space-y-5">
      <header
        data-testid="spending-view-header"
        className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      >
        <div className="min-w-0">
          <p className="inline-flex border-l-2 border-primary pl-2 text-sm font-medium text-foreground">
            {scopeLabel}
          </p>
          <ViewHeading className="mt-1 text-balance text-2xl font-semibold text-foreground">
            Spending patterns
          </ViewHeading>
        </div>
        <p className="max-w-xl text-pretty text-sm text-muted-foreground sm:text-right">
          Follow daily activity, the overall direction, and the categories shaping it.
        </p>
      </header>

      <div className="grid min-w-0 gap-5 xl:grid-cols-2">
        <figure
          aria-labelledby="daily-spending-heading"
          className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-2"
        >
          <figcaption>
            <PanelHeading
              id="daily-spending-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Daily spending
            </PanelHeading>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              A UTC calendar view of each day in the selected window.
            </p>
          </figcaption>
          <div className="mt-4">
            {heatmap.loading ? (
              <PanelLoading label="Loading daily spending" />
            ) : heatmap.error ? (
              <PanelError
                message={heatmap.error}
                actionLabel="Retry daily spending"
                onRetry={() => void heatmap.refetch()}
              />
            ) : hasHeatmap ? (
              <>
                <div
                  data-testid="spending-chart-region"
                  className="h-[260px] min-w-0 overflow-hidden rounded-[10px] bg-muted/20 p-2 sm:h-[300px]"
                >
                  <LazySpendingHeatmap
                    data={heatmapData}
                    onDayClick={handleDayClick}
                    formatMoney={currency.formatMoney}
                    formatDate={currency.formatDate}
                  />
                </div>
                <div className="mt-3">
                  <AccessibleDataSummary
                    caption="Daily spending values"
                    columns={['Date', 'Spending', 'Transactions']}
                    rows={dailyRows}
                  />
                </div>
              </>
            ) : (
              <PanelEmpty>No daily spending is available yet.</PanelEmpty>
            )}
          </div>
        </figure>

        <figure
          aria-labelledby="spending-trend-heading"
          className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <figcaption>
            <PanelHeading
              id="spending-trend-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Spending trend
            </PanelHeading>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              {cadence} spending and income across the selected history.
            </p>
          </figcaption>
          <div className="mt-4">
            {trends.loading ? (
              <PanelLoading label="Loading spending trend" />
            ) : trends.error ? (
              <PanelError
                message={trends.error}
                actionLabel="Retry spending trend"
                onRetry={() => void trends.refetch()}
              />
            ) : hasTrends ? (
              <>
                <div
                  data-testid="spending-chart-region"
                  className="h-[320px] min-w-0 overflow-hidden rounded-[10px] bg-muted/20 p-2"
                >
                  <LazySpendingTrendChart
                    expenseSeries={normalizedExpenseSeries}
                    incomeSeries={normalizedIncomeSeries}
                    trendSlope={
                      expenseTrendModel.changed ? undefined : trends.trendSlope
                    }
                    trendRSquared={
                      expenseTrendModel.changed
                        ? undefined
                        : trends.trendRSquared
                    }
                    formatMoney={currency.formatMoney}
                    formatDate={currency.formatDate}
                  />
                </div>
                <div className="mt-3">
                  <AccessibleDataSummary
                    caption="Spending trend values"
                    columns={['Date', 'Spending', 'Income']}
                    rows={spendingRows}
                  />
                </div>
              </>
            ) : (
              <PanelEmpty>No spending trend is available yet.</PanelEmpty>
            )}
          </div>
        </figure>

        <figure
          aria-labelledby="category-mix-heading"
          className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <figcaption>
            <PanelHeading
              id="category-mix-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Category mix over time
            </PanelHeading>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              How each category contributes to total spending over time.
            </p>
          </figcaption>
          <div className="mt-4">
            {categoryTrends.loading ? (
              <PanelLoading label="Loading category mix" />
            ) : categoryTrends.error ? (
              <PanelError
                message={categoryTrends.error}
                actionLabel="Retry category mix"
                onRetry={() => void categoryTrends.refetch()}
              />
            ) : hasCategoryTrends ? (
              <>
                <div
                  data-testid="spending-chart-region"
                  className="h-[340px] min-w-0 overflow-hidden rounded-[10px] bg-muted/20 p-2"
                >
                  <LazyCategoryStackedTrendChart
                    points={normalizedCategoryTrends.points}
                    categories={normalizedCategoryTrends.categories}
                    formatMoney={currency.formatMoney}
                    formatDate={currency.formatDate}
                  />
                </div>
                <div className="mt-3">
                  <AccessibleDataSummary
                    caption="Category mix values"
                    columns={[
                      'Date',
                      'Total',
                      ...normalizedCategoryTrends.categories,
                    ]}
                    rows={mixRows}
                  />
                </div>
              </>
            ) : (
              <PanelEmpty>No category mix is available yet.</PanelEmpty>
            )}
          </div>
        </figure>
      </div>
    </div>
  );
}

function scopePeriodKey({ scope, period }: AnalyticsViewProps): string {
  const scopeIdentity =
    scope.kind === 'personal' ? 'personal' : `group:${scope.groupId}`;
  return `${scopeIdentity}:${period}`;
}

export function SpendingAnalyticsView(props: AnalyticsViewProps) {
  return <SpendingAnalyticsContent key={scopePeriodKey(props)} {...props} />;
}
