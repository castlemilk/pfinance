'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { ComponentProps } from 'react';

const ExpenseSankey = dynamic(
  () => import('../ExpenseSankey'),
  {
    loading: () => (
      <div className="w-full h-80 flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-lg" />
      </div>
    ),
    ssr: false,
  }
);

export type LazyExpenseSankeyProps = ComponentProps<typeof ExpenseSankey>;

export default function LazyExpenseSankey(props: LazyExpenseSankeyProps) {
  return <ExpenseSankey {...props} />;
}
