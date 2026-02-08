'use client';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import { DetectedSubscription } from '@/gen/pfinance/v1/types_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';

interface ForgottenSubscriptionAlertProps {
  subscriptions: DetectedSubscription[];
  onDismiss?: (name: string) => void;
}

export default function ForgottenSubscriptionAlert({
  subscriptions,
  onDismiss,
}: ForgottenSubscriptionAlertProps) {
  const now = new Date();
  const forgotten = subscriptions.filter(
    s => !s.isAlreadyTracked && s.expectedNext && timestampDate(s.expectedNext) < now
  );

  if (forgotten.length === 0) return null;

  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Possibly forgotten subscriptions</AlertTitle>
      <AlertDescription>
        <div className="space-y-2 mt-2">
          {forgotten.slice(0, 3).map((sub) => (
            <div key={sub.normalizedName} className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">{sub.merchantName}</span>
                {' - '}
                Expected{' '}
                {sub.expectedNext && timestampDate(sub.expectedNext).toLocaleDateString('en-AU', {
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
              {onDismiss && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => onDismiss(sub.normalizedName)}
                >
                  Dismiss
                </Button>
              )}
            </div>
          ))}
          {forgotten.length > 3 && (
            <p className="text-xs text-muted-foreground">
              And {forgotten.length - 3} more...
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
