import { fireEvent, render, screen, within } from '@testing-library/react';

import CategoryStackedTrendChart from '../CategoryStackedTrendChart';

let mockParentSize = { width: 640, height: 260 };

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

const formatMoney = jest.fn((value: number, compact?: boolean) =>
  compact ? `compact ${value}` : `credits ${value}`
);
const formatDate = jest.fn((value: Date | string) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `day ${date.toISOString().slice(0, 10)}`;
});

describe('CategoryStackedTrendChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParentSize = { width: 640, height: 260 };
  });

  it('sorts a copied finite timeline and uses caller formatters for keyboard inspection', () => {
    const categories = Object.freeze(['Utilities', 'Shopping']);
    const points = Object.freeze([
      Object.freeze({
        date: '2026-07-08',
        label: 'Second',
        total: 50,
        categories: Object.freeze({ Utilities: 20, Shopping: 30 }),
      }),
      Object.freeze({
        date: 'invalid',
        label: 'Invalid',
        total: 999,
        categories: Object.freeze({ Utilities: 999 }),
      }),
      Object.freeze({
        date: '2026-07-01',
        label: 'First',
        total: 30,
        categories: Object.freeze({ Utilities: 10, Shopping: 20 }),
      }),
    ]);

    const { container } = render(
      <CategoryStackedTrendChart
        points={points as never}
        categories={categories as never}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    const chart = screen.getByRole('img', { name: /category spending over time/i });
    expect(chart).toHaveAttribute('data-x-domain-start', '2026-07-01T00:00:00.000Z');
    expect(chart).toHaveAttribute('data-x-domain-end', '2026-07-08T00:00:00.000Z');
    const overlay = screen.getByTestId('category-chart-overlay');
    expect(overlay).toHaveAttribute('type', 'button');
    fireEvent.focus(overlay);
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-01. Total credits 30. Utilities credits 10. Shopping credits 20.'
    );
    fireEvent.keyDown(overlay, { key: 'ArrowRight' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-08. Total credits 50. Utilities credits 20. Shopping credits 30.'
    );
    fireEvent.keyDown(overlay, { key: 'Home' });
    expect(screen.getByRole('status')).toHaveTextContent('day 2026-07-01');
    fireEvent.keyDown(overlay, { key: 'End' });
    expect(screen.getByRole('status')).toHaveTextContent('day 2026-07-08');
    fireEvent.blur(overlay);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(formatMoney).toHaveBeenCalledWith(expect.any(Number), true);
    expect(formatDate).toHaveBeenCalled();
    expect(container).not.toHaveTextContent('$');
    expect(container).not.toHaveTextContent('en-US');
    expect(container.innerHTML).not.toMatch(/#(?:[0-9a-f]{3}){1,2}/i);
  });

  it('keeps the legend outside a bounded responsive plot and uses chart tokens', () => {
    render(
      <CategoryStackedTrendChart
        points={[{
          date: '2026-07-01',
          label: 'First',
          total: 30,
          categories: { Utilities: 10, Shopping: 20 },
        }]}
        categories={['Utilities', 'Shopping']}
      />
    );

    const layout = screen.getByTestId('category-chart-layout');
    const plot = screen.getByTestId('category-chart-plot');
    const legend = screen.getByTestId('category-chart-legend');
    expect(layout).toHaveClass('flex', 'h-full', 'min-h-0', 'flex-col');
    expect(plot).toHaveClass('relative', 'min-h-0', 'flex-1');
    expect(legend).toHaveClass('shrink-0');
    expect(plot).not.toContainElement(legend);
    expect(screen.getByRole('img')).toHaveAttribute('height', '260');
    within(legend)
      .getAllByTestId('category-color')
      .forEach((swatch) =>
        expect(swatch).toHaveAttribute(
          'data-color-token',
          expect.stringMatching(/var\(--chart-/)
        )
      );
  });

  it('handles empty, singleton, non-finite, and fallback formatter inputs safely', () => {
    const empty = render(<CategoryStackedTrendChart points={[]} categories={[]} />);
    expect(screen.getByText(/no category trend data/i)).toBeInTheDocument();
    expect(empty.container.innerHTML).not.toMatch(/NaN|Infinity/);
    empty.unmount();

    const singleton = render(
      <CategoryStackedTrendChart
        points={[
          { date: 'bad', label: 'Bad', total: Number.NaN, categories: { Food: 8 } },
          { date: '2026-07-02', label: 'Bad category', total: 8, categories: { Food: Number.NaN } },
          { date: '2026-07-01', label: 'One', total: 8, categories: { Food: 8 } },
        ]}
        categories={['Food']}
      />
    );
    const chart = screen.getByRole('img', { name: /category spending over time/i });
    expect(Date.parse(chart.getAttribute('data-x-domain-start') ?? '')).toBeLessThan(
      Date.parse(chart.getAttribute('data-x-domain-end') ?? '')
    );
    expect(Date.parse(chart.getAttribute('data-x-domain-end') ?? '')).toBeLessThan(
      Date.parse('2026-07-02T00:00:00.000Z')
    );
    expect(singleton.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('derives totals from the plotted categories and normalizes aliases and duplicate dates', () => {
    render(
      <CategoryStackedTrendChart
        points={[
          {
            date: '2026-07-01',
            label: 'Earlier duplicate',
            total: 900,
            categories: { ' Food ': 1, Food: 2, Housing: 3 },
          },
          {
            date: '2026-07-01',
            label: 'Chosen duplicate',
            total: 999,
            categories: { ' Food ': 5, Food: 10, Housing: 20 },
          },
        ]}
        categories={[' Food ', 'Food', 'Housing', 'Housing', '   ']}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    const chart = screen.getByRole('img', { name: /category spending over time/i });
    expect(Number(chart.getAttribute('data-y-domain-max'))).toBeLessThan(999);
    const legend = screen.getByTestId('category-chart-legend');
    expect(within(legend).getAllByText('Food')).toHaveLength(1);
    expect(within(legend).getAllByText('Housing')).toHaveLength(1);
    expect(within(legend).queryByText(/^\s+$/)).not.toBeInTheDocument();

    const overlay = screen.getByTestId('category-chart-overlay');
    fireEvent.focus(overlay);
    expect(screen.getByRole('status')).toHaveTextContent(
      'day 2026-07-01. Total credits 35. Food credits 15. Housing credits 20.'
    );
    expect(screen.getByText('Total: credits 35')).toBeInTheDocument();
  });

  it('clears stale inspection on replacement and withholds legends for sanitized-empty data', () => {
    const rendered = render(
      <CategoryStackedTrendChart
        points={[
          {
            date: '2026-07-01',
            label: 'First',
            total: 10,
            categories: { Food: 10 },
          },
        ]}
        categories={['Food']}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    fireEvent.focus(screen.getByTestId('category-chart-overlay'));
    expect(screen.getByRole('status')).toHaveTextContent('day 2026-07-01');

    rendered.rerender(
      <CategoryStackedTrendChart
        points={[
          {
            date: '2026-07-01',
            label: 'First',
            total: 10,
            categories: { Food: 10 },
          },
        ]}
        categories={['Food']}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByText('Total: credits 10')).not.toBeInTheDocument();

    fireEvent.focus(screen.getByTestId('category-chart-overlay'));
    expect(screen.getByRole('status')).toHaveTextContent('day 2026-07-01');

    rendered.rerender(
      <CategoryStackedTrendChart
        points={[
          {
            date: 'invalid',
            label: 'Invalid replacement',
            total: 20,
            categories: { Food: 20 },
          },
        ]}
        categories={['Food', 'Food', '   ']}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    expect(screen.getByText(/no category trend data/i)).toBeInTheDocument();
    expect(screen.queryByTestId('category-chart-overlay')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('category-chart-legend')).not.toBeInTheDocument();
    expect(screen.queryByText('credits 10')).not.toBeInTheDocument();
  });
});
