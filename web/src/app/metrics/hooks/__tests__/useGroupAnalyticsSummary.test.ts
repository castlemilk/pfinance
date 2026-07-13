import { useLayoutEffect } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { GetGroupSummaryResponse } from '@/gen/pfinance/v1/finance_service_pb';
import type { AnalyticsScope } from '@/app/components/analytics/types';
import type { AnalyticsTimestampBound } from '@/app/metrics/types';
import { financeClient } from '@/lib/financeService';
import { useGroupAnalyticsSummary } from '../useGroupAnalyticsSummary';

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getGroupSummary: jest.fn(),
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

function response(
  overrides: Partial<GetGroupSummaryResponse> = {}
): GetGroupSummaryResponse {
  return {
    totalExpenses: 25,
    totalIncome: 100,
    expenseByCategory: [],
    memberBalances: [],
    unsettledExpenseCount: 0,
    unsettledAmount: 0,
    totalExpensesCents: BigInt(0),
    totalIncomeCents: BigInt(0),
    unsettledAmountCents: BigInt(0),
    ...overrides,
  } as GetGroupSummaryResponse;
}

const personalScope = { kind: 'personal' } as const satisfies AnalyticsScope;
const homeScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
} as const satisfies AnalyticsScope;
const workScope = {
  kind: 'group',
  groupId: 'group-work',
  groupName: 'Work',
} as const satisfies AnalyticsScope;
const start = new Date('2026-04-01T00:00:00.123Z');
const end = new Date('2026-06-30T23:59:59.987Z');

type HookProps = {
  scope: AnalyticsScope;
  start: Date | null;
  end: Date | null;
  enabled: boolean;
  startTimestamp?: AnalyticsTimestampBound | null;
  endTimestamp?: AnalyticsTimestampBound | null;
};

function renderSummaryHook(initialProps: HookProps) {
  return renderHook(
    (props: HookProps) => useGroupAnalyticsSummary(props),
    { initialProps }
  );
}

