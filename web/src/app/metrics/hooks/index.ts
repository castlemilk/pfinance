/**
 * Metrics Hooks Index
 * 
 * Re-exports all metrics hooks.
 */

// Finance metrics hooks
export {
  useFinanceMetrics,
  useIncomeMetrics,
  useExpenseMetrics,
  useSavingsMetrics,
  useTaxMetrics,
  type UseFinanceMetricsOptions,
  type UseFinanceMetricsReturn,
} from './useFinanceMetrics';

// Budget metrics hooks
export {
  useBudgetMetrics,
  useSingleBudgetProgress,
  type UseBudgetMetricsOptions,
  type UseBudgetMetricsReturn,
} from './useBudgetMetrics';

// Extraction metrics hooks
export {
  useExtractionMetrics,
  type ExtractionMetricsData,
} from './useExtractionMetrics';

// Visualization data hooks
export {
  useVisualizationData,
  usePieChartData,
  useSankeyData,
  useSummaryCardsData,
  type UseVisualizationDataOptions,
  type UseVisualizationDataReturn,
} from './useVisualizationData';
