'use client';

/**
 * FinanceContext
 * 
 * Data layer context for raw financial data storage and CRUD operations.
 * Uses backend API when authenticated, falls back to localStorage for demo mode.
 * 
 * NOTE: For computed metrics and visualization data, use the MetricsContext
 * or the metrics hooks directly. This context is focused on data management.
 */

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { useAdmin } from './AdminContext';
import { useAuth } from './AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Timestamp } from '@bufbuild/protobuf';
import {
  ExpenseCategory as ProtoExpenseCategory,
  ExpenseFrequency as ProtoExpenseFrequency,
  IncomeFrequency as ProtoIncomeFrequency,
  TaxStatus as ProtoTaxStatus,
  TaxCountry as ProtoTaxCountry,
  Expense as ProtoExpense,
  Income as ProtoIncome,
} from '@/gen/pfinance/v1/types_pb';
import { 
  Expense, 
  ExpenseCategory, 
  ExpenseSummary,
  ExpenseFrequency, 
  Income, 
  IncomeFrequency, 
  TaxConfig,
  TaxStatus,
  Deduction
} from '../types';

// Use centralized utilities from the metrics layer
import { toAnnual, fromAnnual } from '../metrics/utils/period';
import { getTaxSystem, calculateTaxWithBrackets } from '../constants/taxSystems';

// ============================================================================
// Type Mapping Utilities
// ============================================================================

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

const protoToCategory: Record<ProtoExpenseCategory, ExpenseCategory> = {
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

const expenseFrequencyToProto: Record<ExpenseFrequency, ProtoExpenseFrequency> = {
  'once': ProtoExpenseFrequency.ONCE,
  'daily': ProtoExpenseFrequency.DAILY,
  'weekly': ProtoExpenseFrequency.WEEKLY,
  'fortnightly': ProtoExpenseFrequency.FORTNIGHTLY,
  'monthly': ProtoExpenseFrequency.MONTHLY,
  'quarterly': ProtoExpenseFrequency.QUARTERLY,
  'annually': ProtoExpenseFrequency.ANNUALLY,
};

const protoToExpenseFrequency: Record<ProtoExpenseFrequency, ExpenseFrequency> = {
  [ProtoExpenseFrequency.UNSPECIFIED]: 'monthly',
  [ProtoExpenseFrequency.ONCE]: 'once',
  [ProtoExpenseFrequency.DAILY]: 'daily',
  [ProtoExpenseFrequency.WEEKLY]: 'weekly',
  [ProtoExpenseFrequency.FORTNIGHTLY]: 'fortnightly',
  [ProtoExpenseFrequency.MONTHLY]: 'monthly',
  [ProtoExpenseFrequency.QUARTERLY]: 'quarterly',
  [ProtoExpenseFrequency.ANNUALLY]: 'annually',
};

const incomeFrequencyToProto: Record<IncomeFrequency, ProtoIncomeFrequency> = {
  'weekly': ProtoIncomeFrequency.WEEKLY,
  'fortnightly': ProtoIncomeFrequency.FORTNIGHTLY,
  'monthly': ProtoIncomeFrequency.MONTHLY,
  'annually': ProtoIncomeFrequency.ANNUALLY,
};

const protoToIncomeFrequency: Record<ProtoIncomeFrequency, IncomeFrequency> = {
  [ProtoIncomeFrequency.UNSPECIFIED]: 'monthly',
  [ProtoIncomeFrequency.WEEKLY]: 'weekly',
  [ProtoIncomeFrequency.FORTNIGHTLY]: 'fortnightly',
  [ProtoIncomeFrequency.MONTHLY]: 'monthly',
  [ProtoIncomeFrequency.ANNUALLY]: 'annually',
};

const taxStatusToProto: Record<TaxStatus, ProtoTaxStatus> = {
  'preTax': ProtoTaxStatus.PRE_TAX,
  'postTax': ProtoTaxStatus.POST_TAX,
};

const protoToTaxStatus: Record<ProtoTaxStatus, TaxStatus> = {
  [ProtoTaxStatus.UNSPECIFIED]: 'preTax',
  [ProtoTaxStatus.PRE_TAX]: 'preTax',
  [ProtoTaxStatus.POST_TAX]: 'postTax',
};

// Map proto expense to local expense
function mapProtoExpenseToLocal(proto: ProtoExpense): Expense {
  return {
    id: proto.id,
    description: proto.description,
    amount: proto.amount,
    category: protoToCategory[proto.category],
    frequency: protoToExpenseFrequency[proto.frequency],
    date: proto.date?.toDate() ?? new Date(),
  };
}

// Map proto income to local income
function mapProtoIncomeToLocal(proto: ProtoIncome): Income {
  return {
    id: proto.id,
    source: proto.source,
    amount: proto.amount,
    frequency: protoToIncomeFrequency[proto.frequency],
    taxStatus: protoToTaxStatus[proto.taxStatus],
    deductions: proto.deductions?.map(d => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      isTaxDeductible: d.isTaxDeductible,
    })),
    date: proto.date?.toDate() ?? new Date(),
  };
}

