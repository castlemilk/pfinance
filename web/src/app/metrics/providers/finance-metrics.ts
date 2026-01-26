/**
 * Finance Metrics Provider
 * 
 * Provides computation functions for core financial metrics:
 * - Income metrics (gross, net, by source)
 * - Expense metrics (total, by category)
 * - Savings metrics (amount, rate, status)
 * - Tax metrics (amount, effective rate, marginal rate)
 */

import { 
  Income, 
  Expense, 
  ExpenseCategory,
  IncomeFrequency,
  TaxConfig
} from '../../types';
import { 
  IncomeMetrics,
  ExpenseMetrics,
  SavingsMetrics,
  TaxMetrics,
  FinanceMetrics,
  PeriodizedAmount,
  IncomeSourceMetric,
  CategoryExpenseMetric,
  SavingsStatus,
} from '../types';
import { toAnnual, fromAnnual } from '../utils/period';
import { formatCurrency, getCurrencyForCountry } from '../utils/currency';
import { 
  getCategoryColor, 
  getIncomeColor, 
  getSavingsStatusColor 
} from '../utils/colors';
import { getTaxSystem, calculateTaxWithBrackets } from '../../constants/taxSystems';

/**
 * Input for finance metrics computation
 */
export interface FinanceMetricsInput {
  incomes: Income[];
  expenses: Expense[];
  taxConfig: TaxConfig;
}

/**
 * Options for finance metrics computation
 */
export interface FinanceMetricsOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
}

/**
 * Create a PeriodizedAmount from an annual value
 */
function createPeriodizedAmount(
  annualAmount: number,
  displayPeriod: IncomeFrequency,
  currency: string
): PeriodizedAmount {
  const periodValue = fromAnnual(annualAmount, displayPeriod);
  return {
    value: periodValue,
    period: displayPeriod,
    annualized: annualAmount,
    formatted: formatCurrency(periodValue, currency),
  };
}

/**
 * Calculate tax for a given income amount
 */
function calculateTax(amount: number, taxConfig: TaxConfig): number {
  if (!taxConfig.enabled || amount <= 0) return 0;
  
  if (taxConfig.country === 'simple') {
    return (amount * taxConfig.taxRate) / 100;
  }
  
  const taxSystem = getTaxSystem(taxConfig.country);
  const brackets = taxConfig.customBrackets ?? taxSystem.brackets;
  return calculateTaxWithBrackets(amount, brackets);
}

/**
 * Compute income metrics
 */
