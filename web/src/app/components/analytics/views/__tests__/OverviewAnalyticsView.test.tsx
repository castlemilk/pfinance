import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { AnalyticsOverviewData } from '@/app/metrics/types';
import { useAnalyticsOverview } from '@/app/metrics/hooks/useAnalyticsOverview';
import {
  useAnomalies,
  useSpendingTrends,
  useWaterfallData,
} from '@/app/metrics/hooks/useAnalyticsData';
import { useGroupAnalyticsSummary } from '@/app/metrics/hooks/useGroupAnalyticsSummary';
import { AnalyticsAttentionSummary } from '../../AnalyticsAttentionSummary';
import { AnalyticsMetricStrip } from '../../AnalyticsMetricStrip';
import { OverviewAnalyticsView } from '../OverviewAnalyticsView';

import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsScope,
} from '../../types';

const mockTrendChart = jest.fn();
const mockWaterfallChart = jest.fn();

jest.mock('@/app/metrics/hooks/useAnalyticsOverview', () => ({
  useAnalyticsOverview: jest.fn(),
}));

jest.mock('@/app/metrics/hooks/useAnalyticsData', () => ({
  useAnomalies: jest.fn(),
  useSpendingTrends: jest.fn(),
  useWaterfallData: jest.fn(),
}));

jest.mock('@/app/metrics/hooks/useGroupAnalyticsSummary', () => ({
  useGroupAnalyticsSummary: jest.fn(),
}));

jest.mock('@/app/components/charts/LazySpendingTrendChart', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockTrendChart(props);
    return <div data-testid="trend-chart">Trend visual</div>;
  },
}));

jest.mock('@/app/components/charts/LazyWaterfallChart', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockWaterfallChart(props);
    return <div data-testid="waterfall-chart">Waterfall visual</div>;
  },
}));

const personalScope = { kind: 'personal' } as const satisfies AnalyticsScope;
const groupScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
} as const satisfies AnalyticsScope;

const formatMoney = jest.fn(
  (amount: number, compact = false) =>
    compact ? `AUD compact ${amount}` : `AUD ${amount.toFixed(2)}`
);
const formatDate = jest.fn((value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : `date ${date.toISOString().slice(0, 10)}`;
});
const currency: AnalyticsCurrencyContext = {
  locale: 'en-AU',
  currency: 'AUD',
  formatMoney,
  formatDate,
};

const overviewRefetch = jest.fn();
const trendRefetch = jest.fn();
const anomalyRefetch = jest.fn();
const waterfallRefetch = jest.fn();
const groupRefetch = jest.fn();

function overview(
  overrides: Partial<AnalyticsOverviewData> = {}
): AnalyticsOverviewData {
  return {
    currentStart: new Date('2026-07-01T00:00:00.000Z'),
    currentEnd: new Date('2026-07-31T23:59:59.999Z'),
    previousStart: new Date('2026-06-01T00:00:00.000Z'),
    previousEnd: new Date('2026-06-30T23:59:59.999Z'),
    currentIncome: 1_000,
    currentExpense: 600,
    currentNet: 400,
    previousIncome: 900,
    previousExpense: 650,
    previousNet: 250,
    savingsRate: 40,
    hasSavingsRate: true,
    incomeChange: 11.1,
    hasIncomeChange: true,
    expenseChange: -7.7,
    hasExpenseChange: true,
    largestCategory: 'Food',
    largestCategoryAmount: 250,
    currentTransactionCount: 8,
    previousTransactionCount: 7,
    hasCurrentData: true,
    ...overrides,
  };
}

const trendExpenseSeries = [
  { date: '2026-07-01', value: 120, valueCents: BigInt(12_000), label: '1 Jul' },
  { date: '2026-07-08', value: 180, valueCents: BigInt(18_000), label: '8 Jul' },
];
const trendIncomeSeries = [
  { date: '2026-07-01', value: 500, valueCents: BigInt(50_000), label: '1 Jul' },
];
const waterfallData = [
  {
    label: 'Income',
    amount: 1_000,
    type: 'income' as const,
    runningTotal: 1_000,
    color: 'var(--chart-2)',
  },
  {
    label: 'Food',
    amount: -250,
    type: 'expense' as const,
    runningTotal: 750,
    color: 'var(--chart-1)',
  },
];

