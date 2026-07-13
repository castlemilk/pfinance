import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  DetectAnomaliesResponse,
  GetCashFlowForecastResponse,
  GetCategoryComparisonResponse,
  GetDailyAggregatesResponse,
  GetSpendingTrendsResponse,
  GetWaterfallDataResponse,
  ListExpensesResponse,
} from '@/gen/pfinance/v1/finance_service_pb';
import {
  AnomalySeverity,
  AnomalyType,
  ExpenseCategory,
  Granularity,
  WaterfallEntryType,
} from '@/gen/pfinance/v1/types_pb';
import type { AnalyticsScope } from '@/app/components/analytics/types';
import { financeClient } from '@/lib/financeService';
import {
  useAnomalies,
  useCashFlowForecast,
  useCategoryComparison,
  useCategorySpendingTrends,
  useHeatmapData,
  useSpendingTrends,
  useWaterfallData,
} from '../useAnalyticsData';

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getDailyAggregates: jest.fn(),
    getSpendingTrends: jest.fn(),
    getCategoryComparison: jest.fn(),
    detectAnomalies: jest.fn(),
    getCashFlowForecast: jest.fn(),
    getWaterfallData: jest.fn(),
    listExpenses: jest.fn(),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function typed<T>(value: unknown): T {
  return value as T;
}

const personalScope: AnalyticsScope = { kind: 'personal' };
const groupScope: AnalyticsScope = {
  kind: 'group',
  groupId: 'group-42',
  groupName: 'Household',
};
const heatmapStart = new Date('2026-07-01T00:00:00.000Z');
const heatmapEnd = new Date('2026-07-03T23:59:59.000Z');

type ScopeProps = { scope: AnalyticsScope };

function useHeatmapCase({ scope }: ScopeProps) {
  return useHeatmapData(heatmapStart, heatmapEnd, scope);
}

function useSpendingCase({ scope }: ScopeProps) {
  return useSpendingTrends('week', 8, 'Food', scope);
}

function useCategoryTrendsCase({ scope }: ScopeProps) {
  return useCategorySpendingTrends('week', 2, scope);
}

function useComparisonCase({ scope }: ScopeProps) {
  return useCategoryComparison(true, undefined, scope);
}

function useAnomalyCase({ scope }: ScopeProps) {
  return useAnomalies(90, 0.5, scope);
}

function useForecastCase({ scope }: ScopeProps) {
  return useCashFlowForecast(30, scope);
}

function useWaterfallCase({ scope }: ScopeProps) {
  return useWaterfallData(90, scope);
}

const getDailyAggregates = financeClient.getDailyAggregates as jest.Mock;
const getSpendingTrends = financeClient.getSpendingTrends as jest.Mock;
const getCategoryComparison = financeClient.getCategoryComparison as jest.Mock;
const detectAnomalies = financeClient.detectAnomalies as jest.Mock;
const getCashFlowForecast = financeClient.getCashFlowForecast as jest.Mock;
const getWaterfallData = financeClient.getWaterfallData as jest.Mock;
const listExpenses = financeClient.listExpenses as jest.Mock;

const clientMocks = [
  getDailyAggregates,
  getSpendingTrends,
  getCategoryComparison,
  detectAnomalies,
  getCashFlowForecast,
  getWaterfallData,
  listExpenses,
];

