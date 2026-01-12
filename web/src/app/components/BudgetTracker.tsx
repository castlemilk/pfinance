'use client';

import { useMemo, useState } from 'react';
import { useBudgets } from '../context/BudgetContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  MoreVertical, 
  Target,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react';
import { Budget, BudgetPeriod, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

interface BudgetTrackerProps {
  showInactive?: boolean;
  limit?: number;
  onEditBudget?: (budget: Budget) => void;
  onDeleteBudget?: (budget: Budget) => void;
}

export default function BudgetTracker({ 
  showInactive = false, 
  limit,
  onEditBudget,
  onDeleteBudget 
}: BudgetTrackerProps) {
  const { budgets, activeBudgets, budgetProgresses, refreshBudgetProgress, loading } = useBudgets();
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const displayBudgets = useMemo(() => {
    const budgetsToShow = showInactive ? budgets : activeBudgets;
    return limit ? budgetsToShow.slice(0, limit) : budgetsToShow;
  }, [budgets, activeBudgets, showInactive, limit]);

  const handleRefresh = async (budgetId: string) => {
    setRefreshingId(budgetId);
    await refreshBudgetProgress(budgetId);
    setRefreshingId(null);
  };

  const getBudgetPeriodLabel = (period: BudgetPeriod): string => {
    switch (period) {
      case BudgetPeriod.WEEKLY: return 'Weekly';
      case BudgetPeriod.FORTNIGHTLY: return 'Fortnightly';
      case BudgetPeriod.MONTHLY: return 'Monthly';
      case BudgetPeriod.QUARTERLY: return 'Quarterly';
      case BudgetPeriod.YEARLY: return 'Yearly';
      default: return 'Unknown';
    }
  };

  const getCategoryLabel = (category: ExpenseCategory): string => {
    switch (category) {
      case ExpenseCategory.FOOD: return 'Food';
      case ExpenseCategory.HOUSING: return 'Housing';
      case ExpenseCategory.TRANSPORTATION: return 'Transportation';
      case ExpenseCategory.ENTERTAINMENT: return 'Entertainment';
      case ExpenseCategory.HEALTHCARE: return 'Healthcare';
      case ExpenseCategory.UTILITIES: return 'Utilities';
      case ExpenseCategory.SHOPPING: return 'Shopping';
      case ExpenseCategory.EDUCATION: return 'Education';
      case ExpenseCategory.TRAVEL: return 'Travel';
      case ExpenseCategory.OTHER: return 'Other';
      default: return 'Unknown';
    }
  };

  const getProgressColor = (percentage: number): string => {
    if (percentage >= 100) return 'bg-red-500';
    if (percentage >= 90) return 'bg-orange-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getProgressIcon = (percentage: number) => {
    if (percentage >= 100) return <AlertCircle className="h-4 w-4 text-red-500" />;
    if (percentage >= 90) return <TrendingUp className="h-4 w-4 text-orange-500" />;
    if (percentage >= 75) return <TrendingUp className="h-4 w-4 text-yellow-500" />;
    return <TrendingDown className="h-4 w-4 text-green-500" />;
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDaysRemaining = (days: number): string => {
    if (days <= 0) return 'Expired';
    if (days === 1) return '1 day left';
    return `${days} days left`;
  };

  if (loading && displayBudgets.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </CardContent>
      </Card>
    );
  }

  if (displayBudgets.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <Target className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Budgets Found</h3>
          <p className="text-muted-foreground">
            {showInactive 
              ? "You haven't created any budgets yet."
              : "You don't have any active budgets."
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {displayBudgets.map((budget) => {
        const progress = budgetProgresses.get(budget.id);
        const percentage = progress ? progress.percentageUsed : 0;
        const isOverBudget = percentage > 100;
        const isNearLimit = percentage >= 75;

        return (
          <Card key={budget.id} className={`${!budget.isActive ? 'opacity-60' : ''}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CardTitle className="text-lg">{budget.name}</CardTitle>
                  {!budget.isActive && <Badge variant="secondary">Inactive</Badge>}
                  {isOverBudget && <Badge variant="destructive">Over Budget</Badge>}
                  {isNearLimit && !isOverBudget && <Badge variant="outline">Near Limit</Badge>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleRefresh(budget.id)}>
                      Refresh Progress
                    </DropdownMenuItem>
                    {onEditBudget && (
                      <DropdownMenuItem onClick={() => onEditBudget(budget)}>
                        Edit Budget
                      </DropdownMenuItem>
                    )}
                    {onDeleteBudget && (
                      <DropdownMenuItem 
                        onClick={() => onDeleteBudget(budget)}
                        className="text-red-600"
                      >
                        Delete Budget
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              {budget.description && (
                <p className="text-sm text-muted-foreground">{budget.description}</p>
              )}
            </CardHeader>

            <CardContent className="space-y-4">
              {/* Budget Progress */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center space-x-1">
                    {refreshingId === budget.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    ) : (
                      getProgressIcon(percentage)
                    )}
                    <span>Progress</span>
                  </span>
                  <span className="font-medium">
                    {percentage.toFixed(1)}%
                  </span>
                </div>
                
                <Progress 
                  value={Math.min(percentage, 100)} 
                  className="h-2"
                />
                
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {formatCurrency(progress?.spentAmount || 0)} spent
                  </span>
                  <span>
                    {formatCurrency(budget.amount)} total
                  </span>
                </div>
              </div>

              {/* Budget Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {formatCurrency(progress?.remainingAmount || budget.amount)}
                    </p>
                    <p className="text-muted-foreground">Remaining</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">
                      {progress?.daysRemaining ? formatDaysRemaining(progress.daysRemaining) : 'Unknown'}
                    </p>
                    <p className="text-muted-foreground">{getBudgetPeriodLabel(budget.period)}</p>
                  </div>
                </div>
              </div>

              {/* Categories */}
              {budget.categoryIds.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Categories</p>
                  <div className="flex flex-wrap gap-1">
                    {budget.categoryIds.map((categoryId: ExpenseCategory) => (
                      <Badge key={categoryId} variant="outline" className="text-xs">
                        {getCategoryLabel(categoryId)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Category Breakdown */}
              {progress?.categoryBreakdown && progress.categoryBreakdown.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Spending Breakdown</p>
                  <div className="space-y-1">
                    {progress.categoryBreakdown.map((breakdown: any) => (
                      <div key={breakdown.category} className="flex justify-between text-xs">
                        <span>{getCategoryLabel(breakdown.category)}</span>
                        <span className="font-medium">
                          {formatCurrency(breakdown.amount)} ({breakdown.percentage.toFixed(1)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}