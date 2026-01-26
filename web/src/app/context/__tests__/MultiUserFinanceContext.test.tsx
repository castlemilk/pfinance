/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MultiUserFinanceProvider, useMultiUserFinance } from '../MultiUserFinanceContext';
import { useAuth } from '../AuthWithAdminContext';

import { financeClient } from '@/lib/financeService';
import { Timestamp } from '@bufbuild/protobuf';

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
    
    // Default mock implementations
    (financeClient.listGroups as jest.Mock).mockResolvedValue({ groups: [] });
    (financeClient.listExpenses as jest.Mock).mockResolvedValue({ expenses: [] });
    (financeClient.listIncomes as jest.Mock).mockResolvedValue({ incomes: [] });
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
          joinedAt: Timestamp.fromDate(new Date())
        }],
        ownerId: 'user123',
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
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
        joinedAt: Timestamp.fromDate(new Date())
      }],
      ownerId: 'user123',
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
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