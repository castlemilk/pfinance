/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import TransactionImport from '../TransactionImport';
import { AuthContext } from '../../context/AuthWithAdminContext';
import { FinanceContext } from '../../context/FinanceContext';

// Mock the UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
// ...
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => <h3 className={className}>{children}</h3>,
  CardDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => <p className={className}>{children}</p>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, variant }: { 
    children: React.ReactNode; 
    onClick?: () => void; 
    disabled?: boolean; 
    className?: string; 
    variant?: string 
  }) => (
    <button 
      onClick={onClick} 
      disabled={disabled} 
      className={className}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, disabled, id }: { 
    checked?: boolean; 
    onCheckedChange?: (checked: boolean) => void; 
    disabled?: boolean; 
    id?: string 
  }) => (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
      disabled={disabled}
      id={id}
      data-testid={`switch-${id}`}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: { 
    children: React.ReactNode; 
    htmlFor?: string; 
    className?: string 
  }) => (
    <label htmlFor={htmlFor} className={className}>{children}</label>
  ),
}));

// Mock Lucide icons
jest.mock('lucide-react', () => ({
  AlertCircle: () => <span data-testid="alert-circle-icon">AlertCircle</span>,
  CheckCircle2: () => <span data-testid="check-circle-icon">CheckCircle2</span>,
  Upload: () => <span data-testid="upload-icon">Upload</span>,
  FileText: () => <span data-testid="file-text-icon">FileText</span>,
  Lock: () => <span data-testid="lock-icon">Lock</span>,
  Brain: () => <span data-testid="brain-icon">Brain</span>,
}));

// Mock other dependencies
jest.mock('papaparse', () => ({
  parse: jest.fn(),
}));

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
      files: {
        create: jest.fn(),
        delete: jest.fn(),
      },
      beta: {
        assistants: {
          create: jest.fn(),
        },
        threads: {
          create: jest.fn(),
          messages: {
            create: jest.fn(),
            list: jest.fn(),
          },
          runs: {
            create: jest.fn(),
            retrieve: jest.fn(),
          },
        },
      },
    })),
  };
});

jest.mock('../../utils/smartCategorization', () => ({
  batchCategorizeTransactions: jest.fn(),
}));

// Mock localStorage
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});





// Mock implementations
const mockAddExpense = jest.fn();
const mockAddExpenses = jest.fn();

const mockFinanceContext = {
  addExpense: mockAddExpense,
  addExpenses: mockAddExpenses,
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

const mockAuthenticatedUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
};

const mockUnauthenticatedAuthContext: any = {
  user: null as any,
  loading: false,
  signIn: jest.fn().mockImplementation(() => Promise.resolve()),
  signUp: jest.fn().mockImplementation(() => Promise.resolve()),
  signInWithGoogle: jest.fn().mockImplementation(() => Promise.resolve()),
  logout: jest.fn().mockImplementation(() => Promise.resolve()),
  isImpersonating: false,
  actualUser: null,
};

const mockAuthenticatedAuthContext: any = {
  user: mockAuthenticatedUser as any,
  loading: false,
  signIn: jest.fn().mockImplementation(() => Promise.resolve() as Promise<void>),
  signUp: jest.fn().mockImplementation(() => Promise.resolve() as Promise<void>),
  signInWithGoogle: jest.fn().mockImplementation(() => Promise.resolve() as Promise<void>),
  logout: jest.fn().mockImplementation(() => Promise.resolve() as Promise<void>),
  isImpersonating: false,
  actualUser: null,
};



const renderWithMocks = (authContext = mockUnauthenticatedAuthContext) => {
  return render(
    <AuthContext.Provider value={authContext}>
      <FinanceContext.Provider value={mockFinanceContext as any}>
        <TransactionImport />
      </FinanceContext.Provider>
    </AuthContext.Provider>
  );
};

