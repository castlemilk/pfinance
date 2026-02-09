'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const WaterfallChart = dynamic(
  () => import('./WaterfallChart'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyWaterfallChartProps = ComponentProps<typeof WaterfallChart>;

export default function LazyWaterfallChart(props: LazyWaterfallChartProps) {
  return <WaterfallChart {...props} />;
}
