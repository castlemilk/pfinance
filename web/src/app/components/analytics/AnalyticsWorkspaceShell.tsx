'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Tabs, TabsContent } from '@/components/ui/tabs';

import { AnalyticsViewNav } from './AnalyticsViewNav';
import { AnalyticsWorkspaceFrame } from './AnalyticsWorkspaceFrame';

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
  const [hasRequestedViewChange, setHasRequestedViewChange] = useState(false);

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

  return (
    <AnalyticsWorkspaceFrame
      scope={scope}
      controls={
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
      }
    >
      {effectiveActiveView ? (
        <Tabs
          value={effectiveActiveView}
          onValueChange={(value) => {
            if (scopedViews.includes(value as AnalyticsView)) {
              setHasRequestedViewChange(true);
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
            <TabsContent
              key={view}
              value={view}
              className={`mt-0 min-w-0 ${
                hasRequestedViewChange
                  ? 'animate-in fade-in-0 slide-in-from-bottom-2 duration-150 ease-out motion-reduce:animate-none'
                  : ''
              }`}
            >
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
    </AnalyticsWorkspaceFrame>
  );
}
