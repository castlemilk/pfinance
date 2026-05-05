import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsPage from '../page';

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
  useCategoryComparison: () => ({
    data: [],
    loading: false,
    error: null,
  }),
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
  it('includes a dedicated category spend over time view', async () => {
    const user = userEvent.setup();
    render(<AnalyticsPage />);

    await user.click(screen.getByRole('tab', { name: 'Trends' }));

    expect(
      screen.getByRole('heading', { name: 'Category Spend Over Time' })
    ).toBeInTheDocument();
  });
});
