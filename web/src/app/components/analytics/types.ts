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
  formatDate: (
    date: Date | string,
    options?: Intl.DateTimeFormatOptions
  ) => string;
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
