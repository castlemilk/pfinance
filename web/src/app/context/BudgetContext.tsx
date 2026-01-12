'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { useAuth } from './AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { 
  Budget, 
  BudgetPeriod, 
  BudgetProgress,
  ExpenseCategory
} from '@/gen/pfinance/v1/types_pb';
import { 
  CreateBudgetRequest,
  UpdateBudgetRequest,
  ListBudgetsRequest,
  GetBudgetProgressRequest
} from '@/gen/pfinance/v1/finance_service_pb';
import { Timestamp } from '@bufbuild/protobuf';

interface BudgetContextType {
  // Budget data
  budgets: Budget[];
  activeBudgets: Budget[];
  personalBudgets: Budget[];
  sharedBudgets: Budget[];
  loading: boolean;
  error: string | null;

  // Budget CRUD operations
  createBudget: (params: CreateBudgetParams) => Promise<Budget | null>;
  updateBudget: (budgetId: string, params: UpdateBudgetParams) => Promise<Budget | null>;
  deleteBudget: (budgetId: string) => Promise<boolean>;
  getBudgetProgress: (budgetId: string, asOfDate?: Date) => Promise<BudgetProgress | null>;
  
  // Budget management
  refreshBudgets: (financeGroupId?: string) => Promise<void>;
  getBudgetById: (budgetId: string) => Budget | undefined;
  getBudgetsForCategory: (category: ExpenseCategory, financeGroupId?: string) => Budget[];
  getBudgetsForFinanceGroup: (financeGroupId: string) => Budget[];
  
  // Progress tracking
  budgetProgresses: Map<string, BudgetProgress>;
  refreshBudgetProgress: (budgetId: string) => Promise<void>;
  refreshAllBudgetProgresses: (financeGroupId?: string) => Promise<void>;
}

interface CreateBudgetParams {
  name: string;
  description?: string;
  amount: number;
  period: BudgetPeriod;
  categoryIds: ExpenseCategory[];
  startDate?: Date;
  endDate?: Date;
  financeGroupId?: string;
}

interface UpdateBudgetParams {
  name?: string;
  description?: string;
  amount?: number;
  period?: BudgetPeriod;
  categoryIds?: ExpenseCategory[];
  isActive?: boolean;
  endDate?: Date;
}

const BudgetContext = createContext<BudgetContextType | undefined>(undefined);