export function computeIncomeMetrics(
  input: FinanceMetricsInput,
  options: FinanceMetricsOptions
): IncomeMetrics {
  const { incomes, taxConfig } = input;
  const { displayPeriod } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Calculate totals
  let totalAnnualGross = 0;
  let totalAnnualDeductions = 0;

  // Calculate pre-tax income for tax distribution
  const preTaxAnnualIncome = incomes
    .filter(i => i.taxStatus === 'preTax')
    .reduce((sum, i) => sum + toAnnual(i.amount, i.frequency), 0);

  // Calculate total tax on pre-tax income
  let totalTaxOnPreTax = 0;
  if (taxConfig.enabled && preTaxAnnualIncome > 0) {
    // Calculate deductible amount
    const deductibleAmount = incomes.reduce((total, income) => {
      if (!income.deductions) return total;
      const annualDeductions = income.deductions
        .filter(d => d.isTaxDeductible)
        .reduce((sum, d) => sum + d.amount, 0);
      return total + toAnnual(annualDeductions, income.frequency);
    }, 0);

    const taxableIncome = taxConfig.includeDeductions
      ? Math.max(0, preTaxAnnualIncome - deductibleAmount)
      : preTaxAnnualIncome;

    totalTaxOnPreTax = calculateTax(taxableIncome, taxConfig);
  }

  // Build source metrics
  const sources: IncomeSourceMetric[] = incomes.map((income, index) => {
    const annualAmount = toAnnual(income.amount, income.frequency);
    totalAnnualGross += annualAmount;

    // Calculate deductions for this income
    let incomeDeductions = 0;
    if (income.deductions) {
      incomeDeductions = income.deductions.reduce((sum, d) => sum + d.amount, 0);
      incomeDeductions = toAnnual(incomeDeductions, income.frequency);
      totalAnnualDeductions += incomeDeductions;
    }

    // Calculate tax contribution (only for pre-tax income)
    let taxContribution = 0;
    if (income.taxStatus === 'preTax' && taxConfig.enabled && preTaxAnnualIncome > 0) {
      taxContribution = (annualAmount / preTaxAnnualIncome) * totalTaxOnPreTax;
    }

    return {
      id: income.id,
      source: income.source,
      amount: createPeriodizedAmount(annualAmount, displayPeriod, currency),
      isPreTax: income.taxStatus === 'preTax',
      taxContribution: createPeriodizedAmount(taxContribution, displayPeriod, currency),
      netContribution: createPeriodizedAmount(annualAmount - taxContribution, displayPeriod, currency),
      percentageOfTotal: 0, // Calculated after totals
      color: getIncomeColor(index),
    };
  });

  // Calculate percentages
  sources.forEach(source => {
    source.percentageOfTotal = totalAnnualGross > 0
      ? (source.amount.annualized / totalAnnualGross) * 100
      : 0;
  });

  // Calculate net income
  const totalAnnualNet = totalAnnualGross - totalTaxOnPreTax;

  return {
    gross: createPeriodizedAmount(totalAnnualGross, displayPeriod, currency),
    net: createPeriodizedAmount(totalAnnualNet, displayPeriod, currency),
    sources,
    deductions: createPeriodizedAmount(totalAnnualDeductions, displayPeriod, currency),
    sourceCount: incomes.length,
  };
}

/**
 * Compute expense metrics
 */
export function computeExpenseMetrics(
  input: FinanceMetricsInput,
  options: FinanceMetricsOptions,
  incomeMetrics: IncomeMetrics
): ExpenseMetrics {
  const { expenses, taxConfig } = input;
  const { displayPeriod } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Group expenses by category
  const categoryTotals = new Map<ExpenseCategory, { amount: number; count: number }>();
  let totalAnnualExpenses = 0;

  expenses.forEach(expense => {
    const annualAmount = toAnnual(expense.amount, expense.frequency);
    totalAnnualExpenses += annualAmount;

    const existing = categoryTotals.get(expense.category);
    if (existing) {
      existing.amount += annualAmount;
      existing.count += 1;
    } else {
      categoryTotals.set(expense.category, { amount: annualAmount, count: 1 });
    }
  });

  // Build category metrics
  const byCategory: CategoryExpenseMetric[] = Array.from(categoryTotals.entries()).map(
    ([category, { amount, count }]) => ({
      category,
      amount: createPeriodizedAmount(amount, displayPeriod, currency),
      percentageOfTotal: totalAnnualExpenses > 0 ? (amount / totalAnnualExpenses) * 100 : 0,
      percentageOfIncome: incomeMetrics.net.annualized > 0
        ? (amount / incomeMetrics.net.annualized) * 100
        : 0,
      expenseCount: count,
      color: getCategoryColor(category),
    })
  );

  // Sort by amount descending
  byCategory.sort((a, b) => b.amount.annualized - a.amount.annualized);

  // Get top 5 categories
  const topCategories = byCategory.slice(0, 5);

  // Calculate spending rate
  const spendingRate = incomeMetrics.net.annualized > 0
    ? (totalAnnualExpenses / incomeMetrics.net.annualized) * 100
    : 0;

  return {
    total: createPeriodizedAmount(totalAnnualExpenses, displayPeriod, currency),
    byCategory,
    topCategories,
    expenseCount: expenses.length,
    spendingRate,
  };
}

/**
 * Compute tax metrics
 */
