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

interface OverviewRequestState {
  key: string | null;
  data: AnalyticsOverviewData | null;
  loading: boolean;
  error: string | null;
}

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
  const [state, setState] = useState<OverviewRequestState>({
    key: null,
    data: null,
    loading: false,
    error: null,
  });
  const requestIdRef = useRef(0);
  const groupId = scopeGroupId(scope);
  const requestKey = JSON.stringify([
    scope.kind,
    scope.kind === 'group' ? groupId : '',
    period,
  ]);
  const latestParametersRef = useRef({ requestKey, groupId, period });
  // The stable refetch callback reads the most recent request inputs.
  // eslint-disable-next-line react-hooks/refs
  latestParametersRef.current = { requestKey, groupId, period };

  const refetch = useCallback(async () => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const parameters = latestParametersRef.current;
    setState({
      key: parameters.requestKey,
      data: null,
      loading: true,
      error: null,
    });

    try {
      const response = await financeClient.getAnalyticsOverview({
        userId: '',
        groupId: parameters.groupId,
        period: analyticsPeriodToProto(parameters.period),
      });
      if (requestIdRef.current !== requestId) return;
      setState({
        key: parameters.requestKey,
        data: mapAnalyticsOverviewResponse(response),
        loading: false,
        error: null,
      });
    } catch (caughtError) {
      if (requestIdRef.current !== requestId) return;
      setState({
        key: parameters.requestKey,
        data: null,
        loading: false,
        error: overviewErrorMessage(caughtError),
      });
    }
  }, []);

  useEffect(() => {
    void refetch();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refetch, requestKey]);

  if (state.key !== requestKey) {
    return { data: null, loading: true, error: null, refetch };
  }
  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch,
  };
}
