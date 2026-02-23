'use client';

import { useAuth } from '../context/AuthWithAdminContext';
import { SubscriptionTier, SubscriptionStatus } from '@/gen/pfinance/v1/types_pb';

export function useSubscription() {
  const { subscriptionTier, subscriptionStatus, subscriptionLoading, refreshSubscription } = useAuth();

  // In dev mode, grant Pro access so all features are testable
  const isDevMode = process.env.NEXT_PUBLIC_DEV_MODE === 'true';

  const isPro = isDevMode || subscriptionTier === SubscriptionTier.PRO;
  const isFree = !isPro;
  const isActive = isDevMode || subscriptionStatus === SubscriptionStatus.ACTIVE || subscriptionStatus === SubscriptionStatus.TRIALING;
  const hasProAccess = isPro && isActive;

  return {
    tier: subscriptionTier,
    status: subscriptionStatus,
    loading: subscriptionLoading,
    isPro,
    isFree,
    isActive,
    hasProAccess,
    refreshSubscription,
  };
}
