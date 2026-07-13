/**
 * useGroupExpenses Hook
 * 
 * Manages group expense operations and state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { financeClient } from '@/lib/financeService';
import { db } from '@/lib/firebase';
import { 
  Expense,
  ExpenseAllocation,
  ExpenseCategory,
  ExpenseFrequency,
  SplitType,
} from '@/gen/pfinance/v1/types_pb';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { FinanceGroup } from '../types';

function dollarsToCents(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100));
}

interface UseGroupExpensesOptions {
  user: User | null;
  activeGroup: FinanceGroup | null;
}

interface UseGroupExpensesReturn {
  groupExpenses: Expense[];
  loading: boolean;
  error: string | null;
  addGroupExpense: (
    groupId: string, 
    description: string,
    amount: number,
    category: ExpenseCategory,
    frequency: ExpenseFrequency,
    paidByUserId: string,
    splitType: SplitType,
    allocations: ExpenseAllocation[]
  ) => Promise<string>;
  updateGroupExpense: (expenseId: string, updates: {
    description?: string;
    amount?: number;
    category?: ExpenseCategory;
    frequency?: ExpenseFrequency;
  }) => Promise<void>;
  deleteGroupExpense: (expenseId: string) => Promise<void>;
  settleExpense: (expenseId: string, userId: string) => Promise<void>;
  refreshGroupExpenses: () => Promise<void>;
}

interface ExpenseCollectionState {
  sessionKey: string | null;
  expenses: Expense[];
  loading: boolean;
  error: string | null;
}

function groupSessionKey(userId: string | null, groupId: string | null): string | null {
  return userId && groupId ? JSON.stringify([userId, groupId]) : null;
}

export function useGroupExpenses({ user, activeGroup }: UseGroupExpensesOptions): UseGroupExpensesReturn {
  const userId = user?.uid ?? null;
  const groupId = activeGroup?.id ?? null;
  const sessionKey = groupSessionKey(userId, groupId);
  const [collectionState, setCollectionState] = useState<ExpenseCollectionState>({
    sessionKey: null,
    expenses: [],
    loading: false,
    error: null,
  });

  const committedSessionKeyRef = useRef<string | null>(null);
  const requestSequenceRef = useRef(0);
  const latestRequestRef = useRef<{ sessionKey: string; sequence: number } | null>(null);

  const commitMutationIfCurrent = useCallback((
    requestSessionKey: string | null,
    update: (expenses: Expense[]) => Expense[]
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
        expenses: update(previous.expenses),
        loading: false,
        error: null,
      };
    });
    return true;
  }, []);

  const refreshGroupExpenses = useCallback(async () => {
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
      : { sessionKey: requestSessionKey, expenses: [], loading: true, error: null });

    try {
      const response = await financeClient.listExpenses({
        userId,
        groupId,
        pageSize: 1000,
      });
      if (!isCurrentRequest()) return;
      setCollectionState({
        sessionKey: requestSessionKey,
        expenses: response.expenses,
        loading: true,
        error: null,
      });
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error('Failed to load group expenses:', err);
      if (err instanceof Error && !err.message.includes('Failed to fetch')) {
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

  // Bind all visible expense state to the committed user/group session.
  useEffect(() => {
    const effectSessionKey = sessionKey;
    committedSessionKeyRef.current = effectSessionKey;
    latestRequestRef.current = null;

    if (!effectSessionKey) {
      setCollectionState({ sessionKey: null, expenses: [], loading: false, error: null });
      return;
    }

    setCollectionState({
      sessionKey: effectSessionKey,
      expenses: [],
      loading: true,
      error: null,
    });
    void refreshGroupExpenses();

    return () => {
      if (committedSessionKeyRef.current === effectSessionKey) {
        committedSessionKeyRef.current = null;
        latestRequestRef.current = null;
      }
    };
  }, [refreshGroupExpenses, sessionKey]);

  // Real-time updates via Firestore listener — replaces a 5s polling loop
  // that hammered listExpenses every 5 seconds while on /shared pages.
  // Backend writes to the `groupExpenses` collection (see backend
  // internal/store/firestore.go ListExpenses); we listen on
  // `where(GroupId == activeGroup.id)` and call the existing RPC refresh
  // ONLY when Firestore reports an actual change. Under steady state
  // (no changes) this is zero round-trips — was 720 RPCs/hour before.
  useEffect(() => {
    const listenerSessionKey = sessionKey;
    if (!groupId || !listenerSessionKey || typeof window === 'undefined' || !db) return;

    const isSharedPage = window.location.pathname.startsWith('/shared');
    if (!isSharedPage) return;

    const q = query(
      collection(db, 'groupExpenses'),
      where('GroupId', '==', groupId),
    );

    // Skip the very first snapshot — it's just the current state, which the
    // dedicated load-on-group-change effect above has already fetched.
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(
      q,
      () => {
        if (firstSnapshot) {
          firstSnapshot = false;
          return;
        }
        if (committedSessionKeyRef.current === listenerSessionKey) {
          void refreshGroupExpenses();
        }
      },
      (err) => console.error('groupExpenses listener error:', err),
    );

    return () => {
      unsubscribe();
    };
  }, [groupId, refreshGroupExpenses, sessionKey]);

  const addGroupExpense = useCallback(async (
    groupId: string,
    description: string,
    amount: number,
    category: ExpenseCategory,
    frequency: ExpenseFrequency,
    paidByUserId: string,
    splitType: SplitType,
    allocations: ExpenseAllocation[]
  ): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;
    const targetSessionKey = groupSessionKey(user.uid, groupId);

    const response = await financeClient.createExpense({
      userId: user.uid,
      groupId,
      description,
      amount,
      amountCents: dollarsToCents(amount),
      category,
      frequency,
      paidByUserId,
      splitType,
      allocations,
      date: timestampFromDate(new Date()),
    });

    if (response.expense) {
      if (requestSessionKey === targetSessionKey) {
        const didCommit = commitMutationIfCurrent(requestSessionKey, expenses => [
          ...expenses,
          response.expense!,
        ]);
        if (didCommit) await refreshGroupExpenses();
      }
      return response.expense.id;
    }
    throw new Error('Failed to create expense');
  }, [commitMutationIfCurrent, refreshGroupExpenses, user]);

  const updateGroupExpense = useCallback(async (expenseId: string, updates: {
    description?: string;
    amount?: number;
    category?: ExpenseCategory;
    frequency?: ExpenseFrequency;
  }): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;

    const response = await financeClient.updateExpense({
      expenseId,
      ...updates,
      amountCents: updates.amount !== undefined ? dollarsToCents(updates.amount) : undefined,
    });

    if (response.expense) {
      const didCommit = commitMutationIfCurrent(requestSessionKey, expenses => expenses.map(e =>
        e.id === expenseId ? response.expense! : e
      ));
      if (didCommit) await refreshGroupExpenses();
    }
  }, [commitMutationIfCurrent, refreshGroupExpenses, user]);

  const deleteGroupExpense = useCallback(async (expenseId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;

    await financeClient.deleteExpense({ expenseId });
    const didCommit = commitMutationIfCurrent(
      requestSessionKey,
      expenses => expenses.filter(e => e.id !== expenseId)
    );
    if (didCommit) await refreshGroupExpenses();
  }, [commitMutationIfCurrent, refreshGroupExpenses, user]);

  const settleExpense = useCallback(async (expenseId: string, userId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');
    const requestSessionKey = committedSessionKeyRef.current;

    const response = await financeClient.settleExpense({
      expenseId,
      userId,
      amount: 0, // Full settlement
      amountCents: BigInt(0),
    });

    if (response.expense) {
      const didCommit = commitMutationIfCurrent(requestSessionKey, expenses => expenses.map(e =>
        e.id === expenseId ? response.expense! : e
      ));
      if (didCommit) await refreshGroupExpenses();
    }
  }, [commitMutationIfCurrent, refreshGroupExpenses, user]);

  const stateMatchesSession = collectionState.sessionKey === sessionKey;
  const groupExpenses = stateMatchesSession ? collectionState.expenses : [];
  const loading = sessionKey
    ? !stateMatchesSession || collectionState.loading
    : false;
  const error = stateMatchesSession ? collectionState.error : null;

  return {
    groupExpenses,
    loading,
    error,
    addGroupExpense,
    updateGroupExpense,
    deleteGroupExpense,
    settleExpense,
    refreshGroupExpenses,
  };
}
