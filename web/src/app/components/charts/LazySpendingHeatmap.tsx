'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const SpendingHeatmap = dynamic(
  () => import('./SpendingHeatmap'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazySpendingHeatmapProps = ComponentProps<typeof SpendingHeatmap>;

export default function LazySpendingHeatmap(props: LazySpendingHeatmapProps) {
  return <SpendingHeatmap {...props} />;
}
