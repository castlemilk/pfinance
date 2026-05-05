'use client';

import { useState, useEffect, useCallback } from 'react';
import { create } from '@bufbuild/protobuf';
import type { Timestamp } from '@bufbuild/protobuf/wkt';
import { TimestampSchema } from '@bufbuild/protobuf/wkt';
import { financeClient } from '@/lib/financeService';
import type {
  DailyAggregate,
  Expense,
  TimeSeriesDataPoint,
  CategorySpending,
  SpendingAnomaly,
  ForecastPoint,
  WaterfallEntry,
} from '@/gen/pfinance/v1/types_pb';
import {
  Granularity,
  ExpenseCategory,
  AnomalyType,
  AnomalySeverity,
  WaterfallEntryType,
} from '@/gen/pfinance/v1/types_pb';
import type {
  HeatmapDay,
  HeatmapData,
  CategoryStackedTrendPoint,
  RadarAxis,
  AnomalyPoint,
  ForecastSeries,
  WaterfallBar,
} from '../types';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert a JS Date to a protobuf Timestamp.
 */
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
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function dateKeysInRange(startDate: Date, endDate: Date): string[] {
  const start = startOfLocalDay(startDate);
  const end = startOfLocalDay(endDate);

  if (start > end) return [];

  const keys: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
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
  return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' });
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
      return {
        start,
        end: endOfLocalDay(start),
        label: localDateKey(start),
      };
    }

    if (granularity === 'week') {
      const start = startOfLocalDay(anchor);
      start.setDate(start.getDate() - start.getDay() - offset * 7);
      const end = endOfLocalDay(start);
      end.setDate(end.getDate() + 6);
      return {
        start,
        end,
        label: formatShortDate(start),
      };
    }

    const start = new Date(anchor.getFullYear(), anchor.getMonth() - offset, 1);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
    return {
      start,
      end,
      label: start.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
    };
  });
}

/**
 * Convert an ExpenseCategory enum value to a human-readable string.
 * e.g. ExpenseCategory.FOOD (whose key is "FOOD") -> "Food"
 */
function categoryToString(cat: ExpenseCategory): string {
  const name = ExpenseCategory[cat] || '';
  // Enum keys are like "FOOD", "HOUSING", "TRANSPORTATION", etc.
  if (!name || name === 'UNSPECIFIED') return 'Other';
  return name.charAt(0) + name.slice(1).toLowerCase();
}

/**
 * Map a string-based granularity to the proto Granularity enum.
 */
