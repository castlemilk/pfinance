'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

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
}

export function ExpenseCard({ expenses, count, hasMore }: ExpenseCardProps) {
  if (expenses.length === 0) {
    return (
      <Card className="bg-muted/50">
        <CardContent className="p-3 text-sm text-muted-foreground">
          No expenses found.
        </CardContent>
      </Card>
    );
  }

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  return (
    <Card className="bg-muted/50 overflow-hidden">
      <CardContent className="p-0">
        <div className="px-3 py-2 border-b bg-muted/80 flex items-center justify-between">
          <span className="text-xs font-medium">{count} expense{count !== 1 ? 's' : ''}</span>
          <span className="text-xs font-semibold">${total.toFixed(2)} total</span>
        </div>
        <div className="divide-y max-h-[300px] overflow-y-auto">
          {expenses.map((e) => (
            <div key={e.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{e.description}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{e.category}</Badge>
                  <span className="text-xs text-muted-foreground">{e.date}</span>
                  {e.tags && e.tags.length > 0 && e.tags.map(t => (
                    <Badge key={t} variant="secondary" className="text-[10px] px-1 py-0">{t}</Badge>
                  ))}
                </div>
              </div>
              <span className="font-semibold whitespace-nowrap">${e.amount.toFixed(2)}</span>
            </div>
          ))}
        </div>
        {hasMore && (
          <div className="px-3 py-1.5 border-t text-xs text-muted-foreground text-center">
            More results available...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
