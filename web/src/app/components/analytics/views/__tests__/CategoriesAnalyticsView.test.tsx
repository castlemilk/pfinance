import React, { act, useEffect, useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { useAnalyticsOverview } from '@/app/metrics/hooks/useAnalyticsOverview';
import { useCategoryComparison } from '@/app/metrics/hooks/useAnalyticsData';

import { CategoriesAnalyticsView } from '../CategoriesAnalyticsView';

import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsScope,
} from '../../types';

const mockRadar = jest.fn();

jest.mock('@/app/metrics/hooks/useAnalyticsOverview', () => ({
  useAnalyticsOverview: jest.fn(),
}));

jest.mock('@/app/metrics/hooks/useAnalyticsData', () => ({
  useCategoryComparison: jest.fn(),
}));

jest.mock('@/app/components/charts/LazyCategoryRadarChart', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockRadar(props);
    return <div data-testid="category-radar">Radar visual</div>;
  },
}));

const personalScope = { kind: 'personal' } as const satisfies AnalyticsScope;
const groupScope = {
  kind: 'group',
  groupId: 'group-home',
  groupName: 'Home',
} as const satisfies AnalyticsScope;

const formatMoney = jest.fn((amount: number) => `AUD ${amount.toFixed(2)}`);
const currency: AnalyticsCurrencyContext = {
  locale: 'en-AU',
  currency: 'AUD',
  formatMoney,
  formatDate: jest.fn((value) => String(value)),
};

const overviewRefetch = jest.fn();
const comparisonRefetch = jest.fn();
const mockedOverview = useAnalyticsOverview as jest.Mock;
const mockedComparison = useCategoryComparison as jest.Mock;

const overviewData = {
  currentStart: new Date('2026-07-01T00:00:00.000Z'),
  currentEnd: new Date('2026-07-13T12:00:00.000Z'),
};

const categories = Object.freeze([
  Object.freeze({
    category: 'Food',
    currentValue: 100,
    previousValue: 80,
    budgetValue: 140,
    maxValue: 140,
  }),
  Object.freeze({
    category: 'Housing',
    currentValue: 300,
    previousValue: 250,
    budgetValue: 350,
    maxValue: 350,
  }),
  Object.freeze({
    category: 'Unmapped category',
    currentValue: 50,
    previousValue: 40,
    maxValue: 50,
  }),
]);

const combinedBudgets = Object.freeze([
  Object.freeze({
    id: 'budget-1',
    name: 'Household essentials',
    categories: Object.freeze(['Food', 'Housing']),
    allowance: 500,
    currentSpend: 400,
  }),
]);

function loadedOverview(data: typeof overviewData | null = overviewData) {
  return {
    data,
    loading: false,
    error: null,
    refetch: overviewRefetch,
  };
}

function loadedComparison(data: readonly (typeof categories)[number][] | null = categories) {
  return {
    data,
    combinedBudgets,
    loading: false,
    error: null,
    refetch: comparisonRefetch,
  };
}

function setLoadedHooks() {
  mockedOverview.mockReturnValue(loadedOverview());
  mockedComparison.mockReturnValue(loadedComparison());
}

function renderView(
  scope: AnalyticsScope = personalScope,
  period: AnalyticsPeriod = 'month'
) {
  return render(
    <CategoriesAnalyticsView scope={scope} period={period} currency={currency} />
  );
}

