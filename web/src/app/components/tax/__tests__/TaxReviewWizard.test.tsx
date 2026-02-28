/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock financeService (step components may call API)
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    listIncomes: jest.fn<() => Promise<any>>().mockResolvedValue({ incomes: [] }),
    listExpenses: jest.fn<() => Promise<any>>().mockResolvedValue({ expenses: [] }),
    updateUser: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    listGroups: jest.fn<() => Promise<any>>().mockResolvedValue({ groups: [] }),
    getTaxSummary: jest.fn<() => Promise<any>>().mockResolvedValue({ calculation: null }),
    batchClassifyTaxDeductibility: jest.fn<() => Promise<any>>().mockResolvedValue({ totalProcessed: 0 }),
    exportTaxReturn: jest.fn<() => Promise<any>>().mockResolvedValue({
      data: new Uint8Array(),
      filename: 'test.csv',
      contentType: 'text/csv',
    }),
  },
}));

import { AuthContext } from '../../../context/AuthWithAdminContext';
import { FinanceContext } from '../../../context/FinanceContext';
import { TaxReviewWizard } from '../TaxReviewWizard';
import { getCurrentAustralianFY } from '../../../constants/taxDeductions';

const mockAuthContext: any = {
  user: { uid: 'test-user', email: 'test@test.com' },
  loading: false,
  subscriptionLoading: false,
  signIn: jest.fn(),
  signUp: jest.fn(),
  signInWithGoogle: jest.fn(),
  logout: jest.fn(),
  isImpersonating: false,
  actualUser: null,
  subscriptionTier: 2, // PRO
  subscriptionStatus: 1, // ACTIVE
};

const mockFinanceContext: any = {
  expenses: [],
  incomes: [],
  taxConfig: { financialYear: '2025-26', residencyStatus: 'resident', settings: {} },
  loading: false,
  error: null,
  addExpense: jest.fn(),
  addExpenses: jest.fn(),
  updateExpense: jest.fn(),
  deleteExpense: jest.fn(),
  deleteExpenses: jest.fn(),
  addIncome: jest.fn(),
  updateIncome: jest.fn(),
  deleteIncome: jest.fn(),
  updateTaxConfig: jest.fn(),
  refreshData: jest.fn(),
  getExpenseSummary: () => [],
  getTotalExpenses: () => 0,
  getTotalIncome: () => 0,
  getNetIncome: () => 0,
};

describe('TaxReviewWizard', () => {
  const renderWizard = () => {
    return render(
      <AuthContext.Provider value={mockAuthContext}>
        <FinanceContext.Provider value={mockFinanceContext}>
          <TaxReviewWizard />
        </FinanceContext.Provider>
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Configure step initially', () => {
    renderWizard();
    expect(screen.getByText('Tax Review Wizard')).toBeInTheDocument();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });

  it('shows Back to Tax button on first step', () => {
    renderWizard();
    expect(screen.getByRole('button', { name: /back to tax/i })).toBeInTheDocument();
  });

  it('renders step indicator with 6 steps', () => {
    renderWizard();
    expect(screen.getByText('Configure')).toBeInTheDocument();
    expect(screen.getByText('Classify')).toBeInTheDocument();
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(screen.getByText('Deductions')).toBeInTheDocument();
    expect(screen.getByText('Calculate')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('Next button is not disabled on configure step', () => {
    renderWizard();
    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).not.toBeDisabled();
  });

  it('has correct initial FY in state', () => {
    renderWizard();
    const expectedFY = getCurrentAustralianFY();
    // The subtitle paragraph contains the FY string
    const subtitle = screen.getByText(
      (content, element) =>
        element?.tagName === 'P' && content.includes(`FY ${expectedFY}`),
    );
    expect(subtitle).toBeInTheDocument();
  });
});