export function computeTaxMetrics(
  input: FinanceMetricsInput,
  options: FinanceMetricsOptions,
  incomeMetrics: IncomeMetrics
): TaxMetrics {
  const { incomes, taxConfig } = input;
  const { displayPeriod } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Calculate pre-tax income
  const preTaxAnnualIncome = incomes
    .filter(i => i.taxStatus === 'preTax')
    .reduce((sum, i) => sum + toAnnual(i.amount, i.frequency), 0);

  // Calculate deductible amount
  const deductibleAmount = incomeMetrics.deductions.annualized;

  // Calculate taxable income
  const taxableIncome = taxConfig.includeDeductions
    ? Math.max(0, preTaxAnnualIncome - deductibleAmount)
    : preTaxAnnualIncome;

  // Calculate total tax
  const totalTax = taxConfig.enabled ? calculateTax(taxableIncome, taxConfig) : 0;

  // Calculate effective rate
  const effectiveRate = incomeMetrics.gross.annualized > 0
    ? (totalTax / incomeMetrics.gross.annualized) * 100
    : 0;

  // Calculate marginal rate
  let marginalRate = 0;
  if (taxConfig.enabled) {
    if (taxConfig.country === 'simple') {
      marginalRate = taxConfig.taxRate;
    } else {
      const taxSystem = getTaxSystem(taxConfig.country);
      const brackets = taxConfig.customBrackets ?? taxSystem.brackets;
      const applicableBracket = brackets.find(
        b => taxableIncome >= b.min && (b.max === null || taxableIncome <= b.max)
      );
      marginalRate = applicableBracket?.rate ?? 0;
    }
  }

  return {
    amount: createPeriodizedAmount(totalTax, displayPeriod, currency),
    effectiveRate,
    marginalRate,
    taxSystem: taxConfig.country,
    isEnabled: taxConfig.enabled,
    deductibleAmount: createPeriodizedAmount(deductibleAmount, displayPeriod, currency),
  };
}

/**
 * Compute savings metrics
 */
export function computeSavingsMetrics(
  input: FinanceMetricsInput,
  options: FinanceMetricsOptions,
  incomeMetrics: IncomeMetrics,
  expenseMetrics: ExpenseMetrics
): SavingsMetrics {
  const { taxConfig } = input;
  const { displayPeriod } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Calculate savings
  const annualSavings = incomeMetrics.net.annualized - expenseMetrics.total.annualized;

  // Calculate savings rate (as percentage of gross income)
  const savingsRate = incomeMetrics.gross.annualized > 0
    ? (annualSavings / incomeMetrics.gross.annualized) * 100
    : 0;

  // Determine savings status
  let status: SavingsStatus;
  if (savingsRate >= 20) status = 'excellent';
  else if (savingsRate >= 10) status = 'good';
  else if (savingsRate >= 0) status = 'fair';
  else status = 'poor';

  return {
    amount: createPeriodizedAmount(annualSavings, displayPeriod, currency),
    rate: savingsRate,
    status,
    statusColor: getSavingsStatusColor(status),
    projectedAnnual: createPeriodizedAmount(annualSavings, 'annually', currency),
  };
}

/**
 * Compute all finance metrics
 */
export function computeFinanceMetrics(
  input: FinanceMetricsInput,
  options: FinanceMetricsOptions
): FinanceMetrics {
  const { taxConfig } = input;
  const { displayPeriod } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Compute metrics in order (some depend on others)
  const incomeMetrics = computeIncomeMetrics(input, options);
  const expenseMetrics = computeExpenseMetrics(input, options, incomeMetrics);
  const taxMetrics = computeTaxMetrics(input, options, incomeMetrics);
  const savingsMetrics = computeSavingsMetrics(input, options, incomeMetrics, expenseMetrics);

  return {
    income: incomeMetrics,
    expenses: expenseMetrics,
    savings: savingsMetrics,
    tax: taxMetrics,
    displayPeriod,
    currency,
  };
}
