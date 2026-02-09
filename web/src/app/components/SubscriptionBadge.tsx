'use client';

import { Badge } from '@/components/ui/badge';
import { Crown } from 'lucide-react';
import { SubscriptionTier } from '@/gen/pfinance/v1/types_pb';

interface SubscriptionBadgeProps {
  tier: SubscriptionTier;
  className?: string;
}

export default function SubscriptionBadge({ tier, className }: SubscriptionBadgeProps) {
  if (tier === SubscriptionTier.PRO) {
    return (
      <Badge variant="default" className={className}>
        <Crown className="w-3 h-3 mr-1" />
        Pro
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={className}>
      Free
    </Badge>
  );
}
