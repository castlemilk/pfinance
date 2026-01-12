/**
 * Metrics Engine
 * 
 * Core computation engine for the metrics layer. Provides:
 * - Centralized metric computation
 * - Memoization/caching layer
 * - Plugin system for custom metrics
 * - Utility functions for metric providers
 */

import { 
  IncomeFrequency,
  ExpenseFrequency, 
  TaxConfig, 
  Income, 
  Expense 
} from '../types';
import { getTaxSystem, calculateTaxWithBrackets } from '../constants/taxSystems';
import {
  MetricConfig,
  MetricComputeContext,
  MetricUtils,
  ComputedMetric,
  PeriodizedAmount,
  MetricsInput,
  MetricsOptions,
  IMetricsEngine,
  FinanceMetrics,
  VisualizationData,
} from './types';
import { toAnnual, fromAnnual, getPeriodLabel } from './utils/period';
import { formatCurrency, formatPercentage, getCurrencyForCountry } from './utils/currency';

/**
 * Create metric utilities for a given context
 */
function createMetricUtils(currency: string, taxConfig: TaxConfig): MetricUtils {
  return {
    toAnnual,
    fromAnnual,
    
    formatCurrency: (amount: number, currencyOverride?: string) => {
      return formatCurrency(amount, currencyOverride ?? currency);
    },
    
    formatPercentage: (value: number, decimals?: number) => {
      return formatPercentage(value, decimals);
    },
    
    calculateTax: (amount: number, config: TaxConfig) => {
      if (!config.enabled || amount <= 0) return 0;
      
      if (config.country === 'simple') {
        return (amount * config.taxRate) / 100;
      }
      
      const taxSystem = getTaxSystem(config.country);
      const brackets = config.customBrackets ?? taxSystem.brackets;
      return calculateTaxWithBrackets(amount, brackets);
    },
    
    periodize: (annualAmount: number, displayPeriod: IncomeFrequency, currencyOverride?: string): PeriodizedAmount => {
      const periodValue = fromAnnual(annualAmount, displayPeriod);
      const curr = currencyOverride ?? currency;
      return {
        value: periodValue,
        period: displayPeriod,
        annualized: annualAmount,
        formatted: formatCurrency(periodValue, curr),
      };
    },
  };
}

/**
 * Simple hash function for cache keys
 */
function hashInput(input: MetricsInput, options: MetricsOptions): string {
  return JSON.stringify({
    incomeIds: input.incomes.map(i => i.id).sort(),
    incomeAmounts: input.incomes.map(i => i.amount).sort(),
    expenseIds: input.expenses.map(e => e.id).sort(),
    expenseAmounts: input.expenses.map(e => e.amount).sort(),
    taxEnabled: input.taxConfig.enabled,
    taxCountry: input.taxConfig.country,
    taxRate: input.taxConfig.taxRate,
    period: options.displayPeriod,
  });
}

/**
 * Metrics Engine Implementation
 */
export class MetricsEngine implements IMetricsEngine {
  private registeredMetrics: Map<string, MetricConfig<unknown>> = new Map();
  private computedMetrics: Map<string, ComputedMetric<unknown>> = new Map();
  private lastInputHash: string = '';
  private lastComputeTime: number = 0;
  
  // Cache for full computation results
  private cachedFinanceMetrics: FinanceMetrics | null = null;
  private cachedVisualizationData: VisualizationData | null = null;

  /**
   * Register a custom metric
   */
  register<T>(config: MetricConfig<T>): void {
    this.registeredMetrics.set(config.id, config as MetricConfig<unknown>);
    // Invalidate cache when new metrics are registered
    this.invalidate();
  }

  /**
   * Get a computed metric by ID
   */
  getMetric<T>(id: string): T | undefined {
    const cached = this.computedMetrics.get(id);
    if (cached && !cached.isStale) {
      return cached.value as T;
    }
    return undefined;
  }

  /**
   * Invalidate all cached computations
   */
  invalidate(): void {
    this.computedMetrics.forEach(metric => {
      metric.isStale = true;
    });
    this.cachedFinanceMetrics = null;
    this.cachedVisualizationData = null;
    this.lastInputHash = '';
  }

