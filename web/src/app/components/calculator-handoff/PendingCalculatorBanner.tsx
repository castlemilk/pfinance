'use client';

import { ArrowRight, Calculator, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  usePendingCalculatorSnapshot,
  type CalculatorSnapshot,
  type CalculatorTool,
} from '@/lib/calculator-handoff';

interface PendingCalculatorBannerProps {
  tools: CalculatorTool[];
  applyLabel?: string;
  onApply?: (snapshot: CalculatorSnapshot) => void;
}

export default function PendingCalculatorBanner({
  tools,
  applyLabel = 'Apply these numbers',
  onApply,
}: PendingCalculatorBannerProps) {
  const { snapshot, dismiss } = usePendingCalculatorSnapshot(tools);

  if (!snapshot) return null;

  return (
    <div
      data-testid="pending-calculator-banner"
      className="rounded-lg border border-primary/40 bg-primary/5 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Calculator className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold tracking-tight">
              From the {snapshot.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {snapshot.summary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onApply && (
            <Button size="sm" onClick={() => onApply(snapshot)} className="gap-1.5">
              {applyLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={dismiss}
            aria-label="Dismiss calculator snapshot"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {snapshot.metrics.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {snapshot.metrics.map((metric) => (
            <div key={metric.label}>
              <dt className="text-xs text-muted-foreground">{metric.label}</dt>
              <dd className="text-sm font-semibold tabular-nums">
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
