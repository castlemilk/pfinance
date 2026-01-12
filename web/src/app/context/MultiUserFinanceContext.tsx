'use client';

/**
 * MultiUserFinanceContext
 * 
 * Context for managing group finance operations through the backend API.
 * All data operations go through the Connect-RPC API.
 */

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { useAuth } from './AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { 
  Expense,
  ExpenseAllocation,
  ExpenseCategory,
  ExpenseFrequency,
  FinanceGroup as ProtoFinanceGroup,
  GroupMember as ProtoGroupMember,
  GroupRole,
  GroupInviteLink,
  SplitType,
  IncomeFrequency as ProtoIncomeFrequency,
  TaxStatus as ProtoTaxStatus,
} from '@/gen/pfinance/v1/types_pb';
import { Timestamp } from '@bufbuild/protobuf';

// ============================================================================
// Local Types (for UI convenience)
// ============================================================================

export interface FinanceGroup {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  members: GroupMember[];
  memberIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GroupMember {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  joinedAt: Date;
}

export interface GroupIncome {
  id: string;
  groupId: string;
  userId: string;
  source: string;
  amount: number;
  frequency: 'weekly' | 'fortnightly' | 'monthly' | 'annually';
  date: Date;
}

export interface InviteLink {
  id: string;
  groupId: string;
  code: string;
  createdBy: string;
  defaultRole: 'member' | 'admin' | 'viewer';
  maxUses: number;
  currentUses: number;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

// ============================================================================
// Type Mapping Utilities
// ============================================================================

const protoRoleToLocal: Record<GroupRole, GroupMember['role']> = {
  [GroupRole.UNSPECIFIED]: 'member',
  [GroupRole.VIEWER]: 'viewer',
  [GroupRole.MEMBER]: 'member',
  [GroupRole.ADMIN]: 'admin',
  [GroupRole.OWNER]: 'owner',
};

const localRoleToProto: Record<GroupMember['role'], GroupRole> = {
  'viewer': GroupRole.VIEWER,
  'member': GroupRole.MEMBER,
  'admin': GroupRole.ADMIN,
  'owner': GroupRole.OWNER,
};

function mapProtoGroupToLocal(proto: ProtoFinanceGroup): FinanceGroup {
  return {
    id: proto.id,
    name: proto.name,
    description: proto.description,
    ownerId: proto.ownerId,
    memberIds: proto.memberIds,
    members: proto.members.map(m => ({
      userId: m.userId,
      email: m.email,
      displayName: m.displayName,
      role: protoRoleToLocal[m.role],
      joinedAt: m.joinedAt?.toDate() ?? new Date(),
    })),
    createdAt: proto.createdAt?.toDate() ?? new Date(),
    updatedAt: proto.updatedAt?.toDate() ?? new Date(),
  };
}

function mapProtoInviteLinkToLocal(proto: GroupInviteLink): InviteLink {
  return {
    id: proto.id,
    groupId: proto.groupId,
    code: proto.code,
    createdBy: proto.createdBy,
    defaultRole: protoRoleToLocal[proto.defaultRole] as 'member' | 'admin' | 'viewer',
    maxUses: proto.maxUses,
    currentUses: proto.currentUses,
    expiresAt: proto.expiresAt?.toDate(),
    isActive: proto.isActive,
    createdAt: proto.createdAt?.toDate() ?? new Date(),
  };
}

const incomeFrequencyToProto: Record<GroupIncome['frequency'], ProtoIncomeFrequency> = {
  'weekly': ProtoIncomeFrequency.WEEKLY,
  'fortnightly': ProtoIncomeFrequency.FORTNIGHTLY,
  'monthly': ProtoIncomeFrequency.MONTHLY,
  'annually': ProtoIncomeFrequency.ANNUALLY,
};

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

export function MultiUserFinanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<FinanceGroup | null>(null);
  const [groupExpenses, setGroupExpenses] = useState<Expense[]>([]);
  const [groupIncomes, setGroupIncomes] = useState<GroupIncome[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================================
  // Data Loading
  // ============================================================================

  const refreshGroups = useCallback(async () => {
    if (!user) {
      setGroups([]);
      return;
    }

    try {
      const response = await financeClient.listGroups({
        userId: user.uid,
        pageSize: 100,
      });
      setGroups(response.groups.map(mapProtoGroupToLocal));
    } catch (err) {
      console.error('Failed to load groups:', err);
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    }
  }, [user]);

  const refreshGroupExpenses = useCallback(async () => {
    if (!user || !activeGroup) {
      setGroupExpenses([]);
      return;
    }

    try {
      const response = await financeClient.listExpenses({
        userId: user.uid,
        groupId: activeGroup.id,
        pageSize: 1000,
      });
      setGroupExpenses(response.expenses);
      setError(null);
    } catch (err) {
      console.error('Failed to load group expenses:', err);
      if (err instanceof Error && !err.message.includes('Failed to fetch')) {
        setError(err.message);
      }
    }
  }, [user, activeGroup]);

  const refreshGroupIncomes = useCallback(async () => {
    if (!user || !activeGroup) {
      setGroupIncomes([]);
      return;
    }

    try {
      const response = await financeClient.listIncomes({
        userId: user.uid,
        groupId: activeGroup.id,
        pageSize: 1000,
      });
      setGroupIncomes(response.incomes.map(i => ({
        id: i.id,
        groupId: i.groupId,
        userId: i.userId,
        source: i.source,
        amount: i.amount,
        frequency: i.frequency === ProtoIncomeFrequency.WEEKLY ? 'weekly' :
                   i.frequency === ProtoIncomeFrequency.FORTNIGHTLY ? 'fortnightly' :
                   i.frequency === ProtoIncomeFrequency.MONTHLY ? 'monthly' : 'annually',
        date: i.date?.toDate() ?? new Date(),
      })));
    } catch (err) {
      console.error('Failed to load group incomes:', err);
    }
  }, [user, activeGroup]);

  // Load groups on mount
  useEffect(() => {
    if (user) {
      setLoading(true);
      refreshGroups().finally(() => setLoading(false));
    } else {
      setGroups([]);
      setActiveGroup(null);
    }
  }, [user, refreshGroups]);

  // Load expenses and incomes when active group changes
  useEffect(() => {
    refreshGroupExpenses();
    refreshGroupIncomes();
  }, [activeGroup, refreshGroupExpenses, refreshGroupIncomes]);

  // Set up polling for real-time updates
  useEffect(() => {
    if (!activeGroup || typeof window === 'undefined') return;

    const isSharedPage = window.location.pathname.startsWith('/shared');
    if (!isSharedPage) return;

    const intervalId = setInterval(() => {
      refreshGroupExpenses();
    }, 5000);

    return () => clearInterval(intervalId);
  }, [activeGroup, refreshGroupExpenses]);

  // ============================================================================
  // Group Management
  // ============================================================================

  const createGroup = async (name: string, description?: string): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.createGroup({
      ownerId: user.uid,
      name,
      description: description || '',
    });

    if (response.group) {
      const newGroup = mapProtoGroupToLocal(response.group);
      setGroups(prev => [...prev, newGroup]);
      return newGroup.id;
    }
    throw new Error('Failed to create group');
  };

