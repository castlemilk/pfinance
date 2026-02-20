'use client';

import { ReactNode } from 'react';
import { useSubscription } from '../hooks/useSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Crown, Lock } from 'lucide-react';
import Link from 'next/link';

interface ProFeatureGateProps {
  children: ReactNode;
  feature?: string;
  fallback?: ReactNode;
  mode?: 'hide' | 'blur' | 'replace';
}

export function ProFeatureGate({
  children,
  feature = 'This feature',
  fallback,
  mode = 'replace',
}: ProFeatureGateProps) {
  const { hasProAccess, loading } = useSubscription();

  // Don't gate while subscription is still loading to avoid flicker
  if (loading || hasProAccess) {
    return <>{children}</>;
  }

  if (mode === 'hide') return null;

  if (mode === 'blur') {
    return (
      <div className="relative">
        <div className="blur-sm pointer-events-none select-none opacity-60">{children}</div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/30">
          <UpgradePrompt feature={feature} />
        </div>
      </div>
    );
  }

  return fallback ? <>{fallback}</> : <UpgradePrompt feature={feature} />;
}

export function UpgradePrompt({ feature, compact }: { feature: string; compact?: boolean }) {
  if (compact) {
    return (
      <Link href="/personal/billing/" className="inline-flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400 hover:underline">
        <Crown className="h-3.5 w-3.5" />
        Upgrade to unlock
      </Link>
    );
  }

  return (
    <Card className="border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-orange-500/5">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/20 p-3">
          <Crown className="h-6 w-6 text-amber-500" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold flex items-center gap-2 justify-center">
            <Lock className="h-4 w-4" />
            Pro Feature
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            {feature} requires a Pro subscription.
          </p>
        </div>
        <Link href="/personal/billing/">
          <Button size="sm" className="gap-2">
            <Crown className="h-4 w-4" />
            Upgrade to Pro
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