const mockedOverview = useAnalyticsOverview as jest.Mock;
const mockedTrends = useSpendingTrends as jest.Mock;
const mockedAnomalies = useAnomalies as jest.Mock;
const mockedWaterfall = useWaterfallData as jest.Mock;
const mockedGroup = useGroupAnalyticsSummary as jest.Mock;

function setLoadedHooks(data: AnalyticsOverviewData = overview()) {
  mockedOverview.mockReturnValue({
    data,
    loading: false,
    error: null,
    refetch: overviewRefetch,
  });
  mockedTrends.mockReturnValue({
    expenseSeries: trendExpenseSeries,
    incomeSeries: trendIncomeSeries,
    trendSlope: 15,
    trendRSquared: 0.72,
    loading: false,
    error: null,
    refetch: trendRefetch,
  });
  mockedAnomalies.mockReturnValue({
    data: [],
    totalAnomalousSpend: 90.5,
    topCategory: 'Food',
    analyzedCount: 8,
    eligibleCount: 2,
    minimumSample: 5,
    hasSufficientHistory: true,
    categoryCoverage: [
      { category: 'Food', sampleCount: 6, hasSufficientHistory: true },
      { category: 'Travel', sampleCount: 2, hasSufficientHistory: false },
    ],
    primaryAttention: {
      expenseId: 'expense-7',
      description: 'Large market shop',
      reason: 'Higher than recent Food spending',
      amount: 90.5,
      expectedContext: 'Usually between AUD 20.00 and AUD 45.00',
      severity: 'high',
    },
    loading: false,
    error: null,
    refetch: anomalyRefetch,
  });
  mockedWaterfall.mockReturnValue({
    data: waterfallData,
    periodLabel: 'July 2026',
    loading: false,
    error: null,
    refetch: waterfallRefetch,
  });
  mockedGroup.mockReturnValue({
    data: null,
    loading: false,
    error: null,
    refetch: groupRefetch,
  });
}

function renderOverview(
  scope: AnalyticsScope = personalScope,
  period: AnalyticsPeriod = 'month'
) {
  return render(
    <OverviewAnalyticsView scope={scope} period={period} currency={currency} />
  );
}

