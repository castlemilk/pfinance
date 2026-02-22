'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Target,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  Calendar,
  DollarSign,
  PiggyBank,
  CreditCard,
  Wallet,
  Plus,
  Pause,
  Play,
  Trash2,
  Edit,
  Trophy,
  Clock,
  Star,
} from 'lucide-react';
import { FinancialGoal, GoalProgress, GoalType, GoalStatus } from '../../context/GoalContext';
import {
  MILESTONE_THRESHOLDS,
  getAchievedMilestones,
  MILESTONE_INFO,
  type MilestoneThreshold,
} from '../../utils/goalCelebrations';

interface GoalCardProps {
  goal: FinancialGoal;
  progress?: GoalProgress;
  onContribute?: (goal: FinancialGoal) => void;
  onEdit?: (goal: FinancialGoal) => void;
  onDelete?: (goal: FinancialGoal) => void;
  onPause?: (goal: FinancialGoal) => void;
  onResume?: (goal: FinancialGoal) => void;
  compact?: boolean;
}

export default function GoalCard({
  goal,
  progress,
  onContribute,
  onEdit,
  onDelete,
  onPause,
  onResume,
  compact = false,
}: GoalCardProps) {
  const percentageComplete = progress?.percentageComplete ??
    (goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0);

  const isCompleted = goal.status === 'completed' || percentageComplete >= 100;
  const isPaused = goal.status === 'paused';
  const isCancelled = goal.status === 'cancelled';
  const isOnTrack = progress?.onTrack ?? true;

  const goalTypeConfig: Record<GoalType, { icon: typeof PiggyBank; label: string; color: string }> = {
    savings: { icon: PiggyBank, label: 'Savings', color: 'text-green-500' },
    debt_payoff: { icon: CreditCard, label: 'Debt Payoff', color: 'text-blue-500' },
    spending_limit: { icon: Wallet, label: 'Spending Limit', color: 'text-orange-500' },
  };

  const config = goalTypeConfig[goal.goalType];
  const GoalIcon = config.icon;

  // Calculate achieved milestones from the percentage
  const achievedMilestoneThresholds = useMemo(
    () => getAchievedMilestones(percentageComplete),
    [percentageComplete]
  );

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  };

  const getStatusBadge = () => {
    if (isCompleted) {
      return <Badge className="bg-green-500/20 text-green-600 border-green-500/30">Completed</Badge>;
    }
    if (isPaused) {
      return <Badge variant="secondary">Paused</Badge>;
    }
    if (isCancelled) {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (!isOnTrack) {
      return <Badge variant="outline" className="text-orange-500 border-orange-500/30">Behind</Badge>;
    }
    return <Badge className="bg-primary/20 text-primary border-primary/30">Active</Badge>;
  };

  const getProgressColor = () => {
    if (isCompleted) return 'bg-green-500';
    if (percentageComplete >= 75) return 'bg-primary';
    if (percentageComplete >= 50) return 'bg-yellow-500';
    if (percentageComplete >= 25) return 'bg-orange-500';
    return 'bg-muted-foreground';
  };

  // Find next milestone
  const nextMilestone = useMemo(() => {
    return goal.milestones
      .filter(m => !m.isAchieved)
      .sort((a, b) => a.targetPercentage - b.targetPercentage)[0];
  }, [goal.milestones]);

  // Count achieved milestones
  const achievedCount = goal.milestones.filter(m => m.isAchieved).length;

  if (compact) {
    return (
      <Card className={`${isPaused || isCancelled ? 'opacity-60' : ''}`}>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <GoalIcon className={`h-4 w-4 ${config.color}`} />
              <span className="font-medium text-sm">{goal.name}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {/* Compact milestone stars */}
              <MilestoneStars achieved={achievedMilestoneThresholds} size="sm" />
              {getStatusBadge()}
            </div>
          </div>
          <div className="space-y-1">
            <Progress value={Math.min(percentageComplete, 100)} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(goal.currentAmount)}</span>
              <span>{formatCurrency(goal.targetAmount)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${isPaused || isCancelled ? 'opacity-60' : ''} ${isCompleted ? 'goal-card-completed' : ''} transition-all hover:shadow-md`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${goal.color ? '' : 'bg-muted'}`} style={goal.color ? { backgroundColor: `${goal.color}20` } : undefined}>
              {goal.icon ? (
                <span className="text-2xl">{goal.icon}</span>
              ) : (
                <GoalIcon className={`h-6 w-6 ${goal.color ? '' : config.color}`} style={goal.color ? { color: goal.color } : undefined} />
              )}
            </div>
            <div>
              <CardTitle className="text-lg">{goal.name}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{config.label}</Badge>
                {getStatusBadge()}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {goal.status === 'active' && onContribute && (
                <DropdownMenuItem onClick={() => onContribute(goal)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Contribution
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(goal)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Goal
                </DropdownMenuItem>
              )}
              {goal.status === 'active' && onPause && (
                <DropdownMenuItem onClick={() => onPause(goal)}>
                  <Pause className="h-4 w-4 mr-2" />
                  Pause Goal
                </DropdownMenuItem>
              )}
              {goal.status === 'paused' && onResume && (
                <DropdownMenuItem onClick={() => onResume(goal)}>
                  <Play className="h-4 w-4 mr-2" />
                  Resume Goal
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onDelete(goal)} className="text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Goal
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {goal.description && (
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        )}

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{percentageComplete.toFixed(1)}%</span>
          </div>
          <div className="relative">
            <Progress value={Math.min(percentageComplete, 100)} className="h-3" />
            {/* Milestone markers */}
            {goal.milestones.map((milestone) => (
              <div
                key={milestone.id}
                className={`absolute top-0 h-3 w-0.5 ${milestone.isAchieved ? 'bg-green-500' : 'bg-muted-foreground/30'}`}
                style={{ left: `${milestone.targetPercentage}%` }}
                title={milestone.name}
              />
            ))}
          </div>
          <div className="flex justify-between text-sm">
            <span className="font-medium">{formatCurrency(goal.currentAmount)}</span>
            <span className="text-muted-foreground">{formatCurrency(goal.targetAmount)}</span>
          </div>
        </div>

        {/* Milestone Badges */}
        {achievedMilestoneThresholds.length > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t">
            <MilestoneStars achieved={achievedMilestoneThresholds} size="md" />
            <span className="text-sm text-muted-foreground ml-1">
              {achievedMilestoneThresholds.length === 4
                ? 'All milestones unlocked!'
                : `${achievedMilestoneThresholds.length} of 4 milestones`}
            </span>
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-4 pt-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <div className="text-muted-foreground">Target Date</div>
              <div className="font-medium">{formatDate(goal.targetDate)}</div>
            </div>
          </div>

          {progress && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                <div className="text-muted-foreground">Days Left</div>
                <div className="font-medium">{progress.daysRemaining} days</div>
              </div>
            </div>
          )}
        </div>

        {/* Next milestone */}
        {nextMilestone && !isCompleted && (
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-muted-foreground">
              Next: <span className="font-medium">{nextMilestone.name}</span>
            </div>
            <Badge variant="outline" className="text-xs">
              {nextMilestone.targetPercentage}%
            </Badge>
          </div>
        )}

        {/* Progress indicator */}
        {progress && !isCompleted && (
          <div className="flex items-center gap-2 pt-2 border-t">
            {isOnTrack ? (
              <>
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-600">On track</span>
              </>
            ) : (
              <>
                <TrendingDown className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-orange-600">
                  Need {formatCurrency(progress.requiredDailyRate)}/day to catch up
                </span>
              </>
            )}
          </div>
        )}

        {/* Contribute button */}
        {goal.status === 'active' && onContribute && (
          <Button
            onClick={() => onContribute(goal)}
            className="w-full mt-2"
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contribution
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Milestone Stars Sub-component
// ============================================================================

interface MilestoneStarsProps {
  achieved: MilestoneThreshold[];
  size?: 'sm' | 'md';
}

function MilestoneStars({ achieved, size = 'md' }: MilestoneStarsProps) {
  const starSize = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <div className="flex items-center gap-0.5">
      {MILESTONE_THRESHOLDS.map((threshold) => {
        const isAchieved = achieved.includes(threshold);
        const info = MILESTONE_INFO[threshold];

        return (
          <div
            key={threshold}
            className={`milestone-star ${isAchieved ? 'milestone-star-achieved' : ''}`}
            title={`${info.label} (${threshold}%) ${isAchieved ? '- Achieved!' : ''}`}
          >
            <Star
              className={`${starSize} transition-all duration-300 ${
                isAchieved
                  ? 'text-primary fill-primary drop-shadow-[0_0_3px_var(--glow-color)]'
                  : 'text-muted-foreground/30'
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
