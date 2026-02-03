'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const ExpenseChart = dynamic(
  () => import('../ExpenseChart'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyExpenseChartProps = ComponentProps<typeof ExpenseChart>;

export default function LazyExpenseChart(props: LazyExpenseChartProps) {
  return <ExpenseChart {...props} />;
}
