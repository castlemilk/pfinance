/**
 * useIncomes Hook
 * 
 * Manages income CRUD operations.
 */

import { useState, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { financeClient } from '@/lib/financeService';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Income, IncomeFrequency, TaxStatus, Deduction } from '@/app/types';
import {
  incomeFrequencyToProto,
  taxStatusToProto,
  mapProtoIncomeToLocal,
  dollarsToCents,
} from '../mappers';

interface UseIncomesOptions {
  user: User | null;
  isDevMode: boolean;
  effectiveUserId: string;
  useApi: boolean;
  getStorageKey: (key: string) => string;
  onError?: (error: string) => void;
}

interface UseIncomesReturn {
  incomes: Income[];
  setIncomes: React.Dispatch<React.SetStateAction<Income[]>>;
  addIncome: (
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ) => Promise<void>;
  updateIncome: (
    id: string, 
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  loadIncomes: () => Promise<Income[]>;
}

export function useIncomes({
  // user,
  // isDevMode,
  effectiveUserId,
  useApi,
  getStorageKey,
  onError,
}: UseIncomesOptions): UseIncomesReturn {
  const [incomes, setIncomes] = useState<Income[]>([]);

  // Load incomes from API
  const loadIncomes = useCallback(async (): Promise<Income[]> => {
    if (!useApi || !effectiveUserId) {
      return [];
    }

    try {
      const response = await financeClient.listIncomes({
        userId: effectiveUserId,
        pageSize: 1000,
      });
      const loadedIncomes = response.incomes.map(mapProtoIncomeToLocal);
      setIncomes(loadedIncomes);
      return loadedIncomes;
    } catch (err) {
      console.error('Failed to load incomes:', err);
      if (err instanceof Error && !err.message.includes('unauthenticated')) {
        onError?.(err.message);
      }
      return [];
    }
  }, [useApi, effectiveUserId, onError]);

  // Persist to localStorage when not using API
  useEffect(() => {
    if (!useApi) {
      localStorage.setItem(getStorageKey('incomes'), JSON.stringify(incomes));
    }
  }, [incomes, useApi, getStorageKey]);

  const addIncome = useCallback(async (
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.createIncome({
          userId: effectiveUserId,
          source,
          amount,
          amountCents: dollarsToCents(amount),
          frequency: incomeFrequencyToProto[frequency],
          taxStatus: taxStatusToProto[taxStatus],
          deductions: deductions?.map(d => ({
            id: d.id,
            name: d.name,
            amount: d.amount,
            amountCents: dollarsToCents(d.amount),
            isTaxDeductible: d.isTaxDeductible,
          })),
          date: timestampFromDate(new Date()),
        });
        if (response.income) {
          setIncomes(prev => [...prev, mapProtoIncomeToLocal(response.income!)]);
        }
      } catch (err) {
        console.error('Failed to create income:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to create income');
      }
    } else {
      // Local mode
      const newIncome: Income = {
        id: crypto.randomUUID(),
        source,
        amount,
        frequency,
        taxStatus,
        deductions,
        date: new Date(),
      };
      setIncomes(prev => [...prev, newIncome]);
    }
  }, [useApi, effectiveUserId, onError]);

  const updateIncome = useCallback(async (
    id: string, 
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.updateIncome({
          incomeId: id,
          source,
          amount,
          amountCents: dollarsToCents(amount),
          frequency: incomeFrequencyToProto[frequency],
          taxStatus: taxStatusToProto[taxStatus],
          deductions: deductions?.map(d => ({
            id: d.id,
            name: d.name,
            amount: d.amount,
            amountCents: dollarsToCents(d.amount),
            isTaxDeductible: d.isTaxDeductible,
          })),
        });
        if (response.income) {
          setIncomes(prev => prev.map(income => 
            income.id === id ? mapProtoIncomeToLocal(response.income!) : income
          ));
        }
      } catch (err) {
        console.error('Failed to update income:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to update income');
      }
    } else {
      // Local mode
      setIncomes(prev => prev.map(income => 
        income.id === id 
          ? { ...income, source, amount, frequency, taxStatus, deductions }
          : income
      ));
    }
  }, [useApi, effectiveUserId, onError]);

  const deleteIncome = useCallback(async (id: string): Promise<void> => {
    if (useApi && effectiveUserId) {
      try {
        await financeClient.deleteIncome({ incomeId: id });
        setIncomes(prev => prev.filter(income => income.id !== id));
      } catch (err) {
        console.error('Failed to delete income:', err);
        onError?.(err instanceof Error ? err.message : 'Failed to delete income');
      }
    } else {
      setIncomes(prev => prev.filter(income => income.id !== id));
    }
  }, [useApi, effectiveUserId, onError]);

  return {
    incomes,
    setIncomes,
    addIncome,
    updateIncome,
    deleteIncome,
    loadIncomes,
  };
}
