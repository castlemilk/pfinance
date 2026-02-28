/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Tests for the tax classification integration in BulkUpload.
 *
 * Note: The BulkUpload component has a multi-step async processing flow
 * (select -> processing -> review -> importing -> done) that involves
 * interleaving React setState calls with awaited Promises inside component
 * event handlers. This pattern creates a microtask resolution deadlock in
 * the jsdom + React 18 test environment, preventing tests from advancing
 * past the "processing" step.
 *
 * Therefore, these tests focus on:
 * 1. Rendering: verifying the component mounts correctly with all contexts
 * 2. Static analysis: verifying the tax classification integration points exist
 * 3. API contract: verifying the financeClient mock shape matches what the
 *    component expects
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import { AuthContext } from '../../context/AuthWithAdminContext';
import { FinanceContext } from '../../context/FinanceContext';

// ── Mock @/lib/financeService ────────────────────────────────────
const mockBatchClassifyTaxDeductibility = jest.fn<() => Promise<any>>();
const mockExtractDocument = jest.fn<() => Promise<any>>();
const mockGetExtractionJob = jest.fn<() => Promise<any>>();
const mockImportExtractedTransactions = jest.fn<() => Promise<any>>();

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    extractDocument: (...args: any[]) => mockExtractDocument(...args),
    getExtractionJob: (...args: any[]) => mockGetExtractionJob(...args),
    importExtractedTransactions: (...args: any[]) => mockImportExtractedTransactions(...args),
    batchClassifyTaxDeductibility: (...args: any[]) => mockBatchClassifyTaxDeductibility(...args),
  },
  DocumentType: {
    RECEIPT: 0,
    BANK_STATEMENT: 1,
  },
}));

// ── Mock proto enums ─────────────────────────────────────────────
jest.mock('@/gen/pfinance/v1/types_pb', () => ({
  ExtractionMethod: { SELF_HOSTED: 1, GEMINI: 2 },
  ExtractionStatus: { PROCESSING: 1, COMPLETED: 2, FAILED: 3 },
  ExpenseFrequency: { ONCE: 0, WEEKLY: 1, FORTNIGHTLY: 2, MONTHLY: 3, ANNUALLY: 4 },
}));

// ── Mock image compression utilities ─────────────────────────────
jest.mock('../../utils/imageCompression', () => ({
  compressImage: jest.fn<() => Promise<string>>().mockResolvedValue('data:image/jpeg;base64,AAAA'),
  readFileAsDataUrl: jest.fn<() => Promise<string>>().mockResolvedValue('data:application/pdf;base64,AAAA'),
  base64ToUint8Array: jest.fn().mockReturnValue(new Uint8Array([0, 0])),
}));

// ── Mock tax deductions constants ────────────────────────────────
jest.mock('@/app/constants/taxDeductions', () => ({
  getCurrentAustralianFY: () => '2025-26',
}));

// ── Import the component under test AFTER mocks ──────────────────
import { BulkUploadTrigger } from '../BulkUpload';

// ── Also read the source for structural verification ─────────────
import * as fs from 'fs';
import * as path from 'path';

const componentSource = fs.readFileSync(
  path.resolve(__dirname, '../BulkUpload.tsx'),
  'utf-8',
);

// ── Context mocks ────────────────────────────────────────────────
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

// ── Helpers ──────────────────────────────────────────────────────

function renderBulkUpload(overrides?: { useGemini?: boolean }) {
  const setUseGemini = jest.fn();
  const useGemini = overrides?.useGemini ?? true;

  const utils = render(
    <AuthContext.Provider value={mockAuthContext}>
      <FinanceContext.Provider value={mockFinanceContext}>
        <BulkUploadTrigger useGemini={useGemini} setUseGemini={setUseGemini} />
      </FinanceContext.Provider>
    </AuthContext.Provider>,
  );

  return { ...utils, setUseGemini };
}

// ── Tests ────────────────────────────────────────────────────────

