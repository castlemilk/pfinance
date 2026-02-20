'use client';

import { useAuth } from '../context/AuthWithAdminContext';
import { SubscriptionTier, SubscriptionStatus } from '@/gen/pfinance/v1/types_pb';

export function useSubscription() {
  const { subscriptionTier, subscriptionStatus, subscriptionLoading, refreshSubscription } = useAuth();

  const isPro = subscriptionTier === SubscriptionTier.PRO;
  const isFree = !isPro;
  const isActive = subscriptionStatus === SubscriptionStatus.ACTIVE || subscriptionStatus === SubscriptionStatus.TRIALING;
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
