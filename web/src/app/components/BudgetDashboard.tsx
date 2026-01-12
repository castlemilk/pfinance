'use client';

import { useState } from 'react';
import { useBudgets } from '../context/BudgetContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Target, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import BudgetCreator from './BudgetCreator';
import BudgetTracker from './BudgetTracker';
import { Budget } from '@/gen/pfinance/v1/types_pb';

interface BudgetDashboardProps {
  financeGroupId?: string;
  showGroupBudgets?: boolean;
}

export default function BudgetDashboard({ financeGroupId, showGroupBudgets = false }: BudgetDashboardProps) {
  const { 
    personalBudgets, 
    sharedBudgets, 
    activeBudgets,
    budgetProgresses,
    loading 
  } = useBudgets();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);

  // Filter budgets based on context
  const displayBudgets = showGroupBudgets 
    ? (financeGroupId ? sharedBudgets.filter(b => b.groupId === financeGroupId) : sharedBudgets)
    : personalBudgets;

  const activeDisplayBudgets = displayBudgets.filter(budget => budget.isActive);

  // Calculate summary stats
  const totalBudgetAmount = activeDisplayBudgets.reduce((sum, budget) => sum + budget.amount, 0);
  const totalSpentAmount = activeDisplayBudgets.reduce((sum, budget) => {
    const progress = budgetProgresses.get(budget.id);
    return sum + (progress?.spentAmount || 0);
  }, 0);
  const totalRemainingAmount = totalBudgetAmount - totalSpentAmount;
  const overallProgress = totalBudgetAmount > 0 ? (totalSpentAmount / totalBudgetAmount) * 100 : 0;

  const handleCreateSuccess = () => {
    setShowCreateDialog(false);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {showGroupBudgets ? 'Shared Budgets' : 'Personal Budgets'}
          </h2>
          <p className="text-muted-foreground">
            Track and manage your {showGroupBudgets ? 'shared' : 'personal'} spending budgets
          </p>
        </div>
        
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Budget</DialogTitle>
            </DialogHeader>
            <BudgetCreator 
              onSuccess={handleCreateSuccess}
              financeGroupId={showGroupBudgets ? financeGroupId : undefined}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      {activeDisplayBudgets.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Budget</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalBudgetAmount)}</div>
              <p className="text-xs text-muted-foreground">
                Across {activeDisplayBudgets.length} budget{activeDisplayBudgets.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spent</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalSpentAmount)}</div>
              <p className="text-xs text-muted-foreground">
                {overallProgress.toFixed(1)}% of total budget
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Remaining</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalRemainingAmount)}</div>
              <p className="text-xs text-muted-foreground">
                Available to spend
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallProgress.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                Overall budget usage
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budget Content */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active">Active Budgets</TabsTrigger>
          <TabsTrigger value="all">All Budgets</TabsTrigger>
        </TabsList>
        
        <TabsContent value="active" className="space-y-4">
          <BudgetTracker 
            showInactive={false}
            onEditBudget={setSelectedBudget}
            onDeleteBudget={(budget) => {
              // TODO: Implement delete confirmation dialog
              console.log('Delete budget:', budget.id);
            }}
          />
        </TabsContent>
        
        <TabsContent value="all" className="space-y-4">
          <BudgetTracker 
            showInactive={true}
            onEditBudget={setSelectedBudget}
            onDeleteBudget={(budget) => {
              // TODO: Implement delete confirmation dialog
              console.log('Delete budget:', budget.id);
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Budget Dialog - TODO: Implement BudgetEditor component */}
      {selectedBudget && (
        <Dialog open={!!selectedBudget} onOpenChange={() => setSelectedBudget(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Budget: {selectedBudget.name}</DialogTitle>
            </DialogHeader>
            <div className="p-4 text-center text-muted-foreground">
              Budget editing functionality coming soon...
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}