'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarClock, ArrowRight, Receipt } from 'lucide-react';
import { useRecurring } from '../../context/RecurringContext';
import RecurringBadge from './RecurringBadge';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

function getDaysUntil(date: Date): number {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getProximityColor(daysUntil: number): string {
  if (daysUntil < 2) return 'text-red-600 dark:text-red-400';
  if (daysUntil <= 7) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function getProximityBg(daysUntil: number): string {
  if (daysUntil < 2) return 'bg-red-500/10 border-red-500/20';
  if (daysUntil <= 7) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-green-500/10 border-green-500/20';
}

export default function UpcomingBillsCard() {
  const { upcomingBills, loading } = useRecurring();

  const bills = useMemo(() => {
    return upcomingBills.slice(0, 5);
  }, [upcomingBills]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Upcoming Bills
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-6">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Upcoming Bills
          </CardTitle>
          {bills.length > 0 && (
            <Link href="/personal/recurring">
              <Button variant="ghost" size="sm">
                View all <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {bills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Receipt className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No upcoming bills</p>
            <Link href="/personal/recurring">
              <Button variant="outline" size="sm" className="mt-3">
                Add Recurring Transaction
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {bills.map((bill) => {
              const daysUntil = getDaysUntil(bill.nextOccurrence);
              return (
                <div
                  key={bill.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${getProximityBg(daysUntil)}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{bill.description}</span>
                      <RecurringBadge frequency={bill.frequency} />
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">{bill.category}</Badge>
                      <span className={`text-xs font-medium ${getProximityColor(daysUntil)}`}>
                        {daysUntil <= 0 ? 'Due today' : daysUntil === 1 ? 'Due tomorrow' : `Due ${formatDate(bill.nextOccurrence)}`}
                      </span>
                    </div>
                  </div>
                  <div className="text-right pl-3">
                    <span className={`font-semibold text-sm ${bill.isExpense ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {bill.isExpense ? '-' : '+'}{formatCurrency(bill.amount)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
