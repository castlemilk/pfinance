import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ReportGenerator from '../ReportGenerator';
import { useFinance } from '../../context/FinanceContext';
import { useMultiUserFinance } from '../../context/MultiUserFinanceContext';
import { useAuth } from '../../context/AuthWithAdminContext';
import { exportFinancialReportToPdf } from '../../utils/financialReportExport';

jest.mock('../../context/FinanceContext', () => ({ useFinance: jest.fn() }));
jest.mock('../../context/MultiUserFinanceContext', () => ({ useMultiUserFinance: jest.fn() }));
jest.mock('../../context/AuthWithAdminContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../utils/financialReportExport', () => ({ exportFinancialReportToPdf: jest.fn() }));

jest.mock('../DashboardReport', () => ({
  __esModule: true,
  default: function MockDashboardReport() {
    return <div data-testid="dashboard-report" />;
  },
}));

describe('Visual report pdfcn export', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(exportFinancialReportToPdf).mockReset().mockResolvedValue(undefined);
    jest.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);
    jest.mocked(useFinance).mockReturnValue({
      getTotalIncome: () => 5000,
      getNetIncome: () => 5000,
      getTotalExpenses: () => 12000,
      getExpenseSummary: () => [],
      incomes: [
        {
          id: 'income-1',
          source: 'Salary',
          amount: 5000,
          frequency: 'monthly',
          taxStatus: 'postTax',
          date: new Date('2026-10-01T00:00:00'),
        },
      ],
      expenses: [
        {
          id: 'expense-1',
          description: 'Groceries',
          amount: 1000,
          category: 'Food',
          frequency: 'monthly',
          date: new Date('2026-10-02T00:00:00'),
        },
      ],
      taxConfig: {
        enabled: false,
        country: 'australia',
        taxRate: 0,
        includeDeductions: false,
      },
    } as unknown as ReturnType<typeof useFinance>);
    jest.mocked(useMultiUserFinance).mockReturnValue({
      activeGroup: null,
      groupExpenses: [],
      getUserOwedAmount: () => 0,
      getUserOwesAmount: () => 0,
    } as unknown as ReturnType<typeof useMultiUserFinance>);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('passes structured monthly metrics to pdfcn without resizing the preview', async () => {
    const user = userEvent.setup();
    render(<ReportGenerator />);

    const report = screen.getByTestId('dashboard-report');
    report.style.minWidth = '0px';
    await user.click(screen.getByRole('button', { name: 'Export Visual PDF' }));

    await waitFor(() => expect(exportFinancialReportToPdf).toHaveBeenCalledTimes(1));
    const [data, options] = jest.mocked(exportFinancialReportToPdf).mock.calls[0];
    expect(data).toMatchObject({
      title: 'Financial Report',
      author: 'PFinance user',
      period: 'per month',
      currency: 'AUD',
      expenseCategories: [
        expect.objectContaining({ category: 'Food', amount: 1000, percentage: 100 }),
      ],
      incomeSources: [
        expect.objectContaining({ source: 'Salary', percentage: 100 }),
      ],
    });
    expect(data.summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Gross income', value: expect.stringContaining('5,000') }),
        expect.objectContaining({ label: 'Net savings', detail: '80.0% of gross income' }),
      ])
    );
    expect(options).toEqual({ onProgress: expect.any(Function) });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export Visual PDF' })).toBeEnabled()
    );
    expect(report.style.minWidth).toBe('0px');
  });

  it('shows an actionable error and leaves the preview unchanged when rendering fails', async () => {
    const user = userEvent.setup();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(exportFinancialReportToPdf).mockRejectedValue(new Error('WASM rendering failed'));
    render(<ReportGenerator />);

    const report = screen.getByTestId('dashboard-report');
    await user.click(screen.getByRole('button', { name: 'Export Visual PDF' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Visual PDF export failed. Try again, or use Data Report for a text-based PDF.'
    );
    await waitFor(() => expect(exportFinancialReportToPdf).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Export Visual PDF' })).toBeEnabled()
    );
    expect(report.style.minWidth).toBe('');
  });
});
