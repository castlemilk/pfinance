'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { create } from '@bufbuild/protobuf';
import type { Timestamp } from '@bufbuild/protobuf/wkt';
import { TimestampSchema } from '@bufbuild/protobuf/wkt';
import type { AnalyticsScope } from '@/app/components/analytics/types';
import { scopeGroupId } from '@/app/components/analytics/types';
import { financeClient } from '@/lib/financeService';
import type {
  DailyAggregate,
  Expense,
  TimeSeriesDataPoint,
} from '@/gen/pfinance/v1/types_pb';
import { ExpenseCategory, Granularity } from '@/gen/pfinance/v1/types_pb';
import {
  analyticsCategoryLabel,
  checkedCentsToDollars,
  mapAnomalyResponse,
  mapCashFlowForecastResponse,
  mapCategoryComparisonResponse,
  mapWaterfallResponse,
} from '../analyticsMappers';
import type {
  AnalyticsAnomalyData,
  AnalyticsCombinedBudget,
  AnalyticsAnomalyCoverage,
  CashFlowForecastData,
  CategoryStackedTrendPoint,
  HeatmapData,
  HeatmapDay,
  PrimaryAnalyticsAttention,
  RadarAxis,
  WaterfallData,
} from '../types';

function useRequestSequence() {
  const requestIdRef = useRef(0);

  const beginRequest = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);
  const isCurrentRequest = useCallback(
    (requestId: number) => requestIdRef.current === requestId,
    []
  );
  const invalidateRequest = useCallback(() => {
    requestIdRef.current += 1;
  }, []);

  return { beginRequest, isCurrentRequest, invalidateRequest };
}

