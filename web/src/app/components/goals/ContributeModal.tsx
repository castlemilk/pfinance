'use client';

import { useState } from 'react';
import { useGoals, FinancialGoal } from '../../context/GoalContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Plus, Sparkles, TrendingUp, Trophy } from 'lucide-react';

interface ContributeModalProps {
  goal: FinancialGoal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onContributed?: () => void;
}

const quickAmounts = [25, 50, 100, 250, 500, 1000];

export default function ContributeModal({
  goal,
  open,
  onOpenChange,
  onContributed,
}: ContributeModalProps) {
  const { contributeToGoal, goalProgresses } = useGoals();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!goal) return null;

  const progress = goalProgresses.get(goal.id);
  const currentPercentage = progress?.percentageComplete ??
    (goal.targetAmount > 0 ? (goal.currentAmount / goal.targetAmount) * 100 : 0);

  const contributionAmount = parseFloat(amount) || 0;
  const newAmount = goal.currentAmount + contributionAmount;
  const newPercentage = goal.targetAmount > 0 ? (newAmount / goal.targetAmount) * 100 : 0;
  const remainingAfter = Math.max(0, goal.targetAmount - newAmount);

  // Find milestone that will be achieved
  const nextMilestone = goal.milestones
    .filter(m => !m.isAchieved && currentPercentage < m.targetPercentage)
    .sort((a, b) => a.targetPercentage - b.targetPercentage)[0];

  const willAchieveMilestone = nextMilestone && newPercentage >= nextMilestone.targetPercentage;
  const willComplete = newAmount >= goal.targetAmount;

  const handleClose = () => {
    setAmount('');
    setNote('');
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (contributionAmount <= 0) return;

    setIsSubmitting(true);

    try {
      const success = await contributeToGoal(goal.id, contributionAmount, note || undefined);

      if (success) {
        handleClose();
        onContributed?.();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{goal.icon || '🎯'}</span>
            Contribute to {goal.name}
          </DialogTitle>
          <DialogDescription>
            Add to your savings towards this goal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Progress */}
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Current Progress</span>
                <span className="font-medium">{currentPercentage.toFixed(1)}%</span>
              </div>
              <Progress value={Math.min(currentPercentage, 100)} className="h-2" />
              <div className="flex justify-between text-sm mt-2">
                <span>{formatCurrency(goal.currentAmount)}</span>
                <span className="text-muted-foreground">{formatCurrency(goal.targetAmount)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Amount Input */}
          <div className="space-y-2">
            <Label htmlFor="amount">Contribution Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="amount"
                type="number"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-7 text-lg"
                min="0"
                step="0.01"
              />
            </div>

            {/* Quick Amount Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              {quickAmounts.map((quickAmount) => (
                <Button
                  key={quickAmount}
                  variant={parseFloat(amount) === quickAmount ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setAmount(quickAmount.toString())}
                >
                  ${quickAmount}
                </Button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Note (optional)</Label>
            <Textarea
              id="note"
              placeholder="What's this contribution for?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {/* Preview */}
          {contributionAmount > 0 && (
            <Card className={`border-2 ${willComplete ? 'border-green-500 bg-green-500/5' : willAchieveMilestone ? 'border-yellow-500 bg-yellow-500/5' : 'border-primary/50'}`}>
              <CardContent className="p-4 space-y-3">
                {willComplete && (
                  <div className="flex items-center gap-2 text-green-600">
                    <Trophy className="h-5 w-5" />
                    <span className="font-semibold">You'll reach your goal!</span>
                  </div>
                )}

                {willAchieveMilestone && !willComplete && (
                  <div className="flex items-center gap-2 text-yellow-600">
                    <Sparkles className="h-5 w-5" />
                    <span className="font-semibold">New milestone: {nextMilestone.name}</span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">After contribution:</span>
                </div>

                <div className="space-y-1">
                  <Progress value={Math.min(newPercentage, 100)} className="h-2" />
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{formatCurrency(newAmount)}</span>
                    <span className="text-primary font-medium">{newPercentage.toFixed(1)}%</span>
                  </div>
                </div>

                {!willComplete && (
                  <div className="text-sm text-muted-foreground">
                    {formatCurrency(remainingAfter)} remaining to reach your goal
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={contributionAmount <= 0 || isSubmitting}
          >
            {isSubmitting ? (
              <span className="animate-spin mr-2">⏳</span>
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add {contributionAmount > 0 ? formatCurrency(contributionAmount) : 'Contribution'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
