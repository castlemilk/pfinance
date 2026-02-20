/**
 * Metrics Layer Type Definitions
 * 
 * This file defines the core types for the metrics/visibility layer,
 * which provides computed financial metrics and visualization-ready data
 * structures from raw financial data.
 */

import { 
  ExpenseCategory, 
  ExpenseFrequency,
  IncomeFrequency, 
  TaxCountry, 
  TaxConfig,
  Income,
  Expense
} from '../types';

// ============================================================================
// Core Metric Types
// ============================================================================

/**
 * Represents a monetary amount that can be displayed in different time periods
 */
export interface PeriodizedAmount {
  /** The amount in the requested display period */
  value: number;
  /** The period this amount represents */
  period: IncomeFrequency;
  /** The annual equivalent of this amount */
  annualized: number;
  /** Formatted string representation */
  formatted: string;
}

/**
 * Configuration for a metric computation
 */
export interface MetricConfig<T = unknown> {
  /** Unique identifier for this metric */
  id: string;
  /** Human-readable name */
  name: string;
  /** Dependencies on other metrics (for compute order) */
  dependencies: string[];
  /** The computation function */
  compute: (context: MetricComputeContext) => T;
  /** Optional description */
  description?: string;
}

/**
 * Context passed to metric compute functions
 */
export interface MetricComputeContext {
  // Raw data
  incomes: Income[];
  expenses: Expense[];
  taxConfig: TaxConfig;
  
  // Display preferences
  displayPeriod: IncomeFrequency;
  currency: string;
  
  // Utility functions
  utils: MetricUtils;
  
  // Access to other computed metrics
  getMetric: <T>(metricId: string) => T | undefined;
}

/**
 * Utility functions available to metric computations
 */
export interface MetricUtils {
  /** Convert an amount to annual equivalent */
  toAnnual: (amount: number, frequency: IncomeFrequency | ExpenseFrequency) => number;
  /** Convert an annual amount to a specific frequency */
  fromAnnual: (annualAmount: number, targetFrequency: IncomeFrequency) => number;
  /** Format a number as currency */
  formatCurrency: (amount: number, currency?: string) => string;
  /** Format a number as percentage */
  formatPercentage: (value: number, decimals?: number) => string;
  /** Calculate tax for an amount using current tax config */
  calculateTax: (amount: number, taxConfig: TaxConfig) => number;
  /** Create a PeriodizedAmount from an annual value */
  periodize: (annualAmount: number, displayPeriod: IncomeFrequency, currency?: string) => PeriodizedAmount;
}

/**
 * A computed metric result with metadata
 */
export interface ComputedMetric<T> {
  /** The computed value */
  value: T;
  /** When this metric was computed */
  computedAt: number;
  /** Whether the metric is stale and needs recomputation */
  isStale: boolean;
}

// ============================================================================
// Finance Metrics Types
// ============================================================================

/**
 * Metrics for a single income source
 */
export interface IncomeSourceMetric {
  id: string;
  source: string;
  amount: PeriodizedAmount;
  isPreTax: boolean;
  taxContribution: PeriodizedAmount;
  netContribution: PeriodizedAmount;
  percentageOfTotal: number;
  color: string;
}

/**
 * Aggregated income metrics
 */
export interface IncomeMetrics {
  /** Total gross income */
  gross: PeriodizedAmount;
  /** Total net income (after tax) */
  net: PeriodizedAmount;
  /** Individual income sources */
  sources: IncomeSourceMetric[];
  /** Total deductions amount */
  deductions: PeriodizedAmount;
  /** Number of income sources */
  sourceCount: number;
}

/**
 * Metrics for a single expense category
 */
export interface CategoryExpenseMetric {
  category: ExpenseCategory;
  amount: PeriodizedAmount;
  percentageOfTotal: number;
  percentageOfIncome: number;
  expenseCount: number;
  color: string;
}

/**
 * Aggregated expense metrics
 */
