import {
  ANALYTICS_PERIOD_CONFIG,
  analyticsHeatmapRange,
  getAnalyticsPeriodConfig,
} from '../periods';
import { scopeGroupId, type AnalyticsPeriod } from '../types';

describe('analytics period configuration', () => {
  it('maps month to the approved analytics windows', () => {
    expect(ANALYTICS_PERIOD_CONFIG.month).toEqual({
      trendGranularity: 'week',
      trendPeriods: 8,
      heatmapMonths: 3,
      categoryPeriod: 'month',
      anomalyLookbackDays: 90,
      forecastDays: 30,
      waterfallDays: 30,
    });
  });

  it('maps quarter to the approved analytics windows', () => {
    expect(ANALYTICS_PERIOD_CONFIG.quarter).toEqual({
      trendGranularity: 'week',
      trendPeriods: 16,
      heatmapMonths: 6,
      categoryPeriod: 'quarter',
      anomalyLookbackDays: 180,
      forecastDays: 60,
      waterfallDays: 90,
    });
  });

  it('maps year to the approved analytics windows', () => {
    expect(ANALYTICS_PERIOD_CONFIG.year).toEqual({
      trendGranularity: 'month',
      trendPeriods: 24,
      heatmapMonths: 12,
      categoryPeriod: 'year',
      anomalyLookbackDays: 365,
      forecastDays: 90,
      waterfallDays: 365,
    });
  });

  it.each<AnalyticsPeriod>(['month', 'quarter', 'year'])(
    'returns the shared %s configuration',
    (period) => {
      expect(getAnalyticsPeriodConfig(period)).toBe(
        ANALYTICS_PERIOD_CONFIG[period]
      );
    }
  );
});

describe('analyticsHeatmapRange', () => {
  it.each([
    ['month', '2024-05-31T15:45:12.345Z', '2024-02-29T15:45:12.345Z'],
    ['quarter', '2024-03-31T08:09:10.011Z', '2023-09-30T08:09:10.011Z'],
    ['year', '2024-02-29T23:59:58.987Z', '2023-02-28T23:59:58.987Z'],
  ] as const)(
    'subtracts the configured calendar months for %s without overflowing',
    (period, nowIso, expectedStartIso) => {
      const now = new Date(nowIso);
      const originalTime = now.getTime();

      const { startDate, endDate } = analyticsHeatmapRange(period, now);

      expect(startDate.toISOString()).toBe(expectedStartIso);
      expect(endDate.toISOString()).toBe(nowIso);
      expect(endDate).not.toBe(now);
      expect(now.getTime()).toBe(originalTime);
    }
  );
});

describe('scopeGroupId', () => {
  it('returns only a group scope identifier', () => {
    expect(scopeGroupId()).toBe('');
    expect(scopeGroupId({ kind: 'personal' })).toBe('');
    expect(
      scopeGroupId({ kind: 'group', groupId: 'group-42', groupName: 'Home' })
    ).toBe('group-42');
  });
});
