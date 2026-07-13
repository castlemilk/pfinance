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
  analyticsMoney,
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

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function timestampFromDate(date: Date): Timestamp {
  return create(TimestampSchema, {
    seconds: BigInt(Math.floor(date.getTime() / 1000)),
    nanos: 0,
  });
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfLocalDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999
  );
}

function dateKeysInRange(startDate: Date, endDate: Date): string[] {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);
  if (start > end) return [];

  const keys: string[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    keys.push(localDateKey(cursor));
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
      const start = startOfLocalDay(anchor);
      start.setDate(start.getDate() - offset);
      return { start, end: endOfLocalDay(start), label: localDateKey(start) };
    }

    if (granularity === 'week') {
      const start = startOfLocalDay(anchor);
      start.setDate(start.getDate() - start.getDay() - offset * 7);
      const end = endOfLocalDay(start);
      end.setDate(end.getDate() + 6);
      return { start, end, label: formatShortDate(start) };
    }

    const start = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const end = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0,
      23,
      59,
      59,
      999
    );
    return {
      start,
      end,
      label: start.toLocaleDateString('en-US', {
        month: 'short',
        year: 'numeric',
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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);
    const requestStart = new Date(startTime);
    const requestEnd = new Date(endTime);

    try {
      const response = await financeClient.getDailyAggregates({
        userId: '',
        groupId,
        startDate: timestampFromDate(requestStart),
        endDate: timestampFromDate(requestEnd),
      });
      if (!isCurrentRequest(requestId)) return;

      const aggregateByDate = new Map<string, HeatmapDay>();
      for (const aggregate of response.aggregates as DailyAggregate[]) {
        aggregateByDate.set(aggregate.date, {
          date: aggregate.date,
          value: analyticsMoney(
            aggregate.totalAmountCents,
            aggregate.totalAmount
          ),
          count: aggregate.transactionCount,
          categories: aggregate.categoryAmounts.map((category) => ({
            category: analyticsCategoryLabel(category.category),
            amount: analyticsMoney(category.amountCents, category.amount),
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
  }, [beginRequest, endTime, groupId, isCurrentRequest, startTime]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const response = await financeClient.getSpendingTrends({
        userId: '',
        groupId,
        granularity: granularityFromString(granularity),
        periods,
        category: category
          ? categoryFromString(category)
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
  }, [
    beginRequest,
    category,
    granularity,
    groupId,
    isCurrentRequest,
    periods,
  ]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

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
    if (!nextPageToken || seenPageTokens.has(nextPageToken)) break;
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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const expenses = await listAllExpenses(groupId);
      if (!isCurrentRequest(requestId)) return;

      const now = new Date();
      const currentPeriods = buildTrendPeriods(now, granularity, periods);
      const hasCurrentWindowData = expenses.some((expense) => {
        const date = expenseDate(expense);
        return date
          ? findExpensePeriodIndex(date, currentPeriods) !== -1
          : false;
      });
      const anchor = hasCurrentWindowData
        ? now
        : latestExpenseDate(expenses) ?? now;
      const trendPeriods = buildTrendPeriods(anchor, granularity, periods);
      const totalsByCategory = new Map<string, number>();
      const points = trendPeriods.map((period) => ({
        date: localDateKey(period.start),
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
        const amount = analyticsMoney(expense.amountCents, expense.amount);
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
  }, [beginRequest, granularity, groupId, isCurrentRequest, periods]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const response = await financeClient.getCategoryComparison({
        userId: '',
        groupId,
        currentPeriod,
        includeBudgets,
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
  }, [
    beginRequest,
    currentPeriod,
    groupId,
    includeBudgets,
    isCurrentRequest,
  ]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const response = await financeClient.detectAnomalies({
        userId: '',
        groupId,
        lookbackDays,
        sensitivity,
      });
      if (!isCurrentRequest(requestId)) return;
      setResult(mapAnomalyResponse(response));
    } catch (caughtError) {
      if (!isCurrentRequest(requestId)) return;
      setError(errorMessage(caughtError, 'Failed to fetch anomalies'));
    } finally {
      if (isCurrentRequest(requestId)) setLoading(false);
    }
  }, [
    beginRequest,
    groupId,
    isCurrentRequest,
    lookbackDays,
    sensitivity,
  ]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);

    try {
      const response = await financeClient.getCashFlowForecast({
        userId: '',
        groupId,
        forecastDays,
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
  }, [beginRequest, forecastDays, groupId, isCurrentRequest]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

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

  const fetchData = useCallback(async () => {
    const requestId = beginRequest();
    setLoading(true);
    setError(null);
    const period =
      periodDays > 180 ? 'year' : periodDays > 60 ? 'quarter' : 'month';

    try {
      const response = await financeClient.getWaterfallData({
        userId: '',
        groupId,
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
  }, [beginRequest, groupId, isCurrentRequest, periodDays]);

  useEffect(() => {
    void fetchData();
    return invalidateRequest;
  }, [fetchData, invalidateRequest]);

  return {
    data: result?.data ?? null,
    periodLabel: result?.periodLabel ?? '',
    loading,
    error,
    refetch: fetchData,
  };
}