function granularityFromString(g: 'day' | 'week' | 'month'): Granularity {
  switch (g) {
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

/**
 * Map a category string to the ExpenseCategory enum.
 * Accepts lowercase or title-case category names.
 */
function categoryFromString(cat: string): ExpenseCategory {
  const upper = cat.toUpperCase();
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
  return mapping[upper] ?? ExpenseCategory.UNSPECIFIED;
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

/**
 * Prefer cents value (converted to dollars) over the legacy double field.
 * Uses BigInt(0) for comparison since the ES target is below ES2020.
 */
function centsOrFallback(cents: bigint, fallbackDollars: number): number {
  if (cents !== BigInt(0)) {
    return Number(cents) / 100;
  }
  return fallbackDollars;
}

/**
 * Map AnomalySeverity enum to the display string union type.
 */
function severityToString(s: AnomalySeverity): 'low' | 'medium' | 'high' {
  switch (s) {
    case AnomalySeverity.LOW:
      return 'low';
    case AnomalySeverity.MEDIUM:
      return 'medium';
    case AnomalySeverity.HIGH:
      return 'high';
    default:
      return 'low';
  }
}

/**
 * Map AnomalyType enum to a human-readable string.
 */
function anomalyTypeToString(t: AnomalyType): string {
  switch (t) {
    case AnomalyType.AMOUNT_OUTLIER:
      return 'Amount Outlier';
    case AnomalyType.NEW_MERCHANT:
      return 'New Merchant';
    case AnomalyType.UNUSUAL_TIMING:
      return 'Unusual Timing';
    case AnomalyType.CATEGORY_SPIKE:
      return 'Category Spike';
    default:
      return 'Unknown';
  }
}

/**
 * Map a WaterfallEntryType to the display union type for WaterfallBar.
 */
function waterfallEntryTypeToString(
  t: WaterfallEntryType
): 'income' | 'expense' | 'tax' | 'savings' | 'subtotal' {
  switch (t) {
    case WaterfallEntryType.INCOME:
      return 'income';
    case WaterfallEntryType.EXPENSE:
      return 'expense';
    case WaterfallEntryType.TAX:
      return 'tax';
    case WaterfallEntryType.SAVINGS:
      return 'savings';
    case WaterfallEntryType.SUBTOTAL:
      return 'subtotal';
    default:
      return 'subtotal';
  }
}

/**
 * Map a WaterfallEntryType to a chart color.
 */
function waterfallEntryColor(t: WaterfallEntryType): string {
  switch (t) {
    case WaterfallEntryType.INCOME:
      return 'var(--chart-2)';
    case WaterfallEntryType.EXPENSE:
      return 'var(--chart-1)';
    case WaterfallEntryType.TAX:
      return 'var(--chart-4)';
    case WaterfallEntryType.SAVINGS:
      return 'var(--chart-3)';
    case WaterfallEntryType.SUBTOTAL:
    default:
      return 'var(--muted)';
  }
}

// ============================================================================
// Hook 1: useHeatmapData
// ============================================================================

export function useHeatmapData(startDate: Date, endDate: Date) {
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.getDailyAggregates({
        userId: '',
        groupId: '',
        startDate: timestampFromDate(startDate),
        endDate: timestampFromDate(endDate),
      });

      const aggregateByDate = new Map<string, HeatmapDay>();
      for (const agg of response.aggregates as DailyAggregate[]) {
        aggregateByDate.set(agg.date, {
          date: agg.date,
          value: centsOrFallback(agg.totalAmountCents, agg.totalAmount),
          count: agg.transactionCount,
          categories: agg.categoryAmounts.map((ca) => ({
            category: categoryToString(ca.category),
            amount: centsOrFallback(ca.amountCents, ca.amount),
            count: ca.count,
          })),
        });
      }

      const days: HeatmapDay[] = dateKeysInRange(startDate, endDate).map(
        (date) =>
          aggregateByDate.get(date) ?? {
            date,
            value: 0,
            count: 0,
            categories: [],
          }
      );

      const maxValue =
        days.length > 0 ? Math.max(...days.map((d) => d.value)) : 0;

      setData({ days, maxValue });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch heatmap data'
      );
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================================================
// Hook 2: useSpendingTrends
// ============================================================================

export interface SpendingTrendsData {
  expenseSeries: TimeSeriesDataPoint[];
  incomeSeries: TimeSeriesDataPoint[];
  trendSlope: number;
  trendRSquared: number;
}

export function useSpendingTrends(
  granularity: 'day' | 'week' | 'month',
  periods: number,
  category?: string
) {
  const [data, setData] = useState<SpendingTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const protoGranularity = granularityFromString(granularity);
      const protoCategory = category
        ? categoryFromString(category)
        : ExpenseCategory.UNSPECIFIED;

      const response = await financeClient.getSpendingTrends({
        userId: '',
        groupId: '',
        granularity: protoGranularity,
        periods,
        category: protoCategory,
      });

      setData({
        expenseSeries: response.expenseSeries,
        incomeSeries: response.incomeSeries,
        trendSlope: response.trendSlope,
        trendRSquared: response.trendRSquared,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch spending trends'
      );
    } finally {
      setLoading(false);
    }
  }, [granularity, periods, category]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

// ============================================================================
// Hook 3: useCategorySpendingTrends
// ============================================================================

export interface CategorySpendingTrendsData {
  points: CategoryStackedTrendPoint[];
  categories: string[];
}

function expenseDate(expense: Expense): Date | null {
  if (!expense.date) return null;
  return new Date(Number(expense.date.seconds) * 1000 + Math.floor(expense.date.nanos / 1_000_000));
}

function findExpensePeriodIndex(date: Date, periods: TrendPeriod[]): number {
  return periods.findIndex((period) => date >= period.start && date <= period.end);
}

function latestExpenseDate(expenses: Expense[]): Date | null {
  let latest: Date | null = null;
  for (const expense of expenses) {
    const date = expenseDate(expense);
    if (date && (!latest || date > latest)) {
      latest = date;
    }
  }
  return latest;
}

async function listAllExpenses(): Promise<Expense[]> {
  const expenses: Expense[] = [];
  let pageToken = '';

  do {
    const response = await financeClient.listExpenses({
      userId: '',
      groupId: '',
      pageSize: 10000,
      pageToken,
    });
    expenses.push(...response.expenses);
    pageToken = response.nextPageToken;
  } while (pageToken);

  return expenses;
}

export function useCategorySpendingTrends(
  granularity: 'day' | 'week' | 'month',
  periods: number
) {
  const [data, setData] = useState<CategorySpendingTrendsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const expenses = await listAllExpenses();
      const currentPeriods = buildTrendPeriods(new Date(), granularity, periods);
      const hasCurrentWindowData = expenses.some((expense) => {
        const date = expenseDate(expense);
        return date ? findExpensePeriodIndex(date, currentPeriods) !== -1 : false;
      });
      const anchor = hasCurrentWindowData ? new Date() : latestExpenseDate(expenses) ?? new Date();
      const trendPeriods = buildTrendPeriods(anchor, granularity, periods);

      const totalsByCategory = new Map<string, number>();
      const points = trendPeriods.map((period) => ({
        date: localDateKey(period.start),
        label: period.label,
        total: 0,
        categories: {} as Record<string, number>,
      }));

      for (const category of categoryOrder) {
        const label = categoryToString(category);
        for (const point of points) {
          point.categories[label] = 0;
        }
      }

      for (const expense of expenses) {
        const date = expenseDate(expense);
        if (!date) continue;
        const periodIndex = findExpensePeriodIndex(date, trendPeriods);
        if (periodIndex === -1) continue;

        const category = categoryToString(expense.category);
        const amount = centsOrFallback(expense.amountCents, expense.amount);
        points[periodIndex].categories[category] =
          (points[periodIndex].categories[category] ?? 0) + amount;
        points[periodIndex].total += amount;
        totalsByCategory.set(category, (totalsByCategory.get(category) ?? 0) + amount);
      }

      const activeCategories = categoryOrder
        .map(categoryToString)
        .filter((category) => (totalsByCategory.get(category) ?? 0) > 0);

      setData({
        categories: activeCategories,
        points: points.map((point) => ({
          ...point,
          categories: Object.fromEntries(
            activeCategories.map((category) => [category, point.categories[category] ?? 0])
          ),
        })),
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch category spending trends'
      );
    } finally {
      setLoading(false);
    }
  }, [granularity, periods]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    points: data?.points ?? [],
    categories: data?.categories ?? [],
    loading,
    error,
    refetch: fetchData,
  };
}

// ============================================================================
// Hook 4: useCategoryComparison
// ============================================================================

export type CategoryComparisonPeriod = 'week' | 'month' | 'quarter' | 'year';

export function useCategoryComparison(
  includeBudgets: boolean,
  currentPeriod: CategoryComparisonPeriod = 'month'
) {
  const [data, setData] = useState<RadarAxis[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.getCategoryComparison({
        userId: '',
        groupId: '',
        currentPeriod,
        includeBudgets,
      });

      const axes: RadarAxis[] = response.categories.map(
        (cs: CategorySpending) => {
          const currentValue = centsOrFallback(
            cs.currentAmountCents,
            cs.currentAmount
          );
          const previousValue = centsOrFallback(
            cs.previousAmountCents,
            cs.previousAmount
          );
          const budgetValue = centsOrFallback(
            cs.budgetAmountCents,
            cs.budgetAmount
          );
          const maxValue = Math.max(
            currentValue,
            previousValue,
            budgetValue || 0
          );

          return {
            category: categoryToString(cs.category),
            currentValue,
            previousValue,
            budgetValue: budgetValue > 0 ? budgetValue : undefined,
            maxValue,
          };
        }
      );

      setData(axes);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch category comparison'
      );
    } finally {
      setLoading(false);
    }
  }, [includeBudgets, currentPeriod]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================================================
