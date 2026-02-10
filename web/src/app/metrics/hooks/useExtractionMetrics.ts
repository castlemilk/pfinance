'use client';

import { useState, useEffect, useCallback } from 'react';
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

export function useExtractionMetrics(days: number = 30) {
  const [data, setData] = useState<ExtractionMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.getExtractionMetrics({
        userId: '',
        days,
      });

      setData({
        totalExtractions: response.totalExtractions,
        totalTransactions: response.totalTransactions,
        totalCorrections: response.totalCorrections,
        correctionRate: response.correctionRate,
        averageConfidence: response.averageConfidence,
        correctionsByField: response.correctionsByField,
        correctionsByCategory: response.correctionsByCategory,
        recentEvents: response.recentEvents,
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch extraction metrics'
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
