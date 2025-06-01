'use client';

import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where, 
  onSnapshot,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from './AuthContext';
import { 
  Expense, 
  ExpenseCategory, 
  Income, 
  IncomeFrequency, 
  TaxStatus, 
  Deduction 
} from '../types';

// Multi-user types
export interface FinanceGroup {
  id: string;
  name: string;
  description?: string;
  members: GroupMember[];
  createdBy: string;
  createdAt: Date;
  settings: GroupSettings;
}

export interface GroupMember {
  userId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

export interface GroupSettings {
  currency: string;
  allowMemberInvites: boolean;
  autoApproveExpenses: boolean;
  defaultSplitMethod: 'equal' | 'percentage' | 'manual';
}

export interface GroupExpense extends Expense {
  groupId: string;
  addedBy: string;
  splits: ExpenseSplit[];
  approvedBy?: string;
  approved: boolean;
}

export interface ExpenseSplit {
  userId: string;
  amount: number;
  percentage?: number;
  paid: boolean;
  paidAt?: Date;
}

export interface GroupIncome extends Income {
  groupId: string;
  addedBy: string;
}

interface MultiUserFinanceContextType {
  // Group management
  groups: FinanceGroup[];
  activeGroup: FinanceGroup | null;
  setActiveGroup: (group: FinanceGroup | null) => void;
  createGroup: (name: string, description?: string) => Promise<string>;
  inviteUserToGroup: (groupId: string, email: string, role?: 'admin' | 'member') => Promise<void>;
  leaveGroup: (groupId: string) => Promise<void>;
  updateGroupSettings: (groupId: string, settings: Partial<GroupSettings>) => Promise<void>;

  // Group expenses
  groupExpenses: GroupExpense[];
  addGroupExpense: (
    groupId: string, 
    expense: Omit<Expense, 'id' | 'date'>, 
    splits: Omit<ExpenseSplit, 'paid' | 'paidAt'>[]
  ) => Promise<string>;
  updateGroupExpense: (expenseId: string, expense: Partial<GroupExpense>) => Promise<void>;
  deleteGroupExpense: (expenseId: string) => Promise<void>;
  markExpenseAsPaid: (expenseId: string, userId: string) => Promise<void>;

  // Group incomes
  groupIncomes: GroupIncome[];
  addGroupIncome: (groupId: string, income: Omit<Income, 'id' | 'date'>) => Promise<string>;
  updateGroupIncome: (incomeId: string, income: Partial<GroupIncome>) => Promise<void>;
  deleteGroupIncome: (incomeId: string) => Promise<void>;

  // Analytics
  getGroupExpenseSummary: (groupId: string) => { [category in ExpenseCategory]?: number };
  getUserOwedAmount: (groupId: string, userId: string) => number;
  getUserOwesAmount: (groupId: string, userId: string) => number;

