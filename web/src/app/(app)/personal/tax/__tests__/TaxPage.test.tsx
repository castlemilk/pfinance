/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock financeService
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    listIncomes: jest.fn<() => Promise<any>>().mockResolvedValue({ incomes: [] }),
    listExpenses: jest.fn<() => Promise<any>>().mockResolvedValue({ expenses: [] }),
    updateUser: jest.fn<() => Promise<any>>().mockResolvedValue({}),
    listGroups: jest.fn<() => Promise<any>>().mockResolvedValue({ groups: [] }),
    getTaxSummary: jest.fn<() => Promise<any>>().mockResolvedValue({ calculation: null }),
    batchClassifyTaxDeductibility: jest.fn<() => Promise<any>>().mockResolvedValue({ totalProcessed: 0 }),
    exportTaxReturn: jest.fn<() => Promise<any>>().mockResolvedValue({ data: new Uint8Array(), filename: 'test.csv', contentType: 'text/csv' }),
    listDeductibleExpenses: jest.fn<() => Promise<any>>().mockResolvedValue({ expenses: [], totalDeductibleCents: BigInt(0), nextPageToken: '' }),
  },
}));

// Mock ProFeatureGate to just render children (Pro gating tested separately)
jest.mock('../../../../components/ProFeatureGate', () => ({
  ProFeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  UpgradePrompt: () => <div data-testid="upgrade-prompt">Upgrade to Pro</div>,
}));

// Mock next/link to render a simple <a>
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

import { AuthContext } from '../../../../context/AuthWithAdminContext';
import { FinanceContext } from '../../../../context/FinanceContext';
import TaxReturnsPage from '../page';

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
  subscriptionTier: 2,
  subscriptionStatus: 1,
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

const renderPage = () => {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <FinanceContext.Provider value={mockFinanceContext}>
        <TaxReturnsPage />
      </FinanceContext.Provider>
    </AuthContext.Provider>
  );
};

describe('TaxReturnsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders page heading', () => {
    renderPage();
    expect(screen.getByText('Tax Returns')).toBeInTheDocument();
  });

  it('renders Tax Deduction Review CTA', () => {
    renderPage();
    expect(screen.getByText('Tax Deduction Review')).toBeInTheDocument();
    expect(screen.getByText('Start Review')).toBeInTheDocument();
  });

  it('renders all four tabs', () => {
    renderPage();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Deductions')).toBeInTheDocument();
    expect(screen.getByText('Calculator')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('renders FY selector', () => {
    renderPage();
    // The Summary tab renders a Select with FY options. Look for the select trigger.
    const fySelects = screen.getAllByText(/\d{4}-\d{2}/);
    expect(fySelects.length).toBeGreaterThanOrEqual(1);
  });

  it('Start Review links to review page', () => {
    renderPage();
    const startReviewLink = screen.getByText('Start Review').closest('a');
    expect(startReviewLink).toHaveAttribute('href', '/personal/tax/review');
  });
});
