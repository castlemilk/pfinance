import React, { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useAnomalies } from '@/app/metrics/hooks/useAnalyticsData';

import { AttentionAnalyticsView } from '../AttentionAnalyticsView';

import type { AnomalyPoint } from '@/app/metrics/types';
import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsScope,
} from '../../types';

const mockChart = jest.fn();

jest.mock('@/app/metrics/hooks/useAnalyticsData', () => ({
  useAnomalies: jest.fn(),
}));

jest.mock('@/app/components/charts/LazyAnomalyScatterPlot', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockChart(props);
    return <div data-testid="anomaly-chart">Anomaly chart</div>;
  },
}));

jest.mock('@radix-ui/react-slider', () => ({
  Root: ({
    children,
    onValueChange,
    onValueCommit,
  }: {
    children: React.ReactNode;
    onValueChange?: (value: number[]) => void;
    onValueCommit?: (value: number[]) => void;
  }) => (
    <div>
      {children}
      <button type="button" onClick={() => onValueChange?.([0.8])}>
        Preview 0.8
      </button>
      <button type="button" onClick={() => onValueCommit?.([0.8])}>
        Commit 0.8
      </button>
    </div>
  ),
  Track: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Range: () => <div />,
  Thumb: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div role="slider" aria-valuenow={0.5} {...props} />
  ),
}));

const personalScope = { kind: 'personal' } as const satisfies AnalyticsScope;
const groupScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
} as const satisfies AnalyticsScope;
const blankNameGroupScope = {
  kind: 'group',
  groupId: 'group-blank',
  groupName: '   ',
} as const satisfies AnalyticsScope;

const formatMoney = jest.fn((amount: number) => `AUD ${amount.toFixed(2)}`);
const formatDate = jest.fn((value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `date ${date.toISOString().slice(0, 10)}`;
});
const currency: AnalyticsCurrencyContext = {
  locale: 'en-AU',
  currency: 'AUD',
  formatMoney,
  formatDate,
};

const refetch = jest.fn();
const mockedAnomalies = useAnomalies as jest.Mock;

function point(overrides: Partial<AnomalyPoint> = {}): AnomalyPoint {
  return {
    id: 'anomaly-1',
    expenseId: 'expense-1',
    description: 'Large grocery shop',
    amount: 120,
    category: 'Food',
    date: new Date('2026-07-01T00:00:00.000Z'),
    zScore: 2.5,
    expectedAmount: 50,
    expectedLowerAmount: 30,
    expectedUpperAmount: 70,
    hasExpectedRange: true,
    anomalyType: 'amount_outlier',
    severity: 'medium',
    ...overrides,
  };
}

function anomalyResult(overrides: Record<string, unknown> = {}) {
  return {
    data: [point()],
    totalAnomalousSpend: 120,
    topCategory: 'Food',
    analyzedCount: 25,
    eligibleCount: 2,
    minimumSample: 10,
    hasSufficientHistory: true,
    categoryCoverage: [
      { category: 'Food', sampleCount: 15, hasSufficientHistory: true },
      { category: 'Travel', sampleCount: 4, hasSufficientHistory: false },
    ],
    primaryAttention: null,
    loading: false,
    error: null,
    refetch,
    ...overrides,
  };
}

function renderView(
  scope: AnalyticsScope = personalScope,
  period: AnalyticsPeriod = 'month'
) {
  return render(
    <AttentionAnalyticsView scope={scope} period={period} currency={currency} />
  );
}

