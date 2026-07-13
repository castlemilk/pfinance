import { act, renderHook, waitFor } from '@testing-library/react';
import type { GetAnalyticsOverviewResponse } from '@/gen/pfinance/v1/finance_service_pb';
import { AnalyticsPeriod as ProtoAnalyticsPeriod, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import { financeClient } from '@/lib/financeService';
import type {
  AnalyticsPeriod,
  AnalyticsScope,
} from '@/app/components/analytics/types';
import { useAnalyticsOverview } from '../useAnalyticsOverview';

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getAnalyticsOverview: jest.fn(),
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

function overviewResponse(
  currentIncomeCents: bigint,
  overrides: Partial<GetAnalyticsOverviewResponse> = {}
): GetAnalyticsOverviewResponse {
  return {
    currentStart: { seconds: BigInt(1_700_000_000), nanos: 250_000_000 },
    currentEnd: { seconds: BigInt(1_700_086_400), nanos: 0 },
    previousStart: undefined,
    previousEnd: undefined,
    currentIncomeCents,
    currentExpenseCents: BigInt(4_000),
    currentNetCents: currentIncomeCents - BigInt(4_000),
    previousIncomeCents: BigInt(8_000),
    previousExpenseCents: BigInt(5_000),
    previousNetCents: BigInt(3_000),
    savingsRatePercent: 60,
    hasSavingsRate: true,
    incomeChangePercent: 25,
    hasIncomeChange: true,
    expenseChangePercent: 0,
    hasExpenseChange: false,
    largestCategory: ExpenseCategory.FOOD,
    largestCategoryAmountCents: BigInt(2_500),
    currentTransactionCount: 4,
    previousTransactionCount: 3,
    hasCurrentData: true,
    ...overrides,
  } as GetAnalyticsOverviewResponse;
}

const personalScope: AnalyticsScope = { kind: 'personal' };
const homeScope: AnalyticsScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
};

describe('useAnalyticsOverview', () => {
  const getAnalyticsOverview = financeClient.getAnalyticsOverview as jest.Mock;

  beforeEach(() => {
    jest.useRealTimers();
    getAnalyticsOverview.mockReset();
  });

  it('requests personal analytics with claims-derived user scope and maps authoritative fields', async () => {
    getAnalyticsOverview.mockResolvedValue(overviewResponse(BigInt(10_000)));

    const { result } = renderHook(() =>
      useAnalyticsOverview(personalScope, 'month')
    );

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(Object.keys(result.current).sort()).toEqual([
      'data',
      'error',
      'loading',
      'refetch',
    ]);
    expect(getAnalyticsOverview).toHaveBeenCalledWith({
      userId: '',
      groupId: '',
      period: ProtoAnalyticsPeriod.MONTH,
    });
    expect(result.current.data).toMatchObject({
      currentIncome: 100,
      currentExpense: 40,
      currentNet: 60,
      hasSavingsRate: true,
      hasExpenseChange: false,
      largestCategory: 'Food',
      largestCategoryAmount: 25,
      hasCurrentData: true,
    });
    expect(result.current.data?.currentStart?.getTime()).toBe(
      1_700_000_000_250
    );
    expect(result.current.data?.previousStart).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('keeps refetch stable and retries the current group and period after failures', async () => {
    getAnalyticsOverview
      .mockRejectedValueOnce(new Error('personal failed'))
      .mockRejectedValueOnce(new Error('group failed'))
      .mockResolvedValueOnce(overviewResponse(BigInt(30_000)));

    const { result, rerender } = renderHook(
      ({ scope, period }: { scope: AnalyticsScope; period: AnalyticsPeriod }) =>
        useAnalyticsOverview(scope, period),
      {
        initialProps: {
          scope: personalScope as AnalyticsScope,
          period: 'month' as AnalyticsPeriod,
        },
      }
    );

    await waitFor(() => expect(result.current.error).toBe('personal failed'));
    const originalRefetch = result.current.refetch;

    rerender({ scope: homeScope, period: 'year' });
    await waitFor(() => expect(result.current.error).toBe('group failed'));
    expect(result.current.refetch).toBe(originalRefetch);

    await act(async () => {
      await originalRefetch();
    });

    expect(getAnalyticsOverview).toHaveBeenLastCalledWith({
      userId: '',
      groupId: 'group-home',
      period: ProtoAnalyticsPeriod.YEAR,
    });
    expect(result.current.data?.currentIncome).toBe(300);
    expect(result.current.error).toBeNull();
  });

  it('ignores stale success after the group and period switch', async () => {
    const oldRequest = deferred<GetAnalyticsOverviewResponse>();
    const currentRequest = deferred<GetAnalyticsOverviewResponse>();
    getAnalyticsOverview
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderHook(
      ({ scope, period }: { scope: AnalyticsScope; period: AnalyticsPeriod }) =>
        useAnalyticsOverview(scope, period),
      {
        initialProps: {
          scope: personalScope as AnalyticsScope,
          period: 'month' as AnalyticsPeriod,
        },
      }
    );

    rerender({ scope: homeScope, period: 'quarter' });
    await act(async () => {
      currentRequest.resolve(overviewResponse(BigInt(20_000)));
      await currentRequest.promise;
    });
    await waitFor(() => expect(result.current.data?.currentIncome).toBe(200));

    await act(async () => {
      oldRequest.resolve(overviewResponse(BigInt(10_000)));
      await oldRequest.promise;
    });

    expect(result.current.data?.currentIncome).toBe(200);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('ignores stale rejection after the group and period switch', async () => {
    const oldRequest = deferred<GetAnalyticsOverviewResponse>();
    const currentRequest = deferred<GetAnalyticsOverviewResponse>();
    getAnalyticsOverview
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderHook(
      ({ scope, period }: { scope: AnalyticsScope; period: AnalyticsPeriod }) =>
        useAnalyticsOverview(scope, period),
      {
        initialProps: {
          scope: personalScope as AnalyticsScope,
          period: 'month' as AnalyticsPeriod,
        },
      }
    );

    rerender({ scope: homeScope, period: 'quarter' });
    await act(async () => {
      currentRequest.resolve(overviewResponse(BigInt(20_000)));
      await currentRequest.promise;
    });
    await waitFor(() => expect(result.current.data?.currentIncome).toBe(200));

    await act(async () => {
      oldRequest.reject(new Error('stale failure'));
      await oldRequest.promise.catch(() => undefined);
    });

    expect(result.current.data?.currentIncome).toBe(200);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