describe('useGroupAnalyticsSummary', () => {
  const getGroupSummary = financeClient.getGroupSummary as jest.Mock;

  beforeEach(() => {
    getGroupSummary.mockReset();
  });

  it.each([
    ['personal scope', personalScope, start, end, true],
    ['disabled group', homeScope, start, end, false],
    ['missing start', homeScope, null, end, true],
    ['missing end', homeScope, start, null, true],
    ['invalid start', homeScope, new Date('invalid'), end, true],
    ['invalid end', homeScope, start, new Date('invalid'), true],
    [
      'reversed range',
      homeScope,
      new Date('2026-07-01T00:00:00.000Z'),
      new Date('2026-06-01T00:00:00.000Z'),
      true,
    ],
    [
      'blank group id',
      { kind: 'group', groupId: '   ', groupName: 'Blank' } as const,
      start,
      end,
      true,
    ],
  ] as const)(
    'stays idle with no RPC for %s',
    (_, scope, rangeStart, rangeEnd, enabled) => {
      const { result } = renderSummaryHook({
        scope,
        start: rangeStart,
        end: rangeEnd,
        enabled,
      });

      expect(getGroupSummary).not.toHaveBeenCalled();
      expect(result.current).toMatchObject({
        data: null,
        loading: false,
        error: null,
      });
      expect(result.current).not.toHaveProperty('key');
    }
  );

  it('preserves timestamp milliseconds and maps every authoritative monetary field', async () => {
    const startBefore = start.getTime();
    const endBefore = end.getTime();
    getGroupSummary.mockResolvedValue(
      response({
        totalExpenses: 9_999,
        totalExpensesCents: BigInt(12_345),
        totalIncome: 888,
        totalIncomeCents: BigInt(0),
        unsettledExpenseCount: 3,
        unsettledAmount: 9_999,
        unsettledAmountCents: BigInt(5_025),
        memberBalances: [
          {
            $typeName: 'pfinance.v1.MemberBalance',
            userId: 'user-a',
            groupId: 'group-home',
            totalPaid: 9_999,
            totalPaidCents: BigInt(20_010),
            totalOwed: 40.5,
            totalOwedCents: BigInt(0),
            balance: 9_999,
            balanceCents: BigInt(-12_000),
            debts: [
              {
                $typeName: 'pfinance.v1.MemberDebt',
                fromUserId: 'user-a',
                toUserId: 'user-b',
                amount: 9_999,
                amountCents: BigInt(1_234),
                expenseCount: 4,
              },
            ],
          },
        ],
      })
    );

    const { result } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      enabled: true,
    });

    expect(result.current).toMatchObject({ data: null, loading: true, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getGroupSummary).toHaveBeenCalledWith({
      groupId: 'group-home',
      startDate: expect.objectContaining({
        seconds: BigInt(1_775_001_600),
        nanos: 123_000_000,
      }),
      endDate: expect.objectContaining({
        seconds: BigInt(1_782_863_999),
        nanos: 987_000_000,
      }),
    });
    expect(start.getTime()).toBe(startBefore);
    expect(end.getTime()).toBe(endBefore);
    expect(result.current.data).toEqual({
      totalExpenses: 123.45,
      totalIncome: 888,
      unsettledExpenseCount: 3,
      unsettledAmount: 50.25,
      memberBalances: [
        {
          userId: 'user-a',
          groupId: 'group-home',
          totalPaid: 200.1,
          totalOwed: 40.5,
          balance: -120,
          debts: [
            {
              fromUserId: 'user-a',
              toUserId: 'user-b',
              amount: 12.34,
              expenseCount: 4,
            },
          ],
        },
      ],
    });
    expect(result.current.error).toBeNull();
    expect(result.current).not.toHaveProperty('key');
  });

  it('preserves exact sub-millisecond bounds and keys requests by seconds and nanos', async () => {
    const firstStart = {
      seconds: BigInt(1_775_001_600),
      nanos: 123_456_789,
    } as const;
    const secondStart = { ...firstStart, nanos: 123_456_790 } as const;
    const exactEnd = {
      seconds: BigInt(1_782_863_999),
      nanos: 987_654_321,
    } as const;
    getGroupSummary
      .mockResolvedValueOnce(response({ totalIncomeCents: BigInt(10_000) }))
      .mockResolvedValueOnce(response({ totalIncomeCents: BigInt(20_000) }));

    const { result, rerender } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      startTimestamp: firstStart,
      endTimestamp: exactEnd,
      enabled: true,
    });
    await waitFor(() => expect(result.current.data?.totalIncome).toBe(100));

    expect(getGroupSummary).toHaveBeenLastCalledWith({
      groupId: 'group-home',
      startDate: expect.objectContaining(firstStart),
      endDate: expect.objectContaining(exactEnd),
    });

    rerender({
      scope: homeScope,
      start,
      end,
      startTimestamp: secondStart,
      endTimestamp: exactEnd,
      enabled: true,
    });
    expect(result.current).toMatchObject({
      data: null,
      loading: true,
      error: null,
    });
    await waitFor(() => expect(result.current.data?.totalIncome).toBe(200));

    expect(getGroupSummary).toHaveBeenLastCalledWith({
      groupId: 'group-home',
      startDate: expect.objectContaining(secondStart),
      endDate: expect.objectContaining(exactEnd),
    });
    expect(getGroupSummary).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'invalid nanos',
      { seconds: BigInt(1_775_001_600), nanos: 1_000_000_000 },
      { seconds: BigInt(1_782_863_999), nanos: 0 },
    ],
    [
      'a reversed exact range',
      { seconds: BigInt(1_782_863_999), nanos: 500 },
      { seconds: BigInt(1_782_863_999), nanos: 499 },
    ],
  ] as const)('stays idle for %s even when fallback Dates are valid', (_, exactStart, exactEnd) => {
    const { result } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      startTimestamp: exactStart,
      endTimestamp: exactEnd,
      enabled: true,
    });

    expect(result.current).toMatchObject({
      data: null,
      loading: false,
      error: null,
    });
    expect(getGroupSummary).not.toHaveBeenCalled();
  });

  it('keeps a held refetch stable, uses the latest key, and clears a failure on retry', async () => {
    getGroupSummary
      .mockRejectedValueOnce(new Error('Home summary failed'))
      .mockRejectedValueOnce(new Error('Work summary failed'))
      .mockResolvedValueOnce(
        response({
          totalIncomeCents: BigInt(55_500),
          unsettledExpenseCount: 1,
        })
      );

    const { result, rerender } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      enabled: true,
    });
    const heldRefetch = result.current.refetch;

    await waitFor(() => expect(result.current.error).toBe('Home summary failed'));
    rerender({
      scope: workScope,
      start: new Date('2026-07-01T00:00:00.111Z'),
      end: new Date('2026-07-31T23:59:59.222Z'),
      enabled: true,
    });

    expect(result.current.refetch).toBe(heldRefetch);
    expect(result.current).toMatchObject({ data: null, loading: true, error: null });
    await waitFor(() => expect(result.current.error).toBe('Work summary failed'));

    await act(async () => {
      await heldRefetch();
    });

    expect(getGroupSummary).toHaveBeenLastCalledWith(
      expect.objectContaining({
        groupId: 'group-work',
        startDate: expect.objectContaining({ nanos: 111_000_000 }),
        endDate: expect.objectContaining({ nanos: 222_000_000 }),
      })
    );
    expect(result.current.data?.totalIncome).toBe(555);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fails closed when any cents value is unsafe', async () => {
    getGroupSummary.mockResolvedValue(
      response({
        totalExpensesCents: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
        memberBalances: [
          {
            $typeName: 'pfinance.v1.MemberBalance',
            userId: 'unreachable',
            groupId: 'group-home',
            totalPaid: 0,
            totalPaidCents: BigInt(0),
            totalOwed: 0,
            totalOwedCents: BigInt(0),
            balance: 0,
            balanceCents: BigInt(0),
            debts: [],
          },
        ],
      })
    );

    const { result } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      enabled: true,
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Analytics data contains an unsafe monetary value'
      )
    );
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('never flashes an old success when a new group key is pending', async () => {
    const oldRequest = deferred<GetGroupSummaryResponse>();
    const currentRequest = deferred<GetGroupSummaryResponse>();
    getGroupSummary
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      enabled: true,
    });
    rerender({ scope: workScope, start, end, enabled: true });

    expect(result.current).toMatchObject({ data: null, loading: true, error: null });
    await act(async () => {
      oldRequest.resolve(response({ totalIncomeCents: BigInt(10_000) }));
      await oldRequest.promise;
    });
    expect(result.current).toMatchObject({ data: null, loading: true, error: null });

    await act(async () => {
      currentRequest.resolve(response({ totalIncomeCents: BigInt(20_000) }));
      await currentRequest.promise;
    });
    expect(result.current.data?.totalIncome).toBe(200);
    expect(result.current.loading).toBe(false);
  });

  it('keeps a settled new group unchanged after an old group rejects', async () => {
    const oldRequest = deferred<GetGroupSummaryResponse>();
    const currentRequest = deferred<GetGroupSummaryResponse>();
    getGroupSummary
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      enabled: true,
    });
    rerender({ scope: workScope, start, end, enabled: true });

    await act(async () => {
      currentRequest.resolve(response({ totalIncomeCents: BigInt(22_500) }));
      await currentRequest.promise;
    });
    expect(result.current).toMatchObject({
      data: expect.objectContaining({ totalIncome: 225 }),
      loading: false,
      error: null,
    });

    await act(async () => {
      oldRequest.reject(new Error('old group failed'));
      await oldRequest.promise.catch(() => undefined);
    });
    expect(result.current).toMatchObject({
      data: expect.objectContaining({ totalIncome: 225 }),
      loading: false,
      error: null,
    });
  });

  it('ignores an old rejection and becomes idle immediately when disabled or personal', async () => {
    const oldRequest = deferred<GetGroupSummaryResponse>();
    getGroupSummary.mockImplementationOnce(() => oldRequest.promise);

    const { result, rerender } = renderSummaryHook({
      scope: homeScope,
      start,
      end,
      enabled: true,
    });
    expect(result.current.loading).toBe(true);

    rerender({ scope: homeScope, start, end, enabled: false });
    expect(result.current).toMatchObject({ data: null, loading: false, error: null });

    await act(async () => {
      oldRequest.reject(new Error('stale failure'));
      await oldRequest.promise.catch(() => undefined);
    });
    expect(result.current).toMatchObject({ data: null, loading: false, error: null });

    rerender({ scope: personalScope, start, end, enabled: true });
    expect(result.current).toMatchObject({ data: null, loading: false, error: null });
    expect(getGroupSummary).toHaveBeenCalledTimes(1);
  });

  it('hides keyed success before passive effects when the same key is re-enabled', async () => {
    const staleRequest = deferred<GetGroupSummaryResponse>();
    const freshRequest = deferred<GetGroupSummaryResponse>();
    getGroupSummary
      .mockResolvedValueOnce(response({ totalIncomeCents: BigInt(10_000) }))
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => freshRequest.promise);
    const layoutSnapshots: Array<{
      phase: string;
      data: ReturnType<typeof useGroupAnalyticsSummary>['data'];
      loading: boolean;
      error: string | null;
    }> = [];

    const { result, rerender } = renderHook(
      ({ phase, ...hookProps }: HookProps & { phase: string }) => {
        const summary = useGroupAnalyticsSummary(hookProps);
        useLayoutEffect(() => {
          layoutSnapshots.push({
            phase,
            data: summary.data,
            loading: summary.loading,
            error: summary.error,
          });
        }, [phase, summary]);
        return summary;
      },
      {
        initialProps: {
          scope: homeScope,
          start,
          end,
          enabled: true,
          phase: 'initial',
        },
      }
    );
    await waitFor(() => expect(result.current.data?.totalIncome).toBe(100));

    rerender({
      scope: homeScope,
      start,
      end,
      enabled: false,
      phase: 'disabled',
    });
    expect(result.current).toMatchObject({
      data: null,
      loading: false,
      error: null,
    });

    rerender({
      scope: homeScope,
      start,
      end,
      enabled: true,
      phase: 'first-reenable',
    });
    expect(
      layoutSnapshots.filter(({ phase }) => phase === 'first-reenable')[0]
    ).toMatchObject({
      data: null,
      loading: true,
      error: null,
    });
    await waitFor(() => expect(getGroupSummary).toHaveBeenCalledTimes(2));

    rerender({
      scope: homeScope,
      start,
      end,
      enabled: false,
      phase: 'disabled-again',
    });
    rerender({
      scope: homeScope,
      start,
      end,
      enabled: true,
      phase: 'second-reenable',
    });
    await waitFor(() => expect(getGroupSummary).toHaveBeenCalledTimes(3));

    await act(async () => {
      staleRequest.resolve(response({ totalIncomeCents: BigInt(20_000) }));
      await staleRequest.promise;
    });
    expect(result.current).toMatchObject({
      data: null,
      loading: true,
      error: null,
    });

    await act(async () => {
      freshRequest.resolve(response({ totalIncomeCents: BigInt(30_000) }));
      await freshRequest.promise;
    });
    expect(result.current).toMatchObject({
      data: expect.objectContaining({ totalIncome: 300 }),
      loading: false,
      error: null,
    });
    expect(getGroupSummary).toHaveBeenCalledTimes(3);
  });
});
