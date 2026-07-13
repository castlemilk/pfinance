'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { financeClient } from '@/lib/financeService';
import type { ExtractionEvent } from '@/gen/pfinance/v1/types_pb';

export interface ExtractionMetricsData {
  totalExtractions: number;
  totalTransactions: number;
  totalCorrections: number;
  correctionRate: number;
  averageConfidence: number;
  correctionsByField: { [key: string]: number };
  correctionsByCategory: { [key: string]: number };
  recentEvents: ExtractionEvent[];
}

interface ExtractionMetricsState {
  key: string | null;
  data: ExtractionMetricsData | null;
  loading: boolean;
  error: string | null;
}

export function useExtractionMetrics(days: number = 30) {
  const [state, setState] = useState<ExtractionMetricsState>({
    key: null,
    data: null,
    loading: false,
    error: null,
  });
  const requestKey = `days:${Object.is(days, -0) ? '-0' : String(days)}`;
  const latestRequestRef = useRef({ requestKey, days });
  // Async callbacks must observe the inputs from the latest render while the
  // public refetch callback remains stable.
  // eslint-disable-next-line react-hooks/refs
  latestRequestRef.current = { requestKey, days };
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const request = latestRequestRef.current;
    setState({
      key: request.requestKey,
      data: null,
      loading: true,
      error: null,
    });

    try {
      const response = await financeClient.getExtractionMetrics({
        userId: '',
        days: request.days,
      });
      if (requestIdRef.current !== requestId) return;

      setState({
        key: request.requestKey,
        data: {
          totalExtractions: response.totalExtractions,
          totalTransactions: response.totalTransactions,
          totalCorrections: response.totalCorrections,
          correctionRate: response.correctionRate,
          averageConfidence: response.averageConfidence,
          correctionsByField: response.correctionsByField,
          correctionsByCategory: response.correctionsByCategory,
          recentEvents: response.recentEvents,
        },
        loading: false,
        error: null,
      });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setState({
        key: request.requestKey,
        data: null,
        loading: false,
        error:
          err instanceof Error
            ? err.message
            : 'Failed to fetch extraction metrics',
      });
    }
  }, []);

  useEffect(() => {
    void fetchData();
    return () => {
      requestIdRef.current += 1;
    };
  }, [fetchData, requestKey]);

  if (state.key !== requestKey) {
    return { data: null, loading: true, error: null, refetch: fetchData };
  }
  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch: fetchData,
  };
}
