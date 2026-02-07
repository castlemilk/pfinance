'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  RecurringTransactionStatus as ProtoRTStatus,
  RecurringTransaction as ProtoRecurringTransaction,
  ExpenseCategory as ProtoExpenseCategory,
  ExpenseFrequency as ProtoExpenseFrequency,
} from '@/gen/pfinance/v1/types_pb';
import type { RecurringTransaction, RecurringTransactionStatus, ExpenseCategory, ExpenseFrequency } from '../types';

// ============================================================================
// Type Mapping Utilities
// ============================================================================

const protoToStatus: Record<number, RecurringTransactionStatus> = {
  [ProtoRTStatus.UNSPECIFIED]: 'active',
  [ProtoRTStatus.ACTIVE]: 'active',
  [ProtoRTStatus.PAUSED]: 'paused',
  [ProtoRTStatus.ENDED]: 'ended',
};

const statusToProto: Record<RecurringTransactionStatus, ProtoRTStatus> = {
  'active': ProtoRTStatus.ACTIVE,
  'paused': ProtoRTStatus.PAUSED,
  'ended': ProtoRTStatus.ENDED,
};

const categoryMap: Record<number, ExpenseCategory> = {
  [ProtoExpenseCategory.UNSPECIFIED]: 'Other',
  [ProtoExpenseCategory.FOOD]: 'Food',
  [ProtoExpenseCategory.HOUSING]: 'Housing',
  [ProtoExpenseCategory.TRANSPORTATION]: 'Transportation',
  [ProtoExpenseCategory.ENTERTAINMENT]: 'Entertainment',
  [ProtoExpenseCategory.HEALTHCARE]: 'Healthcare',
  [ProtoExpenseCategory.UTILITIES]: 'Utilities',
  [ProtoExpenseCategory.SHOPPING]: 'Shopping',
  [ProtoExpenseCategory.EDUCATION]: 'Education',
  [ProtoExpenseCategory.TRAVEL]: 'Travel',
  [ProtoExpenseCategory.OTHER]: 'Other',
};

const categoryToProto: Record<ExpenseCategory, ProtoExpenseCategory> = {
  'Food': ProtoExpenseCategory.FOOD,
  'Housing': ProtoExpenseCategory.HOUSING,
  'Transportation': ProtoExpenseCategory.TRANSPORTATION,
  'Entertainment': ProtoExpenseCategory.ENTERTAINMENT,
  'Healthcare': ProtoExpenseCategory.HEALTHCARE,
  'Utilities': ProtoExpenseCategory.UTILITIES,
  'Shopping': ProtoExpenseCategory.SHOPPING,
  'Education': ProtoExpenseCategory.EDUCATION,
  'Travel': ProtoExpenseCategory.TRAVEL,
  'Other': ProtoExpenseCategory.OTHER,
};

const frequencyMap: Record<number, ExpenseFrequency> = {
  [ProtoExpenseFrequency.UNSPECIFIED]: 'once',
  [ProtoExpenseFrequency.ONCE]: 'once',
  [ProtoExpenseFrequency.DAILY]: 'daily',
  [ProtoExpenseFrequency.WEEKLY]: 'weekly',
  [ProtoExpenseFrequency.FORTNIGHTLY]: 'fortnightly',
  [ProtoExpenseFrequency.MONTHLY]: 'monthly',
  [ProtoExpenseFrequency.QUARTERLY]: 'quarterly',
  [ProtoExpenseFrequency.ANNUALLY]: 'annually',
};

const frequencyToProto: Record<ExpenseFrequency, ProtoExpenseFrequency> = {
  'once': ProtoExpenseFrequency.ONCE,
  'daily': ProtoExpenseFrequency.DAILY,
  'weekly': ProtoExpenseFrequency.WEEKLY,
  'fortnightly': ProtoExpenseFrequency.FORTNIGHTLY,
  'monthly': ProtoExpenseFrequency.MONTHLY,
  'quarterly': ProtoExpenseFrequency.QUARTERLY,
  'annually': ProtoExpenseFrequency.ANNUALLY,
};

