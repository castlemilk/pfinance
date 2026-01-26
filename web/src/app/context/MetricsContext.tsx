'use client';

/**
 * MetricsContext
 * 
 * Central context that provides computed metrics to all visualization components.
 * This context subscribes to data layer contexts and provides computed metrics,
 * handling period selection globally.
 */

import { 
  createContext, 
  useContext, 
  useState, 
  useMemo, 
  useCallback, 
  ReactNode 
} from 'react';
import { useFinance } from './FinanceContext';
import { useBudgets } from './BudgetContext';
import { IncomeFrequency, TaxConfig } from '../types';
import { 
  FinanceMetrics, 
  VisualizationData, 
  BudgetMetrics,
  MetricUtils,
  MetricsContextValue,
  PeriodizedAmount,
} from '../metrics/types';
import { computeFinanceMetrics } from '../metrics/providers/finance-metrics';
import { computeBudgetMetrics } from '../metrics/providers/budget-metrics';
import { computeSankeyDiagramData } from '../metrics/providers/flow-metrics';
import { toAnnual, fromAnnual } from '../metrics/utils/period';
import { formatCurrency, formatPercentage, getCurrencyForCountry } from '../metrics/utils/currency';
import { getTaxSystem, calculateTaxWithBrackets } from '../constants/taxSystems';

const MetricsContext = createContext<MetricsContextValue | undefined>(undefined);

/**
 * Props for MetricsProvider
 */
interface MetricsProviderProps {
  children: ReactNode;
  /** Initial display period */
  defaultPeriod?: IncomeFrequency;
}

/**
 * MetricsProvider component
 * 
 * Wraps the application and provides computed metrics to all children.
 */
