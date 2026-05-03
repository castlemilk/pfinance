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
import { timestampFromDate, timestampDate } from '@bufbuild/protobuf/wkt';
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

export function useGroupExpenses({ user, activeGroup }: UseGroupExpensesOptions): UseGroupExpensesReturn {
  const [groupExpenses, setGroupExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isLoadingRef = useRef(false);
  const lastActiveGroupIdRef = useRef<string | null>(null);

  const refreshGroupExpenses = useCallback(async () => {
    if (!user || !activeGroup) {
      setGroupExpenses([]);
      return;
    }
    
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    try {
      const response = await financeClient.listExpenses({
        userId: user.uid,
        groupId: activeGroup.id,
        pageSize: 1000,
      });
      setGroupExpenses(response.expenses);
      setError(null);
    } catch (err) {
      console.error('Failed to load group expenses:', err);
      if (err instanceof Error && !err.message.includes('Failed to fetch')) {
        setError(err.message);
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [user, activeGroup]);

  // Load expenses when active group changes
  useEffect(() => {
    const groupId = activeGroup?.id ?? null;
    if (groupId === lastActiveGroupIdRef.current) {
      return;
    }
    lastActiveGroupIdRef.current = groupId;
    
    setLoading(true);
    refreshGroupExpenses().finally(() => setLoading(false));
  }, [activeGroup, refreshGroupExpenses]);

  // Real-time updates via Firestore listener — replaces a 5s polling loop
  // that hammered listExpenses every 5 seconds while on /shared pages.
  // Backend writes to the `groupExpenses` collection (see backend
  // internal/store/firestore.go ListExpenses); we listen on
  // `where(GroupId == activeGroup.id)` and call the existing RPC refresh
  // ONLY when Firestore reports an actual change. Under steady state
  // (no changes) this is zero round-trips — was 720 RPCs/hour before.
  useEffect(() => {
    if (!activeGroup || typeof window === 'undefined' || !db) return;

    const isSharedPage = window.location.pathname.startsWith('/shared');
    if (!isSharedPage) return;

    const q = query(
      collection(db, 'groupExpenses'),
      where('GroupId', '==', activeGroup.id),
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
        refreshGroupExpenses();
      },
      (err) => console.error('groupExpenses listener error:', err),
    );

    return () => {
      unsubscribe();
    };
  }, [activeGroup, refreshGroupExpenses]);

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
      setGroupExpenses(prev => [...prev, response.expense!]);
      return response.expense.id;
    }
    throw new Error('Failed to create expense');
  }, [user]);

  const updateGroupExpense = useCallback(async (expenseId: string, updates: {
    description?: string;
    amount?: number;
    category?: ExpenseCategory;
    frequency?: ExpenseFrequency;
  }): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.updateExpense({
      expenseId,
      ...updates,
      amountCents: updates.amount !== undefined ? dollarsToCents(updates.amount) : undefined,
    });

    if (response.expense) {
      setGroupExpenses(prev => prev.map(e => 
        e.id === expenseId ? response.expense! : e
      ));
    }
  }, [user]);

  const deleteGroupExpense = useCallback(async (expenseId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.deleteExpense({ expenseId });
    setGroupExpenses(prev => prev.filter(e => e.id !== expenseId));
  }, [user]);

  const settleExpense = useCallback(async (expenseId: string, userId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.settleExpense({
      expenseId,
      userId,
      amount: 0, // Full settlement
      amountCents: BigInt(0),
    });

    if (response.expense) {
      setGroupExpenses(prev => prev.map(e => 
        e.id === expenseId ? response.expense! : e
      ));
    }
  }, [user]);

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
