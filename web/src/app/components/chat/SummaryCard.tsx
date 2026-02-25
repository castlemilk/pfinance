'use client';

import { Progress } from '@/components/ui/progress';
import { getInstrumentBadgeStyle } from '../../constants/theme';

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
      <div className="overflow-hidden rounded-lg">
        <div className="px-3 py-2 border-b border-primary/10 bg-muted/20">
          <span className="font-mono text-xs font-medium text-primary">Budget Progress</span>
        </div>
        <div className="divide-y divide-primary/5">
          {budgets.map((b) => (
            <div key={b.name} className="px-3 py-2.5">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  ${b.spent.toFixed(2)} / ${b.limit.toFixed(2)}
                </span>
              </div>
              <div className="skeu-inset rounded-full p-0.5">
                <Progress
                  value={Math.min(b.percentage, 100)}
                  className="h-2"
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground font-mono">
                  {b.percentage.toFixed(0)}% used
                </span>
                {b.percentage > 90 && (
                  <span className="text-xs font-medium" style={{ color: '#D16A47' }}>Near limit</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'insights' && insights) {
    return (
      <div className="overflow-hidden rounded-lg">
        <div className="px-3 py-2 border-b border-primary/10 bg-muted/20">
          <span className="font-mono text-xs font-medium text-primary">Spending Insights</span>
        </div>
        <div className="divide-y divide-primary/5">
          {insights.map((i, idx) => (
            <div key={idx} className="px-3 py-2.5">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{i.title}</span>
                {i.amount > 0 && <span className="font-mono font-semibold text-primary">${i.amount.toFixed(2)}</span>}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{i.description}</p>
              {i.percentageChange !== undefined && i.percentageChange !== 0 && (
                <span
                  className="text-xs font-medium font-mono"
                  style={{ color: i.percentageChange > 0 ? '#D16A47' : '#87A96B' }}
                >
                  {i.percentageChange > 0 ? '+' : ''}{i.percentageChange.toFixed(1)}% vs last period
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (type === 'goals' && goals) {
    return (
      <div className="overflow-hidden rounded-lg">
        <div className="px-3 py-2 border-b border-primary/10 bg-muted/20">
          <span className="font-mono text-xs font-medium text-primary">Financial Goals</span>
        </div>
        <div className="divide-y divide-primary/5">
          {goals.map((g) => (
            <div key={g.name} className="px-3 py-2.5">
              <div className="flex justify-between text-sm mb-1.5">
                <span className="font-medium">{g.name}</span>
                <span className="text-muted-foreground font-mono text-xs">
                  ${g.current.toFixed(2)} / ${g.target.toFixed(2)}
                </span>
              </div>
              <div className="skeu-inset rounded-full p-0.5">
                <Progress value={Math.min(g.percentage, 100)} className="h-2" />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground font-mono">{g.percentage.toFixed(0)}%</span>
                <span
                  className="text-[10px] px-1.5 py-0 rounded-full font-medium"
                  style={getInstrumentBadgeStyle(g.onTrack ? '#87A96B' : '#D16A47')}
                >
                  {g.onTrack ? 'On track' : 'Behind'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
