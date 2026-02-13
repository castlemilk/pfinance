'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface BudgetItem {
  name: string;
  limit: number;
  spent: number;
  percentage: number;
  isActive: boolean;
}

interface InsightItem {
  title: string;
  description: string;
  amount: number;
  percentageChange?: number;
  category?: string;
}

interface SummaryCardProps {
  type: 'budgets' | 'insights' | 'goals';
  budgets?: BudgetItem[];
  insights?: InsightItem[];
  goals?: Array<{
    name: string;
    target: number;
    current: number;
    percentage: number;
    onTrack: boolean;
  }>;
}

export function SummaryCard({ type, budgets, insights, goals }: SummaryCardProps) {
  if (type === 'budgets' && budgets) {
    return (
      <Card className="bg-muted/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b bg-muted/80">
            <span className="text-xs font-medium">Budget Progress</span>
          </div>
          <div className="divide-y">
            {budgets.map((b) => (
              <div key={b.name} className="px-3 py-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{b.name}</span>
                  <span className="text-muted-foreground">
                    ${b.spent.toFixed(2)} / ${b.limit.toFixed(2)}
                  </span>
                </div>
                <Progress
                  value={Math.min(b.percentage, 100)}
                  className="h-2"
                />
                <div className="flex justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground">
                    {b.percentage.toFixed(0)}% used
                  </span>
                  {b.percentage > 90 && (
                    <span className="text-xs text-destructive font-medium">Near limit</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === 'insights' && insights) {
    return (
      <Card className="bg-muted/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b bg-muted/80">
            <span className="text-xs font-medium">Spending Insights</span>
          </div>
          <div className="divide-y">
            {insights.map((i, idx) => (
              <div key={idx} className="px-3 py-2">
                <div className="flex justify-between text-sm">
                  <span className="font-medium">{i.title}</span>
                  {i.amount > 0 && <span className="font-semibold">${i.amount.toFixed(2)}</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{i.description}</p>
                {i.percentageChange !== undefined && i.percentageChange !== 0 && (
                  <span className={`text-xs font-medium ${i.percentageChange > 0 ? 'text-destructive' : 'text-green-600'}`}>
                    {i.percentageChange > 0 ? '+' : ''}{i.percentageChange.toFixed(1)}% vs last period
                  </span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (type === 'goals' && goals) {
    return (
      <Card className="bg-muted/50 overflow-hidden">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b bg-muted/80">
            <span className="text-xs font-medium">Financial Goals</span>
          </div>
          <div className="divide-y">
            {goals.map((g) => (
              <div key={g.name} className="px-3 py-2">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{g.name}</span>
                  <span className="text-muted-foreground">
                    ${g.current.toFixed(2)} / ${g.target.toFixed(2)}
                  </span>
                </div>
                <Progress value={Math.min(g.percentage, 100)} className="h-2" />
                <div className="flex justify-between mt-0.5">
                  <span className="text-xs text-muted-foreground">{g.percentage.toFixed(0)}%</span>
                  <span className={`text-xs font-medium ${g.onTrack ? 'text-green-600' : 'text-amber-600'}`}>
                    {g.onTrack ? 'On track' : 'Behind'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
