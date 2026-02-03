'use client';

import SmartExpenseEntry from '../../../components/SmartExpenseEntry';
import ExpenseList from '../../../components/ExpenseList';
import ExpenseVisualization from '../../../components/ExpenseVisualization';
import TransactionImport from '../../../components/TransactionImport';

export default function PersonalExpensesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Personal Expenses</h1>
        <p className="text-muted-foreground">
          Track and manage your personal expense transactions
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SmartExpenseEntry />
        <ExpenseVisualization />
      </div>

      <ExpenseList />

      <TransactionImport />
    </div>
  );
}