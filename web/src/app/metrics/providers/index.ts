/**
 * Metrics Providers Index
 * 
 * Re-exports all metric provider functions.
 */

// Finance metrics
export {
  computeFinanceMetrics,
  computeIncomeMetrics,
  computeExpenseMetrics,
  computeTaxMetrics,
  computeSavingsMetrics,
  type FinanceMetricsInput,
  type FinanceMetricsOptions,
} from './finance-metrics';

// Budget metrics
export {
  computeBudgetMetrics,
  computeBudgetProgressMetric,
  getBudgetMetricsForCategory,
  getMostConstrainedBudget,
  getAtRiskBudgets,
  type BudgetMetricsInput,
  type BudgetMetricsOptions,
} from './budget-metrics';

// Flow metrics
export {
  computeSankeyDiagramData,
  getNodesByType,
  getLinksForNode,
  calculateNodeFlow,
  type FlowMetricsInput,
  type FlowMetricsOptions,
} from './flow-metrics';