describe('CategoriesAnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLoadedHooks();
  });

  it('propagates scope and period, ranks category data, and uses authoritative drill-down bounds', () => {
    renderView(groupScope, 'quarter');

    expect(mockedOverview).toHaveBeenCalledWith(groupScope, 'quarter');
    expect(mockedComparison).toHaveBeenCalledWith(true, 'quarter', groupScope);
    expect(mockRadar).toHaveBeenCalledWith(
      expect.objectContaining({ data: categories, formatMoney })
    );

    expect(
      screen.getByRole('link', { name: 'Review Food spending' })
    ).toHaveAttribute(
      'href',
      '/shared/expenses?category=food&from=2026-07-01&to=2026-07-13'
    );
    expect(
      screen.getByRole('link', { name: 'Review Housing spending' })
    ).toHaveAttribute(
      'href',
      '/shared/expenses?category=housing&from=2026-07-01&to=2026-07-13'
    );
    expect(
      screen.queryByRole('link', { name: /Unmapped category/ })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Review Unmapped category spending')
    ).toHaveAttribute('aria-disabled', 'true');

    const budgetSection = screen.getByRole('region', {
      name: 'Combined budget context',
    });
    expect(within(budgetSection).getAllByText('Household essentials')).toHaveLength(1);
    expect(within(budgetSection).getAllByText('AUD 500.00')).toHaveLength(1);
    expect(within(budgetSection).getAllByText('AUD 400.00')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Show data table' }));
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Housing');
    expect(rows[2]).toHaveTextContent('Food');
    expect(rows[3]).toHaveTextContent('Unmapped category');
    within(rows[1])
      .getAllByRole('cell')
      .forEach((cell) => expect(cell).toHaveClass('tabular-nums'));
  });

  it('toggles only chart and summary budget presentation while always requesting budgets', () => {
    renderView();

    const toggle = screen.getByRole('button', { name: 'Hide budget comparison' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: 'Show budget comparison' })
    ).toHaveAttribute('aria-pressed', 'false');
    expect(
      mockedComparison.mock.calls.every(
        ([includeBudgets, period, scope]) =>
          includeBudgets === true && period === 'month' && scope === personalScope
      )
    ).toBe(true);
    const latestChartProps = mockRadar.mock.calls.at(-1)?.[0] as {
      data: readonly { budgetValue?: number }[];
    };
    expect(latestChartProps.data.every((axis) => axis.budgetValue === undefined)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Show data table' }));
    expect(screen.queryByRole('columnheader', { name: 'Budget' })).not.toBeInTheDocument();
    expect(screen.getByText('Household essentials')).toBeInTheDocument();
  });

  it.each([
    ['overview', true, false, overviewData, categories],
    ['comparison', false, true, overviewData, categories],
    ['unresolved overview', false, false, null, categories],
    ['unresolved comparison', false, false, overviewData, null],
  ] as const)(
    'shows one chart skeleton while %s is pending',
    (_label, overviewLoading, comparisonLoading, nextOverview, nextCategories) => {
      mockedOverview.mockReturnValue({
        ...loadedOverview(nextOverview),
        loading: overviewLoading,
      });
      mockedComparison.mockReturnValue({
        ...loadedComparison(nextCategories),
        loading: comparisonLoading,
      });

      renderView();

      expect(screen.getAllByTestId('analytics-chart-skeleton')).toHaveLength(1);
      expect(screen.queryByTestId('category-radar')).not.toBeInTheDocument();
    }
  );

  it.each([
    ['overview failed', 'overview', overviewRefetch],
    ['comparison failed', 'comparison', comparisonRefetch],
  ] as const)('uses the owning retry callback when %s', (_label, owner, retry) => {
    if (owner === 'overview') {
      mockedOverview.mockReturnValue({
        ...loadedOverview(),
        error: 'Overview failed',
      });
    } else {
      mockedComparison.mockReturnValue({
        ...loadedComparison(),
        error: 'Comparison failed',
      });
    }

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the local empty state only after both sources settle', () => {
    mockedComparison.mockReturnValue(loadedComparison([]));
    renderView(groupScope);

    expect(screen.getByText('No spending for this period')).toBeInTheDocument();
    expect(screen.getByText(/Home during this analytics period/)).toBeInTheDocument();
    expect(screen.queryByTestId('category-radar')).not.toBeInTheDocument();
  });

  it('keeps category actions disabled for invalid or unordered authoritative bounds', () => {
    mockedOverview.mockReturnValue(
      loadedOverview({
        currentStart: new Date('2026-07-14T00:00:00.000Z'),
        currentEnd: new Date('2026-07-13T00:00:00.000Z'),
      })
    );
    renderView();

    expect(screen.queryByRole('link', { name: /Review Food spending/ })).not.toBeInTheDocument();
    expect(screen.getByText('Review Food spending')).toHaveAttribute('aria-disabled', 'true');
  });

  it('cannot let a delayed previous-period result corrupt current category links', () => {
    jest.useFakeTimers();
    mockedOverview.mockImplementation(function useDelayedOverview(
      _scope: AnalyticsScope,
      period: AnalyticsPeriod
    ) {
      const [data, setData] = useState<typeof overviewData | null>(null);
      useEffect(() => {
        const timeout = setTimeout(
          () =>
            setData(
              period === 'month'
                ? {
                    currentStart: new Date('2026-07-01T00:00:00.000Z'),
                    currentEnd: new Date('2026-07-31T00:00:00.000Z'),
                  }
                : {
                    currentStart: new Date('2026-01-01T00:00:00.000Z'),
                    currentEnd: new Date('2026-12-31T00:00:00.000Z'),
                  }
            ),
          period === 'month' ? 50 : 10
        );
        return () => clearTimeout(timeout);
      }, [period]);
      return { data, loading: data === null, error: null, refetch: overviewRefetch };
    });

    const rendered = renderView(personalScope, 'month');
    rendered.rerender(
      <CategoriesAnalyticsView scope={personalScope} period="year" currency={currency} />
    );
    act(() => jest.advanceTimersByTime(10));
    expect(screen.getByRole('link', { name: 'Review Food spending' })).toHaveAttribute(
      'href',
      '/personal/expenses?category=food&from=2026-01-01&to=2026-12-31'
    );
    act(() => jest.advanceTimersByTime(50));
    expect(screen.getByRole('link', { name: 'Review Food spending' })).toHaveAttribute(
      'href',
      '/personal/expenses?category=food&from=2026-01-01&to=2026-12-31'
    );
    jest.useRealTimers();
  });
});