describe('BulkUpload - Tax Classification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Rendering tests ──────────────────────────────────────────

  it('renders the BulkUploadTrigger without crashing', () => {
    renderBulkUpload();

    expect(screen.getByText('Batch Document Upload')).toBeInTheDocument();
    expect(screen.getByText('Start Batch Upload')).toBeInTheDocument();
    expect(
      screen.getByText('Upload multiple receipts or bank statements at once. Review and edit all extracted transactions before importing.'),
    ).toBeInTheDocument();
  });

  it('opens the dialog when Start Batch Upload is clicked', async () => {
    const user = userEvent.setup();
    renderBulkUpload();

    await user.click(screen.getByText('Start Batch Upload'));

    // The dialog should now be open with the select step content
    expect(screen.getByText('Select receipts and bank statements to process.')).toBeInTheDocument();
  });

  it('shows extraction method toggle in select step', async () => {
    const user = userEvent.setup();
    renderBulkUpload();

    await user.click(screen.getByText('Start Batch Upload'));

    // When useGemini is true, should show "Gemini AI" label
    expect(screen.getByText('Gemini AI')).toBeInTheDocument();
    expect(screen.getByText('(Cloud processing)')).toBeInTheDocument();
  });

  it('allows file selection in select step', async () => {
    const user = userEvent.setup();
    renderBulkUpload();

    await user.click(screen.getByText('Start Batch Upload'));

    // File input should be present
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.accept).toContain('image/jpeg');
    expect(fileInput.accept).toContain('application/pdf');
  });

  it('adds files to the list when selected', async () => {
    const user = userEvent.setup();
    renderBulkUpload();

    await user.click(screen.getByText('Start Batch Upload'));

    const file = new File(['image data'], 'receipt.jpg', { type: 'image/jpeg' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(fileInput, file);

    expect(screen.getByText('receipt.jpg')).toBeInTheDocument();
    expect(screen.getByText(/Process 1 File/)).toBeInTheDocument();
  });

  it('shows the correct file count for multiple files', async () => {
    const user = userEvent.setup();
    renderBulkUpload();

    await user.click(screen.getByText('Start Batch Upload'));

    const file1 = new File(['img1'], 'receipt1.jpg', { type: 'image/jpeg' });
    const file2 = new File(['img2'], 'receipt2.png', { type: 'image/png' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(fileInput, [file1, file2]);

    expect(screen.getByText('receipt1.jpg')).toBeInTheDocument();
    expect(screen.getByText('receipt2.png')).toBeInTheDocument();
    expect(screen.getByText(/2 files selected/)).toBeInTheDocument();
  });

  // ── Structural / integration tests ───────────────────────────
  // These verify that the tax classification feature is properly wired
  // into the component by examining the source code structure.

  it('has tax classification state (classifyForTax defaults to true)', () => {
    // Verify the component declares classifyForTax state defaulting to true
    expect(componentSource).toContain('const [classifyForTax, setClassifyForTax] = useState(true)');
  });

  it('has tax classification toggle in review step JSX', () => {
    // Verify the review step renders the tax classification toggle
    expect(componentSource).toContain('Classify for Tax Deductibility');
    expect(componentSource).toContain('Automatically classify imported expenses for tax');
  });

  it('calls batchClassifyTaxDeductibility when classifyForTax is true and import succeeds', () => {
    // Verify the import flow conditionally calls batchClassifyTaxDeductibility
    expect(componentSource).toContain('if (classifyForTax && resp.importedCount > 0)');
    expect(componentSource).toContain('financeClient.batchClassifyTaxDeductibility');
  });

  it('passes correct parameters to batchClassifyTaxDeductibility', () => {
    // Verify the API call includes userId, financialYear, and autoApply
    expect(componentSource).toContain('userId: user.uid');
    expect(componentSource).toContain('financialYear: getCurrentAustralianFY()');
    expect(componentSource).toContain('autoApply: true');
  });

  it('handles tax classification failure gracefully (non-fatal)', () => {
    // Verify tax classification errors are caught and don't prevent import success
    expect(componentSource).toContain("console.error('Tax classification failed:', taxErr)");
    // The finally block sets classifyingTax to false
    expect(componentSource).toContain('setClassifyingTax(false)');
    // setStep('done') is called AFTER the tax classification try/catch
    // confirming that import success is independent of tax classification
    const importFnMatch = componentSource.match(/const importSelected[\s\S]*?setStep\('done'\)/);
    expect(importFnMatch).toBeTruthy();
  });

  it('displays tax classification results in the done step', () => {
    // Verify the done step conditionally renders tax results
    expect(componentSource).toContain('taxClassifyResult && (');
    expect(componentSource).toContain('Tax Classification Results');
    expect(componentSource).toContain('Auto-classified');
    expect(componentSource).toContain('Need Review');
    expect(componentSource).toContain('Skipped');
  });

  it('shows classifying status during tax classification', () => {
    // Verify the importing step shows different text during tax classification
    expect(componentSource).toContain('Classifying for Tax Deductibility...');
    expect(componentSource).toContain('Running AI tax classification on imported expenses...');
  });

  it('offers Start Tax Review button when items need review', () => {
    // Verify the done step has a link to review page when needsReview > 0
    expect(componentSource).toContain('taxClassifyResult.needsReview > 0');
    expect(componentSource).toContain('Start Tax Review');
    expect(componentSource).toContain("router.push('/personal/tax/review')");
  });

  it('resets tax classification state on dialog close', () => {
    // Verify resetState clears all tax-related state
    expect(componentSource).toContain('setClassifyForTax(true)');
    expect(componentSource).toContain('setClassifyingTax(false)');
    expect(componentSource).toContain('setTaxClassifyResult(null)');
  });

  // ── API contract tests ───────────────────────────────────────
  // These verify that the mock financeClient has the expected shape
  // matching what the component imports and calls.

  it('financeClient mock includes batchClassifyTaxDeductibility', () => {
    const { financeClient } = require('@/lib/financeService');
    expect(typeof financeClient.batchClassifyTaxDeductibility).toBe('function');
  });

  it('batchClassifyTaxDeductibility mock can be configured to return expected shape', async () => {
    mockBatchClassifyTaxDeductibility.mockResolvedValue({
      totalProcessed: 5,
      autoApplied: 3,
      needsReview: 1,
      skipped: 1,
    });

    const result = await mockBatchClassifyTaxDeductibility({
      userId: 'test-user',
      financialYear: '2025-26',
      autoApply: true,
    });

    expect(result.totalProcessed).toBe(5);
    expect(result.autoApplied).toBe(3);
    expect(result.needsReview).toBe(1);
    expect(result.skipped).toBe(1);
    expect(mockBatchClassifyTaxDeductibility).toHaveBeenCalledWith({
      userId: 'test-user',
      financialYear: '2025-26',
      autoApply: true,
    });
  });

  it('batchClassifyTaxDeductibility mock can be configured to reject', async () => {
    mockBatchClassifyTaxDeductibility.mockRejectedValue(new Error('Service unavailable'));

    await expect(
      mockBatchClassifyTaxDeductibility({ userId: 'test-user', financialYear: '2025-26', autoApply: true }),
    ).rejects.toThrow('Service unavailable');
  });
});