export function MetricsProvider({ 
  children, 
  defaultPeriod = 'monthly' 
}: MetricsProviderProps) {
  // Subscribe to data layer contexts
  const { incomes, expenses, taxConfig } = useFinance();
  const { budgets, budgetProgresses } = useBudgets();

  // Global display period state
  const [displayPeriod, setDisplayPeriod] = useState<IncomeFrequency>(defaultPeriod);

  // Compute recomputation flag (for manual recomputation)
  const [recomputeFlag, setRecomputeFlag] = useState(0);

  // Get resolved currency
  const currency = getCurrencyForCountry(taxConfig.country);

  // Create utility functions
  const utils: MetricUtils = useMemo(() => ({
    toAnnual,
    fromAnnual,
    formatCurrency: (amount: number, currencyOverride?: string) => 
      formatCurrency(amount, currencyOverride ?? currency),
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
    periodize: (annualAmount: number, period: IncomeFrequency, currencyOverride?: string): PeriodizedAmount => {
      const periodValue = fromAnnual(annualAmount, period);
      const curr = currencyOverride ?? currency;
      return {
        value: periodValue,
        period,
        annualized: annualAmount,
        formatted: formatCurrency(periodValue, curr),
      };
    },
  }), [currency]);

  // Compute finance metrics
  const financeMetrics = useMemo<FinanceMetrics | null>(() => {
    // Trigger recomputation when flag changes
    void recomputeFlag;
    
    if (incomes.length === 0 && expenses.length === 0) {
      // Return empty metrics structure for consistency
      const emptyPeriodized: PeriodizedAmount = {
        value: 0,
        period: displayPeriod,
        annualized: 0,
        formatted: formatCurrency(0, currency),
      };
      
      return {
        income: {
          gross: emptyPeriodized,
          net: emptyPeriodized,
          sources: [],
          deductions: emptyPeriodized,
          sourceCount: 0,
        },
        expenses: {
          total: emptyPeriodized,
          byCategory: [],
          topCategories: [],
          expenseCount: 0,
          spendingRate: 0,
        },
        savings: {
          amount: emptyPeriodized,
          rate: 0,
          status: 'fair',
          statusColor: '#f59e0b',
          projectedAnnual: emptyPeriodized,
        },
        tax: {
          amount: emptyPeriodized,
          effectiveRate: 0,
          marginalRate: 0,
          taxSystem: taxConfig.country,
          isEnabled: taxConfig.enabled,
          deductibleAmount: emptyPeriodized,
        },
        displayPeriod,
        currency,
      };
    }

    return computeFinanceMetrics(
      { incomes, expenses, taxConfig },
      { displayPeriod, currency }
    );
  }, [incomes, expenses, taxConfig, displayPeriod, currency, recomputeFlag]);

  // Compute visualization data
  const visualizationData = useMemo<VisualizationData | null>(() => {
    void recomputeFlag;
    
    if (!financeMetrics) return null;

    // Build expense pie chart
    const expensePieChart = financeMetrics.expenses.byCategory.map(cat => ({
      id: cat.category,
      label: cat.category,
      value: cat.amount.value,
      percentage: cat.percentageOfTotal,
      color: cat.color,
      formattedValue: cat.amount.formatted,
    }));

    // Build income pie chart
    const incomePieChart = financeMetrics.income.sources.map(source => ({
      id: source.id,
      label: source.source,
      value: source.amount.value,
      percentage: source.percentageOfTotal,
      color: source.color,
      formattedValue: source.amount.formatted,
    }));

    // Build Sankey diagram
    const sankeyDiagram = computeSankeyDiagramData(
      { incomes, expenses, taxConfig, financeMetrics },
      { displayPeriod, currency, includeSavingsBreakdown: true }
    );

    // Build summary cards
    const summaryCards = [
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
    ];

    return {
      expensePieChart,
      incomePieChart,
      sankeyDiagram,
      summaryCards,
      trendData: [],
      displayPeriod,
    };
  }, [financeMetrics, incomes, expenses, taxConfig, displayPeriod, currency, recomputeFlag]);

  // Compute budget metrics
  const budgetMetrics = useMemo<BudgetMetrics | null>(() => {
    void recomputeFlag;
    
    if (budgets.length === 0) return null;

    return computeBudgetMetrics(
      { budgets, budgetProgresses, expenses, taxConfig },
      { displayPeriod, currency }
    );
  }, [budgets, budgetProgresses, expenses, taxConfig, displayPeriod, currency, recomputeFlag]);

  // Force recomputation function
  const recompute = useCallback(() => {
    setRecomputeFlag(prev => prev + 1);
  }, []);

  // Context value
  const value: MetricsContextValue = {
    displayPeriod,
    setDisplayPeriod,
    financeMetrics,
    visualizationData,
    budgetMetrics,
    isComputing: false, // Synchronous computation, always false
    recompute,
    utils,
  };

  return (
    <MetricsContext.Provider value={value}>
      {children}
    </MetricsContext.Provider>
  );
}

/**
 * Hook to access metrics context
 */
export function useMetrics(): MetricsContextValue {
  const context = useContext(MetricsContext);
  if (context === undefined) {
    throw new Error('useMetrics must be used within a MetricsProvider');
  }
  return context;
}

/**
 * Hook to access just finance metrics
 */
export function useMetricsFinance() {
  const { financeMetrics, displayPeriod, utils } = useMetrics();
  return { financeMetrics, displayPeriod, utils };
}

/**
 * Hook to access just visualization data
 */
export function useMetricsVisualization() {
  const { visualizationData, displayPeriod } = useMetrics();
  return { visualizationData, displayPeriod };
}

/**
 * Hook to access just budget metrics
 */
export function useMetricsBudget() {
  const { budgetMetrics, displayPeriod, utils } = useMetrics();
  return { budgetMetrics, displayPeriod, utils };
}

/**
 * Hook to control display period
 */
export function useDisplayPeriod() {
  const { displayPeriod, setDisplayPeriod } = useMetrics();
  return { displayPeriod, setDisplayPeriod };
}
