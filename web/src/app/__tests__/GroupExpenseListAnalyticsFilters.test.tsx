import { create } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { render, screen, waitFor, within } from '@testing-library/react';

import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ExpenseCategory,
  ExpenseFrequency,
  ExpenseSchema,
  SplitType,
  type Expense,
} from '@/gen/pfinance/v1/types_pb';
import GroupExpenseList from '../components/GroupExpenseList';

let mockGroupExpenses: Expense[] = [];

jest.mock('../context/AuthWithAdminContext', () => ({
  useAuth: () => ({
    user: {
      uid: 'member-1',
      displayName: 'Ari Member',
      email: 'ari@example.com',
      photoURL: null,
    },
  }),
}));

jest.mock('../context/MultiUserFinanceContext', () => ({
  useMultiUserFinance: () => ({
    activeGroup: {
      id: 'group-1',
      members: [
        {
          userId: 'member-1',
          displayName: 'Ari Member',
          email: 'ari@example.com',
        },
      ],
    },
    groupExpenses: mockGroupExpenses,
  }),
}));

const expense = ({
  id,
  groupId,
  description,
  category = ExpenseCategory.FOOD,
  date = '2026-07-13T12:00:00.000Z',
}: {
  id: string;
  groupId: string;
  description: string;
  category?: ExpenseCategory;
  date?: string;
}) =>
  create(ExpenseSchema, {
    id,
    userId: 'member-1',
    groupId,
    description,
    amount: 42,
    category,
    frequency: ExpenseFrequency.ONCE,
    date: timestampFromDate(new Date(date)),
    paidByUserId: 'member-1',
    splitType: SplitType.EQUAL,
  });

const renderList = (
  analyticsFilters?: React.ComponentProps<
    typeof GroupExpenseList
  >['analyticsFilters']
) =>
  render(
    <TooltipProvider>
      <GroupExpenseList
        groupId="group-1"
        analyticsFilters={analyticsFilters}
      />
    </TooltipProvider>
  );

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
});

describe('GroupExpenseList analytics drill-downs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGroupExpenses = [];
  });

  it('applies analytics filters only after enforcing the active group boundary', () => {
    mockGroupExpenses = [
      expense({
        id: 'matching-active-group',
        groupId: 'group-1',
        description: 'Matching household groceries',
      }),
      expense({
        id: 'outside-range',
        groupId: 'group-1',
        description: 'August household groceries',
        date: '2026-08-01T00:00:00.000Z',
      }),
      expense({
        id: 'wrong-category',
        groupId: 'group-1',
        description: 'Household rent',
        category: ExpenseCategory.HOUSING,
      }),
      expense({
        id: 'foreign-group-match',
        groupId: 'group-2',
        description: 'Foreign group groceries',
      }),
    ];

    renderList({
      category: 'food',
      from: '2026-07-01',
      to: '2026-07-31',
    });

    const table = screen.getByRole('table');
    expect(within(table).getByText('Matching household groceries')).toBeVisible();
    expect(within(table).queryByText('August household groceries')).not.toBeInTheDocument();
    expect(within(table).queryByText('Household rent')).not.toBeInTheDocument();
    expect(within(table).queryByText('Foreign group groceries')).not.toBeInTheDocument();
  });

  it('highlights and scrolls to a focused expense in the active group', async () => {
    mockGroupExpenses = [
      expense({
        id: 'focus-active',
        groupId: 'group-1',
        description: 'Focused household expense',
      }),
      expense({
        id: 'focus-foreign',
        groupId: 'group-2',
        description: 'Focused foreign expense',
      }),
    ];

    renderList({ expenseId: 'focus-active' });

    const focusedRow = await screen.findByLabelText(
      'Focused expense Focused household expense'
    );
    expect(focusedRow).toHaveAttribute('aria-current', 'true');
    expect(screen.queryByText('Focused foreign expense')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });
  });

  it('does not fall through to another group when the focused ID is absent', async () => {
    mockGroupExpenses = [
      expense({
        id: 'active-only',
        groupId: 'group-1',
        description: 'Active group expense',
      }),
      expense({
        id: 'focus-foreign',
        groupId: 'group-2',
        description: 'Other household focus',
      }),
    ];

    renderList({ expenseId: 'focus-foreign' });

    expect(
      await screen.findByText(
        'No group expenses match the active analytics filters.'
      )
    ).toBeVisible();
    expect(screen.queryByLabelText(/Focused expense/)).not.toBeInTheDocument();
    expect(screen.queryByText('Other household focus')).not.toBeInTheDocument();
  });
});
