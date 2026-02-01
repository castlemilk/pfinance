'use client';

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { 
  Budget, 
  BudgetPeriod, 
  BudgetProgress,
  ExpenseCategory
} from '@/gen/pfinance/v1/types_pb';
import type { 
  CreateBudgetRequest,
  UpdateBudgetRequest,
  ListBudgetsRequest,
  GetBudgetProgressRequest
} from '@/gen/pfinance/v1/finance_service_pb';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';

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
  const { user, loading: authLoading } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetProgresses, setBudgetProgresses] = useState<Map<string, BudgetProgress>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const isLoadingRef = useRef(false); // Guard against concurrent/redundant loads
  const lastUserIdRef = useRef<string>(''); // Track user changes to prevent redundant loads
  const budgetsRef = useRef<Budget[]>([]); // Ref to access current budgets without causing re-renders
  
  // Keep budgetsRef in sync with budgets state
  budgetsRef.current = budgets;

  // Dev mode: use API with mock user when NEXT_PUBLIC_DEV_MODE=true (backend auto-uses mock auth with memory store)
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';
  const devUserId = 'local-dev-user';
  const effectiveUserId = user?.uid || (isDevMode ? devUserId : '');
  
  // Loading is true if auth is loading OR we have a user but haven't loaded data yet
  const loading = authLoading || (!!effectiveUserId && !dataLoaded);
  
  // Debug logging
  console.log('[BudgetContext] State:', {
    authLoading,
    user: user?.uid || null,
    isDevMode,
    effectiveUserId,
    dataLoaded,
    loading,
    budgetsCount: budgets.length,
  });

  // Get budget progress function
  const getBudgetProgress = useCallback(async (budgetId: string, asOfDate?: Date): Promise<BudgetProgress | null> => {
    setError(null);

    try {
      const response = await financeClient.getBudgetProgress({
        budgetId,
        asOfDate: asOfDate ? timestampFromDate(asOfDate) : undefined
      });
      return response.progress || null;
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

  // Refresh all budget progresses function - takes budgets as parameter to avoid circular dependency
  const refreshAllBudgetProgresses = useCallback(async (financeGroupId?: string, budgetsToUse?: Budget[]) => {
    // Use provided budgets or fall back to current state via ref
    const currentBudgets = budgetsToUse ?? budgetsRef.current;
    
    const budgetsToRefresh = financeGroupId 
      ? currentBudgets.filter(budget => budget.isActive && budget.groupId === financeGroupId)
      : currentBudgets.filter(budget => budget.isActive && !budget.groupId);
    
    const budgetIds = budgetsToRefresh.map(budget => budget.id);
    
    // Refresh progress for all active budgets in parallel
    await Promise.all(
      budgetIds.map(budgetId => refreshBudgetProgress(budgetId))
    );
  }, [refreshBudgetProgress]);

  // Refresh budgets function - takes userId as param to avoid stale closure issues
  const refreshBudgets = useCallback(async (financeGroupId?: string, userId?: string) => {
    // Use provided userId or fall back to effectiveUserId for backward compatibility
    const targetUserId = userId || effectiveUserId;
    
    console.log('[BudgetContext] refreshBudgets called', { 
      financeGroupId, 
      userId, 
      targetUserId,
      isLoadingRef: isLoadingRef.current 
    });
    
    if (!targetUserId) {
      console.log('[BudgetContext] refreshBudgets skipped - no user ID');
      return;
    }

    // Guard against concurrent/redundant loads
    if (isLoadingRef.current) {
      console.log('[BudgetContext] refreshBudgets skipped - already loading');
      return;
    }
    isLoadingRef.current = true;

    setDataLoaded(false);
    setError(null);

    try {
      console.log('[BudgetContext] Fetching budgets for user:', targetUserId);
      const response = await financeClient.listBudgets({
        userId: targetUserId,
        groupId: financeGroupId || '',
        includeInactive: true,
        pageSize: 100
      });
      const newBudgets = response.budgets || [];
      console.log('[BudgetContext] Budgets loaded:', newBudgets.length);
      
      if (financeGroupId) {
        // For shared budgets, merge with existing personal budgets
        setBudgets(prev => {
          const personalBudgets = prev.filter(b => !b.groupId);
          return [...personalBudgets, ...newBudgets];
        });
      } else {
        // For personal budgets, replace all
        setBudgets(newBudgets);
      }
      
      // Refresh progress for all active budgets - pass budgets directly to avoid stale closure
      if (newBudgets.length > 0) {
        await refreshAllBudgetProgresses(financeGroupId, newBudgets);
      }
      console.log('[BudgetContext] Budget load complete');
    } catch (err) {
      // Don't log auth errors as they're expected during initial load
      const isAuthError = err instanceof Error && err.message.includes('unauthenticated');
      if (!isAuthError) {
        console.error('[BudgetContext] Failed to load budgets:', err);
        setError('Failed to load budgets');
      } else {
        console.log('[BudgetContext] Auth error (expected during initial load)');
      }
    } finally {
      console.log('[BudgetContext] Setting dataLoaded = true');
      setDataLoaded(true);
      isLoadingRef.current = false;
    }
  }, [effectiveUserId, refreshAllBudgetProgresses]);

  // Load budgets when effectiveUserId changes
  useEffect(() => {
    console.log('[BudgetContext] useEffect triggered', {
      effectiveUserId,
      lastUserIdRef: lastUserIdRef.current,
      dataLoaded,
      isLoadingRef: isLoadingRef.current,
    });
    
    // Skip if user hasn't changed (prevents redundant loads)
    if (lastUserIdRef.current === effectiveUserId && dataLoaded) {
      console.log('[BudgetContext] useEffect skipped - same user and data loaded');
      return;
    }
    lastUserIdRef.current = effectiveUserId;
    
    // Reset loading guard in case of React Strict Mode double-mount
    isLoadingRef.current = false;

    if (effectiveUserId) {
      console.log('[BudgetContext] useEffect - loading budgets for user:', effectiveUserId);
      // Pass userId explicitly to avoid stale closure
      refreshBudgets(undefined, effectiveUserId);
    } else {
      console.log('[BudgetContext] useEffect - no user, clearing budgets');
      setBudgets([]);
      setBudgetProgresses(new Map());
      setDataLoaded(true); // No user = no data to load
    }
    
    // Cleanup: reset loading ref on unmount (for React Strict Mode)
    return () => {
      console.log('[BudgetContext] useEffect cleanup');
      isLoadingRef.current = false;
    };
  }, [effectiveUserId, refreshBudgets, dataLoaded]);

  // Create budget function
  const createBudget = useCallback(async (params: CreateBudgetParams): Promise<Budget | null> => {
    if (!effectiveUserId) return null;

    setError(null);

    try {
      const response = await financeClient.createBudget({
        userId: effectiveUserId,
        groupId: params.financeGroupId || '',
        name: params.name,
        description: params.description || '',
        amount: params.amount,
        period: params.period,
        categoryIds: params.categoryIds,
        startDate: params.startDate ? timestampFromDate(params.startDate) : undefined,
        endDate: params.endDate ? timestampFromDate(params.endDate) : undefined
      });
      const newBudget = response.budget;

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
  }, [effectiveUserId, refreshBudgetProgress]);

  // Update budget function
  const updateBudget = useCallback(async (budgetId: string, params: UpdateBudgetParams): Promise<Budget | null> => {
    setError(null);

    try {
      const response = await financeClient.updateBudget({
        budgetId,
        name: params.name || '',
        description: params.description || '',
        amount: params.amount || 0,
        period: params.period || BudgetPeriod.UNSPECIFIED,
        categoryIds: params.categoryIds || [],
        isActive: params.isActive ?? true,
        endDate: params.endDate ? timestampFromDate(params.endDate) : undefined
      });
      const updatedBudget = response.budget;

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
  }, [refreshBudgetProgress]);

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

  // Computed values
  const activeBudgets = budgets.filter(budget => budget.isActive);
  const personalBudgets = budgets.filter(budget => !budget.groupId);
  const sharedBudgets = budgets.filter(budget => budget.groupId);

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