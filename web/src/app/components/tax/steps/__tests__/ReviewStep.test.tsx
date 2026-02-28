/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { jest } from '@jest/globals';

// Mock financeService
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    batchUpdateExpenseTaxStatus: jest.fn().mockResolvedValue({}),
    listIncomes: jest.fn().mockResolvedValue({ incomes: [] }),
    listExpenses: jest.fn().mockResolvedValue({ expenses: [] }),
    updateUser: jest.fn().mockResolvedValue({}),
    listGroups: jest.fn().mockResolvedValue({ groups: [] }),
  },
}));

// Mock ConfidenceBadge since it may not render properly in jsdom
jest.mock('@/components/ui/confidence-badge', () => ({
  ConfidenceBadge: ({ confidence }: { confidence: number }) => (
    <span data-testid="confidence-badge">{(confidence * 100).toFixed(0)}%</span>
  ),
}));

import { AuthContext } from '../../../../context/AuthWithAdminContext';
import { FinanceContext } from '../../../../context/FinanceContext';
import { ReviewStep } from '../ReviewStep';
import { TaxClassificationResult } from '@/gen/pfinance/v1/finance_service_pb';
import type { WizardState, WizardAction } from '../../TaxReviewWizard';

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

// Expenses within FY 2025-26 (July 2025 - June 2026)
const mockExpenses = [
  { id: 'exp-1', description: 'Office supplies', amount: 150, date: new Date('2025-10-15'), category: 'Shopping' as const, frequency: 'once' as const },
  { id: 'exp-2', description: 'Work laptop bag', amount: 89.95, date: new Date('2025-11-20'), category: 'Shopping' as const, frequency: 'once' as const },
  { id: 'exp-3', description: 'Internet bill', amount: 79, date: new Date('2026-01-05'), category: 'Utilities' as const, frequency: 'monthly' as const },
];

