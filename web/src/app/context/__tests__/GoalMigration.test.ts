const createGoal = jest.fn();

jest.mock('@/lib/financeService', () => ({
  financeClient: { createGoal: (...args: unknown[]) => createGoal(...args) },
}));
jest.mock('../AuthWithAdminContext', () => ({ useAuth: () => ({ user: null, loading: false }) }));

import { migrateDemoGoals } from '../GoalContext';

const DEMO_GOALS_KEY = 'pfinance-demo-goals';

function demoGoal(id: string, status = 'active') {
  return {
    id,
    userId: 'demo-user',
    name: `Goal ${id}`,
    goalType: 'savings',
    targetAmount: 1000,
    currentAmount: 100,
    startDate: '2026-11-01T00:00:00.000Z',
    targetDate: '2027-11-01T00:00:00.000Z',
    status,
    milestones: [],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  };
}

describe('migrateDemoGoals', () => {
  beforeEach(() => {
    createGoal.mockReset();
    localStorage.clear();
  });

  it('creates each signed-out goal in the account and clears local storage', async () => {
    localStorage.setItem(DEMO_GOALS_KEY, JSON.stringify([demoGoal('a'), demoGoal('b'), demoGoal('c', 'cancelled')]));
    createGoal.mockResolvedValue({ goal: {} });

    await expect(migrateDemoGoals('user-1')).resolves.toBe(2);

    expect(createGoal).toHaveBeenCalledTimes(2);
    expect(createGoal.mock.calls[0][0]).toMatchObject({ userId: 'user-1', name: 'Goal a', targetAmount: 1000, initialAmount: 100 });
    expect(localStorage.getItem(DEMO_GOALS_KEY)).toBeNull();
  });

  it('keeps unmigrated goals after a failure so a retry never duplicates', async () => {
    localStorage.setItem(DEMO_GOALS_KEY, JSON.stringify([demoGoal('a'), demoGoal('b')]));
    createGoal.mockResolvedValueOnce({ goal: {} }).mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(migrateDemoGoals('user-1')).resolves.toBe(1);
    const left = JSON.parse(localStorage.getItem(DEMO_GOALS_KEY) || '[]');
    expect(left.map((g: { id: string }) => g.id)).toEqual(['b']);

    createGoal.mockResolvedValue({ goal: {} });
    await expect(migrateDemoGoals('user-1')).resolves.toBe(1);
    expect(createGoal.mock.calls.map((call) => call[0].name)).toEqual(['Goal a', 'Goal b', 'Goal b']);
    expect(localStorage.getItem(DEMO_GOALS_KEY)).toBeNull();
  });

  it('shares one migration between overlapping calls', async () => {
    localStorage.setItem(DEMO_GOALS_KEY, JSON.stringify([demoGoal('a')]));
    createGoal.mockResolvedValue({ goal: {} });

    const [first, second] = await Promise.all([migrateDemoGoals('user-1'), migrateDemoGoals('user-1')]);

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(createGoal).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there are no signed-out goals', async () => {
    await expect(migrateDemoGoals('user-1')).resolves.toBe(0);
    expect(createGoal).not.toHaveBeenCalled();
  });
});
