'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import LazyCategoryRadarChart from '@/app/components/charts/LazyCategoryRadarChart';
import { useAnalyticsOverview } from '@/app/metrics/hooks/useAnalyticsOverview';
import { useCategoryComparison } from '@/app/metrics/hooks/useAnalyticsData';
import type {
  AnalyticsCombinedBudget,
  AnalyticsOverviewData,
  RadarAxis,
} from '@/app/metrics/types';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import {
  AnalyticsChartSkeleton,
  AnalyticsEmptyState,
  AnalyticsErrorState,
} from '../AnalyticsStates';
import {
  ANALYTICS_CATEGORY_SLUGS,
  buildAnalyticsExpenseUrl,
} from '../links';

import type { AnalyticsCategorySlug } from '../links';
import type {
  AnalyticsCurrencyContext,
  AnalyticsScope,
  AnalyticsViewProps,
} from '../types';

const CATEGORY_SLUGS = new Set<string>(ANALYTICS_CATEGORY_SLUGS);

function categorySlug(label: string): AnalyticsCategorySlug | null {
  const normalized = label.trim().toLowerCase();
  return CATEGORY_SLUGS.has(normalized)
    ? (normalized as AnalyticsCategorySlug)
    : null;
}

function validUtcBound(date: Date | null): string | null {
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

function authoritativeBounds(
  overview: AnalyticsOverviewData
): Readonly<{ from: string; to: string }> | null {
  const from = validUtcBound(overview.currentStart);
  const to = validUtcBound(overview.currentEnd);
  if (
    !from ||
    !to ||
    !overview.currentStart ||
    !overview.currentEnd ||
    overview.currentStart.getTime() >= overview.currentEnd.getTime()
  ) {
    return null;
  }
  return { from, to };
}

function formattedAmount(
  value: number,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  return Number.isFinite(value) ? formatMoney(value) : 'Not available';
}

function changeCopy(
  axis: RadarAxis,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  if (!Number.isFinite(axis.currentValue) || !Number.isFinite(axis.previousValue)) {
    return 'A period change is not available.';
  }
  const difference = axis.currentValue - axis.previousValue;
  if (difference === 0) return 'Unchanged from the previous period.';
  return `${formattedAmount(
    Math.abs(difference),
    formatMoney
  )} ${difference > 0 ? 'more' : 'less'} than the previous period.`;
}

function rankCategories(data: readonly RadarAxis[]): RadarAxis[] {
  return [...data].sort((left, right) => {
    const leftValue = Number.isFinite(left.currentValue)
      ? left.currentValue
      : Number.NEGATIVE_INFINITY;
    const rightValue = Number.isFinite(right.currentValue)
      ? right.currentValue
      : Number.NEGATIVE_INFINITY;
    return rightValue - leftValue || left.category.localeCompare(right.category);
  });
}

function chartAxes(
  data: readonly RadarAxis[],
  showBudgets: boolean
): RadarAxis[] {
  return data.map((axis) => ({
    ...axis,
    ...(showBudgets ? {} : { budgetValue: undefined }),
  }));
}

function summaryRows(
  data: readonly RadarAxis[],
  showBudgets: boolean,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): readonly (readonly string[])[] {
  return data.map((axis, index) => [
    String(index + 1),
    axis.category,
    formattedAmount(axis.currentValue, formatMoney),
    formattedAmount(axis.previousValue, formatMoney),
    changeCopy(axis, formatMoney),
    ...(showBudgets
      ? [
          axis.budgetValue === undefined
            ? 'Not available'
            : formattedAmount(axis.budgetValue, formatMoney),
        ]
      : []),
  ]);
}

function categoryUrl(
  scope: AnalyticsScope,
  category: string,
  bounds: Readonly<{ from: string; to: string }> | null
): string | null {
  const slug = categorySlug(category);
  if (!slug || !bounds) return null;
  return buildAnalyticsExpenseUrl(scope, {
    category: slug,
    from: bounds.from,
    to: bounds.to,
  });
}

function duplicateSafeBudgets(data: readonly AnalyticsCombinedBudget[]) {
  const occurrences = new Map<string, number>();
  return data.map((budget, index) => {
    const identity = budget.id.trim() || `${budget.name}:${index}`;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { budget, key: `${identity}:${occurrence}`, index };
  });
}

function CombinedBudgets({
  budgets,
  formatMoney,
}: Readonly<{
  budgets: readonly AnalyticsCombinedBudget[];
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
}>) {
  if (budgets.length === 0) return null;
  const entries = duplicateSafeBudgets(budgets);

  return (
    <section
      aria-labelledby="combined-budget-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h2
        id="combined-budget-heading"
        className="text-balance text-lg font-semibold text-foreground"
      >
        Combined budget context
      </h2>
      <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
        Budgets spanning several categories stay grouped here instead of being
        counted against every category.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {entries.map(({ budget, key, index }) => (
          <article key={key} className="rounded-[10px] bg-muted/40 p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {budget.name.trim() || `Combined budget ${index + 1}`}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {budget.categories.length > 0
                ? budget.categories.join(' · ')
                : 'Categories not specified'}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 tabular-nums">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Allowance
                </dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">
                  {formattedAmount(budget.allowance, formatMoney)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Current spend
                </dt>
                <dd className="mt-1 text-sm font-semibold text-foreground">
                  {formattedAmount(budget.currentSpend, formatMoney)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function CategoriesAnalyticsViewInner({
  scope,
  period,
  currency,
}: AnalyticsViewProps) {
  const [showBudgets, setShowBudgets] = useState(true);
  const overview = useAnalyticsOverview(scope, period);
  const comparison = useCategoryComparison(true, period, scope);

  if (overview.error) {
    return (
      <AnalyticsErrorState
        message={overview.error}
        onRetry={() => void overview.refetch()}
      />
    );
  }
  if (comparison.error) {
    return (
      <AnalyticsErrorState
        message={comparison.error}
        onRetry={() => void comparison.refetch()}
      />
    );
  }
  if (
    overview.loading ||
    comparison.loading ||
    overview.data === null ||
    comparison.data === null
  ) {
    return <AnalyticsChartSkeleton label="Loading category analytics" />;
  }
  if (comparison.data.length === 0) {
    return <AnalyticsEmptyState scope={scope} missing="expenses" />;
  }

  return (
    <CategoriesAnalyticsContent
      scope={scope}
      currency={currency}
      overview={overview.data}
      categories={comparison.data}
      combinedBudgets={comparison.combinedBudgets}
      showBudgets={showBudgets}
      onToggleBudgets={() => setShowBudgets((visible) => !visible)}
    />
  );
}

function CategoriesAnalyticsContent({
  scope,
  currency,
  overview,
  categories,
  combinedBudgets,
  showBudgets,
  onToggleBudgets,
}: Readonly<{
  scope: AnalyticsScope;
  currency: AnalyticsCurrencyContext;
  overview: AnalyticsOverviewData;
  categories: readonly RadarAxis[];
  combinedBudgets: readonly AnalyticsCombinedBudget[];
  showBudgets: boolean;
  onToggleBudgets: () => void;
}>) {
  const ranked = useMemo(() => rankCategories(categories), [categories]);
  const visualAxes = useMemo(
    () => chartAxes(categories, showBudgets),
    [categories, showBudgets]
  );
  const rows = useMemo(
    () => summaryRows(ranked, showBudgets, currency.formatMoney),
    [currency.formatMoney, ranked, showBudgets]
  );
  const bounds = authoritativeBounds(overview);
  const scopeLabel =
    scope.kind === 'group' ? scope.groupName.trim() || 'This group' : 'Your finances';

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">{scopeLabel}</p>
          <h2 className="mt-1 text-balance text-2xl font-semibold text-foreground">
            Category comparison
          </h2>
        </div>
        <p className="max-w-xl text-pretty text-sm text-muted-foreground sm:text-right">
          Compare this period with the previous one and keep budget context visible.
        </p>
      </header>

      <figure
        aria-labelledby="category-comparison-heading"
        className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <figcaption className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3
              id="category-comparison-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Current and previous spending
            </h3>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              Every axis uses the same category response and selected period.
            </p>
          </div>
          <button
            type="button"
            aria-pressed={showBudgets}
            onClick={onToggleBudgets}
            className="min-h-10 shrink-0 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {showBudgets ? 'Hide budget comparison' : 'Show budget comparison'}
          </button>
        </figcaption>
        <div className="mt-4 h-[380px] min-w-0 overflow-hidden rounded-[10px] bg-muted/20 p-2">
          <LazyCategoryRadarChart
            data={visualAxes}
            formatMoney={currency.formatMoney}
          />
        </div>
        <div className="mt-3">
          <AccessibleDataSummary
            caption="Ranked category comparison values"
            columns={[
              'Rank',
              'Category',
              'Current',
              'Previous',
              'Change',
              ...(showBudgets ? ['Budget'] : []),
            ]}
            rows={rows}
          />
        </div>
      </figure>

      <section
        aria-labelledby="category-drivers-heading"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <h2
          id="category-drivers-heading"
          className="text-balance text-lg font-semibold text-foreground"
        >
          Ranked category drivers
        </h2>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          Ordered by current-period spending.
        </p>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {ranked.map((axis, index) => {
            const href = categoryUrl(scope, axis.category, bounds);
            return (
              <li
                key={`${axis.category}:${index}`}
                className="rounded-[10px] bg-muted/40 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      <span className="mr-2 tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      {axis.category}
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-foreground">
                      {formattedAmount(axis.currentValue, currency.formatMoney)}
                    </p>
                    <p className="mt-1 text-pretty text-xs text-muted-foreground">
                      {changeCopy(axis, currency.formatMoney)}
                    </p>
                  </div>
                  {href ? (
                    <Link
                      href={href}
                      className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
                    >
                      Review {axis.category} spending
                    </Link>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="inline-flex min-h-10 shrink-0 items-center rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground"
                    >
                      Review {axis.category} spending
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <CombinedBudgets
        budgets={combinedBudgets}
        formatMoney={currency.formatMoney}
      />
    </div>
  );
}

export function CategoriesAnalyticsView(props: AnalyticsViewProps) {
  const scopeKey =
    props.scope.kind === 'group'
      ? `group:${props.scope.groupId}`
      : 'personal';
  return (
    <CategoriesAnalyticsViewInner
      key={`${scopeKey}:${props.period}`}
      {...props}
    />
  );
}
