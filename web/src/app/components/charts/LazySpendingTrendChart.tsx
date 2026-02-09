'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const SpendingTrendChart = dynamic(
  () => import('./SpendingTrendChart'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazySpendingTrendChartProps = ComponentProps<typeof SpendingTrendChart>;

export default function LazySpendingTrendChart(props: LazySpendingTrendChartProps) {
  return <SpendingTrendChart {...props} />;
}
