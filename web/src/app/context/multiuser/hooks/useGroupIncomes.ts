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

export function useGroupIncomes({ user, activeGroup }: UseGroupIncomesOptions): UseGroupIncomesReturn {
  const [groupIncomes, setGroupIncomes] = useState<GroupIncome[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const isLoadingRef = useRef(false);
  const lastActiveGroupIdRef = useRef<string | null>(null);

  const refreshGroupIncomes = useCallback(async () => {
    if (!user || !activeGroup) {
      setGroupIncomes([]);
      return;
    }
    
    if (isLoadingRef.current) {
      return;
    }
    isLoadingRef.current = true;

    try {
      const response = await financeClient.listIncomes({
        userId: user.uid,
        groupId: activeGroup.id,
        pageSize: 1000,
      });
      setGroupIncomes(response.incomes.map(i => ({
        id: i.id,
        groupId: i.groupId,
        userId: i.userId,
        source: i.source,
        amount: centsToAmount(i.amountCents, i.amount),
        frequency: protoToIncomeFrequency[i.frequency],
        date: i.date ? timestampDate(i.date) : new Date(),
      })));
      setError(null);
    } catch (err) {
      console.error('Failed to load group incomes:', err);
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      isLoadingRef.current = false;
    }
  }, [user, activeGroup]);

  // Load incomes when active group changes
  useEffect(() => {
    const groupId = activeGroup?.id ?? null;
    if (groupId === lastActiveGroupIdRef.current) {
      return;
    }
    lastActiveGroupIdRef.current = groupId;
    
    setLoading(true);
    refreshGroupIncomes().finally(() => setLoading(false));
  }, [activeGroup, refreshGroupIncomes]);

  const addGroupIncome = useCallback(async (
    groupId: string, 
    income: Omit<GroupIncome, 'id' | 'date' | 'groupId' | 'userId'>
  ): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

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
      setGroupIncomes(prev => [...prev, {
        id: response.income!.id,
        groupId: response.income!.groupId,
        userId: response.income!.userId,
        source: response.income!.source,
        amount: centsToAmount(response.income!.amountCents, response.income!.amount),
        frequency: income.frequency,
        date: response.income!.date ? timestampDate(response.income!.date) : new Date(),
      }]);
      return response.income.id;
    }
    throw new Error('Failed to create income');
  }, [user]);

  const updateGroupIncome = useCallback(async (incomeId: string, updates: Partial<GroupIncome>): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.updateIncome({
      incomeId,
      source: updates.source,
      amount: updates.amount,
      amountCents: updates.amount !== undefined ? dollarsToCents(updates.amount) : undefined,
      frequency: updates.frequency ? incomeFrequencyToProto[updates.frequency] : undefined,
    });

    setGroupIncomes(prev => prev.map(i => 
      i.id === incomeId ? { ...i, ...updates } : i
    ));
  }, [user]);

  const deleteGroupIncome = useCallback(async (incomeId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.deleteIncome({ incomeId });
    setGroupIncomes(prev => prev.filter(i => i.id !== incomeId));
  }, [user]);

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
