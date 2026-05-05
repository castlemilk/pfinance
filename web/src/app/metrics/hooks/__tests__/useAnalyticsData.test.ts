import { renderHook, waitFor } from '@testing-library/react';
import { useCategoryComparison, useHeatmapData } from '../useAnalyticsData';
import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import { financeClient } from '@/lib/financeService';

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getDailyAggregates: jest.fn(),
    getCategoryComparison: jest.fn(),
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