describe('AttentionAnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAnomalies.mockReturnValue(anomalyResult());
  });

  it.each([
    ['month', 90],
    ['quarter', 180],
    ['year', 365],
  ] as const)('maps the %s period to a %i-day scoped request', (period, days) => {
    renderView(groupScope, period);
    expect(mockedAnomalies).toHaveBeenLastCalledWith(days, 0.5, groupScope);
  });

  it('previews sensitivity accessibly and commits the request parameter only once', () => {
    renderView();

    const slider = screen.getByRole('slider', { name: 'Sensitivity' });
    expect(slider).toHaveAttribute('aria-valuetext', '0.5 sensitivity');
    expect(screen.getByText('0.5')).toHaveClass('tabular-nums');
    expect(mockedAnomalies).toHaveBeenLastCalledWith(90, 0.5, personalScope);

    fireEvent.click(screen.getByRole('button', { name: 'Preview 0.8' }));
    expect(screen.getByRole('slider')).toHaveAttribute(
      'aria-valuetext',
      '0.8 sensitivity'
    );
    expect(screen.getByText('0.8')).toBeInTheDocument();
    expect(mockedAnomalies).toHaveBeenLastCalledWith(90, 0.5, personalScope);

    fireEvent.click(screen.getByRole('button', { name: 'Commit 0.8' }));
    expect(mockedAnomalies).toHaveBeenLastCalledWith(90, 0.8, personalScope);
  });

  it('deduplicates exact chart, list, table, and total evidence without mutating input', () => {
    const source = Object.freeze([
      Object.freeze(point({ id: 'lower', severity: 'low', amount: 30, zScore: 9 })),
      Object.freeze(point({ id: 'higher', severity: 'high', amount: 75, zScore: 2 })),
      Object.freeze(
        point({
          id: 'second',
          expenseId: 'expense-2',
          description: 'Taxi',
          amount: -5,
          hasExpectedRange: false,
          anomalyType: 'new_merchant',
        })
      ),
    ]);
    mockedAnomalies.mockReturnValue(anomalyResult({ data: source }));

    renderView();

    expect(screen.getByText('AUD 70.00')).toHaveClass('tabular-nums');
    expect(screen.getAllByText('Large grocery shop')).toHaveLength(1);
    expect(screen.getAllByText('Taxi')).toHaveLength(1);
    expect(mockChart).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ id: 'higher', amount: 75 }),
          expect.objectContaining({ id: 'second', amount: -5 }),
        ]),
        formatMoney,
        formatDate,
      })
    );
    const chartPoints = (mockChart.mock.calls.at(-1)?.[0] as { data: AnomalyPoint[] }).data;
    expect(chartPoints).toHaveLength(2);
    expect(source[0].amount).toBe(30);

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Show Flagged spending evidence data table',
      })
    );
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it.each([
    [personalScope, '/personal/expenses?expenseId=expense-1'],
    [groupScope, '/shared/expenses?expenseId=expense-1'],
  ] as const)('uses exact scoped expense links for %o', (scope, href) => {
    mockedAnomalies.mockReturnValue(
      anomalyResult({
        data: [point(), point({ id: 'blank', expenseId: '   ', description: 'No stable id' })],
      })
    );
    renderView(scope);

    expect(
      screen.getByRole('link', { name: 'Review Large grocery shop' })
    ).toHaveAttribute('href', href);
    expect(screen.queryByRole('link', { name: 'Review No stable id' })).not.toBeInTheDocument();
    expect(screen.getByText('Review No stable id')).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows only valid expected ranges and uses reason-specific fallback copy', () => {
    mockedAnomalies.mockReturnValue(
      anomalyResult({
        data: [
          point(),
          point({
            id: 'bad-range',
            expenseId: 'expense-2',
            description: 'New cafe',
            hasExpectedRange: true,
            expectedLowerAmount: 90,
            expectedUpperAmount: 10,
            anomalyType: 'new_merchant',
          }),
        ],
      })
    );
    renderView();

    expect(screen.getByText('Expected AUD 30.00 to AUD 70.00')).toBeInTheDocument();
    expect(screen.getByText(/new merchant.*no expected amount range applies/i)).toBeInTheDocument();
    expect(screen.queryByText(/AUD 90\.00.*AUD 10\.00/)).not.toBeInTheDocument();
  });

  it('puts qualified coverage before populated evidence and names undersampled categories', () => {
    renderView();
    const coverage = screen.getByRole('region', { name: 'Spending check coverage' });
    const figure = screen.getByRole('figure', { name: 'Flagged spending patterns' });
    expect(coverage.compareDocumentPosition(figure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(coverage).toHaveTextContent('1 of 2 categories assessed');
    expect(coverage).toHaveTextContent('Minimum sample 10 transactions');
    expect(coverage).toHaveTextContent('Travel');
    expect(coverage).toHaveTextContent('4 transactions');
    expect(within(coverage).getByText('10')).toHaveClass('tabular-nums');
  });

  it('does not imply complete coverage when populated results omit coverage metadata', () => {
    mockedAnomalies.mockReturnValue(
      anomalyResult({ categoryCoverage: [], minimumSample: 0 })
    );

    renderView();

    const coverage = screen.getByRole('region', { name: 'Spending check coverage' });
    expect(coverage).toHaveTextContent(/coverage details were not reported/i);
    expect(coverage).not.toHaveTextContent(
      /no under-sampled category was reported/i
    );
  });

  it('conservatively consolidates duplicate category coverage rows', () => {
    mockedAnomalies.mockReturnValue(
      anomalyResult({
        categoryCoverage: [
          { category: ' Food ', sampleCount: 15, hasSufficientHistory: true },
          { category: 'Food', sampleCount: 4, hasSufficientHistory: false },
        ],
      })
    );

    renderView();

    const coverage = screen.getByRole('region', { name: 'Spending check coverage' });
    expect(coverage).toHaveTextContent('0 of 1 categories assessed');
    expect(within(coverage).getAllByText('Food')).toHaveLength(1);
    expect(coverage).toHaveTextContent('Food, 4 transactions');
  });

  it.each([
    ['loading', anomalyResult({ loading: true })],
    ['unresolved', anomalyResult({ data: null, loading: false })],
  ])('shows one chart skeleton while %s', (_label, result) => {
    mockedAnomalies.mockReturnValue(result);
    renderView();
    expect(screen.getAllByTestId('analytics-chart-skeleton')).toHaveLength(1);
    expect(screen.queryByTestId('anomaly-chart')).not.toBeInTheDocument();
  });

  it('shows the hook error and uses its retry callback', () => {
    mockedAnomalies.mockReturnValue(anomalyResult({ error: 'Detection failed' }));
    renderView(groupScope);
    expect(screen.getByText('Detection failed')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: 'Analytics could not load',
      })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses the insufficient state when overall history is not sufficient', () => {
    mockedAnomalies.mockReturnValue(
      anomalyResult({
        data: [],
        hasSufficientHistory: false,
        categoryCoverage: [
          { category: 'Food', sampleCount: 12, hasSufficientHistory: true },
          { category: 'Travel', sampleCount: 3, hasSufficientHistory: false },
        ],
      })
    );
    renderView();
    expect(
      screen.getByRole('heading', {
        level: 3,
        name: /more history is needed/i,
      })
    ).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Covered categories' })).toHaveTextContent('Food');
    expect(screen.getByRole('list', { name: 'Categories needing history' })).toHaveTextContent('Travel');
    expect(screen.queryByText(/no unusual spending was flagged/i)).not.toBeInTheDocument();
  });

  it('qualifies a zero-anomaly result to covered categories and still names gaps', () => {
    mockedAnomalies.mockReturnValue(
      anomalyResult({
        data: [],
        hasSufficientHistory: true,
        categoryCoverage: [
          { category: 'Food', sampleCount: 12, hasSufficientHistory: true },
          { category: 'Travel', sampleCount: 3, hasSufficientHistory: false },
        ],
      })
    );
    renderView();
    const heading = screen.getByRole('heading', {
      level: 3,
      name: 'No unusual spending was flagged',
    });
    const state = heading.closest('section');
    expect(state).toHaveTextContent(/conclusion applies only to 1 covered category/i);
    expect(state).toHaveTextContent(/1 category still needs more history/i);
    expect(state).toHaveTextContent(/Travel.*3 transactions/i);
    expect(screen.queryByText(/all spending is normal/i)).not.toBeInTheDocument();
  });

  it('remounts stateful hook data for a new primitive scope and period key', () => {
    mockedAnomalies.mockImplementation(
      (lookback: number, _sensitivity: number, scope: AnalyticsScope) => {
        const [data] = useState(() => [
          point({
            id: `${scope.kind}-${lookback}`,
            expenseId: `${scope.kind}-${lookback}`,
            description: `${scope.kind}-${lookback}`,
          }),
        ]);
        return anomalyResult({ data });
      }
    );
    const rendered = renderView(personalScope, 'month');
    expect(screen.getByText('personal-90')).toBeInTheDocument();

    rendered.rerender(
      <AttentionAnalyticsView
        scope={groupScope}
        period="year"
        currency={currency}
      />
    );
    expect(screen.queryByText('personal-90')).not.toBeInTheDocument();
    expect(screen.getByText('group-365')).toBeInTheDocument();
  });

  it('uses the requested heading depth and a safe blank group label', () => {
    const personal = renderView();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Spending attention' })
    ).toBeInTheDocument();
    personal.unmount();

    renderView(blankNameGroupScope);
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Spending attention' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 4,
        name: 'Spending check coverage',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 4,
        name: 'Flagged spending patterns',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 4,
        name: 'Expenses to review',
      })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        level: 5,
        name: 'Large grocery shop',
      })
    ).toBeInTheDocument();
  });

  it('uses unique sensitivity label relationships across mounted instances', () => {
    render(
      <>
        <AttentionAnalyticsView
          scope={personalScope}
          period="month"
          currency={currency}
        />
        <AttentionAnalyticsView
          scope={groupScope}
          period="month"
          currency={currency}
        />
      </>
    );

    const sliders = screen.getAllByRole('slider', { name: 'Sensitivity' });
    const labelIds = sliders.map((slider) =>
      slider.getAttribute('aria-labelledby')
    );
    expect(labelIds.every(Boolean)).toBe(true);
    expect(new Set(labelIds).size).toBe(sliders.length);
  });
});
