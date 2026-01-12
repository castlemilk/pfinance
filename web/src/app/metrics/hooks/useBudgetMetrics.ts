'use client';

/**
 * useBudgetMetrics Hook
 * 
 * Provides computed budget metrics for components.
 */

import { useMemo } from 'react';
import { IncomeFrequency, TaxConfig, Expense, ExpenseCategory } from '../../types';
import { Budget, BudgetProgress } from '@/gen/pfinance/v1/types_pb';
import { BudgetMetrics, BudgetProgressMetric } from '../types';
import { 
  computeBudgetMetrics, 
  getBudgetMetricsForCategory,
  getMostConstrainedBudget,
  getAtRiskBudgets,
  BudgetMetricsInput, 
  BudgetMetricsOptions 
} from '../providers/budget-metrics';
import { getCurrencyForCountry } from '../utils/currency';

/**
 * Options for the useBudgetMetrics hook
 */
export interface UseBudgetMetricsOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
  asOfDate?: Date;
}

/**
 * Hook return type
 */
export interface UseBudgetMetricsReturn {
  /** Computed budget metrics */
  metrics: BudgetMetrics;
  /** Get budgets for a specific category */
  getBudgetsForCategory: (category: ExpenseCategory) => BudgetProgressMetric[];
  /** Get the most constrained budget */
  getMostConstrained: () => BudgetProgressMetric | null;
  /** Get budgets at risk of being exceeded */
  getAtRisk: (threshold?: number) => BudgetProgressMetric[];
  /** Whether any budgets are exceeded */
  hasExceededBudgets: boolean;
  /** Whether all budgets are on track */
  allOnTrack: boolean;
}

/**
 * Hook to compute and access budget metrics
 */
export function useBudgetMetrics(
  budgets: Budget[],
  budgetProgresses: Map<string, BudgetProgress>,
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseBudgetMetricsOptions
): UseBudgetMetricsReturn {
  const { displayPeriod, currency, asOfDate } = options;
  const resolvedCurrency = currency ?? getCurrencyForCountry(taxConfig.country);

  // Memoize the computed metrics
  const metrics = useMemo(() => {
    const input: BudgetMetricsInput = {
      budgets,
      budgetProgresses,
      expenses,
      taxConfig,
    };

    const metricsOptions: BudgetMetricsOptions = {
      displayPeriod,
      currency: resolvedCurrency,
      asOfDate,
    };

    return computeBudgetMetrics(input, metricsOptions);
  }, [budgets, budgetProgresses, expenses, taxConfig, displayPeriod, resolvedCurrency, asOfDate]);

  // Memoize helper functions
  const getBudgetsForCategory = useMemo(() => {
    return (category: ExpenseCategory) => getBudgetMetricsForCategory(metrics, category);
  }, [metrics]);

  const getMostConstrained = useMemo(() => {
    return () => getMostConstrainedBudget(metrics);
  }, [metrics]);

  const getAtRisk = useMemo(() => {
    return (threshold?: number) => getAtRiskBudgets(metrics, threshold);
  }, [metrics]);

  const hasExceededBudgets = metrics.exceededCount > 0;
  const allOnTrack = metrics.onTrackCount === metrics.budgets.length;

  return {
    metrics,
    getBudgetsForCategory,
    getMostConstrained,
    getAtRisk,
    hasExceededBudgets,
    allOnTrack,
  };
}

/**
 * Hook to get a single budget's progress
 */
export function useSingleBudgetProgress(
  budget: Budget | null,
  progress: BudgetProgress | undefined,
  options: UseBudgetMetricsOptions
): BudgetProgressMetric | null {
  const { displayPeriod, currency, asOfDate } = options;

  return useMemo(() => {
    if (!budget) return null;

    const { computeBudgetProgressMetric } = require('../providers/budget-metrics');
    return computeBudgetProgressMetric(budget, progress, {
      displayPeriod,
      currency,
      asOfDate,
    });
  }, [budget, progress, displayPeriod, currency, asOfDate]);
}
