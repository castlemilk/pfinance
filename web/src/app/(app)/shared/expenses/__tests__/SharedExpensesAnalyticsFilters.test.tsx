import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import SharedExpensesPage from '../page';

const mockGroupExpenseList = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ replace: mockReplace }),
}));

jest.mock('@/app/context/AuthWithAdminContext', () => ({
  useAuth: () => ({
    loading: false,
    user: { uid: 'member-1' },
  }),
}));

jest.mock('@/app/context/MultiUserFinanceContext', () => ({
  useMultiUserFinance: () => ({
    activeGroup: { id: 'group-1', name: 'Household', members: [] },
    groupExpenses: [],
    getUserOwedAmount: () => 0,
    getUserOwesAmount: () => 0,
    settleExpense: jest.fn(),
  }),
}));

jest.mock('@/app/components/GroupExpenseForm', () => ({
  __esModule: true,
  default: () => <div data-testid="group-expense-form" />,
}));

jest.mock('@/app/components/GroupExpenseList', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mockGroupExpenseList(props);
    return <div data-testid="group-expense-list" />;
  },
}));

describe('SharedExpensesPage analytics drill-downs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('passes validated filters only to the active group and clears to the shared route', async () => {
    const user = userEvent.setup();
    mockSearchParams = new URLSearchParams(
      'category=food&from=2026-07-01&to=2026-07-31&expenseId=%20expense-42%20&groupId=group-2'
    );

    render(<SharedExpensesPage />);

    expect(mockGroupExpenseList).toHaveBeenLastCalledWith({
      groupId: 'group-1',
      analyticsFilters: {
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
    expect(mockReplace).toHaveBeenCalledWith('/shared/expenses');
  });

  it('omits malformed filters before passing an empty filter object', () => {
    mockSearchParams = new URLSearchParams(
      'date=2026-02-30&category=Food&from=bad&to=2026-13-01&expenseId=+++&groupId=group-2'
    );

    render(<SharedExpensesPage />);

    expect(mockGroupExpenseList).toHaveBeenLastCalledWith({
      groupId: 'group-1',
      analyticsFilters: {},
    });
    expect(
      screen.queryByRole('region', { name: 'Active analytics filters' })
    ).not.toBeInTheDocument();
  });
});
