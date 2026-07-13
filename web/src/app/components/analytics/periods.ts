import type { AnalyticsPeriod, AnalyticsPeriodConfig } from './types';

export const ANALYTICS_PERIOD_CONFIG: Readonly<
  Record<AnalyticsPeriod, AnalyticsPeriodConfig>
> = Object.freeze({
  month: Object.freeze({
    trendGranularity: 'week',
    trendPeriods: 8,
    heatmapMonths: 3,
    categoryPeriod: 'month',
    anomalyLookbackDays: 90,
    forecastDays: 30,
    waterfallDays: 30,
  } satisfies AnalyticsPeriodConfig),
  quarter: Object.freeze({
    trendGranularity: 'week',
    trendPeriods: 16,
    heatmapMonths: 6,
    categoryPeriod: 'quarter',
    anomalyLookbackDays: 180,
    forecastDays: 60,
    waterfallDays: 90,
  } satisfies AnalyticsPeriodConfig),
  year: Object.freeze({
    trendGranularity: 'month',
    trendPeriods: 24,
    heatmapMonths: 12,
    categoryPeriod: 'year',
    anomalyLookbackDays: 365,
    forecastDays: 90,
    waterfallDays: 365,
  } satisfies AnalyticsPeriodConfig),
});

function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return value === 'month' || value === 'quarter' || value === 'year';
}

export function getAnalyticsPeriodConfig(
  period: AnalyticsPeriod
): AnalyticsPeriodConfig {
  if (!isAnalyticsPeriod(period)) {
    throw new RangeError('Unsupported analytics period');
  }

  return ANALYTICS_PERIOD_CONFIG[period];
}

function subtractUtcCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const originalDay = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);

  const lastDayOfTargetMonth = new Date(result.getTime());
  lastDayOfTargetMonth.setUTCMonth(
    lastDayOfTargetMonth.getUTCMonth() + 1,
    0
  );
  result.setUTCDate(
    Math.min(originalDay, lastDayOfTargetMonth.getUTCDate())
  );

  return result;
}

export function analyticsHeatmapRange(period: AnalyticsPeriod, now: Date) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new RangeError('Analytics heatmap range requires a valid date');
  }

  const { heatmapMonths } = getAnalyticsPeriodConfig(period);
  const endDate = new Date(now.getTime());
  const startDate = subtractUtcCalendarMonths(endDate, heatmapMonths);

  return { startDate, endDate };
}
