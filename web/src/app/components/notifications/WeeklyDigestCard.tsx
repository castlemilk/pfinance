'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, BarChart3, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Notification } from '@/gen/pfinance/v1/types_pb';
import { useNotifications } from '../../context/NotificationContext';

interface DigestData {
  totalSpentCents: number;
  totalIncomeCents: number;
  netCents: number;
  topCategories: Array<{ category: number; amountCents: number }>;
  budgetSummaries: Array<{
    name: string;
    spentCents: number;
    budgetCents: number;
    percentageUsed: number;
  }>;
  goalSummaries: Array<{
    name: string;
    currentCents: number;
    targetCents: number;
    percentageComplete: number;
  }>;
  upcomingBillsCount: number;
  periodStart: string;
  periodEnd: string;
}

const CATEGORY_NAMES: Record<number, string> = {
  1: 'Food',
  2: 'Housing',
  3: 'Transport',
  4: 'Entertainment',
  5: 'Healthcare',
  6: 'Utilities',
  7: 'Shopping',
  8: 'Education',
  9: 'Travel',
  10: 'Other',
};

function formatCents(cents: number): string {
  return `$${(Math.abs(cents) / 100).toFixed(2)}`;
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `Week of ${startDate.toLocaleDateString(undefined, opts)} - ${endDate.toLocaleDateString(undefined, opts)}`;
}

interface WeeklyDigestCardProps {
  notification: Notification;
}

export default function WeeklyDigestCard({ notification }: WeeklyDigestCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { markRead } = useNotifications();

  const digest: DigestData | null = useMemo(() => {
    try {
      const raw = notification.metadata?.['digest_data'];
      if (!raw) return null;
      return JSON.parse(raw) as DigestData;
    } catch {
      return null;
    }
  }, [notification.metadata]);

  if (!digest) {
    return null;
  }

  const handleClick = async () => {
    if (!notification.isRead) {
      await markRead(notification.id);
    }
    setExpanded(!expanded);
  };

  const netPositive = digest.netCents >= 0;

  return (
    <Card
      className={cn(
        'transition-all cursor-pointer border',
        !notification.isRead && 'border-primary/30 bg-primary/5',
        notification.isRead && 'border-border'
      )}
      onClick={handleClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-teal-500" />
            <CardTitle className="text-sm font-semibold">
              {notification.title}
            </CardTitle>
            {!notification.isRead && (
              <div className="w-2 h-2 rounded-full bg-blue-500" />
            )}
          </div>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {formatDateRange(digest.periodStart, digest.periodEnd)}
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Spent</p>
            <p className="text-sm font-semibold text-red-500">
              {formatCents(digest.totalSpentCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Earned</p>
            <p className="text-sm font-semibold text-emerald-500">
              {formatCents(digest.totalIncomeCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net</p>
            <p className={cn(
              'text-sm font-semibold flex items-center justify-center gap-1',
              netPositive ? 'text-emerald-500' : 'text-red-500'
            )}>
              {netPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {netPositive ? '+' : '-'}{formatCents(digest.netCents)}
            </p>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="space-y-4 pt-2 border-t">
            {/* Top categories */}
            {digest.topCategories.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Top Spending</h4>
                <div className="space-y-2">
                  {digest.topCategories.map((cat, i) => {
                    const pct = digest.totalSpentCents > 0
                      ? (cat.amountCents / digest.totalSpentCents) * 100
                      : 0;
                    return (
                      <div key={i} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span>{CATEGORY_NAMES[cat.category] || 'Other'}</span>
                          <span className="text-muted-foreground">{formatCents(cat.amountCents)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Budget progress */}
            {digest.budgetSummaries.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Budgets</h4>
                <div className="space-y-2">
                  {digest.budgetSummaries.map((b, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{b.name}</span>
                        <span className={cn(
                          b.percentageUsed >= 100 ? 'text-red-500' :
                          b.percentageUsed >= 80 ? 'text-amber-500' :
                          'text-muted-foreground'
                        )}>
                          {b.percentageUsed.toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(b.percentageUsed, 100)}
                        className="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Goal progress */}
            {digest.goalSummaries.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Goals</h4>
                <div className="space-y-2">
                  {digest.goalSummaries.map((g, i) => (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>{g.name}</span>
                        <span className="text-muted-foreground">
                          {g.percentageComplete.toFixed(0)}%
                        </span>
                      </div>
                      <Progress
                        value={Math.min(g.percentageComplete, 100)}
                        className="h-1.5"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming bills */}
            {digest.upcomingBillsCount > 0 && (
              <div className="flex items-center gap-2">
                <Receipt className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  {digest.upcomingBillsCount} upcoming bill{digest.upcomingBillsCount !== 1 ? 's' : ''} this week
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {digest.upcomingBillsCount}
                </Badge>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
