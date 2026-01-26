'use client';

/**
 * useFinanceMetrics Hook
 * 
 * Provides computed financial metrics for components.
 * This hook handles memoization and integrates with the MetricsContext.
 */

import { useMemo } from 'react';
import { IncomeFrequency, Income, Expense, TaxConfig } from '../../types';
import { FinanceMetrics, MetricUtils } from '../types';
import { computeFinanceMetrics, FinanceMetricsInput, FinanceMetricsOptions } from '../providers/finance-metrics';
import { toAnnual, fromAnnual, getPeriodLabel } from '../utils/period';
import { formatCurrency, formatPercentage, getCurrencyForCountry } from '../utils/currency';
import { getTaxSystem, calculateTaxWithBrackets } from '../../constants/taxSystems';

/**
 * Options for the useFinanceMetrics hook
 */
export interface UseFinanceMetricsOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
}

/**
 * Hook return type
 */
export interface UseFinanceMetricsReturn {
  /** Computed finance metrics */
  metrics: FinanceMetrics;
  /** Utility functions */
  utils: MetricUtils;
  /** Current display period */
  displayPeriod: IncomeFrequency;
  /** Period label for display */
  periodLabel: string;
}

/**
 * Hook to compute and access financial metrics
 */
export function useFinanceMetrics(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseFinanceMetricsOptions
): UseFinanceMetricsReturn {
  const { displayPeriod, currency } = options;
  const resolvedCurrency = currency ?? getCurrencyForCountry(taxConfig.country);

  // Memoize the computed metrics
  const metrics = useMemo(() => {
    const input: FinanceMetricsInput = {
      incomes,
      expenses,
      taxConfig,
    };

    const metricsOptions: FinanceMetricsOptions = {
      displayPeriod,
      currency: resolvedCurrency,
    };

    return computeFinanceMetrics(input, metricsOptions);
  }, [incomes, expenses, taxConfig, displayPeriod, resolvedCurrency]);

  // Create utility functions
  const utils: MetricUtils = useMemo(() => ({
    toAnnual,
    fromAnnual,
    formatCurrency: (amount: number, currencyOverride?: string) => 
      formatCurrency(amount, currencyOverride ?? resolvedCurrency),
    formatPercentage: (value: number, decimals?: number) => 
      formatPercentage(value, decimals),
    calculateTax: (amount: number, config: TaxConfig) => {
      if (!config.enabled || amount <= 0) return 0;
      if (config.country === 'simple') {
        return (amount * config.taxRate) / 100;
      }
      const taxSystem = getTaxSystem(config.country);
      const brackets = config.customBrackets ?? taxSystem.brackets;
      return calculateTaxWithBrackets(amount, brackets);
    },
    periodize: (annualAmount: number, period: IncomeFrequency, currencyOverride?: string) => {
      const periodValue = fromAnnual(annualAmount, period);
      const curr = currencyOverride ?? resolvedCurrency;
      return {
        value: periodValue,
        period,
        annualized: annualAmount,
        formatted: formatCurrency(periodValue, curr),
      };
    },
  }), [resolvedCurrency]);

  const periodLabel = getPeriodLabel(displayPeriod);

  return {
    metrics,
    utils,
    displayPeriod,
    periodLabel,
  };
}

/**
 * Hook to get just the income metrics
 */
export function useIncomeMetrics(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseFinanceMetricsOptions
) {
  const { metrics } = useFinanceMetrics(incomes, expenses, taxConfig, options);
  return metrics.income;
}

/**
 * Hook to get just the expense metrics
 */
export function useExpenseMetrics(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseFinanceMetricsOptions
) {
  const { metrics } = useFinanceMetrics(incomes, expenses, taxConfig, options);
  return metrics.expenses;
}

/**
 * Hook to get just the savings metrics
 */
export function useSavingsMetrics(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseFinanceMetricsOptions
) {
  const { metrics } = useFinanceMetrics(incomes, expenses, taxConfig, options);
  return metrics.savings;
}

/**
 * Hook to get just the tax metrics
 */
export function useTaxMetrics(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseFinanceMetricsOptions
) {
  const { metrics } = useFinanceMetrics(incomes, expenses, taxConfig, options);
  return metrics.tax;
}