const mockFinanceContext: any = {
  expenses: mockExpenses,
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

// Helper to create TaxClassificationResult-like objects
function makeClassificationResult(overrides: Partial<{
  expenseId: string;
  isDeductible: boolean;
  confidence: number;
  category: number;
  reasoning: string;
  needsReview: boolean;
  deductiblePercent: number;
}>): TaxClassificationResult {
  return {
    expenseId: '',
    isDeductible: true,
    confidence: 0.72,
    category: 4, // OTHER_WORK
    reasoning: 'Work expense',
    needsReview: true,
    deductiblePercent: 1.0,
    ...overrides,
  } as unknown as TaxClassificationResult;
}

function makeBaseState(overrides?: Partial<WizardState>): WizardState {
  return {
    step: 'review',
    financialYear: '2025-26',
    occupation: 'Software Engineer',
    hasHelpDebt: false,
    medicareExemption: false,
    privateHealth: false,
    taxWithheld: 0,
    effectiveUserId: 'test-user',
    classifyResult: null,
    classifyResults: [],
    reviewedCount: 0,
    taxSummary: null,
    deductionSummaries: [],
    ...overrides,
  } as WizardState;
}

function renderReviewStep(
  state: WizardState,
  dispatch: React.Dispatch<WizardAction>,
  financeCtx: any = mockFinanceContext,
) {
  return render(
    <AuthContext.Provider value={mockAuthContext}>
      <FinanceContext.Provider value={financeCtx}>
        <ReviewStep state={state} dispatch={dispatch} />
      </FinanceContext.Provider>
    </AuthContext.Provider>,
  );
}

describe('ReviewStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders empty state when no classifyResults', () => {
    const dispatch = jest.fn();
    const state = makeBaseState({ classifyResults: [] });

    renderReviewStep(state, dispatch);

    expect(screen.getByText('All Expenses Classified!')).toBeInTheDocument();
  });

  it('renders empty state when classifyResults have no needsReview items', () => {
    const dispatch = jest.fn();
    const state = makeBaseState({
      classifyResults: [
        makeClassificationResult({ expenseId: 'exp-1', needsReview: false, confidence: 0.95 }),
      ],
    });

    renderReviewStep(state, dispatch);

    // No needsReview items means totalCount=0, shows the empty state
    expect(screen.getByText('All Expenses Classified!')).toBeInTheDocument();
  });

  it('renders review items when classifyResults have needsReview', async () => {
    const dispatch = jest.fn();
    const state = makeBaseState({
      classifyResult: { processed: 3, autoApplied: 1, needsReview: 2, skipped: 0 },
      classifyResults: [
        makeClassificationResult({ expenseId: 'exp-1', needsReview: true, confidence: 0.72, reasoning: 'Possibly work-related purchase' }),
        makeClassificationResult({ expenseId: 'exp-2', needsReview: true, confidence: 0.55, reasoning: 'Could be personal item' }),
        makeClassificationResult({ expenseId: 'exp-3', needsReview: false, confidence: 0.95 }),
      ],
    });

    renderReviewStep(state, dispatch);

    // Wait for useEffect to process and render review cards
    await screen.findByText('Office supplies');
    expect(screen.getByText('Work laptop bag')).toBeInTheDocument();

    // Amounts rendered as AUD currency badges
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$89.95')).toBeInTheDocument();

    // Should NOT show exp-3 (Internet bill) since needsReview=false
    expect(screen.queryByText('Internet bill')).not.toBeInTheDocument();
  });

  it('Approve All Remaining button approves unreviewed items', async () => {
    const user = userEvent.setup();
    const dispatch = jest.fn();
    const state = makeBaseState({
      classifyResult: { processed: 2, autoApplied: 0, needsReview: 2, skipped: 0 },
      classifyResults: [
        makeClassificationResult({ expenseId: 'exp-1', needsReview: true, confidence: 0.65 }),
        makeClassificationResult({ expenseId: 'exp-2', needsReview: true, confidence: 0.55 }),
      ],
    });

    renderReviewStep(state, dispatch);

    // Wait for items to render
    await screen.findByText('Office supplies');

    // Progress should initially show 0 reviewed
    expect(screen.getByText('Reviewed 0 of 2')).toBeInTheDocument();

    // Click "Approve All Remaining"
    const approveAllBtn = screen.getByRole('button', { name: /approve all remaining/i });
    await user.click(approveAllBtn);

    // After approving all, dispatch should be called with SET_REVIEWED_COUNT
    // The useEffect dispatches reviewedCount updates
    expect(dispatch).toHaveBeenCalledWith({ type: 'SET_REVIEWED_COUNT', count: 2 });

    // Progress text should update
    expect(screen.getByText('Reviewed 2 of 2')).toBeInTheDocument();
  });

  it('progress bar shows correct count', async () => {
    const dispatch = jest.fn();
    const state = makeBaseState({
      classifyResult: { processed: 3, autoApplied: 1, needsReview: 2, skipped: 0 },
      classifyResults: [
        makeClassificationResult({ expenseId: 'exp-1', needsReview: true, confidence: 0.72 }),
        makeClassificationResult({ expenseId: 'exp-2', needsReview: true, confidence: 0.55 }),
      ],
    });

    renderReviewStep(state, dispatch);

    // Wait for items to render
    await screen.findByText('Office supplies');

    // Should show "Reviewed 0 of 2"
    expect(screen.getByText('Reviewed 0 of 2')).toBeInTheDocument();
  });

  it('Save Decisions button appears after reviewing', async () => {
    const user = userEvent.setup();
    const dispatch = jest.fn();
    const state = makeBaseState({
      classifyResult: { processed: 2, autoApplied: 0, needsReview: 2, skipped: 0 },
      classifyResults: [
        makeClassificationResult({ expenseId: 'exp-1', needsReview: true, confidence: 0.65 }),
        makeClassificationResult({ expenseId: 'exp-2', needsReview: true, confidence: 0.55 }),
      ],
    });

    renderReviewStep(state, dispatch);

    // Wait for items to render
    await screen.findByText('Office supplies');

    // Save Decisions should NOT be visible initially (reviewedCount=0)
    expect(screen.queryByRole('button', { name: /save decisions/i })).not.toBeInTheDocument();

    // Click Approve All Remaining to review all items
    const approveAllBtn = screen.getByRole('button', { name: /approve all remaining/i });
    await user.click(approveAllBtn);

    // Now Save Decisions button should appear
    expect(screen.getByRole('button', { name: /save decisions/i })).toBeInTheDocument();
  });
});
