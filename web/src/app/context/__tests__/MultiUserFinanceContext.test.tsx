/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MultiUserFinanceProvider, useMultiUserFinance } from '../MultiUserFinanceContext';
import { useAuth } from '../AuthWithAdminContext';

import { financeClient } from '@/lib/financeService';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  ExpenseCategory,
  ExpenseFrequency,
  SplitType,
  SubscriptionTier,
  SubscriptionStatus,
} from '@/gen/pfinance/v1/types_pb';

// Mock financeService
jest.mock('@/lib/financeService', () => ({
  financeClient: {
    listGroups: jest.fn(),
    createGroup: jest.fn(),
    updateGroup: jest.fn(),
    deleteGroup: jest.fn(),
    removeFromGroup: jest.fn(),
    inviteToGroup: jest.fn(),
    updateMemberRole: jest.fn(),
    listExpenses: jest.fn(),
    createExpense: jest.fn(),
    updateExpense: jest.fn(),
    deleteExpense: jest.fn(),
    listIncomes: jest.fn(),
    createIncome: jest.fn(),
    updateIncome: jest.fn(),
    deleteIncome: jest.fn(),
    settleExpense: jest.fn(),
  },
}));

// Mock AuthWithAdminContext
jest.mock('../AuthWithAdminContext', () => ({
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

// Helper to create mock user
const createMockUser = (uid: string, email: string, displayName: string) => ({
  uid,
  email,
  displayName,
  emailVerified: true,
  isAnonymous: false,
  metadata: {} as any,
  providerData: [],
  refreshToken: '',
  tenantId: null,
  delete: jest.fn(),
  getIdToken: jest.fn(),
  getIdTokenResult: jest.fn(),
  reload: jest.fn(),
  toJSON: jest.fn(),
  phoneNumber: null,
  photoURL: null,
  providerId: ''
} as any);

const createAuthValue = (uid: string) => {
  const user = createMockUser(uid, `${uid}@example.com`, uid);
  return {
    user,
    loading: false,
    signIn: jest.fn(),
    signUp: jest.fn(),
    signInWithGoogle: jest.fn(),
    logout: jest.fn(),
    isImpersonating: false,
    actualUser: user,
    subscriptionTier: SubscriptionTier.FREE,
    subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
    subscriptionLoading: false,
    refreshSubscription: jest.fn(),
  };
};

const createMockGroup = (id: string, name: string, ownerId = 'user123') => ({
  id,
  name,
  description: `${name} description`,
  memberIds: [ownerId],
  members: [{
    userId: ownerId,
    email: `${ownerId}@example.com`,
    displayName: ownerId,
    role: 4,
    joinedAt: timestampFromDate(new Date()),
  }],
  ownerId,
  createdAt: timestampFromDate(new Date()),
  updatedAt: timestampFromDate(new Date()),
  settings: {
    currency: 'USD',
    allowMemberInvites: true,
    autoApproveExpenses: true,
    defaultSplitMethod: 'equal',
  },
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function GroupStateProbe() {
  const {
    groups,
    activeGroup,
    groupExpenses,
    groupIncomes,
    setActiveGroup,
    createGroup,
    addGroupExpense,
    addGroupIncome,
    updateGroup,
    deleteGroup,
    leaveGroup,
    refreshGroups,
    loading,
  } = useMultiUserFinance();

  return (
    <div>
      <div data-testid="probe-loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="probe-active-group">{activeGroup?.name ?? 'none'}</div>
      <div data-testid="probe-groups">{groups.map(group => group.name).join(',')}</div>
      <div data-testid="probe-group-expenses">
        {groupExpenses.map(expense => expense.description).join(',')}
      </div>
      <div data-testid="probe-group-incomes">
        {groupIncomes.map(income => income.source).join(',')}
      </div>
      {groups.map(group => (
        <button
          key={group.id}
          data-testid={`select-${group.id}`}
          onClick={() => setActiveGroup(group)}
        >
          {group.name}
        </button>
      ))}
      <button data-testid="refresh-groups" onClick={() => void refreshGroups()}>
        Refresh
      </button>
      <button data-testid="probe-create-group" onClick={() => void createGroup('Created Group')}>
        Create
      </button>
      <button
        data-testid="probe-add-group-expense"
        onClick={() => activeGroup && void addGroupExpense(
          activeGroup.id,
          'Created expense',
          12,
          ExpenseCategory.FOOD,
          ExpenseFrequency.ONCE,
          activeGroup.ownerId,
          SplitType.EQUAL,
          []
        )}
      >
        Add expense
      </button>
      <button
        data-testid="probe-add-group-income"
        onClick={() => activeGroup && void addGroupIncome(activeGroup.id, {
          source: 'Created income',
          amount: 34,
          frequency: 'monthly',
        })}
      >
        Add income
      </button>
      <button
        data-testid="probe-update-group"
        onClick={() => activeGroup && void updateGroup(activeGroup.id, `${activeGroup.name} updated`)}
      >
        Update
      </button>
      <button
        data-testid="probe-delete-group"
        onClick={() => activeGroup && void deleteGroup(activeGroup.id)}
      >
        Delete
      </button>
      <button
        data-testid="probe-leave-group"
        onClick={() => activeGroup && void leaveGroup(activeGroup.id)}
      >
        Leave
      </button>
    </div>
  );
}

// Test component that uses the multi-user finance context
function TestComponent() {
  const { 
    groups, 
    activeGroup, 
    loading, 
    error,
    createGroup,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setActiveGroup,
    inviteUserToGroup,
    leaveGroup,
    addGroupExpense,
    getUserOwedAmount,
    getUserOwesAmount
  } = useMultiUserFinance();
  
  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="error">{error || 'no error'}</div>
      <div data-testid="groups-count">{groups.length}</div>
      <div data-testid="active-group">{activeGroup ? activeGroup.name : 'none'}</div>
      <button 
        data-testid="create-group"
        onClick={() => createGroup('Test Group', 'Test Description').catch(console.error)}
      >
        Create Group
      </button>
      <button 
        data-testid="invite-user"
        onClick={() => activeGroup && inviteUserToGroup(activeGroup.id, 'test@example.com')}
      >
        Invite User
      </button>
      <button 
        data-testid="leave-group"
        onClick={() => activeGroup && leaveGroup(activeGroup.id)}
      >
        Leave Group
      </button>
      <button 
        data-testid="add-expense"
        onClick={() => activeGroup && (addGroupExpense as any)(
          activeGroup.id,
          'Test expense',
          100,
          'Food',
          'OneTime',
          'user1',
          'Equal',
          [{ userId: 'user1', amount: 50 }, { userId: 'user2', amount: 50 }]
        )}
      >
        Add Expense
      </button>
      <div data-testid="owed-amount">
        {activeGroup ? getUserOwedAmount(activeGroup.id, 'user1') : 0}
      </div>
      <div data-testid="owes-amount">
        {activeGroup ? getUserOwesAmount(activeGroup.id, 'user1') : 0}
      </div>
    </div>
  );
}

describe('MultiUserFinanceContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.localStorage.clear();
    
    // Default mock implementations
    (financeClient.listGroups as jest.Mock).mockResolvedValue({ groups: [] });
    (financeClient.listExpenses as jest.Mock).mockResolvedValue({ expenses: [] });
    (financeClient.listIncomes as jest.Mock).mockResolvedValue({ incomes: [] });
  });

  it('restores persisted group B when group A is listed first', async () => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    window.localStorage.setItem('pfinance-active-group-user123', 'group-b');
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: [createMockGroup('group-a', 'Group A'), createMockGroup('group-b', 'Group B')],
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);

    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group B'));
  });

  it.each([
    ['missing preference', null, ['group-a', 'group-b'], 'Group A', 'group-a'],
    ['stale preference', 'missing-group', ['group-a', 'group-b'], 'Group A', 'group-a'],
    ['stale preference with no groups', 'missing-group', [], 'none', null],
  ])('persists the fallback for a %s', async (_case, persistedId, groupIds, activeName, expectedId) => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    if (persistedId) {
      window.localStorage.setItem('pfinance-active-group-user123', persistedId);
    }
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: groupIds.map(id => createMockGroup(id, id === 'group-a' ? 'Group A' : 'Group B')),
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('probe-active-group')).toHaveTextContent(activeName);
      expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe(expectedId);
    });
  });

  it('selects and persists a newly created group when no group is active', async () => {
    const createdGroup = createMockGroup('created-group', 'Created Group');
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock)
      .mockResolvedValueOnce({ groups: [] })
      .mockResolvedValueOnce({ groups: [createdGroup] });
    (financeClient.createGroup as jest.Mock).mockResolvedValue({
      group: createdGroup,
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('loaded'));
    await act(async () => {
      screen.getByTestId('probe-create-group').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Created Group');
      expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe('created-group');
    });
  });

  it('keeps the selected ID while replacing the group object after update', async () => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: [createMockGroup('group-a', 'Group A'), createMockGroup('group-b', 'Group B')],
    });
    (financeClient.updateGroup as jest.Mock).mockResolvedValue({
      group: createMockGroup('group-b', 'Group B updated'),
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('select-group-b')).toBeInTheDocument());
    await act(async () => {
      screen.getByTestId('select-group-b').click();
    });
    await act(async () => {
      screen.getByTestId('probe-update-group').click();
    });

    expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group B updated');
    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe('group-b');
  });

  it.each([
    ['deleting', 'probe-delete-group'],
    ['leaving', 'probe-leave-group'],
  ])('persists the next group after %s the active group, then clears the final selection', async (_case, actionId) => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    window.localStorage.setItem('pfinance-active-group-user123', 'group-a');
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: [createMockGroup('group-a', 'Group A'), createMockGroup('group-b', 'Group B')],
    });
    (financeClient.deleteGroup as jest.Mock).mockResolvedValue({});
    (financeClient.removeFromGroup as jest.Mock).mockResolvedValue({});

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group A'));
    await act(async () => {
      screen.getByTestId(actionId).click();
    });

    expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group B');
    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe('group-b');

    await act(async () => {
      screen.getByTestId(actionId).click();
    });
    expect(screen.getByTestId('probe-active-group')).toHaveTextContent('none');
    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBeNull();
  });

  it('persists an explicit selection under the authenticated user key', async () => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: [createMockGroup('group-a', 'Group A'), createMockGroup('group-b', 'Group B')],
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('select-group-b')).toBeInTheDocument());
    await act(async () => {
      screen.getByTestId('select-group-b').click();
    });

    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe('group-b');
  });

  it('replaces the active group object with refreshed data', async () => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock)
      .mockResolvedValueOnce({
        groups: [createMockGroup('group-a', 'Group A'), createMockGroup('group-b', 'Group B')],
      })
      .mockResolvedValueOnce({
        groups: [createMockGroup('group-b', 'Group B refreshed'), createMockGroup('group-a', 'Group A')],
      });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('select-group-b')).toBeInTheDocument());
    await act(async () => {
      screen.getByTestId('select-group-b').click();
    });
    await act(async () => {
      screen.getByTestId('refresh-groups').click();
    });

    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group B refreshed'));
  });

  it('ignores a deferred user-A response after switching to user B with the same group ID', async () => {
    const userAResponse = deferred<{ groups: ReturnType<typeof createMockGroup>[] }>();
    (financeClient.listGroups as jest.Mock).mockImplementation(({ userId }) => {
      if (userId === 'user-a') return userAResponse.promise;
      return Promise.resolve({ groups: [createMockGroup('shared-group', 'User B Group', 'user-b')] });
    });
    mockUseAuth.mockReturnValue(createAuthValue('user-a'));

    const { rerender } = render(
      <MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>
    );
    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-a' })
    ));

    mockUseAuth.mockReturnValue(createAuthValue('user-b'));
    rerender(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-b' })
    ));

    await act(async () => {
      userAResponse.resolve({ groups: [createMockGroup('shared-group', 'User A Group', 'user-a')] });
      await userAResponse.promise;
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-active-group')).toHaveTextContent('User B Group');
      expect(screen.getByTestId('probe-groups')).toHaveTextContent('User B Group');
    });
  });

  it('keeps dependent group data bound to the authenticated user through a same-ID switch', async () => {
    const userAExpenses = deferred<{ expenses: any[] }>();
    const userAIncomes = deferred<{ incomes: any[] }>();
    const sharedGroupId = 'shared-group';
    const userBExpense = {
      id: 'expense-b',
      groupId: sharedGroupId,
      userId: 'user-b',
      description: 'User B expense',
    };
    const userBIncome = {
      id: 'income-b',
      groupId: sharedGroupId,
      userId: 'user-b',
      source: 'User B income',
      amount: 20,
      amountCents: BigInt(2000),
      frequency: 3,
      date: timestampFromDate(new Date()),
    };

    (financeClient.listGroups as jest.Mock).mockImplementation(({ userId }) =>
      Promise.resolve({
        groups: [createMockGroup(sharedGroupId, `${userId} Group`, userId)],
      })
    );
    (financeClient.listExpenses as jest.Mock).mockImplementation(({ userId }) =>
      userId === 'user-a'
        ? userAExpenses.promise
        : Promise.resolve({ expenses: [userBExpense] })
    );
    (financeClient.listIncomes as jest.Mock).mockImplementation(({ userId }) =>
      userId === 'user-a'
        ? userAIncomes.promise
        : Promise.resolve({ incomes: [userBIncome] })
    );
    mockUseAuth.mockReturnValue(createAuthValue('user-a'));

    const { rerender } = render(
      <MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>
    );
    await waitFor(() => {
      expect(financeClient.listExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-a', groupId: sharedGroupId })
      );
      expect(financeClient.listIncomes).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-a', groupId: sharedGroupId })
      );
    });

    mockUseAuth.mockReturnValue(createAuthValue('user-b'));
    rerender(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);

    await waitFor(() => {
      expect(financeClient.listExpenses).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-b', groupId: sharedGroupId })
      );
      expect(financeClient.listIncomes).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-b', groupId: sharedGroupId })
      );
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-group-expenses')).toHaveTextContent('User B expense');
      expect(screen.getByTestId('probe-group-incomes')).toHaveTextContent('User B income');
    });

    await act(async () => {
      userAExpenses.resolve({
        expenses: [{
          id: 'expense-a',
          groupId: sharedGroupId,
          userId: 'user-a',
          description: 'User A expense',
        }],
      });
      userAIncomes.resolve({
        incomes: [{
          id: 'income-a',
          groupId: sharedGroupId,
          userId: 'user-a',
          source: 'User A income',
          amount: 10,
          amountCents: BigInt(1000),
          frequency: 3,
          date: timestampFromDate(new Date()),
        }],
      });
      await Promise.all([userAExpenses.promise, userAIncomes.promise]);
    });

    expect(screen.getByTestId('probe-group-expenses')).toHaveTextContent('User B expense');
    expect(screen.getByTestId('probe-group-expenses')).not.toHaveTextContent('User A expense');
    expect(screen.getByTestId('probe-group-incomes')).toHaveTextContent('User B income');
    expect(screen.getByTestId('probe-group-incomes')).not.toHaveTextContent('User A income');
  });

  it('reconciles existing dependent data when creates finish during initial loads', async () => {
    const initialExpenses = deferred<{ expenses: any[] }>();
    const initialIncomes = deferred<{ incomes: any[] }>();
    const groupId = 'group-a';
    const existingExpense = {
      id: 'expense-existing',
      groupId,
      userId: 'user123',
      description: 'Existing expense',
    };
    const createdExpense = {
      id: 'expense-created',
      groupId,
      userId: 'user123',
      description: 'Created expense',
    };
    const existingIncome = {
      id: 'income-existing',
      groupId,
      userId: 'user123',
      source: 'Existing income',
      amount: 10,
      amountCents: BigInt(1000),
      frequency: 3,
      date: timestampFromDate(new Date()),
    };
    const createdIncome = {
      id: 'income-created',
      groupId,
      userId: 'user123',
      source: 'Created income',
      amount: 34,
      amountCents: BigInt(3400),
      frequency: 3,
      date: timestampFromDate(new Date()),
    };

    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: [createMockGroup(groupId, 'Group A')],
    });
    (financeClient.listExpenses as jest.Mock)
      .mockReturnValueOnce(initialExpenses.promise)
      .mockResolvedValueOnce({ expenses: [existingExpense, createdExpense] });
    (financeClient.listIncomes as jest.Mock)
      .mockReturnValueOnce(initialIncomes.promise)
      .mockResolvedValueOnce({ incomes: [existingIncome, createdIncome] });
    (financeClient.createExpense as jest.Mock).mockResolvedValue({
      expense: createdExpense,
    });
    (financeClient.createIncome as jest.Mock).mockResolvedValue({
      income: createdIncome,
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group A'));
    await waitFor(() => {
      expect(financeClient.listExpenses).toHaveBeenCalledTimes(1);
      expect(financeClient.listIncomes).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      screen.getByTestId('probe-add-group-expense').click();
      screen.getByTestId('probe-add-group-income').click();
    });

    await waitFor(() => {
      expect(financeClient.listExpenses).toHaveBeenCalledTimes(2);
      expect(financeClient.listIncomes).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-group-expenses'))
        .toHaveTextContent('Existing expense,Created expense');
      expect(screen.getByTestId('probe-group-incomes'))
        .toHaveTextContent('Existing income,Created income');
    });

    await act(async () => {
      initialExpenses.resolve({ expenses: [existingExpense] });
      initialIncomes.resolve({ incomes: [existingIncome] });
      await Promise.all([initialExpenses.promise, initialIncomes.promise]);
    });

    expect(screen.getByTestId('probe-group-expenses'))
      .toHaveTextContent('Existing expense,Created expense');
    expect(screen.getByTestId('probe-group-incomes'))
      .toHaveTextContent('Existing income,Created income');
  });

  it('ignores dependent create completions from the previous user session', async () => {
    const createdExpenseResponse = deferred<{ expense: any }>();
    const createdIncomeResponse = deferred<{ income: any }>();
    const sharedGroupId = 'shared-group';
    const expenseFor = (userId: string) => ({
      id: `expense-${userId}`,
      groupId: sharedGroupId,
      userId,
      description: `${userId} expense`,
    });
    const incomeFor = (userId: string) => ({
      id: `income-${userId}`,
      groupId: sharedGroupId,
      userId,
      source: `${userId} income`,
      amount: 10,
      amountCents: BigInt(1000),
      frequency: 3,
      date: timestampFromDate(new Date()),
    });

    (financeClient.listGroups as jest.Mock).mockImplementation(({ userId }) =>
      Promise.resolve({
        groups: [createMockGroup(sharedGroupId, `${userId} Group`, userId)],
      })
    );
    (financeClient.listExpenses as jest.Mock).mockImplementation(({ userId }) =>
      Promise.resolve({ expenses: [expenseFor(userId)] })
    );
    (financeClient.listIncomes as jest.Mock).mockImplementation(({ userId }) =>
      Promise.resolve({ incomes: [incomeFor(userId)] })
    );
    (financeClient.createExpense as jest.Mock).mockReturnValue(createdExpenseResponse.promise);
    (financeClient.createIncome as jest.Mock).mockReturnValue(createdIncomeResponse.promise);
    mockUseAuth.mockReturnValue(createAuthValue('user-a'));

    const { rerender } = render(
      <MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('probe-group-expenses')).toHaveTextContent('user-a expense');
      expect(screen.getByTestId('probe-group-incomes')).toHaveTextContent('user-a income');
    });

    await act(async () => {
      screen.getByTestId('probe-add-group-expense').click();
      screen.getByTestId('probe-add-group-income').click();
    });
    await waitFor(() => {
      expect(financeClient.createExpense).toHaveBeenCalledTimes(1);
      expect(financeClient.createIncome).toHaveBeenCalledTimes(1);
    });

    mockUseAuth.mockReturnValue(createAuthValue('user-b'));
    rerender(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => {
      expect(screen.getByTestId('probe-group-expenses')).toHaveTextContent('user-b expense');
      expect(screen.getByTestId('probe-group-incomes')).toHaveTextContent('user-b income');
    });

    await act(async () => {
      createdExpenseResponse.resolve({ expense: {
        ...expenseFor('user-a'),
        id: 'created-expense-user-a',
        description: 'Created expense',
      } });
      createdIncomeResponse.resolve({ income: {
        ...incomeFor('user-a'),
        id: 'created-income-user-a',
        source: 'Created income',
      } });
      await Promise.all([createdExpenseResponse.promise, createdIncomeResponse.promise]);
    });

    expect(screen.getByTestId('probe-group-expenses')).toHaveTextContent('user-b expense');
    expect(screen.getByTestId('probe-group-expenses')).not.toHaveTextContent('Created expense');
    expect(screen.getByTestId('probe-group-incomes')).toHaveTextContent('user-b income');
    expect(screen.getByTestId('probe-group-incomes')).not.toHaveTextContent('Created income');
  });

  it('ignores a refresh started before a successful group creation', async () => {
    const staleRefresh = deferred<{ groups: ReturnType<typeof createMockGroup>[] }>();
    const createdGroup = createMockGroup('created-group', 'Created Group');
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock)
      .mockResolvedValueOnce({ groups: [] })
      .mockReturnValueOnce(staleRefresh.promise)
      .mockResolvedValueOnce({ groups: [createdGroup] });
    (financeClient.createGroup as jest.Mock).mockResolvedValue({
      group: createdGroup,
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('probe-loading')).toHaveTextContent('loaded'));
    await act(async () => {
      screen.getByTestId('refresh-groups').click();
    });
    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledTimes(2));
    await act(async () => {
      screen.getByTestId('probe-create-group').click();
    });

    await act(async () => {
      staleRefresh.resolve({ groups: [] });
      await staleRefresh.promise;
    });
    expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Created Group');
    expect(screen.getByTestId('probe-groups')).toHaveTextContent('Created Group');
    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe('created-group');
  });

  it('reconciles existing groups when creation finishes during the initial load', async () => {
    const initialGroups = deferred<{ groups: ReturnType<typeof createMockGroup>[] }>();
    const reconciledGroups = deferred<{ groups: ReturnType<typeof createMockGroup>[] }>();
    const existingGroup = createMockGroup('group-a', 'Group A');
    const createdGroup = createMockGroup('created-group', 'Created Group');
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    (financeClient.listGroups as jest.Mock)
      .mockReturnValueOnce(initialGroups.promise)
      .mockReturnValueOnce(reconciledGroups.promise);
    (financeClient.createGroup as jest.Mock).mockResolvedValue({
      group: createdGroup,
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledTimes(1));

    await act(async () => {
      screen.getByTestId('probe-create-group').click();
    });

    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('probe-loading')).toHaveTextContent('loading');

    await act(async () => {
      reconciledGroups.resolve({ groups: [existingGroup, createdGroup] });
      await reconciledGroups.promise;
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-groups')).toHaveTextContent('Group A,Created Group');
      expect(screen.getByTestId('probe-loading')).toHaveTextContent('loaded');
    });

    await act(async () => {
      initialGroups.resolve({ groups: [existingGroup] });
      await initialGroups.promise;
    });

    expect(screen.getByTestId('probe-groups')).toHaveTextContent('Group A,Created Group');
    expect(screen.getByTestId('probe-loading')).toHaveTextContent('loaded');
  });

  it('ignores stale group data from a refresh started before a successful update', async () => {
    const staleGroup = createMockGroup('group-a', 'Group A stale');
    const staleRefresh = deferred<{ groups: ReturnType<typeof createMockGroup>[] }>();
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    window.localStorage.setItem('pfinance-active-group-user123', 'group-a');
    (financeClient.listGroups as jest.Mock)
      .mockResolvedValueOnce({ groups: [staleGroup] })
      .mockReturnValueOnce(staleRefresh.promise);
    (financeClient.updateGroup as jest.Mock).mockResolvedValue({
      group: createMockGroup('group-a', 'Group A updated'),
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group A stale'));
    await act(async () => {
      screen.getByTestId('refresh-groups').click();
    });
    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledTimes(2));
    await act(async () => {
      screen.getByTestId('probe-update-group').click();
    });

    await act(async () => {
      staleRefresh.resolve({ groups: [staleGroup] });
      await staleRefresh.promise;
    });
    expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group A updated');
    expect(screen.getByTestId('probe-groups')).toHaveTextContent('Group A updated');
    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBe('group-a');
  });

  it.each([
    ['deletion', 'probe-delete-group'],
    ['leave', 'probe-leave-group'],
  ])('ignores a refresh started before a successful group %s', async (_case, actionId) => {
    const staleGroup = createMockGroup('group-a', 'Group A');
    const staleRefresh = deferred<{ groups: ReturnType<typeof createMockGroup>[] }>();
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    window.localStorage.setItem('pfinance-active-group-user123', 'group-a');
    (financeClient.listGroups as jest.Mock)
      .mockResolvedValueOnce({ groups: [staleGroup] })
      .mockReturnValueOnce(staleRefresh.promise);
    (financeClient.deleteGroup as jest.Mock).mockResolvedValue({});
    (financeClient.removeFromGroup as jest.Mock).mockResolvedValue({});

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);
    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group A'));
    await act(async () => {
      screen.getByTestId('refresh-groups').click();
    });
    await waitFor(() => expect(financeClient.listGroups).toHaveBeenCalledTimes(2));
    await act(async () => {
      screen.getByTestId(actionId).click();
    });

    await act(async () => {
      staleRefresh.resolve({ groups: [staleGroup] });
      await staleRefresh.promise;
    });
    expect(screen.getByTestId('probe-active-group')).toHaveTextContent('none');
    expect(screen.getByTestId('probe-groups')).toBeEmptyDOMElement();
    expect(window.localStorage.getItem('pfinance-active-group-user123')).toBeNull();
  });

  it('provides multi-user finance context when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signInWithGoogle: jest.fn(),
      logout: jest.fn(),
      isImpersonating: false,
      actualUser: null,
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
      subscriptionLoading: false,
      refreshSubscription: jest.fn(),
    });

    render(
      <MultiUserFinanceProvider>
        <TestComponent />
      </MultiUserFinanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('error')).toHaveTextContent('no error');
    expect(screen.getByTestId('groups-count')).toHaveTextContent('0');
    expect(screen.getByTestId('active-group')).toHaveTextContent('none');
  });

  it('loads groups when user is authenticated', async () => {
    const mockUser = createMockUser('user123', 'test@example.com', 'Test User');
    
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signInWithGoogle: jest.fn(),
      logout: jest.fn(),
      isImpersonating: false,
      actualUser: mockUser,
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
      subscriptionLoading: false,
      refreshSubscription: jest.fn(),
    });

    const mockGroups = [
      {
        id: 'group1',
        name: 'Test Group',
        description: 'Test Description',
        memberIds: ['user123'],
        members: [{
          userId: 'user123',
          email: 'test@example.com',
          displayName: 'Test User',
          role: 4, // OWNER
          joinedAt: timestampFromDate(new Date())
        }],
        ownerId: 'user123',
        createdAt: timestampFromDate(new Date()),
        updatedAt: timestampFromDate(new Date()),
        settings: {
          currency: 'USD',
          allowMemberInvites: true,
          autoApproveExpenses: true,
          defaultSplitMethod: 'equal'
        }
      }
    ];

    (financeClient.listGroups as jest.Mock).mockResolvedValue({ 
      groups: mockGroups
    });

    render(
      <MultiUserFinanceProvider>
        <TestComponent />
      </MultiUserFinanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    expect(screen.getByTestId('groups-count')).toHaveTextContent('1');
  });

  it('creates a new group successfully', async () => {
    const mockUser = createMockUser('user123', 'test@example.com', 'Test User');
    
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signInWithGoogle: jest.fn(),
      logout: jest.fn(),
      isImpersonating: false,
      actualUser: mockUser,
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
      subscriptionLoading: false,
      refreshSubscription: jest.fn(),
    });

    const mockNewGroup = {
      id: 'new-group-id',
      name: 'Test Group',
      description: 'Test Description',
      memberIds: ['user123'],
      members: [{
        userId: 'user123',
        email: 'test@example.com',
        displayName: 'Test User',
        role: 4, // OWNER
        joinedAt: timestampFromDate(new Date())
      }],
      ownerId: 'user123',
      createdAt: timestampFromDate(new Date()),
      updatedAt: timestampFromDate(new Date()),
    };

    (financeClient.createGroup as jest.Mock).mockResolvedValue({ 
      group: mockNewGroup
    });

    render(
      <MultiUserFinanceProvider>
        <TestComponent />
      </MultiUserFinanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    await act(async () => {
      screen.getByTestId('create-group').click();
    });

    expect(financeClient.createGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'user123',
        name: 'Test Group',
        description: 'Test Description',
      })
    );
  });

  it('handles group creation when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signInWithGoogle: jest.fn(),
      logout: jest.fn(),
      isImpersonating: false,
      actualUser: null,
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
      subscriptionLoading: false,
      refreshSubscription: jest.fn(),
    });

    render(
      <MultiUserFinanceProvider>
        <TestComponent />
      </MultiUserFinanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    // Should handle error when trying to create group without user
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    await act(async () => {
      screen.getByTestId('create-group').click();
    });

    // The error will be caught and logged, but won't throw to the component
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('sets active group correctly', async () => {
    const mockUser = createMockUser('user123', 'test@example.com', 'Test User');
    
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signInWithGoogle: jest.fn(),
      logout: jest.fn(),
      isImpersonating: false,
      actualUser: mockUser,
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
      subscriptionLoading: false,
      refreshSubscription: jest.fn(),
    });

    function TestSetActiveGroup() {
      const { setActiveGroup } = useMultiUserFinance();
      
      const testGroup = {
        id: 'group1',
        name: 'Test Group',
        description: 'Test Description',
        members: [],
        createdBy: 'user123',
        createdAt: new Date(),
        settings: {
          currency: 'USD',
          allowMemberInvites: true,
          autoApproveExpenses: true,
          defaultSplitMethod: 'equal' as const
        }
      };
      
      return (
        <div>
          <button 
            data-testid="set-active"
            onClick={() => setActiveGroup(testGroup as any)}
          >
            Set Active
          </button>
          <TestComponent />
        </div>
      );
    }

    render(
      <MultiUserFinanceProvider>
        <TestSetActiveGroup />
      </MultiUserFinanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    await act(async () => {
      screen.getByTestId('set-active').click();
    });

    expect(screen.getByTestId('active-group')).toHaveTextContent('Test Group');
  });

  it('calculates user owed and owes amounts correctly', async () => {
    const mockUser = createMockUser('user1', 'test@example.com', 'Test User');
    
    mockUseAuth.mockReturnValue({
      user: mockUser,
      loading: false,
      signIn: jest.fn(),
      signUp: jest.fn(),
      signInWithGoogle: jest.fn(),
      logout: jest.fn(),
      isImpersonating: false,
      actualUser: mockUser,
      subscriptionTier: SubscriptionTier.FREE,
      subscriptionStatus: SubscriptionStatus.UNSPECIFIED,
      subscriptionLoading: false,
      refreshSubscription: jest.fn(),
    });

    const testGroup = {
      id: 'group1',
      name: 'Test Group',
      description: 'Test Description',
      members: [],
      createdBy: 'user1',
      ownerId: 'user1',
      memberIds: ['user1'],
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        currency: 'USD',
        allowMemberInvites: true,
        autoApproveExpenses: true,
        defaultSplitMethod: 'equal' as const
      }
    };

    function TestWithExpenses() {
      const { setActiveGroup } = useMultiUserFinance();
      
      // Simulate setting group expenses manually for testing
      React.useEffect(() => {
        setActiveGroup(testGroup as any);
      }, [setActiveGroup]);
      
      return <TestComponent />;
    }

    render(
      <MultiUserFinanceProvider>
        <TestWithExpenses />
      </MultiUserFinanceProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    // Since the calculations depend on actual expense data,
    // we test that the functions don't crash and return numbers
    expect(screen.getByTestId('owed-amount')).toHaveTextContent('0');
    expect(screen.getByTestId('owes-amount')).toHaveTextContent('0');
  });

  it('throws error when useMultiUserFinance is used outside provider', () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    expect(() => {
      render(<TestComponent />);
    }).toThrow('useMultiUserFinance must be used within a MultiUserFinanceProvider');

    consoleErrorSpy.mockRestore();
  });
});
