/**
 * useLocalDataMigration Hook
 * 
 * Migrates localStorage data to remote store when user logs in.
 * This ensures data created while logged out is not lost.
 * 
 * Migration runs once per user and only if:
 * 1. User is authenticated
 * 2. There is local data to migrate
 * 3. Migration hasn't been completed for this user yet
 */

import { useCallback, useRef } from 'react';
import { financeClient } from '@/lib/financeService';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Expense, Income, ExpenseCategory, ExpenseFrequency, IncomeFrequency, TaxStatus } from '@/app/types';
import { 
  categoryToProto, 
  expenseFrequencyToProto,
  incomeFrequencyToProto,
  taxStatusToProto
} from '../mappers';

interface UseLocalDataMigrationOptions {
  effectiveUserId: string;
  useApi: boolean;
  getStorageKey: (key: string) => string;
}

interface LocalData {
  expenses: Expense[];
  incomes: Income[];
}

interface UseLocalDataMigrationReturn {
  migrateLocalData: () => Promise<{ migratedExpenses: number; migratedIncomes: number }>;
  checkForLocalData: () => LocalData | null;
  markMigrationComplete: () => void;
  isMigrationNeeded: () => boolean;
}

const MIGRATION_KEY_PREFIX = 'pfinance_migrated_';

export function useLocalDataMigration({
  effectiveUserId,
  useApi,
  getStorageKey,
}: UseLocalDataMigrationOptions): UseLocalDataMigrationReturn {
  const isMigratingRef = useRef(false);

  // Get the migration flag key for this user
  const getMigrationKey = useCallback(() => {
    return `${MIGRATION_KEY_PREFIX}${effectiveUserId}`;
  }, [effectiveUserId]);

  // Check if migration has already been completed for this user
  const isMigrationComplete = useCallback(() => {
    if (!effectiveUserId) return true; // No user, no migration needed
    const migrated = localStorage.getItem(getMigrationKey());
    return migrated === 'true';
  }, [effectiveUserId, getMigrationKey]);

  // Check if there's local data that could be migrated
  const checkForLocalData = useCallback((): LocalData | null => {
    try {
      const savedExpenses = localStorage.getItem(getStorageKey('expenses'));
      const savedIncomes = localStorage.getItem(getStorageKey('incomes'));

      let localExpenses: Expense[] = [];
      let localIncomes: Income[] = [];

      if (savedExpenses) {
        const parsed = JSON.parse(savedExpenses);
        localExpenses = parsed.map((e: { date: string }) => ({
          ...e,
          date: new Date(e.date)
        }));
      }

      if (savedIncomes) {
        const parsed = JSON.parse(savedIncomes);
        localIncomes = parsed.map((i: { date: string }) => ({
          ...i,
          date: new Date(i.date)
        }));
      }

      if (localExpenses.length === 0 && localIncomes.length === 0) {
        return null;
      }

      return { expenses: localExpenses, incomes: localIncomes };
    } catch (err) {
      console.error('[useLocalDataMigration] Error checking local data:', err);
      return null;
    }
  }, [getStorageKey]);

  // Check if migration is needed
  const isMigrationNeeded = useCallback(() => {
    if (!useApi || !effectiveUserId) return false;
    if (isMigrationComplete()) return false;
    const localData = checkForLocalData();
    return localData !== null && (localData.expenses.length > 0 || localData.incomes.length > 0);
  }, [useApi, effectiveUserId, isMigrationComplete, checkForLocalData]);

  // Mark migration as complete
  const markMigrationComplete = useCallback(() => {
    if (effectiveUserId) {
      localStorage.setItem(getMigrationKey(), 'true');
      console.log('[useLocalDataMigration] Migration marked complete for user:', effectiveUserId);
    }
  }, [effectiveUserId, getMigrationKey]);

  // Migrate local data to remote store
  const migrateLocalData = useCallback(async (): Promise<{ migratedExpenses: number; migratedIncomes: number }> => {
    if (!useApi || !effectiveUserId) {
      return { migratedExpenses: 0, migratedIncomes: 0 };
    }

    if (isMigrationComplete()) {
      console.log('[useLocalDataMigration] Migration already complete for user:', effectiveUserId);
      return { migratedExpenses: 0, migratedIncomes: 0 };
    }

    if (isMigratingRef.current) {
      console.log('[useLocalDataMigration] Migration already in progress');
      return { migratedExpenses: 0, migratedIncomes: 0 };
    }

    const localData = checkForLocalData();
    if (!localData) {
      markMigrationComplete();
      return { migratedExpenses: 0, migratedIncomes: 0 };
    }

    isMigratingRef.current = true;
    console.log('[useLocalDataMigration] Starting migration for user:', effectiveUserId);
    console.log('[useLocalDataMigration] Local data:', {
      expenses: localData.expenses.length,
      incomes: localData.incomes.length
    });

    let migratedExpenses = 0;
    let migratedIncomes = 0;

    try {
      // Migrate expenses
      if (localData.expenses.length > 0) {
        try {
          const response = await financeClient.batchCreateExpenses({
            userId: effectiveUserId,
            expenses: localData.expenses.map(exp => ({
              userId: effectiveUserId,
              description: exp.description,
              amount: exp.amount,
              category: categoryToProto[exp.category as ExpenseCategory],
              frequency: expenseFrequencyToProto[(exp.frequency || 'monthly') as ExpenseFrequency],
              date: timestampFromDate(exp.date || new Date()),
            })),
          });
          migratedExpenses = response.expenses?.length || 0;
          console.log('[useLocalDataMigration] Migrated expenses:', migratedExpenses);
        } catch (err) {
          console.error('[useLocalDataMigration] Failed to migrate expenses:', err);
        }
      }

      // Migrate incomes
      if (localData.incomes.length > 0) {
        for (const income of localData.incomes) {
          try {
            await financeClient.createIncome({
              userId: effectiveUserId,
              source: income.source,
              amount: income.amount,
              frequency: incomeFrequencyToProto[income.frequency as IncomeFrequency],
              taxStatus: taxStatusToProto[(income.taxStatus || 'preTax') as TaxStatus],
              deductions: income.deductions?.map(d => ({
                id: d.id,
                name: d.name,
                amount: d.amount,
                isTaxDeductible: d.isTaxDeductible,
              })),
              date: timestampFromDate(income.date || new Date()),
            });
            migratedIncomes++;
          } catch (err) {
            console.error('[useLocalDataMigration] Failed to migrate income:', err);
          }
        }
        console.log('[useLocalDataMigration] Migrated incomes:', migratedIncomes);
      }

      // Mark migration complete
      markMigrationComplete();

      console.log('[useLocalDataMigration] Migration complete:', {
        migratedExpenses,
        migratedIncomes
      });

      return { migratedExpenses, migratedIncomes };
    } finally {
      isMigratingRef.current = false;
    }
  }, [useApi, effectiveUserId, isMigrationComplete, checkForLocalData, markMigrationComplete]);

  return {
    migrateLocalData,
    checkForLocalData,
    markMigrationComplete,
    isMigrationNeeded,
  };
}
