import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExpenseForm from '../../components/ExpenseForm';
import { FinanceProvider } from '../../context/FinanceContext';
import { AuthWithAdminProvider } from '../../context/AuthWithAdminContext';
import { AdminProvider } from '../../context/AdminContext';

// Mock Firebase Auth
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
  onAuthStateChanged: jest.fn((auth, callback) => {
    callback(null);
    return jest.fn();
  }),
  signInWithEmailAndPassword: jest.fn().mockResolvedValue({ user: { uid: 'test' } }),
  createUserWithEmailAndPassword: jest.fn().mockResolvedValue({ user: { uid: 'test' } }),
  signOut: jest.fn().mockResolvedValue(undefined),
  updateProfile: jest.fn().mockResolvedValue(undefined),
  GoogleAuthProvider: jest.fn(),
  signInWithPopup: jest.fn().mockResolvedValue({ user: { uid: 'test' } }),
  setPersistence: jest.fn().mockResolvedValue(undefined),
  browserLocalPersistence: 'local',
}));

// Mock Firebase Lib
jest.mock('@/lib/firebase', () => ({
  auth: { currentUser: null },
  db: {},
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn(),
  length: 0,
  key: jest.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('Personal Expense Creation', () => {
    beforeAll(() => {
        Object.defineProperty(global, 'crypto', {
            value: {
                randomUUID: () => 'test-uuid-1234'
            }
        });
    });

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.getItem.mockReturnValue(null);
  });

  it('should create a personal expense and save to localStorage', async () => {
    const user = userEvent.setup();

    render(
      <AdminProvider>
        <AuthWithAdminProvider>
          <FinanceProvider>
            <ExpenseForm />
          </FinanceProvider>
        </AuthWithAdminProvider>
      </AdminProvider>
    );

    // Find form elements
    const descriptionInput = screen.getByLabelText(/description/i);
    const amountInput = screen.getByLabelText(/amount/i);
    const submitButton = screen.getByRole('button', { name: /add expense/i });

    // Fill out the form
    await user.type(descriptionInput, 'Test Expense');
    await user.type(amountInput, '100.50');
    
    // Submit the form
    await user.click(submitButton);

    // Verify localStorage was called
    await waitFor(() => {
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'expenses',
        expect.any(String)
      );
    });

    // Get the last call to setItem for expenses
    const expensesCalls = mockLocalStorage.setItem.mock.calls.filter(
      ([key]) => key === 'expenses'
    );
    const lastCall = expensesCalls[expensesCalls.length - 1];
    const savedData = JSON.parse(lastCall[1]);
    
    // Verify the saved data contains our new expense
    expect(savedData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: 'Test Expense',
          amount: 100.5,
          category: 'Food', // Default category
          frequency: 'monthly', // Default frequency
        }),
      ])
    );
  });

  it('should not make API calls for personal expenses', async () => {
    // Mock fetch to ensure it's not called
    const mockFetch = jest.fn();
    global.fetch = mockFetch;

    const user = userEvent.setup();

    render(
      <AdminProvider>
        <AuthWithAdminProvider>
          <FinanceProvider>
            <ExpenseForm />
          </FinanceProvider>
        </AuthWithAdminProvider>
      </AdminProvider>
    );

    const descriptionInput = screen.getByLabelText(/description/i);
    const amountInput = screen.getByLabelText(/amount/i);
    const submitButton = screen.getByRole('button', { name: /add expense/i });

    await user.type(descriptionInput, 'Test Expense');
    await user.type(amountInput, '50');
    await user.click(submitButton);

    // Verify no API calls were made
    expect(mockFetch).not.toHaveBeenCalled();
  });
});