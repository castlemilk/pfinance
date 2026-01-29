/**
 * useGroupExpenses Hook
 * 
 * Manages group expense operations and state.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { 
  Expense,
  ExpenseAllocation,
  ExpenseCategory,
  ExpenseFrequency,
  SplitType,
} from '@/gen/pfinance/v1/types_pb';
import { timestampFromDate, timestampDate } from '@bufbuild/protobuf/wkt';
import { FinanceGroup } from '../types';

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

  // Set up polling for real-time updates on shared pages
  useEffect(() => {
    if (!activeGroup || typeof window === 'undefined') return;

    const isSharedPage = window.location.pathname.startsWith('/shared');
    if (!isSharedPage) return;

    const intervalId = setInterval(() => {
      refreshGroupExpenses();
    }, 5000);

    return () => clearInterval(intervalId);
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
