'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const AnomalyScatterPlot = dynamic(
  () => import('./AnomalyScatterPlot'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyAnomalyScatterPlotProps = ComponentProps<typeof AnomalyScatterPlot>;

export default function LazyAnomalyScatterPlot(props: LazyAnomalyScatterPlotProps) {
  return <AnomalyScatterPlot {...props} />;
}