// Hook 4: useAnomalies
// ============================================================================

export function useAnomalies(lookbackDays: number, sensitivity: number) {
  const [data, setData] = useState<AnomalyPoint[] | null>(null);
  const [totalAnomalousSpend, setTotalAnomalousSpend] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.detectAnomalies({
        userId: '',
        groupId: '',
        lookbackDays,
        sensitivity,
      });

      const points: AnomalyPoint[] = response.anomalies.map(
        (a: SpendingAnomaly) => ({
          id: a.id,
          expenseId: a.expenseId,
          description: a.description,
          amount: centsOrFallback(a.amountCents, a.amount),
          category: categoryToString(a.category),
          date: a.date
            ? new Date(Number(a.date.seconds) * 1000)
            : new Date(),
          zScore: a.zScore,
          expectedAmount: centsOrFallback(
            a.expectedAmountCents,
            a.expectedAmount
          ),
          anomalyType: anomalyTypeToString(a.anomalyType),
          severity: severityToString(a.severity),
        })
      );

      const spend = centsOrFallback(
        response.anomalousSpendTotalCents,
        response.anomalousSpendTotal
      );

      setData(points);
      setTotalAnomalousSpend(spend);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch anomalies'
      );
    } finally {
      setLoading(false);
    }
  }, [lookbackDays, sensitivity]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, totalAnomalousSpend, loading, error, refetch: fetchData };
}