  /**
   * Compute all metrics
   */
  computeAll(
    input: MetricsInput, 
    options: MetricsOptions
  ): { finance: FinanceMetrics; visualization: VisualizationData } {
    const inputHash = hashInput(input, options);
    
    // Return cached results if input hasn't changed
    if (inputHash === this.lastInputHash && this.cachedFinanceMetrics && this.cachedVisualizationData) {
      return {
        finance: this.cachedFinanceMetrics,
        visualization: this.cachedVisualizationData,
      };
    }

    const currency = options.currency ?? getCurrencyForCountry(input.taxConfig.country);
    const utils = createMetricUtils(currency, input.taxConfig);
    
    // Create the compute context
    const context: MetricComputeContext = {
      incomes: input.incomes,
      expenses: input.expenses,
      taxConfig: input.taxConfig,
      displayPeriod: options.displayPeriod,
      currency,
      utils,
      getMetric: <T>(id: string) => this.getMetric<T>(id),
    };

    // Import and compute finance metrics
    const financeMetrics = this.computeFinanceMetrics(context);
    
    // Import and compute visualization data
    const visualizationData = this.computeVisualizationData(context, financeMetrics);

    // Compute any registered custom metrics
    this.computeRegisteredMetrics(context);

    // Cache results
    this.cachedFinanceMetrics = financeMetrics;
    this.cachedVisualizationData = visualizationData;
    this.lastInputHash = inputHash;
    this.lastComputeTime = Date.now();

    return {
      finance: financeMetrics,
      visualization: visualizationData,
    };
  }

  /**
   * Compute finance metrics
   */
  private computeFinanceMetrics(context: MetricComputeContext): FinanceMetrics {
    const { incomes, expenses, taxConfig, displayPeriod, currency, utils } = context;

    // Compute income metrics
    const incomeMetrics = this.computeIncomeMetrics(context);
    
    // Compute expense metrics
    const expenseMetrics = this.computeExpenseMetrics(context, incomeMetrics);
    
    // Compute tax metrics
    const taxMetrics = this.computeTaxMetrics(context, incomeMetrics);
    
    // Compute savings metrics
    const savingsMetrics = this.computeSavingsMetrics(context, incomeMetrics, expenseMetrics, taxMetrics);

    return {
      income: incomeMetrics,
      expenses: expenseMetrics,
      savings: savingsMetrics,
      tax: taxMetrics,
      displayPeriod,
      currency,
    };
  }

  /**
   * Compute income metrics
   */
  private computeIncomeMetrics(context: MetricComputeContext) {
    const { incomes, displayPeriod, utils, taxConfig } = context;
    
    // Import colors
    const { getIncomeColor } = require('./utils/colors');

    // Calculate total annual income
    let totalAnnualGross = 0;
    let totalAnnualDeductions = 0;

    const sources = incomes.map((income, index) => {
      const annualAmount = utils.toAnnual(income.amount, income.frequency);
      totalAnnualGross += annualAmount;

      // Calculate deductions for this income
      let incomeDeductions = 0;
      if (income.deductions) {
        incomeDeductions = income.deductions.reduce((sum, d) => sum + d.amount, 0);
        // Annualize deductions based on income frequency
        incomeDeductions = utils.toAnnual(incomeDeductions, income.frequency);
        totalAnnualDeductions += incomeDeductions;
      }

      // Calculate tax contribution (only for pre-tax income)
      let taxContribution = 0;
      if (income.taxStatus === 'preTax' && taxConfig.enabled) {
        // Proportional tax based on this income's share of total pre-tax income
        const preTaxTotal = incomes
          .filter(i => i.taxStatus === 'preTax')
          .reduce((sum, i) => sum + utils.toAnnual(i.amount, i.frequency), 0);
        
        if (preTaxTotal > 0) {
          const totalTax = utils.calculateTax(preTaxTotal, taxConfig);
          taxContribution = (annualAmount / preTaxTotal) * totalTax;
        }
      }

      return {
        id: income.id,
        source: income.source,
        amount: utils.periodize(annualAmount, displayPeriod),
        isPreTax: income.taxStatus === 'preTax',
        taxContribution: utils.periodize(taxContribution, displayPeriod),
        netContribution: utils.periodize(annualAmount - taxContribution, displayPeriod),
        percentageOfTotal: 0, // Will be calculated after we have totals
        color: getIncomeColor(index),
      };
    });

    // Calculate percentages
    sources.forEach(source => {
      source.percentageOfTotal = totalAnnualGross > 0 
        ? (source.amount.annualized / totalAnnualGross) * 100 
        : 0;
    });

    // Calculate net income after tax
    const preTaxAnnualIncome = incomes
      .filter(i => i.taxStatus === 'preTax')
      .reduce((sum, i) => sum + utils.toAnnual(i.amount, i.frequency), 0);
    
    const postTaxAnnualIncome = incomes
      .filter(i => i.taxStatus === 'postTax')
      .reduce((sum, i) => sum + utils.toAnnual(i.amount, i.frequency), 0);

    let totalTax = 0;
    if (taxConfig.enabled && preTaxAnnualIncome > 0) {
      // Apply deductions if configured
      const taxableIncome = taxConfig.includeDeductions 
        ? Math.max(0, preTaxAnnualIncome - totalAnnualDeductions)
        : preTaxAnnualIncome;
      totalTax = utils.calculateTax(taxableIncome, taxConfig);
    }

    const totalAnnualNet = totalAnnualGross - totalTax;

    return {
      gross: utils.periodize(totalAnnualGross, displayPeriod),
      net: utils.periodize(totalAnnualNet, displayPeriod),
      sources,
      deductions: utils.periodize(totalAnnualDeductions, displayPeriod),
      sourceCount: incomes.length,
    };
  }

