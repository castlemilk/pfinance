import { renderHook, waitFor } from '@testing-library/react';
import {
  useCategoryComparison,
  useCategorySpendingTrends,
  useHeatmapData,
} from '../useAnalyticsData';
import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import { financeClient } from '@/lib/financeService';

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getDailyAggregates: jest.fn(),
    getCategoryComparison: jest.fn(),
    listExpenses: jest.fn(),
  },
}));

describe('useHeatmapData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('fills every day in the requested range so the heatmap grid is complete', async () => {
    (financeClient.getDailyAggregates as jest.Mock).mockResolvedValue({
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
        new Date('2026-05-03T00:00:00.000Z')
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
});

describe('useCategoryComparison', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests the selected comparison period from the analytics API', async () => {
    (financeClient.getCategoryComparison as jest.Mock).mockResolvedValue({
      categories: [],
    });

    renderHook(() => useCategoryComparison(false, 'year'));

    await waitFor(() =>
      expect(financeClient.getCategoryComparison).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPeriod: 'year',
          includeBudgets: false,
        })
      )
    );
  });
});

describe('useCategorySpendingTrends', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-05T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('buckets all category spend into one aligned stacked time series', async () => {
    (financeClient.listExpenses as jest.Mock).mockResolvedValue({
      expenses: [
        {
          id: 'food-1',
          amount: 24,
          amountCents: BigInt(2400),
          category: ExpenseCategory.FOOD,
          date: { seconds: BigInt(Math.floor(new Date('2026-05-04T10:00:00.000Z').getTime() / 1000)), nanos: 0 },
        },
        {
          id: 'transport-1',
          amount: 15,
          amountCents: BigInt(1500),
          category: ExpenseCategory.TRANSPORTATION,
          date: { seconds: BigInt(Math.floor(new Date('2026-05-04T14:00:00.000Z').getTime() / 1000)), nanos: 0 },
        },
        {
          id: 'food-2',
          amount: 10,
          amountCents: BigInt(1000),
          category: ExpenseCategory.FOOD,
          date: { seconds: BigInt(Math.floor(new Date('2026-04-28T09:00:00.000Z').getTime() / 1000)), nanos: 0 },
        },
      ],
      nextPageToken: '',
    });

    const { result } = renderHook(() => useCategorySpendingTrends('week', 2));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(financeClient.listExpenses).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: '',
        groupId: '',
        pageSize: 10000,
      })
    );
    expect(result.current.categories).toEqual(['Food', 'Transportation']);
    expect(result.current.points).toEqual([
      {
        date: '2026-04-26',
        label: 'Apr 26',
        total: 10,
        categories: {
          Food: 10,
          Transportation: 0,
        },
      },
      {
        date: '2026-05-03',
        label: 'May 03',
        total: 39,
        categories: {
          Food: 24,
          Transportation: 15,
        },
      },
    ]);
  });
});
