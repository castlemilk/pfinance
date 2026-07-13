import { fireEvent, render, screen } from '@testing-library/react';

import SpendingTrendChart from '../SpendingTrendChart';

jest.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children({ width: 640, height: 320 }),
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

describe('SpendingTrendChart', () => {
  it('renders the fitted trend without clipping and uses caller-owned formatters everywhere', () => {
    const formatMoney = jest.fn((value: number, compact?: boolean) =>
      compact ? `compact ${value.toFixed(1)}` : `credits ${value.toFixed(1)}`
    );
    const formatDate = jest.fn((value: Date | string) => {
      const date = typeof value === 'string' ? new Date(value) : value;
      return `day ${date.toISOString().slice(0, 10)}`;
    });
    const { container } = render(
      <SpendingTrendChart
        expenseSeries={[
          { date: '2026-07-01', value: 10 },
          { date: '2026-07-08', value: 20 },
          { date: '2026-07-15', value: 100 },
        ]}
        incomeSeries={[
          { date: '2026-07-01', value: 80 },
          { date: '2026-07-15', value: 90 },
        ]}
        trendSlope={60}
        trendRSquared={0.72}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    const chart = screen.getByRole('img', { name: /spending over time/i });
    const trend = screen.getByTestId('spending-trend-line');
    const fittedStart = Number(trend.getAttribute('data-start-value'));
    const fittedEnd = Number(trend.getAttribute('data-end-value'));
    const domainMin = Number(chart.getAttribute('data-y-domain-min'));
    const domainMax = Number(chart.getAttribute('data-y-domain-max'));

    expect(fittedStart).toBeCloseTo(-16.666, 2);
    expect(fittedEnd).toBeCloseTo(103.333, 2);
    expect(fittedStart).not.toBe(10);
    expect(domainMin).toBeLessThanOrEqual(fittedStart);
    expect(domainMax).toBeGreaterThanOrEqual(fittedEnd);
    expect(screen.getByTestId('spending-trend-summary')).toHaveTextContent(
      'Spending is rising by credits 60.0 per period.'
    );

    fireEvent.focus(screen.getByTestId('spending-chart-overlay'));
    expect(screen.getByText('Expenses: credits 10.0')).toBeInTheDocument();
    expect(screen.getByText('Income: credits 80.0')).toBeInTheDocument();
    expect(formatMoney).toHaveBeenCalled();
    expect(formatDate).toHaveBeenCalled();
    expect(container).not.toHaveTextContent('$');
    expect(container).not.toHaveTextContent('en-US');
  });

  it('handles empty input without constructing invalid scales', () => {
    const { container } = render(<SpendingTrendChart expenseSeries={[]} />);

    expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('expands a single-date domain and ignores invalid direct-caller points', () => {
    const { container } = render(
      <SpendingTrendChart
        expenseSeries={[
          { date: 'not-a-date', value: 900 },
          { date: '2026-07-01', value: 25 },
        ]}
        trendSlope={2}
      />
    );

    const chart = screen.getByRole('img', { name: /spending over time/i });
    expect(chart).toHaveAttribute('data-x-domain-start');
    expect(chart).toHaveAttribute('data-x-domain-end');
    expect(Number(chart.getAttribute('data-x-domain-start'))).toBeLessThan(
      Number(chart.getAttribute('data-x-domain-end'))
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('lets keyboard users inspect income-only dates without borrowing an expense', () => {
    render(
      <SpendingTrendChart
        expenseSeries={[
          { date: '2026-07-01', value: 10 },
          { date: '2026-07-15', value: 30 },
        ]}
        incomeSeries={[{ date: '2026-07-08', value: 80 }]}
        formatMoney={(value) => `value ${value}`}
      />
    );

    const overlay = screen.getByTestId('spending-chart-overlay');
    fireEvent.focus(overlay);
    expect(screen.getByText('Expenses: value 10')).toBeInTheDocument();

    fireEvent.keyDown(overlay, { key: 'ArrowRight' });
    expect(screen.getByText('Income: value 80')).toBeInTheDocument();
    expect(screen.queryByText(/^Expenses:/)).not.toBeInTheDocument();
  });
});
