import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseList from '../components/ExpenseList';
import { FinanceProvider, useFinance } from '../context/FinanceContext';
import { AdminProvider } from '../context/AdminContext';
import { AuthWithAdminProvider } from '../context/AuthWithAdminContext';
import { MultiUserFinanceProvider } from '../context/MultiUserFinanceContext';

// Mock financeService to prevent network calls
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    listGroups: jest.fn().mockResolvedValue({ groups: [] }),
    listExpenses: jest.fn().mockResolvedValue({ expenses: [] }),
    listIncomes: jest.fn().mockResolvedValue({ incomes: [] }),
  },
}));

// Mock the useFinance hook
jest.mock('../context/FinanceContext', () => {
  const originalModule = jest.requireActual('../context/FinanceContext');
  
  return {
    ...originalModule,
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

const renderExpenseList = () => {
  return render(
    <AdminProvider>
      <AuthWithAdminProvider>
        <MultiUserFinanceProvider>
          <FinanceProvider>
            <ExpenseList />
          </FinanceProvider>
        </MultiUserFinanceProvider>
      </AuthWithAdminProvider>
    </AdminProvider>
  );
};

describe('ExpenseList Component', () => {
  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
  });

  test('renders expense list with test expenses', () => {
    renderExpenseList();
    
    // Check if all test expenses are rendered
    expect(screen.getByText('Test Expense 1')).toBeInTheDocument();
    expect(screen.getByText('Test Expense 2')).toBeInTheDocument();
    expect(screen.getByText('Test Expense 3')).toBeInTheDocument();
    expect(screen.getByText('Test Expense 4')).toBeInTheDocument();
    expect(screen.getByText('Test Expense 5')).toBeInTheDocument();
  });

  test('selects a single expense when checkbox is clicked', async () => {
    renderExpenseList();
    
    // Get the first checkbox and click it
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // First expense checkbox (index 1, index 0 is the select all checkbox)
    
    // Check that the Delete Selected button appears
    await waitFor(() => {
      expect(screen.getByText(/Delete Selected/)).toBeInTheDocument();
    });
  });

  test('selects multiple expenses individually', async () => {
    renderExpenseList();
    
    // Get all checkboxes (excluding select all)
    const checkboxes = screen.getAllByRole('checkbox').slice(1);
    
    // Click the first expense checkbox
    fireEvent.click(checkboxes[0]);
    
    // Click the third expense checkbox (no shift key)
    fireEvent.click(checkboxes[2]);
    
    // Check that the Delete Selected button shows correct count (2)
    await waitFor(() => {
      const deleteButton = screen.getByText(/Delete Selected/);
      expect(deleteButton).toBeInTheDocument();
      expect(deleteButton.textContent).toContain('2');
    });
  });

  test('Select All checkbox selects all expenses', async () => {
    renderExpenseList();
    
    // Click the select all checkbox
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);
    
    // Check that the Delete Selected button shows correct count (5)
    await waitFor(() => {
      const deleteButton = screen.getByText(/Delete Selected/);
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
    
    // Click the select all checkbox
    const selectAllCheckbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(selectAllCheckbox);
    
    // Wait for the Delete Selected button to appear and then click it
    await waitFor(() => {
      const deleteButton = screen.getByText(/Delete Selected/);
      expect(deleteButton).toBeInTheDocument();
      fireEvent.click(deleteButton);
    });
    
    // Check that deleteExpenses was called with all 5 expense IDs
    expect(mockDeleteExpenses).toHaveBeenCalledWith([
      'expense1', 'expense2', 'expense3', 'expense4', 'expense5'
    ]);
  });
}); 