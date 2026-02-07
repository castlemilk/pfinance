'use client';

import RecurringTransactionForm from '../../../components/recurring/RecurringTransactionForm';
import RecurringTransactionList from '../../../components/recurring/RecurringTransactionList';
import { useRecurring } from '../../../context/RecurringContext';

export default function RecurringPage() {
  const { refreshRecurring } = useRecurring();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Recurring Transactions</h1>
        <p className="text-muted-foreground">
          Manage your recurring expenses and income
        </p>
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <RecurringTransactionForm onSuccess={refreshRecurring} />
        </div>
        <div className="lg:col-span-2">
          <RecurringTransactionList />
        </div>
      </div>
    </div>
  );
}