function useLatestRef<T>(value: T) {
  const valueRef = useRef(value);
  // The ref is only read by async callbacks; assigning here prevents held
  // callbacks from observing parameters from the previous committed render.
  // eslint-disable-next-line react-hooks/refs
  valueRef.current = value;
  return valueRef;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function timestampFromDate(date: Date): Timestamp {
  const milliseconds = date.getTime();
  if (!Number.isFinite(milliseconds)) {
    throw new RangeError('Invalid analytics date range');
  }
  const seconds = Math.floor(milliseconds / 1_000);
  const remainingMilliseconds = milliseconds - seconds * 1_000;
  return create(TimestampSchema, {
    seconds: BigInt(seconds),
    nanos: remainingMilliseconds * 1_000_000,
  });
}

function utcDateKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfUtcDay(date: Date): Date {
  const start = new Date(date.getTime());
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

function endOfUtcDay(date: Date): Date {
  const end = new Date(date.getTime());
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function dateKeysInRange(startDate: Date, endDate: Date): string[] {
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  if (start > end) return [];

  const keys: string[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    keys.push(utcDateKey(cursor));
  }
  return keys;
}

interface TrendPeriod {
  start: Date;
  end: Date;
  label: string;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    timeZone: 'UTC',
  });
}

function buildTrendPeriods(
  anchor: Date,
  granularity: 'day' | 'week' | 'month',
  periods: number
): TrendPeriod[] {
  return Array.from({ length: periods }, (_, index) => {
    const offset = periods - 1 - index;

    if (granularity === 'day') {
      const start = startOfUtcDay(anchor);
      start.setUTCDate(start.getUTCDate() - offset);
      return { start, end: endOfUtcDay(start), label: utcDateKey(start) };
    }

    if (granularity === 'week') {
      const start = startOfUtcDay(anchor);
      start.setUTCDate(start.getUTCDate() - start.getUTCDay() - offset * 7);
      const end = endOfUtcDay(start);
      end.setUTCDate(end.getUTCDate() + 6);
      return { start, end, label: formatShortDate(start) };
    }

    const start = new Date(0);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCFullYear(
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() - offset,
      1
    );
    const end = new Date(start.getTime());
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    end.setUTCHours(23, 59, 59, 999);
    return {
      start,
      end,
      label: start.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    };
  });
}

function granularityFromString(
  granularity: 'day' | 'week' | 'month'
): Granularity {
  switch (granularity) {
    case 'day':
      return Granularity.DAY;
    case 'week':
      return Granularity.WEEK;
    case 'month':
      return Granularity.MONTH;
    default:
      return Granularity.UNSPECIFIED;
  }
}

function categoryFromString(category: string): ExpenseCategory {
  const mapping: Record<string, ExpenseCategory> = {
    FOOD: ExpenseCategory.FOOD,
    HOUSING: ExpenseCategory.HOUSING,
    TRANSPORTATION: ExpenseCategory.TRANSPORTATION,
    ENTERTAINMENT: ExpenseCategory.ENTERTAINMENT,
    HEALTHCARE: ExpenseCategory.HEALTHCARE,
    UTILITIES: ExpenseCategory.UTILITIES,
    SHOPPING: ExpenseCategory.SHOPPING,
    EDUCATION: ExpenseCategory.EDUCATION,
    TRAVEL: ExpenseCategory.TRAVEL,
    OTHER: ExpenseCategory.OTHER,
  };
  return mapping[category.toUpperCase()] ?? ExpenseCategory.UNSPECIFIED;
}

const categoryOrder: ExpenseCategory[] = [
  ExpenseCategory.FOOD,
  ExpenseCategory.HOUSING,
  ExpenseCategory.TRANSPORTATION,
  ExpenseCategory.ENTERTAINMENT,
  ExpenseCategory.HEALTHCARE,
  ExpenseCategory.UTILITIES,
  ExpenseCategory.SHOPPING,
  ExpenseCategory.EDUCATION,
  ExpenseCategory.TRAVEL,
  ExpenseCategory.OTHER,
];

export function useHeatmapData(
  startDate: Date,
  endDate: Date,
  scope?: AnalyticsScope
) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({ startTime, endTime, groupId });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const parameters = parametersRef.current;
      if (
        !Number.isFinite(parameters.startTime) ||
        !Number.isFinite(parameters.endTime) ||
        parameters.startTime > parameters.endTime
      ) {
        throw new RangeError('Invalid analytics date range');
      }
      const requestStart = new Date(parameters.startTime);
      const requestEnd = new Date(parameters.endTime);
      const response = await financeClient.getDailyAggregates({
        userId: '',
        groupId: parameters.groupId,
        startDate: timestampFromDate(requestStart),
        endDate: timestampFromDate(requestEnd),
      });
      if (!isCurrentRequest(requestId)) return;

      const aggregateByDate = new Map<string, HeatmapDay>();
      for (const aggregate of response.aggregates as DailyAggregate[]) {
        aggregateByDate.set(aggregate.date, {
          date: aggregate.date,
          value: checkedCentsToDollars(
            aggregate.totalAmountCents,
            aggregate.totalAmount
          ),
          count: aggregate.transactionCount,
          categories: aggregate.categoryAmounts.map((category) => ({
            category: analyticsCategoryLabel(category.category),
            amount: checkedCentsToDollars(
              category.amountCents,
              category.amount
            ),
            count: category.count,
          })),
        });
      }

      const days = dateKeysInRange(requestStart, requestEnd).map(
        (date): HeatmapDay =>
          aggregateByDate.get(date) ?? {
            date,
            value: 0,
            count: 0,
            categories: [],
          }
      );
      setData({
        days,
        maxValue:
          days.length > 0 ? Math.max(...days.map((day) => day.value)) : 0,
      });
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(errorMessage(caughtError, 'Failed to fetch heatmap data'));
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [endTime, fetchData, groupId, invalidateRequest, startTime]);

  return { data, loading, error, refetch: fetchData };
}

export interface SpendingTrendsData {
  expenseSeries: TimeSeriesDataPoint[];
  incomeSeries: TimeSeriesDataPoint[];
  trendSlope: number;
  trendRSquared: number;
}

export function useSpendingTrends(
  granularity: 'day' | 'week' | 'month',
  periods: number,
  category?: string,
  scope?: AnalyticsScope
) {
  const [data, setData] = useState<SpendingTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({
    granularity,
    periods,
    category,
    groupId,
  });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const parameters = parametersRef.current;
      const response = await financeClient.getSpendingTrends({
        userId: '',
        groupId: parameters.groupId,
        granularity: granularityFromString(parameters.granularity),
        periods: parameters.periods,
        category: parameters.category
          ? categoryFromString(parameters.category)
          : ExpenseCategory.UNSPECIFIED,
      });
      if (!isCurrentRequest(requestId)) return;

      setData({
        expenseSeries: response.expenseSeries,
        incomeSeries: response.incomeSeries,
        trendSlope: response.trendSlope,
        trendRSquared: response.trendRSquared,
      });
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(errorMessage(caughtError, 'Failed to fetch spending trends'));
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [
    category,
    fetchData,
    granularity,
    groupId,
    invalidateRequest,
    periods,
  ]);

  return {
    expenseSeries: data?.expenseSeries ?? [],
    incomeSeries: data?.incomeSeries ?? [],
    trendSlope: data?.trendSlope ?? 0,
    trendRSquared: data?.trendRSquared ?? 0,
    loading,
    error,
    refetch: fetchData,
  };
}

