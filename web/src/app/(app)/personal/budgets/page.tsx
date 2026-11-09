'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BudgetDashboard from '../../../components/BudgetDashboard';
import PendingCalculatorBanner from '../../../components/calculator-handoff/PendingCalculatorBanner';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useBudgets } from '../../../context/BudgetContext';
import { clearCalculatorSnapshot, type CalculatorSnapshot } from '@/lib/calculator-handoff';
import { budgetsFromSnapshot } from '@/lib/calculator-budgets';

export default function BudgetsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { createBudget } = useBudgets();
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [bannerKey, setBannerKey] = useState(0);
  const [applying, setApplying] = useState(false);

  const applySnapshot = async (snapshot: CalculatorSnapshot) => {
    if (!user) {
      // The snapshot stays in localStorage, so the banner is waiting after sign-in.
      router.push(`/auth?returnUrl=${encodeURIComponent('/personal/budgets/')}`);
      return;
    }
    const drafts = budgetsFromSnapshot(snapshot);
    if (drafts.length === 0) {
      setStatus({ kind: 'error', message: 'Those calculator numbers have no amount to budget.' });
      return;
    }

    setApplying(true);
    setStatus(null);
    const created = [];
    for (const draft of drafts) {
      const budget = await createBudget(draft);
      if (budget) created.push(budget.name);
    }
    setApplying(false);

    if (created.length === drafts.length) {
      clearCalculatorSnapshot();
      setBannerKey((k) => k + 1);
      setStatus({ kind: 'ok', message: `Created ${created.join(' and ')} budget${created.length > 1 ? 's' : ''}.` });
    } else {
      setStatus({ kind: 'error', message: 'Some budgets could not be created. Try again.' });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Budgets</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Set spending limits by category and see how each period is tracking.
        </p>
      </div>

      <PendingCalculatorBanner
        key={bannerKey}
        tools={['budget', 'ccs']}
        applyLabel={applying ? 'Creating…' : user ? 'Create these budgets' : 'Sign in to create budgets'}
        onApply={applying ? undefined : applySnapshot}
      />

      {status && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={status.kind === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
        >
          {status.message}
        </p>
      )}

      <BudgetDashboard showGroupBudgets={false} />
    </div>
  );
}
