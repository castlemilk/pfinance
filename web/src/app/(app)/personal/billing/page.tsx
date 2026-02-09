'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Crown,
  CreditCard,
  Loader2,
  CheckCircle,
  XCircle,
  Sparkles,
  Zap,
  ArrowRight,
  Shield,
  BarChart3,
  Users,
  FileText,
} from 'lucide-react';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { SubscriptionTier, SubscriptionStatus } from '@/gen/pfinance/v1/types_pb';

// ---------------------------------------------------------------------------
// Pro features list (shared between celebration and upgrade views)
// ---------------------------------------------------------------------------
const PRO_FEATURES = [
  { icon: FileText, label: 'AI-powered document extraction' },
  { icon: Zap, label: 'Smart expense parsing' },
  { icon: BarChart3, label: 'Advanced spending insights' },
  { icon: Users, label: 'Unlimited groups' },
  { icon: Shield, label: 'Priority support' },
];

// ---------------------------------------------------------------------------
// Page states
// ---------------------------------------------------------------------------
type PageState =
  | 'loading'          // Initial load
  | 'verifying'        // Verifying checkout session with backend
  | 'just-activated'   // Celebration view after successful verification
  | 'pro'              // Already a Pro user (normal view)
  | 'free'             // Free user (upgrade view)
  | 'error';           // Verification failed