describe('TransactionImport - Auth Gating', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
  });

  describe('Unauthenticated User Experience', () => {
    it('displays promotional banner for AI features when not logged in', () => {
      renderWithMocks();

      expect(screen.getByText('Sign in to unlock AI-powered features!')).toBeInTheDocument();
      expect(screen.getByText('PDF bank statement import with AI extraction')).toBeInTheDocument();
      expect(screen.getByText('Smart transaction categorization using GPT-4')).toBeInTheDocument();
      expect(screen.getByText('Learning from your categorization preferences')).toBeInTheDocument();
      expect(screen.getByText('Duplicate transaction detection')).toBeInTheDocument();
      expect(screen.getByText('Basic CSV import is available without signing in.')).toBeInTheDocument();
    });

    it('disables PDF processing toggle when not authenticated', () => {
      renderWithMocks();

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      expect(pdfToggle).toBeDisabled();
    });

    it('disables smart categorization toggle when not authenticated', () => {
      renderWithMocks();
      
      const smartToggle = screen.getByLabelText(/Smart Categorization/i);
      expect(smartToggle).toBeDisabled();
    });

    it('shows lock icons for disabled features', () => {
      const { container } = renderWithMocks();

      const lockIcons = container.querySelectorAll('.lucide-lock');
      expect(lockIcons).toHaveLength(2); // One for PDF, one for Smart Categorization
    });

    it('shows brain icon in promotional banner', () => {
      const { container } = renderWithMocks();

      expect(container.querySelector('.lucide-brain')).toBeInTheDocument();
    });

    it('still allows basic CSV file selection', () => {
      renderWithMocks();

      const fileInput = screen.getByDisplayValue('') as HTMLInputElement;
      expect(fileInput).toBeInTheDocument();
      expect(fileInput.accept).toBe('.csv,text/csv');
    });

    it('displays correct file type messaging for unauthenticated users', () => {
      renderWithMocks();

      expect(screen.getByText(/Drag & drop your CSV file here/)).toBeInTheDocument();
      expect(screen.getByText(/only CSV format supported/)).toBeInTheDocument();
    });
  });

  describe('Authenticated User Experience', () => {
    it('hides promotional banner when logged in', () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      expect(screen.queryByText('Sign in to unlock AI-powered features!')).not.toBeInTheDocument();
    });

    it('enables PDF processing toggle when authenticated', () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      expect(pdfToggle).not.toBeDisabled();
    });

    it('enables smart categorization toggle when authenticated and API key is available', () => {
      mockLocalStorage.setItem('openai-api-key', 'sk-test-key');
      renderWithMocks(mockAuthenticatedAuthContext);

      const smartToggle = screen.getByLabelText(/Smart Categorization/i);
      expect(smartToggle).not.toBeDisabled();
    });

    it('keeps smart categorization disabled when no API key is available', () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const smartToggle = screen.getByLabelText(/Smart Categorization/i);
      expect(smartToggle).toBeDisabled();
    });
    it('does not show lock icons when authenticated', () => {
      const { container } = renderWithMocks(mockAuthenticatedAuthContext);

      expect(container.querySelector('.lucide-lock')).not.toBeInTheDocument();
    });

    it('allows PDF file selection when authenticated and PDF processing enabled', async () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      await userEvent.click(pdfToggle);

      const fileInput = screen.getByDisplayValue('') as HTMLInputElement;
      expect(fileInput.accept).toBe('.csv,.pdf,application/pdf,text/csv');
    });

    it('displays correct file type messaging for authenticated users with PDF enabled', async () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      await userEvent.click(pdfToggle);

      expect(screen.getByText(/Drag & drop your CSV or PDF file here/)).toBeInTheDocument();
      expect(screen.getByText(/CSV and PDF supported/)).toBeInTheDocument();
    });
  });

  describe('Feature Toggle Functionality', () => {
    it('prevents PDF toggle changes when not authenticated', async () => {
      renderWithMocks();

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      
      // Attempt to click the disabled toggle
      await userEvent.click(pdfToggle);
      
      // Should remain unchecked
      expect(pdfToggle).not.toBeChecked();
    });

    it('allows PDF toggle changes when authenticated', async () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      
      await userEvent.click(pdfToggle);
      
      expect(pdfToggle).toBeChecked();
    });

    it('updates localStorage when PDF processing is enabled', async () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      await userEvent.click(pdfToggle);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdf-processing-enabled', 'true');
    });

    it('prevents smart categorization toggle when not authenticated', async () => {
      renderWithMocks();

      const smartToggle = screen.getByLabelText(/Smart Categorization/i);
      
      // Attempt to click the disabled toggle
      await userEvent.click(smartToggle);
      
      // Should remain unchecked
      expect(smartToggle).not.toBeChecked();
    });
  });
// ... and Error Handling below


  describe('File Processing Auth Checks', () => {
    it('shows auth error when trying to process PDF without authentication', async () => {
      renderWithMocks();

      // Create a mock PDF file
      const file = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
      
      // Mock the file input
      const fileInput = screen.getByDisplayValue('') as HTMLInputElement;
      
      // Simulate file drop/selection
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText('Please sign in to use PDF processing features.')).toBeInTheDocument();
      });
    });

    it('allows CSV processing without authentication', async () => {
      renderWithMocks();

      // Create a mock CSV file
      const file = new File(['header1,header2\\nvalue1,value2'], 'test.csv', { type: 'text/csv' });
      
      const fileInput = screen.getByDisplayValue('') as HTMLInputElement;
      
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      // Should not show auth error for CSV
      await waitFor(() => {
        expect(screen.queryByText('Please sign in to use PDF processing features.')).not.toBeInTheDocument();
      });
    });
  });

  describe('UI State Management', () => {
    it('shows appropriate cursor styles for disabled features', () => {
      renderWithMocks();

      const pdfLabel = screen.getByText(/Enable PDF Import/);
      const smartLabel = screen.getByText(/Smart Categorization/);

      expect(pdfLabel.closest('label')).toHaveClass('cursor-not-allowed', 'opacity-60');
      expect(smartLabel.closest('label')).toHaveClass('cursor-not-allowed', 'opacity-60');
    });

    it('shows appropriate cursor styles for enabled features', () => {
      mockLocalStorage.setItem('openai-api-key', 'sk-test-key');
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfLabel = screen.getByText(/Enable PDF Import/);
      const smartLabel = screen.getByText(/Smart Categorization/);

      expect(pdfLabel.closest('label')).toHaveClass('cursor-pointer');
      expect(smartLabel.closest('label')).toHaveClass('cursor-pointer');
    });

    it('updates toggle labels when features are enabled', async () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      await userEvent.click(pdfToggle);

      expect(screen.getByText(/Enable PDF Import \(On\)/)).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays appropriate error messages for unsupported file types when not authenticated', async () => {
      renderWithMocks();

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByDisplayValue('') as HTMLInputElement;
      
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText(/File type not supported. Only CSV files are accepted/)).toBeInTheDocument();
      });
    });

    it('displays appropriate error messages for unsupported file types when authenticated with PDF enabled', async () => {
      renderWithMocks(mockAuthenticatedAuthContext);

      // Enable PDF processing
      const pdfToggle = screen.getByLabelText(/Enable PDF Import/i);
      await userEvent.click(pdfToggle);

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      const fileInput = screen.getByDisplayValue('') as HTMLInputElement;
      
      Object.defineProperty(fileInput, 'files', {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(screen.getByText(/File type not supported. Only CSV and PDF files are accepted/)).toBeInTheDocument();
      });
    });
  });
});