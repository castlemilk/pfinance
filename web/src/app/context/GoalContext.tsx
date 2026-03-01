'use client';

/**
 * GoalContext
 *
 * Provides state management for financial goals including:
 * - CRUD operations for goals
 * - Goal progress tracking
 * - Goal contributions
 *
 * Uses backend API when authenticated, falls back to localStorage for demo mode.
 */

import { createContext, useContext, useState, ReactNode, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from './AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Timestamp, timestampDate, timestampFromDate } from '@bufbuild/protobuf/wkt';
import {
  GoalType as ProtoGoalType,
  GoalStatus as ProtoGoalStatus,
  FinancialGoal as ProtoFinancialGoal,
  GoalProgress as ProtoGoalProgress,
  GoalContribution as ProtoGoalContribution,
  GoalMilestone as ProtoGoalMilestone,
  ExpenseCategory as ProtoExpenseCategory,
} from '@/gen/pfinance/v1/types_pb';

// ============================================================================
// Local Types
// ============================================================================

export type GoalType = 'savings' | 'debt_payoff' | 'spending_limit';
export type GoalStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface GoalMilestone {
  id: string;
  name: string;
  targetPercentage: number;
  isAchieved: boolean;
  achievedAt?: Date;
}

export interface FinancialGoal {
  id: string;
  userId: string;
  groupId?: string;
  name: string;
  description?: string;
  goalType: GoalType;
  targetAmount: number;
  currentAmount: number;
  startDate: Date;
  targetDate: Date;
  status: GoalStatus;
  categoryIds?: string[];
  icon?: string;
  color?: string;
  milestones: GoalMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalProgress {
  goalId: string;
  currentAmount: number;
  targetAmount: number;
  percentageComplete: number;
  daysRemaining: number;
  requiredDailyRate: number;
  actualDailyRate: number;
  onTrack: boolean;
  achievedMilestones: GoalMilestone[];
  nextMilestone?: GoalMilestone;
}

export interface GoalContribution {
  id: string;
  goalId: string;
  userId: string;
  amount: number;
  note?: string;
  contributedAt: Date;
}

export interface CreateGoalParams {
  name: string;
  description?: string;
  goalType: GoalType;
  targetAmount: number;
  initialAmount?: number;
  startDate: Date;
  targetDate: Date;
  categoryIds?: string[];
  icon?: string;
  color?: string;
  groupId?: string;
}

export interface UpdateGoalParams {
  name?: string;
  description?: string;
  targetAmount?: number;
  targetDate?: Date;
  status?: GoalStatus;
  categoryIds?: string[];
  icon?: string;
  color?: string;
}

// ============================================================================
// Type Mapping Utilities
// ============================================================================

const goalTypeToProto: Record<GoalType, ProtoGoalType> = {
  'savings': ProtoGoalType.SAVINGS,
  'debt_payoff': ProtoGoalType.DEBT_PAYOFF,
  'spending_limit': ProtoGoalType.SPENDING_LIMIT,
};

const protoToGoalType: Record<ProtoGoalType, GoalType> = {
  [ProtoGoalType.UNSPECIFIED]: 'savings',
  [ProtoGoalType.SAVINGS]: 'savings',
  [ProtoGoalType.DEBT_PAYOFF]: 'debt_payoff',
  [ProtoGoalType.SPENDING_LIMIT]: 'spending_limit',
};

const goalStatusToProto: Record<GoalStatus, ProtoGoalStatus> = {
  'active': ProtoGoalStatus.ACTIVE,
  'paused': ProtoGoalStatus.PAUSED,
  'completed': ProtoGoalStatus.COMPLETED,
  'cancelled': ProtoGoalStatus.CANCELLED,
};

const protoToGoalStatus: Record<ProtoGoalStatus, GoalStatus> = {
  [ProtoGoalStatus.UNSPECIFIED]: 'active',
  [ProtoGoalStatus.ACTIVE]: 'active',
  [ProtoGoalStatus.PAUSED]: 'paused',
  [ProtoGoalStatus.COMPLETED]: 'completed',
  [ProtoGoalStatus.CANCELLED]: 'cancelled',
};

function mapProtoMilestoneToLocal(proto: ProtoGoalMilestone): GoalMilestone {
  return {
    id: proto.id,
    name: proto.name,
    targetPercentage: proto.targetPercentage,
    isAchieved: proto.isAchieved,
    achievedAt: proto.achievedAt ? timestampDate(proto.achievedAt) : undefined,
  };
}

function mapProtoGoalToLocal(proto: ProtoFinancialGoal): FinancialGoal {
  return {
    id: proto.id,
    userId: proto.userId,
    groupId: proto.groupId || undefined,
    name: proto.name,
    description: proto.description || undefined,
    goalType: protoToGoalType[proto.goalType],
    targetAmount: proto.targetAmount,
    currentAmount: proto.currentAmount,
    startDate: proto.startDate ? timestampDate(proto.startDate) : new Date(),
    targetDate: proto.targetDate ? timestampDate(proto.targetDate) : new Date(),
    status: protoToGoalStatus[proto.status],
    categoryIds: proto.categoryIds?.map(c => String(c)),
    icon: proto.icon || undefined,
    color: proto.color || undefined,
    milestones: proto.milestones?.map(mapProtoMilestoneToLocal) || [],
    createdAt: proto.createdAt ? timestampDate(proto.createdAt) : new Date(),
    updatedAt: proto.updatedAt ? timestampDate(proto.updatedAt) : new Date(),
  };
}

function mapProtoProgressToLocal(proto: ProtoGoalProgress): GoalProgress {
  return {
    goalId: proto.goalId,
    currentAmount: proto.currentAmount,
    targetAmount: proto.targetAmount,
    percentageComplete: proto.percentageComplete,
    daysRemaining: proto.daysRemaining,
    requiredDailyRate: proto.requiredDailyRate,
    actualDailyRate: proto.actualDailyRate,
    onTrack: proto.onTrack,
    achievedMilestones: proto.achievedMilestones?.map(mapProtoMilestoneToLocal) || [],
    nextMilestone: proto.nextMilestone ? mapProtoMilestoneToLocal(proto.nextMilestone) : undefined,
  };
}

function mapProtoContributionToLocal(proto: ProtoGoalContribution): GoalContribution {
  return {
    id: proto.id,
    goalId: proto.goalId,
    userId: proto.userId,
    amount: proto.amount,
    note: proto.note || undefined,
    contributedAt: proto.contributedAt ? timestampDate(proto.contributedAt) : new Date(),
  };
}

// ============================================================================
// Context Definition
// ============================================================================

interface GoalContextType {
  goals: FinancialGoal[];
  activeGoals: FinancialGoal[];
  goalProgresses: Map<string, GoalProgress>;
  loading: boolean;
  error: string | null;

  createGoal: (params: CreateGoalParams) => Promise<FinancialGoal | null>;
  updateGoal: (goalId: string, params: UpdateGoalParams) => Promise<FinancialGoal | null>;
  deleteGoal: (goalId: string) => Promise<boolean>;
  contributeToGoal: (goalId: string, amount: number, note?: string) => Promise<boolean>;
  refreshGoalProgress: (goalId: string) => Promise<void>;
  refreshGoals: () => Promise<void>;
}

const GoalContext = createContext<GoalContextType | undefined>(undefined);

// ============================================================================
// Demo Mode Helpers
// ============================================================================

const DEMO_GOALS_KEY = 'pfinance-demo-goals';
const DEMO_CONTRIBUTIONS_KEY = 'pfinance-demo-goal-contributions';

function loadDemoGoals(): FinancialGoal[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DEMO_GOALS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((g: FinancialGoal & { startDate: string; targetDate: string; createdAt: string; updatedAt: string; milestones: (GoalMilestone & { achievedAt?: string })[] }) => ({
        ...g,
        startDate: new Date(g.startDate),
        targetDate: new Date(g.targetDate),
        createdAt: new Date(g.createdAt),
        updatedAt: new Date(g.updatedAt),
        milestones: g.milestones.map((m: GoalMilestone & { achievedAt?: string }) => ({
          ...m,
          achievedAt: m.achievedAt ? new Date(m.achievedAt) : undefined,
        })),
      }));
    }
  } catch (e) {
    console.error('Failed to load demo goals:', e);
  }
  return [];
}

