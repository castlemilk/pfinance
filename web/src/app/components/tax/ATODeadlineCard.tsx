'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, AlertTriangle } from 'lucide-react';

interface Deadline {
  label: string;
  date: Date;
  description: string;
}

function getATODeadlines(): Deadline[] {
  const now = new Date();
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const nextYear = year + 1;

  return [
    {
      label: 'FY End',
      date: new Date(nextYear, 5, 30), // June 30
      description: 'End of financial year',
    },
    {
      label: 'Self-Lodgement Deadline',
      date: new Date(nextYear, 9, 31), // October 31
      description: 'Lodge your own tax return by this date',
    },
    {
      label: 'Tax Agent Deadline',
      date: new Date(nextYear + 1, 2, 31), // March 31 next year
      description: 'Lodge via registered tax agent',
    },
    {
      label: 'PAYG Instalment Q1',
      date: new Date(nextYear, 9, 28), // October 28
      description: 'First quarterly PAYG instalment',
    },
    {
      label: 'PAYG Instalment Q2',
      date: new Date(nextYear + 1, 1, 28), // February 28
      description: 'Second quarterly PAYG instalment',
    },
  ];
}

export default function ATODeadlineCard() {
  const deadlines = useMemo(() => {
    const now = new Date();
    return getATODeadlines()
      .filter(d => d.date > now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 3);
  }, []);

  const daysUntil = (date: Date) => {
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const urgencyBadge = (days: number) => {
    if (days <= 14) return <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="w-3 h-3 mr-1" />{days}d</Badge>;
    if (days <= 30) return <Badge className="bg-yellow-500/20 text-yellow-500 text-[10px]">{days}d</Badge>;
    return <Badge variant="outline" className="text-[10px]">{days}d</Badge>;
  };

  if (deadlines.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          ATO Deadlines
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {deadlines.map((deadline, i) => {
          const days = daysUntil(deadline.date);
          return (
            <div key={i} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{deadline.label}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {deadline.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
              {urgencyBadge(days)}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
