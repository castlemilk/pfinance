import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

    expect(
      screen.getByRole('group', { name: /daily spending heatmap/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: /daily spending heatmap/i })
    ).not.toBeInTheDocument();
    const cell = screen.getByRole('button', {
      name: 'day 2026-07-01, credits 25.00, 2 transactions',
    });
    expect(cell).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('button')).toHaveLength(1);

    fireEvent.focus(cell);
    expect(screen.getByText('day 2026-07-01')).toBeInTheDocument();
    expect(screen.getByText('credits 25.00')).toHaveClass('font-mono');
    expect(screen.getByText('credits 15.00')).toHaveClass('font-mono');
    expect(screen.getByText('credits 10.00')).toHaveClass('font-mono');
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
      Object.freeze({
        id: 'expense-invalid',
        description: 'Invalid amount',
        amount: Number.NaN,
        category: 'Other',
        date: new Date('2026-07-01T12:00:00.000Z'),
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
            Object.freeze({ category: 'Invalid category', amount: 4, count: Number.NaN }),
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
    expect(screen.queryByText('Invalid amount')).not.toBeInTheDocument();
    expect(screen.queryByText('Invalid category')).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('NaN');
    const expense = screen.getByRole('button', { name: /Frozen lunch.*credits 9.00/i });
    expect(expense).toHaveClass('min-h-10');
    fireEvent.click(expense);
    fireEvent.click(screen.getByRole('button', { name: /view all expenses/i }));
    expect(onDayClick).toHaveBeenNthCalledWith(1, '2026-07-01');
    expect(onDayClick).toHaveBeenNthCalledWith(2, '2026-07-01');
  });

  it('keeps detail available while focus moves through actions, then closes outside', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onDayClick = jest.fn();
    const expenses = [
      {
        id: 'shared-id',
        description: 'First item',
        amount: 3,
        category: 'Food' as const,
        date: new Date('2026-07-01T00:00:00.000Z'),
        frequency: 'once' as const,
      },
      {
        id: 'shared-id',
        description: 'Second item',
        amount: 2,
        category: 'Food' as const,
        date: new Date('2026-07-01T00:00:00.000Z'),
        frequency: 'once' as const,
      },
    ];
    render(
      <>
        <SpendingHeatmap
          data={{
            maxValue: 5,
            days: [{ date: '2026-07-01', value: 5, count: 2 }],
          }}
          expenses={expenses}
          onDayClick={onDayClick}
          formatMoney={formatMoney}
          formatDate={formatDate}
        />
        <button type="button">After chart</button>
      </>
    );

    const cell = screen.getByRole('button', { name: /day 2026-07-01/i });
    fireEvent.focus(cell);
    expect(screen.getByText('credits 5.00')).toBeInTheDocument();

    const firstExpense = screen.getByRole('button', { name: /First item/i });
    fireEvent.blur(cell, { relatedTarget: firstExpense });
    firstExpense.focus();
    expect(firstExpense).toHaveFocus();
    expect(screen.getByText('credits 5.00')).toBeInTheDocument();

    await user.tab();
    expect(screen.getByRole('button', { name: /Second item/i })).toHaveFocus();
    expect(screen.getByText('credits 5.00')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: /view all expenses/i })).toHaveFocus();
    expect(screen.getByText('credits 5.00')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'After chart' })).toHaveFocus();
    expect(screen.queryByText('credits 5.00')).not.toBeInTheDocument();
  });

  it('clears focused detail on outside blur and replacement data', () => {
    const data = {
      maxValue: 4,
      days: [{ date: '2026-07-01', value: 4, count: 1 }],
    };
    const onDayClick = jest.fn();
    const first = render(
      <SpendingHeatmap
        data={data}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    const cell = screen.getByRole('button', { name: /day 2026-07-01/i });
    fireEvent.focus(cell);
    expect(screen.getByText('credits 4.00')).toBeInTheDocument();
    fireEvent.blur(cell);
    expect(screen.queryByText('credits 4.00')).not.toBeInTheDocument();

    fireEvent.focus(cell);
    first.rerender(
      <SpendingHeatmap
        data={{
          maxValue: 4,
          days: [{ date: '2026-07-01', value: 4, count: 1 }],
        }}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    expect(screen.queryByText('credits 4.00')).not.toBeInTheDocument();

    fireEvent.focus(screen.getByRole('button', { name: /day 2026-07-01/i }));
    first.rerender(
      <SpendingHeatmap
        data={{
          maxValue: 7,
          days: [{ date: '2026-07-02', value: 7, count: 1 }],
        }}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );
    expect(screen.queryByText('credits 4.00')).not.toBeInTheDocument();
    expect(screen.queryByText('day 2026-07-01')).not.toBeInTheDocument();
    first.unmount();

    mockParentSize = { width: 8, height: 8 };
    const tiny = render(<SpendingHeatmap data={data} />);
    expect(tiny.container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('is a static accessible summary without dead controls when no callback is supplied', () => {
    const { container } = render(
      <SpendingHeatmap
        data={{ maxValue: 12, days: [{ date: '2026-07-01', value: 12, count: 1 }] }}
      />
    );

    const image = screen.getByRole('img', { name: 'Daily spending heatmap' });
    expect(image).toHaveAccessibleDescription(/1 active day.*12/i);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.querySelector('[tabindex="0"]')).not.toBeInTheDocument();
    expect(container.querySelector('.cursor-pointer')).not.toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
  });

  it('normalizes duplicate days and category aggregates without duplicate React keys', () => {
    const onDayClick = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <SpendingHeatmap
        data={{
          maxValue: 999,
          days: [
            {
              date: '2026-07-01',
              value: 4,
              count: 1,
              categories: [
                { category: 'Food', amount: 2, count: 1 },
                { category: 'Food', amount: 1, count: 1 },
              ],
            },
            {
              date: '2026-07-01',
              value: 6,
              count: 2,
              categories: [{ category: 'Food', amount: 3, count: 1 }],
            },
            { date: 'not-a-date', value: 500, count: 1 },
          ],
        }}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    const cell = screen.getByRole('button', {
      name: 'day 2026-07-01, credits 10.00, 3 transactions',
    });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.focus(cell);
    expect(screen.getByText('credits 6.00')).toBeInTheDocument();
    expect(screen.getAllByText('Food')).toHaveLength(1);
    expect(consoleError.mock.calls.flat().join(' ')).not.toMatch(/same key/i);
    consoleError.mockRestore();
  });

  it.each([
    ['three months', '2026-04-13', '2026-07-13'],
    ['one year', '2025-07-13', '2026-07-13'],
  ])(
    'keeps %s day targets usable in a labelled mobile scroll viewport',
    (_label, start, end) => {
      mockParentSize = { width: 320, height: 240 };

      render(
        <SpendingHeatmap
          data={{
            maxValue: 10,
            days: [
              { date: start, value: 5, count: 1 },
              { date: end, value: 10, count: 1 },
            ],
          }}
          onDayClick={jest.fn()}
          formatMoney={formatMoney}
          formatDate={formatDate}
        />
      );

      const viewport = screen.getByRole('region', {
        name: /scrollable daily spending calendar/i,
      });
      expect(viewport).toHaveClass('overflow-x-auto');
      expect(viewport).toHaveClass('overflow-y-auto');
      expect(Number(viewport.querySelector('svg')?.getAttribute('width'))).toBeGreaterThan(
        mockParentSize.width
      );
      screen.getAllByRole('button', { name: /day 20/i }).forEach((cell) => {
        expect(Number(cell.getAttribute('width'))).toBeGreaterThanOrEqual(40);
        expect(Number(cell.getAttribute('height'))).toBeGreaterThanOrEqual(40);
      });
    }
  );

  it('uses roving day focus, tabs directly into detail, and restores focus on Escape', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    const onDayClick = jest.fn();
    render(
      <SpendingHeatmap
        data={{
          maxValue: 8,
          days: [
            { date: '2026-07-01', value: 5, count: 1 },
            { date: '2026-07-02', value: 8, count: 1 },
          ],
        }}
        expenses={[
          {
            id: 'first-expense',
            description: 'First day lunch',
            amount: 5,
            category: 'Food',
            date: new Date('2026-07-01T10:00:00.000Z'),
            frequency: 'once',
          },
        ]}
        onDayClick={onDayClick}
        formatMoney={formatMoney}
        formatDate={formatDate}
      />
    );

    const first = screen.getByRole('button', { name: /day 2026-07-01/i });
    const second = screen.getByRole('button', { name: /day 2026-07-02/i });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');

    await user.tab();
    expect(first).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: /First day lunch/i })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(first).toHaveFocus();
    expect(screen.queryByText('First day lunch')).not.toBeInTheDocument();

    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    expect(first).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(second, { key: 'Home' });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'End' });
    expect(second).toHaveFocus();
  });
});