function setDefaultResponses() {
  getDailyAggregates.mockResolvedValue({
    aggregates: [],
    maxDailyAmount: 0,
    maxDailyAmountCents: BigInt(0),
  });
  getSpendingTrends.mockResolvedValue({
    expenseSeries: [],
    incomeSeries: [],
    trendSlope: 0,
    trendRSquared: 0,
  });
  getCategoryComparison.mockResolvedValue({
    categories: [],
    combinedBudgets: [],
  });
  detectAnomalies.mockResolvedValue({
    anomalies: [],
    totalAnomalies: 0,
    anomalousSpendTotal: 0,
    anomalousSpendTotalCents: BigInt(0),
    topAnomalyCategory: '',
    analyzedExpenseCount: 0,
    eligibleCategoryCount: 0,
    minimumCategorySample: 5,
    hasSufficientHistory: false,
    categoryCoverage: [],
  });
  getCashFlowForecast.mockResolvedValue({
    incomeForecast: [],
    expenseForecast: [],
    netForecast: [],
    incomeHistory: [],
    expenseHistory: [],
  });
  getWaterfallData.mockResolvedValue({ entries: [], periodLabel: '' });
  listExpenses.mockResolvedValue({ expenses: [], nextPageToken: '' });
}

beforeEach(() => {
  jest.useRealTimers();
  clientMocks.forEach((mock) => mock.mockReset());
  setDefaultResponses();
});

type ScopedHookCase = {
  name: string;
  hook: (props: ScopeProps) => unknown;
  clientMock: jest.Mock;
  expectedRequest: Record<string, unknown>;
};

const scopedHookCases: ScopedHookCase[] = [
  {
    name: 'useHeatmapData(startDate, endDate, scope)',
    hook: useHeatmapCase,
    clientMock: getDailyAggregates,
    expectedRequest: { startDate: expect.anything(), endDate: expect.anything() },
  },
  {
    name: 'useSpendingTrends(granularity, periods, category, scope)',
    hook: useSpendingCase,
    clientMock: getSpendingTrends,
    expectedRequest: {
      granularity: Granularity.WEEK,
      periods: 8,
      category: ExpenseCategory.FOOD,
    },
  },
  {
    name: 'useCategorySpendingTrends(granularity, periods, scope)',
    hook: useCategoryTrendsCase,
    clientMock: listExpenses,
    expectedRequest: { pageSize: 10000, pageToken: '' },
  },
  {
    name: 'useCategoryComparison(includeBudgets, currentPeriod?, scope)',
    hook: useComparisonCase,
    clientMock: getCategoryComparison,
    expectedRequest: { includeBudgets: true, currentPeriod: 'month' },
  },
  {
    name: 'useAnomalies(lookbackDays, sensitivity, scope)',
    hook: useAnomalyCase,
    clientMock: detectAnomalies,
    expectedRequest: { lookbackDays: 90, sensitivity: 0.5 },
  },
  {
    name: 'useCashFlowForecast(forecastDays, scope)',
    hook: useForecastCase,
    clientMock: getCashFlowForecast,
    expectedRequest: { forecastDays: 30 },
  },
  {
    name: 'useWaterfallData(periodDays, scope)',
    hook: useWaterfallCase,
    clientMock: getWaterfallData,
    expectedRequest: { period: 'quarter' },
  },
];

describe.each(scopedHookCases)('$name request scope', (hookCase) => {
  it('uses claims-derived user ID and the active personal or group ID', async () => {
    const { rerender, unmount } = renderHook(hookCase.hook, {
      initialProps: { scope: personalScope as AnalyticsScope },
    });

    await waitFor(() =>
      expect(hookCase.clientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ...hookCase.expectedRequest,
          userId: '',
          groupId: '',
        })
      )
    );

    rerender({ scope: groupScope });
    await waitFor(() =>
      expect(hookCase.clientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ...hookCase.expectedRequest,
          userId: '',
          groupId: 'group-42',
        })
      )
    );

    unmount();
  });
});

