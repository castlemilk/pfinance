import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsPage from '../page';

const mockUseCategoryComparison = jest.fn((_includeBudgets?: boolean, _period?: string) => ({
  data: [
    {
      category: 'Food',
      currentValue: 320,
      previousValue: 240,
      maxValue: 320,
    },
  ],
  loading: false,
  error: null,
}));

jest.mock('../../../../components/ProFeatureGate', () => ({
  ProFeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UpgradePrompt: ({ feature }: { feature: string }) => <div>{feature} requires Pro</div>,
}));

jest.mock('../../../../context/FinanceContext', () => ({
  useFinance: () => ({ expenses: [] }),
}));

jest.mock('../../../../components/charts', () => ({
  LazySpendingHeatmap: () => <div data-testid="heatmap-chart" />,
  LazySpendingTrendChart: () => <div data-testid="trend-chart" />,
  LazyCategoryRadarChart: () => <div data-testid="radar-chart" />,
  LazyAnomalyScatterPlot: () => <div data-testid="anomaly-chart" />,
  LazyCashFlowForecast: () => <div data-testid="forecast-chart" />,
  LazyWaterfallChart: () => <div data-testid="waterfall-chart" />,
}));

jest.mock('../../../../metrics/hooks/useAnalyticsData', () => ({
  useHeatmapData: () => ({
    data: { days: [], maxValue: 0 },
    loading: false,
    error: null,
  }),
  useSpendingTrends: () => ({
    expenseSeries: [{ date: '2026-05-01', value: 42, valueCents: BigInt(4200), label: 'May 1' }],
    incomeSeries: [],
    trendSlope: 0,
    trendRSquared: 1,
    loading: false,
    error: null,
  }),
  useCategoryComparison: (includeBudgets: boolean, period: string) =>
    mockUseCategoryComparison(includeBudgets, period),
  useAnomalies: () => ({
    data: [],
    totalAnomalousSpend: 0,
    loading: false,
    error: null,
  }),
  useCashFlowForecast: () => ({
    incomeForecast: [],
    expenseForecast: [],
    netForecast: [],
    loading: false,
    error: null,
  }),
  useWaterfallData: () => ({
    data: [],
    loading: false,
    error: null,
  }),
}));

jest.mock('../../../../metrics/hooks/useExtractionMetrics', () => ({
  useExtractionMetrics: () => ({
    data: {
      totalExtractions: 0,
      totalTransactions: 0,
      averageConfidence: 0,
      correctionRate: 0,
      correctionsByField: {},
      correctionsByCategory: {},
      recentEvents: [],
    },
    loading: false,
    error: null,
  }),
}));

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mockUseCategoryComparison.mockClear();
  });

  it('includes a dedicated category spend over time view', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await user.click(screen.getByRole('tab', { name: 'Trends' }));

    expect(
      screen.getByRole('heading', { name: 'Category Spend Over Time' })
    ).toBeInTheDocument();
  });

  it('shows category analysis by default using a yearly comparison period', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await user.click(screen.getByRole('tab', { name: 'Categories' }));

    expect(screen.getByTestId('radar-chart')).toBeInTheDocument();
    expect(mockUseCategoryComparison).toHaveBeenCalledWith(true, 'year');
  });
});
