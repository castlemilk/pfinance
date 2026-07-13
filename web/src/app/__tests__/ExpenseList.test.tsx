import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ExpenseList from '../components/ExpenseList';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { AdminProvider } from '../context/AdminContext';
import { AuthWithAdminProvider } from '../context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from '../context/MultiUserFinanceContext';
import type { Expense } from '../types';
import { financeClient } from '@/lib/financeService';

// Mock financeService to prevent network calls
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    listGroups: jest.fn().mockResolvedValue({ groups: [] }),
    listExpenses: jest.fn().mockResolvedValue({ expenses: [] }),
    listIncomes: jest.fn().mockResolvedValue({ incomes: [] }),
    searchTransactions: jest.fn().mockResolvedValue({ results: [], totalCount: 0 }),
  },
}));

jest.mock('../context/AuthWithAdminContext', () => {
  const originalModule = jest.requireActual(
    '../context/AuthWithAdminContext'
  );
  const user = { uid: 'user-1' };

  return {
    ...originalModule,
    AuthWithAdminProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useAuth: jest.fn(() => ({
      user,
      loading: false,
    })),
  };
});

// Mock the useFinance hook
jest.mock('../context/FinanceContext', () => {
  const originalModule = jest.requireActual('../context/FinanceContext');
  
  return {
    ...originalModule,
    FinanceProvider: ({ children }: { children: React.ReactNode }) => children,
    useFinance: jest.fn(() => ({
      expenses: [
        {
          id: 'expense1',
          description: 'Test Expense 1',
          amount: 100,
          category: 'Food',
          frequency: 'monthly',
          date: new Date('2023-01-01')
        },
        {
          id: 'expense2',
          description: 'Test Expense 2',
          amount: 200,
          category: 'Housing',
          frequency: 'monthly',
          date: new Date('2023-01-02')
        },
        {
          id: 'expense3',
          description: 'Test Expense 3',
          amount: 300, 
          category: 'Transportation',
          frequency: 'monthly',
          date: new Date('2023-01-03')
        },
        {
          id: 'expense4',
          description: 'Test Expense 4',
          amount: 400,
          category: 'Entertainment',
          frequency: 'monthly',
          date: new Date('2023-01-04')
        },
        {
          id: 'expense5',
          description: 'Test Expense 5',
          amount: 500,
          category: 'Healthcare',
          frequency: 'monthly',
          date: new Date('2023-01-05')
        }
      ],
      deleteExpense: jest.fn(),
      deleteExpenses: jest.fn(),
      updateExpense: jest.fn()
    }))
  };
});

jest.mock('../context/MultiUserFinanceContext', () => {
  const originalModule = jest.requireActual(
    '../context/MultiUserFinanceContext'
  );

  return {
    ...originalModule,
    MultiUserFinanceProvider: ({ children }: { children: React.ReactNode }) =>
      children,
    useMultiUserFinance: jest.fn(() => ({ groups: [] })),
  };
});

const ExpenseListTestTree = (
  props: React.ComponentProps<typeof ExpenseList> = {}
) => (
    <AdminProvider>
      <AuthWithAdminProvider>
        <MultiUserFinanceProvider>
          <FinanceProvider>
            <ExpenseList {...props} />
          </FinanceProvider>
        </MultiUserFinanceProvider>
      </AuthWithAdminProvider>
    </AdminProvider>
);

const renderExpenseList = (
  props: React.ComponentProps<typeof ExpenseList> = {}
) => render(<ExpenseListTestTree {...props} />);

/** Returns queries scoped to the desktop table view (hidden md:block). */
const getDesktopTable = () => within(screen.getByTestId('expense-table-desktop'));

const financeMock = (expenses: Expense[]) => ({
  expenses,
  deleteExpense: jest.fn(),
  deleteExpenses: jest.fn(),
  updateExpense: jest.fn(),
  taxConfig: { country: 'australia' },
});

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: jest.fn(),
  });
});