  /**
   * Compute expense metrics
   */
  private computeExpenseMetrics(
    context: MetricComputeContext, 
    incomeMetrics: ReturnType<typeof this.computeIncomeMetrics>
  ) {
    const { expenses, displayPeriod, utils } = context;
    
    // Import colors
    const { getCategoryColor } = require('./utils/colors');

    // Group expenses by category
    const categoryTotals = new Map<string, number>();
    let totalAnnualExpenses = 0;

    expenses.forEach(expense => {
      const annualAmount = utils.toAnnual(expense.amount, expense.frequency);
      totalAnnualExpenses += annualAmount;
      
      const current = categoryTotals.get(expense.category) ?? 0;
      categoryTotals.set(expense.category, current + annualAmount);
    });

    // Build category metrics
    const byCategory = Array.from(categoryTotals.entries()).map(([category, annualAmount]) => ({
      category: category as import('../types').ExpenseCategory,
      amount: utils.periodize(annualAmount, displayPeriod),
      percentageOfTotal: totalAnnualExpenses > 0 ? (annualAmount / totalAnnualExpenses) * 100 : 0,
      percentageOfIncome: incomeMetrics.net.annualized > 0 
        ? (annualAmount / incomeMetrics.net.annualized) * 100 
        : 0,
      expenseCount: expenses.filter(e => e.category === category).length,
      color: getCategoryColor(category as import('../types').ExpenseCategory),
    }));

    // Sort by amount descending
    byCategory.sort((a, b) => b.amount.annualized - a.amount.annualized);

    // Get top 5 categories
    const topCategories = byCategory.slice(0, 5);

    // Calculate spending rate
    const spendingRate = incomeMetrics.net.annualized > 0
      ? (totalAnnualExpenses / incomeMetrics.net.annualized) * 100
      : 0;

    return {
      total: utils.periodize(totalAnnualExpenses, displayPeriod),
      byCategory,
      topCategories,
      expenseCount: expenses.length,
      spendingRate,
    };
  }

  /**
   * Compute tax metrics
   */
  private computeTaxMetrics(
    context: MetricComputeContext,
    incomeMetrics: ReturnType<typeof this.computeIncomeMetrics>
  ) {
    const { incomes, taxConfig, displayPeriod, utils } = context;

    // Calculate pre-tax income for tax calculation
    const preTaxAnnualIncome = incomes
      .filter(i => i.taxStatus === 'preTax')
      .reduce((sum, i) => sum + utils.toAnnual(i.amount, i.frequency), 0);

    // Calculate deductible amount
    const deductibleAmount = incomeMetrics.deductions.annualized;

    // Calculate taxable income
    const taxableIncome = taxConfig.includeDeductions
      ? Math.max(0, preTaxAnnualIncome - deductibleAmount)
      : preTaxAnnualIncome;

    // Calculate total tax
    const totalTax = taxConfig.enabled 
      ? utils.calculateTax(taxableIncome, taxConfig) 
      : 0;

    // Calculate effective rate
    const effectiveRate = incomeMetrics.gross.annualized > 0
      ? (totalTax / incomeMetrics.gross.annualized) * 100
      : 0;

    // Calculate marginal rate (rate on next dollar of income)
    let marginalRate = 0;
    if (taxConfig.enabled) {
      if (taxConfig.country === 'simple') {
        marginalRate = taxConfig.taxRate;
      } else {
        const taxSystem = getTaxSystem(taxConfig.country);
        const brackets = taxConfig.customBrackets ?? taxSystem.brackets;
        const applicableBracket = brackets.find(b => 
          taxableIncome >= b.min && (b.max === null || taxableIncome <= b.max)
        );
        marginalRate = applicableBracket?.rate ?? 0;
      }
    }

    return {
      amount: utils.periodize(totalTax, displayPeriod),
      effectiveRate,
      marginalRate,
      taxSystem: taxConfig.country,
      isEnabled: taxConfig.enabled,
      deductibleAmount: utils.periodize(deductibleAmount, displayPeriod),
    };
  }