function centsToAmount(cents: bigint, fallbackAmount: number): number {
  if (cents !== BigInt(0)) {
    return Number(cents) / 100;
  }
  return fallbackAmount;
}

function dollarsToCents(dollars: number): bigint {
  return BigInt(Math.round(dollars * 100));
}

function mapProtoToLocal(proto: ProtoRecurringTransaction): RecurringTransaction {
  return {
    id: proto.id,
    userId: proto.userId,
    groupId: proto.groupId || undefined,
    description: proto.description,
    amount: centsToAmount(proto.amountCents, proto.amount),
    category: categoryMap[proto.category] || 'Other',
    frequency: frequencyMap[proto.frequency] || 'monthly',
    startDate: proto.startDate ? timestampDate(proto.startDate) : new Date(),
    nextOccurrence: proto.nextOccurrence ? timestampDate(proto.nextOccurrence) : new Date(),
    endDate: proto.endDate ? timestampDate(proto.endDate) : undefined,
    status: protoToStatus[proto.status] || 'active',
    isExpense: proto.isExpense,
    createdAt: proto.createdAt ? timestampDate(proto.createdAt) : new Date(),
    updatedAt: proto.updatedAt ? timestampDate(proto.updatedAt) : new Date(),
    tags: proto.tags || [],
    paidByUserId: proto.paidByUserId || undefined,
  };
}

// ============================================================================
// Create / Update Params
// ============================================================================

export interface CreateRecurringTransactionParams {
  description: string;
  amount: number;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
  startDate: Date;
  endDate?: Date;
  isExpense: boolean;
  tags?: string[];
  groupId?: string;
}

export interface UpdateRecurringTransactionParams {
  description?: string;
  amount?: number;
  category?: ExpenseCategory;
  frequency?: ExpenseFrequency;
  endDate?: Date;
  isExpense?: boolean;
  tags?: string[];
}

// ============================================================================
// Context Definition
// ============================================================================

interface RecurringContextType {
  recurringTransactions: RecurringTransaction[];
  upcomingBills: RecurringTransaction[];
  loading: boolean;
  error: string | null;
  createRecurring: (params: CreateRecurringTransactionParams) => Promise<RecurringTransaction | null>;
  updateRecurring: (id: string, params: UpdateRecurringTransactionParams) => Promise<RecurringTransaction | null>;
  deleteRecurring: (id: string) => Promise<boolean>;
  pauseRecurring: (id: string) => Promise<boolean>;
  resumeRecurring: (id: string) => Promise<boolean>;
  refreshRecurring: () => Promise<void>;
}

const RecurringContext = createContext<RecurringContextType | undefined>(undefined);

// ============================================================================
// Demo Mode Helpers
// ============================================================================

const DEMO_RECURRING_KEY = 'pfinance-demo-recurring';

function loadDemoRecurring(): RecurringTransaction[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DEMO_RECURRING_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((r: Record<string, unknown>) => ({
        ...r,
        startDate: new Date(r.startDate as string),
        nextOccurrence: new Date(r.nextOccurrence as string),
        endDate: r.endDate ? new Date(r.endDate as string) : undefined,
        createdAt: new Date(r.createdAt as string),
        updatedAt: new Date(r.updatedAt as string),
      }));
    }
  } catch (e) {
    console.error('Failed to load demo recurring:', e);
  }
  return [];
}

function saveDemoRecurring(items: RecurringTransaction[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_RECURRING_KEY, JSON.stringify(items));
  } catch (e) {
    console.error('Failed to save demo recurring:', e);
  }
}

