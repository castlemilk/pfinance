'use client';

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Progress } from '@/components/ui/progress';
import { ChevronDown, AlertTriangle } from 'lucide-react';
import type { FieldConfidence } from '@/gen/pfinance/v1/types_pb';
import { cn } from '@/lib/utils';

interface FieldConfidenceDetailProps {
  fieldConfidences: FieldConfidence;
  className?: string;
}

const LOW_THRESHOLD = 0.6;

const fields: { key: keyof Omit<FieldConfidence, '$typeName' | '$unknown'>; label: string }[] = [
  { key: 'amount', label: 'Amount' },
  { key: 'date', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'category', label: 'Category' },
];

function getBarColor(confidence: number): string {
  if (confidence >= 0.8) return 'bg-green-500';
  if (confidence >= 0.6) return 'bg-yellow-500';
  return 'bg-red-500';
}

export function FieldConfidenceDetail({ fieldConfidences, className }: FieldConfidenceDetailProps) {
  const [open, setOpen] = useState(false);

  const hasLowField = fields.some(({ key }) => {
    const val = fieldConfidences[key];
    return typeof val === 'number' && val < LOW_THRESHOLD;
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('w-full', className)}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 transition-transform',
            open && 'rotate-180'
          )}
        />
        <span>Field confidence details</span>
        {hasLowField && (
          <AlertTriangle className="h-3 w-3 text-yellow-500 ml-auto" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {fields.map(({ key, label }) => {
          const value = fieldConfidences[key];
          const confidence = typeof value === 'number' ? value : 0;
          const percentage = Math.round(confidence * 100);
          const isLow = confidence < LOW_THRESHOLD;

          return (
            <div key={key} className="flex items-center gap-2 text-xs">
              <span className={cn('w-20 text-muted-foreground', isLow && 'text-yellow-600 dark:text-yellow-400')}>
                {isLow && <AlertTriangle className="inline h-3 w-3 mr-0.5" />}
                {label}
              </span>
              <div className="flex-1 relative">
                <Progress
                  value={percentage}
                  className="h-1.5 [&>[data-slot=progress-indicator]]:transition-all"
                />
                <div
                  className={cn(
                    'absolute inset-0 h-1.5 rounded-full transition-all',
                    getBarColor(confidence)
                  )}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className={cn(
                'w-10 text-right tabular-nums',
                isLow ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'
              )}>
                {percentage}%
              </span>
            </div>
          );
        })}
      </CollapsibleContent>
    </Collapsible>
  );
}
