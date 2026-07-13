import { fireEvent, render, screen } from '@testing-library/react';

import { mapWaterfallResponse } from '@/app/metrics/analyticsMappers';
import { WaterfallEntryType } from '@/gen/pfinance/v1/types_pb';

import WaterfallChart from '../WaterfallChart';

import type { GetWaterfallDataResponse } from '@/gen/pfinance/v1/finance_service_pb';

let mockParentSize = { width: 640, height: 340 };

jest.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children(mockParentSize),
}));

describe('WaterfallChart', () => {
  beforeEach(() => {
    mockParentSize = { width: 640, height: 340 };
  });

  it('renders a mapped deduction from the prior balance and preserves its sign', () => {
    const formatMoney = jest.fn((value: number, compact?: boolean) =>
      compact ? `compact ${value}` : `AUD ${value.toFixed(2)}`
    );
    const model = mapWaterfallResponse({
      entries: [
        {
          label: 'Gross Income',
          amountCents: BigInt(100_000),
          entryType: WaterfallEntryType.INCOME,
          runningTotalCents: BigInt(100_000),
        },
        {
          label: 'EXPENSE_CATEGORY_FOOD',
          amountCents: BigInt(25_000),
          entryType: WaterfallEntryType.EXPENSE,
          runningTotalCents: BigInt(75_000),
        },
      ],
      periodLabel: 'July 2026',
    } as GetWaterfallDataResponse);
    const { container } = render(
      <WaterfallChart
        data={model.data}
        formatMoney={formatMoney}
      />
    );

    expect(screen.getByText('compact -250')).toBeInTheDocument();
    expect(formatMoney).toHaveBeenCalledWith(-250, true);
    expect(container).not.toHaveTextContent('$');
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    const expenseBar = container.querySelector(
      'rect[fill="var(--chart-1)"]'
    );
    const incomeBar = container.querySelector(
      'rect[fill="var(--chart-2)"]'
    );
    expect(expenseBar).not.toBeNull();
    expect(incomeBar).not.toBeNull();
    expect(expenseBar?.getAttribute('y')).toBe(incomeBar?.getAttribute('y'));
    expect(Number(expenseBar?.getAttribute('height'))).toBeGreaterThan(0);
    expect(expenseBar).not.toHaveStyle({ cursor: 'pointer' });
    fireEvent.mouseMove(expenseBar as SVGRectElement, {
      clientX: 180,
      clientY: 120,
    });

    expect(screen.getByText('Amount: AUD -250.00')).toBeInTheDocument();
    expect(screen.getByText('Running Total: AUD 750.00')).toBeInTheDocument();
  });

  it('keeps the empty state free of invalid chart geometry', () => {
    const { container } = render(<WaterfallChart data={[]} />);

    expect(screen.getByText(/no data available/i)).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('keeps a long backend sequence readable inside a keyboard-scrollable rail', () => {
    mockParentSize = { width: 320, height: 340 };
    const data = Array.from({ length: 12 }, (_, index) => ({
      label: `Category ${index + 1}`,
      amount: index === 0 ? 1_000 : -50,
      type: index === 0 ? ('income' as const) : ('expense' as const),
      runningTotal: 1_000 - index * 50,
      color: index === 0 ? 'var(--chart-2)' : 'var(--chart-1)',
    }));

    const { container } = render(<WaterfallChart data={data} />);

    const rail = screen.getByRole('region', {
      name: 'Scrollable money-flow chart',
    });
    expect(rail).toHaveAttribute('tabindex', '0');
    expect(rail).toHaveClass(
      'max-w-full',
      'overflow-x-auto',
      'overscroll-x-contain'
    );
    expect(Number(container.querySelector('svg')?.getAttribute('width'))).toBeGreaterThan(
      mockParentSize.width
    );
  });
});
