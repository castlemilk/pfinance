'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnalyticsPeriod,
  AnalyticsScope,
} from '@/app/components/analytics/types';
import { scopeGroupId } from '@/app/components/analytics/types';
import { AnalyticsPeriod as ProtoAnalyticsPeriod } from '@/gen/pfinance/v1/types_pb';
import { financeClient } from '@/lib/financeService';
import { mapAnalyticsOverviewResponse } from '../analyticsMappers';
import type { AnalyticsOverviewData } from '../types';

function analyticsPeriodToProto(period: AnalyticsPeriod): ProtoAnalyticsPeriod {
  switch (period) {
    case 'month':
      return ProtoAnalyticsPeriod.MONTH;
    case 'quarter':
      return ProtoAnalyticsPeriod.QUARTER;
    case 'year':
      return ProtoAnalyticsPeriod.YEAR;
  }
}

function overviewErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to fetch analytics overview';
}

export function useAnalyticsOverview(
  scope: AnalyticsScope,
  period: AnalyticsPeriod
) {
  const [data, setData] = useState<AnalyticsOverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const groupId = scopeGroupId(scope);
  const latestParametersRef = useRef({ groupId, period });
  latestParametersRef.current = { groupId, period };

  const refetch = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const parameters = latestParametersRef.current;
    setLoading(true);
    setError(null);

    try {
      const response = await financeClient.getAnalyticsOverview({
        userId: '',
        groupId: parameters.groupId,
        period: analyticsPeriodToProto(parameters.period),
      });
      if (requestIdRef.current !== requestId) return;
      setData(mapAnalyticsOverviewResponse(response));
    } catch (caughtError) {
      if (requestIdRef.current !== requestId) return;
      setError(overviewErrorMessage(caughtError));
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
    return () => {
      requestIdRef.current += 1;
    };
  }, [groupId, period, refetch]);

  return { data, loading, error, refetch };
}
