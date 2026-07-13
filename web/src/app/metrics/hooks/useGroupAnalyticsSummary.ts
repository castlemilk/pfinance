'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';

import type { AnalyticsScope } from '@/app/components/analytics/types';
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
  startMilliseconds: number;
  endMilliseconds: number;
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

function validRequest({
  scope,
  start,
  end,
  enabled,
}: UseGroupAnalyticsSummaryParameters): ValidRequest | null {
  if (!enabled || scope.kind !== 'group' || scope.groupId.trim().length === 0) {
    return null;
  }

  const startMilliseconds = start?.getTime() ?? Number.NaN;
  const endMilliseconds = end?.getTime() ?? Number.NaN;
  if (
    !Number.isFinite(startMilliseconds) ||
    !Number.isFinite(endMilliseconds) ||
    startMilliseconds > endMilliseconds
  ) {
    return null;
  }

  return {
    key: JSON.stringify([
      scope.groupId,
      startMilliseconds,
      endMilliseconds,
    ]),
    groupId: scope.groupId,
    startMilliseconds,
    endMilliseconds,
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
  const request = validRequest(parameters);
  const requestKey = request?.key ?? null;
  const latestRequestRef = useRef<ValidRequest | null>(request);
  // The stable refetch callback reads this ref after render, so a held callback
  // always observes the latest primitive request key and date values.
  // eslint-disable-next-line react-hooks/refs
  latestRequestRef.current = request;

  const requestIdRef = useRef(0);
  const [state, setState] = useState<RequestState>(IDLE_STATE);

  const refetch = useCallback(async () => {
    const activeRequest = latestRequestRef.current;
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
        startDate: timestampFromDate(
          new Date(activeRequest.startMilliseconds)
        ),
        endDate: timestampFromDate(new Date(activeRequest.endMilliseconds)),
      });
      const mapped = mapGroupSummary(response);
      if (
        requestIdRef.current !== requestId ||
        latestRequestRef.current?.key !== activeRequest.key
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
        latestRequestRef.current?.key !== activeRequest.key
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

  useEffect(() => {
    if (requestKey === null) {
      requestIdRef.current += 1;
      setState((current) => (current === IDLE_STATE ? current : IDLE_STATE));
      return;
    }

    void refetch();
    return () => {
      requestIdRef.current += 1;
    };
  }, [refetch, requestKey]);

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
