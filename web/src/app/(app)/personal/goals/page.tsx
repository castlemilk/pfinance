'use client';

import { useState } from 'react';
import GoalList from '../../../components/goals/GoalList';
import GoalCreator, { type GoalInitialValues } from '../../../components/goals/GoalCreator';
import ContributeModal from '../../../components/goals/ContributeModal';
import { useGoals, FinancialGoal } from '../../../context/GoalContext';
import PendingCalculatorBanner from '../../../components/calculator-handoff/PendingCalculatorBanner';
import type { CalculatorSnapshot } from '@/lib/calculator-handoff';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const GOAL_NAMES: Record<string, string> = {
  super: 'Super balance target',
  'mortgage-offset': 'Mortgage offset buffer',
  'hecs-help': 'Pay down HELP debt',
  'debt-payoff': 'Debt-free target',
  'insurance-needs': 'Build emergency buffer',
  'borrowing-power': 'Home deposit goal',
  'risk-profile': 'Start investing goal',
  'stamp-duty': 'Home purchase goal (incl. duty)',
  'retirement': 'Retirement nest egg',
};

const GOAL_AMOUNT_FIELDS: Record<string, string> = {
  super: 'projectedBalance',
  'mortgage-offset': 'offsetBalance',
  'hecs-help': 'helpBalance',
  'debt-payoff': 'totalDebt',
  'insurance-needs': 'liquidAssets',
  'borrowing-power': 'deposit',
  'risk-profile': '',
  'stamp-duty': 'price',
  'retirement': 'superBalance',
};

export default function GoalsPage() {
  const { refreshGoals } = useGoals();
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creatorInitial, setCreatorInitial] = useState<GoalInitialValues | undefined>();
  const [contributeGoal, setContributeGoal] = useState<FinancialGoal | null>(null);

  const applySnapshot = (snapshot: CalculatorSnapshot) => {
    const amount = Number(snapshot.fields[GOAL_AMOUNT_FIELDS[snapshot.tool] ?? '']);
    setCreatorInitial({
      name: GOAL_NAMES[snapshot.tool] ?? snapshot.title,
      targetAmount: Number.isFinite(amount) && amount > 0 ? String(Math.round(amount)) : '',
      description: snapshot.summary,
    });
    setCreatorOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Financial Goals</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Track your savings goals, debt payoff, and spending limits
          </p>
        </div>
        <Button onClick={() => setCreatorOpen(true)} size="sm" className="sm:size-default">
          <Plus className="w-4 h-4 mr-2" />
          New Goal
        </Button>
      </div>

      <PendingCalculatorBanner
        tools={['super', 'mortgage-offset', 'hecs-help', 'debt-payoff', 'insurance-needs', 'borrowing-power', 'risk-profile', 'stamp-duty', 'retirement']}
        applyLabel="Create a goal from this"
        onApply={applySnapshot}
      />

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
        initial={creatorInitial}
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
