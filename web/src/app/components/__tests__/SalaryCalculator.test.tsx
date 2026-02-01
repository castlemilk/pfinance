import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SalaryCalculator } from '../SalaryCalculator';
import { FinanceProvider } from '../../context/FinanceContext';
import { AdminProvider } from '../../context/AdminContext';
import { AuthWithAdminProvider } from '../../context/AuthWithAdminContext';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock Firebase to prevent auth errors in tests
jest.mock('@/lib/firebase', () => ({
  auth: {
    onAuthStateChanged: jest.fn((callback: (user: null) => void) => {
      callback(null);
      return jest.fn();
    }),
  },
}));

// Mock financeService
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    listIncomes: jest.fn<() => Promise<{ incomes: never[] }>>().mockResolvedValue({ incomes: [] }),
    listExpenses: jest.fn<() => Promise<{ expenses: never[] }>>().mockResolvedValue({ expenses: [] }),
    updateUser: jest.fn<() => Promise<object>>().mockResolvedValue({}),
    listGroups: jest.fn<() => Promise<{ groups: never[] }>>().mockResolvedValue({ groups: [] }),
  },
}));

describe('SalaryCalculator', () => {
  const renderCalculator = () => {
    return render(
      <AdminProvider>
        <AuthWithAdminProvider>
          <FinanceProvider>
            <SalaryCalculator />
          </FinanceProvider>
        </AuthWithAdminProvider>
      </AdminProvider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders the salary calculator component', () => {
      renderCalculator();

      // Check for main heading
      expect(screen.getByText('Income')).toBeInTheDocument();
    });

    it('renders the gross salary label', () => {
      renderCalculator();

      // The default input mode is "gross" so the label should be "Gross Salary"
      expect(screen.getByText('Gross Salary')).toBeInTheDocument();
    });

    it('renders the pay cycle label', () => {
      renderCalculator();

      expect(screen.getByText('Pay Cycle')).toBeInTheDocument();
    });

    it('renders the input type label', () => {
      renderCalculator();

      expect(screen.getByText('Input Type')).toBeInTheDocument();
    });

    it('renders a reset button', () => {
      renderCalculator();

      // There may be multiple reset buttons, just verify at least one exists
      const resetButtons = screen.getAllByRole('button', { name: /reset/i });
      expect(resetButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Salary Input', () => {
    it('renders the salary input field with placeholder', () => {
      renderCalculator();

      // Find the salary input by its placeholder
      const salaryInput = screen.getByPlaceholderText(/enter your gross salary/i);
      expect(salaryInput).toBeInTheDocument();
    });

    it('allows entering a salary value', async () => {
      const user = userEvent.setup();
      renderCalculator();

      // Find the salary input by its placeholder
      const salaryInput = screen.getByPlaceholderText(/enter your gross salary/i);
      await user.clear(salaryInput);
      await user.type(salaryInput, '100000');

      expect(salaryInput).toHaveValue(100000);
    });
  });

  describe('Pro-rata Hours', () => {
    it('renders the pro-rata toggle', () => {
      renderCalculator();

      // Look for the part-time/pro-rata toggle text
      expect(screen.getByText(/Part-time/i)).toBeInTheDocument();
    });
  });

  describe('Settings Sections', () => {
    it('has a superannuation settings section', () => {
      renderCalculator();

      // Look for any text containing "superannuation" - may be in multiple places
      const superTexts = screen.getAllByText(/superannuation/i);
      expect(superTexts.length).toBeGreaterThan(0);
    });
  });
});
