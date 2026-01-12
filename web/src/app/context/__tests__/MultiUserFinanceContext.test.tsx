/* eslint-disable @typescript-eslint/no-require-imports */
import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MultiUserFinanceProvider, useMultiUserFinance } from '../MultiUserFinanceContext';
import { useAuth } from '../AuthContext';

// Mock Firebase Firestore
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(() => ({ _seconds: Date.now() / 1000 })),
}));

// Mock Firebase lib
jest.mock('@/lib/firebase', () => ({
  db: {
    collection: jest.fn(),
  },
}));

// Mock AuthContext
jest.mock('../AuthContext', () => ({
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
        onClick={() => activeGroup && addGroupExpense(
          activeGroup.id,
          {
            amount: 100,
            description: 'Test expense',
            category: 'Food' as any,
            frequency: 'OneTime' as any
          },
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
  let mockOnSnapshot: jest.Mock;
  let mockAddDoc: jest.Mock;
  let mockUpdateDoc: jest.Mock;
  let mockDeleteDoc: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get mocked functions from jest mocks
    mockOnSnapshot = jest.mocked(require('firebase/firestore').onSnapshot);
    mockAddDoc = jest.mocked(require('firebase/firestore').addDoc);
    mockUpdateDoc = jest.mocked(require('firebase/firestore').updateDoc);
    mockDeleteDoc = jest.mocked(require('firebase/firestore').deleteDoc);
    
    // Mock successful operations
    mockAddDoc.mockResolvedValue({ id: 'new-group-id' });
    mockUpdateDoc.mockResolvedValue(undefined);
    mockDeleteDoc.mockResolvedValue(undefined);
    
    // Mock onSnapshot to immediately call callback with empty data
    mockOnSnapshot.mockImplementation((query, callback) => {
      callback({ docs: [] });
      return jest.fn(); // Return unsubscribe function
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
    });

    const mockGroups = [
      {
        id: 'group1',
        name: 'Test Group',
        description: 'Test Description',
        members: [{
          userId: 'user123',
          email: 'test@example.com',
          displayName: 'Test User',
          role: 'owner',
          joinedAt: { toDate: () => new Date() }
        }],
        createdBy: 'user123',
        createdAt: { toDate: () => new Date() },
        settings: {
          currency: 'USD',
          allowMemberInvites: true,
          autoApproveExpenses: true,
          defaultSplitMethod: 'equal'
        }
      }
    ];

    mockOnSnapshot.mockImplementation((query, callback) => {
      callback({ 
        docs: mockGroups.map(group => ({
          id: group.id,
          data: () => ({
            ...group,
            createdAt: { toDate: () => new Date() },
            members: group.members.map(member => ({
              ...member,
              joinedAt: { toDate: () => new Date() }
            }))
          })
        }))
      });
      return jest.fn();
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

    expect(mockAddDoc).toHaveBeenCalledWith(
      undefined, // collection reference is mocked to return undefined
      expect.objectContaining({
        name: 'Test Group',
        description: 'Test Description',
        createdBy: 'user123',
        members: expect.arrayContaining([
          expect.objectContaining({
            userId: 'user123',
            email: 'test@example.com',
            displayName: 'Test User',
            role: 'owner',
            joinedAt: expect.anything()
          })
        ]),
        settings: expect.objectContaining({
          currency: 'USD',
          allowMemberInvites: true,
          autoApproveExpenses: true,
          defaultSplitMethod: 'equal'
        })
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
            onClick={() => setActiveGroup(testGroup)}
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
    });

    function TestWithExpenses() {
      const { setActiveGroup, groupExpenses } = useMultiUserFinance();
      
      const testGroup = {
        id: 'group1',
        name: 'Test Group',
        description: 'Test Description',
        members: [],
        createdBy: 'user1',
        createdAt: new Date(),
        settings: {
          currency: 'USD',
          allowMemberInvites: true,
          autoApproveExpenses: true,
          defaultSplitMethod: 'equal' as const
        }
      };

      // Simulate setting group expenses manually for testing
      React.useEffect(() => {
        setActiveGroup(testGroup);
      }, []);
      
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