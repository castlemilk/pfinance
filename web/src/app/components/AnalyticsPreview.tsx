'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, ArrowRight } from 'lucide-react';
import { ProFeatureGate } from './ProFeatureGate';
import { useFinance } from '../context/FinanceContext';

/**
 * Compact 8-week spending trend sparkline for the personal dashboard.
 * Wrapped in ProFeatureGate; links to /personal/analytics.
 */
export default function AnalyticsPreview() {
  const { expenses } = useFinance();

  // Group expenses into 8 weekly buckets
  const weeklyData = useMemo(() => {
    const now = new Date();
    const weeks = 8;
    const buckets: number[] = new Array(weeks).fill(0);

    for (const exp of expenses) {
      const expDate = exp.date ? new Date(exp.date) : null;
      if (!expDate) continue;

      const diffMs = now.getTime() - expDate.getTime();
      const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));

      if (diffWeeks >= 0 && diffWeeks < weeks) {
        // Index 0 = oldest, 7 = most recent
        const idx = weeks - 1 - diffWeeks;
        const amount = exp.amount;
        buckets[idx] += amount;
      }
    }

    return buckets;
  }, [expenses]);

  const maxVal = Math.max(...weeklyData, 1);
  const hasData = weeklyData.some((v) => v > 0);

  if (!hasData) return null;

  return (
    <ProFeatureGate feature="Analytics Preview" mode="hide">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Spending Trend
          </CardTitle>
          <Link href="/personal/analytics/">
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
              View Analytics
              <ArrowRight className="h-3 w-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-16">
            {weeklyData.map((value, i) => {
              const heightPct = maxVal > 0 ? (value / maxVal) * 100 : 0;
              return (
                <div
                  key={i}
                  className="flex-1 bg-primary/60 rounded-sm transition-all hover:bg-primary"
                  style={{ height: `${Math.max(heightPct, 2)}%` }}
                  title={`Week ${i + 1}: $${value.toFixed(2)}`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>8 weeks ago</span>
            <span>This week</span>
          </div>
        </CardContent>
      </Card>
    </ProFeatureGate>
  );
}
