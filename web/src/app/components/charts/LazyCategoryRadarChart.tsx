'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const CategoryRadarChart = dynamic(
  () => import('./CategoryRadarChart'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="h-full w-full rounded-lg motion-reduce:animate-none" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyCategoryRadarChartProps = ComponentProps<typeof CategoryRadarChart>;

export default function LazyCategoryRadarChart(props: LazyCategoryRadarChartProps) {
  return <CategoryRadarChart {...props} />;
}
