import { fireEvent, render, screen } from '@testing-library/react';

import CategoryRadarChart from '../CategoryRadarChart';

let mockParentSize = { width: 640, height: 360 };

jest.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children(mockParentSize),
}));

const formatMoney = jest.fn((value: number) => `AUD ${value.toFixed(2)}`);

describe('CategoryRadarChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParentSize = { width: 640, height: 360 };
  });

  it('renders one category as a truthful visible comparison with caller formatting', () => {
    const data = Object.freeze([
      Object.freeze({
        category: 'Food',
        currentValue: 120,
        previousValue: 80,
        budgetValue: 150,
        maxValue: 150,
      }),
    ]);

    const { container } = render(
      <CategoryRadarChart data={data} formatMoney={formatMoney} />
    );

    expect(
      screen.getByRole('img', { name: /food category spending comparison/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId('single-category-comparison')).toBeVisible();
    expect(screen.getByText('AUD 120.00')).toBeInTheDocument();
    expect(screen.getByText('AUD 80.00')).toBeInTheDocument();
    expect(screen.getByText('AUD 150.00')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity|\$|en-US/);
    expect(data[0].currentValue).toBe(120);
  });

  it('copies and validates axes without mutating frozen caller data', () => {
    const data = Object.freeze([
      Object.freeze({
        category: 'Housing',
        currentValue: 300,
        previousValue: 250,
        budgetValue: Number.NaN,
        maxValue: 300,
      }),
      Object.freeze({
        category: 'Invalid current',
        currentValue: Number.POSITIVE_INFINITY,
        previousValue: 20,
        maxValue: 20,
      }),
      Object.freeze({
        category: 'Food',
        currentValue: 100,
        previousValue: 90,
        maxValue: 100,
      }),
    ]);

    const { container } = render(
      <CategoryRadarChart data={data} formatMoney={formatMoney} />
    );

    expect(
      screen.getByRole('img', { name: /category spending comparison for 2 categories/i })
    ).toBeInTheDocument();
    expect(screen.getByText('Housing')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.queryByText('Invalid Current')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
    expect(formatMoney).not.toHaveBeenCalledWith(Number.NaN);
    expect('budgetValue' in data[0] ? data[0].budgetValue : undefined).toBeNaN();
    expect(container.innerHTML).not.toMatch(/#(?:[0-9a-f]{3}){1,2}/i);
  });

  it('keeps exact zero bars at zero while preserving a visible marker for tiny positives', () => {
    render(
      <CategoryRadarChart
        data={[
          {
            category: 'Food',
            currentValue: 0,
            previousValue: 100,
            budgetValue: 0.01,
            maxValue: 100,
          },
        ]}
        formatMoney={formatMoney}
      />
    );

    expect(screen.getByTestId('category-bar-current')).toHaveStyle({
      width: '0%',
    });
    expect(screen.getByTestId('category-bar-previous')).toHaveStyle({
      width: '100%',
    });
    expect(screen.getByTestId('category-bar-budget')).toHaveStyle({
      width: '2%',
    });
  });

  it('scales sub-unit values against the actual largest positive amount', () => {
    render(
      <CategoryRadarChart
        data={[
          {
            category: 'Food',
            currentValue: 0.5,
            previousValue: 0.25,
            budgetValue: 0.1,
            maxValue: 1,
          },
        ]}
        formatMoney={formatMoney}
      />
    );

    expect(screen.getByTestId('category-bar-current')).toHaveStyle({
      width: '100%',
    });
    expect(screen.getByTestId('category-bar-previous')).toHaveStyle({
      width: '50%',
    });
    expect(screen.getByTestId('category-bar-budget')).toHaveStyle({
      width: '20%',
    });
  });

  it('normalizes case-equivalent duplicate axes before choosing a chart form', () => {
    render(
      <CategoryRadarChart
        data={[
          {
            category: '  food ',
            currentValue: 10,
            previousValue: 4,
            budgetValue: 20,
            maxValue: 20,
          },
          {
            category: 'FOOD',
            currentValue: 5,
            previousValue: 6,
            budgetValue: Number.NaN,
            maxValue: 6,
          },
          {
            category: '   ',
            currentValue: 999,
            previousValue: 999,
            maxValue: 999,
          },
          {
            category: 'Housing',
            currentValue: -1,
            previousValue: Number.POSITIVE_INFINITY,
            maxValue: 4,
          },
        ]}
        formatMoney={formatMoney}
      />
    );

    expect(
      screen.getByRole('img', { name: 'Food category spending comparison' })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Food')).toHaveLength(1);
    expect(screen.queryByText('Housing')).not.toBeInTheDocument();
    expect(screen.getByText('AUD 15.00')).toBeInTheDocument();
    expect(screen.getByText('AUD 10.00')).toBeInTheDocument();
    expect(screen.getByText('AUD 20.00')).toBeInTheDocument();
    expect(screen.queryByText(/999/)).not.toBeInTheDocument();
  });

  it('shows a visible polygon legend and clears stale tooltip snapshots on data changes', () => {
    const initial = [
      {
        category: 'Food',
        currentValue: 10,
        previousValue: 8,
        budgetValue: 12,
        maxValue: 12,
      },
      {
        category: 'Housing',
        currentValue: 20,
        previousValue: 18,
        budgetValue: 25,
        maxValue: 25,
      },
      {
        category: 'Travel',
        currentValue: 5,
        previousValue: 4,
        budgetValue: 8,
        maxValue: 8,
      },
    ];
    const rendered = render(
      <CategoryRadarChart data={initial} formatMoney={formatMoney} />
    );

    const legend = screen.getByTestId('category-radar-legend');
    expect(legend).toBeVisible();
    expect(withinLegend(legend, 'Current')).toBeInTheDocument();
    expect(withinLegend(legend, 'Previous')).toBeInTheDocument();
    expect(withinLegend(legend, 'Budget')).toBeInTheDocument();

    fireEvent.mouseMove(screen.getByTestId('radar-axis-hit-0'), {
      clientX: 120,
      clientY: 80,
    });
    expect(screen.getByRole('tooltip')).toHaveTextContent('AUD 12.00');

    rendered.rerender(
      <CategoryRadarChart
        data={initial.map((axis) => ({
          category: axis.category,
          currentValue: axis.currentValue + 100,
          previousValue: axis.previousValue,
          maxValue: axis.currentValue + 100,
        }))}
        formatMoney={formatMoney}
      />
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(withinLegend(screen.getByTestId('category-radar-legend'), 'Budget')).not.toBeInTheDocument();
  });

  it('uses an unclipped compact comparison for many axes at narrow widths', () => {
    mockParentSize = { width: 280, height: 360 };
    render(
      <CategoryRadarChart
        data={[
          {
            category: 'Transportation and long-distance commuting',
            currentValue: 100,
            previousValue: 80,
            maxValue: 100,
          },
          { category: 'Housing', currentValue: 90, previousValue: 70, maxValue: 90 },
          { category: 'Food', currentValue: 60, previousValue: 50, maxValue: 60 },
        ]}
        formatMoney={(value) => `A very long currency value ${value.toFixed(2)}`}
      />
    );

    expect(screen.getByTestId('compact-category-comparison')).toHaveClass(
      'min-w-0'
    );
    expect(screen.queryByRole('img', { name: /3 categories/ })).toBeInTheDocument();
    expect(document.querySelector('svg')).not.toBeInTheDocument();
    expect(
      screen.getByText('Transportation And Long-distance Commuting')
    ).toHaveClass('break-words');
  });

  it('renders a stable empty state when no finite axes are available', () => {
    const { container } = render(
      <CategoryRadarChart
        data={[
          {
            category: '',
            currentValue: 1,
            previousValue: 2,
            maxValue: 2,
          },
          {
            category: 'Food',
            currentValue: Number.NaN,
            previousValue: 2,
            maxValue: 2,
          },
        ]}
      />
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No category comparison data is available.'
    );
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('uses a safe small-size fallback', () => {
    mockParentSize = { width: 8, height: 8 };
    const { container } = render(
      <CategoryRadarChart
        data={[
          { category: 'Food', currentValue: 1, previousValue: 2, maxValue: 2 },
        ]}
      />
    );

    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});

function withinLegend(legend: HTMLElement, label: string) {
  return Array.from(legend.querySelectorAll('span')).find(
    (element) => element.textContent === label
  ) ?? null;
}
