import { fireEvent, render, screen, within } from '@testing-library/react';

import { useCashFlowForecast } from '@/app/metrics/hooks/useAnalyticsData';

import { ForecastAnalyticsView } from '../ForecastAnalyticsView';

import type {
  ForecastHistoryPoint,
  ForecastSeries,
} from '@/app/metrics/types';
import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsScope,
} from '../../types';

const mockChart = jest.fn();

jest.mock('@/app/metrics/hooks/useAnalyticsData', () => ({
  useCashFlowForecast: jest.fn(),
}));

jest.mock('@/app/components/charts/LazyCashFlowForecast', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockChart(props);
    return <div data-testid="cash-flow-forecast-chart">Forecast chart</div>;
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
  return `date ${date.toISOString().slice(0, 10)}`;
});
const currency: AnalyticsCurrencyContext = {
  locale: 'en-AU',
  currency: 'AUD',
  formatMoney,
  formatDate,
};

const refetch = jest.fn();
const mockedForecast = useCashFlowForecast as jest.Mock;

function futurePoint(
  date: string,
  predicted: number,
  overrides: Partial<ForecastSeries> = {}
): ForecastSeries {
  return {
    date: new Date(`${date}T00:00:00.000Z`),
    predicted,
    lowerBound: 0,
    upperBound: 0,
    hasBounds: false,
    isRecurring: false,
    ...overrides,
  };
}

const incomeHistory: ForecastHistoryPoint[] = [
  { date: '2026-07-01', label: '1 Jul', value: 500 },
];
const expenseHistory: ForecastHistoryPoint[] = [
  { date: '2026-07-01', label: '1 Jul', value: 120 },
];
const incomeForecast = [
  futurePoint('2026-07-20', 600, {
    lowerBound: 550,
    upperBound: 650,
    hasBounds: true,
  }),
];
const expenseForecast = [futurePoint('2026-07-20', 180)];
const netForecast = [futurePoint('2026-07-20', 420)];

function forecastResult(overrides: Record<string, unknown> = {}) {
  return {
    incomeForecast,
    expenseForecast,
    netForecast,
    incomeHistory,
    expenseHistory,
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
    <ForecastAnalyticsView scope={scope} period={period} currency={currency} />
  );
}

describe('ForecastAnalyticsView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    formatDate.mockImplementation((value: Date | string) => {
      const date = typeof value === 'string' ? new Date(value) : value;
      return `date ${date.toISOString().slice(0, 10)}`;
    });
    mockedForecast.mockReturnValue(forecastResult());
  });

  it.each([
    ['month', 30],
    ['quarter', 60],
    ['year', 90],
  ] as const)(
    'maps the %s period to the exact %i-day scoped forecast',
    (period, days) => {
      renderView(groupScope, period);

      expect(mockedForecast).toHaveBeenLastCalledWith(days, groupScope);
      expect(screen.getByText('Home')).toBeInTheDocument();
    }
  );

  it('passes history, future series, and contextual formatters to the corrected chart', () => {
    renderView();

    expect(
      screen.getByRole('figure', { name: 'Cash flow history and forecast' })
    ).toBeInTheDocument();
    expect(mockChart).toHaveBeenLastCalledWith({
      incomeForecast,
      expenseForecast,
      netForecast,
      incomeHistory,
      expenseHistory,
      formatMoney,
      formatDate,
    });
  });

  it('provides date and value rows without inventing a zero confidence range', () => {
    renderView();

    fireEvent.click(screen.getByRole('button', { name: 'Show data table' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('Cash flow history and forecast values')).toBeInTheDocument();
    expect(
      within(table).getByRole('row', {
        name: 'History Income date 2026-07-01 AUD 500.00 Not available',
      })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('row', {
        name: 'Forecast Income date 2026-07-20 AUD 600.00 AUD 550.00 to AUD 650.00',
      })
    ).toBeInTheDocument();
    expect(
      within(table).getByRole('row', {
        name: 'Forecast Net date 2026-07-20 AUD 420.00 Not available',
      })
    ).toBeInTheDocument();
    expect(table).not.toHaveTextContent('AUD 0.00 to AUD 0.00');
  });

  it('shows a chart-shaped loading state before errors or stale chart data', () => {
    mockedForecast.mockReturnValue(
      forecastResult({ loading: true, error: 'Stale failure' })
    );

    renderView();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading cash flow forecast'
    );
    expect(screen.getByTestId('analytics-chart-skeleton')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(mockChart).not.toHaveBeenCalled();
  });

  it('keeps the chart-shaped loading state while the first hook result is unresolved', () => {
    mockedForecast.mockReturnValue(
      forecastResult({
        incomeForecast: null,
        expenseForecast: null,
        netForecast: null,
        incomeHistory: null,
        expenseHistory: null,
      })
    );

    renderView();

    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading cash flow forecast'
    );
    expect(screen.queryByText('Forecast needs recorded history')).not.toBeInTheDocument();
  });

  it('wires a settled forecast error to the hook refetch', () => {
    mockedForecast.mockReturnValue(
      forecastResult({ error: 'Forecast is unavailable' })
    );

    renderView();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Forecast is unavailable'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(mockChart).not.toHaveBeenCalled();
  });

  it('explains that a settled empty forecast needs recorded history', () => {
    mockedForecast.mockReturnValue(
      forecastResult({
        incomeForecast: [],
        expenseForecast: [],
        netForecast: [],
        incomeHistory: [],
        expenseHistory: [],
      })
    );

    renderView();

    expect(
      screen.getByRole('heading', { name: 'Forecast needs recorded history' })
    ).toBeInTheDocument();
    expect(screen.getByText(/add income and expenses/i)).toBeInTheDocument();
    expect(mockChart).not.toHaveBeenCalled();
  });

  it('orders accessible evidence chronologically instead of by localized date text', () => {
    formatDate.mockImplementation((value: Date | string) => {
      const date = typeof value === 'string' ? new Date(value) : value;
      return date.toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    });
    mockedForecast.mockReturnValue(
      forecastResult({
        incomeHistory: [
          { date: '2026-07-10', label: '10 Jul', value: 510 },
          { date: '2026-07-02', label: '2 Jul', value: 502 },
        ],
        expenseHistory: [],
        incomeForecast: [],
        expenseForecast: [],
        netForecast: [],
      })
    );

    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Show data table' }));

    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('2 July 2026'),
      expect.stringContaining('10 July 2026'),
    ]);
  });
});
