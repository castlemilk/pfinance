'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const CashFlowForecast = dynamic(
  () => import('./CashFlowForecast'),
  {
    loading: () => (
      <div className="w-full h-64 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyCashFlowForecastProps = ComponentProps<typeof CashFlowForecast>;

export default function LazyCashFlowForecast(props: LazyCashFlowForecastProps) {
  return <CashFlowForecast {...props} />;
}
