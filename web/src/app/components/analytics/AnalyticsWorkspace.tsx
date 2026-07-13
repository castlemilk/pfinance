'use client';

import { useMemo, useState } from 'react';

import { UpgradePrompt } from '@/app/components/ProFeatureGate';
import { useFinance } from '@/app/context/FinanceContext';
import { useSubscription } from '@/app/hooks/useSubscription';

import {
  AnalyticsWorkspaceShell,
  GROUP_ANALYTICS_VIEWS,
  PERSONAL_ANALYTICS_VIEWS,
} from './AnalyticsWorkspaceShell';
import { createAnalyticsCurrencyContext } from './formatting';
import { AnalyticsChartSkeleton } from './AnalyticsStates';
import { AnalyticsWorkspaceFrame } from './AnalyticsWorkspaceFrame';
import { AttentionAnalyticsView } from './views/AttentionAnalyticsView';
import { CategoriesAnalyticsView } from './views/CategoriesAnalyticsView';
import { DataQualityAnalyticsView } from './views/DataQualityAnalyticsView';
import { ForecastAnalyticsView } from './views/ForecastAnalyticsView';
import { OverviewAnalyticsView } from './views/OverviewAnalyticsView';
import { SpendingAnalyticsView } from './views/SpendingAnalyticsView';

import type { AnalyticsView } from './AnalyticsWorkspaceShell';
import type {
  AnalyticsPeriod,
  AnalyticsScope,
  AnalyticsViewProps,
} from './types';

export type AnalyticsWorkspaceProps = Readonly<{ scope: AnalyticsScope }>;

function ActiveAnalyticsView({
  view,
  ...props
}: AnalyticsViewProps & Readonly<{ view: AnalyticsView }>) {
  switch (view) {
    case 'overview':
      return <OverviewAnalyticsView {...props} />;
    case 'spending':
      return <SpendingAnalyticsView {...props} />;
    case 'categories':
      return <CategoriesAnalyticsView {...props} />;
    case 'attention':
      return <AttentionAnalyticsView {...props} />;
    case 'forecast':
      return <ForecastAnalyticsView {...props} />;
    case 'data-quality':
      return <DataQualityAnalyticsView {...props} />;
    default: {
      const exhaustiveView: never = view;
      return exhaustiveView;
    }
  }
}

export function AnalyticsWorkspace({ scope }: AnalyticsWorkspaceProps) {
  const { taxConfig } = useFinance();
  const subscription = useSubscription();
  const [period, setPeriod] = useState<AnalyticsPeriod>('month');
  const [activeView, setActiveView] = useState<AnalyticsView>('overview');
  const currency = useMemo(
    () => createAnalyticsCurrencyContext(taxConfig.country),
    [taxConfig.country]
  );

  if (subscription.loading) {
    return (
      <AnalyticsWorkspaceFrame scope={scope}>
        <AnalyticsChartSkeleton label="Loading analytics workspace" />
      </AnalyticsWorkspaceFrame>
    );
  }

  if (!subscription.hasProAccess) {
    return (
      <AnalyticsWorkspaceFrame scope={scope}>
        <UpgradePrompt
          feature="Advanced Analytics"
          headingLevel={scope.kind === 'personal' ? 2 : 3}
        />
      </AnalyticsWorkspaceFrame>
    );
  }

  const availableViews =
    scope.kind === 'personal'
      ? PERSONAL_ANALYTICS_VIEWS
      : GROUP_ANALYTICS_VIEWS;
  const scopeIdentity =
    scope.kind === 'personal' ? 'personal' : `group:${scope.groupId}`;

  return (
    <AnalyticsWorkspaceShell
      scope={scope}
      period={period}
      onPeriodChange={setPeriod}
      activeView={activeView}
      onViewChange={setActiveView}
      availableViews={availableViews}
    >
      <ActiveAnalyticsView
        key={`${scopeIdentity}:${period}:${activeView}`}
        view={activeView}
        scope={scope}
        period={period}
        currency={currency}
      />
    </AnalyticsWorkspaceShell>
  );
}
