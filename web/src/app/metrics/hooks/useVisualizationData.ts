'use client';

/**
 * useVisualizationData Hook
 * 
 * Provides pre-computed, chart-ready data for visualization components.
 */

import { useMemo } from 'react';
import { IncomeFrequency, Income, Expense, TaxConfig } from '../../types';
import { 
  VisualizationData, 
  PieChartData, 
  SankeyDiagramData, 
  SummaryCardData,
  FinanceMetrics 
} from '../types';
import { computeFinanceMetrics } from '../providers/finance-metrics';
import { computeSankeyDiagramData, FlowMetricsInput, FlowMetricsOptions } from '../providers/flow-metrics';
import { getCurrencyForCountry } from '../utils/currency';
import { getPeriodLabel } from '../utils/period';

/**
 * Options for the useVisualizationData hook
 */
export interface UseVisualizationDataOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
  includeSavingsBreakdown?: boolean;
  maxExpenseCategories?: number;
}

/**
 * Hook return type
 */
export interface UseVisualizationDataReturn {
  /** Complete visualization data */
  data: VisualizationData;
  /** Just the expense pie chart data */
  expensePieChart: PieChartData[];
  /** Just the income pie chart data */
  incomePieChart: PieChartData[];
  /** Just the Sankey diagram data */
  sankeyDiagram: SankeyDiagramData;
  /** Summary cards data */
  summaryCards: SummaryCardData[];
  /** Current period label */
  periodLabel: string;
  /** Whether there is data to visualize */
  hasData: boolean;
}

/**
 * Hook to compute visualization-ready data
 */
export function useVisualizationData(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseVisualizationDataOptions
): UseVisualizationDataReturn {
  const { 
    displayPeriod, 
    currency, 
    includeSavingsBreakdown = true,
    maxExpenseCategories = 10
  } = options;
  const resolvedCurrency = currency ?? getCurrencyForCountry(taxConfig.country);

  // First compute the finance metrics (for pie charts and summary cards)
  const financeMetrics = useMemo(() => {
    return computeFinanceMetrics(
      { incomes, expenses, taxConfig },
      { displayPeriod, currency: resolvedCurrency }
    );
  }, [incomes, expenses, taxConfig, displayPeriod, resolvedCurrency]);

  // Compute expense pie chart data
  const expensePieChart = useMemo<PieChartData[]>(() => {
    return financeMetrics.expenses.byCategory.map(cat => ({
      id: cat.category,
      label: cat.category,
      value: cat.amount.value,
      percentage: cat.percentageOfTotal,
      color: cat.color,
      formattedValue: cat.amount.formatted,
    }));
  }, [financeMetrics.expenses.byCategory]);

  // Compute income pie chart data
  const incomePieChart = useMemo<PieChartData[]>(() => {
    return financeMetrics.income.sources.map(source => ({
      id: source.id,
      label: source.source,
      value: source.amount.value,
      percentage: source.percentageOfTotal,
      color: source.color,
      formattedValue: source.amount.formatted,
    }));
  }, [financeMetrics.income.sources]);

  // Compute Sankey diagram data
  const sankeyDiagram = useMemo<SankeyDiagramData>(() => {
    const input: FlowMetricsInput = {
      incomes,
      expenses,
      taxConfig,
      financeMetrics,
    };

    const flowOptions: FlowMetricsOptions = {
      displayPeriod,
      currency: resolvedCurrency,
      includeSavingsBreakdown,
      maxExpenseCategories,
    };

    return computeSankeyDiagramData(input, flowOptions);
  }, [incomes, expenses, taxConfig, financeMetrics, displayPeriod, resolvedCurrency, includeSavingsBreakdown, maxExpenseCategories]);

  // Compute summary cards
  const summaryCards = useMemo<SummaryCardData[]>(() => {
    return [
      {
        id: 'income',
        title: 'Income',
        value: financeMetrics.income.gross.formatted,
        subtitle: displayPeriod,
      },
      {
        id: 'expenses',
        title: 'Expenses',
        value: financeMetrics.expenses.total.formatted,
        subtitle: displayPeriod,
      },
      {
        id: 'savings',
        title: 'Savings',
        value: financeMetrics.savings.amount.formatted,
        subtitle: `${financeMetrics.savings.rate.toFixed(1)}% of income`,
        color: financeMetrics.savings.statusColor,
      },
      {
        id: 'tax',
        title: 'Tax',
        value: financeMetrics.tax.amount.formatted,
        subtitle: financeMetrics.tax.isEnabled 
          ? `${financeMetrics.tax.effectiveRate.toFixed(1)}% effective rate`
          : 'Disabled',
      },
    ];
  }, [financeMetrics, displayPeriod]);

  const periodLabel = getPeriodLabel(displayPeriod);
  const hasData = incomes.length > 0 || expenses.length > 0;

  // Combine all data
  const data: VisualizationData = {
    expensePieChart,
    incomePieChart,
    sankeyDiagram,
    summaryCards,
    trendData: [], // Historical trend data not yet implemented
    displayPeriod,
  };

  return {
    data,
    expensePieChart,
    incomePieChart,
    sankeyDiagram,
    summaryCards,
    periodLabel,
    hasData,
  };
}

/**
 * Hook to get just pie chart data
 */
export function usePieChartData(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseVisualizationDataOptions
) {
  const { expensePieChart, incomePieChart, hasData } = useVisualizationData(
    incomes, 
    expenses, 
    taxConfig, 
    options
  );
  
  return { expensePieChart, incomePieChart, hasData };
}

/**
 * Hook to get just Sankey diagram data
 */
export function useSankeyData(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseVisualizationDataOptions
) {
  const { sankeyDiagram, periodLabel, hasData } = useVisualizationData(
    incomes, 
    expenses, 
    taxConfig, 
    options
  );
  
  return { sankeyDiagram, periodLabel, hasData };
}

/**
 * Hook to get just summary card data
 */
export function useSummaryCardsData(
  incomes: Income[],
  expenses: Expense[],
  taxConfig: TaxConfig,
  options: UseVisualizationDataOptions
) {
  const { summaryCards, periodLabel } = useVisualizationData(
    incomes, 
    expenses, 
    taxConfig, 
    options
  );
  
  return { summaryCards, periodLabel };
}
