/**
 * Budget Metrics Provider
 * 
 * Provides computation functions for budget-related metrics:
 * - Budget progress (spent, remaining, utilization)
 * - Category budget tracking
 * - Projections and warnings
 */

import { 
  ExpenseCategory,
  IncomeFrequency,
  TaxConfig,
  Expense
} from '../../types';
import { Budget, BudgetPeriod, BudgetProgress } from '@/gen/pfinance/v1/types_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import {
  BudgetProgressMetric,
  BudgetMetrics,
  PeriodizedAmount,
} from '../types';
import { getDaysInPeriod } from '../utils/period';
import { formatCurrency, getCurrencyForCountry } from '../utils/currency';
import { getBudgetUtilizationColor } from '../utils/colors';

/**
 * Input for budget metrics computation
 */
export interface BudgetMetricsInput {
  budgets: Budget[];
  budgetProgresses: Map<string, BudgetProgress>;
  expenses: Expense[];
  taxConfig: TaxConfig;
}

/**
 * Options for budget metrics computation
 */
export interface BudgetMetricsOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
  /** Current date for progress calculations */
  asOfDate?: Date;
}

/**
 * Create a PeriodizedAmount from an amount and period
 */
function createPeriodizedAmount(
  amount: number,
  displayPeriod: IncomeFrequency,
  currency: string
): PeriodizedAmount {
  // For budget amounts, we assume they're already in their budget period
  // and need to be converted to display period
  return {
    value: amount,
    period: displayPeriod,
    annualized: amount * getAnnualMultiplier(displayPeriod),
    formatted: formatCurrency(amount, currency),
  };
}

/**
 * Get the annual multiplier for a given frequency
 */
function getAnnualMultiplier(frequency: IncomeFrequency): number {
  switch (frequency) {
    case 'weekly': return 52;
    case 'fortnightly': return 26;
    case 'monthly': return 12;
    case 'annually': return 1;
    default: return 1;
  }
}

/**
 * Convert budget period to income frequency
 */
function budgetPeriodToFrequency(period: BudgetPeriod): IncomeFrequency {
  switch (period) {
    case BudgetPeriod.WEEKLY: return 'weekly';
    case BudgetPeriod.FORTNIGHTLY: return 'fortnightly';
    case BudgetPeriod.MONTHLY: return 'monthly';
    case BudgetPeriod.YEARLY: return 'annually';
    default: return 'monthly';
  }
}

/**
 * Calculate days remaining in current budget period
 */
