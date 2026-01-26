'use client';

/**
 * MultiUserFinanceContext
 * 
 * Slim composition context that wires together the domain hooks.
 * All business logic is in the individual hooks for better testability.
 */

import { createContext, useContext, ReactNode, useCallback } from 'react';
import { useAuth } from '../AuthWithAdminContext';
import { 
  Expense,
  ExpenseAllocation,
  ExpenseCategory,
  ExpenseFrequency,
  SplitType,
} from '@/gen/pfinance/v1/types_pb';

// Import types
import { FinanceGroup, GroupIncome, InviteLink } from './types';

// Import hooks
import { useGroups } from './hooks/useGroups';
import { useGroupExpenses } from './hooks/useGroupExpenses';
import { useGroupIncomes } from './hooks/useGroupIncomes';
import { useInviteLinks } from './hooks/useInviteLinks';
import { useGroupMembers } from './hooks/useGroupMembers';
import { useGroupAnalytics } from './hooks/useGroupAnalytics';

// Re-export types for backward compatibility
export type { FinanceGroup, GroupMember, GroupIncome, InviteLink } from './types';

// ============================================================================
// Context Interface
// ============================================================================

interface MultiUserFinanceContextType {
  // Group management
  groups: FinanceGroup[];
  activeGroup: FinanceGroup | null;
  setActiveGroup: (group: FinanceGroup | null) => void;
  createGroup: (name: string, description?: string) => Promise<string>;
  updateGroup: (groupId: string, name: string, description?: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;

  // Member management
  inviteUserToGroup: (groupId: string, email: string, role?: 'admin' | 'member') => Promise<void>;
  removeMemberFromGroup: (groupId: string, userId: string) => Promise<void>;
  updateMemberRole: (groupId: string, userId: string, role: 'admin' | 'member' | 'viewer') => Promise<void>;

  // Invite links
  createInviteLink: (groupId: string, maxUses?: number, expiresInDays?: number) => Promise<InviteLink>;
  getInviteLinkByCode: (code: string) => Promise<{ link: InviteLink; group: FinanceGroup } | null>;
  joinGroupByCode: (code: string) => Promise<FinanceGroup>;
  listInviteLinks: (groupId: string) => Promise<InviteLink[]>;
  deactivateInviteLink: (linkId: string) => Promise<void>;

  // Group expenses
  groupExpenses: Expense[];
  addGroupExpense: (
    groupId: string, 
    description: string,
    amount: number,
    category: ExpenseCategory,
    frequency: ExpenseFrequency,
    paidByUserId: string,
    splitType: SplitType,
    allocations: ExpenseAllocation[]
  ) => Promise<string>;
  updateGroupExpense: (expenseId: string, updates: {
    description?: string;
    amount?: number;
    category?: ExpenseCategory;
    frequency?: ExpenseFrequency;
  }) => Promise<void>;
  deleteGroupExpense: (expenseId: string) => Promise<void>;
  settleExpense: (expenseId: string, userId: string) => Promise<void>;

  // Group incomes
  groupIncomes: GroupIncome[];
  addGroupIncome: (groupId: string, income: Omit<GroupIncome, 'id' | 'date' | 'groupId' | 'userId'>) => Promise<string>;
  updateGroupIncome: (incomeId: string, income: Partial<GroupIncome>) => Promise<void>;
  deleteGroupIncome: (incomeId: string) => Promise<void>;

  // Analytics
  getGroupExpenseSummary: (groupId: string) => { [key in ExpenseCategory]?: number };
  getUserOwedAmount: (groupId: string, userId: string) => number;
  getUserOwesAmount: (groupId: string, userId: string) => number;

  // Data refresh
  refreshGroups: () => Promise<void>;
  refreshGroupExpenses: () => Promise<void>;
  refreshGroupIncomes: () => Promise<void>;

  loading: boolean;
  error: string | null;
}

const MultiUserFinanceContext = createContext<MultiUserFinanceContextType | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export function MultiUserFinanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // Use domain hooks
  const groupsHook = useGroups({ user });
  
  const expensesHook = useGroupExpenses({ 
    user, 
    activeGroup: groupsHook.activeGroup 
  });
  
  const incomesHook = useGroupIncomes({ 
    user, 
    activeGroup: groupsHook.activeGroup 
  });

  // Callback for when a group is joined via invite link
  const handleGroupJoined = useCallback(() => {
    // Add to groups list - useGroups will handle state update
    groupsHook.refreshGroups();
  }, [groupsHook]);

  const inviteLinksHook = useInviteLinks({ 
    user, 
    onGroupJoined: handleGroupJoined 
  });
  
  const membersHook = useGroupMembers({ 
    user, 
    onMemberUpdated: groupsHook.refreshGroups 
  });
  
  const analyticsHook = useGroupAnalytics({ 
    groupExpenses: expensesHook.groupExpenses 
  });

  // Combine loading and error states
  const loading = groupsHook.loading || expensesHook.loading || incomesHook.loading;
  const error = groupsHook.error || expensesHook.error || incomesHook.error;

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: MultiUserFinanceContextType = {
    // Group management
    groups: groupsHook.groups,
    activeGroup: groupsHook.activeGroup,
    setActiveGroup: groupsHook.setActiveGroup,
    createGroup: groupsHook.createGroup,
    updateGroup: groupsHook.updateGroup,
    deleteGroup: groupsHook.deleteGroup,
    leaveGroup: groupsHook.leaveGroup,

    // Member management
    inviteUserToGroup: membersHook.inviteUserToGroup,
    removeMemberFromGroup: membersHook.removeMemberFromGroup,
    updateMemberRole: membersHook.updateMemberRole,

    // Invite links
    createInviteLink: inviteLinksHook.createInviteLink,
    getInviteLinkByCode: inviteLinksHook.getInviteLinkByCode,
    joinGroupByCode: inviteLinksHook.joinGroupByCode,
    listInviteLinks: inviteLinksHook.listInviteLinks,
    deactivateInviteLink: inviteLinksHook.deactivateInviteLink,

    // Group expenses
    groupExpenses: expensesHook.groupExpenses,
    addGroupExpense: expensesHook.addGroupExpense,
    updateGroupExpense: expensesHook.updateGroupExpense,
    deleteGroupExpense: expensesHook.deleteGroupExpense,
    settleExpense: expensesHook.settleExpense,

    // Group incomes
    groupIncomes: incomesHook.groupIncomes,
    addGroupIncome: incomesHook.addGroupIncome,
    updateGroupIncome: incomesHook.updateGroupIncome,
    deleteGroupIncome: incomesHook.deleteGroupIncome,

    // Analytics
    getGroupExpenseSummary: analyticsHook.getGroupExpenseSummary,
    getUserOwedAmount: analyticsHook.getUserOwedAmount,
    getUserOwesAmount: analyticsHook.getUserOwesAmount,

    // Data refresh
    refreshGroups: groupsHook.refreshGroups,
    refreshGroupExpenses: expensesHook.refreshGroupExpenses,
    refreshGroupIncomes: incomesHook.refreshGroupIncomes,

    loading,
    error,
  };

  return (
    <MultiUserFinanceContext.Provider value={value}>
      {children}
    </MultiUserFinanceContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useMultiUserFinance() {
  const context = useContext(MultiUserFinanceContext);
  if (context === undefined) {
    throw new Error('useMultiUserFinance must be used within a MultiUserFinanceProvider');
  }
  return context;
}
