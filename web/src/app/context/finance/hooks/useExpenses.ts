/**
 * useExpenses Hook
 * 
 * Manages expense CRUD operations.
 */

import { useState, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { Timestamp } from '@bufbuild/protobuf';
import { Expense, ExpenseCategory, ExpenseFrequency } from '@/app/types';
import { 
  categoryToProto, 
  expenseFrequencyToProto, 
  mapProtoExpenseToLocal 
} from '../mappers';

interface UseExpensesOptions {
  user: User | null;
  isDevMode: boolean;
  effectiveUserId: string;
  useApi: boolean;
  getStorageKey: (key: string) => string;
  onError?: (error: string) => void;
}

interface UseExpensesReturn {
  expenses: Expense[];
  setExpenses: React.Dispatch<React.SetStateAction<Expense[]>>;
  addExpense: (
    description: string, 
    amount: number, 
    category: ExpenseCategory, 
    frequency?: ExpenseFrequency
  ) => Promise<void>;
  addExpenses: (
    expenses: Array<{
      description: string; 
      amount: number; 
      category: ExpenseCategory; 
      frequency?: ExpenseFrequency;
    }>
  ) => Promise<void>;
  updateExpense: (
    id: string, 
    description: string, 
    amount: number, 
    category: ExpenseCategory, 
    frequency: ExpenseFrequency
  ) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deleteExpenses: (ids: string[]) => Promise<void>;
  loadExpenses: () => Promise<Expense[]>;
}

export function useExpenses({
  // user,
  // isDevMode,
  effectiveUserId,
  useApi,
  getStorageKey,
  onError,
}: UseExpensesOptions): UseExpensesReturn {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  // const isLoadingRef = useRef(false);

  // Load expenses from API
  const loadExpenses = useCallback(async (): Promise<Expense[]> => {
    if (!useApi || !effectiveUserId) {
      return [];
    }

    try {
      const response = await financeClient.listExpenses({
        userId: effectiveUserId,
        pageSize: 1000,
      });
      const loadedExpenses = response.expenses.map(mapProtoExpenseToLocal);
      setExpenses(loadedExpenses);
      return loadedExpenses;
    } catch (err) {
      console.error('Failed to load expenses:', err);
      if (err instanceof Error && !err.message.includes('unauthenticated')) {
        onError?.(err.message);
      }
      return [];
    }
  }, [useApi, effectiveUserId, onError]);

  // Persist to localStorage when not using API
  useEffect(() => {
    if (!useApi) {
      localStorage.setItem(getStorageKey('expenses'), JSON.stringify(expenses));
    }
  }, [expenses, useApi, getStorageKey]);

  const addExpense = useCallback(async (
    description: string, 
    amount: number, 
    category: ExpenseCategory, 
    frequency: ExpenseFrequency = 'monthly'
  ): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.createExpense({
          userId: effectiveUserId,
          description,
          amount,
          category: categoryToProto[category],
          frequency: expenseFrequencyToProto[frequency],
          date: Timestamp.now(),
        });
        if (response.expense) {
          setExpenses(prev => [...prev, mapProtoExpenseToLocal(response.expense!)]);
        }
      } catch (err) {
        console.error('Failed to create expense:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to create expense');
      }
    } else {
      // Local mode
      const newExpense: Expense = {
        id: crypto.randomUUID(),
        description,
        amount,
        category,
        frequency,
        date: new Date(),
      };
      setExpenses(prev => [...prev, newExpense]);
    }
  }, [useApi, effectiveUserId, onError]);

  const addExpenses = useCallback(async (
    newExpenses: Array<{description: string, amount: number, category: ExpenseCategory, frequency?: ExpenseFrequency}>
  ): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.batchCreateExpenses({
          userId: effectiveUserId,
          expenses: newExpenses.map(exp => ({
            userId: effectiveUserId,
            description: exp.description,
            amount: exp.amount,
            category: categoryToProto[exp.category],
            frequency: expenseFrequencyToProto[exp.frequency || 'monthly'],
            date: Timestamp.now(),
          })),
        });
        if (response.expenses) {
          setExpenses(prev => [...prev, ...response.expenses.map(mapProtoExpenseToLocal)]);
        }
      } catch (err) {
        console.error('Failed to batch create expenses:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to create expenses');
      }
    } else {
      // Local mode
      setExpenses(prev => [
        ...prev,
        ...newExpenses.map(exp => ({
          id: crypto.randomUUID(),
          description: exp.description,
          amount: exp.amount,
          category: exp.category,
          frequency: exp.frequency || 'monthly' as ExpenseFrequency,
          date: new Date()
        }))
      ]);
    }
  }, [useApi, effectiveUserId, onError]);

  const updateExpense = useCallback(async (
    id: string, 
    description: string, 
    amount: number, 
    category: ExpenseCategory, 
    frequency: ExpenseFrequency
  ): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.updateExpense({
          expenseId: id,
          description,
          amount,
          category: categoryToProto[category],
          frequency: expenseFrequencyToProto[frequency],
        });
        if (response.expense) {
          setExpenses(prev => prev.map(expense => 
            expense.id === id ? mapProtoExpenseToLocal(response.expense!) : expense
          ));
        }
      } catch (err) {
        console.error('Failed to update expense:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to update expense');
      }
    } else {
      // Local mode
      setExpenses(prev => prev.map(expense => 
        expense.id === id 
          ? { ...expense, description, amount, category, frequency }
          : expense
      ));
    }
  }, [useApi, effectiveUserId, onError]);

  const deleteExpense = useCallback(async (id: string): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        await financeClient.deleteExpense({ expenseId: id });
        setExpenses(prev => prev.filter(expense => expense.id !== id));
      } catch (err) {
        console.error('Failed to delete expense:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to delete expense');
      }
    } else {
      setExpenses(prev => prev.filter(expense => expense.id !== id));
    }
  }, [useApi, effectiveUserId, onError]);

  const deleteExpenses = useCallback(async (ids: string[]): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        await Promise.all(ids.map(id => financeClient.deleteExpense({ expenseId: id })));
        setExpenses(prev => prev.filter(expense => !ids.includes(expense.id)));
      } catch (err) {
        console.error('Failed to delete expenses:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to delete expenses');
      }
    } else {
      setExpenses(prev => prev.filter(expense => !ids.includes(expense.id)));
    }
  }, [useApi, effectiveUserId, onError]);

  return {
    expenses,
    setExpenses,
    addExpense,
    addExpenses,
    updateExpense,
    deleteExpense,
    deleteExpenses,
    loadExpenses,
  };
}