// ============================================================================
// Context Interface
// ============================================================================

interface FinanceContextType {
  // Raw data
  expenses: Expense[];
  incomes: Income[];
  taxConfig: TaxConfig;
  loading: boolean;
  error: string | null;
  
  // Expense CRUD
  addExpense: (description: string, amount: number, category: ExpenseCategory, frequency?: ExpenseFrequency) => Promise<void>;
  addExpenses: (newExpenses: Array<{description: string, amount: number, category: ExpenseCategory, frequency?: ExpenseFrequency}>) => Promise<void>;
  updateExpense: (id: string, description: string, amount: number, category: ExpenseCategory, frequency: ExpenseFrequency) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  deleteExpenses: (ids: string[]) => Promise<void>;
  
  // Income CRUD
  addIncome: (source: string, amount: number, frequency: IncomeFrequency, taxStatus: TaxStatus, deductions?: Deduction[]) => Promise<void>;
  updateIncome: (id: string, source: string, amount: number, frequency: IncomeFrequency, taxStatus: TaxStatus, deductions?: Deduction[]) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  
  // Tax config
  updateTaxConfig: (config: Partial<TaxConfig>) => void;
  
  // Refresh data from API
  refreshData: () => Promise<void>;
  
  // Legacy computed methods (kept for backward compatibility)
  getExpenseSummary: () => ExpenseSummary[];
  getTotalExpenses: () => number;
  getTotalIncome: (period?: IncomeFrequency) => number;
  getNetIncome: (period?: IncomeFrequency) => number;
  calculateTax: (amount: number) => number;
}

