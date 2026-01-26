/**
 * useFinanceCalculations Hook
 * 
 * Provides computed values and calculations for finance data.
 */

import { useCallback } from 'react';
import { 
  Expense, 
  ExpenseCategory, 
  ExpenseSummary, 
  Income, 
  IncomeFrequency, 
  TaxConfig 
} from '@/app/types';
import { toAnnual, fromAnnual } from '@/app/metrics/utils/period';
import { getTaxSystem, calculateTaxWithBrackets } from '@/app/constants/taxSystems';

interface UseFinanceCalculationsOptions {
  expenses: Expense[];
  incomes: Income[];
  taxConfig: TaxConfig;
}

interface UseFinanceCalculationsReturn {
  getTotalExpenses: () => number;
  getExpenseSummary: () => ExpenseSummary[];
  getTotalIncome: (period?: IncomeFrequency) => number;
  getNetIncome: (period?: IncomeFrequency) => number;
  calculateTax: (amount: number) => number;
}

export function useFinanceCalculations({
  expenses,
  incomes,
  taxConfig,
}: UseFinanceCalculationsOptions): UseFinanceCalculationsReturn {
  const getTotalExpenses = useCallback(() => {
    return expenses.reduce((total, expense) => {
      return total + toAnnual(expense.amount, expense.frequency as IncomeFrequency);
    }, 0);
  }, [expenses]);

  const getExpenseSummary = useCallback((): ExpenseSummary[] => {
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
  }, [expenses, getTotalExpenses]);

  const getTotalIncome = useCallback((period: IncomeFrequency = 'annually'): number => {
    const annualTotal = incomes.reduce((total, income) => {
      return total + toAnnual(income.amount, income.frequency);
    }, 0);
    return fromAnnual(annualTotal, period);
  }, [incomes]);

  const calculateTax = useCallback((amount: number): number => {
    if (!taxConfig.enabled || amount <= 0) return 0;
    
    if (taxConfig.country === 'simple') {
      return (amount * taxConfig.taxRate) / 100;
    }
    
    const taxSystem = getTaxSystem(taxConfig.country);
    const brackets = taxConfig.customBrackets || taxSystem.brackets;
    return calculateTaxWithBrackets(amount, brackets);
  }, [taxConfig]);

  const getNetIncome = useCallback((period: IncomeFrequency = 'annually'): number => {
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
  }, [incomes, taxConfig, getTotalIncome, calculateTax]);

  return {
    getTotalExpenses,
    getExpenseSummary,
    getTotalIncome,
    getNetIncome,
    calculateTax,
  };
}
