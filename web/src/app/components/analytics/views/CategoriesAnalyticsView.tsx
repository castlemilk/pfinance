'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

import LazyCategoryRadarChart from '@/app/components/charts/LazyCategoryRadarChart';
import { useAnalyticsOverview } from '@/app/metrics/hooks/useAnalyticsOverview';
import { useCategoryComparison } from '@/app/metrics/hooks/useAnalyticsData';
import type { AnalyticsOverviewData, RadarAxis } from '@/app/metrics/types';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import {
  hasCategoryBudgets,
  normalizeCategoryAxes,
  normalizeCombinedBudgets,
} from '../categoryAnalyticsModel';
import type { NormalizedCombinedBudget } from '../categoryAnalyticsModel';
import {
  AnalyticsChartSkeleton,
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

type HeadingLevel = 2 | 3 | 4 | 5;

function Heading({
  level,
  ...props
}: Readonly<
  { level: HeadingLevel } & React.HTMLAttributes<HTMLHeadingElement>
>) {
  const Tag = `h${level}` as const;
  return <Tag {...props} />;
}

function headingLevels(scope: AnalyticsScope) {
  return scope.kind === 'group'
    ? ({ view: 3, section: 4, card: 5 } as const)
    : ({ view: 2, section: 3, card: 4 } as const);
}

function displayScope(scope: AnalyticsScope): AnalyticsScope {
  if (scope.kind === 'personal') return scope;
  return {
    ...scope,
    groupName: scope.groupName.trim() || 'This group',
  };
}

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
  return formatMoney(value);
}

function formattedFinancialAmount(
  value: number | null,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  return value === null ? 'Not available' : formatMoney(value);
}

function changeCopy(
  axis: RadarAxis,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  const difference = axis.currentValue - axis.previousValue;
  if (difference === 0) return 'Unchanged from the previous period.';
  return `${formattedAmount(
    Math.abs(difference),
    formatMoney
  )} ${difference > 0 ? 'more' : 'less'} than the previous period.`;
}

function rankCategories(data: readonly RadarAxis[]): readonly RadarAxis[] {
  return Object.freeze(
    [...data].sort(
      (left, right) =>
        right.currentValue - left.currentValue ||
        left.category.localeCompare(right.category)
    )
  );
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

function CategoriesHeader({
  scope,
  level,
}: Readonly<{ scope: AnalyticsScope; level: HeadingLevel }>) {
  const scopeLabel =
    scope.kind === 'group' ? scope.groupName : 'Your finances';
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="inline-flex border-l-2 border-primary pl-2 text-sm font-medium text-foreground">
          {scopeLabel}
        </p>
        <Heading
          level={level}
          className="mt-1 text-balance text-2xl font-semibold text-foreground"
        >
          Category comparison
        </Heading>
      </div>
      <p className="max-w-xl text-pretty text-sm text-muted-foreground sm:text-right">
        Compare this period with the previous one and keep budget context visible.
      </p>
    </header>
  );
}

function CategoryEmptyState({
  scope,
  headingLevel,
}: Readonly<{ scope: AnalyticsScope; headingLevel: HeadingLevel }>) {
  const periodScope =
    scope.kind === 'group'
      ? `${scope.groupName} during this analytics period`
      : 'this analytics period';
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <Heading
        level={headingLevel}
        className="text-balance text-xl font-semibold text-foreground"
      >
        No spending for this period
      </Heading>
      <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
        No expenses are available for {periodScope}.
      </p>
      <Link
        href={buildAnalyticsExpenseUrl(scope, {})}
        className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        {scope.kind === 'group' ? 'Add a group expense' : 'Add an expense'}
      </Link>
    </section>
  );
}

