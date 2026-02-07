'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { FieldConfidence } from '@/gen/pfinance/v1/types_pb';

interface ConfidenceWarningBannerProps {
  overallConfidence?: number;
  fieldConfidences?: FieldConfidence;
  rejectedCount?: number;
  className?: string;
}

const LOW_THRESHOLD = 0.6;

function hasLowFieldConfidence(fc: FieldConfidence): boolean {
  const fields: (keyof Pick<FieldConfidence, 'amount' | 'date' | 'description' | 'merchant' | 'category'>)[] = [
    'amount', 'date', 'description', 'merchant', 'category',
  ];
  return fields.some((key) => {
    const val = fc[key];
    return typeof val === 'number' && val < LOW_THRESHOLD;
  });
}

function getLowFields(fc: FieldConfidence): string[] {
  const fields: { key: keyof Pick<FieldConfidence, 'amount' | 'date' | 'description' | 'merchant' | 'category'>; label: string }[] = [
    { key: 'amount', label: 'amount' },
    { key: 'date', label: 'date' },
    { key: 'description', label: 'description' },
    { key: 'merchant', label: 'merchant' },
    { key: 'category', label: 'category' },
  ];
  return fields
    .filter(({ key }) => {
      const val = fc[key];
      return typeof val === 'number' && val < LOW_THRESHOLD;
    })
    .map(({ label }) => label);
}

export function ConfidenceWarningBanner({
  overallConfidence,
  fieldConfidences,
  rejectedCount,
  className,
}: ConfidenceWarningBannerProps) {
  const showOverallWarning = overallConfidence !== undefined && overallConfidence < LOW_THRESHOLD;
  const showFieldWarning = fieldConfidences ? hasLowFieldConfidence(fieldConfidences) : false;
  const lowFields = fieldConfidences ? getLowFields(fieldConfidences) : [];

  if (!showOverallWarning && !showFieldWarning && !rejectedCount) {
    return null;
  }

  return (
    <Alert variant="destructive" className={className}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Low confidence detected</AlertTitle>
      <AlertDescription>
        {showOverallWarning && (
          <p>Overall confidence is {Math.round((overallConfidence ?? 0) * 100)}% — results may be unreliable. Please verify the extracted data.</p>
        )}
        {showFieldWarning && lowFields.length > 0 && (
          <p>Low confidence on: {lowFields.join(', ')}. Please verify these fields.</p>
        )}
        {rejectedCount !== undefined && rejectedCount > 0 && (
          <p>{rejectedCount} transaction{rejectedCount > 1 ? 's were' : ' was'} auto-rejected due to very low confidence.</p>
        )}
      </AlertDescription>
    </Alert>
  );
}
