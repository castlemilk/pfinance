'use client';

import { useState } from 'react';
import GoalList from '../../../components/goals/GoalList';
import GoalCreator from '../../../components/goals/GoalCreator';
import ContributeModal from '../../../components/goals/ContributeModal';
import { useGoals, FinancialGoal } from '../../../context/GoalContext';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export default function GoalsPage() {
  const { refreshGoals } = useGoals();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<FinancialGoal | null>(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Goals</h1>
          <p className="text-muted-foreground">
            Track your savings goals, debt payoff, and spending limits
          </p>
        </div>
        <Button onClick={() => setCreatorOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Goal
        </Button>
      </div>

      {/* Goal List */}
      <GoalList
        showFilters
        onCreateGoal={() => setCreatorOpen(true)}
        onContributeToGoal={(goal) => setContributeGoal(goal)}
      />

      {/* Create Goal Dialog */}
      <GoalCreator
        open={creatorOpen}
        onOpenChange={setCreatorOpen}
        onGoalCreated={refreshGoals}
      />

      {/* Contribute Modal */}
      <ContributeModal
        goal={contributeGoal}
        open={!!contributeGoal}
        onOpenChange={(open) => { if (!open) setContributeGoal(null); }}
        onContributed={refreshGoals}
      />
    </div>
  );
}
