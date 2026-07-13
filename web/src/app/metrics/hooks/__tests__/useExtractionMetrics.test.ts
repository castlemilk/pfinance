import { act, renderHook, waitFor } from '@testing-library/react';

import { financeClient } from '@/lib/financeService';

import { useExtractionMetrics } from '../useExtractionMetrics';

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    getExtractionMetrics: jest.fn(),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function metricsResponse(totalExtractions: number) {
  return {
    totalExtractions,
    totalTransactions: totalExtractions * 2,
    totalCorrections: 0,
    correctionRate: 0,
    averageConfidence: 0.9,
    correctionsByField: {},
    correctionsByCategory: {},
    recentEvents: [],
  };
}

describe('useExtractionMetrics', () => {
  const getExtractionMetrics =
    financeClient.getExtractionMetrics as jest.Mock;

  beforeEach(() => {
    getExtractionMetrics.mockReset();
  });

  it('masks settled evidence synchronously when the day window changes', async () => {
    const currentRequest = deferred<ReturnType<typeof metricsResponse>>();
    getExtractionMetrics
      .mockResolvedValueOnce(metricsResponse(3))
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderHook(
      ({ days }: { days: number }) => useExtractionMetrics(days),
      { initialProps: { days: 30 } }
    );
    await waitFor(() =>
      expect(result.current.data?.totalExtractions).toBe(3)
    );
    const heldRefetch = result.current.refetch;

    rerender({ days: 90 });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.refetch).toBe(heldRefetch);

    await act(async () => {
      currentRequest.resolve(metricsResponse(9));
      await currentRequest.promise;
    });
    await waitFor(() =>
      expect(result.current.data?.totalExtractions).toBe(9)
    );
    expect(getExtractionMetrics).toHaveBeenLastCalledWith({
      userId: '',
      days: 90,
    });
  });

  it('ignores a stale completion after the day window changes', async () => {
    const staleRequest = deferred<ReturnType<typeof metricsResponse>>();
    const currentRequest = deferred<ReturnType<typeof metricsResponse>>();
    getExtractionMetrics
      .mockImplementationOnce(() => staleRequest.promise)
      .mockImplementationOnce(() => currentRequest.promise);

    const { result, rerender } = renderHook(
      ({ days }: { days: number }) => useExtractionMetrics(days),
      { initialProps: { days: 30 } }
    );
    rerender({ days: 90 });

    await act(async () => {
      currentRequest.resolve(metricsResponse(9));
      await currentRequest.promise;
    });
    await waitFor(() =>
      expect(result.current.data?.totalExtractions).toBe(9)
    );

    await act(async () => {
      staleRequest.resolve(metricsResponse(3));
      await staleRequest.promise;
    });

    expect(result.current.data?.totalExtractions).toBe(9);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
