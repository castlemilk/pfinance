/**
 * useGroupIncomes Hook
 * 
 * Manages group income operations and state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { 
  TaxStatus as ProtoTaxStatus,
} from '@/gen/pfinance/v1/types_pb';
import { timestampFromDate, timestampDate } from '@bufbuild/protobuf/wkt';
import { FinanceGroup, GroupIncome } from '../types';
import { incomeFrequencyToProto, protoToIncomeFrequency } from '../mappers';

function centsToAmount(cents: bigint, fallbackAmount: number): number {
  if (cents !== BigInt(0)) return Number(cents) / 100;
  return fallbackAmount;
}

function dollarsToCents(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100));
}

interface UseGroupIncomesOptions {
  user: User | null;
  activeGroup: FinanceGroup | null;
}

interface UseGroupIncomesReturn {
  groupIncomes: GroupIncome[];
  loading: boolean;
  error: string | null;
  addGroupIncome: (groupId: string, income: Omit<GroupIncome, 'id' | 'date' | 'groupId' | 'userId'>) => Promise<string>;
  updateGroupIncome: (incomeId: string, income: Partial<GroupIncome>) => Promise<void>;
  deleteGroupIncome: (incomeId: string) => Promise<void>;
  refreshGroupIncomes: () => Promise<void>;
}

interface IncomeCollectionState {
  sessionKey: string | null;
  incomes: GroupIncome[];
  loading: boolean;
  error: string | null;
}

function groupSessionKey(userId: string | null, groupId: string | null): string | null {
  return userId && groupId ? JSON.stringify([userId, groupId]) : null;
}

export function useGroupIncomes({ user, activeGroup }: UseGroupIncomesOptions): UseGroupIncomesReturn {
  const userId = user?.uid ?? null;
  const groupId = activeGroup?.id ?? null;
  const sessionKey = groupSessionKey(userId, groupId);
  const [collectionState, setCollectionState] = useState<IncomeCollectionState>({
    sessionKey: null,
    incomes: [],
    loading: false,
    error: null,
  });

  const committedSessionKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const latestRequestRef = useRef<{ sessionKey: string; sequence: number } | null>(null);

  const commitMutationIfCurrent = useCallback((
    requestSessionKey: string | null,
    update: (incomes: GroupIncome[]) => GroupIncome[]
  ) => {
    if (!requestSessionKey || committedSessionKeyRef.current !== requestSessionKey) return false;

    requestSequenceRef.current += 1;
    latestRequestRef.current = null;
    setCollectionState(previous => {
      if (
        committedSessionKeyRef.current !== requestSessionKey
        || previous.sessionKey !== requestSessionKey
      ) {
        return previous;
      }
      return {
        ...previous,
        incomes: update(previous.incomes),
        loading: false,
        error: null,
      };
    });
    return true;
  }, []);

  const refreshGroupIncomes = useCallback(async () => {
    const requestSessionKey = sessionKey;
    if (
      !userId
      || !groupId
      || !requestSessionKey
      || committedSessionKeyRef.current !== requestSessionKey
    ) return;

    const sequence = ++requestSequenceRef.current;
    latestRequestRef.current = { sessionKey: requestSessionKey, sequence };
    const isCurrentRequest = () => (
      committedSessionKeyRef.current === requestSessionKey
      && latestRequestRef.current?.sessionKey === requestSessionKey
      && latestRequestRef.current.sequence === sequence
    );

    setCollectionState(previous => previous.sessionKey === requestSessionKey
      ? { ...previous, loading: true }
      : { sessionKey: requestSessionKey, incomes: [], loading: true, error: null });

    try {
      const response = await financeClient.listIncomes({
        userId,
        groupId,
        pageSize: 1000,
      });
      if (!isCurrentRequest()) return;
      const incomes = response.incomes.map(i => ({
        id: i.id,
        groupId: i.groupId,
        userId: i.userId,
        source: i.source,
        amount: centsToAmount(i.amountCents, i.amount),
        frequency: protoToIncomeFrequency[i.frequency],
        date: i.date ? timestampDate(i.date) : new Date(),
      }));
      setCollectionState({
        sessionKey: requestSessionKey,
        incomes,
        loading: true,
        error: null,
      });
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('Failed to load group incomes:', err);
      if (err instanceof Error) {
        setCollectionState(previous => previous.sessionKey === requestSessionKey
          ? { ...previous, error: err.message }
          : previous);
      }
    } finally {
      if (isCurrentRequest()) {
        setCollectionState(previous => previous.sessionKey === requestSessionKey
          ? { ...previous, loading: false }
          : previous);
      }
    }
  }, [groupId, sessionKey, userId]);

  // Bind all visible income state to the committed user/group session.
  useEffect(() => {
    const effectSessionKey = sessionKey;
    committedSessionKeyRef.current = effectSessionKey;
    latestRequestRef.current = null;

    if (!effectSessionKey) {
      setCollectionState({ sessionKey: null, incomes: [], loading: false, error: null });
      return;
    }

    setCollectionState({
      sessionKey: effectSessionKey,
      incomes: [],
      loading: true,
      error: null,
    });
    void refreshGroupIncomes();

    return () => {
      if (committedSessionKeyRef.current === effectSessionKey) {
        committedSessionKeyRef.current = null;
        latestRequestRef.current = null;
      }
    };
  }, [refreshGroupIncomes, sessionKey]);

  const addGroupIncome = useCallback(async (
    groupId: string, 
    income: Omit<GroupIncome, 'id' | 'date' | 'groupId' | 'userId'>
  ): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;
    const targetSessionKey = groupSessionKey(user.uid, groupId);

    const response = await financeClient.createIncome({
      userId: user.uid,
      groupId,
      source: income.source,
      amount: income.amount,
      amountCents: dollarsToCents(income.amount),
      frequency: incomeFrequencyToProto[income.frequency],
      taxStatus: ProtoTaxStatus.POST_TAX,
      date: timestampFromDate(new Date()),
    });

    if (response.income) {
      if (requestSessionKey === targetSessionKey) {
        const didCommit = commitMutationIfCurrent(requestSessionKey, incomes => [...incomes, {
          id: response.income!.id,
          groupId: response.income!.groupId,
          userId: response.income!.userId,
          source: response.income!.source,
          amount: centsToAmount(response.income!.amountCents, response.income!.amount),
          frequency: income.frequency,
          date: response.income!.date ? timestampDate(response.income!.date) : new Date(),
        }]);
        if (didCommit) await refreshGroupIncomes();
      }
      return response.income.id;
    }
    throw new Error('Failed to create income');
  }, [commitMutationIfCurrent, refreshGroupIncomes, user]);

  const updateGroupIncome = useCallback(async (incomeId: string, updates: Partial<GroupIncome>): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;

    await financeClient.updateIncome({
      incomeId,
      source: updates.source,
      amount: updates.amount,
      amountCents: updates.amount !== undefined ? dollarsToCents(updates.amount) : undefined,
      frequency: updates.frequency ? incomeFrequencyToProto[updates.frequency] : undefined,
    });

    const didCommit = commitMutationIfCurrent(requestSessionKey, incomes => incomes.map(i =>
      i.id === incomeId ? { ...i, ...updates } : i
    ));
    if (didCommit) await refreshGroupIncomes();
  }, [commitMutationIfCurrent, refreshGroupIncomes, user]);

  const deleteGroupIncome = useCallback(async (incomeId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;

    await financeClient.deleteIncome({ incomeId });
    const didCommit = commitMutationIfCurrent(
      requestSessionKey,
      incomes => incomes.filter(i => i.id !== incomeId)
    );
    if (didCommit) await refreshGroupIncomes();
  }, [commitMutationIfCurrent, refreshGroupIncomes, user]);

  const stateMatchesSession = collectionState.sessionKey === sessionKey;
  const groupIncomes = stateMatchesSession ? collectionState.incomes : [];
  const loading = sessionKey
    ? !stateMatchesSession || collectionState.loading
    : false;
  const error = stateMatchesSession ? collectionState.error : null;

  return {
    groupIncomes,
    loading,
    error,
    addGroupIncome,
    updateGroupIncome,
    deleteGroupIncome,
    refreshGroupIncomes,
  };
}
