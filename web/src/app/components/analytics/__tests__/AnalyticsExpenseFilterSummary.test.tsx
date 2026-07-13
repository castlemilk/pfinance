import { fireEvent, render, screen } from '@testing-library/react';

import { AnalyticsExpenseFilterSummary } from '../AnalyticsExpenseFilterSummary';

describe('AnalyticsExpenseFilterSummary', () => {
  it('names every active analytics filter and exposes one tactile clear action', () => {
    const onClear = jest.fn();

    const { container } = render(
      <AnalyticsExpenseFilterSummary
        filters={{
          date: '2026-07-13',
          category: 'transportation',
          from: '2026-07-01',
          to: '2026-07-31',
          expenseId: 'expense-42',
        }}
        onClear={onClear}
      />
    );

    const summary = screen.getByRole('region', {
      name: 'Active analytics filters',
    });
    expect(summary).toHaveTextContent('Date');
    expect(summary).toHaveTextContent('13 Jul 2026');
    expect(summary).toHaveTextContent('Category');
    expect(summary).toHaveTextContent('Transportation');
    expect(summary).toHaveTextContent('Range');
    expect(summary).toHaveTextContent('1 Jul 2026 to 31 Jul 2026');
    expect(summary).toHaveTextContent('Focused expense');
    expect(summary).toHaveTextContent('Highlighted below');
    expect(summary).not.toHaveTextContent('expense-42');
    expect(summary).toHaveClass('rounded-2xl');
    expect(container.querySelector('[class*="rounded-full"]')).toBeNull();

    const clear = screen.getByRole('button', {
      name: 'Clear analytics filters',
    });
    expect(clear).toHaveClass('min-h-10');
    expect(clear).toHaveClass('transition-transform');
    expect(clear).toHaveClass('active:scale-[0.96]');
    expect(clear).toHaveClass(
      'motion-reduce:transition-none',
      'motion-reduce:active:scale-100'
    );

    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when no approved filter is active', () => {
    const { container } = render(
      <AnalyticsExpenseFilterSummary filters={{}} onClear={jest.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByRole('button', { name: 'Clear analytics filters' })
    ).not.toBeInTheDocument();
  });

  it('renders only normalized filters when called with malformed runtime values', () => {
    render(
      <AnalyticsExpenseFilterSummary
        filters={{
          date: '2026-02-30',
          category: 'Food',
          expenseId: ' expense-42 ',
        } as never}
        onClear={jest.fn()}
      />
    );

    const summary = screen.getByRole('region', {
      name: 'Active analytics filters',
    });
    expect(summary).toHaveTextContent('Focused expense');
    expect(summary).toHaveTextContent('Highlighted below');
    expect(summary).not.toHaveTextContent('expense-42');
    expect(summary).not.toHaveTextContent('Date');
    expect(summary).not.toHaveTextContent('Category');
  });
});