export interface ExpenseMetrics {
  /** Total expenses */
  total: PeriodizedAmount;
  /** Expenses by category */
  byCategory: CategoryExpenseMetric[];
  /** Top N categories by amount */
  topCategories: CategoryExpenseMetric[];
  /** Total number of expense entries */
  expenseCount: number;
  /** Percentage of net income spent */
  spendingRate: number;
}

/**
 * Savings status indicator
 */
export type SavingsStatus = 'excellent' | 'good' | 'fair' | 'poor';

/**
 * Savings metrics
 */
export interface SavingsMetrics {
  /** Net savings amount (income - expenses - tax) */
  amount: PeriodizedAmount;
  /** Savings as percentage of gross income */
  rate: number;
  /** Qualitative assessment of savings rate */
  status: SavingsStatus;
  /** Color associated with status */
  statusColor: string;
  /** Projected annual savings */
  projectedAnnual: PeriodizedAmount;
}

/**
 * Tax metrics
 */
export interface TaxMetrics {
  /** Total tax amount */
  amount: PeriodizedAmount;
  /** Effective tax rate (actual percentage paid) */
  effectiveRate: number;
  /** Marginal tax rate (rate on next dollar) */
  marginalRate: number;
  /** Tax system being used */
  taxSystem: TaxCountry;
  /** Whether tax is enabled */
  isEnabled: boolean;
  /** Tax-deductible amount */
  deductibleAmount: PeriodizedAmount;
}

/**
 * Complete finance metrics object
 */
export interface FinanceMetrics {
  income: IncomeMetrics;
  expenses: ExpenseMetrics;
  savings: SavingsMetrics;
  tax: TaxMetrics;
  /** Display period for all amounts */
  displayPeriod: IncomeFrequency;
  /** Currency code */
  currency: string;
}

// ============================================================================
// Budget Metrics Types
// ============================================================================

/**
 * Progress metrics for a single budget
 */
export interface BudgetProgressMetric {
  budgetId: string;
  budgetName: string;
  /** Budget limit amount */
  limit: PeriodizedAmount;
  /** Amount spent so far */
  spent: PeriodizedAmount;
  /** Amount remaining */
  remaining: PeriodizedAmount;
  /** Utilization percentage (0-100+) */
  utilizationPercent: number;
  /** Whether budget is exceeded */
  isExceeded: boolean;
  /** Days remaining in budget period */
  daysRemaining: number;
  /** Projected end-of-period spend */
  projectedSpend: PeriodizedAmount;
  /** Categories this budget tracks */
  categories: ExpenseCategory[];
  /** Status color */
  statusColor: string;
}

/**
 * Aggregated budget metrics
 */
export interface BudgetMetrics {
  /** All budget progress metrics */
  budgets: BudgetProgressMetric[];
  /** Total budgeted amount */
  totalBudgeted: PeriodizedAmount;
  /** Total spent across all budgets */
  totalSpent: PeriodizedAmount;
  /** Total remaining across all budgets */
  totalRemaining: PeriodizedAmount;
  /** Overall utilization percentage */
  overallUtilization: number;
  /** Number of exceeded budgets */
  exceededCount: number;
  /** Number of budgets on track */
  onTrackCount: number;
}

// ============================================================================
// Visualization Data Types
// ============================================================================

/**
 * Data point for pie/donut charts
 */
export interface PieChartData {
  id: string;
  label: string;
  value: number;
  percentage: number;
  color: string;
  formattedValue: string;
}

/**
 * Node in a Sankey diagram
 */
export interface SankeyNode {
  id: string;
  name: string;
  type: 'income' | 'tax' | 'expense-category' | 'expense-subcategory' | 'savings-category' | 'savings-subcategory';
  amount: number;
  percentage: number;
  color: string;
  formattedAmount: string;
}

/**
 * Link in a Sankey diagram
 */
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  percentage: number;
  color: string;
  sourceName: string;
  targetName: string;
}

/**
 * Complete Sankey diagram data
 */
export interface SankeyDiagramData {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Period label for display */
  periodLabel: string;
}

