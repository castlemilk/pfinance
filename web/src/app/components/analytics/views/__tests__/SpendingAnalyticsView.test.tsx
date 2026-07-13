import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import {
  useCategorySpendingTrends,
  useHeatmapData,
  useSpendingTrends,
} from '@/app/metrics/hooks/useAnalyticsData';
import type {
  CategoryStackedTrendPoint,
  HeatmapData,
} from '@/app/metrics/types';

import { SpendingAnalyticsView } from '../SpendingAnalyticsView';
import { AnalyticsWorkspaceShell } from '../../AnalyticsWorkspaceShell';

import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsScope,
} from '../../types';

const push = jest.fn();
const mockHeatmapChart = jest.fn();
const mockTrendChart = jest.fn();
const mockCategoryChart = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/app/metrics/hooks/useAnalyticsData', () => ({
  useCategorySpendingTrends: jest.fn(),
  useHeatmapData: jest.fn(),
  useSpendingTrends: jest.fn(),
}));

jest.mock('d3-array', () => ({
  bisector: () => ({
    center: () => 0,
  }),
}));

jest.mock('@/app/components/charts/LazySpendingHeatmap', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockHeatmapChart(props);
    return <div data-testid="heatmap-chart">Heatmap visual</div>;
  },
}));

jest.mock('@/app/components/charts/LazySpendingTrendChart', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockTrendChart(props);
    return <div data-testid="trend-chart">Trend visual</div>;
  },
}));

jest.mock('@/app/components/charts/LazyCategoryStackedTrendChart', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockCategoryChart(props);
    return <div data-testid="category-chart">Category visual</div>;
  },
}));

const personalScope = { kind: 'personal' } as const satisfies AnalyticsScope;
const groupScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
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

const heatmapRefetch = jest.fn();
const trendRefetch = jest.fn();
const categoryRefetch = jest.fn();

type HeatmapHookState = {
  data: HeatmapData | null;
  loading: boolean;
  error: string | null;
  refetch: typeof heatmapRefetch;
};

type TrendHookState = {
  expenseSeries: readonly { date: string; value: number }[];
  incomeSeries: readonly { date: string; value: number }[];
  trendSlope: number;
  trendRSquared: number;
  loading: boolean;
  error: string | null;
  refetch: typeof trendRefetch;
};

type CategoryHookState = {
  points: readonly CategoryStackedTrendPoint[];
  categories: readonly string[];
  loading: boolean;
  error: string | null;
  refetch: typeof categoryRefetch;
};

const heatmapData = Object.freeze({
  maxValue: 10,
  days: Object.freeze([
    Object.freeze({ date: '2026-07-02', value: 0, count: 0 }),
    Object.freeze({ date: '2026-07-01', value: 10, count: 2 }),
  ]),
});
const expenseSeries = Object.freeze([
  Object.freeze({ date: '2026-07-08', value: 20 }),
  Object.freeze({ date: '2026-07-01', value: 10 }),
]);
const incomeSeries = Object.freeze([
  Object.freeze({ date: '2026-07-15', value: 80 }),
  Object.freeze({ date: '2026-07-01', value: 70 }),
]);
const categories = Object.freeze(['Housing', 'Food']);
const categoryPoints = Object.freeze([
  Object.freeze({
    date: '2026-07-08',
    label: 'Second',
    total: 30,
    categories: Object.freeze({ Housing: 20, Food: 10 }),
  }),
  Object.freeze({
    date: '2026-07-01',
    label: 'First',
    total: 15,
    categories: Object.freeze({ Housing: 5, Food: 10 }),
  }),
]);

const mockedHeatmap = useHeatmapData as jest.Mock;
const mockedTrends = useSpendingTrends as jest.Mock;
const mockedCategories = useCategorySpendingTrends as jest.Mock;

function loadedHeatmap(): HeatmapHookState {
  return {
    data: heatmapData as unknown as HeatmapData,
    loading: false,
    error: null,
    refetch: heatmapRefetch,
  };
}

function loadedTrends(): TrendHookState {
  return {
    expenseSeries,
    incomeSeries,
    trendSlope: 5,
    trendRSquared: 0.8,
    loading: false,
    error: null,
    refetch: trendRefetch,
  };
}

