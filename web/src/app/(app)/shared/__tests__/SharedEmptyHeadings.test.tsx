import { render, screen } from '@testing-library/react';

import { useAuth } from '../../../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../../../context/MultiUserFinanceContext';
import SharedExpensesPage from '../expenses/page';
import SharedReportsPage from '../reports/page';

jest.mock('../../../context/AuthWithAdminContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../../context/MultiUserFinanceContext', () => ({
  useMultiUserFinance: jest.fn(),
}));

jest.mock('../../../components/GroupExpenseForm', () => () => null);
jest.mock('../../../components/GroupExpenseList', () => () => null);
jest.mock('../../../components/ReportGenerator', () => () => null);
jest.mock('../../../components/analytics/AnalyticsExpenseFilterSummary', () => ({
  AnalyticsExpenseFilterSummary: () => null,
}));

describe('shared route empty headings', () => {
  beforeEach(() => {
    jest.mocked(useAuth).mockReturnValue({
      user: { uid: 'user-1' },
      loading: false,
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(useMultiUserFinance).mockReturnValue({
      activeGroup: null,
    } as unknown as ReturnType<typeof useMultiUserFinance>);
  });

  it.each([
    ['expenses', SharedExpensesPage],
    ['reports', SharedReportsPage],
  ])('uses an h2 for the %s no-active-group state', (_route, Page) => {
    render(<Page />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Select a Finance Group' })
    ).toBeInTheDocument();
  });
});