describe('OverviewAnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLoadedHooks();
  });

  it('shows one chart-shaped overview skeleton and withholds stale metrics and deep hooks', () => {
    mockedOverview.mockReturnValue({
      data: overview(),
      loading: true,
      error: null,
      refetch: overviewRefetch,
    });

    renderOverview();

    expect(screen.getAllByTestId('analytics-chart-skeleton')).toHaveLength(1);
    expect(screen.queryByText('AUD 1000.00')).not.toBeInTheDocument();
    expect(mockedTrends).not.toHaveBeenCalled();
    expect(mockedAnomalies).not.toHaveBeenCalled();
    expect(mockedWaterfall).not.toHaveBeenCalled();
    expect(mockedGroup).not.toHaveBeenCalled();
    expect(mockTrendChart).not.toHaveBeenCalled();
    expect(mockWaterfallChart).not.toHaveBeenCalled();
  });

  it('gives the overview error exact retry ownership and never mounts deep hooks', async () => {
    const user = userEvent.setup();
    mockedOverview.mockReturnValue({
      data: overview(),
      loading: false,
      error: 'Overview is unavailable',
      refetch: overviewRefetch,
    });

    renderOverview();

    expect(screen.getByText('Overview is unavailable')).toBeInTheDocument();
    expect(screen.queryByText('AUD 1000.00')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(overviewRefetch).toHaveBeenCalledTimes(1);
    expect(trendRefetch).not.toHaveBeenCalled();
    expect(mockedTrends).not.toHaveBeenCalled();
  });

  it('treats null overview data as safely pending instead of crashing', () => {
    mockedOverview.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: overviewRefetch,
    });

    renderOverview();

    expect(screen.getByRole('status')).toHaveTextContent('Loading analytics overview');
    expect(screen.getAllByTestId('analytics-chart-skeleton')).toHaveLength(1);
    expect(mockedTrends).not.toHaveBeenCalled();
  });

  it.each([
    [0, 0, 'No activity for this period'],
    [500, 0, 'No spending for this period'],
    [0, 300, 'No income for this period'],
  ] as const)(
    'infers the truthful empty state for income %s and expenses %s',
    (currentIncome, currentExpense, heading) => {
      setLoadedHooks(
        overview({
          currentIncome,
          currentExpense,
          currentNet: currentIncome - currentExpense,
          hasCurrentData: false,
        })
      );

      renderOverview();

      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
      expect(mockedTrends).not.toHaveBeenCalled();
      expect(mockedAnomalies).not.toHaveBeenCalled();
      expect(mockedGroup).not.toHaveBeenCalled();
    }
  );

  it('passes authoritative sub-millisecond overview bounds to the group hook', () => {
    const currentStartTimestamp = {
      seconds: BigInt(1_782_864_000),
      nanos: 250_123_456,
    } as const;
    const currentEndTimestamp = {
      seconds: BigInt(1_785_542_399),
      nanos: 999_654_321,
    } as const;
    setLoadedHooks(
      overview({ currentStartTimestamp, currentEndTimestamp })
    );

    renderOverview(groupScope);

    expect(mockedGroup).toHaveBeenCalledWith({
      scope: groupScope,
      start: new Date('2026-07-01T00:00:00.000Z'),
      end: new Date('2026-07-31T23:59:59.999Z'),
      startTimestamp: currentStartTimestamp,
      endTimestamp: currentEndTimestamp,
      enabled: true,
    });
  });

  it('renders four decision metrics, explicit changes, and an authoritative driver link', () => {
    renderOverview();

    const strip = screen.getByRole('region', { name: 'Current period summary' });
    expect(within(strip).getAllByTestId('analytics-metric')).toHaveLength(4);
    expect(within(strip).getByText('Income')).toBeInTheDocument();
    expect(within(strip).getByText('AUD 1000.00')).toHaveClass('tabular-nums');
    expect(within(strip).getByText('Spending')).toBeInTheDocument();
    expect(within(strip).getByText('AUD 600.00')).toHaveClass('tabular-nums');
    expect(within(strip).getByText('Net')).toBeInTheDocument();
    expect(within(strip).getByText('AUD 400.00')).toHaveClass('tabular-nums');
    expect(within(strip).getByText('Savings rate')).toBeInTheDocument();
    expect(within(strip).getByText('40%')).toHaveClass('tabular-nums');
    expect(within(strip).getByText('Change: +11.1%')).toBeInTheDocument();
    expect(within(strip).getByText('Change: -7.7%')).toBeInTheDocument();

    expect(screen.getByText('Largest spending driver')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('AUD 250.00')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Review Food spending' })
    ).toHaveAttribute(
      'href',
      '/personal/expenses?category=food&from=2026-07-01&to=2026-07-31'
    );
    expect(formatMoney).toHaveBeenCalledWith(1_000);
    expect(mockedGroup).toHaveBeenCalledWith({
      scope: personalScope,
      start: new Date('2026-07-01T00:00:00.000Z'),
      end: new Date('2026-07-31T23:59:59.999Z'),
      enabled: false,
    });
    expect(document.body).not.toHaveTextContent('$');
  });

  it('uses Not available only when authoritative comparison flags are false', () => {
    setLoadedHooks(
      overview({
        incomeChange: 999,
        hasIncomeChange: false,
        expenseChange: 0,
        hasExpenseChange: true,
        savingsRate: 999,
        hasSavingsRate: false,
      })
    );

    renderOverview();

    const strip = screen.getByRole('region', { name: 'Current period summary' });
    expect(within(strip).getAllByText('Not available')).toHaveLength(2);
    expect(within(strip).getByText('Change: +0%')).toBeInTheDocument();
    expect(within(strip).queryByText(/999%/)).not.toBeInTheDocument();
  });

  it('uses locale-native percent signs, placement, and spacing', () => {
    const locale = 'de-DE';
    const localizedCurrency = { ...currency, locale };
    render(
      <OverviewAnalyticsView
        scope={personalScope}
        period="month"
        currency={localizedCurrency}
      />
    );

    const signedPercent = (value: number) =>
      new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 1,
        signDisplay: 'always',
      }).format(value / 100);
    const unsignedPercent = new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'auto',
    }).format(40 / 100);

    const metrics = screen.getAllByTestId('analytics-metric');
    expect(within(metrics[0]).getByText(/^Change:/).textContent).toBe(
      `Change: ${signedPercent(11.1)}`
    );
    expect(within(metrics[1]).getByText(/^Change:/).textContent).toBe(
      `Change: ${signedPercent(-7.7)}`
    );
    expect(
      within(metrics[3]).getByTestId('analytics-metric-value').textContent
    ).toBe(`Positive: ${unsignedPercent}`);
  });

  it.each([
    ['an unknown category', { largestCategory: 'Bespoke' }],
    ['a missing start bound', { currentStart: null }],
    ['a missing end bound', { currentEnd: null }],
    ['a zero-value driver', { largestCategoryAmount: 0 }],
    ['a non-finite driver', { largestCategoryAmount: Number.NaN }],
    [
      'reversed bounds',
      {
        currentStart: new Date('2026-08-01T00:00:00.000Z'),
        currentEnd: new Date('2026-07-31T23:59:59.999Z'),
      },
    ],
  ] as const)('does not fabricate a driver link for %s', (_, overrides) => {
    setLoadedHooks(overview(overrides));

    renderOverview();

    expect(
      screen.queryByRole('link', { name: /review .* spending/i })
    ).not.toBeInTheDocument();
  });

  it.each([
    ['month', 'week', 8, 90, 30],
    ['quarter', 'week', 16, 180, 90],
    ['year', 'month', 24, 365, 365],
  ] as const)(
    'maps %s to the exact supporting hook configuration',
    (period, granularity, trendPeriods, anomalyDays, waterfallDays) => {
      renderOverview(groupScope, period);

      expect(mockedTrends).toHaveBeenCalledWith(
        granularity,
        trendPeriods,
        undefined,
        groupScope
      );
      expect(mockedAnomalies).toHaveBeenCalledWith(
        anomalyDays,
        0.5,
        groupScope
      );
      expect(mockedWaterfall).toHaveBeenCalledWith(waterfallDays, groupScope);
      expect(mockedGroup).toHaveBeenCalledWith({
        scope: groupScope,
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-07-31T23:59:59.999Z'),
        enabled: true,
      });
    }
  );

  it('keeps supporting failures local and gives every retry to its owning hook', async () => {
    const user = userEvent.setup();
    mockedTrends.mockReturnValue({
      expenseSeries: trendExpenseSeries,
      incomeSeries: trendIncomeSeries,
      trendSlope: 15,
      trendRSquared: 0.72,
      loading: false,
      error: 'Trend failed',
      refetch: trendRefetch,
    });
    mockedAnomalies.mockReturnValue({
      data: null,
      totalAnomalousSpend: 0,
      categoryCoverage: [],
      primaryAttention: null,
      loading: false,
      error: 'Attention failed',
      refetch: anomalyRefetch,
    });
    mockedWaterfall.mockReturnValue({
      data: null,
      periodLabel: '',
      loading: false,
      error: 'Flow failed',
      refetch: waterfallRefetch,
    });
    mockedGroup.mockReturnValue({
      data: null,
      loading: false,
      error: 'Settlement failed',
      refetch: groupRefetch,
    });

    renderOverview(groupScope);

    expect(screen.getByText('AUD 1000.00')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Retry spending trend' }));
    expect(trendRefetch).toHaveBeenCalledTimes(1);
    expect(anomalyRefetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Retry spending attention' }));
    expect(anomalyRefetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry money flow' }));
    expect(waterfallRefetch).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Retry group settlement' }));
    expect(groupRefetch).toHaveBeenCalledTimes(1);
    expect(overviewRefetch).not.toHaveBeenCalled();
  });

  it('preserves successful siblings while supporting hooks load or settle empty', () => {
    mockedTrends.mockReturnValue({
      expenseSeries: [],
      incomeSeries: [],
      trendSlope: 0,
      trendRSquared: 0,
      loading: true,
      error: null,
      refetch: trendRefetch,
    });
    mockedAnomalies.mockReturnValue({
      data: [],
      totalAnomalousSpend: 0,
      categoryCoverage: [
        { category: 'Food', sampleCount: 7, hasSufficientHistory: true },
      ],
      primaryAttention: null,
      loading: false,
      error: null,
      refetch: anomalyRefetch,
    });
    mockedWaterfall.mockReturnValue({
      data: [],
      periodLabel: '',
      loading: false,
      error: null,
      refetch: waterfallRefetch,
    });

    renderOverview();

    expect(screen.getByText('AUD 1000.00')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading spending trend' })).toBeInTheDocument();
    expect(screen.getByText('No flagged spending')).toBeInTheDocument();
    expect(screen.getByText('No money-flow data is available yet.')).toBeInTheDocument();
  });

  it('renders labelled figures and data tables from the exact chart arrays', async () => {
    const user = userEvent.setup();
    renderOverview();

    const trendFigure = screen.getByRole('figure', { name: 'Spending trend' });
    expect(within(trendFigure).getByText('Weekly income and spending')).toBeInTheDocument();
    expect(mockTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseSeries: trendExpenseSeries,
        incomeSeries: trendIncomeSeries,
        trendSlope: 15,
        trendRSquared: 0.72,
        formatMoney,
        formatDate,
      })
    );
    await user.click(
      within(trendFigure).getByRole('button', { name: 'Show data table' })
    );
    const trendTable = within(trendFigure).getByRole('table', {
      name: 'Spending trend values',
    });
    expect(within(trendTable).getByText('date 2026-07-08')).toBeInTheDocument();
    expect(within(trendTable).getByText('AUD 180.00')).toBeInTheDocument();

    const waterfallFigure = screen.getByRole('figure', { name: 'Money flow' });
    expect(within(waterfallFigure).getByText('July 2026')).toBeInTheDocument();
    expect(mockWaterfallChart).toHaveBeenCalledWith({ data: waterfallData });
    await user.click(
      within(waterfallFigure).getByRole('button', { name: 'Show data table' })
    );
    const waterfallTable = within(waterfallFigure).getByRole('table', {
      name: 'Money flow values',
    });
    expect(within(waterfallTable).getByText('AUD -250.00')).toBeInTheDocument();
    expect(within(waterfallTable).getByText('AUD 750.00')).toBeInTheDocument();
  });

  it('renders authoritative group settlements in one divided member surface', () => {
    mockedGroup.mockReturnValue({
      data: {
        totalExpenses: 600,
        totalIncome: 1_000,
        unsettledExpenseCount: 2,
        unsettledAmount: 125.5,
        memberBalances: [
          {
            userId: 'member-credit',
            groupId: 'group-home',
            totalPaid: 400,
            totalOwed: 250,
            balance: 150,
            debts: [],
          },
          {
            userId: 'member-debit',
            groupId: 'group-home',
            totalPaid: 200,
            totalOwed: 350,
            balance: -150,
            debts: [],
          },
        ],
      },
      loading: false,
      error: null,
      refetch: groupRefetch,
    });

    renderOverview(groupScope);

    expect(screen.getByText('2 unsettled expenses')).toBeInTheDocument();
    expect(screen.getByText('AUD 125.50')).toBeInTheDocument();
    const balances = screen.getByRole('region', { name: 'Member balances' });
    expect(within(balances).getAllByTestId('member-balance')).toHaveLength(2);
    expect(within(balances).getByText('Member •••edit')).toBeInTheDocument();
    expect(within(balances).getByText('Member •••ebit')).toBeInTheDocument();
    expect(within(balances).queryByText('member-credit')).not.toBeInTheDocument();
    expect(within(balances).queryByText('member-debit')).not.toBeInTheDocument();
    expect(within(balances).getByText('Is owed')).toHaveClass('text-chart-2');
    expect(within(balances).getByText('Owes')).toHaveClass('text-destructive');
    expect(within(balances).getAllByText('AUD 150.00')).toHaveLength(2);
    expect(within(balances).getAllByText('AUD 400.00')).toHaveLength(1);
  });

  it('uses private duplicate-safe member labels without React key warnings', () => {
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    mockedGroup.mockReturnValue({
      data: {
        totalExpenses: 0,
        totalIncome: 0,
        unsettledExpenseCount: 0,
        unsettledAmount: 0,
        memberBalances: [
          {
            userId: 'opaque-user-1234',
            groupId: 'group-home',
            totalPaid: 0,
            totalOwed: 0,
            balance: 0,
            debts: [],
          },
          {
            userId: 'opaque-user-1234',
            groupId: 'group-home',
            totalPaid: 0,
            totalOwed: 0,
            balance: 0,
            debts: [],
          },
          {
            userId: '   ',
            groupId: 'group-home',
            totalPaid: 0,
            totalOwed: 0,
            balance: 0,
            debts: [],
          },
          {
            userId: '',
            groupId: 'group-home',
            totalPaid: 0,
            totalOwed: 0,
            balance: 0,
            debts: [],
          },
          {
            userId: 'xy',
            groupId: 'group-home',
            totalPaid: 0,
            totalOwed: 0,
            balance: 0,
            debts: [],
          },
        ],
      },
      loading: false,
      error: null,
      refetch: groupRefetch,
    });

    renderOverview(groupScope);

    expect(screen.getAllByText('Member •••1234')).toHaveLength(2);
    expect(screen.getByText('Member 3')).toBeInTheDocument();
    expect(screen.getByText('Member 4')).toBeInTheDocument();
    expect(screen.getByText('Member 5')).toBeInTheDocument();
    expect(screen.queryByText('opaque-user-1234')).not.toBeInTheDocument();
    expect(screen.queryByText('xy')).not.toBeInTheDocument();
    expect(
      consoleError.mock.calls.some((call) =>
        call.some(
          (value) =>
            typeof value === 'string' && value.includes('unique "key" prop')
        )
      )
    ).toBe(false);
    consoleError.mockRestore();
  });

  it('remounts the overview gate so a new period or group cannot flash old metrics or links', () => {
    function useKeySensitiveOverview(
      scope: AnalyticsScope,
      period: AnalyticsPeriod
    ) {
      const [data] = useState<AnalyticsOverviewData | null>(() =>
        scope.kind === 'personal' && period === 'month' ? overview() : null
      );
      return {
        data,
        loading: data === null,
        error: null,
        refetch: overviewRefetch,
      };
    }
    mockedOverview.mockImplementation(useKeySensitiveOverview);

    const { rerender } = renderOverview(personalScope, 'month');
    expect(screen.getByText('AUD 1000.00')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Food spending' })).toBeInTheDocument();

    rerender(
      <OverviewAnalyticsView
        scope={groupScope}
        period="quarter"
        currency={currency}
      />
    );

    expect(screen.queryByText('AUD 1000.00')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Review Food spending' })).not.toBeInTheDocument();
    expect(screen.getAllByTestId('analytics-chart-skeleton')).toHaveLength(1);
    expect(mockedTrends).toHaveBeenCalledTimes(1);
  });
});

describe('AnalyticsMetricStrip', () => {
  it('renders exactly four metrics in one tone-labelled divided surface', () => {
    const metrics = [
      {
        label: 'Income',
        value: 'AUD 123456789012345678901234567890.00',
        detail: 'Change: +5%',
        tone: 'positive',
      },
      { label: 'Spending', value: 'AUD 80.00', detail: 'Change: -2%', tone: 'attention' },
      { label: 'Net', value: 'AUD 20.00', detail: 'Income minus spending', tone: 'positive' },
      { label: 'Savings rate', value: '20%', detail: 'Share kept', tone: 'neutral' },
    ] as const;

    render(<AnalyticsMetricStrip metrics={metrics} />);

    const strip = screen.getByRole('region', { name: 'Current period summary' });
    expect(screen.getAllByTestId('analytics-metric-strip')).toHaveLength(1);
    expect(strip).toHaveClass('rounded-2xl');
    expect(within(strip).getAllByTestId('analytics-metric')).toHaveLength(4);
    within(strip)
      .getAllByTestId('analytics-metric-value')
      .forEach((value) => expect(value).toHaveClass('tabular-nums'));
    const longValue = within(strip).getByText(
      'AUD 123456789012345678901234567890.00'
    );
    expect(longValue).not.toHaveClass('truncate');
    expect(longValue).toHaveClass('[overflow-wrap:anywhere]', 'leading-tight');
    expect(within(strip).getByText('Change: +5%')).toHaveClass('tabular-nums');
    expect(within(strip).getByText('Change: -2%')).toHaveClass('tabular-nums');
    within(strip)
      .getAllByText(/^Positive/)
      .forEach((label) => expect(label).toHaveClass('sr-only'));
    expect(within(strip).getByText(/^Needs attention/)).toHaveClass('sr-only');
    expect(within(strip).getByText(/^Neutral/)).toHaveClass('sr-only');
  });
});

describe('AnalyticsAttentionSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders exact primary evidence, severity, totals, and expense-only deep link', () => {
    render(
      <AnalyticsAttentionSummary
        primary={{
          expenseId: ' expense-7 ',
          description: 'Large market shop',
          reason: 'Higher than recent Food spending',
          amount: 90.5,
          expectedContext: 'Usually AUD 20.00 to AUD 45.00',
          expectedLowerAmount: 20,
          expectedUpperAmount: 45,
          severity: 'high',
        }}
        anomalyCount={3}
        anomalousCents={12_345}
        coveredCategoryCount={1}
        uncoveredCategoryCount={1}
        formatMoney={formatMoney}
        attentionUrl="/shared/expenses?expenseId=expense-7"
      />
    );

    expect(screen.getByText('Large market shop')).toBeInTheDocument();
    expect(screen.getByText('Higher than recent Food spending')).toBeInTheDocument();
    expect(
      screen.getByText('Expected range: AUD 20.00 to AUD 45.00')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Usually AUD 20.00 to AUD 45.00')
    ).not.toBeInTheDocument();
    expect(screen.getByText('AUD 90.50')).toBeInTheDocument();
    expect(formatMoney).toHaveBeenCalledWith(20);
    expect(formatMoney).toHaveBeenCalledWith(45);
    expect(screen.getByText('High severity')).toBeInTheDocument();
    expect(screen.getByText('3 flagged transactions')).toBeInTheDocument();
    expect(screen.getByText('AUD 123.45 flagged')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This flag does not cover 1 category that still needs history.'
      )
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review expense' })).toHaveAttribute(
      'href',
      '/shared/expenses?expenseId=expense-7'
    );
  });

  it('qualifies zero-anomaly copy whenever category coverage is incomplete', () => {
    render(
      <AnalyticsAttentionSummary
        primary={null}
        anomalyCount={0}
        anomalousCents={0}
        coveredCategoryCount={1}
        uncoveredCategoryCount={2}
        formatMoney={formatMoney}
        attentionUrl={null}
      />
    );

    expect(screen.getByText('Assessment is incomplete')).toBeInTheDocument();
    expect(screen.getByText(/2 categories still need history/i)).toBeInTheDocument();
    expect(screen.queryByText(/all clear/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no flagged spending/i)).not.toBeInTheDocument();
  });

  it('only says no flagged spending for fully covered zero-anomaly results without claiming certainty', () => {
    render(
      <AnalyticsAttentionSummary
        primary={null}
        anomalyCount={0}
        anomalousCents={0}
        coveredCategoryCount={2}
        uncoveredCategoryCount={0}
        formatMoney={formatMoney}
        attentionUrl={null}
      />
    );

    expect(screen.getByText('No flagged spending')).toBeInTheDocument();
    expect(screen.getByText(/were flagged in categories with enough history/i)).toBeInTheDocument();
    expect(screen.queryByText(/normal|safe|all clear/i)).not.toBeInTheDocument();
  });

  it('does not render an action for a blank expense ID even when an URL is supplied', () => {
    render(
      <AnalyticsAttentionSummary
        primary={{
          expenseId: '   ',
          description: 'Unlinked item',
          reason: 'The identifier is unavailable',
          amount: 12,
          severity: 'medium',
        }}
        anomalyCount={1}
        anomalousCents={1_200}
        coveredCategoryCount={1}
        uncoveredCategoryCount={0}
        formatMoney={formatMoney}
        attentionUrl="/shared/expenses?expenseId=stale-id"
      />
    );

    expect(screen.queryByRole('link', { name: 'Review expense' })).not.toBeInTheDocument();
  });

  it('fails safely when anomalous cents or coverage counts are invalid', () => {
    render(
      <AnalyticsAttentionSummary
        primary={null}
        anomalyCount={1}
        anomalousCents={Number.NaN}
        coveredCategoryCount={Number.NaN}
        uncoveredCategoryCount={-2}
        formatMoney={formatMoney}
        attentionUrl={null}
      />
    );

    expect(screen.getByText('Not available flagged')).toBeInTheDocument();
    expect(screen.getByText(/no primary item was supplied/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('NaN');
  });
});
