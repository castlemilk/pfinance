'use client';

import { useState } from 'react';
import { useBudgets } from '../context/BudgetContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Target, DollarSign, Calendar, TrendingUp } from 'lucide-react';
import BudgetCreator from './BudgetCreator';
import BudgetEditor from './BudgetEditor';
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
    budgetProgresses,
    deleteBudget,
  } = useBudgets();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [budgetToDelete, setBudgetToDelete] = useState<Budget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleEditSuccess = () => {
    setSelectedBudget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!budgetToDelete) return;

    setIsDeleting(true);
    try {
      await deleteBudget(budgetToDelete.id);
    } finally {
      setIsDeleting(false);
      setBudgetToDelete(null);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">
            {showGroupBudgets ? 'Shared Budgets' : 'Personal Budgets'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Track and manage your {showGroupBudgets ? 'shared' : 'personal'} spending budgets
          </p>
        </div>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="sm:size-default">
              <Plus className="h-4 w-4 mr-2" />
              Create Budget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Budget</DialogTitle>
              <DialogDescription>
                Set up a new spending budget to track your expenses.
              </DialogDescription>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Total Budget</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalBudgetAmount)}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {activeDisplayBudgets.length} budget{activeDisplayBudgets.length !== 1 ? 's' : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Total Spent</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalSpentAmount)}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                {overallProgress.toFixed(1)}% used
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Remaining</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{formatCurrency(totalRemainingAmount)}</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Available
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 sm:p-6 sm:pb-2">
              <CardTitle className="text-xs sm:text-sm font-medium">Progress</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-6 sm:pt-0">
              <div className="text-lg sm:text-2xl font-bold">{overallProgress.toFixed(1)}%</div>
              <p className="text-[10px] sm:text-xs text-muted-foreground">
                Overall usage
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budget Content */}
      <Tabs defaultValue="active" className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="text-xs sm:text-sm">Active Budgets</TabsTrigger>
          <TabsTrigger value="all" className="text-xs sm:text-sm">All Budgets</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          <BudgetTracker
            showInactive={false}
            onEditBudget={setSelectedBudget}
            onDeleteBudget={setBudgetToDelete}
          />
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          <BudgetTracker
            showInactive={true}
            onEditBudget={setSelectedBudget}
            onDeleteBudget={setBudgetToDelete}
          />
        </TabsContent>
      </Tabs>

      {/* Edit Budget Dialog */}
      <Dialog open={!!selectedBudget} onOpenChange={(open) => { if (!open) setSelectedBudget(null); }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl sm:max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Budget</DialogTitle>
            <DialogDescription>
              Update the details for &ldquo;{selectedBudget?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          {selectedBudget && (
            <BudgetEditor
              budget={selectedBudget}
              onSuccess={handleEditSuccess}
              onCancel={() => setSelectedBudget(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!budgetToDelete} onOpenChange={(open) => { if (!open) setBudgetToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Budget</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{budgetToDelete?.name}&rdquo;? This action
              cannot be undone. All tracking data for this budget will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete Budget'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
