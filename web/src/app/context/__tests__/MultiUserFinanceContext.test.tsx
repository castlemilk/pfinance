/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MultiUserFinanceProvider, useMultiUserFinance } from '../MultiUserFinanceContext';
import { useAuth } from '../AuthWithAdminContext';

import { financeClient } from '@/lib/financeService';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { SubscriptionTier, SubscriptionStatus } from '@/gen/pfinance/v1/types_pb';

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
  const { groups, activeGroup, setActiveGroup, refreshGroups } = useMultiUserFinance();

  return (
    <div>
      <div data-testid="probe-active-group">{activeGroup?.name ?? 'none'}</div>
      <div data-testid="probe-groups">{groups.map(group => group.name).join(',')}</div>
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
    ['missing preference', null],
    ['stale preference', 'missing-group'],
  ])('falls back to group A for a %s', async (_case, persistedId) => {
    mockUseAuth.mockReturnValue(createAuthValue('user123'));
    if (persistedId) {
      window.localStorage.setItem('pfinance-active-group-user123', persistedId);
    }
    (financeClient.listGroups as jest.Mock).mockResolvedValue({
      groups: [createMockGroup('group-a', 'Group A'), createMockGroup('group-b', 'Group B')],
    });

    render(<MultiUserFinanceProvider><GroupStateProbe /></MultiUserFinanceProvider>);

    await waitFor(() => expect(screen.getByTestId('probe-active-group')).toHaveTextContent('Group A'));
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
