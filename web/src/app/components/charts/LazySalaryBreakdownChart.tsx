'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const SalaryBreakdownChart = dynamic(
  () => import('../SalaryBreakdownChart'),
  {
    loading: () => (
      <div className="w-full h-80 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazySalaryBreakdownChartProps = ComponentProps<typeof SalaryBreakdownChart>;

export default function LazySalaryBreakdownChart(props: LazySalaryBreakdownChartProps) {
  return <SalaryBreakdownChart {...props} />;
}
