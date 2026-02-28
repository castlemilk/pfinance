'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calculator, TrendingDown, TrendingUp, Receipt } from 'lucide-react';
import { useTax } from '../context/TaxContext';
import { useSubscription } from '../hooks/useSubscription';
import Link from 'next/link';

export default function TaxTrackerWidget() {
  const { currentEstimate, loading, error } = useTax();
  const { isPro } = useSubscription();

  if (!isPro) return null;

  if (loading && !currentEstimate) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Tax Estimate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24 mb-2" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  if (error || !currentEstimate) {
    return null;
  }

  const refundCents = currentEstimate.refundOrOwedCents;
  const isRefund = refundCents > BigInt(0);
  const totalDeductionsCents = currentEstimate.totalDeductionsCents;
  const effectiveRate = currentEstimate.effectiveRate;

  const formatCents = (cents: bigint) => {
    const abs = cents < BigInt(0) ? -cents : cents;
    return `$${(Number(abs) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2 })}`;
  };

  return (
    <Link href="/personal/tax/" className="block">
      <Card className="hover:border-primary/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Tax Estimate
            <Badge variant="outline" className="ml-auto text-[10px]">
              Live
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            {isRefund ? (
              <TrendingDown className="w-5 h-5 text-green-500" />
            ) : (
              <TrendingUp className="w-5 h-5 text-red-500" />
            )}
            <span className={`text-2xl font-bold ${isRefund ? 'text-green-500' : 'text-red-500'}`}>
              {formatCents(refundCents)}
            </span>
            <span className="text-xs text-muted-foreground">
              {isRefund ? 'refund' : 'owed'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Receipt className="w-3 h-3" />
              {formatCents(totalDeductionsCents)} deductions
            </span>
            <span>{effectiveRate.toFixed(1)}% effective rate</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