describe('analytics hook mapping', () => {
  it('fills every day in the requested range so the heatmap grid is complete', async () => {
    getDailyAggregates.mockResolvedValue({
      aggregates: [
        {
          date: '2026-05-01',
          totalAmount: 42,
          totalAmountCents: BigInt(4200),
          transactionCount: 1,
          categoryAmounts: [
            {
              category: ExpenseCategory.FOOD,
              amount: 42,
              amountCents: BigInt(4200),
              count: 1,
            },
          ],
        },
        {
          date: '2026-05-03',
          totalAmount: 18,
          totalAmountCents: BigInt(1800),
          transactionCount: 2,
          categoryAmounts: [
            {
              category: ExpenseCategory.TRANSPORTATION,
              amount: 18,
              amountCents: BigInt(1800),
              count: 2,
            },
          ],
        },
      ],
      maxDailyAmount: 42,
      maxDailyAmountCents: BigInt(4200),
    });

    const { result } = renderHook(() =>
      useHeatmapData(
        new Date('2026-05-01T00:00:00.000Z'),
        new Date('2026-05-03T00:00:00.000Z'),
        personalScope
      )
    );

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data?.days).toEqual([
      {
        date: '2026-05-01',
        value: 42,
        count: 1,
        categories: [{ category: 'Food', amount: 42, count: 1 }],
      },
      {
        date: '2026-05-02',
        value: 0,
        count: 0,
        categories: [],
      },
      {
        date: '2026-05-03',
        value: 18,
        count: 2,
        categories: [{ category: 'Transportation', amount: 18, count: 2 }],
      },
    ]);
    expect(result.current.data?.maxValue).toBe(42);
  });

  it('paginates every expense page into one aligned category series', async () => {
    listExpenses
      .mockResolvedValueOnce({
        expenses: [
          {
            id: 'food-1',
            amount: 24,
            amountCents: BigInt(2400),
            category: ExpenseCategory.FOOD,
            date: {
              seconds: BigInt(
                Math.floor(
                  new Date('2026-05-04T10:00:00.000Z').getTime() / 1000
                )
              ),
              nanos: 0,
            },
          },
          {
            id: 'transport-1',
            amount: 15,
            amountCents: BigInt(1500),
            category: ExpenseCategory.TRANSPORTATION,
            date: {
              seconds: BigInt(
                Math.floor(
                  new Date('2026-05-04T14:00:00.000Z').getTime() / 1000
                )
              ),
              nanos: 0,
            },
          },
        ],
        nextPageToken: 'page-2',
      })
      .mockResolvedValueOnce({
        expenses: [
          {
            id: 'food-2',
            amount: 10,
            amountCents: BigInt(1000),
            category: ExpenseCategory.FOOD,
            date: {
              seconds: BigInt(
                Math.floor(
                  new Date('2026-04-28T09:00:00.000Z').getTime() / 1000
                )
              ),
              nanos: 0,
            },
          },
        ],
        nextPageToken: '',
      });

    const { result } = renderHook(() =>
      useCategorySpendingTrends('week', 2, personalScope)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(listExpenses).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: '',
        groupId: '',
        pageSize: 10000,
        pageToken: '',
      })
    );
    expect(listExpenses).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ pageToken: 'page-2' })
    );
    expect(result.current.categories).toEqual(['Food', 'Transportation']);
    expect(result.current.points).toEqual([
      {
        date: '2026-04-26',
        label: 'Apr 26',
        total: 10,
        categories: { Food: 10, Transportation: 0 },
      },
      {
        date: '2026-05-03',
        label: 'May 03',
        total: 39,
        categories: { Food: 24, Transportation: 15 },
      },
    ]);
  });

  it('stops category pagination when a server repeats its page token', async () => {
    listExpenses
      .mockResolvedValueOnce({ expenses: [], nextPageToken: 'repeat' })
      .mockResolvedValueOnce({ expenses: [], nextPageToken: 'repeat' });

    const { result } = renderHook(() =>
      useCategorySpendingTrends('month', 2, groupScope)
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listExpenses).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });
});

function dailyResponse(value: number): GetDailyAggregatesResponse {
  return typed<GetDailyAggregatesResponse>({
    aggregates: [
      {
        date: '2026-07-01',
        totalAmount: value,
        totalAmountCents: BigInt(value * 100),
        transactionCount: 1,
        categoryAmounts: [],
      },
    ],
    maxDailyAmount: value,
    maxDailyAmountCents: BigInt(value * 100),
  });
}

