'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useCallback } from 'react';
import SmartExpenseEntry from '../../../components/SmartExpenseEntry';
import ExpenseList from '../../../components/ExpenseList';
import ExpenseVisualization from '../../../components/ExpenseVisualization';
import TransactionImport from '../../../components/TransactionImport';

export default function PersonalExpensesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const filterDate = searchParams.get('date');

  const handleClearFilter = useCallback(() => {
    router.replace('/personal/expenses');
  }, [router]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Receipts & Statements</h1>
        <p className="text-muted-foreground">
          Upload receipts, import statements, and add expenses
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SmartExpenseEntry />
        <ExpenseVisualization />
      </div>

      <ExpenseList filterDate={filterDate} onClearFilter={filterDate ? handleClearFilter : undefined} />

      <TransactionImport />
    </div>
  );
}