  /**
   * Compute savings metrics
   */
  private computeSavingsMetrics(
    context: MetricComputeContext,
    incomeMetrics: ReturnType<typeof this.computeIncomeMetrics>,
    expenseMetrics: ReturnType<typeof this.computeExpenseMetrics>,
    taxMetrics: ReturnType<typeof this.computeTaxMetrics>
  ) {
    const { displayPeriod, utils } = context;
    
    // Import colors
    const { getSavingsStatusColor } = require('./utils/colors');

    // Calculate savings
    const annualSavings = incomeMetrics.net.annualized - expenseMetrics.total.annualized;
    
    // Calculate savings rate (as percentage of gross income)
    const savingsRate = incomeMetrics.gross.annualized > 0
      ? (annualSavings / incomeMetrics.gross.annualized) * 100
      : 0;

    // Determine savings status
    let status: import('./types').SavingsStatus;
    if (savingsRate >= 20) status = 'excellent';
    else if (savingsRate >= 10) status = 'good';
    else if (savingsRate >= 0) status = 'fair';
    else status = 'poor';

    return {
      amount: utils.periodize(annualSavings, displayPeriod),
      rate: savingsRate,
      status,
      statusColor: getSavingsStatusColor(status),
      projectedAnnual: utils.periodize(annualSavings, 'annually'),
    };
  }

  /**
   * Compute visualization data
   */
  private computeVisualizationData(
    context: MetricComputeContext,
    financeMetrics: FinanceMetrics
  ): VisualizationData {
    const { displayPeriod, utils } = context;
    
    // Expense pie chart data
    const expensePieChart = financeMetrics.expenses.byCategory.map(cat => ({
      id: cat.category,
      label: cat.category,
      value: cat.amount.value,
      percentage: cat.percentageOfTotal,
      color: cat.color,
      formattedValue: cat.amount.formatted,
    }));

    // Income pie chart data
    const incomePieChart = financeMetrics.income.sources.map(source => ({
      id: source.id,
      label: source.source,
      value: source.amount.value,
      percentage: source.percentageOfTotal,
      color: source.color,
      formattedValue: source.amount.formatted,
    }));

    // Summary cards data
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

    // Sankey diagram data will be computed by the flow-metrics provider
    // For now, return an empty placeholder
    const sankeyDiagram = {
      nodes: [],
      links: [],
      periodLabel: getPeriodLabel(displayPeriod),
    };

    return {
      expensePieChart,
      incomePieChart,
      sankeyDiagram,
      summaryCards,
      trendData: [], // Historical data not yet implemented
      displayPeriod,
    };
  }

  /**
   * Compute registered custom metrics
   */
  private computeRegisteredMetrics(context: MetricComputeContext): void {
    // Sort metrics by dependencies
    const sortedMetrics = this.topologicalSort();
    
    for (const config of sortedMetrics) {
      try {
        const value = config.compute(context);
        this.computedMetrics.set(config.id, {
          value,
          computedAt: Date.now(),
          isStale: false,
        });
      } catch (error) {
        console.error(`Failed to compute metric ${config.id}:`, error);
      }
    }
  }

  /**
   * Topological sort of metrics by dependencies
   */
  private topologicalSort(): MetricConfig<unknown>[] {
    const result: MetricConfig<unknown>[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Circular dependency detected for metric: ${id}`);
      }

      const config = this.registeredMetrics.get(id);
      if (!config) return;

      visiting.add(id);

      for (const depId of config.dependencies) {
        visit(depId);
      }

      visiting.delete(id);
      visited.add(id);
      result.push(config);
    };

    for (const id of this.registeredMetrics.keys()) {
      visit(id);
    }

    return result;
  }
}

// Export singleton instance
export const metricsEngine = new MetricsEngine();

// Export utility creation for external use
export { createMetricUtils };
