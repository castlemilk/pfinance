'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Crown, CreditCard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { SubscriptionTier, SubscriptionStatus } from '@/gen/pfinance/v1/types_pb';

export default function BillingPage() {
  const { user, refreshSubscription } = useAuth();
  const searchParams = useSearchParams();

  const [tier, setTier] = useState<SubscriptionTier>(SubscriptionTier.FREE);
  const [status, setStatus] = useState<SubscriptionStatus>(SubscriptionStatus.UNSPECIFIED);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  // Check for success/cancel query params from Stripe redirect
  const checkoutResult = searchParams.get('checkout');

  const loadSubscription = useCallback(async () => {
    if (!user) return;
    try {
      const res = await financeClient.getSubscriptionStatus({ userId: user.uid });
      setTier(res.tier);
      setStatus(res.status);
      setCancelAtPeriodEnd(res.cancelAtPeriodEnd);
    } catch (err) {
      console.error('Failed to load subscription status:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadSubscription();
  }, [loadSubscription]);

  // Poll for subscription update after checkout success
  useEffect(() => {
    if (checkoutResult !== 'success' || !user) return;

    let cancelled = false;
    let pollCount = 0;
    const maxPolls = 10;

    const poll = async () => {
      while (!cancelled && pollCount < maxPolls) {
        pollCount++;
        try {
          const res = await financeClient.getSubscriptionStatus({ userId: user.uid });
          if (res.tier === SubscriptionTier.PRO) {
            setTier(res.tier);
            setStatus(res.status);
            setCancelAtPeriodEnd(res.cancelAtPeriodEnd);
            // Also refresh the auth token to get updated custom claims
            if (refreshSubscription) {
              await refreshSubscription();
            }
            return;
          }
        } catch (err) {
          console.error('Poll failed:', err);
        }
        // Wait 2 seconds between polls
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [checkoutResult, user, refreshSubscription]);

  const handleUpgrade = async () => {
    if (!user) return;
    setCheckoutLoading(true);
    try {
      const baseUrl = window.location.origin;
      const res = await financeClient.createCheckoutSession({
        userId: user.uid,
        successUrl: `${baseUrl}/personal/billing/?checkout=success`,
        cancelUrl: `${baseUrl}/personal/billing/?checkout=cancelled`,
      });
      if (res.checkoutUrl) {
        window.location.href = res.checkoutUrl;
      }
    } catch (err) {
      console.error('Failed to create checkout session:', err);
      setCheckoutLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!user) return;
    setCancelLoading(true);
    try {
      await financeClient.cancelSubscription({ userId: user.uid });
      setCancelAtPeriodEnd(true);
    } catch (err) {
      console.error('Failed to cancel subscription:', err);
    } finally {
      setCancelLoading(false);
    }
  };

  const isPro = tier === SubscriptionTier.PRO;
  const isActive = status === SubscriptionStatus.ACTIVE || status === SubscriptionStatus.TRIALING;

  const statusLabel = (s: SubscriptionStatus) => {
    switch (s) {
      case SubscriptionStatus.ACTIVE: return 'Active';
      case SubscriptionStatus.TRIALING: return 'Trial';
      case SubscriptionStatus.PAST_DUE: return 'Past Due';
      case SubscriptionStatus.CANCELED: return 'Canceled';
      default: return 'None';
    }
  };

  const statusVariant = (s: SubscriptionStatus): 'default' | 'destructive' | 'outline' | 'secondary' => {
    switch (s) {
      case SubscriptionStatus.ACTIVE:
      case SubscriptionStatus.TRIALING:
        return 'default';
      case SubscriptionStatus.PAST_DUE:
        return 'destructive';
      case SubscriptionStatus.CANCELED:
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing details
        </p>
      </div>

      {/* Checkout result banner */}
      {checkoutResult === 'success' && (
        <Card className="border-green-500/50 bg-green-500/5">
          <CardContent className="flex items-center gap-3 pt-6">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-sm">
              Payment successful! Your Pro subscription is now active.
            </p>
          </CardContent>
        </Card>
      )}
      {checkoutResult === 'cancelled' && (
        <Card className="border-muted-foreground/30">
          <CardContent className="flex items-center gap-3 pt-6">
            <XCircle className="w-5 h-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Checkout was cancelled. No charges were made.
            </p>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Plan */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {isPro ? <Crown className="w-5 h-5" /> : <CreditCard className="w-5 h-5" />}
                Current Plan
              </CardTitle>
              <CardDescription>
                {isPro ? 'You are on the Pro plan' : 'You are on the Free plan'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Plan</span>
                <Badge variant={isPro ? 'default' : 'outline'} className="text-sm">
                  {isPro && <Crown className="w-3 h-3 mr-1" />}
                  {isPro ? 'Pro' : 'Free'}
                </Badge>
              </div>

              {isPro && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge variant={statusVariant(status)}>
                      {statusLabel(status)}
                    </Badge>
                  </div>

                  {cancelAtPeriodEnd && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Your subscription will cancel at the end of the current billing period.
                    </p>
                  )}
                </>
              )}

              {!isPro && (
                <Button
                  className="w-full"
                  onClick={handleUpgrade}
                  disabled={checkoutLoading || !user}
                >
                  {checkoutLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Redirecting...
                    </>
                  ) : (
                    <>
                      <Crown className="w-4 h-4 mr-2" />
                      Upgrade to Pro
                    </>
                  )}
                </Button>
              )}

              {isPro && isActive && !cancelAtPeriodEnd && (
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={handleCancel}
                  disabled={cancelLoading}
                >
                  {cancelLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    'Cancel Subscription'
                  )}
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Pro Features */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="w-5 h-5" />
                Pro Features
              </CardTitle>
              <CardDescription>
                Everything in Free, plus:
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {[
                  'AI-powered document extraction',
                  'Smart expense parsing',
                  'Advanced spending insights',
                  'Unlimited groups',
                  'Priority support',
                ].map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <CheckCircle className={`w-4 h-4 shrink-0 ${isPro ? 'text-green-500' : 'text-muted-foreground'}`} />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
