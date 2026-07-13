'use client';

import dynamic from 'next/dynamic';
import { ComponentProps } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const CategoryStackedTrendChart = dynamic(
  () => import('./CategoryStackedTrendChart'),
  {
    loading: () => (
      <div className="flex h-64 w-full items-center justify-center">
        <Skeleton className="h-full w-full rounded-lg motion-reduce:animate-none" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyCategoryStackedTrendChartProps = ComponentProps<typeof CategoryStackedTrendChart>;

export default function LazyCategoryStackedTrendChart(props: LazyCategoryStackedTrendChartProps) {
  return <CategoryStackedTrendChart {...props} />;
}
