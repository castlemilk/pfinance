'use client';

import { useMemo, useState } from 'react';
import { useGoals, FinancialGoal, GoalType, GoalStatus } from '../../context/GoalContext';
import GoalCard from './GoalCard';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Target, Plus, Filter } from 'lucide-react';

interface GoalListProps {
  showFilters?: boolean;
  limit?: number;
  onCreateGoal?: () => void;
  onEditGoal?: (goal: FinancialGoal) => void;
  onContributeToGoal?: (goal: FinancialGoal) => void;
  compact?: boolean;
}

export default function GoalList({
  showFilters = true,
  limit,
  onCreateGoal,
  onEditGoal,
  onContributeToGoal,
  compact = false,
}: GoalListProps) {
  const {
    goals,
    goalProgresses,
    loading,
    deleteGoal,
    updateGoal,
  } = useGoals();

  const [statusFilter, setStatusFilter] = useState<GoalStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<GoalType | 'all'>('all');
  const [sortBy, setSortBy] = useState<'targetDate' | 'progress' | 'created'>('targetDate');

  const filteredAndSortedGoals = useMemo(() => {
    let filtered = goals;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(g => g.status === statusFilter);
    }

    // Apply type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(g => g.goalType === typeFilter);
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'targetDate':
          return a.targetDate.getTime() - b.targetDate.getTime();
        case 'progress': {
          const progressA = goalProgresses.get(a.id)?.percentageComplete ?? 0;
          const progressB = goalProgresses.get(b.id)?.percentageComplete ?? 0;
          return progressB - progressA;
        }
        case 'created':
          return b.createdAt.getTime() - a.createdAt.getTime();
        default:
          return 0;
      }
    });

    // Apply limit
    if (limit) {
      filtered = filtered.slice(0, limit);
    }

    return filtered;
  }, [goals, statusFilter, typeFilter, sortBy, goalProgresses, limit]);

  const handleDelete = async (goal: FinancialGoal) => {
    if (window.confirm(`Are you sure you want to delete "${goal.name}"?`)) {
      await deleteGoal(goal.id);
    }
  };

  const handlePause = async (goal: FinancialGoal) => {
    await updateGoal(goal.id, { status: 'paused' });
  };

  const handleResume = async (goal: FinancialGoal) => {
    await updateGoal(goal.id, { status: 'active' });
  };

  if (loading && goals.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && goals.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters:</span>
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as GoalStatus | 'all')}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as GoalType | 'all')}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="savings">Savings</SelectItem>
              <SelectItem value="debt_payoff">Debt Payoff</SelectItem>
              <SelectItem value="spending_limit">Spending Limit</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="targetDate">Target Date</SelectItem>
              <SelectItem value="progress">Progress</SelectItem>
              <SelectItem value="created">Recently Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Goals Grid */}
      {filteredAndSortedGoals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Target className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Goals Found</h3>
            <p className="text-muted-foreground mb-4">
              {statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No goals match your current filters.'
                : "You haven't set any financial goals yet. Create one to start tracking your progress!"}
            </p>
            {onCreateGoal && statusFilter === 'all' && typeFilter === 'all' && (
              <Button onClick={onCreateGoal}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Goal
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className={compact ? 'space-y-2' : 'grid gap-4 md:grid-cols-2 lg:grid-cols-3'}>
          {filteredAndSortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              progress={goalProgresses.get(goal.id)}
              onContribute={onContributeToGoal}
              onEdit={onEditGoal}
              onDelete={handleDelete}
              onPause={handlePause}
              onResume={handleResume}
              compact={compact}
            />
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredAndSortedGoals.length > 0 && !compact && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold">{goals.filter(g => g.status === 'active').length}</div>
            <div className="text-sm text-muted-foreground">Active Goals</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{goals.filter(g => g.status === 'completed').length}</div>
            <div className="text-sm text-muted-foreground">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              ${goals.reduce((sum, g) => sum + g.currentAmount, 0).toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">Total Saved</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">
              ${goals.reduce((sum, g) => sum + g.targetAmount, 0).toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground">Total Target</div>
          </div>
        </div>
      )}
    </div>
  );
}