function CombinedBudgets({
  budgets,
  formatMoney,
  sectionHeadingLevel,
  cardHeadingLevel,
}: Readonly<{
  budgets: readonly NormalizedCombinedBudget[];
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
  sectionHeadingLevel: HeadingLevel;
  cardHeadingLevel: HeadingLevel;
}>) {
  if (budgets.length === 0) return null;

  return (
    <section
      aria-labelledby="combined-budget-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <Heading
        level={sectionHeadingLevel}
        id="combined-budget-heading"
        className="text-balance text-lg font-semibold text-foreground"
      >
        Combined budget context
      </Heading>
      <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
        Budgets spanning several categories stay grouped here instead of being
        counted against every category.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {budgets.map((budget) => (
          <article key={budget.key} className="min-w-0 rounded-[10px] bg-muted/40 p-4">
            <Heading
              level={cardHeadingLevel}
              className="break-words text-sm font-semibold text-foreground"
            >
              {budget.name}
            </Heading>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {budget.categories.length > 0
                ? budget.categories.join(', ')
                : 'Categories not specified'}
            </p>
            <dl className="mt-3 grid grid-cols-1 gap-3 font-mono tabular-nums sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Allowance
                </dt>
                <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                  {formattedFinancialAmount(budget.allowance, formatMoney)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Current spend
                </dt>
                <dd className="mt-1 break-words text-sm font-semibold text-foreground">
                  {formattedFinancialAmount(budget.currentSpend, formatMoney)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function CategoryComparisonFigure({
  axes,
  currency,
  hasBudgets,
  showBudgets,
  sectionHeadingLevel,
  onToggleBudgets,
}: Readonly<{
  axes: readonly RadarAxis[];
  currency: AnalyticsCurrencyContext;
  hasBudgets: boolean;
  showBudgets: boolean;
  sectionHeadingLevel: HeadingLevel;
  onToggleBudgets: () => void;
}>) {
  const rows = useMemo(
    () => summaryRows(axes, showBudgets, currency.formatMoney),
    [axes, currency.formatMoney, showBudgets]
  );
  return (
    <figure
      aria-labelledby="category-comparison-heading"
      className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <figcaption className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Heading
            level={sectionHeadingLevel}
            id="category-comparison-heading"
            className="text-balance text-lg font-semibold text-foreground"
          >
            Current and previous spending
          </Heading>
          <p className="mt-1 text-pretty text-sm text-muted-foreground">
            Every axis uses the same categories and selected period.
          </p>
        </div>
        {hasBudgets ? (
          <button
            type="button"
            aria-pressed={showBudgets}
            onClick={onToggleBudgets}
            className="min-h-10 w-full shrink-0 rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] sm:w-auto motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            {showBudgets ? 'Hide category budgets' : 'Show category budgets'}
          </button>
        ) : null}
      </figcaption>
      <div
        data-testid="category-chart-frame"
        className="mt-4 min-h-[380px] min-w-0 overflow-visible rounded-[10px] bg-muted/20 p-2"
      >
        <LazyCategoryRadarChart
          data={axes}
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
  );
}

function CategoryDrivers({
  axes,
  scope,
  bounds,
  currency,
  sectionHeadingLevel,
  cardHeadingLevel,
}: Readonly<{
  axes: readonly RadarAxis[];
  scope: AnalyticsScope;
  bounds: Readonly<{ from: string; to: string }> | null;
  currency: AnalyticsCurrencyContext;
  sectionHeadingLevel: HeadingLevel;
  cardHeadingLevel: HeadingLevel;
}>) {
  return (
    <section
      aria-labelledby="category-drivers-heading"
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <Heading
        level={sectionHeadingLevel}
        id="category-drivers-heading"
        className="text-balance text-lg font-semibold text-foreground"
      >
        Ranked category drivers
      </Heading>
      <p className="mt-1 text-pretty text-sm text-muted-foreground">
        Ordered by current-period spending.
      </p>
      <ol className="mt-4 grid gap-3 md:grid-cols-2">
        {axes.map((axis, index) => {
          const href = categoryUrl(scope, axis.category, bounds);
          return (
            <li
              key={axis.category}
              className="min-w-0 rounded-[10px] bg-muted/40 p-4"
            >
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <Heading
                    level={cardHeadingLevel}
                    className="break-words text-sm font-semibold text-foreground"
                  >
                    <span
                      aria-hidden="true"
                      className="mr-2 font-mono tabular-nums text-muted-foreground"
                    >
                      {index + 1}.
                    </span>
                    {axis.category}
                  </Heading>
                  <p className="mt-1 break-words font-mono text-sm tabular-nums text-foreground">
                    {formattedAmount(axis.currentValue, currency.formatMoney)}
                  </p>
                  <p className="mt-1 text-pretty text-xs text-muted-foreground">
                    {changeCopy(axis, currency.formatMoney)}
                  </p>
                </div>
                {href ? (
                  <Link
                    href={href}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-border bg-background px-3 text-center text-xs font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] sm:w-auto motion-reduce:transition-none motion-reduce:active:scale-100"
                  >
                    Review {axis.category} spending
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-md border border-border px-3 text-center text-xs font-semibold text-muted-foreground sm:w-auto"
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
  );
}

function CategoriesAnalyticsContent({
  scope,
  currency,
  overview,
  categories,
  combinedBudgets,
}: Readonly<{
  scope: AnalyticsScope;
  currency: AnalyticsCurrencyContext;
  overview: AnalyticsOverviewData;
  categories: readonly RadarAxis[];
  combinedBudgets: Parameters<typeof normalizeCombinedBudgets>[0];
}>) {
  const [showBudgets, setShowBudgets] = useState(true);
  const levels = headingLevels(scope);
  const normalizedAxes = useMemo(
    () => normalizeCategoryAxes(categories),
    [categories]
  );
  const normalizedBudgets = useMemo(
    () => normalizeCombinedBudgets(combinedBudgets),
    [combinedBudgets]
  );
  const hasBudgets = hasCategoryBudgets(normalizedAxes);
  const budgetsVisible = hasBudgets && showBudgets;
  const presentationAxes = useMemo(
    () =>
      rankCategories(
        normalizeCategoryAxes(normalizedAxes, {
          includeBudgets: budgetsVisible,
        })
      ),
    [budgetsVisible, normalizedAxes]
  );
  const bounds = authoritativeBounds(overview);

  return (
    <div className="space-y-5">
      <CategoriesHeader scope={scope} level={levels.view} />

      {normalizedAxes.length === 0 ? (
        <CategoryEmptyState scope={scope} headingLevel={levels.section} />
      ) : (
        <>
          <CategoryComparisonFigure
            axes={presentationAxes}
            currency={currency}
            hasBudgets={hasBudgets}
            showBudgets={budgetsVisible}
            sectionHeadingLevel={levels.section}
            onToggleBudgets={() => setShowBudgets((visible) => !visible)}
          />
          <CategoryDrivers
            axes={presentationAxes}
            scope={scope}
            bounds={bounds}
            currency={currency}
            sectionHeadingLevel={levels.section}
            cardHeadingLevel={levels.card}
          />
        </>
      )}

      <CombinedBudgets
        budgets={normalizedBudgets}
        formatMoney={currency.formatMoney}
        sectionHeadingLevel={levels.section}
        cardHeadingLevel={levels.card}
      />
    </div>
  );
}

function CategoriesAnalyticsViewInner({
  scope,
  period,
  currency,
}: AnalyticsViewProps) {
  const overview = useAnalyticsOverview(scope, period);
  const comparison = useCategoryComparison(true, period, scope);

  if (overview.error) {
    return (
      <AnalyticsErrorState
        message={overview.error}
        onRetry={() => void overview.refetch()}
        headingLevel={scope.kind === 'personal' ? 2 : 3}
      />
    );
  }
  if (comparison.error) {
    return (
      <AnalyticsErrorState
        message={comparison.error}
        onRetry={() => void comparison.refetch()}
        headingLevel={scope.kind === 'personal' ? 2 : 3}
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

  return (
    <CategoriesAnalyticsContent
      scope={displayScope(scope)}
      currency={currency}
      overview={overview.data}
      categories={comparison.data}
      combinedBudgets={comparison.combinedBudgets}
    />
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