  loading: boolean;
  error: string | null;
}

const MultiUserFinanceContext = createContext<MultiUserFinanceContextType | undefined>(undefined);

export function MultiUserFinanceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<FinanceGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<FinanceGroup | null>(null);
  const [groupExpenses, setGroupExpenses] = useState<GroupExpense[]>([]);
  const [groupIncomes, setGroupIncomes] = useState<GroupIncome[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load user's groups
  useEffect(() => {
    if (!user) {
      setGroups([]);
      setActiveGroup(null);
      return;
    }

    setLoading(true);
    const groupsQuery = query(
      collection(db, 'financeGroups'),
      where('members', 'array-contains', {
        userId: user.uid,
        email: user.email,
        displayName: user.displayName || user.email
      })
    );

    const unsubscribe = onSnapshot(groupsQuery, (snapshot) => {
      const groupsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        members: doc.data().members?.map((member: any) => ({
          ...member,
          joinedAt: member.joinedAt?.toDate() || new Date()
        })) || []
      })) as FinanceGroup[];
      
      setGroups(groupsData);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  // Load expenses for active group
  useEffect(() => {
    if (!activeGroup) {
      setGroupExpenses([]);
      return;
    }

    const expensesQuery = query(
      collection(db, 'groupExpenses'),
      where('groupId', '==', activeGroup.id)
    );

    const unsubscribe = onSnapshot(expensesQuery, (snapshot) => {
      const expensesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      })) as GroupExpense[];
      
      setGroupExpenses(expensesData);
    });

    return unsubscribe;
  }, [activeGroup]);

  // Load incomes for active group
  useEffect(() => {
    if (!activeGroup) {
      setGroupIncomes([]);
      return;
    }

    const incomesQuery = query(
      collection(db, 'groupIncomes'),
      where('groupId', '==', activeGroup.id)
    );

    const unsubscribe = onSnapshot(incomesQuery, (snapshot) => {
      const incomesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      })) as GroupIncome[];
      
      setGroupIncomes(incomesData);
    });

    return unsubscribe;
  }, [activeGroup]);

  const createGroup = async (name: string, description?: string): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const groupData = {
      name,
      description: description || '',
      members: [{
        userId: user.uid,
        email: user.email!,
        displayName: user.displayName || user.email!,
        role: 'owner',
        joinedAt: serverTimestamp()
      }],
      createdBy: user.uid,
      createdAt: serverTimestamp(),
      settings: {
        currency: 'USD',
        allowMemberInvites: true,
        autoApproveExpenses: true,
        defaultSplitMethod: 'equal'
      }
    };

    const docRef = await addDoc(collection(db, 'financeGroups'), groupData);
    return docRef.id;
  };

  const inviteUserToGroup = async (groupId: string, email: string, role: 'admin' | 'member' = 'member'): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    // In a real implementation, you'd send an email invitation
    // For now, we'll just add the user if they exist
    const newMember = {
      userId: email, // This would be resolved to actual user ID
      email,
      displayName: email,
      role,
      joinedAt: serverTimestamp()
    };

    const groupRef = doc(db, 'financeGroups', groupId);
    // This is a simplified implementation - you'd want to check if user exists first
    await updateDoc(groupRef, {
      members: [...(groups.find(g => g.id === groupId)?.members || []), newMember]
    });
  };

  const leaveGroup = async (groupId: string): Promise<void> => {
    if (!user) throw new Error('User must be authenticated');

    const group = groups.find(g => g.id === groupId);
    if (!group) return;

    const updatedMembers = group.members.filter(m => m.userId !== user.uid);
    
    if (updatedMembers.length === 0) {
      // If last member, delete the group
      await deleteDoc(doc(db, 'financeGroups', groupId));
    } else {
      await updateDoc(doc(db, 'financeGroups', groupId), {
        members: updatedMembers
      });
    }
  };

  const updateGroupSettings = async (groupId: string, settings: Partial<GroupSettings>): Promise<void> => {
    const groupRef = doc(db, 'financeGroups', groupId);
    await updateDoc(groupRef, { settings });
  };

  const addGroupExpense = async (
    groupId: string, 
    expense: Omit<Expense, 'id' | 'date'>, 
    splits: Omit<ExpenseSplit, 'paid' | 'paidAt'>[]
  ): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const expenseData = {
      ...expense,
      groupId,
      addedBy: user.uid,
      date: serverTimestamp(),
      splits: splits.map(split => ({
        ...split,
        paid: false
      })),
      approved: true, // Auto-approve for now
      approvedBy: user.uid
    };

    const docRef = await addDoc(collection(db, 'groupExpenses'), expenseData);
    return docRef.id;
  };

  const updateGroupExpense = async (expenseId: string, expense: Partial<GroupExpense>): Promise<void> => {
    const expenseRef = doc(db, 'groupExpenses', expenseId);
    await updateDoc(expenseRef, expense);
  };

  const deleteGroupExpense = async (expenseId: string): Promise<void> => {
    await deleteDoc(doc(db, 'groupExpenses', expenseId));
  };

  const markExpenseAsPaid = async (expenseId: string, userId: string): Promise<void> => {
    const expense = groupExpenses.find(e => e.id === expenseId);
    if (!expense) return;

    const updatedSplits = expense.splits.map(split => 
      split.userId === userId 
        ? { ...split, paid: true, paidAt: new Date() }
        : split
    );

    await updateGroupExpense(expenseId, { splits: updatedSplits });
  };

  const addGroupIncome = async (groupId: string, income: Omit<Income, 'id' | 'date'>): Promise<string> => {
    if (!user) throw new Error('User must be authenticated');

    const incomeData = {
      ...income,
      groupId,
      addedBy: user.uid,
      date: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'groupIncomes'), incomeData);
    return docRef.id;
  };

  const updateGroupIncome = async (incomeId: string, income: Partial<GroupIncome>): Promise<void> => {
    const incomeRef = doc(db, 'groupIncomes', incomeId);
    await updateDoc(incomeRef, income);
  };

  const deleteGroupIncome = async (incomeId: string): Promise<void> => {
    await deleteDoc(doc(db, 'groupIncomes', incomeId));
  };

  const getGroupExpenseSummary = (groupId: string) => {
    const groupExpensesForGroup = groupExpenses.filter(e => e.groupId === groupId);
    return groupExpensesForGroup.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {} as { [category in ExpenseCategory]?: number });
  };

  const getUserOwedAmount = (groupId: string, userId: string): number => {
    return groupExpenses
      .filter(e => e.groupId === groupId && e.addedBy === userId)
      .reduce((total, expense) => {
        const unpaidSplits = expense.splits.filter(s => s.userId !== userId && !s.paid);
        return total + unpaidSplits.reduce((sum, split) => sum + split.amount, 0);
      }, 0);
  };

  const getUserOwesAmount = (groupId: string, userId: string): number => {
    return groupExpenses
      .filter(e => e.groupId === groupId && e.addedBy !== userId)
      .reduce((total, expense) => {
        const userSplit = expense.splits.find(s => s.userId === userId && !s.paid);
        return total + (userSplit?.amount || 0);
      }, 0);
  };

  const value = {
    groups,
    activeGroup,
    setActiveGroup,
    createGroup,
    inviteUserToGroup,
    leaveGroup,
    updateGroupSettings,
    groupExpenses,
    addGroupExpense,
    updateGroupExpense,
    deleteGroupExpense,
    markExpenseAsPaid,
    groupIncomes,
    addGroupIncome,
    updateGroupIncome,
    deleteGroupIncome,
    getGroupExpenseSummary,
    getUserOwedAmount,
    getUserOwesAmount,
    loading,
    error
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