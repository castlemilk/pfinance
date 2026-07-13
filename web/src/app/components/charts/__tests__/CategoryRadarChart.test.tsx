import { render, screen } from '@testing-library/react';

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
    expect(screen.queryByText('Invalid current')).not.toBeInTheDocument();
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