describe('ExpenseList Component', () => {
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
  });

  test('renders expense list with test expenses', () => {
    renderExpenseList();
    const desktop = getDesktopTable();

    // Check if all test expenses are rendered in the desktop table
    expect(desktop.getByText('Test Expense 1')).toBeInTheDocument();
    expect(desktop.getByText('Test Expense 2')).toBeInTheDocument();
    expect(desktop.getByText('Test Expense 3')).toBeInTheDocument();
    expect(desktop.getByText('Test Expense 4')).toBeInTheDocument();
    expect(desktop.getByText('Test Expense 5')).toBeInTheDocument();
  });

  test('selects a single expense when checkbox is clicked', async () => {
    renderExpenseList();
    const desktop = getDesktopTable();

    // Get the first checkbox and click it (scoped to desktop table)
    const checkboxes = desktop.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // First expense checkbox (index 1, index 0 is the select all checkbox)

    // Check that the Delete Selected button appears
    await waitFor(() => {
      expect(screen.getByText(/Delete Selected/)).toBeInTheDocument();
    });
  });

  test('selects multiple expenses individually', async () => {
    renderExpenseList();
    const desktop = getDesktopTable();

    // Get all checkboxes (excluding select all) scoped to desktop table
    const checkboxes = desktop.getAllByRole('checkbox').slice(1);

    // Click the first expense checkbox
    fireEvent.click(checkboxes[0]);

    // Click the third expense checkbox (no shift key)
    fireEvent.click(checkboxes[2]);

    // Check that the Delete Selected button shows correct count (2)
    await waitFor(() => {
      const deleteButton = screen.getByText(/Delete Selected/).closest('button')!;
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton.textContent).toContain('2');
    });
  });

  test('Select All checkbox selects all expenses', async () => {
    renderExpenseList();
    const desktop = getDesktopTable();

    // Click the select all checkbox (scoped to desktop table)
    const selectAllCheckbox = desktop.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);

    // Check that the Delete Selected button shows correct count (5)
    await waitFor(() => {
      const deleteButton = screen.getByText(/Delete Selected/).closest('button')!;
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton.textContent).toContain('5');
    });
  });

  test('deletes selected expenses when Delete Selected button is clicked', async () => {
    const mockDeleteExpenses = jest.fn();

    // Override the mock implementation for this test
    (useFinance as jest.Mock).mockImplementation(() => ({
      expenses: [
        {
          id: 'expense1',
          description: 'Test Expense 1',
          amount: 100,
          category: 'Food',
          frequency: 'monthly',
          date: new Date('2023-01-01')
        },
        {
          id: 'expense2',
          description: 'Test Expense 2',
          amount: 200,
          category: 'Housing',
          frequency: 'monthly',
          date: new Date('2023-01-02')
        },
        {
          id: 'expense3',
          description: 'Test Expense 3',
          amount: 300,
          category: 'Transportation',
          frequency: 'monthly',
          date: new Date('2023-01-03')
        },
        {
          id: 'expense4',
          description: 'Test Expense 4',
          amount: 400,
          category: 'Entertainment',
          frequency: 'monthly',
          date: new Date('2023-01-04')
        },
        {
          id: 'expense5',
          description: 'Test Expense 5',
          amount: 500,
          category: 'Healthcare',
          frequency: 'monthly',
          date: new Date('2023-01-05')
        }
      ],
      deleteExpense: jest.fn(),
      deleteExpenses: mockDeleteExpenses,
      updateExpense: jest.fn()
    }));

    renderExpenseList();
    const desktop = getDesktopTable();

    // Click the select all checkbox (scoped to desktop table)
    const selectAllCheckbox = desktop.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);

    // Wait for the Delete Selected button to appear and then click it
    await waitFor(() => {
      const deleteButton = screen.getByText(/Delete Selected/).closest('button')!;
      expect(deleteButton).toBeInTheDocument();
      fireEvent.click(deleteButton);
    });

    // Check that deleteExpenses was called with all 5 expense IDs
    expect(mockDeleteExpenses).toHaveBeenCalledWith([
      'expense1', 'expense2', 'expense3', 'expense4', 'expense5'
    ]);
  });

  test('applies analytics date-range and category filters before pagination', async () => {
    const expenses: Expense[] = [
      {
        id: 'matching-personal',
        description: 'Matching personal groceries',
        amount: 84,
        category: 'Food',
        frequency: 'once',
        date: new Date('2026-07-13T23:59:59.999Z'),
      },
      {
        id: 'outside-range',
        description: 'Outside range groceries',
        amount: 22,
        category: 'Food',
        frequency: 'once',
        date: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        id: 'wrong-category',
        description: 'In-range personal rent',
        amount: 900,
        category: 'Housing',
        frequency: 'once',
        date: new Date('2026-07-13T12:00:00.000Z'),
      },
    ];
    (useFinance as jest.Mock).mockImplementation(() => financeMock(expenses));

    renderExpenseList({
      analyticsFilters: {
        category: 'food',
        from: '2026-07-01',
        to: '2026-07-31',
      },
    });

    const desktop = getDesktopTable();
    expect(await desktop.findByText('Matching personal groceries')).toBeVisible();
    expect(desktop.queryByText('Outside range groceries')).not.toBeInTheDocument();
    expect(desktop.queryByText('In-range personal rent')).not.toBeInTheDocument();
  });

  test('opens the page containing a focused analytics expense before highlighting it', async () => {
    const expenses: Expense[] = Array.from({ length: 30 }, (_, index) => ({
      id: index === 27 ? 'focus-me' : `personal-${index + 1}`,
      description: index === 27 ? 'Later focused expense' : `Personal expense ${index + 1}`,
      amount: index + 1,
      category: 'Food',
      frequency: 'once',
      date: new Date(`2026-07-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`),
    }));
    (useFinance as jest.Mock).mockImplementation(() => financeMock(expenses));

    renderExpenseList({ analyticsFilters: { expenseId: 'focus-me' } });

    const focusedRows = await screen.findAllByLabelText(
      'Focused expense Later focused expense'
    );
    expect(focusedRows).toHaveLength(2);
    focusedRows.forEach((row) => expect(row).toHaveAttribute('aria-current', 'true'));
    expect(screen.getByText('Showing 26-30 of 30')).toBeVisible();
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    });
  });

  test('shift-selects only visible expenses on the focused filtered page', async () => {
    const mockDeleteExpenses = jest.fn();
    const expenses: Expense[] = [
      {
        id: 'hidden-housing',
        description: 'Hidden housing expense',
        amount: 900,
        category: 'Housing',
        frequency: 'once',
        date: new Date('2026-07-01T12:00:00.000Z'),
      },
      ...Array.from({ length: 30 }, (_, index) => ({
        id: `food-${index + 1}`,
        description: `Food expense ${index + 1}`,
        amount: index + 1,
        category: 'Food' as const,
        frequency: 'once' as const,
        date: new Date(
          `2026-07-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`
        ),
      })),
    ];
    (useFinance as jest.Mock).mockImplementation(() => ({
      ...financeMock(expenses),
      deleteExpenses: mockDeleteExpenses,
    }));

    renderExpenseList({
      analyticsFilters: { category: 'food', expenseId: 'food-28' },
    });

    expect(await screen.findByText('Showing 26-30 of 30')).toBeVisible();
    const checkboxes = getDesktopTable().getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    fireEvent.keyDown(window, { key: 'Shift' });
    fireEvent.click(checkboxes[3]);
    fireEvent.keyUp(window, { key: 'Shift' });

    const deleteButton = await screen.findByRole('button', {
      name: /Delete Selected.*3/i,
    });
    fireEvent.click(deleteButton);

    expect(mockDeleteExpenses).toHaveBeenCalledWith([
      'food-26',
      'food-27',
      'food-28',
    ]);
    expect(mockDeleteExpenses).not.toHaveBeenCalledWith(
      expect.arrayContaining(['hidden-housing'])
    );
  });

  test('disables global search while analytics filters are active', async () => {
    (useFinance as jest.Mock).mockImplementation(() =>
      financeMock([
        {
          id: 'filtered-food',
          description: 'Filtered groceries',
          amount: 32,
          category: 'Food',
          frequency: 'once',
          date: new Date('2026-07-13T12:00:00.000Z'),
        },
      ])
    );

    renderExpenseList({ analyticsFilters: { category: 'food' } });

    const search = screen.getByRole('textbox', { name: 'Search expenses' });
    expect(search).toBeDisabled();
    expect(search).toHaveAttribute(
      'placeholder',
      'Clear analytics filters to search all expenses'
    );
    expect(await screen.findAllByText('Filtered groceries')).toHaveLength(2);
    expect(financeClient.searchTransactions).not.toHaveBeenCalled();
  });

  test('restores a focused analytics row when filters replace an active search', async () => {
    (financeClient.searchTransactions as jest.Mock).mockResolvedValueOnce({
      results: [
        {
          id: 'search-result',
          description: 'Unscoped search result',
          amount: 19,
          amountCents: BigInt(0),
          category: 'Other',
          groupId: '',
        },
      ],
      totalCount: 1,
    });
    (useFinance as jest.Mock).mockImplementation(() =>
      financeMock([
        {
          id: 'focus-after-search',
          description: 'Focus after search',
          amount: 32,
          category: 'Food',
          frequency: 'once',
          date: new Date('2026-07-13T12:00:00.000Z'),
        },
      ])
    );

    const view = renderExpenseList();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search expenses' }), {
      target: { value: 'unscoped' },
    });
    await waitFor(() => {
      expect(financeClient.searchTransactions).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <ExpenseListTestTree
        analyticsFilters={{ expenseId: 'focus-after-search' }}
      />
    );

    expect(
      await screen.findAllByLabelText('Focused expense Focus after search')
    ).toHaveLength(2);
    expect(screen.queryByText('Unscoped search result')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search expenses' })).toBeDisabled();
    await waitFor(() => {
      expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });
    });
  });

  test('uses instant focus scrolling when reduced motion is requested', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = jest.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }));
    (useFinance as jest.Mock).mockImplementation(() => financeMock([
      {
        id: 'reduced-motion-focus',
        description: 'Reduced motion focus',
        amount: 18,
        category: 'Food',
        frequency: 'once',
        date: new Date('2026-07-13T12:00:00.000Z'),
      },
    ]));

    try {
      renderExpenseList({
        analyticsFilters: { expenseId: 'reduced-motion-focus' },
      });

      await screen.findAllByLabelText('Focused expense Reduced motion focus');
      await waitFor(() => {
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({
          behavior: 'auto',
          block: 'center',
        });
      });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  test('shows a filtered-empty result when the focused ID is outside personal scope', async () => {
    (useFinance as jest.Mock).mockImplementation(() => financeMock([
      {
        id: 'personal-only',
        description: 'Scoped personal expense',
        amount: 32,
        category: 'Food',
        frequency: 'once',
        date: new Date('2026-07-13T12:00:00.000Z'),
      },
    ]));

    renderExpenseList({
      analyticsFilters: {
        date: '2026-07-13',
        expenseId: 'foreign-expense',
      },
    });

    expect(
      await screen.findByText('No expenses match the active analytics filters.')
    ).toBeVisible();
    expect(screen.queryByText('Scoped personal expense')).not.toBeInTheDocument();
    expect(financeClient.searchTransactions).not.toHaveBeenCalled();
  });
});