function loadedCategories(): CategoryHookState {
  return {
    points: categoryPoints,
    categories,
    loading: false,
    error: null,
    refetch: categoryRefetch,
  };
}

function setLoadedHooks() {
  mockedHeatmap.mockReturnValue(loadedHeatmap());
  mockedTrends.mockReturnValue(loadedTrends());
  mockedCategories.mockReturnValue(loadedCategories());
}

function pendingHeatmap(): HeatmapHookState {
  return {
    data: null,
    loading: true,
    error: null,
    refetch: heatmapRefetch,
  };
}

function pendingTrends(): TrendHookState {
  return {
    expenseSeries: [],
    incomeSeries: [],
    trendSlope: 0,
    trendRSquared: 0,
    loading: true,
    error: null,
    refetch: trendRefetch,
  };
}

function pendingCategories(): CategoryHookState {
  return {
    points: [],
    categories: [],
    loading: true,
    error: null,
    refetch: categoryRefetch,
  };
}

function renderView(
  scope: AnalyticsScope = personalScope,
  period: AnalyticsPeriod = 'month'
) {
  return render(
    <SpendingAnalyticsView scope={scope} period={period} currency={currency} />
  );
}

describe('SpendingAnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T12:34:56.000Z'));
    setLoadedHooks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    ['month', '2026-04-13T12:34:56.000Z', 'week', 8],
    ['quarter', '2026-01-13T12:34:56.000Z', 'week', 16],
    ['year', '2025-07-13T12:34:56.000Z', 'month', 24],
  ] as const)(
    'maps %s to the canonical range and exact scoped trend configuration',
    (period, startIso, granularity, periods) => {
      renderView(groupScope, period);

      expect(mockedHeatmap).toHaveBeenCalledWith(
        new Date(startIso),
        new Date('2026-07-13T12:34:56.000Z'),
        groupScope
      );
      expect(mockedTrends).toHaveBeenCalledWith(
        granularity,
        periods,
        undefined,
        groupScope
      );
      expect(mockedCategories).toHaveBeenCalledWith(
        granularity,
        periods,
        groupScope
      );
    }
  );

  it('renders three responsive labelled figures and passes exact data and formatters', () => {
    renderView();

    expect(screen.getByTestId('spending-view-header')).toHaveClass(
      'flex-col',
      'sm:flex-row'
    );
    const heatmapFigure = screen.getByRole('figure', { name: 'Daily spending' });
    const trendFigure = screen.getByRole('figure', { name: 'Spending trend' });
    const categoryFigure = screen.getByRole('figure', { name: 'Category mix over time' });
    [heatmapFigure, trendFigure, categoryFigure].forEach((figure) =>
      expect(figure).toHaveClass('min-w-0')
    );
    expect(mockHeatmapChart).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          maxValue: 10,
          days: [
            { date: '2026-07-01', value: 10, count: 2 },
            { date: '2026-07-02', value: 0, count: 0 },
          ],
        },
        formatMoney,
        formatDate,
      })
    );
    expect(mockHeatmapChart.mock.calls[0][0]).not.toHaveProperty('expenses');
    expect(mockTrendChart).toHaveBeenCalledWith(
      expect.objectContaining({
        expenseSeries: [
          { date: '2026-07-01', value: 10 },
          { date: '2026-07-08', value: 20 },
        ],
        incomeSeries: [
          { date: '2026-07-01', value: 70 },
          { date: '2026-07-15', value: 80 },
        ],
        trendSlope: 5,
        trendRSquared: 0.8,
        formatMoney,
        formatDate,
      })
    );
    expect(mockCategoryChart).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [
          {
            date: '2026-07-01',
            label: 'First',
            total: 15,
            categories: { Housing: 5, Food: 10 },
          },
          {
            date: '2026-07-08',
            label: 'Second',
            total: 30,
            categories: { Housing: 20, Food: 10 },
          },
        ],
        categories,
        formatMoney,
        formatDate,
      })
    );
    expect(within(heatmapFigure).getByTestId('spending-chart-region')).toHaveClass(
      'rounded-[10px]'
    );
  });

  it('builds personal and group day drill-down URLs exclusively from scope', () => {
    const rendered = renderView(personalScope);
    act(() => mockHeatmapChart.mock.calls.at(-1)?.[0].onDayClick('2026-07-01'));
    expect(push).toHaveBeenLastCalledWith('/personal/expenses?date=2026-07-01');

    rendered.rerender(
      <SpendingAnalyticsView scope={groupScope} period="month" currency={currency} />
    );
    act(() => mockHeatmapChart.mock.calls.at(-1)?.[0].onDayClick('2026-07-02'));
    expect(push).toHaveBeenLastCalledWith('/shared/expenses?date=2026-07-02');
    expect(mockedHeatmap).toHaveBeenLastCalledWith(
      new Date('2026-04-13T12:34:56.000Z'),
      new Date('2026-07-13T12:34:56.000Z'),
      groupScope
    );
  });

  it('remounts hook ownership before a deferred personal-to-group result can flash', () => {
    mockedHeatmap.mockImplementation(
      (_start: Date, _end: Date, scope: AnalyticsScope) => {
        const [snapshot] = useState(() =>
          scope.kind === 'personal' ? loadedHeatmap() : pendingHeatmap()
        );
        return snapshot;
      }
    );
    mockedTrends.mockImplementation(
      (
        _granularity: string,
        _periods: number,
        _category: undefined,
        scope: AnalyticsScope
      ) => {
        const [snapshot] = useState(() =>
          scope.kind === 'personal' ? loadedTrends() : pendingTrends()
        );
        return snapshot;
      }
    );
    mockedCategories.mockImplementation(
      (_granularity: string, _periods: number, scope: AnalyticsScope) => {
        const [snapshot] = useState(() =>
          scope.kind === 'personal' ? loadedCategories() : pendingCategories()
        );
        return snapshot;
      }
    );

    const rendered = renderView(personalScope, 'month');
    expect(screen.getByTestId('heatmap-chart')).toBeInTheDocument();
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
    expect(screen.getByTestId('category-chart')).toBeInTheDocument();

    rendered.rerender(
      <SpendingAnalyticsView scope={groupScope} period="month" currency={currency} />
    );

    expect(screen.queryByTestId('heatmap-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-chart')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading daily spending' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading spending trend' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading category mix' })).toBeInTheDocument();
  });

  it('remounts hook ownership before a deferred period result can flash', () => {
    mockedHeatmap.mockImplementation((start: Date) => {
      const [snapshot] = useState(() =>
        start.toISOString() === '2026-04-13T12:34:56.000Z'
          ? loadedHeatmap()
          : pendingHeatmap()
      );
      return snapshot;
    });
    mockedTrends.mockImplementation((_granularity: string, periods: number) => {
      const [snapshot] = useState(() =>
        periods === 8 ? loadedTrends() : pendingTrends()
      );
      return snapshot;
    });
    mockedCategories.mockImplementation(
      (_granularity: string, periods: number) => {
        const [snapshot] = useState(() =>
          periods === 8 ? loadedCategories() : pendingCategories()
        );
        return snapshot;
      }
    );

    const rendered = renderView(personalScope, 'month');
    expect(screen.getByTestId('heatmap-chart')).toBeInTheDocument();

    rendered.rerender(
      <SpendingAnalyticsView scope={personalScope} period="quarter" currency={currency} />
    );

    expect(screen.queryByTestId('heatmap-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trend-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-chart')).not.toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading daily spending' })).toBeInTheDocument();
  });

  it('refreshes the canonical heatmap range at UTC midnight without remounting', () => {
    jest.setSystemTime(new Date('2026-07-13T23:59:30.000Z'));
    renderView(personalScope, 'month');
    expect(mockedHeatmap).toHaveBeenLastCalledWith(
      new Date('2026-04-13T23:59:30.000Z'),
      new Date('2026-07-13T23:59:30.000Z'),
      personalScope
    );

    act(() => {
      jest.advanceTimersByTime(30_000);
    });

    expect(mockedHeatmap).toHaveBeenLastCalledWith(
      new Date('2026-04-14T00:00:00.000Z'),
      new Date('2026-07-14T00:00:00.000Z'),
      personalScope
    );
  });

  it('derives all three accessible tables from the exact chart arrays', () => {
    renderView();

    const heatmapFigure = screen.getByRole('figure', { name: 'Daily spending' });
    fireEvent.click(within(heatmapFigure).getByRole('button', { name: 'Show data table' }));
    const heatmapTable = within(heatmapFigure).getByRole('table', {
      name: 'Daily spending values',
    });
    expect(within(heatmapTable).getAllByRole('row')).toHaveLength(3);
    expect(within(heatmapTable).getByText('AUD 0.00')).toBeInTheDocument();
    expect(within(heatmapTable).getByText('2')).toBeInTheDocument();

    const trendFigure = screen.getByRole('figure', { name: 'Spending trend' });
    fireEvent.click(within(trendFigure).getByRole('button', { name: 'Show data table' }));
    const trendTable = within(trendFigure).getByRole('table', {
      name: 'Spending trend values',
    });
    const trendRows = within(trendTable).getAllByRole('row');
    expect(trendRows).toHaveLength(4);
    expect(within(trendRows[2]).getByText('AUD 20.00')).toBeInTheDocument();
    expect(within(trendRows[2]).getByText('Not available')).toBeInTheDocument();
    expect(within(trendRows[3]).getByText('AUD 80.00')).toBeInTheDocument();
    expect(within(trendRows[3]).getByText('Not available')).toBeInTheDocument();

    const categoryFigure = screen.getByRole('figure', { name: 'Category mix over time' });
    fireEvent.click(within(categoryFigure).getByRole('button', { name: 'Show data table' }));
    const categoryTable = within(categoryFigure).getByRole('table', {
      name: 'Category mix values',
    });
    expect(within(categoryTable).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Date',
      'Total',
      'Housing',
      'Food',
    ]);
    const categoryRows = within(categoryTable).getAllByRole('row');
    expect(within(categoryRows[1]).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'date 2026-07-01',
      'AUD 15.00',
      'AUD 5.00',
      'AUD 10.00',
    ]);
  });

  it('gives charts and tables the same normalized, copied evidence', () => {
    const sourceHeatmap = Object.freeze({
      maxValue: 999,
      days: Object.freeze([
        Object.freeze({
          date: '2026-07-01',
          value: 4,
          count: 1,
          categories: Object.freeze([
            Object.freeze({ category: 'Food', amount: 2, count: 1 }),
            Object.freeze({ category: 'Food', amount: 1, count: 1 }),
          ]),
        }),
        Object.freeze({
          date: '2026-07-01',
          value: 6,
          count: 2,
          categories: Object.freeze([
            Object.freeze({ category: 'Food', amount: 3, count: 1 }),
          ]),
        }),
        Object.freeze({ date: 'invalid', value: 500, count: 1 }),
      ]),
    });
    const sourceExpenses = Object.freeze([
      Object.freeze({ date: '2026-07-08', value: 20 }),
      Object.freeze({ date: 'invalid', value: 900 }),
      Object.freeze({ date: '2026-07-01', value: 10 }),
      Object.freeze({ date: '2026-07-01', value: 15 }),
      Object.freeze({ date: '2026-07-15', value: Number.NaN }),
    ]);
    const sourceIncome = Object.freeze([
      Object.freeze({ date: '2026-07-01', value: 70 }),
      Object.freeze({ date: '2026-07-15', value: 80 }),
    ]);
    const sourceCategoryPoints = Object.freeze([
      Object.freeze({
        date: '2026-07-01',
        label: 'Earlier duplicate',
        total: 900,
        categories: Object.freeze({ ' Food ': 1, Food: 2, Housing: 3 }),
      }),
      Object.freeze({
        date: '2026-07-01',
        label: 'Chosen duplicate',
        total: 999,
        categories: Object.freeze({ ' Food ': 5, Food: 10, Housing: 20 }),
      }),
      Object.freeze({
        date: 'invalid',
        label: 'Invalid',
        total: 500,
        categories: Object.freeze({ Food: 500 }),
      }),
    ]);
    const sourceCategories = Object.freeze([' Food ', 'Food', 'Housing', 'Housing', '   ']);
    mockedHeatmap.mockReturnValue({
      ...loadedHeatmap(),
      data: sourceHeatmap as unknown as HeatmapData,
    });
    mockedTrends.mockReturnValue({
      ...loadedTrends(),
      expenseSeries: sourceExpenses,
      incomeSeries: sourceIncome,
    });
    mockedCategories.mockReturnValue({
      ...loadedCategories(),
      points: sourceCategoryPoints,
      categories: sourceCategories,
    });

    renderView();

    const heatmapProps = mockHeatmapChart.mock.calls.at(-1)?.[0];
    expect(heatmapProps.data).toEqual({
      maxValue: 10,
      days: [
        {
          date: '2026-07-01',
          value: 10,
          count: 3,
          categories: [{ category: 'Food', amount: 6, count: 3 }],
        },
      ],
    });
    const trendProps = mockTrendChart.mock.calls.at(-1)?.[0];
    expect(trendProps.expenseSeries).toEqual([
      { date: '2026-07-01', value: 15 },
      { date: '2026-07-08', value: 20 },
    ]);
    expect(trendProps.incomeSeries).toEqual([
      { date: '2026-07-01', value: 70 },
      { date: '2026-07-15', value: 80 },
    ]);
    const categoryProps = mockCategoryChart.mock.calls.at(-1)?.[0];
    expect(categoryProps.categories).toEqual(['Food', 'Housing']);
    expect(categoryProps.points).toEqual([
      {
        date: '2026-07-01',
        label: 'Chosen duplicate',
        total: 35,
        categories: { Food: 15, Housing: 20 },
      },
    ]);

    const dailyFigure = screen.getByRole('figure', { name: 'Daily spending' });
    fireEvent.click(within(dailyFigure).getByRole('button', { name: 'Show data table' }));
    const dailyTable = within(dailyFigure).getByRole('table', {
      name: 'Daily spending values',
    });
    expect(within(dailyTable).getAllByRole('row')).toHaveLength(2);
    expect(within(dailyTable).getByText('AUD 10.00')).toBeInTheDocument();
    expect(within(dailyTable).getByText('3')).toBeInTheDocument();

    const trendFigure = screen.getByRole('figure', { name: 'Spending trend' });
    fireEvent.click(within(trendFigure).getByRole('button', { name: 'Show data table' }));
    const trendTable = within(trendFigure).getByRole('table', {
      name: 'Spending trend values',
    });
    expect(within(trendTable).getAllByRole('row')).toHaveLength(4);
    expect(within(trendTable).getByText('AUD 15.00')).toBeInTheDocument();

    const categoryFigure = screen.getByRole('figure', { name: 'Category mix over time' });
    fireEvent.click(within(categoryFigure).getByRole('button', { name: 'Show data table' }));
    const categoryTable = within(categoryFigure).getByRole('table', {
      name: 'Category mix values',
    });
    expect(within(categoryTable).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Date',
      'Total',
      'Food',
      'Housing',
    ]);
    expect(within(categoryTable).getByText('AUD 35.00')).toBeInTheDocument();

    expect(sourceHeatmap.days).toHaveLength(3);
    expect(sourceExpenses).toHaveLength(5);
    expect(sourceCategoryPoints[1].total).toBe(999);
  });

  it('nests headings correctly inside the personal and group workspace shells', () => {
    const onPeriodChange = jest.fn();
    const onViewChange = jest.fn();
    const rendered = render(
      <AnalyticsWorkspaceShell
        scope={personalScope}
        period="month"
        onPeriodChange={onPeriodChange}
        activeView="spending"
        onViewChange={onViewChange}
        availableViews={['spending']}
      >
        <SpendingAnalyticsView
          scope={personalScope}
          period="month"
          currency={currency}
        />
      </AnalyticsWorkspaceShell>
    );
    expect(screen.getByRole('heading', { name: 'Personal analytics', level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spending patterns', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily spending', level: 3 })).toBeInTheDocument();

    rendered.rerender(
      <AnalyticsWorkspaceShell
        scope={groupScope}
        period="month"
        onPeriodChange={onPeriodChange}
        activeView="spending"
        onViewChange={onViewChange}
        availableViews={['spending']}
      >
        <SpendingAnalyticsView
          scope={groupScope}
          period="month"
          currency={currency}
        />
      </AnalyticsWorkspaceShell>
    );
    expect(screen.getByRole('heading', { name: 'Home analytics', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spending patterns', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daily spending', level: 4 })).toBeInTheDocument();
  });

  it('falls back to Group for a blank group name', () => {
    renderView({ kind: 'group', groupId: 'group-blank', groupName: '   ' });
    expect(screen.getByText('Group')).toBeInTheDocument();
    expect(screen.queryByText(/^\s+$/)).not.toBeInTheDocument();
  });

  type Panel = 'heatmap' | 'trend' | 'category';
  type State = 'loading' | 'error' | 'empty';
  const cases: readonly [Panel, State, string][] = [
    ['heatmap', 'loading', 'Loading daily spending'],
    ['heatmap', 'error', 'Daily spending failed'],
    ['heatmap', 'empty', 'No daily spending is available yet.'],
    ['trend', 'loading', 'Loading spending trend'],
    ['trend', 'error', 'Spending trend failed'],
    ['trend', 'empty', 'No spending trend is available yet.'],
    ['category', 'loading', 'Loading category mix'],
    ['category', 'error', 'Category mix failed'],
    ['category', 'empty', 'No category mix is available yet.'],
  ];

  it.each(cases)(
    'keeps successful sibling figures mounted for %s %s',
    (panel, state, expected) => {
      const next = {
        heatmap: loadedHeatmap(),
        trend: loadedTrends(),
        category: loadedCategories(),
      };
      if (panel === 'heatmap') {
        next.heatmap = {
          ...next.heatmap,
          data:
            state === 'empty'
              ? { maxValue: 0, days: [{ date: '2026-07-01', value: 0, count: 0 }] }
              : next.heatmap.data,
          loading: state === 'loading',
          error: state === 'error' ? expected : null,
        };
      } else if (panel === 'trend') {
        next.trend = {
          ...next.trend,
          expenseSeries: state === 'empty' ? [] : next.trend.expenseSeries,
          incomeSeries: state === 'empty' ? [] : next.trend.incomeSeries,
          loading: state === 'loading',
          error: state === 'error' ? expected : null,
        };
      } else {
        next.category = {
          ...next.category,
          points: state === 'empty' ? [] : next.category.points,
          categories: state === 'empty' ? [] : next.category.categories,
          loading: state === 'loading',
          error: state === 'error' ? expected : null,
        };
      }
      mockedHeatmap.mockReturnValue(next.heatmap);
      mockedTrends.mockReturnValue(next.trend);
      mockedCategories.mockReturnValue(next.category);

      renderView();

      expect(screen.getByText(expected)).toBeInTheDocument();
      const siblingCharts = [
        panel !== 'heatmap' ? 'heatmap-chart' : null,
        panel !== 'trend' ? 'trend-chart' : null,
        panel !== 'category' ? 'category-chart' : null,
      ].filter((value): value is string => value !== null);
      siblingCharts.forEach((testId) => expect(screen.getByTestId(testId)).toBeInTheDocument());

      if (state === 'error') {
        const retry = screen.getByRole('button', { name: `Retry ${
          panel === 'heatmap'
            ? 'daily spending'
            : panel === 'trend'
              ? 'spending trend'
              : 'category mix'
        }` });
        fireEvent.click(retry);
        expect(
          panel === 'heatmap'
            ? heatmapRefetch
            : panel === 'trend'
              ? trendRefetch
              : categoryRefetch
        ).toHaveBeenCalledTimes(1);
        const otherRetries = [heatmapRefetch, trendRefetch, categoryRefetch].filter(
          (retryFn) =>
            retryFn !==
            (panel === 'heatmap'
              ? heatmapRefetch
              : panel === 'trend'
                ? trendRefetch
                : categoryRefetch)
        );
        otherRetries.forEach((retryFn) => expect(retryFn).not.toHaveBeenCalled());
      }
    }
  );
});
