import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useAuth } from '../../context/AuthWithAdminContext';
import { useBudgets } from '../../context/BudgetContext';
import { useGoals } from '../../context/GoalContext';
import SearchCommandPalette from '../SearchCommandPalette';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

jest.mock('@/lib/financeService', () => ({
  financeClient: {
    searchTransactions: jest.fn(),
  },
}));

jest.mock('../../context/AuthWithAdminContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('../../context/GoalContext', () => ({
  useGoals: jest.fn(),
}));

jest.mock('../../context/BudgetContext', () => ({
  useBudgets: jest.fn(),
}));

describe('SearchCommandPalette analytics navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useAuth).mockReturnValue({
      user: { uid: 'user-123' },
    } as unknown as ReturnType<typeof useAuth>);
    jest.mocked(useGoals).mockReturnValue({
      goals: [],
    } as unknown as ReturnType<typeof useGoals>);
    jest.mocked(useBudgets).mockReturnValue({
      budgets: [],
    } as unknown as ReturnType<typeof useBudgets>);
  });

  it('opens Shared Analytics from the page index', async () => {
    const user = userEvent.setup();
    render(<SearchCommandPalette />);

    fireEvent(document, new Event('pfinance:open-search'));
    await user.type(
      await screen.findByRole('textbox', { name: /search pages/i }),
      'Shared Analytics'
    );
    await user.click(await screen.findByText('Shared Analytics'));

    expect(push).toHaveBeenCalledWith('/shared/analytics');
  });
});
