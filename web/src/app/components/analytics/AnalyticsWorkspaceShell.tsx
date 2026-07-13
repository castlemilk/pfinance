'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Tabs, TabsContent } from '@/components/ui/tabs';

import { AnalyticsViewNav } from './AnalyticsViewNav';

import type { AnalyticsPeriod, AnalyticsScope } from './types';

export type AnalyticsView =
  | 'overview'
  | 'spending'
  | 'categories'
  | 'attention'
  | 'forecast'
  | 'data-quality';

export const PERSONAL_ANALYTICS_VIEWS: readonly AnalyticsView[] = Object.freeze([
  'overview',
  'spending',
  'categories',
  'attention',
  'forecast',
  'data-quality',
]);

export const GROUP_ANALYTICS_VIEWS: readonly AnalyticsView[] = Object.freeze([
  'overview',
  'spending',
  'categories',
  'attention',
  'forecast',
]);

const ANALYTICS_VIEW_SET = new Set<AnalyticsView>(PERSONAL_ANALYTICS_VIEWS);
const ANALYTICS_PERIOD_SET = new Set<AnalyticsPeriod>([
  'month',
  'quarter',
  'year',
]);

export type AnalyticsWorkspaceShellProps = {
  scope: AnalyticsScope;
  period: AnalyticsPeriod;
  onPeriodChange: (period: AnalyticsPeriod) => void;
  activeView: AnalyticsView;
  onViewChange: (view: AnalyticsView) => void;
  availableViews: readonly AnalyticsView[];
  children: ReactNode;
};

function availableViewsForScope(
  scope: AnalyticsScope,
  availableViews: readonly AnalyticsView[]
): AnalyticsView[] {
  const seen = new Set<AnalyticsView>();

  return availableViews.filter((view): view is AnalyticsView => {
    if (
      !ANALYTICS_VIEW_SET.has(view) ||
      seen.has(view) ||
      (scope.kind === 'group' && view === 'data-quality')
    ) {
      return false;
    }

    seen.add(view);
    return true;
  });
}

export function AnalyticsWorkspaceShell({
  scope,
  period,
  onPeriodChange,
  activeView,
  onViewChange,
  availableViews,
  children,
}: AnalyticsWorkspaceShellProps) {
  const scopedViews = availableViewsForScope(scope, availableViews);
  const activeViewIsAvailable = scopedViews.includes(activeView);
  const fallbackView = scopedViews[0];
  const effectiveActiveView = activeViewIsAvailable
    ? activeView
    : fallbackView;
  const scopeIdentity =
    scope.kind === 'personal' ? 'personal' : `group:${scope.groupId}`;
  const normalizationKey =
    !activeViewIsAvailable && fallbackView
      ? JSON.stringify([scopeIdentity, activeView, fallbackView])
      : null;
  const lastNormalizationRef = useRef<string | null>(null);
  const onViewChangeRef = useRef(onViewChange);

  useEffect(() => {
    onViewChangeRef.current = onViewChange;
  }, [onViewChange]);

  useEffect(() => {
    if (!normalizationKey || !fallbackView) {
      lastNormalizationRef.current = null;
      return;
    }

    if (lastNormalizationRef.current === normalizationKey) {
      return;
    }

    lastNormalizationRef.current = normalizationKey;
    onViewChangeRef.current(fallbackView);
  }, [fallbackView, normalizationKey]);

  const headingId =
    scope.kind === 'personal'
      ? 'personal-analytics-heading'
      : 'group-analytics-heading';
  const title =
    scope.kind === 'personal'
      ? 'Personal analytics'
      : `${scope.groupName || 'Group'} analytics`;
  const description =
    scope.kind === 'personal'
      ? 'See what changed, what needs attention, and what to do next.'
      : `See shared income, spending, and financial direction for ${
          scope.groupName || 'this group'
        }.`;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="mb-2 text-sm font-medium text-primary">
            {scope.kind === 'personal' ? 'Personal scope' : 'Group scope'}
          </p>
          {scope.kind === 'personal' ? (
            <h1
              id={headingId}
              className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h1>
          ) : (
            <h2
              id={headingId}
              className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h2>
          )}
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>

        <label className="flex min-w-40 flex-col gap-2 text-sm font-medium text-foreground">
          <span>Period</span>
          <select
            aria-label="Analytics period"
            className="min-h-10 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground shadow-sm outline-none transition-[color,background-color,border-color,box-shadow] duration-150 ease-out focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:transition-none"
            value={period}
            onChange={(event) => {
              const nextPeriod = event.target.value;
              if (ANALYTICS_PERIOD_SET.has(nextPeriod as AnalyticsPeriod)) {
                onPeriodChange(nextPeriod as AnalyticsPeriod);
              }
            }}
          >
            <option value="month">Month</option>
            <option value="quarter">Quarter</option>
            <option value="year">Year</option>
          </select>
        </label>
      </header>

      <div className="mt-5 min-w-0">
        {effectiveActiveView ? (
          <Tabs
            value={effectiveActiveView}
            onValueChange={(value) => {
              if (scopedViews.includes(value as AnalyticsView)) {
                onViewChange(value as AnalyticsView);
              }
            }}
            className="min-w-0 gap-5"
          >
            <AnalyticsViewNav
              activeView={effectiveActiveView}
              availableViews={scopedViews}
            />
            {scopedViews.map((view) => (
              <TabsContent key={view} value={view} className="mt-0 min-w-0">
                {view === effectiveActiveView ? (
                  activeViewIsAvailable ? (
                    children
                  ) : (
                    <p
                      aria-live="polite"
                      role="status"
                      className="text-pretty text-sm text-muted-foreground"
                    >
                      Updating the analytics view.
                    </p>
                  )
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="space-y-5">
            <AnalyticsViewNav
              activeView={activeView}
              availableViews={scopedViews}
            />
            <div aria-label="Analytics content" role="region" className="min-w-0">
              <p className="text-pretty text-sm text-muted-foreground">
                No analytics view is available.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
