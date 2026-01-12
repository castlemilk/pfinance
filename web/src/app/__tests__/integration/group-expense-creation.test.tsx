import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupExpenseForm from '../../components/GroupExpenseForm';
import { MultiUserFinanceProvider } from '../../context/MultiUserFinanceContext';
import { AuthWithAdminProvider } from '../../context/AuthWithAdminContext';
import { AdminProvider } from '../../context/AdminContext';
import { financeClient } from '@/lib/financeService';

// Mock the finance client
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    createExpense: jest.fn(),
    listExpenses: jest.fn(),
  },
}));

// Mock Firebase
jest.mock('@/lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'test-user-id',
      email: 'test@example.com',
      getIdToken: jest.fn().mockResolvedValue('test-token'),
    },
  },
  db: {},
}));

const mockGroup = {
  id: 'test-group-id',
  name: 'Test Group',
  members: [
    { userId: 'test-user-id', email: 'test@example.com', displayName: 'Test User', role: 'owner' },
    { userId: 'user2', email: 'user2@example.com', displayName: 'User 2', role: 'member' },
  ],
};

describe('Group Expense Creation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (financeClient.createExpense as jest.Mock).mockResolvedValue({
      expense: {
        id: 'new-expense-id',
        description: 'Test Group Expense',
        amount: 100,
      },
    });
  });

  it('should create a group expense with equal split', async () => {
    const user = userEvent.setup();

    // Mock the context to provide an active group
    const MockedProvider = ({ children }: { children: React.ReactNode }) => (
      <AdminProvider>
        <AuthWithAdminProvider>
          <MultiUserFinanceProvider>
            {children}
          </MultiUserFinanceProvider>
        </AuthWithAdminProvider>
      </AdminProvider>
    );

    // Override useMultiUserFinance to return mock data
    jest.mock('../../context/MultiUserFinanceContext', () => ({
      ...jest.requireActual('../../context/MultiUserFinanceContext'),
      useMultiUserFinance: () => ({
        activeGroup: mockGroup,
        groupExpenses: [],
        groupIncomes: [],
        loading: false,
        error: null,
      }),
    }));

    render(
      <MockedProvider>
        <GroupExpenseForm groupId="test-group-id" />
      </MockedProvider>
    );

    // Find form elements
    const descriptionInput = screen.getByLabelText(/description/i);
    const amountInput = screen.getByLabelText(/total amount/i);
    const submitButton = screen.getByRole('button', { name: /create expense/i });

    // Fill out the form
    await user.type(descriptionInput, 'Dinner');
    await user.type(amountInput, '100');

    // Submit the form
    await user.click(submitButton);

    // Verify API was called with correct data
    await waitFor(() => {
      expect(financeClient.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'test-user-id',
          groupId: 'test-group-id',
          description: 'Dinner',
          amount: 100,
          splitType: expect.any(Number), // SplitType.EQUAL
          allocations: expect.arrayContaining([
            expect.objectContaining({
              userId: 'test-user-id',
              amount: 50, // 100 / 2 members
            }),
            expect.objectContaining({
              userId: 'user2',
              amount: 50,
            }),
          ]),
        })
      );
    });
  });

  it('should handle API errors gracefully', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation();
    (financeClient.createExpense as jest.Mock).mockRejectedValue(new Error('API Error'));

    const user = userEvent.setup();

    const MockedProvider = ({ children }: { children: React.ReactNode }) => (
      <AdminProvider>
        <AuthWithAdminProvider>
          <MultiUserFinanceProvider>
            {children}
          </MultiUserFinanceProvider>
        </AuthWithAdminProvider>
      </AdminProvider>
    );

    render(
      <MockedProvider>
        <GroupExpenseForm groupId="test-group-id" />
      </MockedProvider>
    );

    const descriptionInput = screen.getByLabelText(/description/i);
    const amountInput = screen.getByLabelText(/total amount/i);
    const submitButton = screen.getByRole('button', { name: /create expense/i });

    await user.type(descriptionInput, 'Test');
    await user.type(amountInput, '50');
    await user.click(submitButton);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to create expense:',
        expect.any(Error)
      );
    });

    consoleError.mockRestore();
  });
});