function calculateDaysRemaining(budget: Budget, asOfDate: Date): number {
  if (!budget.startDate) {
    return 0;
  }

  const startDate = timestampDate(budget.startDate);
  const periodDays = getDaysInPeriod(budgetPeriodToFrequency(budget.period));
  
  // Calculate current period start
  const daysSinceStart = Math.floor(
    (asOfDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const periodsElapsed = Math.floor(daysSinceStart / periodDays);
  const currentPeriodStart = new Date(startDate);
  currentPeriodStart.setDate(currentPeriodStart.getDate() + periodsElapsed * periodDays);
  
  // Calculate days until next period
  const daysIntoPeriod = Math.floor(
    (asOfDate.getTime() - currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return Math.max(0, periodDays - daysIntoPeriod);
}

/**
 * Calculate projected end-of-period spend
 */
function calculateProjectedSpend(
  currentSpent: number,
  budgetAmount: number,
  daysRemaining: number,
  totalPeriodDays: number
): number {
  if (totalPeriodDays <= 0) return currentSpent;
  
  const daysElapsed = totalPeriodDays - daysRemaining;
  if (daysElapsed <= 0) return currentSpent;
  
  const dailySpendRate = currentSpent / daysElapsed;
  return dailySpendRate * totalPeriodDays;
}

/**
 * Compute metrics for a single budget
 */
export function computeBudgetProgressMetric(
  budget: Budget,
  progress: BudgetProgress | undefined,
  options: BudgetMetricsOptions
): BudgetProgressMetric {
  const { displayPeriod, asOfDate = new Date() } = options;
  const currency = options.currency ?? 'USD';

  const spentAmount = progress?.spentAmount ?? 0;
  const remainingAmount = Math.max(0, budget.amount - spentAmount);
  const utilizationPercent = budget.amount > 0 
    ? (spentAmount / budget.amount) * 100 
    : 0;
  const isExceeded = spentAmount > budget.amount;

  // Calculate days remaining
  const daysRemaining = calculateDaysRemaining(budget, asOfDate);
  const periodDays = getDaysInPeriod(budgetPeriodToFrequency(budget.period));

  // Calculate projected spend
  const projectedSpend = calculateProjectedSpend(
    spentAmount,
    budget.amount,
    daysRemaining,
    periodDays
  );

  // Convert ExpenseCategory enum values to actual categories
  const categories = (budget.categoryIds || []).map(catId => {
    // Map protobuf enum to string category
    const categoryMap: Record<number, ExpenseCategory> = {
      1: 'Food',
      2: 'Housing',
      3: 'Transportation',
      4: 'Entertainment',
      5: 'Healthcare',
      6: 'Utilities',
      7: 'Shopping',
      8: 'Education',
      9: 'Travel',
      10: 'Other',
    };
    return categoryMap[catId] ?? 'Other';
  });

  return {
    budgetId: budget.id,
    budgetName: budget.name,
    limit: createPeriodizedAmount(budget.amount, displayPeriod, currency),
    spent: createPeriodizedAmount(spentAmount, displayPeriod, currency),
    remaining: createPeriodizedAmount(remainingAmount, displayPeriod, currency),
    utilizationPercent,
    isExceeded,
    daysRemaining,
    projectedSpend: createPeriodizedAmount(projectedSpend, displayPeriod, currency),
    categories,
    statusColor: getBudgetUtilizationColor(utilizationPercent),
  };
}

/**
 * Compute all budget metrics
 */
export function computeBudgetMetrics(
  input: BudgetMetricsInput,
  options: BudgetMetricsOptions
): BudgetMetrics {
  const { budgets, budgetProgresses, taxConfig } = input;
  const { displayPeriod } = options;
  const currency = options.currency ?? getCurrencyForCountry(taxConfig.country);

  // Filter to active budgets only
  const activeBudgets = budgets.filter(b => b.isActive);

  // Compute metrics for each budget
  const budgetMetrics: BudgetProgressMetric[] = activeBudgets.map(budget => {
    const progress = budgetProgresses.get(budget.id);
    return computeBudgetProgressMetric(budget, progress, { ...options, currency });
  });

  // Calculate totals
  let totalBudgeted = 0;
  let totalSpent = 0;
  let exceededCount = 0;
  let onTrackCount = 0;

  budgetMetrics.forEach(metric => {
    totalBudgeted += metric.limit.value;
    totalSpent += metric.spent.value;
    
    if (metric.isExceeded) {
      exceededCount++;
    } else if (metric.utilizationPercent < 90) {
      onTrackCount++;
    }
  });

  const totalRemaining = Math.max(0, totalBudgeted - totalSpent);
  const overallUtilization = totalBudgeted > 0 
    ? (totalSpent / totalBudgeted) * 100 
    : 0;

  return {
    budgets: budgetMetrics,
    totalBudgeted: createPeriodizedAmount(totalBudgeted, displayPeriod, currency),
    totalSpent: createPeriodizedAmount(totalSpent, displayPeriod, currency),
    totalRemaining: createPeriodizedAmount(totalRemaining, displayPeriod, currency),
    overallUtilization,
    exceededCount,
    onTrackCount,
  };
}

/**
 * Get budget metrics for a specific category
 */
export function getBudgetMetricsForCategory(
  budgetMetrics: BudgetMetrics,
  category: ExpenseCategory
): BudgetProgressMetric[] {
  return budgetMetrics.budgets.filter(
    budget => budget.categories.includes(category)
  );
}

/**
 * Get the most constrained budget (highest utilization)
 */
export function getMostConstrainedBudget(
  budgetMetrics: BudgetMetrics
): BudgetProgressMetric | null {
  if (budgetMetrics.budgets.length === 0) return null;
  
  return budgetMetrics.budgets.reduce((most, current) => 
    current.utilizationPercent > most.utilizationPercent ? current : most
  );
}

/**
 * Get budgets that are at risk of being exceeded
 */
export function getAtRiskBudgets(
  budgetMetrics: BudgetMetrics,
  threshold: number = 80
): BudgetProgressMetric[] {
  return budgetMetrics.budgets.filter(
    budget => budget.utilizationPercent >= threshold && !budget.isExceeded
  );
}