export interface CategorySpendingTrendsData {
  points: CategoryStackedTrendPoint[];
  categories: string[];
}

function expenseDate(expense: Expense): Date | null {
  if (!expense.date) return null;
  const milliseconds =
    Number(expense.date.seconds) * 1_000 + expense.date.nanos / 1_000_000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

function findExpensePeriodIndex(date: Date, periods: TrendPeriod[]): number {
  return periods.findIndex(
    (period) => date >= period.start && date <= period.end
  );
}

function latestExpenseDate(expenses: Expense[]): Date | null {
  let latest: Date | null = null;
  for (const expense of expenses) {
    const date = expenseDate(expense);
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

async function listAllExpenses(groupId: string): Promise<Expense[]> {
  const expenses: Expense[] = [];
  const seenPageTokens = new Set<string>();
  let pageToken = '';

  while (true) {
    const response = await financeClient.listExpenses({
      userId: '',
      groupId,
      pageSize: 10000,
      pageToken,
    });
    expenses.push(...response.expenses);

    const nextPageToken = response.nextPageToken;
    if (!nextPageToken) break;
    if (seenPageTokens.has(nextPageToken)) {
      throw new Error('Failed to load complete category spending history');
    }
    seenPageTokens.add(nextPageToken);
    pageToken = nextPageToken;
  }

  return expenses;
}

export function useCategorySpendingTrends(
  granularity: 'day' | 'week' | 'month',
  periods: number,
  scope?: AnalyticsScope
) {
  const [data, setData] = useState<CategorySpendingTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({ granularity, periods, groupId });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const parameters = parametersRef.current;
      const expenses = await listAllExpenses(parameters.groupId);
      if (!isCurrentRequest(requestId)) return;

      const now = new Date();
      const currentPeriods = buildTrendPeriods(
        now,
        parameters.granularity,
        parameters.periods
      );
      const hasCurrentWindowData = expenses.some((expense) => {
        const date = expenseDate(expense);
        return date
          ? findExpensePeriodIndex(date, currentPeriods) !== -1
          : false;
      });
      const anchor = hasCurrentWindowData
        ? now
        : latestExpenseDate(expenses) ?? now;
      const trendPeriods = buildTrendPeriods(
        anchor,
        parameters.granularity,
        parameters.periods
      );
      const totalsByCategory = new Map<string, number>();
      const points = trendPeriods.map((period) => ({
        date: utcDateKey(period.start),
        label: period.label,
        total: 0,
        categories: {} as Record<string, number>,
      }));

      for (const category of categoryOrder) {
        const label = analyticsCategoryLabel(category);
        for (const point of points) point.categories[label] = 0;
      }

      for (const expense of expenses) {
        const date = expenseDate(expense);
        if (!date) continue;
        const periodIndex = findExpensePeriodIndex(date, trendPeriods);
        if (periodIndex === -1) continue;

        const category = analyticsCategoryLabel(expense.category);
        const amount = checkedCentsToDollars(
          expense.amountCents,
          expense.amount
        );
        points[periodIndex].categories[category] =
          (points[periodIndex].categories[category] ?? 0) + amount;
        points[periodIndex].total += amount;
        totalsByCategory.set(
          category,
          (totalsByCategory.get(category) ?? 0) + amount
        );
      }

      const activeCategories = categoryOrder
        .map(analyticsCategoryLabel)
        .filter((category) => (totalsByCategory.get(category) ?? 0) > 0);

      if (!isCurrentRequest(requestId)) return;
      setData({
        categories: activeCategories,
        points: points.map((point) => ({
          ...point,
          categories: Object.fromEntries(
            activeCategories.map((category) => [
              category,
              point.categories[category] ?? 0,
            ])
          ),
        })),
      });
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(
        errorMessage(
          caughtError,
          'Failed to fetch category spending trends'
        )
      );
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, granularity, groupId, invalidateRequest, periods]);

  return {
    points: data?.points ?? [],
    categories: data?.categories ?? [],
    loading,
    error,
    refetch: fetchData,
  };
}

export type CategoryComparisonPeriod = 'week' | 'month' | 'quarter' | 'year';

export function useCategoryComparison(
  includeBudgets: boolean,
  currentPeriod: CategoryComparisonPeriod = 'month',
  scope?: AnalyticsScope
) {
  const [data, setData] = useState<RadarAxis[] | null>(null);
  const [combinedBudgets, setCombinedBudgets] = useState<
    AnalyticsCombinedBudget[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({
    includeBudgets,
    currentPeriod,
    groupId,
  });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const parameters = parametersRef.current;
      const response = await financeClient.getCategoryComparison({
        userId: '',
        groupId: parameters.groupId,
        currentPeriod: parameters.currentPeriod,
        includeBudgets: parameters.includeBudgets,
      });
      if (!isCurrentRequest(requestId)) return;

      const mapped = mapCategoryComparisonResponse(response);
      setData(mapped.categories);
      setCombinedBudgets(mapped.combinedBudgets);
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(
        errorMessage(caughtError, 'Failed to fetch category comparison')
      );
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [
    currentPeriod,
    fetchData,
    groupId,
    includeBudgets,
    invalidateRequest,
  ]);

  return {
    data,
    combinedBudgets,
    loading,
    error,
    refetch: fetchData,
  };
}

export function useAnomalies(
  lookbackDays: number,
  sensitivity: number,
  scope?: AnalyticsScope
) {
  const [result, setResult] = useState<AnalyticsAnomalyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({ lookbackDays, sensitivity, groupId });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const parameters = parametersRef.current;
      const response = await financeClient.detectAnomalies({
        userId: '',
        groupId: parameters.groupId,
        lookbackDays: parameters.lookbackDays,
        sensitivity: parameters.sensitivity,
      });
      if (!isCurrentRequest(requestId)) return;
      setResult(mapAnomalyResponse(response));
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(errorMessage(caughtError, 'Failed to fetch anomalies'));
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [
    fetchData,
    groupId,
    invalidateRequest,
    lookbackDays,
    sensitivity,
  ]);

  return {
    data: result?.data ?? null,
    totalAnomalousSpend: result?.totalAnomalousSpend ?? 0,
    topCategory: result?.topCategory ?? '',
    analyzedCount: result?.analyzedCount ?? 0,
    eligibleCount: result?.eligibleCount ?? 0,
    minimumSample: result?.minimumSample ?? 0,
    hasSufficientHistory: result?.hasSufficientHistory ?? false,
    categoryCoverage:
      result?.categoryCoverage ?? ([] as AnalyticsAnomalyCoverage[]),
    primaryAttention:
      result?.primaryAttention ?? (null as PrimaryAnalyticsAttention | null),
    loading,
    error,
    refetch: fetchData,
  };
}

