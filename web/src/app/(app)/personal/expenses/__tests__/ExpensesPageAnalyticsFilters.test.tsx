import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import PersonalExpensesPage from '../page';

const mockExpenseList = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/app/components/SmartExpenseEntry', () => ({
  __esModule: true,
  default: () => <div data-testid="smart-expense-entry-component" />,
}));

jest.mock('@/app/components/ExpenseVisualization', () => ({
  __esModule: true,
  default: () => <div data-testid="expense-visualization" />,
}));

jest.mock('@/app/components/ExpenseList', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockExpenseList(props);
    return <div data-testid="expense-list" />;
  },
}));

describe('PersonalExpensesPage analytics drill-downs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('passes validated filters, renders their summary, and clears to the personal route', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams(
      'date=2026-07-13&category=food&from=2026-07-01&to=2026-07-31&expenseId=%20expense-42%20&groupId=foreign'
    );

    render(<PersonalExpensesPage />);

    expect(mockExpenseList).toHaveBeenLastCalledWith({
      analyticsFilters: {
        date: '2026-07-13',
        category: 'food',
        from: '2026-07-01',
        to: '2026-07-31',
        expenseId: 'expense-42',
      },
    });
    expect(
      screen.getByRole('region', { name: 'Active analytics filters' })
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Clear analytics filters' })
    );
    expect(mockReplace).toHaveBeenCalledWith('/personal/expenses');
  });

  it('omits malformed and unknown values before passing an empty filter object', () => {
    mockSearchParams = new URLSearchParams(
      'date=2026-02-30&category=Food&from=bad&to=2026-13-01&expenseId=+++&groupId=foreign'
    );

    render(<PersonalExpensesPage />);

    expect(mockExpenseList).toHaveBeenLastCalledWith({ analyticsFilters: {} });
    expect(
      screen.queryByRole('region', { name: 'Active analytics filters' })
    ).not.toBeInTheDocument();
  });

  it('exposes the existing Smart Expense Entry surface as the data-quality anchor', () => {
    render(<PersonalExpensesPage />);

    const anchor = document.getElementById('smart-expense-entry');
    expect(anchor).not.toBeNull();
    expect(anchor).toContainElement(
      screen.getByTestId('smart-expense-entry-component')
    );
  });
});
