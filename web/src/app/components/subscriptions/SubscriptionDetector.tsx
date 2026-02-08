'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  ScanSearch,
  Loader2,
  ArrowRight,
  X,
  DollarSign,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import { DetectedSubscription, ExpenseFrequency } from '@/gen/pfinance/v1/types_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';

const frequencyLabel = (freq: ExpenseFrequency): string => {
  switch (freq) {
    case ExpenseFrequency.WEEKLY: return 'Weekly';
    case ExpenseFrequency.FORTNIGHTLY: return 'Fortnightly';
    case ExpenseFrequency.MONTHLY: return 'Monthly';
    case ExpenseFrequency.QUARTERLY: return 'Quarterly';
    case ExpenseFrequency.ANNUALLY: return 'Annually';
    default: return 'Unknown';
  }
};

const confidenceBadge = (score: number) => {
  if (score >= 0.8) return <Badge className="bg-green-500/10 text-green-600 border-green-500/50">High</Badge>;
  if (score >= 0.6) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/50">Medium</Badge>;
  return <Badge className="bg-red-500/10 text-red-600 border-red-500/50">Low</Badge>;
};

interface SubscriptionDetectorProps {
  compact?: boolean;
}

export default function SubscriptionDetector({ compact = false }: SubscriptionDetectorProps) {
  const { user } = useAuth();
  const [subscriptions, setSubscriptions] = useState<DetectedSubscription[]>([]);
  const [totalMonthlyCost, setTotalMonthlyCost] = useState(0);
  const [forgottenCount, setForgottenCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [converting, setConverting] = useState<Set<string>>(new Set());

  const scanForSubscriptions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await financeClient.detectSubscriptions({
        userId: user.uid,
        lookbackMonths: 6,
      });
      setSubscriptions(response.subscriptions);
      setTotalMonthlyCost(response.totalMonthlyCost);
      setForgottenCount(response.forgottenCount);
      setScanned(true);
    } catch (err) {
      console.error('Failed to detect subscriptions:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const convertToRecurring = useCallback(async (sub: DetectedSubscription) => {
    if (!user) return;
    setConverting(prev => new Set(prev).add(sub.normalizedName));
    try {
      await financeClient.convertToRecurring({
        userId: user.uid,
        subscription: sub,
      });
      // Mark as already tracked
      setSubscriptions(prev =>
        prev.map(s =>
          s.normalizedName === sub.normalizedName
            ? { ...s, isAlreadyTracked: true } as unknown as DetectedSubscription
            : s
        )
      );
    } catch (err) {
      console.error('Failed to convert subscription:', err);
    } finally {
      setConverting(prev => {
        const next = new Set(prev);
        next.delete(sub.normalizedName);
        return next;
      });
    }
  }, [user]);

  const dismissSubscription = (name: string) => {
    setDismissed(prev => new Set(prev).add(name));
  };

  const visibleSubs = subscriptions.filter(
    s => !s.isAlreadyTracked && !dismissed.has(s.normalizedName)
  );

  if (!scanned) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ScanSearch className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">Subscription Detection</p>
                <p className="text-sm text-muted-foreground">
                  Scan your expenses to find recurring subscriptions
                </p>
              </div>
            </div>
            <Button onClick={scanForSubscriptions} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <ScanSearch className="h-4 w-4 mr-2" />
                  Scan
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (visibleSubs.length === 0 && scanned) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <ScanSearch className="h-5 w-5 text-green-500" />
            <div>
              <p className="font-medium">No new subscriptions detected</p>
              <p className="text-sm text-muted-foreground">
                All detected recurring payments are already being tracked.
              </p>
            </div>
            <Button variant="outline" size="sm" className="ml-auto" onClick={scanForSubscriptions}>
              Re-scan
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ScanSearch className="h-5 w-5" />
            Detected Subscriptions
          </CardTitle>
          <Button variant="outline" size="sm" onClick={scanForSubscriptions} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Re-scan'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 border rounded-lg text-center">
            <p className="text-2xl font-bold">{visibleSubs.length}</p>
            <p className="text-xs text-muted-foreground">Detected</p>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <p className="text-2xl font-bold">${totalMonthlyCost.toFixed(0)}</p>
            <p className="text-xs text-muted-foreground">Monthly Cost</p>
          </div>
          <div className="p-3 border rounded-lg text-center">
            <p className="text-2xl font-bold text-amber-500">{forgottenCount}</p>
            <p className="text-xs text-muted-foreground">Possibly Forgotten</p>
          </div>
        </div>

        {/* Subscription List */}
        <div className="space-y-2">
          {(compact ? visibleSubs.slice(0, 3) : visibleSubs).map((sub) => (
            <div
              key={sub.normalizedName}
              className="flex items-center gap-3 p-3 border rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{sub.merchantName}</p>
                  {confidenceBadge(sub.confidenceScore)}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Repeat className="h-3 w-3" />
                  {frequencyLabel(sub.detectedFrequency)}
                  <span className="text-muted-foreground/50">|</span>
                  <DollarSign className="h-3 w-3" />
                  ${sub.averageAmount.toFixed(2)}
                  <span className="text-muted-foreground/50">|</span>
                  {sub.occurrenceCount} payments
                  {sub.lastSeen && (
                    <>
                      <span className="text-muted-foreground/50">|</span>
                      Last: {timestampDate(sub.lastSeen).toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })}
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => convertToRecurring(sub)}
                  disabled={converting.has(sub.normalizedName)}
                >
                  {converting.has(sub.normalizedName) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <>
                      <ArrowRight className="h-3 w-3 mr-1" />
                      Track
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissSubscription(sub.normalizedName)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