/**
 * Data for a summary card
 */
export interface SummaryCardData {
  id: string;
  title: string;
  value: string;
  subtitle?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
    isPositive: boolean;
  };
  color?: string;
  icon?: string;
}

/**
 * Time series data point
 */
export interface TimeSeriesPoint {
  date: Date;
  value: number;
  label?: string;
}

/**
 * Complete visualization data object
 */
export interface VisualizationData {
  /** Data for expense pie/donut chart */
  expensePieChart: PieChartData[];
  /** Data for income pie/donut chart */
  incomePieChart: PieChartData[];
  /** Data for Sankey flow diagram */
  sankeyDiagram: SankeyDiagramData;
  /** Data for summary cards */
  summaryCards: SummaryCardData[];
  /** Historical trend data */
  trendData: TimeSeriesPoint[];
  /** Display period */
  displayPeriod: IncomeFrequency;
}

// ============================================================================
// Metrics Engine Types
// ============================================================================

/**
 * Raw data input for the metrics engine
 */
export interface MetricsInput {
  incomes: Income[];
  expenses: Expense[];
  taxConfig: TaxConfig;
}

/**
 * Options for metrics computation
 */
export interface MetricsOptions {
  displayPeriod: IncomeFrequency;
  currency?: string;
  locale?: string;
}

/**
 * Metrics engine interface
 */
export interface IMetricsEngine {
  /** Compute all metrics */
  computeAll(input: MetricsInput, options: MetricsOptions): {
    finance: FinanceMetrics;
    visualization: VisualizationData;
  };
  
  /** Register a custom metric */
  register<T>(config: MetricConfig<T>): void;
  
  /** Get a computed metric by ID */
  getMetric<T>(id: string): T | undefined;
  
  /** Clear cached computations */
  invalidate(): void;
}

// ============================================================================
// Context Types
// ============================================================================

/**
 * Value provided by MetricsContext
 */
export interface MetricsContextValue {
  /** Current display period */
  displayPeriod: IncomeFrequency;
  /** Update display period */
  setDisplayPeriod: (period: IncomeFrequency) => void;
  
  /** Computed finance metrics */
  financeMetrics: FinanceMetrics | null;
  
  /** Computed visualization data */
  visualizationData: VisualizationData | null;
  
  /** Budget metrics (when available) */
  budgetMetrics: BudgetMetrics | null;
  
  /** Whether metrics are being computed */
  isComputing: boolean;
  
  /** Force recomputation */
  recompute: () => void;
  
  /** Access to utility functions */
  utils: MetricUtils;
}

// ============================================================================
// Analytics Visualization Types
// ============================================================================

/**
 * Per-category amount for heatmap tooltip breakdown
 */
export interface HeatmapCategoryAmount {
  category: string;
  amount: number;
  count: number;
}

/**
 * Heatmap day data for calendar heatmap visualization
 */
export interface HeatmapDay {
  date: string;
  value: number;
  count: number;
  categories?: HeatmapCategoryAmount[];
}

/**
 * Aggregated heatmap data
 */
export interface HeatmapData {
  days: HeatmapDay[];
  maxValue: number;
}

/**
 * Radar chart axis data for category comparison
 */
export interface RadarAxis {
  category: string;
  currentValue: number;
  previousValue: number;
  budgetValue?: number;
  maxValue: number;
}

/**
 * Anomaly point for scatter plot visualization
 */
export interface AnomalyPoint {
  id: string;
  expenseId: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  zScore: number;
  expectedAmount: number;
  anomalyType: string;
  severity: 'low' | 'medium' | 'high';
}

/**
 * Forecast data series for cash flow forecast
 */
export interface ForecastSeries {
  date: Date;
  predicted: number;
  lowerBound: number;
  upperBound: number;
}

/**
 * Waterfall bar data for income-to-savings flow
 */
export interface WaterfallBar {
  label: string;
  amount: number;
  type: 'income' | 'expense' | 'tax' | 'savings' | 'subtotal';
  runningTotal: number;
  color: string;
}