  const updateGroup = async (groupId: string, name: string, description?: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.updateGroup({
      groupId,
      name,
      description: description || '',
    });

    if (response.group) {
      const updatedGroup = mapProtoGroupToLocal(response.group);
      setGroups(prev => prev.map(g => g.id === groupId ? updatedGroup : g));
      if (activeGroup?.id === groupId) {
        setActiveGroup(updatedGroup);
      }
    }
  };

  const deleteGroup = async (groupId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.deleteGroup({ groupId });
    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (activeGroup?.id === groupId) {
      setActiveGroup(null);
    }
  };

  const leaveGroup = async (groupId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.removeFromGroup({
      groupId,
      userId: user.uid,
    });

    setGroups(prev => prev.filter(g => g.id !== groupId));
    if (activeGroup?.id === groupId) {
      setActiveGroup(null);
    }
  };

  // ============================================================================
  // Member Management
  // ============================================================================

  const inviteUserToGroup = async (groupId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.inviteToGroup({
      groupId,
      inviterId: user.uid,
      inviteeEmail: email,
      role: localRoleToProto[role],
    });
  };

  const removeMemberFromGroup = async (groupId: string, userId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.removeFromGroup({ groupId, userId });
    await refreshGroups();
  };

  const updateMemberRole = async (groupId: string, userId: string, role: 'admin' | 'member' | 'viewer'): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.updateMemberRole({
      groupId,
      userId,
      newRole: localRoleToProto[role],
    });
    await refreshGroups();
  };

