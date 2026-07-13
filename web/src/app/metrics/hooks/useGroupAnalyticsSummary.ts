'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { create } from '@bufbuild/protobuf';
import { TimestampSchema, timestampFromDate } from '@bufbuild/protobuf/wkt';

import type { AnalyticsScope } from '@/app/components/analytics/types';
import type { AnalyticsTimestampBound } from '@/app/metrics/types';
import type { GetGroupSummaryResponse } from '@/gen/pfinance/v1/finance_service_pb';
import { financeClient } from '@/lib/financeService';
import { checkedCentsToDollars } from '../analyticsMappers';

export type GroupAnalyticsDebt = Readonly<{
  fromUserId: string;
  toUserId: string;
  amount: number;
  expenseCount: number;
}>;

export type GroupAnalyticsMemberBalance = Readonly<{
  userId: string;
  groupId: string;
  totalPaid: number;
  totalOwed: number;
  balance: number;
  debts: readonly GroupAnalyticsDebt[];
}>;

export type GroupAnalyticsSummary = Readonly<{
  totalExpenses: number;
  totalIncome: number;
  unsettledExpenseCount: number;
  unsettledAmount: number;
  memberBalances: readonly GroupAnalyticsMemberBalance[];
}>;

export type UseGroupAnalyticsSummaryParameters = Readonly<{
  scope: AnalyticsScope;
  start: Date | null;
  end: Date | null;
  startTimestamp?: AnalyticsTimestampBound | null;
  endTimestamp?: AnalyticsTimestampBound | null;
  enabled: boolean;
}>;

export type UseGroupAnalyticsSummaryResult = Readonly<{
  data: GroupAnalyticsSummary | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}>;

type ValidRequest = Readonly<{
  key: string;
  groupId: string;
  startTimestamp: AnalyticsTimestampBound;
  endTimestamp: AnalyticsTimestampBound;
}>;

type RequestInputs = Readonly<{
  enabled: boolean;
  scopeKind: AnalyticsScope['kind'];
  groupId: string;
  startMilliseconds: number | null;
  endMilliseconds: number | null;
  startTimestamp: AnalyticsTimestampBound | null;
  endTimestamp: AnalyticsTimestampBound | null;
}>;

type RequestState = Readonly<{
  key: string | null;
  data: GroupAnalyticsSummary | null;
  loading: boolean;
  error: string | null;
}>;

const IDLE_STATE: RequestState = Object.freeze({
  key: null,
  data: null,
  loading: false,
  error: null,
});

const MIN_TIMESTAMP_SECONDS = BigInt(-62_135_596_800);
const MAX_TIMESTAMP_SECONDS = BigInt(253_402_300_799);

function validatedTimestamp(
  timestamp: AnalyticsTimestampBound | null
): AnalyticsTimestampBound | null {
  if (
    !timestamp ||
    typeof timestamp.seconds !== 'bigint' ||
    timestamp.seconds < MIN_TIMESTAMP_SECONDS ||
    timestamp.seconds > MAX_TIMESTAMP_SECONDS ||
    !Number.isInteger(timestamp.nanos) ||
    timestamp.nanos < 0 ||
    timestamp.nanos >= 1_000_000_000
  ) {
    return null;
  }

  return {
    seconds: timestamp.seconds,
    nanos: timestamp.nanos,
  };
}

function compareTimestamps(
  left: AnalyticsTimestampBound,
  right: AnalyticsTimestampBound
): number {
  if (left.seconds < right.seconds) return -1;
  if (left.seconds > right.seconds) return 1;
  return left.nanos - right.nanos;
}

function dateTimestamp(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) {
    return null;
  }
  const timestamp = timestampFromDate(new Date(milliseconds));
  return validatedTimestamp(timestamp);
}

function validRequest({
  enabled,
  scopeKind,
  groupId,
  startMilliseconds,
  endMilliseconds,
  startTimestamp,
  endTimestamp,
}: RequestInputs): ValidRequest | null {
  if (!enabled || scopeKind !== 'group' || groupId.trim().length === 0) {
    return null;
  }

  const hasExactBound = startTimestamp !== null || endTimestamp !== null;
  const requestStart = hasExactBound
    ? validatedTimestamp(startTimestamp)
    : dateTimestamp(startMilliseconds);
  const requestEnd = hasExactBound
    ? validatedTimestamp(endTimestamp)
    : dateTimestamp(endMilliseconds);
  if (!requestStart || !requestEnd || compareTimestamps(requestStart, requestEnd) > 0) {
    return null;
  }

  return {
    key: JSON.stringify([
      groupId,
      requestStart.seconds.toString(),
      requestStart.nanos,
      requestEnd.seconds.toString(),
      requestEnd.nanos,
    ]),
    groupId,
    startTimestamp: requestStart,
    endTimestamp: requestEnd,
  };
}

