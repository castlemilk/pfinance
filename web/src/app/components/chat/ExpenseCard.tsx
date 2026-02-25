'use client';

import { useRouter } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { getCategoryColor, getInstrumentBadgeStyle } from '../../constants/theme';
import type { ExpenseCategory } from '../../types';

interface ExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  tags?: string[];
}

interface ExpenseCardProps {
  expenses: ExpenseItem[];
  count: number;
  hasMore?: boolean;
  itemType?: 'expense' | 'income';
}

export function ExpenseCard({ expenses, count, hasMore, itemType = 'expense' }: ExpenseCardProps) {
  const router = useRouter();
  if (expenses.length === 0) {
    return (
      <div className="skeu-inset rounded-lg p-3 text-sm text-muted-foreground">
        No expenses found.
      </div>
    );
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="overflow-hidden rounded-lg">
      <div className="px-3 py-2 border-b border-primary/10 bg-muted/20 flex items-center justify-between">
        <span className="font-mono text-xs text-primary">{count} expense{count !== 1 ? 's' : ''}</span>
        <span className="font-mono text-xs font-semibold text-primary">${total.toFixed(2)}</span>
      </div>
      <div className="divide-y divide-primary/5 max-h-[300px] overflow-y-auto">
        {expenses.map((e) => (
          <div
            key={e.id}
            className="group px-3 py-2 flex items-center justify-between gap-2 text-sm cursor-pointer hover:bg-primary/5 transition-colors"
            onClick={() => {
              const route = itemType === 'income'
                ? `/personal/income/${e.id}/`
                : `/personal/expenses/${e.id}/`;
              router.push(route);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate group-hover:underline">{e.description}</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className="text-[10px] px-1.5 py-0 rounded-full font-medium"
                  style={getInstrumentBadgeStyle(getCategoryColor(e.category as ExpenseCategory))}
                >
                  {e.category}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{e.date}</span>
                {e.tags && e.tags.length > 0 && e.tags.map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-0 rounded-full bg-secondary/50 text-secondary-foreground">{t}</span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono font-semibold text-primary whitespace-nowrap">${e.amount.toFixed(2)}</span>
              <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="px-3 py-1.5 border-t border-primary/10 text-xs text-muted-foreground text-center font-mono">
          More results available...
        </div>
      )}
    </div>
  );
}
