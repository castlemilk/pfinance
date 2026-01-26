/**
 * useGroupAnalytics Hook
 * 
 * Calculates group expense summaries and balances.
 */

import { useMemo } from 'react';
import { Expense, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

interface UseGroupAnalyticsOptions {
  groupExpenses: Expense[];
}

interface UseGroupAnalyticsReturn {
  getGroupExpenseSummary: (groupId: string) => { [key in ExpenseCategory]?: number };
  getUserOwedAmount: (groupId: string, userId: string) => number;
  getUserOwesAmount: (groupId: string, userId: string) => number;
}

export function useGroupAnalytics({ groupExpenses }: UseGroupAnalyticsOptions): UseGroupAnalyticsReturn {
  const getGroupExpenseSummary = useMemo(() => {
    return (groupId: string) => {
      const groupExpensesForGroup = groupExpenses.filter(e => e.groupId === groupId);
      return groupExpensesForGroup.reduce((acc, expense) => {
        acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
        return acc;
      }, {} as { [key in ExpenseCategory]?: number });
    };
  }, [groupExpenses]);

  const getUserOwedAmount = useMemo(() => {
    return (groupId: string, userId: string): number => {
      return groupExpenses
        .filter(e => e.groupId === groupId && e.paidByUserId === userId)
        .reduce((total, expense) => {
          const unpaidAllocations = expense.allocations.filter(
            a => a.userId !== userId && !a.isPaid
          );
          return total + unpaidAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
        }, 0);
    };
  }, [groupExpenses]);

  const getUserOwesAmount = useMemo(() => {
    return (groupId: string, userId: string): number => {
      return groupExpenses
        .filter(e => e.groupId === groupId && e.paidByUserId !== userId)
        .reduce((total, expense) => {
          const userAllocation = expense.allocations.find(
            a => a.userId === userId && !a.isPaid
          );
          return total + (userAllocation?.amount || 0);
        }, 0);
    };
  }, [groupExpenses]);

  return {
    getGroupExpenseSummary,
    getUserOwedAmount,
    getUserOwesAmount,
  };
}