export default function BillingPage() {
  const { user, refreshSubscription } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [tier, setTier] = useState<SubscriptionTier>(SubscriptionTier.FREE);
  const [status, setStatus] = useState<SubscriptionStatus>(SubscriptionStatus.UNSPECIFIED);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Track whether we already attempted verification (prevent double-fire in StrictMode)
  const verificationAttempted = useRef(false);

  // Search params from Stripe redirect
  const checkoutResult = searchParams.get('checkout');
  const sessionId = searchParams.get('session_id');

  // ------------------------------------------------------------------
  // Load current subscription status from backend
  // ------------------------------------------------------------------
  const loadSubscription = useCallback(async () => {
    if (!user) return;
    try {
      const res = await financeClient.getSubscriptionStatus({ userId: user.uid });
      setTier(res.tier);
      setStatus(res.status);
      setCancelAtPeriodEnd(res.cancelAtPeriodEnd);
      return res;
    } catch (err) {
      console.error('Failed to load subscription status:', err);
      return null;
    }
  }, [user]);

  // ------------------------------------------------------------------
  // Fallback: poll getSubscriptionStatus (backward compat / no session_id)
  // ------------------------------------------------------------------
  const fallbackPolling = useCallback(async () => {
    if (!user) return;

    setPageState('verifying');
    let pollCount = 0;
    const maxPolls = 15;

    while (pollCount < maxPolls) {
      pollCount++;
      try {
        const res = await financeClient.getSubscriptionStatus({ userId: user.uid });
        if (res.tier === SubscriptionTier.PRO) {
          setTier(res.tier);
          setStatus(res.status);
          setCancelAtPeriodEnd(res.cancelAtPeriodEnd);
          if (refreshSubscription) {
            await refreshSubscription();
          }
          setPageState('just-activated');
          return;
        }
      } catch (err) {
        console.error('Poll failed:', err);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Polling exhausted -- show error state but reload status
    const res = await loadSubscription();
    if (res?.tier === SubscriptionTier.PRO) {
      setPageState('just-activated');
    } else {
      setVerifyError('Your payment was received but activation is taking longer than expected. Please refresh in a moment.');
      setPageState('error');
    }
  }, [user, refreshSubscription, loadSubscription]);

  // ------------------------------------------------------------------
  // Verify checkout session via the new RPC
  // ------------------------------------------------------------------
  const verifyCheckout = useCallback(async (sid: string) => {
    try {
      setPageState('verifying');
      // Call the VerifyCheckoutSession RPC. This RPC is being added in parallel
      // and will directly verify the session with Stripe and activate the sub.
      await financeClient.verifyCheckoutSession({ sessionId: sid });

      // Refresh the auth token so custom claims reflect PRO
      if (refreshSubscription) {
        await refreshSubscription();
      }

      // Re-load subscription status to get latest tier/status
      const res = await loadSubscription();
      if (res && res.tier === SubscriptionTier.PRO) {
        setPageState('just-activated');
      } else {
        // If the verify succeeded but status isn't PRO yet, show celebration
        // anyway since the RPC succeeded (claims may take a moment)
        setTier(SubscriptionTier.PRO);
        setStatus(SubscriptionStatus.ACTIVE);
        setPageState('just-activated');
      }
    } catch (err) {
      console.error('Failed to verify checkout session:', err);
      setVerifyError('We had trouble activating your subscription. Please refresh the page or contact support.');
      // Fall back to polling
      await fallbackPolling();
    }
  }, [refreshSubscription, loadSubscription, fallbackPolling]);

  // ------------------------------------------------------------------
  // Initialization effect
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      // If returning from checkout with a session ID, verify it
      if (checkoutResult === 'success' && sessionId && !verificationAttempted.current) {
        verificationAttempted.current = true;
        await verifyCheckout(sessionId);
        return;
      }

      // If returning from checkout without session ID, use polling fallback
      if (checkoutResult === 'success' && !sessionId && !verificationAttempted.current) {
        verificationAttempted.current = true;
        await fallbackPolling();
        return;
      }

      // Normal page load: fetch subscription status
      const res = await loadSubscription();
      if (res) {
        if (res.tier === SubscriptionTier.PRO) {
          setPageState('pro');
        } else {
          setPageState('free');
        }
      } else {
        setPageState('free');
      }
    };

    init();
  }, [user, checkoutResult, sessionId, verifyCheckout, fallbackPolling, loadSubscription]);

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  const handleUpgrade = async () => {
    if (!user) return;
    setCheckoutLoading(true);
    try {
      const baseUrl = window.location.origin;
      const res = await financeClient.createCheckoutSession({
        userId: user.uid,
        successUrl: `${baseUrl}/personal/billing/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
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

  const handleDismissCelebration = () => {
    setPageState('pro');
    // Clean up URL params
    router.replace('/personal/billing/');
  };

  // ------------------------------------------------------------------
  // Derived state
  // ------------------------------------------------------------------
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

  // ====================================================================
  // RENDER: Verifying State
  // ====================================================================
  if (pageState === 'verifying') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md border-primary/30 shadow-lg">
          <CardContent className="flex flex-col items-center gap-6 py-12 px-8">
            {/* Pulsing crown icon */}
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full opacity-30"
                style={{
                  background: 'radial-gradient(circle, var(--glow-color) 0%, transparent 70%)',
                  animation: 'verifyPulse 2s ease-in-out infinite',
                }}
              />
              <div
                className="relative flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 border border-primary/20"
                style={{ animation: 'verifyBreath 2s ease-in-out infinite' }}
              >
                <Crown className="w-10 h-10 text-primary" />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold tracking-tight">Activating your Pro subscription</h2>
              <p className="text-sm text-muted-foreground">
                Verifying your payment with Stripe...
              </p>
            </div>

            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">This will only take a moment</span>
            </div>
          </CardContent>
        </Card>

        <style>{`
          @keyframes verifyPulse {
            0%, 100% { transform: scale(1); opacity: 0.3; }
            50% { transform: scale(1.4); opacity: 0.1; }
          }
          @keyframes verifyBreath {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

  // ====================================================================
  // RENDER: Just Activated (Celebration)
  // ====================================================================
  if (pageState === 'just-activated') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
        {/* Celebration card */}
        <div className="relative w-full max-w-lg">
          {/* Animated gradient border */}
          <div
            className="absolute -inset-[2px] rounded-xl opacity-75"
            style={{
              background: 'conic-gradient(from 0deg, var(--glow-color), var(--primary), var(--accent, var(--primary)), var(--glow-color))',
              animation: 'celebrationBorderSpin 4s linear infinite',
              filter: 'blur(4px)',
            }}
          />
          <Card className="relative w-full border-0 shadow-xl overflow-hidden">
            {/* Subtle shimmer overlay */}
            <div
              className="absolute inset-0 opacity-5 pointer-events-none"
              style={{
                background: 'linear-gradient(105deg, transparent 40%, var(--glow-color) 50%, transparent 60%)',
                backgroundSize: '200% 100%',
                animation: 'celebrationShimmer 3s ease-in-out infinite',
              }}
            />

            <CardContent className="relative flex flex-col items-center gap-6 py-12 px-8">
              {/* Crown with glow */}
              <div
                className="relative flex items-center justify-center w-24 h-24"
                style={{ animation: 'celebrationCrownEntry 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards' }}
              >
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle, var(--glow-color) 0%, transparent 70%)',
                    opacity: 0.25,
                    animation: 'celebrationGlow 2s ease-in-out infinite',
                  }}
                />
                <div className="relative flex items-center justify-center w-20 h-20 rounded-full bg-primary/15 border-2 border-primary/30">
                  <Crown className="w-10 h-10 text-primary" style={{ filter: 'drop-shadow(0 0 8px var(--glow-color))' }} />
                </div>
                {/* Sparkle accents */}
                <Sparkles
                  className="absolute -top-1 -right-1 w-5 h-5 text-primary/70"
                  style={{ animation: 'celebrationSparkle 1.5s ease-in-out infinite 0.2s' }}
                />
                <Sparkles
                  className="absolute -bottom-1 -left-2 w-4 h-4 text-primary/50"
                  style={{ animation: 'celebrationSparkle 1.5s ease-in-out infinite 0.8s' }}
                />
              </div>

              {/* Heading */}
              <div
                className="text-center space-y-2"
                style={{ animation: 'celebrationFadeUp 0.5s ease-out 0.2s both' }}
              >
                <h1 className="text-3xl font-bold tracking-tight">Welcome to Pro!</h1>
                <p className="text-muted-foreground">
                  Your subscription is now active. Here&apos;s what you&apos;ve unlocked:
                </p>
              </div>

              {/* Feature list with staggered entrance */}
              <div className="w-full max-w-sm space-y-3">
                {PRO_FEATURES.map((feature, i) => {
                  const Icon = feature.icon;
                  return (
                    <div
                      key={feature.label}
                      className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10"
                      style={{
                        animation: `celebrationFeatureSlide 0.4s ease-out ${0.4 + i * 0.1}s both`,
                      }}
                    >
                      <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm font-medium">{feature.label}</span>
                      <CheckCircle className="w-4 h-4 text-primary ml-auto shrink-0" />
                    </div>
                  );
                })}
              </div>

              {/* CTA */}
              <div
                className="flex flex-col sm:flex-row gap-3 w-full max-w-sm pt-2"
                style={{ animation: `celebrationFadeUp 0.5s ease-out ${0.4 + PRO_FEATURES.length * 0.1 + 0.1}s both` }}
              >
                <Button
                  className="flex-1 glow-hover"
                  onClick={() => router.push('/personal/expenses/')}
                >
                  Start Exploring
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleDismissCelebration}
                >
                  View Billing
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <style>{`
          @keyframes celebrationBorderSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes celebrationShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          @keyframes celebrationCrownEntry {
            0% { transform: scale(0) rotate(-20deg); opacity: 0; }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
          }
          @keyframes celebrationGlow {
            0%, 100% { transform: scale(1); opacity: 0.25; }
            50% { transform: scale(1.3); opacity: 0.15; }
          }
          @keyframes celebrationSparkle {
            0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.7; }
            50% { transform: scale(1.3) rotate(15deg); opacity: 0.3; }
          }
          @keyframes celebrationFadeUp {
            0% { transform: translateY(12px); opacity: 0; }
            100% { transform: translateY(0); opacity: 1; }
          }
          @keyframes celebrationFeatureSlide {
            0% { transform: translateX(-16px); opacity: 0; }
            100% { transform: translateX(0); opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // ====================================================================
  // RENDER: Error State (verification failed)
  // ====================================================================
  if (pageState === 'error') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription and billing details
          </p>
        </div>

        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 pt-6">
            <Loader2 className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {verifyError || 'Subscription activation is taking longer than expected.'}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.location.reload()}
                >
                  Refresh Page
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Still show the normal billing view underneath */}
        {renderBillingView()}
      </div>
    );
  }

  // ====================================================================
  // RENDER: Loading
  // ====================================================================
  if (pageState === 'loading') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-muted-foreground">
            Manage your subscription and billing details
          </p>
        </div>
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading billing information...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ====================================================================
  // RENDER: Normal billing view (Pro or Free)
  // ====================================================================
  function renderBillingView() {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Plan Card */}
        <Card className={isPro ? 'border-primary/20' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {isPro ? (
                <Crown className="w-5 h-5 text-primary" />
              ) : (
                <CreditCard className="w-5 h-5" />
              )}
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
                className="w-full glow-hover"
                onClick={handleUpgrade}
                disabled={checkoutLoading || !user}
              >
                {checkoutLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Redirecting to checkout...
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

        {/* Pro Features Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Pro Features
            </CardTitle>
            <CardDescription>
              {isPro ? 'Everything included in your plan:' : 'Everything in Free, plus:'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {PRO_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <li key={feature.label} className="flex items-center gap-3 text-sm">
                    <div className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${
                      isPro ? 'bg-primary/10' : 'bg-muted'
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${isPro ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <span>{feature.label}</span>
                    {isPro && <CheckCircle className="w-4 h-4 text-primary ml-auto shrink-0" />}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground">
          Manage your subscription and billing details
        </p>
      </div>

      {/* Checkout cancelled banner */}
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

      {renderBillingView()}
    </div>
  );
}
