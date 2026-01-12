import React from 'react';
import { render, screen } from '@testing-library/react';
import { jest } from '@jest/globals';

// Mock the hooks before importing the component
const mockUseAuth = jest.fn();
const mockUseFinance = jest.fn();

jest.mock('../../context/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

jest.mock('../../context/FinanceContext', () => ({
  useFinance: mockUseFinance,
}));

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children }: any) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: any) => <div data-testid="card-content">{children}</div>,
  CardHeader: ({ children }: any) => <div data-testid="card-header">{children}</div>,
  CardTitle: ({ children }: any) => <h3 data-testid="card-title">{children}</h3>,
  CardDescription: ({ children }: any) => <p data-testid="card-description">{children}</p>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: any) => (
    <button onClick={onClick} disabled={disabled} data-testid="button">
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled, id }: any) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={disabled}
      data-testid={`switch-${id}`}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor }: any) => (
    <label htmlFor={htmlFor} data-testid="label">{children}</label>
  ),
}));

// Mock other dependencies
jest.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="alert-circle">AlertCircle</span>,
  CheckCircle2: () => <span data-testid="check-circle">CheckCircle2</span>,
  Upload: () => <span data-testid="upload">Upload</span>,
  FileText: () => <span data-testid="file-text">FileText</span>,
  Lock: () => <span data-testid="lock">Lock</span>,
  Brain: () => <span data-testid="brain">Brain</span>,
}));

