import { fireEvent, render, screen, within } from '@testing-library/react';

import AnomalyScatterPlot, {
  normalizeAnomalyPoints,
} from '../AnomalyScatterPlot';

import type { AnomalyPoint } from '@/app/metrics/types';

let mockParentSize = { width: 680, height: 300 };

jest.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children(mockParentSize),
}));

const formatMoney = jest.fn((amount: number) => `credits ${amount.toFixed(2)}`);
const formatDate = jest.fn((value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `day ${date.toISOString().slice(0, 10)}`;
});

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

describe('AnomalyScatterPlot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParentSize = { width: 680, height: 300 };
  });

  it('uses supplied formatters for a static SVG, keyboard explorer, and equivalent table', () => {
    const { container } = render(
      <AnomalyScatterPlot
        data={[
          point(),
          point({
            id: 'anomaly-2',
            expenseId: 'expense-2',
            description: 'Late taxi',
            date: new Date('2026-07-02T00:00:00.000Z'),
            amount: 80,
            severity: 'high',
            zScore: 3.4,
          }),
        ]}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Spending anomaly scatter plot' })
    ).toBeInTheDocument();
    const explorer = screen.getByRole('button', {
      name: 'Explore spending anomalies',
    });
    fireEvent.focus(explorer);
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-02. Late taxi. credits 80.00. High severity.'
    );
    fireEvent.keyDown(explorer, { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-01. Large grocery shop. credits 120.00. Medium severity.'
    );
    fireEvent.keyDown(explorer, { key: 'Home' });
    expect(screen.getByRole('status')).toHaveTextContent('Late taxi');
    fireEvent.keyDown(explorer, { key: 'End' });
    expect(screen.getByRole('status')).toHaveTextContent('Large grocery shop');
    fireEvent.keyDown(explorer, { key: 'Escape' });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();

    const table = screen.getByTestId('anomaly-chart-data-table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(table).toHaveTextContent('credits 80.00');
    expect(table).toHaveTextContent('day 2026-07-02');
    expect(formatMoney).toHaveBeenCalled();
    expect(formatDate).toHaveBeenCalled();
    expect(container).not.toHaveTextContent('$');
    expect(container.innerHTML).not.toContain('en-US');
    expect(container.innerHTML).not.toMatch(/linearGradient|radialGradient/i);
  });

  it('copies, validates, and deterministically deduplicates without dropping negatives', () => {
    const source = Object.freeze([
      Object.freeze(
        point({
          id: 'low-copy',
          amount: -12,
          severity: 'low',
          zScore: -9,
        })
      ),
      Object.freeze(
        point({
          id: 'high-copy',
          amount: -18,
          severity: 'high',
          zScore: 2,
        })
      ),
      Object.freeze(
        point({
          id: 'invalid-date',
          expenseId: 'invalid-date-expense',
          date: new Date('invalid'),
        })
      ),
      Object.freeze(
        point({
          id: 'invalid-amount',
          expenseId: 'invalid-amount-expense',
          amount: Number.NaN,
        })
      ),
      Object.freeze(
        point({
          id: 'invalid-score',
          expenseId: 'invalid-score-expense',
          zScore: Number.POSITIVE_INFINITY,
        })
      ),
    ]);

    const normalized = normalizeAnomalyPoints(source as readonly AnomalyPoint[]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]).toMatchObject({
      id: 'high-copy',
      expenseId: 'expense-1',
      amount: -18,
      severity: 'high',
    });
    expect(normalized[0]).not.toBe(source[1]);
    expect(source[0].amount).toBe(-12);

    const rendered = render(
      <AnomalyScatterPlot
        data={source as readonly AnomalyPoint[]}
        normalTransactions={[
          { date: new Date('invalid'), amount: 99 },
          { date: new Date('2026-07-03T00:00:00.000Z'), amount: -4 },
          { date: new Date('2026-07-03T00:00:00.000Z'), amount: -4 },
        ]}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    expect(rendered.container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(rendered.container).toHaveTextContent('credits -18.00');
  });

  it('normalizes expected ranges only when finite and ordered', () => {
    const normalized = normalizeAnomalyPoints([
      point({
        id: 'bad-range',
        hasExpectedRange: true,
        expectedLowerAmount: 80,
        expectedUpperAmount: 20,
      }),
    ]);
    expect(normalized[0].hasExpectedRange).toBe(false);

    render(
      <AnomalyScatterPlot
        data={normalized}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    fireEvent.focus(
      screen.getByRole('button', { name: 'Explore spending anomalies' })
    );
    expect(
      screen.getAllByText(/no expected amount range applies/i).length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/credits 80\.00.*credits 20\.00/i)).not.toBeInTheDocument();
  });

  it('pads singleton and constant domains so every bound stays finite', () => {
    render(
      <AnomalyScatterPlot
        data={[point({ amount: 0 })]}
        normalTransactions={[
          { date: new Date('2026-07-01T00:00:00.000Z'), amount: 0 },
        ]}
      />
    );

    const chart = screen.getByRole('img');
    const xStart = Date.parse(chart.getAttribute('data-x-domain-start') ?? '');
    const xEnd = Date.parse(chart.getAttribute('data-x-domain-end') ?? '');
    const yMin = Number(chart.getAttribute('data-y-domain-min'));
    const yMax = Number(chart.getAttribute('data-y-domain-max'));
    expect(Number.isFinite(xStart)).toBe(true);
    expect(Number.isFinite(xEnd)).toBe(true);
    expect(xStart).toBeLessThan(xEnd);
    expect(Number.isFinite(yMin)).toBe(true);
    expect(Number.isFinite(yMax)).toBe(true);
    expect(yMin).toBeLessThan(yMax);
  });

  it('resets keyboard inspection when the normalized model changes', () => {
    const rendered = render(
      <AnomalyScatterPlot
        data={[point()]}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    fireEvent.focus(
      screen.getByRole('button', { name: 'Explore spending anomalies' })
    );
    expect(screen.getByRole('status')).toHaveTextContent('Large grocery shop');

    rendered.rerender(
      <AnomalyScatterPlot
        data={[
          point({
            id: 'replacement',
            expenseId: 'replacement-expense',
            description: 'Replacement item',
          }),
        ]}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText('Large grocery shop')).not.toBeInTheDocument();
  });

  it('renders a stable responsive empty state', () => {
    const { container } = render(
      <AnomalyScatterPlot
        data={[
          point({ amount: Number.NaN }),
          point({ id: 'duplicate', amount: Number.NaN }),
        ]}
      />
    );
    expect(screen.getByText(/no anomaly data is available/i)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