const defaultTaxConfig: TaxConfig = {
  enabled: true,
  country: 'simple',
  taxRate: 20,
  includeDeductions: true
};

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { isAdminMode } = useAdmin();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [taxConfig, setTaxConfig] = useState<TaxConfig>(defaultTaxConfig);
  const [error, setError] = useState<string | null>(null);

  // Storage key helper for admin/demo mode
  const getStorageKey = useCallback((baseKey: string) => {
    return isAdminMode ? `test_${baseKey}` : baseKey;
  }, [isAdminMode]);

  // Dev mode: use API with mock user when NEXT_PUBLIC_DEV_MODE=true and backend has SKIP_AUTH=true
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devUserId = 'local-dev-user';
  
  // Check if we should use the API (user is authenticated OR dev mode)
  const useApi = !!user || isDevMode;
  const effectiveUserId = user?.uid || (isDevMode ? devUserId : '');
  
  // Start with loading=true if we're going to fetch from API
  const [loading, setLoading] = useState(useApi && !!effectiveUserId);
  
  // Load from localStorage (fallback/demo mode) - defined first so loadData can reference it
  const loadFromLocalStorage = useCallback(() => {
    const savedExpenses = localStorage.getItem(getStorageKey('expenses'));
    if (savedExpenses) {
      try {
        const parsed = JSON.parse(savedExpenses);
        setExpenses(parsed.map((e: { date: string }) => ({
          ...e,
          date: new Date(e.date)
        })));
      } catch (err) {
        console.error('Failed to parse expenses from localStorage:', err);
      }
    }

    const savedIncomes = localStorage.getItem(getStorageKey('incomes'));
    if (savedIncomes) {
      try {
        const parsed = JSON.parse(savedIncomes);
        setIncomes(parsed.map((i: { date: string }) => ({
          ...i,
          date: new Date(i.date)
        })));
      } catch (err) {
        console.error('Failed to parse incomes from localStorage:', err);
      }
    }

    const savedTaxConfig = localStorage.getItem(getStorageKey('taxConfig'));
    if (savedTaxConfig) {
      try {
        setTaxConfig(JSON.parse(savedTaxConfig));
      } catch (err) {
        console.error('Failed to parse tax config from localStorage:', err);
      }
    }
  }, [getStorageKey]);

  // Load data from API or localStorage
  const loadData = useCallback(async () => {
    if (useApi && effectiveUserId) {
      setLoading(true);
      setError(null);
      try {
        // Load expenses from API
        const expensesResponse = await financeClient.listExpenses({
          userId: effectiveUserId,
          pageSize: 1000,
        });
        setExpenses(expensesResponse.expenses.map(mapProtoExpenseToLocal));

        // Load incomes from API
        const incomesResponse = await financeClient.listIncomes({
          userId: effectiveUserId,
          pageSize: 1000,
        });
        setIncomes(incomesResponse.incomes.map(mapProtoIncomeToLocal));

        // Load tax config from API
        try {
          const taxResponse = await financeClient.getTaxConfig({
            userId: effectiveUserId,
          });
          if (taxResponse.taxConfig) {
            setTaxConfig({
              enabled: taxResponse.taxConfig.enabled,
              country: taxResponse.taxConfig.country === ProtoTaxCountry.AUSTRALIA ? 'australia' :
                       taxResponse.taxConfig.country === ProtoTaxCountry.UK ? 'uk' : 'simple',
              taxRate: taxResponse.taxConfig.taxRate,
              includeDeductions: taxResponse.taxConfig.includeDeductions,
            });
          }
        } catch {
          // Tax config may not exist, use default
          console.debug('No tax config found, using default');
        }
      } catch (err) {
        console.error('Failed to load data from API:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
        // Fall back to localStorage
        loadFromLocalStorage();
      } finally {
        setLoading(false);
      }
    } else {
      // Load from localStorage for demo mode
      loadFromLocalStorage();
    }
  }, [useApi, effectiveUserId, getStorageKey, loadFromLocalStorage]);

  // Load data on mount and when user changes
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Persist to localStorage when data changes (for demo mode or as cache)
  useEffect(() => {
    if (!useApi) {
      localStorage.setItem(getStorageKey('expenses'), JSON.stringify(expenses));
    }
  }, [expenses, useApi, getStorageKey]);

  useEffect(() => {
    if (!useApi) {
      localStorage.setItem(getStorageKey('incomes'), JSON.stringify(incomes));
    }
  }, [incomes, useApi, getStorageKey]);

  useEffect(() => {
    localStorage.setItem(getStorageKey('taxConfig'), JSON.stringify(taxConfig));
  }, [taxConfig, getStorageKey]);

  // ============================================================================
  // Expense CRUD Operations
  // ============================================================================

  const addExpense = async (
    description: string, 
    amount: number, 
    category: ExpenseCategory, 
    frequency: ExpenseFrequency = 'monthly'
  ) => {
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
        setError(err instanceof Error ? err.message : 'Failed to create expense');
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
  };

  const addExpenses = async (
    newExpenses: Array<{description: string, amount: number, category: ExpenseCategory, frequency?: ExpenseFrequency}>
  ) => {
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
        setError(err instanceof Error ? err.message : 'Failed to create expenses');
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
          frequency: exp.frequency || 'monthly',
          date: new Date()
        }))
      ]);
    }
  };

  const updateExpense = async (
    id: string, 
    description: string, 
    amount: number, 
    category: ExpenseCategory, 
    frequency: ExpenseFrequency
  ) => {
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
        setError(err instanceof Error ? err.message : 'Failed to update expense');
      }
    } else {
      // Local mode
      setExpenses(prev => prev.map(expense => 
        expense.id === id 
          ? { ...expense, description, amount, category, frequency }
          : expense
      ));
    }
  };

  const deleteExpense = async (id: string) => {
    if (useApi && effectiveUserId) {
      try {
        await financeClient.deleteExpense({ expenseId: id });
        setExpenses(prev => prev.filter(expense => expense.id !== id));
      } catch (err) {
        console.error('Failed to delete expense:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete expense');
      }
    } else {
      setExpenses(prev => prev.filter(expense => expense.id !== id));
    }
  };

  const deleteExpenses = async (ids: string[]) => {
    if (useApi && effectiveUserId) {
      try {
        await Promise.all(ids.map(id => financeClient.deleteExpense({ expenseId: id })));
        setExpenses(prev => prev.filter(expense => !ids.includes(expense.id)));
      } catch (err) {
        console.error('Failed to delete expenses:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete expenses');
      }
    } else {
      setExpenses(prev => prev.filter(expense => !ids.includes(expense.id)));
    }
  };

  // ============================================================================
  // Income CRUD Operations
  // ============================================================================

  const addIncome = async (
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ) => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.createIncome({
          userId: effectiveUserId,
          source,
          amount,
          frequency: incomeFrequencyToProto[frequency],
          taxStatus: taxStatusToProto[taxStatus],
          deductions: deductions?.map(d => ({
            id: d.id,
            name: d.name,
            amount: d.amount,
            isTaxDeductible: d.isTaxDeductible,
          })),
          date: Timestamp.now(),
        });
        if (response.income) {
          setIncomes(prev => [...prev, mapProtoIncomeToLocal(response.income!)]);
        }
      } catch (err) {
        console.error('Failed to create income:', err);
        setError(err instanceof Error ? err.message : 'Failed to create income');
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
  };

  const updateIncome = async (
    id: string, 
    source: string, 
    amount: number, 
    frequency: IncomeFrequency, 
    taxStatus: TaxStatus, 
    deductions?: Deduction[]
  ) => {
    if (useApi && effectiveUserId) {
      try {
        const response = await financeClient.updateIncome({
          incomeId: id,
          source,
          amount,
          frequency: incomeFrequencyToProto[frequency],
          taxStatus: taxStatusToProto[taxStatus],
          deductions: deductions?.map(d => ({
            id: d.id,
            name: d.name,
            amount: d.amount,
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
        setError(err instanceof Error ? err.message : 'Failed to update income');
      }
    } else {
      // Local mode
      setIncomes(prev => prev.map(income => 
        income.id === id 
          ? { ...income, source, amount, frequency, taxStatus, deductions }
          : income
      ));
    }
  };

  const deleteIncome = async (id: string) => {
    if (useApi && effectiveUserId) {
      try {
        await financeClient.deleteIncome({ incomeId: id });
        setIncomes(prev => prev.filter(income => income.id !== id));
      } catch (err) {
        console.error('Failed to delete income:', err);
        setError(err instanceof Error ? err.message : 'Failed to delete income');
      }
    } else {
      setIncomes(prev => prev.filter(income => income.id !== id));
    }
  };

  // ============================================================================
  // Tax Config
  // ============================================================================

  const updateTaxConfig = (config: Partial<TaxConfig>) => {
    setTaxConfig(prev => {
      const newConfig = { ...prev, ...config };
      localStorage.setItem(getStorageKey('taxConfig'), JSON.stringify(newConfig));
      
      // Update API in background if authenticated
      if (useApi && effectiveUserId) {
        financeClient.updateTaxConfig({
          userId: effectiveUserId,
          taxConfig: {
            enabled: newConfig.enabled,
            country: newConfig.country === 'australia' ? ProtoTaxCountry.AUSTRALIA :
                     newConfig.country === 'uk' ? ProtoTaxCountry.UK : ProtoTaxCountry.SIMPLE,
            taxRate: newConfig.taxRate,
            includeDeductions: newConfig.includeDeductions,
          },
        }).catch(err => console.error('Failed to update tax config on server:', err));
      }
      
      return newConfig;
    });
  };

  // Refresh data from API
  const refreshData = async () => {
    await loadData();
  };

  // ============================================================================
  // Legacy Computed Methods (for backward compatibility)
  // ============================================================================

  const getTotalExpenses = () => {
    return expenses.reduce((total, expense) => {
      return total + toAnnual(expense.amount, expense.frequency as IncomeFrequency);
    }, 0);
  };

  const getExpenseSummary = (): ExpenseSummary[] => {
    const totalAmount = getTotalExpenses();
    
    const categorySums = expenses.reduce((acc, expense) => {
      const annualAmount = toAnnual(expense.amount, expense.frequency as IncomeFrequency);
      acc[expense.category] = (acc[expense.category] || 0) + annualAmount;
      return acc;
    }, {} as Record<ExpenseCategory, number>);
    
    return Object.entries(categorySums).map(([category, amount]) => ({
      category: category as ExpenseCategory,
      totalAmount: amount,
      percentage: totalAmount > 0 ? (amount / totalAmount) * 100 : 0,
    }));
  };

  const getTotalIncome = (period: IncomeFrequency = 'annually'): number => {
    const annualTotal = incomes.reduce((total, income) => {
      return total + toAnnual(income.amount, income.frequency);
    }, 0);
    return fromAnnual(annualTotal, period);
  };

  const calculateTax = (amount: number): number => {
    if (!taxConfig.enabled || amount <= 0) return 0;
    
    if (taxConfig.country === 'simple') {
      return (amount * taxConfig.taxRate) / 100;
    }
    
    const taxSystem = getTaxSystem(taxConfig.country);
    const brackets = taxConfig.customBrackets || taxSystem.brackets;
    return calculateTaxWithBrackets(amount, brackets);
  };

  const getNetIncome = (period: IncomeFrequency = 'annually'): number => {
    const totalIncome = getTotalIncome(period);
    
    if (!taxConfig.enabled) return totalIncome;
    
    const annualIncome = toAnnual(totalIncome, period);
    
    let annualTaxableIncome = annualIncome;
    if (taxConfig.includeDeductions) {
      const deductibleAmount = incomes.reduce((total, income) => {
        if (!income.deductions) return total;
        const annualDeductions = income.deductions
          .filter(d => d.isTaxDeductible)
          .reduce((sum, d) => sum + d.amount, 0);
        return total + toAnnual(annualDeductions, income.frequency);
      }, 0);
      annualTaxableIncome = Math.max(0, annualIncome - deductibleAmount);
    }
    
    const annualTax = calculateTax(annualTaxableIncome);
    const periodTax = fromAnnual(annualTax, period);
    
    return totalIncome - periodTax;
  };

  return (
    <FinanceContext.Provider value={{ 
      // Raw data
      expenses, 
      incomes,
      taxConfig,
      loading,
      error,
      
      // Expense CRUD
      addExpense, 
      addExpenses,
      updateExpense,
      deleteExpense,
      deleteExpenses,
      
      // Income CRUD
      addIncome,
      updateIncome,
      deleteIncome,
      
      // Tax config
      updateTaxConfig,
      
      // Refresh
      refreshData,
      
      // Legacy computed methods
      getExpenseSummary,
      getTotalExpenses,
      getTotalIncome,
      getNetIncome,
      calculateTax
    }}>
      {children}
    </FinanceContext.Provider>
  );
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (context === undefined) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
}