function saveDemoGoals(goals: FinancialGoal[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_GOALS_KEY, JSON.stringify(goals));
  } catch (e) {
    console.error('Failed to save demo goals:', e);
  }
}

function loadDemoContributions(): GoalContribution[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DEMO_CONTRIBUTIONS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.map((c: GoalContribution & { contributedAt: string }) => ({
        ...c,
        contributedAt: new Date(c.contributedAt),
      }));
    }
  } catch (e) {
    console.error('Failed to load demo contributions:', e);
  }
  return [];
}

function saveDemoContributions(contributions: GoalContribution[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEMO_CONTRIBUTIONS_KEY, JSON.stringify(contributions));
  } catch (e) {
    console.error('Failed to save demo contributions:', e);
  }
}

function generateId(): string {
  return `goal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createDefaultMilestones(): GoalMilestone[] {
  return [
    { id: generateId(), name: 'Quarter way there!', targetPercentage: 25, isAchieved: false },
    { id: generateId(), name: 'Halfway point!', targetPercentage: 50, isAchieved: false },
    { id: generateId(), name: 'Three-quarters done!', targetPercentage: 75, isAchieved: false },
    { id: generateId(), name: 'Goal achieved!', targetPercentage: 100, isAchieved: false },
  ];
}

function calculateProgress(goal: FinancialGoal): GoalProgress {
  const percentageComplete = goal.targetAmount > 0
    ? (goal.currentAmount / goal.targetAmount) * 100
    : 0;

  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((goal.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

  const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
  const requiredDailyRate = daysRemaining > 0 ? remainingAmount / daysRemaining : 0;

  const daysSinceStart = Math.max(1, Math.ceil((now.getTime() - goal.startDate.getTime()) / (1000 * 60 * 60 * 24)));
  const actualDailyRate = goal.currentAmount / daysSinceStart;

  const onTrack = actualDailyRate >= requiredDailyRate || percentageComplete >= 100;

  const achievedMilestones = goal.milestones.filter(m => m.isAchieved);
  const nextMilestone = goal.milestones
    .filter(m => !m.isAchieved)
    .sort((a, b) => a.targetPercentage - b.targetPercentage)[0];

  return {
    goalId: goal.id,
    currentAmount: goal.currentAmount,
    targetAmount: goal.targetAmount,
    percentageComplete,
    daysRemaining,
    requiredDailyRate,
    actualDailyRate,
    onTrack,
    achievedMilestones,
    nextMilestone,
  };
}

// ============================================================================
// Provider Component
// ============================================================================

export function GoalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [goals, setGoals] = useState<FinancialGoal[]>([]);
  const [goalProgresses, setGoalProgresses] = useState<Map<string, GoalProgress>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const isAuthenticated = !!user;
  const userId = user?.uid || 'demo-user';

  // Computed: active goals (memoized)
  const activeGoals = useMemo(() => goals.filter(g => g.status === 'active'), [goals]);

  // Load goals on mount/auth change
  const loadGoals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isAuthenticated) {
        // Load from API
        const response = await financeClient.listGoals({
          userId,
          status: ProtoGoalStatus.UNSPECIFIED, // All statuses
          goalType: ProtoGoalType.UNSPECIFIED, // All types
          pageSize: 100,
        });

        const loadedGoals = response.goals.map(mapProtoGoalToLocal);
        setGoals(loadedGoals);

        // Calculate progress for all goals in parallel
        const progressEntries = await Promise.all(
          loadedGoals.map(async (goal) => {
            try {
              const progressResponse = await financeClient.getGoalProgress({
                goalId: goal.id,
              });
              return [goal.id, progressResponse.progress
                ? mapProtoProgressToLocal(progressResponse.progress)
                : calculateProgress(goal)] as const;
            } catch {
              // Fall back to local calculation
              return [goal.id, calculateProgress(goal)] as const;
            }
          })
        );
        setGoalProgresses(new Map(progressEntries));
      } else {
        // Load from localStorage for demo mode
        const loadedGoals = loadDemoGoals();
        setGoals(loadedGoals);

        // Calculate progress locally
        const progressMap = new Map<string, GoalProgress>();
        for (const goal of loadedGoals) {
          progressMap.set(goal.id, calculateProgress(goal));
        }
        setGoalProgresses(progressMap);
      }
    } catch (e) {
      console.error('Failed to load goals:', e);
      setError('Failed to load goals');
    } finally {
      setLoading(false);
      hasLoadedRef.current = true;
    }
  }, [isAuthenticated, userId]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  // Create goal
  const createGoal = useCallback(async (params: CreateGoalParams): Promise<FinancialGoal | null> => {
    setError(null);

    try {
      if (isAuthenticated) {
        const response = await financeClient.createGoal({
          userId,
          groupId: params.groupId,
          name: params.name,
          description: params.description,
          goalType: goalTypeToProto[params.goalType],
          targetAmount: params.targetAmount,
          initialAmount: params.initialAmount || 0,
          startDate: timestampFromDate(params.startDate),
          targetDate: timestampFromDate(params.targetDate),
          categoryIds: params.categoryIds?.map(c => parseInt(c) as ProtoExpenseCategory),
          icon: params.icon,
          color: params.color,
        });

        if (response.goal) {
          const newGoal = mapProtoGoalToLocal(response.goal);
          setGoals(prev => [...prev, newGoal]);
          setGoalProgresses(prev => new Map(prev).set(newGoal.id, calculateProgress(newGoal)));
          return newGoal;
        }
      } else {
        // Demo mode
        const newGoal: FinancialGoal = {
          id: generateId(),
          userId,
          groupId: params.groupId,
          name: params.name,
          description: params.description,
          goalType: params.goalType,
          targetAmount: params.targetAmount,
          currentAmount: params.initialAmount || 0,
          startDate: params.startDate,
          targetDate: params.targetDate,
          status: 'active',
          categoryIds: params.categoryIds,
          icon: params.icon,
          color: params.color,
          milestones: createDefaultMilestones(),
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        setGoals(prev => {
          const updated = [...prev, newGoal];
          saveDemoGoals(updated);
          return updated;
        });
        setGoalProgresses(prev => new Map(prev).set(newGoal.id, calculateProgress(newGoal)));
        return newGoal;
      }
    } catch (e) {
      console.error('Failed to create goal:', e);
      setError('Failed to create goal');
    }

    return null;
  }, [isAuthenticated, userId]);

  // Update goal
  const updateGoal = useCallback(async (goalId: string, params: UpdateGoalParams): Promise<FinancialGoal | null> => {
    setError(null);

    try {
      if (isAuthenticated) {
        const response = await financeClient.updateGoal({
          goalId,
          name: params.name,
          description: params.description,
          targetAmount: params.targetAmount,
          targetDate: params.targetDate ? timestampFromDate(params.targetDate) : undefined,
          status: params.status ? goalStatusToProto[params.status] : undefined,
          categoryIds: params.categoryIds?.map(c => parseInt(c) as ProtoExpenseCategory),
          icon: params.icon,
          color: params.color,
        });

        if (response.goal) {
          const updatedGoal = mapProtoGoalToLocal(response.goal);
          setGoals(prev => prev.map(g => g.id === goalId ? updatedGoal : g));
          setGoalProgresses(prev => new Map(prev).set(goalId, calculateProgress(updatedGoal)));
          return updatedGoal;
        }
      } else {
        // Demo mode
        setGoals(prev => {
          const updated = prev.map(g => {
            if (g.id !== goalId) return g;
            return {
              ...g,
              ...(params.name && { name: params.name }),
              ...(params.description !== undefined && { description: params.description }),
              ...(params.targetAmount && { targetAmount: params.targetAmount }),
              ...(params.targetDate && { targetDate: params.targetDate }),
              ...(params.status && { status: params.status }),
              ...(params.categoryIds && { categoryIds: params.categoryIds }),
              ...(params.icon && { icon: params.icon }),
              ...(params.color && { color: params.color }),
              updatedAt: new Date(),
            };
          });
          saveDemoGoals(updated);

          const updatedGoal = updated.find(g => g.id === goalId);
          if (updatedGoal) {
            setGoalProgresses(prev => new Map(prev).set(goalId, calculateProgress(updatedGoal)));
          }

          return updated;
        });

        return goals.find(g => g.id === goalId) || null;
      }
    } catch (e) {
      console.error('Failed to update goal:', e);
      setError('Failed to update goal');
    }

    return null;
  }, [isAuthenticated, goals]);

  // Delete goal
  const deleteGoal = useCallback(async (goalId: string): Promise<boolean> => {
    setError(null);

    try {
      if (isAuthenticated) {
        await financeClient.deleteGoal({ goalId });
      }

      setGoals(prev => {
        const updated = prev.filter(g => g.id !== goalId);
        if (!isAuthenticated) {
          saveDemoGoals(updated);
        }
        return updated;
      });

      setGoalProgresses(prev => {
        const updated = new Map(prev);
        updated.delete(goalId);
        return updated;
      });

      return true;
    } catch (e) {
      console.error('Failed to delete goal:', e);
      setError('Failed to delete goal');
      return false;
    }
  }, [isAuthenticated]);

  // Contribute to goal
  const contributeToGoal = useCallback(async (goalId: string, amount: number, note?: string): Promise<boolean> => {
    setError(null);

    try {
      if (isAuthenticated) {
        const response = await financeClient.contributeToGoal({
          goalId,
          userId,
          amount,
          note,
        });

        if (response.goal) {
          const updatedGoal = mapProtoGoalToLocal(response.goal);
          setGoals(prev => prev.map(g => g.id === goalId ? updatedGoal : g));
          setGoalProgresses(prev => new Map(prev).set(goalId, calculateProgress(updatedGoal)));
          return true;
        }
      } else {
        // Demo mode
        const contribution: GoalContribution = {
          id: generateId(),
          goalId,
          userId,
          amount,
          note,
          contributedAt: new Date(),
        };

        // Save contribution
        const contributions = loadDemoContributions();
        contributions.push(contribution);
        saveDemoContributions(contributions);

        // Update goal
        setGoals(prev => {
          const updated = prev.map(g => {
            if (g.id !== goalId) return g;

            const newAmount = g.currentAmount + amount;
            const percentageComplete = (newAmount / g.targetAmount) * 100;

            // Update milestones
            const updatedMilestones = g.milestones.map(m => {
              if (!m.isAchieved && percentageComplete >= m.targetPercentage) {
                return { ...m, isAchieved: true, achievedAt: new Date() };
              }
              return m;
            });

            // Check if completed
            const newStatus = newAmount >= g.targetAmount ? 'completed' : g.status;

            return {
              ...g,
              currentAmount: newAmount,
              status: newStatus as GoalStatus,
              milestones: updatedMilestones,
              updatedAt: new Date(),
            };
          });

          saveDemoGoals(updated);

          const updatedGoal = updated.find(g => g.id === goalId);
          if (updatedGoal) {
            setGoalProgresses(prevProgress => new Map(prevProgress).set(goalId, calculateProgress(updatedGoal)));
          }

          return updated;
        });

        return true;
      }
    } catch (e) {
      console.error('Failed to contribute to goal:', e);
      setError('Failed to contribute to goal');
      return false;
    }

    return false;
  }, [isAuthenticated, userId]);

  // Refresh goal progress
  const refreshGoalProgress = useCallback(async (goalId: string): Promise<void> => {
    try {
      const goal = goals.find(g => g.id === goalId);
      if (!goal) return;

      if (isAuthenticated) {
        const response = await financeClient.getGoalProgress({ goalId });
        if (response.progress) {
          setGoalProgresses(prev => new Map(prev).set(goalId, mapProtoProgressToLocal(response.progress!)));
        }
      } else {
        setGoalProgresses(prev => new Map(prev).set(goalId, calculateProgress(goal)));
      }
    } catch (e) {
      console.error('Failed to refresh goal progress:', e);
    }
  }, [isAuthenticated, goals]);

  // Refresh all goals
  const refreshGoals = useCallback(async (): Promise<void> => {
    await loadGoals();
  }, [loadGoals]);

  const value = useMemo<GoalContextType>(() => ({
    goals,
    activeGoals,
    goalProgresses,
    loading,
    error,
    createGoal,
    updateGoal,
    deleteGoal,
    contributeToGoal,
    refreshGoalProgress,
    refreshGoals,
  }), [goals, activeGoals, goalProgresses, loading, error,
       createGoal, updateGoal, deleteGoal, contributeToGoal,
       refreshGoalProgress, refreshGoals]);

  return (
    <GoalContext.Provider value={value}>
      {children}
    </GoalContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useGoals() {
  const context = useContext(GoalContext);
  if (context === undefined) {
    throw new Error('useGoals must be used within a GoalProvider');
  }
  return context;
}
