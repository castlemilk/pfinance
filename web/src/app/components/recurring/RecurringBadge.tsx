'use client';

import { Badge } from '@/components/ui/badge';
import { Repeat } from 'lucide-react';
import type { ExpenseFrequency } from '../../types';

const frequencyLabels: Record<ExpenseFrequency, string> = {
  once: 'One-time',
  daily: 'Daily',
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

interface RecurringBadgeProps {
  frequency: ExpenseFrequency;
  className?: string;
}

export default function RecurringBadge({ frequency, className }: RecurringBadgeProps) {
  return (
    <Badge variant="outline" className={className}>
      <Repeat className="h-3 w-3 mr-1" />
      {frequencyLabels[frequency] || frequency}
    </Badge>
  );
}
