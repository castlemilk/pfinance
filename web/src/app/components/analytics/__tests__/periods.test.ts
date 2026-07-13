import {
  ANALYTICS_PERIOD_CONFIG,
  analyticsHeatmapRange,
  getAnalyticsPeriodConfig,
} from '../periods';
import { scopeGroupId, type AnalyticsPeriod } from '../types';

function assertReadonlyPeriodConfig(
  config: (typeof ANALYTICS_PERIOD_CONFIG)['month']
): void {
  // @ts-expect-error Analytics period fields are compile-time readonly.
  config.trendPeriods = 16;
}

function assertReadonlyPeriodRecord(
  config: typeof ANALYTICS_PERIOD_CONFIG
): void {
  // @ts-expect-error Analytics period entries are compile-time readonly.
  config.month = config.quarter;
}

void assertReadonlyPeriodConfig;
void assertReadonlyPeriodRecord;

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

  it('freezes the period record and every shared configuration entry', () => {
    expect(Object.isFrozen(ANALYTICS_PERIOD_CONFIG)).toBe(true);
    expect(Object.isFrozen(ANALYTICS_PERIOD_CONFIG.month)).toBe(true);
    expect(Object.isFrozen(ANALYTICS_PERIOD_CONFIG.quarter)).toBe(true);
    expect(Object.isFrozen(ANALYTICS_PERIOD_CONFIG.year)).toBe(true);
  });

  it('prevents mutation from changing values observed by later consumers', () => {
    const config = ANALYTICS_PERIOD_CONFIG.month as unknown as {
      trendPeriods: number;
    };
    const originalValue = config.trendPeriods;
    const replacementValue = 24;
    const didMutate = Reflect.set(config, 'trendPeriods', replacementValue);
    const observedValue = config.trendPeriods;

    if (didMutate) {
      Reflect.set(config, 'trendPeriods', originalValue);
    }

    expect(didMutate).toBe(false);
    expect(observedValue).toBe(originalValue);
  });

  it('rejects unknown runtime periods with a clear RangeError', () => {
    expect(() =>
      getAnalyticsPeriodConfig('week' as AnalyticsPeriod)
    ).toThrow(new RangeError('Unsupported analytics period'));
  });
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

  it('rejects an invalid request time with a clear RangeError', () => {
    expect(() => analyticsHeatmapRange('month', new Date(Number.NaN))).toThrow(
      new RangeError('Analytics heatmap range requires a valid date')
    );
  });

  it('rejects an unknown runtime period before calculating a range', () => {
    expect(() =>
      analyticsHeatmapRange('week' as AnalyticsPeriod, new Date())
    ).toThrow(new RangeError('Unsupported analytics period'));
  });
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