function spendingResponse(value: number): GetSpendingTrendsResponse {
  return typed<GetSpendingTrendsResponse>({
    expenseSeries: [],
    incomeSeries: [],
    trendSlope: value,
    trendRSquared: 1,
  });
}

function categoryTrendResponse(value: number): ListExpensesResponse {
  return typed<ListExpensesResponse>({
    expenses: [
      {
        id: `expense-${value}`,
        amount: value,
        amountCents: BigInt(value * 100),
        category: ExpenseCategory.FOOD,
        date: {
          seconds: BigInt(
            Math.floor(new Date('2020-01-05T12:00:00.000Z').getTime() / 1000)
          ),
          nanos: 500_000_000,
        },
      },
    ],
    nextPageToken: '',
  });
}

function comparisonResponse(value: number): GetCategoryComparisonResponse {
  return typed<GetCategoryComparisonResponse>({
    categories: [
      {
        category: ExpenseCategory.FOOD,
        currentAmount: value,
        currentAmountCents: BigInt(value * 100),
        previousAmount: 0,
        previousAmountCents: BigInt(0),
        budgetAmount: 0,
        budgetAmountCents: BigInt(0),
      },
    ],
    combinedBudgets: [],
  });
}

function anomalyResponse(expenseId: string): DetectAnomaliesResponse {
  return typed<DetectAnomaliesResponse>({
    anomalies: [
      {
        id: expenseId,
        expenseId,
        description: expenseId,
        amount: 22,
        amountCents: BigInt(2200),
        category: ExpenseCategory.FOOD,
        zScore: 2,
        expectedAmount: 10,
        expectedAmountCents: BigInt(1000),
        expectedLowerCents: BigInt(900),
        expectedUpperCents: BigInt(1100),
        hasExpectedRange: true,
        anomalyType: AnomalyType.AMOUNT_OUTLIER,
        severity: AnomalySeverity.HIGH,
      },
    ],
    anomalousSpendTotal: 22,
    anomalousSpendTotalCents: BigInt(2200),
    topAnomalyCategory: 'Food',
    analyzedExpenseCount: 1,
    eligibleCategoryCount: 1,
    minimumCategorySample: 5,
    hasSufficientHistory: true,
    categoryCoverage: [],
  });
}

function forecastResponse(value: number): GetCashFlowForecastResponse {
  return typed<GetCashFlowForecastResponse>({
    incomeForecast: [
      {
        date: '2026-07-14',
        predicted: value,
        predictedCents: BigInt(value * 100),
        lowerBound: 0,
        lowerBoundCents: BigInt(0),
        upperBound: 0,
        upperBoundCents: BigInt(0),
        isRecurring: false,
      },
    ],
    expenseForecast: [],
    netForecast: [],
    incomeHistory: [],
    expenseHistory: [],
  });
}

function waterfallResponse(value: number): GetWaterfallDataResponse {
  return typed<GetWaterfallDataResponse>({
    entries: [
      {
        label: `Income ${value}`,
        amount: value,
        amountCents: BigInt(value * 100),
        entryType: WaterfallEntryType.INCOME,
        runningTotal: value,
        runningTotalCents: BigInt(value * 100),
      },
    ],
    periodLabel: 'Current',
  });
}

type StaleHookCase<T> = {
  name: string;
  hook: (props: ScopeProps) => unknown;
  clientMock: jest.Mock;
  currentResponse: T;
  staleResponse: T;
  readMarker: (result: unknown) => unknown;
  expectedMarker: unknown;
  staleCompletion: 'resolve' | 'reject';
};