export function useCashFlowForecast(
  forecastDays: number,
  scope?: AnalyticsScope
) {
  const [result, setResult] = useState<CashFlowForecastData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({ forecastDays, groupId });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const parameters = parametersRef.current;
      const response = await financeClient.getCashFlowForecast({
        userId: '',
        groupId: parameters.groupId,
        forecastDays: parameters.forecastDays,
      });
      if (!isCurrentRequest(requestId)) return;
      setResult(mapCashFlowForecastResponse(response));
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(
        errorMessage(caughtError, 'Failed to fetch cash flow forecast')
      );
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, forecastDays, groupId, invalidateRequest]);

  return {
    incomeForecast: result?.incomeForecast ?? null,
    expenseForecast: result?.expenseForecast ?? null,
    netForecast: result?.netForecast ?? null,
    incomeHistory: result?.incomeHistory ?? null,
    expenseHistory: result?.expenseHistory ?? null,
    loading,
    error,
    refetch: fetchData,
  };
}

export function useWaterfallData(
  periodDays: number,
  scope?: AnalyticsScope
) {
  const [result, setResult] = useState<WaterfallData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupId = scopeGroupId(scope);
  const { beginRequest, isCurrentRequest, invalidateRequest } =
    useRequestSequence();
  const parametersRef = useLatestRef({ periodDays, groupId });

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);
    const parameters = parametersRef.current;
    const period =
      parameters.periodDays > 180
        ? 'year'
        : parameters.periodDays > 60
          ? 'quarter'
          : 'month';

    try {
      const response = await financeClient.getWaterfallData({
        userId: '',
        groupId: parameters.groupId,
        period,
      });
      if (!isCurrentRequest(requestId)) return;
      setResult(mapWaterfallResponse(response));
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(errorMessage(caughtError, 'Failed to fetch waterfall data'));
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [beginRequest, isCurrentRequest, parametersRef]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, groupId, invalidateRequest, periodDays]);

  return {
    data: result?.data ?? null,
    periodLabel: result?.periodLabel ?? '',
    loading,
    error,
    refetch: fetchData,
  };
}