export function BudgetProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetProgresses, setBudgetProgresses] = useState<Map<string, BudgetProgress>>(new Map());
  const [error, setError] = useState<string | null>(null);

  // Dev mode: use API with mock user when NEXT_PUBLIC_DEV_MODE=true
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devUserId = 'local-dev-user';
  const effectiveUserId = user?.uid || (isDevMode ? devUserId : '');
  
  // Start with loading=true if we have a user ID
  const [loading, setLoading] = useState(!!effectiveUserId);

  // Computed values
  const activeBudgets = budgets.filter(budget => budget.isActive);
  const personalBudgets = budgets.filter(budget => !budget.groupId);
  const sharedBudgets = budgets.filter(budget => budget.groupId);

  // Refresh budgets function - defined before useEffect that uses it
  const refreshBudgets = useCallback(async (financeGroupId?: string) => {
    if (!effectiveUserId) return;

    setLoading(true);
    setError(null);

    try {
      const request = new ListBudgetsRequest({
        userId: effectiveUserId,
        groupId: financeGroupId || '',
        includeInactive: true,
        pageSize: 100
      });

      const response = await financeClient.listBudgets(request);
      
      if (financeGroupId) {
        // For shared budgets, merge with existing personal budgets
        setBudgets(prev => {
          const personalBudgets = prev.filter(b => !b.groupId);
          const newSharedBudgets = (response as any).budgets || [];
          return [...personalBudgets, ...newSharedBudgets];
        });
      } else {
        // For personal budgets, replace all
        setBudgets((response as any).budgets || []);
      }
      
      // Refresh progress for all active budgets
      if ((response as any).budgets) {
        await refreshAllBudgetProgresses(financeGroupId);
      }
    } catch (err) {
      console.error('Failed to load budgets:', err);
      setError('Failed to load budgets');
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  // Load budgets when effectiveUserId changes
  useEffect(() => {
    if (effectiveUserId) {
      refreshBudgets();
    } else {
      setBudgets([]);
      setBudgetProgresses(new Map());
    }
  }, [effectiveUserId, refreshBudgets]);

  // Create budget function
  const createBudget = useCallback(async (params: CreateBudgetParams): Promise<Budget | null> => {
    if (!effectiveUserId) return null;

    setError(null);

    try {
      const request = new CreateBudgetRequest({
        userId: effectiveUserId,
        groupId: params.financeGroupId || '',
        name: params.name,
        description: params.description || '',
        amount: params.amount,
        period: params.period,
        categoryIds: params.categoryIds,
        startDate: params.startDate ? Timestamp.fromDate(params.startDate) : undefined,
        endDate: params.endDate ? Timestamp.fromDate(params.endDate) : undefined
      });

      const response = await financeClient.createBudget(request);
      const newBudget = (response as any).budget;

      if (newBudget) {
        setBudgets(prev => [...prev, newBudget]);
        // Initialize progress for the new budget
        await refreshBudgetProgress(newBudget.id);
        return newBudget;
      }

      return null;
    } catch (err) {
      console.error('Failed to create budget:', err);
      setError('Failed to create budget');
      return null;
    }
  }, [effectiveUserId]);

  // Update budget function
  const updateBudget = useCallback(async (budgetId: string, params: UpdateBudgetParams): Promise<Budget | null> => {
    setError(null);

    try {
      const request = new UpdateBudgetRequest({
        budgetId,
        name: params.name || '',
        description: params.description || '',
        amount: params.amount || 0,
        period: params.period || BudgetPeriod.UNSPECIFIED,
        categoryIds: params.categoryIds || [],
        isActive: params.isActive ?? true,
        endDate: params.endDate ? Timestamp.fromDate(params.endDate) : undefined
      });

      const response = await financeClient.updateBudget(request);
      const updatedBudget = (response as any).budget;

      if (updatedBudget) {
        setBudgets(prev => prev.map(budget => 
          budget.id === budgetId ? updatedBudget : budget
        ));
        // Refresh progress for the updated budget
        await refreshBudgetProgress(budgetId);
        return updatedBudget;
      }

      return null;
    } catch (err) {
      console.error('Failed to update budget:', err);
      setError('Failed to update budget');
      return null;
    }
  }, []);

  // Delete budget function
  const deleteBudget = useCallback(async (budgetId: string): Promise<boolean> => {
    setError(null);

    try {
      await financeClient.deleteBudget({ budgetId });
      
      setBudgets(prev => prev.filter(budget => budget.id !== budgetId));
      setBudgetProgresses(prev => {
        const newMap = new Map(prev);
        newMap.delete(budgetId);
        return newMap;
      });

      return true;
    } catch (err) {
      console.error('Failed to delete budget:', err);
      setError('Failed to delete budget');
      return false;
    }
  }, []);

  // Get budget progress function
  const getBudgetProgress = useCallback(async (budgetId: string, asOfDate?: Date): Promise<BudgetProgress | null> => {
    setError(null);

    try {
      const request = new GetBudgetProgressRequest({
        budgetId,
        asOfDate: asOfDate ? Timestamp.fromDate(asOfDate) : undefined
      });

      const response = await financeClient.getBudgetProgress(request);
      return (response as any).progress || null;
    } catch (err) {
      console.error('Failed to get budget progress:', err);
      setError('Failed to get budget progress');
      return null;
    }
  }, []);

  // Refresh budget progress function
  const refreshBudgetProgress = useCallback(async (budgetId: string) => {
    const progress = await getBudgetProgress(budgetId);
    if (progress) {
      setBudgetProgresses(prev => new Map(prev).set(budgetId, progress));
    }
  }, [getBudgetProgress]);

  // Refresh all budget progresses function
  const refreshAllBudgetProgresses = useCallback(async (financeGroupId?: string) => {
    const budgetsToRefresh = financeGroupId 
      ? activeBudgets.filter(budget => budget.groupId === financeGroupId)
      : activeBudgets.filter(budget => !budget.groupId);
    
    const budgetIds = budgetsToRefresh.map(budget => budget.id);
    
    // Refresh progress for all active budgets in parallel
    await Promise.all(
      budgetIds.map(budgetId => refreshBudgetProgress(budgetId))
    );
  }, [activeBudgets, refreshBudgetProgress]);

  // Helper functions
  const getBudgetById = useCallback((budgetId: string): Budget | undefined => {
    return budgets.find(budget => budget.id === budgetId);
  }, [budgets]);

  const getBudgetsForCategory = useCallback((category: ExpenseCategory, financeGroupId?: string): Budget[] => {
    return activeBudgets.filter(budget => 
      budget.categoryIds.includes(category) &&
      (financeGroupId ? budget.groupId === financeGroupId : !budget.groupId)
    );
  }, [activeBudgets]);

  const getBudgetsForFinanceGroup = useCallback((financeGroupId: string): Budget[] => {
    return activeBudgets.filter(budget => budget.groupId === financeGroupId);
  }, [activeBudgets]);

  const contextValue: BudgetContextType = {
    // Data
    budgets,
    activeBudgets,
    personalBudgets,
    sharedBudgets,
    loading,
    error,
    
    // CRUD operations
    createBudget,
    updateBudget,
    deleteBudget,
    getBudgetProgress,
    
    // Management
    refreshBudgets,
    getBudgetById,
    getBudgetsForCategory,
    getBudgetsForFinanceGroup,
    
    // Progress tracking
    budgetProgresses,
    refreshBudgetProgress,
    refreshAllBudgetProgresses
  };

  return (
    <BudgetContext.Provider value={contextValue}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudgets() {
  const context = useContext(BudgetContext);
  if (context === undefined) {
    throw new Error('useBudgets must be used within a BudgetProvider');
  }
  return context;
}