  // ============================================================================
  // Invite Links
  // ============================================================================

  const createInviteLink = async (groupId: string, maxUses: number = 0, expiresInDays: number = 7): Promise<InviteLink> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.createInviteLink({
      groupId,
      createdBy: user.uid,
      defaultRole: GroupRole.MEMBER,
      maxUses,
      expiresInDays,
    });

    if (response.inviteLink) {
      return mapProtoInviteLinkToLocal(response.inviteLink);
    }
    throw new Error('Failed to create invite link');
  };

  const getInviteLinkByCode = async (code: string): Promise<{ link: InviteLink; group: FinanceGroup } | null> => {
    try {
      const response = await financeClient.getInviteLinkByCode({ code });
      if (response.inviteLink && response.group) {
        return {
          link: mapProtoInviteLinkToLocal(response.inviteLink),
          group: mapProtoGroupToLocal(response.group),
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  const joinGroupByCode = async (code: string): Promise<FinanceGroup> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.joinGroupByLink({
      code,
      userId: user.uid,
      userEmail: user.email || '',
      displayName: user.displayName || user.email || '',
    });

    if (response.group) {
      const joinedGroup = mapProtoGroupToLocal(response.group);
      setGroups(prev => [...prev, joinedGroup]);
      return joinedGroup;
    }
    throw new Error('Failed to join group');
  };

  const listInviteLinks = async (groupId: string): Promise<InviteLink[]> => {
    const response = await financeClient.listInviteLinks({
      groupId,
      includeInactive: false,
      pageSize: 100,
    });
    return response.inviteLinks.map(mapProtoInviteLinkToLocal);
  };

  const deactivateInviteLink = async (linkId: string): Promise<void> => {
    await financeClient.deactivateInviteLink({ linkId });
  };

  // ============================================================================
  // Group Expenses
  // ============================================================================

  const addGroupExpense = async (
    groupId: string,
    description: string,
    amount: number,
    category: ExpenseCategory,
    frequency: ExpenseFrequency,
    paidByUserId: string,
    splitType: SplitType,
    allocations: ExpenseAllocation[]
  ): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.createExpense({
      userId: user.uid,
      groupId,
      description,
      amount,
      category,
      frequency,
      paidByUserId,
      splitType,
      allocations,
      date: Timestamp.now(),
    });

    if (response.expense) {
      setGroupExpenses(prev => [...prev, response.expense!]);
      return response.expense.id;
    }
    throw new Error('Failed to create expense');
  };

  const updateGroupExpense = async (expenseId: string, updates: {
    description?: string;
    amount?: number;
    category?: ExpenseCategory;
    frequency?: ExpenseFrequency;
  }): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.updateExpense({
      expenseId,
      ...updates,
    });

    if (response.expense) {
      setGroupExpenses(prev => prev.map(e => 
        e.id === expenseId ? response.expense! : e
      ));
    }
  };

  const deleteGroupExpense = async (expenseId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.deleteExpense({ expenseId });
    setGroupExpenses(prev => prev.filter(e => e.id !== expenseId));
  };

  const settleExpense = async (expenseId: string, userId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.settleExpense({
      expenseId,
      userId,
      amount: 0, // Full settlement
    });

    if (response.expense) {
      setGroupExpenses(prev => prev.map(e => 
        e.id === expenseId ? response.expense! : e
      ));
    }
  };

  // ============================================================================
  // Group Incomes
  // ============================================================================

  const addGroupIncome = async (
    groupId: string, 
    income: Omit<GroupIncome, 'id' | 'date' | 'groupId' | 'userId'>
  ): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const response = await financeClient.createIncome({
      userId: user.uid,
      groupId,
      source: income.source,
      amount: income.amount,
      frequency: incomeFrequencyToProto[income.frequency],
      taxStatus: ProtoTaxStatus.POST_TAX,
      date: Timestamp.now(),
    });

    if (response.income) {
      setGroupIncomes(prev => [...prev, {
        id: response.income!.id,
        groupId: response.income!.groupId,
        userId: response.income!.userId,
        source: response.income!.source,
        amount: response.income!.amount,
        frequency: income.frequency,
        date: response.income!.date?.toDate() ?? new Date(),
      }]);
      return response.income.id;
    }
    throw new Error('Failed to create income');
  };

  const updateGroupIncome = async (incomeId: string, updates: Partial<GroupIncome>): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.updateIncome({
      incomeId,
      source: updates.source,
      amount: updates.amount,
      frequency: updates.frequency ? incomeFrequencyToProto[updates.frequency] : undefined,
    });

    setGroupIncomes(prev => prev.map(i => 
      i.id === incomeId ? { ...i, ...updates } : i
    ));
  };

  const deleteGroupIncome = async (incomeId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    await financeClient.deleteIncome({ incomeId });
    setGroupIncomes(prev => prev.filter(i => i.id !== incomeId));
  };

  // ============================================================================
  // Analytics
  // ============================================================================

  const getGroupExpenseSummary = (groupId: string) => {
    const groupExpensesForGroup = groupExpenses.filter(e => e.groupId === groupId);
    return groupExpensesForGroup.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {} as { [key in ExpenseCategory]?: number });
  };

  const getUserOwedAmount = (groupId: string, userId: string): number => {
    return groupExpenses
      .filter(e => e.groupId === groupId && e.paidByUserId === userId)
      .reduce((total, expense) => {
        const unpaidAllocations = expense.allocations.filter(
          a => a.userId !== userId && !a.isPaid
        );
        return total + unpaidAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
      }, 0);
  };

  const getUserOwesAmount = (groupId: string, userId: string): number => {
    return groupExpenses
      .filter(e => e.groupId === groupId && e.paidByUserId !== userId)
      .reduce((total, expense) => {
        const userAllocation = expense.allocations.find(
          a => a.userId === userId && !a.isPaid
        );
        return total + (userAllocation?.amount || 0);
      }, 0);
  };

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: MultiUserFinanceContextType = {
    // Group management
    groups,
    activeGroup,
    setActiveGroup,
    createGroup,
    updateGroup,
    deleteGroup,
    leaveGroup,

    // Member management
    inviteUserToGroup,
    removeMemberFromGroup,
    updateMemberRole,

    // Invite links
    createInviteLink,
    getInviteLinkByCode,
    joinGroupByCode,
    listInviteLinks,
    deactivateInviteLink,

    // Group expenses
    groupExpenses,
    addGroupExpense,
    updateGroupExpense,
    deleteGroupExpense,
    settleExpense,

    // Group incomes
    groupIncomes,
    addGroupIncome,
    updateGroupIncome,
    deleteGroupIncome,

    // Analytics
    getGroupExpenseSummary,
    getUserOwedAmount,
    getUserOwesAmount,

    // Data refresh
    refreshGroups,
    refreshGroupExpenses,
    refreshGroupIncomes,

    loading,
    error,
  };

  return (
    <MultiUserFinanceContext.Provider value={value}>
      {children}
    </MultiUserFinanceContext.Provider>
  );
}

export function useMultiUserFinance() {
  const context = useContext(MultiUserFinanceContext);
  if (context === undefined) {
    throw new Error('useMultiUserFinance must be used within a MultiUserFinanceProvider');
  }
  return context;
}
