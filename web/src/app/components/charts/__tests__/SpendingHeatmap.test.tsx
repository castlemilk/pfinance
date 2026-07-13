import { fireEvent, render, screen } from '@testing-library/react';

import type { Expense } from '@/app/types';

import SpendingHeatmap from '../SpendingHeatmap';

let mockParentSize = { width: 720, height: 240 };

jest.mock('@visx/responsive', () => ({
  ParentSize: ({
    children,
  }: {
    children: (size: { width: number; height: number }) => React.ReactNode;
  }) => children(mockParentSize),
}));

const formatMoney = jest.fn((value: number) => `credits ${value.toFixed(2)}`);
const formatDate = jest.fn(
  (value: Date | string, options?: Intl.DateTimeFormatOptions) => {
    const date = typeof value === 'string' ? new Date(value) : value;
    const key = date.toISOString().slice(0, 10);
    if (options?.weekday === 'short' && options.month === undefined) {
      return `weekday ${date.getUTCDay()}`;
    }
    if (options?.month === 'short' && options.day === undefined) {
      return `month ${date.getUTCMonth() + 1}`;
    }
    return `day ${key}`;
  }
);

describe('SpendingHeatmap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockParentSize = { width: 720, height: 240 };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses caller-owned formatters and gives valued cells equivalent keyboard drill-down', () => {
    const onDayClick = jest.fn();
    const data = Object.freeze({
      maxValue: 25,
      days: Object.freeze([
        Object.freeze({
          date: '2026-07-01',
          value: 25,
          count: 2,
          categories: Object.freeze([
            Object.freeze({ category: 'Food', amount: 10, count: 1 }),
            Object.freeze({ category: 'Housing', amount: 15, count: 1 }),
          ]),
        }),
        Object.freeze({ date: '2026-07-02', value: 0, count: 0 }),
      ]),
    });

    const { container } = render(
      <SpendingHeatmap
        data={data as never}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    expect(screen.getByRole('img', { name: /daily spending heatmap/i })).toBeInTheDocument();
    const cell = screen.getByRole('button', {
      name: 'day 2026-07-01, credits 25.00, 2 transactions',
    });
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.focus(cell);
    expect(screen.getByText('day 2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('credits 25.00')).toBeInTheDocument();
    expect(screen.getByText('credits 15.00')).toBeInTheDocument();
    expect(screen.getByText('credits 10.00')).toBeInTheDocument();
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onDayClick).toHaveBeenCalledWith('2026-07-01');

    fireEvent.keyDown(cell, { key: 'Escape' });
    expect(screen.queryByText('credits 25.00')).not.toBeInTheDocument();
    expect(formatMoney).toHaveBeenCalled();
    expect(formatDate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ month: 'short' })
    );
    expect(formatDate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ weekday: 'short' })
    );
    expect(container).not.toHaveTextContent('$');
    expect(container).not.toHaveTextContent('en-US');
  });

  it('keeps frozen expense inputs immutable and routes every expense action through the caller', () => {
    const onDayClick = jest.fn();
    const expenses = Object.freeze([
      Object.freeze({
        id: 'expense-1',
        description: 'Frozen lunch',
        amount: 9,
        category: 'Food',
        date: new Date('2026-07-01T23:30:00.000Z'),
        frequency: 'once',
      }),
    ]) as unknown as Expense[];
    const data = Object.freeze({
      maxValue: 9,
      days: Object.freeze([
        Object.freeze({
          date: '2026-07-01',
          value: 9,
          count: 1,
          categories: Object.freeze([
            Object.freeze({ category: 'Food', amount: 9, count: 1 }),
          ]),
        }),
      ]),
    });

    render(
      <SpendingHeatmap
        data={data as never}
        expenses={expenses}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    fireEvent.focus(screen.getByRole('button', { name: /day 2026-07-01, credits 9.00/i }));
    const expense = screen.getByRole('button', { name: /Frozen lunch.*credits 9.00/i });
    expect(expense).toHaveClass('min-h-10');
    fireEvent.click(expense);
    fireEvent.click(screen.getByRole('button', { name: /view all expenses/i }));
    expect(onDayClick).toHaveBeenNthCalledWith(1, '2026-07-01');
    expect(onDayClick).toHaveBeenNthCalledWith(2, '2026-07-01');
  });

  it('clears focused detail on blur and renders a safe fallback at tiny sizes', () => {
    const data = {
      maxValue: 4,
      days: [{ date: '2026-07-01', value: 4, count: 1 }],
    };
    const first = render(
      <SpendingHeatmap data={data} formatMoney={formatMoney} formatDate={formatDate} />
    );
    const cell = screen.getByRole('button', { name: /day 2026-07-01/i });
    fireEvent.focus(cell);
    expect(screen.getByText('credits 4.00')).toBeInTheDocument();
    fireEvent.blur(cell);
    expect(screen.queryByText('credits 4.00')).not.toBeInTheDocument();
    first.unmount();

    mockParentSize = { width: 8, height: 8 };
    const tiny = render(<SpendingHeatmap data={data} />);
    expect(tiny.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('keeps the central formatter fallback working for existing callers', () => {
    const { container } = render(
      <SpendingHeatmap
        data={{ maxValue: 12, days: [{ date: '2026-07-01', value: 12, count: 1 }] }}
      />
    );

    fireEvent.focus(screen.getByRole('button', { name: /2026.*12/i }));
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });
});