jest.mock('papaparse', () => ({ parse: jest.fn() }));
jest.mock('openai', () => ({ default: jest.fn() }));
jest.mock('../../utils/smartCategorization', () => ({
  batchCategorizeTransactions: jest.fn(),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

import TransactionImport from '../TransactionImport';

describe('TransactionImport - Auth Gating', () => {
  const mockFinanceContext = {
    addExpense: jest.fn(),
    addExpenses: jest.fn(),
    expenses: [],
    incomes: [],
    getTotalExpenses: () => 0,
    getTotalIncome: () => 0,
    getNetIncome: () => 0,
    getExpenseSummary: () => ({}),
    removeExpense: jest.fn(),
    updateExpense: jest.fn(),
    addIncome: jest.fn(),
    removeIncome: jest.fn(),
    updateIncome: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    mockUseFinance.mockReturnValue(mockFinanceContext);
  });

  describe('Unauthenticated User Experience', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: false,
        signIn: jest.fn(),
        signUp: jest.fn(),
        signInWithGoogle: jest.fn(),
        logout: jest.fn(),
      });
    });

    it('displays promotional banner for AI features when not logged in', () => {
      render(<TransactionImport />);

      expect(screen.getByText('Sign in to unlock AI-powered features!')).toBeInTheDocument();
      expect(screen.getByText('PDF bank statement import with AI extraction')).toBeInTheDocument();
      expect(screen.getByText('Smart transaction categorization using GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Learning from your categorization preferences')).toBeInTheDocument();
      expect(screen.getByText('Duplicate transaction detection')).toBeInTheDocument();
      expect(screen.getByText('Basic CSV import is available without signing in.')).toBeInTheDocument();
    });

    it('disables PDF processing toggle when not authenticated', () => {
      render(<TransactionImport />);

      const pdfToggle = screen.getByTestId('switch-pdf-processing');
      expect(pdfToggle).toBeDisabled();
    });

    it('disables smart categorization toggle when not authenticated', () => {
      render(<TransactionImport />);

      const smartToggle = screen.getByTestId('switch-smart-categorization');
      expect(smartToggle).toBeDisabled();
    });

    it('shows lock icons for disabled features', () => {
      render(<TransactionImport />);

      const lockIcons = screen.getAllByTestId('lock');
      expect(lockIcons).toHaveLength(2); // One for PDF, one for Smart Categorization
    });

    it('shows brain icon in promotional banner', () => {
      render(<TransactionImport />);

      expect(screen.getByTestId('brain')).toBeInTheDocument();
    });

    it('displays correct messaging for unauthenticated users', () => {
      render(<TransactionImport />);

      expect(screen.getByText(/Drag & drop your CSV file here/)).toBeInTheDocument();
    });
  });

  describe('Authenticated User Experience', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: {
          uid: 'test-user-id',
          email: 'test@example.com',
          displayName: 'Test User',
        },
        loading: false,
        signIn: jest.fn(),
        signUp: jest.fn(),
        signInWithGoogle: jest.fn(),
        logout: jest.fn(),
      });
    });

    it('hides promotional banner when logged in', () => {
      render(<TransactionImport />);

      expect(screen.queryByText('Sign in to unlock AI-powered features!')).not.toBeInTheDocument();
    });

    it('enables PDF processing toggle when authenticated', () => {
      render(<TransactionImport />);

      const pdfToggle = screen.getByTestId('switch-pdf-processing');
      expect(pdfToggle).not.toBeDisabled();
    });

    it('enables smart categorization toggle when authenticated and API key is available', () => {
      mockLocalStorage.getItem.mockReturnValue('sk-test-key');
      
      render(<TransactionImport />);

      const smartToggle = screen.getByTestId('switch-smart-categorization');
      expect(smartToggle).not.toBeDisabled();
    });

    it('keeps smart categorization disabled when no API key is available', () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      
      render(<TransactionImport />);

      const smartToggle = screen.getByTestId('switch-smart-categorization');
      expect(smartToggle).toBeDisabled();
    });

    it('does not show lock icons when authenticated', () => {
      render(<TransactionImport />);

      expect(screen.queryByTestId('lock')).not.toBeInTheDocument();
    });

    it('allows enhanced file processing when authenticated', () => {
      render(<TransactionImport />);

      expect(screen.getByText(/Import Transactions/)).toBeInTheDocument();
      // Component should render without promotional content
      expect(screen.queryByText('Sign in to unlock AI-powered features!')).not.toBeInTheDocument();
    });
  });

  describe('Feature Availability', () => {
    it('shows appropriate UI states based on authentication', () => {
      // Test unauthenticated state
      mockUseAuth.mockReturnValue({ user: null, loading: false });
      const { rerender } = render(<TransactionImport />);
      
      expect(screen.getByTestId('brain')).toBeInTheDocument();
      expect(screen.getAllByTestId('lock')).toHaveLength(2);

      // Test authenticated state
      mockUseAuth.mockReturnValue({
        user: { uid: 'test', email: 'test@example.com' },
        loading: false,
      });
      rerender(<TransactionImport />);
      
      expect(screen.queryByTestId('brain')).not.toBeInTheDocument();
      expect(screen.queryByTestId('lock')).not.toBeInTheDocument();
    });

    it('handles loading state appropriately', () => {
      mockUseAuth.mockReturnValue({
        user: null,
        loading: true,
        signIn: jest.fn(),
        signUp: jest.fn(),
        signInWithGoogle: jest.fn(),
        logout: jest.fn(),
      });

      render(<TransactionImport />);

      // Should still render the component during loading
      expect(screen.getByTestId('card')).toBeInTheDocument();
    });
  });

  describe('API Key Management', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        user: { uid: 'test', email: 'test@example.com' },
        loading: false,
      });
    });

    it('loads API key from localStorage on mount', () => {
      mockLocalStorage.getItem.mockReturnValue('sk-test-key');
      
      render(<TransactionImport />);
      
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('openai-api-key');
    });

    it('enables smart categorization when API key is present', () => {
      mockLocalStorage.getItem.mockReturnValue('sk-test-key');
      
      render(<TransactionImport />);
      
      const smartToggle = screen.getByTestId('switch-smart-categorization');
      expect(smartToggle).not.toBeDisabled();
    });

    it('saves PDF processing preference to localStorage', () => {
      render(<TransactionImport />);
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdf-processing-enabled', 'false');
    });
  });
});