function generateId(): string {
  return `rt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Provider Component
// ============================================================================

export function RecurringProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [recurringTransactions, setRecurringTransactions] = useState<RecurringTransaction[]>([]);
  const [upcomingBills, setUpcomingBills] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const isAuthenticated = !!user;
  const userId = user?.uid || 'demo-user';

  const loadRecurring = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isAuthenticated) {
        const [listResponse, billsResponse] = await Promise.all([
          financeClient.listRecurringTransactions({
            userId,
            status: ProtoRTStatus.UNSPECIFIED,
            pageSize: 100,
          }),
          financeClient.getUpcomingBills({
            userId,
            daysAhead: 30,
            limit: 10,
          }),
        ]);

        setRecurringTransactions(listResponse.recurringTransactions.map(mapProtoToLocal));
        setUpcomingBills(billsResponse.upcomingBills.map(mapProtoToLocal));
      } else {
        const items = loadDemoRecurring();
        setRecurringTransactions(items);
        // Compute upcoming from demo data
        const now = new Date();
        const cutoff = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const upcoming = items
          .filter(r => r.status === 'active' && r.nextOccurrence <= cutoff)
          .sort((a, b) => a.nextOccurrence.getTime() - b.nextOccurrence.getTime())
          .slice(0, 10);
        setUpcomingBills(upcoming);
      }
    } catch (e) {
      console.error('Failed to load recurring transactions:', e);
      setError('Failed to load recurring transactions');
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [isAuthenticated, userId]);

  useEffect(() => {
    loadRecurring();
  }, [loadRecurring]);

  const createRecurring = useCallback(async (params: CreateRecurringTransactionParams): Promise<RecurringTransaction | null> => {
    setError(null);
    try {
      if (isAuthenticated) {
        const response = await financeClient.createRecurringTransaction({
          userId,
          groupId: params.groupId,
          description: params.description,
          amount: params.amount,
          amountCents: dollarsToCents(params.amount),
          category: categoryToProto[params.category],
          frequency: frequencyToProto[params.frequency],
          startDate: timestampFromDate(params.startDate),
          endDate: params.endDate ? timestampFromDate(params.endDate) : undefined,
          isExpense: params.isExpense,
          tags: params.tags || [],
        });

        if (response.recurringTransaction) {
          const newItem = mapProtoToLocal(response.recurringTransaction);
          setRecurringTransactions(prev => [...prev, newItem]);
          return newItem;
        }
      } else {
        const newItem: RecurringTransaction = {
          id: generateId(),
          userId,
          groupId: params.groupId,
          description: params.description,
          amount: params.amount,
          category: params.category,
          frequency: params.frequency,
          startDate: params.startDate,
          nextOccurrence: params.startDate > new Date() ? params.startDate : new Date(),
          endDate: params.endDate,
          status: 'active',
          isExpense: params.isExpense,
          createdAt: new Date(),
          updatedAt: new Date(),
          tags: params.tags || [],
        };

        setRecurringTransactions(prev => {
          const updated = [...prev, newItem];
          saveDemoRecurring(updated);
          return updated;
        });
        return newItem;
      }
    } catch (e) {
      console.error('Failed to create recurring transaction:', e);
      setError('Failed to create recurring transaction');
    }
    return null;
  }, [isAuthenticated, userId]);

  const updateRecurring = useCallback(async (id: string, params: UpdateRecurringTransactionParams): Promise<RecurringTransaction | null> => {
    setError(null);
    try {
      if (isAuthenticated) {
        const response = await financeClient.updateRecurringTransaction({
          recurringTransactionId: id,
          description: params.description || '',
          amount: params.amount || 0,
          amountCents: params.amount ? dollarsToCents(params.amount) : BigInt(0),
          category: params.category ? categoryToProto[params.category] : ProtoExpenseCategory.UNSPECIFIED,
          frequency: params.frequency ? frequencyToProto[params.frequency] : ProtoExpenseFrequency.UNSPECIFIED,
          endDate: params.endDate ? timestampFromDate(params.endDate) : undefined,
          isExpense: params.isExpense ?? true,
          tags: params.tags || [],
        });

        if (response.recurringTransaction) {
          const updated = mapProtoToLocal(response.recurringTransaction);
          setRecurringTransactions(prev => prev.map(r => r.id === id ? updated : r));
          return updated;
        }
      } else {
        setRecurringTransactions(prev => {
          const updated = prev.map(r => {
            if (r.id !== id) return r;
            return {
              ...r,
              ...(params.description !== undefined && { description: params.description }),
              ...(params.amount !== undefined && { amount: params.amount }),
              ...(params.category !== undefined && { category: params.category }),
              ...(params.frequency !== undefined && { frequency: params.frequency }),
              ...(params.endDate !== undefined && { endDate: params.endDate }),
              ...(params.isExpense !== undefined && { isExpense: params.isExpense }),
              ...(params.tags !== undefined && { tags: params.tags }),
              updatedAt: new Date(),
            };
          });
          saveDemoRecurring(updated);
          return updated;
        });
        return recurringTransactions.find(r => r.id === id) || null;
      }
    } catch (e) {
      console.error('Failed to update recurring transaction:', e);
      setError('Failed to update recurring transaction');
    }
    return null;
  }, [isAuthenticated, recurringTransactions]);

  const deleteRecurring = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      if (isAuthenticated) {
        await financeClient.deleteRecurringTransaction({ recurringTransactionId: id });
      }
      setRecurringTransactions(prev => {
        const updated = prev.filter(r => r.id !== id);
        if (!isAuthenticated) saveDemoRecurring(updated);
        return updated;
      });
      return true;
    } catch (e) {
      console.error('Failed to delete recurring transaction:', e);
      setError('Failed to delete recurring transaction');
      return false;
    }
  }, [isAuthenticated]);

  const pauseRecurring = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      if (isAuthenticated) {
        const response = await financeClient.pauseRecurringTransaction({ recurringTransactionId: id });
        if (response.recurringTransaction) {
          const updated = mapProtoToLocal(response.recurringTransaction);
          setRecurringTransactions(prev => prev.map(r => r.id === id ? updated : r));
          return true;
        }
      } else {
        setRecurringTransactions(prev => {
          const updated = prev.map(r => r.id === id ? { ...r, status: 'paused' as RecurringTransactionStatus, updatedAt: new Date() } : r);
          saveDemoRecurring(updated);
          return updated;
        });
        return true;
      }
    } catch (e) {
      console.error('Failed to pause recurring transaction:', e);
      setError('Failed to pause recurring transaction');
    }
    return false;
  }, [isAuthenticated]);

  const resumeRecurring = useCallback(async (id: string): Promise<boolean> => {
    setError(null);
    try {
      if (isAuthenticated) {
        const response = await financeClient.resumeRecurringTransaction({ recurringTransactionId: id });
        if (response.recurringTransaction) {
          const updated = mapProtoToLocal(response.recurringTransaction);
          setRecurringTransactions(prev => prev.map(r => r.id === id ? updated : r));
          return true;
        }
      } else {
        setRecurringTransactions(prev => {
          const updated = prev.map(r => r.id === id ? { ...r, status: 'active' as RecurringTransactionStatus, updatedAt: new Date() } : r);
          saveDemoRecurring(updated);
          return updated;
        });
        return true;
      }
    } catch (e) {
      console.error('Failed to resume recurring transaction:', e);
      setError('Failed to resume recurring transaction');
    }
    return false;
  }, [isAuthenticated]);

  const value: RecurringContextType = {
    recurringTransactions,
    upcomingBills,
    loading,
    error,
    createRecurring,
    updateRecurring,
    deleteRecurring,
    pauseRecurring,
    resumeRecurring,
    refreshRecurring: loadRecurring,
  };

  return (
    <RecurringContext.Provider value={value}>
      {children}
    </RecurringContext.Provider>
  );
}

export function useRecurring() {
  const context = useContext(RecurringContext);
  if (context === undefined) {
    throw new Error('useRecurring must be used within a RecurringProvider');
  }
  return context;
}