// ============================================================================
// Hook 5: useCashFlowForecast
// ============================================================================

function forecastPointsToSeries(points: ForecastPoint[]): ForecastSeries[] {
  return points.map((fp) => ({
    date: new Date(fp.date),
    predicted: centsOrFallback(fp.predictedCents, fp.predicted),
    lowerBound: centsOrFallback(fp.lowerBoundCents, fp.lowerBound),
    upperBound: centsOrFallback(fp.upperBoundCents, fp.upperBound),
  }));
}

export function useCashFlowForecast(forecastDays: number) {
  const [incomeForecast, setIncomeForecast] = useState<ForecastSeries[] | null>(
    null
  );
  const [expenseForecast, setExpenseForecast] = useState<
    ForecastSeries[] | null
  >(null);
  const [netForecast, setNetForecast] = useState<ForecastSeries[] | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.getCashFlowForecast({
        userId: '',
        groupId: '',
        forecastDays,
      });

      setIncomeForecast(forecastPointsToSeries(response.incomeForecast));
      setExpenseForecast(forecastPointsToSeries(response.expenseForecast));
      setNetForecast(forecastPointsToSeries(response.netForecast));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch cash flow forecast'
      );
    } finally {
      setLoading(false);
    }
  }, [forecastDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    incomeForecast,
    expenseForecast,
    netForecast,
    loading,
    error,
    refetch: fetchData,
  };
}

// ============================================================================
// Hook 6: useWaterfallData
// ============================================================================

export function useWaterfallData(periodDays: number) {
  const [data, setData] = useState<WaterfallBar[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Map periodDays to a period string for the RPC
      let period = 'month';
      if (periodDays > 180) {
        period = 'year';
      } else if (periodDays > 60) {
        period = 'quarter';
      }

      const response = await financeClient.getWaterfallData({
        userId: '',
        groupId: '',
        period,
      });

      const bars: WaterfallBar[] = response.entries.map(
        (entry: WaterfallEntry) => {
          const amount = centsOrFallback(entry.amountCents, entry.amount);
          const runningTotal = centsOrFallback(
            entry.runningTotalCents,
            entry.runningTotal
          );
          const entryType = waterfallEntryTypeToString(entry.entryType);
          const color = waterfallEntryColor(entry.entryType);

          return {
            label: entry.label,
            amount,
            type: entryType,
            runningTotal,
            color,
          };
        }
      );

      setData(bars);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch waterfall data'
      );
    } finally {
      setLoading(false);
    }
  }, [periodDays]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
