'use client';

import RecurringTransactionForm from '../../../components/recurring/RecurringTransactionForm';
import RecurringTransactionList from '../../../components/recurring/RecurringTransactionList';
import RecurringCalendar from '../../../components/recurring/RecurringCalendar';
import SubscriptionDetector from '../../../components/subscriptions/SubscriptionDetector';
import { useRecurring } from '../../../context/RecurringContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { List, CalendarDays } from 'lucide-react';

export default function RecurringPage() {
  const { refreshRecurring } = useRecurring();

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Recurring Transactions</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Manage your recurring expenses and income
        </p>
      </div>

      {/* Subscription Detection */}
      <SubscriptionDetector />

      {/* View Toggle + Content */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm">
            <List className="h-4 w-4" />
            List
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm">
            <CalendarDays className="h-4 w-4" />
            Calendar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-1">
              <RecurringTransactionForm onSuccess={refreshRecurring} />
            </div>
            <div className="lg:col-span-2">
              <RecurringTransactionList />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="lg:col-span-1">
              <RecurringTransactionForm onSuccess={refreshRecurring} />
            </div>
            <div className="lg:col-span-2">
              <RecurringCalendar />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