function mapGroupSummary(
  response: GetGroupSummaryResponse
): GroupAnalyticsSummary {
  return {
    totalExpenses: checkedCentsToDollars(
      response.totalExpensesCents,
      response.totalExpenses
    ),
    totalIncome: checkedCentsToDollars(
      response.totalIncomeCents,
      response.totalIncome
    ),
    unsettledExpenseCount: response.unsettledExpenseCount,
    unsettledAmount: checkedCentsToDollars(
      response.unsettledAmountCents,
      response.unsettledAmount
    ),
    memberBalances: response.memberBalances.map((member) => ({
      userId: member.userId,
      groupId: member.groupId,
      totalPaid: checkedCentsToDollars(
        member.totalPaidCents,
        member.totalPaid
      ),
      totalOwed: checkedCentsToDollars(
        member.totalOwedCents,
        member.totalOwed
      ),
      balance: checkedCentsToDollars(member.balanceCents, member.balance),
      debts: member.debts.map((debt) => ({
        fromUserId: debt.fromUserId,
        toUserId: debt.toUserId,
        amount: checkedCentsToDollars(debt.amountCents, debt.amount),
        expenseCount: debt.expenseCount,
      })),
    })),
  };
}

function groupSummaryError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Failed to fetch group analytics summary';
}

export function useGroupAnalyticsSummary(
  parameters: UseGroupAnalyticsSummaryParameters
): UseGroupAnalyticsSummaryResult {
  const scopeKind = parameters.scope.kind;
  const groupId =
    parameters.scope.kind === 'group' ? parameters.scope.groupId : '';
  const startMilliseconds = parameters.start?.getTime() ?? null;
  const endMilliseconds = parameters.end?.getTime() ?? null;
  const startSeconds = parameters.startTimestamp?.seconds ?? null;
  const startNanos = parameters.startTimestamp?.nanos ?? null;
  const endSeconds = parameters.endTimestamp?.seconds ?? null;
  const endNanos = parameters.endTimestamp?.nanos ?? null;
  const request = useMemo(
    () =>
      validRequest({
        enabled: parameters.enabled,
        scopeKind,
        groupId,
        startMilliseconds,
        endMilliseconds,
        startTimestamp:
          startSeconds === null || startNanos === null
            ? null
            : { seconds: startSeconds, nanos: startNanos },
        endTimestamp:
          endSeconds === null || endNanos === null
            ? null
            : { seconds: endSeconds, nanos: endNanos },
      }),
    [
      endMilliseconds,
      endNanos,
      endSeconds,
      groupId,
      parameters.enabled,
      scopeKind,
      startMilliseconds,
      startNanos,
      startSeconds,
    ]
  );
  const requestKey = request?.key ?? null;
  const latestCommittedRequestRef = useRef<ValidRequest | null>(null);
  const requestIdRef = useRef(0);
  const [state, setState] = useState<RequestState>(IDLE_STATE);

  const executeRequest = useCallback(async (activeRequest: ValidRequest | null) => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;

    if (!activeRequest) {
      setState(IDLE_STATE);
      return;
    }

    setState({
      key: activeRequest.key,
      data: null,
      loading: true,
      error: null,
    });

    try {
      const response = await financeClient.getGroupSummary({
        groupId: activeRequest.groupId,
        startDate: create(TimestampSchema, activeRequest.startTimestamp),
        endDate: create(TimestampSchema, activeRequest.endTimestamp),
      });
      const mapped = mapGroupSummary(response);
      if (
        requestIdRef.current !== requestId ||
        latestCommittedRequestRef.current?.key !== activeRequest.key
      ) {
        return;
      }
      setState({
        key: activeRequest.key,
        data: mapped,
        loading: false,
        error: null,
      });
    } catch (error) {
      if (
        requestIdRef.current !== requestId ||
        latestCommittedRequestRef.current?.key !== activeRequest.key
      ) {
        return;
      }
      setState({
        key: activeRequest.key,
        data: null,
        loading: false,
        error: groupSummaryError(error),
      });
    }
  }, []);

  const refetch = useCallback(
    () => executeRequest(latestCommittedRequestRef.current),
    [executeRequest]
  );

  useEffect(() => {
    latestCommittedRequestRef.current = request;
    if (!request) {
      requestIdRef.current += 1;
      // A committed idle period invalidates keyed success so re-enabling the
      // same request cannot expose it before the next passive effect runs.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((current) => (current === IDLE_STATE ? current : IDLE_STATE));
      return;
    }

    // Fetch state must reset on each committed activation, including when the
    // same request key is re-enabled after being idle.
    void executeRequest(request);
    return () => {
      requestIdRef.current += 1;
      if (latestCommittedRequestRef.current?.key === request.key) {
        latestCommittedRequestRef.current = null;
      }
    };
  }, [executeRequest, request, requestKey]);

  if (requestKey === null) {
    return {
      data: null,
      loading: false,
      error: null,
      refetch,
    };
  }
  if (state.key !== requestKey) {
    return {
      data: null,
      loading: true,
      error: null,
      refetch,
    };
  }

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    refetch,
  };
}
