import Link from 'next/link';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

import { buildAnalyticsExpenseUrl } from './links';

import type { AnalyticsScope } from './types';

type AnalyticsChartSkeletonProps = {
  label?: string;
};

type AnalyticsErrorStateProps = {
  message: string;
  onRetry: () => void;
};

type AnalyticsEmptyStateProps = {
  scope: AnalyticsScope;
  missing: 'expenses' | 'income' | 'both';
  action?: { href: string; label: string };
};

type AnalyticsInsufficientStateProps = {
  title: string;
  coveredCategories: readonly string[];
  uncoveredCategories: readonly string[];
};

const BUTTON_STYLE = {
  backgroundColor: 'var(--background)',
  backgroundImage: 'none',
  transitionProperty:
    'color, background-color, border-color, box-shadow, transform',
} as const;

const METRIC_SKELETONS = ['income', 'expenses', 'net', 'driver'] as const;
const CHART_BARS = ['bar-a', 'bar-b', 'bar-c', 'bar-d', 'bar-e'] as const;

function duplicateSafeEntries(values: readonly string[], prefix: string) {
  const occurrences = new Map<string, number>();

  return values.map((value) => {
    const occurrence = occurrences.get(value) ?? 0;
    occurrences.set(value, occurrence + 1);
    return { key: `${prefix}:${value}:${occurrence}`, value };
  });
}

export function AnalyticsChartSkeleton({
  label = 'Loading analytics',
}: AnalyticsChartSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      role="status"
      className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        data-testid="analytics-skeleton-geometry"
        className="space-y-5"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {METRIC_SKELETONS.map((metric) => (
            <div
              key={metric}
              data-testid="analytics-metric-skeleton"
              className="rounded-[10px] bg-muted/40 p-3"
            >
              <Skeleton className="h-3 w-20 motion-reduce:animate-none" />
              <Skeleton className="mt-3 h-7 w-28 motion-reduce:animate-none" />
            </div>
          ))}
        </div>
        <div
          data-testid="analytics-chart-skeleton"
          className="rounded-[10px] bg-muted/40 p-4"
        >
          <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
          <div className="mt-6 flex h-48 items-end gap-3 border-b border-l border-border px-3 pt-4">
            {CHART_BARS.map((bar, index) => (
              <Skeleton
                key={bar}
                className="flex-1 motion-reduce:animate-none"
                style={{ height: `${32 + index * 12}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsErrorState({
  message,
  onRetry,
}: AnalyticsErrorStateProps) {
  return (
    <Alert
      variant="destructive"
      className="rounded-2xl bg-card p-5 shadow-sm"
    >
      <h2 className="text-balance text-lg font-semibold text-foreground">
        Analytics could not load
      </h2>
      <AlertDescription className="mt-2 text-pretty text-destructive">
        <p>{message}</p>
      </AlertDescription>
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onRetry}
        className="mt-4 min-h-10 normal-case tracking-normal transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
        style={BUTTON_STYLE}
      >
        Try again
      </Button>
    </Alert>
  );
}

function defaultEmptyAction(
  scope: AnalyticsScope,
  missing: AnalyticsEmptyStateProps['missing']
) {
  if (missing === 'income') {
    return {
      href: scope.kind === 'group' ? '/shared/income' : '/personal/income',
      label: scope.kind === 'group' ? 'Add group income' : 'Add income',
    };
  }

  return {
    href: buildAnalyticsExpenseUrl(scope, {}),
    label: scope.kind === 'group' ? 'Add a group expense' : 'Add an expense',
  };
}

function emptyStateCopy(
  scope: AnalyticsScope,
  missing: AnalyticsEmptyStateProps['missing']
) {
  const scopeSuffix =
    scope.kind === 'group' ? ` for ${scope.groupName || 'this group'}` : '';

  switch (missing) {
    case 'expenses':
      return {
        title: 'Spending needs transactions',
        description: `No expenses have been recorded${scopeSuffix} yet.`,
      };
    case 'income':
      return {
        title: 'Income needs transactions',
        description: `No income has been recorded${scopeSuffix} yet.`,
      };
    case 'both':
      return {
        title: 'Analytics needs transactions',
        description: `No income or expenses have been recorded${scopeSuffix} yet.`,
      };
  }
}

export function AnalyticsEmptyState({
  scope,
  missing,
  action,
}: AnalyticsEmptyStateProps) {
  const copy = emptyStateCopy(scope, missing);
  const resolvedAction = action ?? defaultEmptyAction(scope, missing);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-balance text-xl font-semibold text-foreground">
        {copy.title}
      </h2>
      <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
        {copy.description}
      </p>
      <Button
        asChild
        variant="outline"
        size="lg"
        className="mt-5 min-h-10 normal-case tracking-normal transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Link href={resolvedAction.href} style={BUTTON_STYLE}>
          {resolvedAction.label}
        </Link>
      </Button>
    </section>
  );
}

export function AnalyticsInsufficientState({
  title,
  coveredCategories,
  uncoveredCategories,
}: AnalyticsInsufficientStateProps) {
  const coveredEntries = duplicateSafeEntries(coveredCategories, 'covered');
  const uncoveredEntries = duplicateSafeEntries(
    uncoveredCategories,
    'uncovered'
  );
  const hasCoverageGap = uncoveredCategories.length > 0;
  const coverageMessage = hasCoverageGap
    ? 'More history is needed before every category can be assessed.'
    : 'Coverage details are incomplete. More history is needed before drawing conclusions.';

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-balance text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
        {coverageMessage}
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <section className="rounded-[10px] bg-muted/40 p-4">
          <h3 className="text-balance text-sm font-semibold text-foreground">
            Covered categories{' '}
            <span className="tabular-nums">({coveredCategories.length})</span>
          </h3>
          <ul
            aria-label="Covered categories"
            className="mt-2 space-y-1 text-sm text-muted-foreground"
          >
            {coveredEntries.length > 0 ? (
              coveredEntries.map(({ key, value }) => <li key={key}>{value}</li>)
            ) : (
              <li>None yet</li>
            )}
          </ul>
        </section>

        <section className="rounded-[10px] bg-muted/40 p-4">
          <h3 className="text-balance text-sm font-semibold text-foreground">
            Categories needing history{' '}
            <span className="tabular-nums">({uncoveredCategories.length})</span>
          </h3>
          <ul
            aria-label="Categories needing history"
            className="mt-2 space-y-1 text-sm text-muted-foreground"
          >
            {uncoveredEntries.length > 0 ? (
              uncoveredEntries.map(({ key, value }) => (
                <li key={key}>{value}</li>
              ))
            ) : (
              <li>None reported</li>
            )}
          </ul>
        </section>
      </div>
    </section>
  );
}
