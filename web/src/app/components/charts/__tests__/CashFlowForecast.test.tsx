import { act, fireEvent, render, screen, within } from '@testing-library/react';

import CashFlowForecast from '../CashFlowForecast';
import type { ForecastSeries } from '@/app/metrics/types';

let mockParentSize = { width: 640, height: 320 };

jest.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children(mockParentSize),
}));

jest.mock('d3-array', () => ({
  bisector: (accessor: (value: unknown) => Date) => ({
    left: (values: unknown[], target: Date, low = 0) => {
      let index = low;
      while (index < values.length && accessor(values[index]) < target) {
        index += 1;
      }
      return index;
    },
  }),
}));

const forecastPoint = (
  date: string,
  predicted: number,
  lowerBound: number,
  upperBound: number,
  hasBounds: boolean
): ForecastSeries => ({
  date: new Date(`${date}T00:00:00.000Z`),
  predicted,
  lowerBound,
  upperBound,
  hasBounds,
  isRecurring: false,
});

describe('CashFlowForecast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-13T00:00:00.000Z'));
    mockParentSize = { width: 640, height: 320 };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows history before Today, forecasts after Today, and only truthful bounds', () => {
    const formatMoney = jest.fn((value: number, compact?: boolean) =>
      compact ? `compact ${value.toFixed(0)}` : `money ${value.toFixed(0)}`
    );
    const formatDate = jest.fn((value: Date | string) => {
      const date = typeof value === 'string' ? new Date(value) : value;
      return `day ${date.toISOString().slice(0, 10)}`;
    });
    const { container } = render(
      <CashFlowForecast
        incomeHistory={[
          { date: '2026-07-01', label: '1 Jul', value: 500 },
          { date: '2026-07-10', label: '10 Jul', value: 540 },
        ]}
        expenseHistory={[
          { date: '2026-07-01', label: '1 Jul', value: 100 },
          { date: '2026-07-10', label: '10 Jul', value: 120 },
        ]}
        incomeForecast={[
          forecastPoint('2026-07-20', 600, 550, 650, true),
          forecastPoint('2026-07-21', 700, 600, 800, true),
        ]}
        expenseForecast={[
          forecastPoint('2026-07-20', 200, -9000, 9000, false),
          forecastPoint('2026-08-01', 220, -9000, 9000, false),
        ]}
        netForecast={[
          forecastPoint('2026-07-20', 400, 0, 0, false),
          forecastPoint('2026-08-01', 480, 0, 0, false),
        ]}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    const chart = screen.getByRole('img', { name: /cash flow history and forecast/i });
    expect(chart).toHaveAttribute('data-x-domain-start', '2026-07-01T00:00:00.000Z');
    expect(chart).toHaveAttribute('data-x-domain-end', '2026-08-01T00:00:00.000Z');
    expect(Number(chart.getAttribute('data-y-domain-min'))).toBeGreaterThan(-9000);
    expect(Number(chart.getAttribute('data-y-domain-max'))).toBeGreaterThanOrEqual(800);
    expect(Number(chart.getAttribute('data-y-domain-max'))).toBeLessThan(9000);
    expect(screen.getByTestId('income-history-line')).toHaveAttribute(
      'data-end-date',
      '2026-07-10T00:00:00.000Z'
    );
    expect(screen.getByTestId('income-forecast-line')).toHaveAttribute(
      'data-start-date',
      '2026-07-20T00:00:00.000Z'
    );
    expect(screen.getByTestId('today-marker')).toBeInTheDocument();
    expect(screen.getAllByTestId('income-confidence-band')).toHaveLength(1);
    expect(
      screen.getByText('Shading: expected range where available')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('expense-confidence-band')).not.toBeInTheDocument();
    expect(screen.queryByTestId('net-confidence-band')).not.toBeInTheDocument();

    fireEvent.focus(screen.getByTestId('forecast-chart-overlay'));
    expect(screen.getByTestId('forecast-summary')).toHaveTextContent('money');
    expect(screen.queryByTestId('forecast-range-net')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forecast-range-expenses')).not.toBeInTheDocument();
    expect(formatMoney).toHaveBeenCalled();
    expect(formatDate).toHaveBeenCalled();
    expect(container).not.toHaveTextContent('$');
    expect(container).not.toHaveTextContent('en-US');
  });

  it('does not bridge an unbounded gap with one confidence polygon', () => {
    render(
      <CashFlowForecast
        incomeForecast={[
          forecastPoint('2026-07-20', 100, 80, 120, true),
          forecastPoint('2026-07-21', 110, 0, 0, false),
          forecastPoint('2026-07-22', 120, 100, 140, true),
          forecastPoint('2026-07-23', 130, 110, 150, true),
        ]}
        expenseForecast={[]}
        netForecast={[]}
      />
    );

    const bands = screen.getAllByTestId('income-confidence-band');
    expect(bands).toHaveLength(1);
    expect(bands[0]).toHaveAttribute('data-start-date', '2026-07-22T00:00:00.000Z');
    expect(bands[0]).toHaveAttribute('data-end-date', '2026-07-23T00:00:00.000Z');
  });

  it('renders all-unbounded points without confidence or zero-range copy', () => {
    render(
      <CashFlowForecast
        incomeForecast={[]}
        expenseForecast={[]}
        netForecast={[
          forecastPoint('2026-07-20', 40, 0, 0, false),
          forecastPoint('2026-07-21', 45, 0, 0, false),
        ]}
      />
    );

    expect(screen.queryByTestId('net-confidence-band')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Shading: expected range where available')
    ).not.toBeInTheDocument();
    fireEvent.focus(screen.getByTestId('forecast-chart-overlay'));
    expect(screen.queryByTestId('forecast-range-net')).not.toBeInTheDocument();
    expect(screen.queryByText(/\(.*0.*to.*0.*\)/i)).not.toBeInTheDocument();
  });

  it('handles empty and history-only single-date data without invalid scales', () => {
    const empty = render(
      <CashFlowForecast incomeForecast={[]} expenseForecast={[]} netForecast={[]} />
    );
    expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    expect(empty.container.innerHTML).not.toMatch(/NaN|Infinity/);
    empty.unmount();

    const historyOnly = render(
      <CashFlowForecast
        incomeHistory={[{ date: '2026-07-01', label: '1 Jul', value: 500 }]}
        expenseHistory={[{ date: 'not-a-date', label: 'Invalid', value: 999 }]}
        incomeForecast={[]}
        expenseForecast={[]}
        netForecast={[]}
      />
    );
    const chart = screen.getByRole('img', { name: /cash flow history and forecast/i });
    expect(Date.parse(chart.getAttribute('data-x-domain-start') ?? '')).toBeLessThan(
      Date.parse(chart.getAttribute('data-x-domain-end') ?? '')
    );
    expect(historyOnly.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('uses exact timestamps in the tooltip when forecast series are misaligned', () => {
    render(
      <CashFlowForecast
        incomeForecast={[forecastPoint('2026-07-20', 100, 0, 0, false)]}
        expenseForecast={[forecastPoint('2026-07-25', 40, 0, 0, false)]}
        netForecast={[]}
        formatMoney={(value) => `value ${value}`}
        formatDate={(value) => {
          const date = typeof value === 'string' ? new Date(value) : value;
          return `day ${date.toISOString().slice(0, 10)}`;
        }}
      />
    );

    const overlay = screen.getByTestId('forecast-chart-overlay');
    expect(overlay).toHaveAttribute('type', 'button');
    expect(screen.getByTestId('forecast-summary')).toHaveTextContent(
      'Latest forecast values: Income value 100 on day 2026-07-20; Expenses value 40 on day 2026-07-25.'
    );
    fireEvent.focus(overlay);
    expect(screen.getByText('Income: value 100')).toBeInTheDocument();
    expect(screen.queryByText(/^Expenses:/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-20. Income value 100.'
    );

    fireEvent.keyDown(overlay, { key: 'ArrowRight' });
    expect(screen.getByText('Expenses: value 40')).toBeInTheDocument();
    expect(screen.queryByText(/^Income:/)).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-25. Expenses value 40.'
    );

    fireEvent.blur(overlay);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('keeps history and forecast points on their semantic sides of Today', () => {
    render(
      <CashFlowForecast
        incomeHistory={[
          { date: '2026-07-10', label: 'History', value: 80 },
          { date: '2026-07-20', label: 'Misplaced history', value: 90 },
        ]}
        incomeForecast={[
          forecastPoint('2026-07-10', 100, 0, 0, false),
          forecastPoint('2026-07-20', 120, 0, 0, false),
        ]}
        expenseForecast={[]}
        netForecast={[]}
      />
    );

    expect(screen.getByTestId('income-history-line')).toHaveAttribute(
      'data-end-date',
      '2026-07-10T00:00:00.000Z'
    );
    expect(screen.getByTestId('income-forecast-line')).toHaveAttribute(
      'data-start-date',
      '2026-07-20T00:00:00.000Z'
    );
  });

  it('summarizes the true earliest and latest history dates across both series', () => {
    render(
      <CashFlowForecast
        incomeHistory={[{ date: '2026-07-10', label: 'Income', value: 80 }]}
        expenseHistory={[{ date: '2026-07-01', label: 'Expense', value: 30 }]}
        incomeForecast={[]}
        expenseForecast={[]}
        netForecast={[]}
        formatDate={(value) => {
          const date = typeof value === 'string' ? new Date(value) : value;
          return `day ${date.toISOString().slice(0, 10)}`;
        }}
      />
    );

    expect(screen.getByTestId('forecast-summary')).toHaveTextContent(
      'History from day 2026-07-01 to day 2026-07-10.'
    );
    const legend = within(screen.getByTestId('forecast-legend'));
    expect(legend.getByText('Income')).toBeInTheDocument();
    expect(legend.getByText('Expenses')).toBeInTheDocument();
    expect(legend.queryByText('Net')).not.toBeInTheDocument();
    expect(legend.getByText('Solid lines: history')).toBeInTheDocument();
    expect(legend.queryByText('Dashed lines: forecast')).not.toBeInTheDocument();
    expect(
      legend.queryByText('Shading: expected range where available')
    ).not.toBeInTheDocument();
  });

  it('only advertises the rendered income forecast series and line style', () => {
    render(
      <CashFlowForecast
        incomeForecast={[
          forecastPoint('2026-07-20', 100, 0, 0, false),
          forecastPoint('2026-07-21', 110, 0, 0, false),
        ]}
        expenseForecast={[]}
        netForecast={[]}
      />
    );

    const legend = within(screen.getByTestId('forecast-legend'));
    expect(legend.getByText('Income')).toBeInTheDocument();
    expect(legend.queryByText('Expenses')).not.toBeInTheDocument();
    expect(legend.queryByText('Net')).not.toBeInTheDocument();
    expect(legend.queryByText('Solid lines: history')).not.toBeInTheDocument();
    expect(legend.getByText('Dashed lines: forecast')).toBeInTheDocument();
    expect(
      legend.queryByText('Shading: expected range where available')
    ).not.toBeInTheDocument();
  });

  it('does not bridge a missing UTC calendar day with confidence shading', () => {
    render(
      <CashFlowForecast
        incomeForecast={[
          forecastPoint('2026-07-20', 100, 80, 120, true),
          forecastPoint('2026-07-22', 120, 100, 140, true),
        ]}
        expenseForecast={[]}
        netForecast={[]}
      />
    );

    expect(screen.queryByTestId('income-confidence-band')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Shading: expected range where available')
    ).not.toBeInTheDocument();
  });

  it('refreshes the UTC Today boundary after midnight without remounting', () => {
    jest.setSystemTime(new Date('2026-07-13T23:59:00.000Z'));
    render(
      <CashFlowForecast
        incomeHistory={[
          { date: '2026-07-13', label: '13 Jul', value: 80 },
          { date: '2026-07-14', label: '14 Jul', value: 90 },
        ]}
        incomeForecast={[
          forecastPoint('2026-07-14', 100, 0, 0, false),
          forecastPoint('2026-07-15', 110, 0, 0, false),
        ]}
        expenseForecast={[]}
        netForecast={[]}
        formatMoney={(value) => `value ${value}`}
        formatDate={(value) => {
          const date = typeof value === 'string' ? new Date(value) : value;
          return `day ${date.toISOString().slice(0, 10)}`;
        }}
      />
    );

    expect(screen.getByTestId('today-marker')).toHaveAttribute(
      'data-date',
      '2026-07-13T00:00:00.000Z'
    );
    expect(screen.getByTestId('income-history-line')).toHaveAttribute(
      'data-end-date',
      '2026-07-13T00:00:00.000Z'
    );
    expect(screen.getByTestId('income-forecast-line')).toHaveAttribute(
      'data-start-date',
      '2026-07-14T00:00:00.000Z'
    );
    fireEvent.focus(screen.getByTestId('forecast-chart-overlay'));
    expect(screen.getByText('Income: value 100')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-14. Income value 100.'
    );

    act(() => {
      jest.advanceTimersByTime(2 * 60 * 1000);
    });

    expect(screen.getByTestId('today-marker')).toHaveAttribute(
      'data-date',
      '2026-07-14T00:00:00.000Z'
    );
    expect(screen.getByTestId('income-history-line')).toHaveAttribute(
      'data-end-date',
      '2026-07-14T00:00:00.000Z'
    );
    expect(screen.getByTestId('income-forecast-line')).toHaveAttribute(
      'data-start-date',
      '2026-07-15T00:00:00.000Z'
    );
    expect(screen.queryByText('Income: value 100')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each([
    {
      name: 'duplicate timestamp',
      points: [
        forecastPoint('2026-07-20', 100, 80, 120, true),
        forecastPoint('2026-07-20', 110, 90, 130, true),
        forecastPoint('2026-07-21', 120, 100, 140, true),
      ],
    },
    {
      name: 'reversed input order',
      points: [
        forecastPoint('2026-07-22', 120, 100, 140, true),
        forecastPoint('2026-07-20', 100, 80, 120, true),
        forecastPoint('2026-07-21', 110, 90, 130, true),
      ],
    },
  ])('fails confidence shading closed for $name', ({ points }) => {
    render(
      <CashFlowForecast
        incomeForecast={points}
        expenseForecast={[]}
        netForecast={[]}
      />
    );

    expect(screen.getByTestId('income-forecast-line')).toBeInTheDocument();
    expect(screen.queryByTestId('income-confidence-band')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Shading: expected range where available')
    ).not.toBeInTheDocument();
  });

  it('clears a selected tooltip when confidence bounds change at the same date', () => {
    const renderChart = (point: ForecastSeries) => (
      <CashFlowForecast
        incomeForecast={[point]}
        expenseForecast={[]}
        netForecast={[]}
        formatMoney={(value) => `value ${value}`}
        formatDate={(value) => {
          const date = typeof value === 'string' ? new Date(value) : value;
          return `day ${date.toISOString().slice(0, 10)}`;
        }}
      />
    );
    const { rerender } = render(
      renderChart(forecastPoint('2026-07-20', 100, 80, 120, true))
    );

    fireEvent.focus(screen.getByTestId('forecast-chart-overlay'));
    expect(screen.getByText('Income: value 100')).toBeInTheDocument();
    expect(screen.getByTestId('forecast-range-income')).toHaveTextContent(
      'value 80 to value 120'
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-20. Income value 100.'
    );

    rerender(renderChart(forecastPoint('2026-07-20', 100, 0, 0, false)));

    expect(screen.queryByText('Income: value 100')).not.toBeInTheDocument();
    expect(screen.queryByTestId('forecast-range-income')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('reserves legend and summary space outside a bounded responsive plot', () => {
    mockParentSize = { width: 480, height: 120 };
    render(
      <CashFlowForecast
        incomeForecast={[forecastPoint('2026-07-20', 100, 0, 0, false)]}
        expenseForecast={[]}
        netForecast={[]}
      />
    );

    const layout = screen.getByTestId('forecast-chart-layout');
    const plot = screen.getByTestId('forecast-chart-plot');
    const footer = screen.getByTestId('forecast-chart-footer');
    expect(layout).toHaveClass('flex', 'h-full', 'min-h-0', 'flex-col');
    expect(plot).toHaveClass('relative', 'min-h-0', 'flex-1');
    expect(footer).toHaveClass('shrink-0');
    expect(plot).not.toContainElement(footer);
    expect(
      screen.getByRole('img', { name: /cash flow history and forecast/i })
    ).toHaveAttribute('height', '120');
  });
});
