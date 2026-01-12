/**
 * Metrics Layer
 * 
 * Public API for the metrics/visibility layer.
 * This module provides computed financial metrics and visualization-ready
 * data structures from raw financial data.
 */

// Types
export type {
  // Core metric types
  PeriodizedAmount,
  MetricConfig,
  MetricComputeContext,
  MetricUtils,
  ComputedMetric,
  MetricsInput,
  MetricsOptions,
  IMetricsEngine,
  
  // Finance metrics
  IncomeSourceMetric,
  IncomeMetrics,
  CategoryExpenseMetric,
  ExpenseMetrics,
  SavingsStatus,
  SavingsMetrics,
  TaxMetrics,
  FinanceMetrics,
  
  // Budget metrics
  BudgetProgressMetric,
  BudgetMetrics,
  
  // Visualization data
  PieChartData,
  SankeyNode,
  SankeyLink,
  SankeyDiagramData,
  SummaryCardData,
  TimeSeriesPoint,
  VisualizationData,
  
  // Context
  MetricsContextValue,
} from './types';

// Engine
export { MetricsEngine, metricsEngine, createMetricUtils } from './engine';

// Providers
export {
  computeFinanceMetrics,
  computeIncomeMetrics,
  computeExpenseMetrics,
  computeTaxMetrics,
  computeSavingsMetrics,
  computeBudgetMetrics,
  computeBudgetProgressMetric,
  computeSankeyDiagramData,
  getNodesByType,
  getLinksForNode,
  calculateNodeFlow,
} from './providers';

// Hooks
export {
  useFinanceMetrics,
  useIncomeMetrics,
  useExpenseMetrics,
  useSavingsMetrics,
  useTaxMetrics,
  useBudgetMetrics,
  useSingleBudgetProgress,
  useVisualizationData,
  usePieChartData,
  useSankeyData,
  useSummaryCardsData,
} from './hooks';

// Utils
export {
  // Period utilities
  toAnnual,
  fromAnnual,
  convertPeriod,
  getPeriodLabel,
  getShortPeriodLabel,
  getPeriodsPerYear,
  getDaysInPeriod,
  
  // Currency utilities
  formatCurrency,
  formatPercentage,
  getCurrencyForCountry,
  getCurrencySymbol,
  parseCurrency,
  
  // Color utilities
  CATEGORY_COLORS,
  getCategoryColor,
  INCOME_COLORS,
  getIncomeColor,
  EXPENSE_FLOW_COLORS,
  SAVINGS_COLORS,
  TAX_COLOR,
  SAVINGS_STATUS_COLORS,
  getSavingsStatusColor,
  SAVINGS_STATUS_CLASSES,
  getSavingsStatusClass,
  getBudgetUtilizationColor,
  generateColorScale,
  lightenColor,
  darkenColor,
} from './utils';