const staleHookCases: StaleHookCase<unknown>[] = [
  {
    name: 'useHeatmapData',
    hook: useHeatmapCase,
    clientMock: getDailyAggregates,
    currentResponse: dailyResponse(22),
    staleResponse: dailyResponse(11),
    readMarker: (result) =>
      (result as ReturnType<typeof useHeatmapCase>).data?.maxValue,
    expectedMarker: 22,
    staleCompletion: 'resolve',
  },
  {
    name: 'useSpendingTrends',
    hook: useSpendingCase,
    clientMock: getSpendingTrends,
    currentResponse: spendingResponse(22),
    staleResponse: spendingResponse(11),
    readMarker: (result) =>
      (result as ReturnType<typeof useSpendingCase>).trendSlope,
    expectedMarker: 22,
    staleCompletion: 'reject',
  },
  {
    name: 'useCategorySpendingTrends',
    hook: useCategoryTrendsCase,
    clientMock: listExpenses,
    currentResponse: categoryTrendResponse(22),
    staleResponse: categoryTrendResponse(11),
    readMarker: (result) =>
      (result as ReturnType<typeof useCategoryTrendsCase>).points.reduce(
        (total, point) => total + point.total,
        0
      ),
    expectedMarker: 22,
    staleCompletion: 'reject',
  },
  {
    name: 'useCategoryComparison',
    hook: useComparisonCase,
    clientMock: getCategoryComparison,
    currentResponse: comparisonResponse(22),
    staleResponse: comparisonResponse(11),
    readMarker: (result) =>
      (result as ReturnType<typeof useComparisonCase>).data?.[0]?.currentValue,
    expectedMarker: 22,
    staleCompletion: 'resolve',
  },
  {
    name: 'useAnomalies',
    hook: useAnomalyCase,
    clientMock: detectAnomalies,
    currentResponse: anomalyResponse('current-expense'),
    staleResponse: anomalyResponse('stale-expense'),
    readMarker: (result) =>
      (result as ReturnType<typeof useAnomalyCase>).data?.[0]?.expenseId,
    expectedMarker: 'current-expense',
    staleCompletion: 'reject',
  },
  {
    name: 'useCashFlowForecast',
    hook: useForecastCase,
    clientMock: getCashFlowForecast,
    currentResponse: forecastResponse(22),
    staleResponse: forecastResponse(11),
    readMarker: (result) =>
      (result as ReturnType<typeof useForecastCase>).incomeForecast?.[0]
        ?.predicted,
    expectedMarker: 22,
    staleCompletion: 'resolve',
  },
  {
    name: 'useWaterfallData',
    hook: useWaterfallCase,
    clientMock: getWaterfallData,
    currentResponse: waterfallResponse(22),
    staleResponse: waterfallResponse(11),
    readMarker: (result) =>
      (result as ReturnType<typeof useWaterfallCase>).data?.[0]?.amount,
    expectedMarker: 22,
    staleCompletion: 'reject',
  },
];

describe.each(staleHookCases)('$name stale request protection', (hookCase) => {
  it('keeps the current result and loading state when the prior request settles', async () => {
    const staleRequest = deferred<unknown>();
    const currentRequest = deferred<unknown>();
    hookCase.clientMock.mockReset();
    hookCase.clientMock
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderHook(hookCase.hook, {
      initialProps: { scope: personalScope as AnalyticsScope },
    });

    rerender({ scope: groupScope });
    await act(async () => {
      currentRequest.resolve(hookCase.currentResponse);
      await currentRequest.promise;
    });
    await waitFor(() =>
      expect(hookCase.readMarker(result.current)).toEqual(
        hookCase.expectedMarker
      )
    );

    await act(async () => {
      if (hookCase.staleCompletion === 'resolve') {
        staleRequest.resolve(hookCase.staleResponse);
        await staleRequest.promise;
      } else {
        staleRequest.reject(new Error('stale request failed'));
        await staleRequest.promise.catch(() => undefined);
      }
    });

    expect(hookCase.readMarker(result.current)).toEqual(
      hookCase.expectedMarker
    );
    expect(
      (result.current as { error: string | null }).error
    ).toBeNull();
    expect((result.current as { loading: boolean }).loading).toBe(false);
  });
});
