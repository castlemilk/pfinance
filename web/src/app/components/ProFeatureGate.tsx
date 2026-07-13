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
  headingLevel?: UpgradePromptHeadingLevel;
}

type UpgradePromptHeadingLevel = 2 | 3 | 4;

type UpgradePromptProps = {
  feature: string;
  compact?: boolean;
  headingLevel?: UpgradePromptHeadingLevel;
};

const HEADING_TAGS = {
  2: 'h2',
  3: 'h3',
  4: 'h4',
} as const;

export function ProFeatureGate({
  children,
  feature = 'This feature',
  fallback,
  mode = 'replace',
  headingLevel = 3,
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
          <UpgradePrompt feature={feature} headingLevel={headingLevel} />
        </div>
      </div>
    );
  }

  return fallback ? (
    <>{fallback}</>
  ) : (
    <UpgradePrompt feature={feature} headingLevel={headingLevel} />
  );
}

export function UpgradePrompt({
  feature,
  compact,
  headingLevel = 3,
}: UpgradePromptProps) {
  if (compact) {
    return (
      <Link
        href="/personal/billing/"
        className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-sm font-semibold text-foreground underline decoration-primary/50 underline-offset-4 outline-none transition-[color,box-shadow,transform] duration-150 ease-out hover:decoration-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Crown aria-hidden="true" className="h-3.5 w-3.5" />
        Upgrade to unlock
      </Link>
    );
  }

  const Heading = HEADING_TAGS[headingLevel];

  return (
    <Card className="rounded-2xl border-primary/20 bg-primary/[0.04]">
      <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
        <div
          aria-hidden="true"
          className="rounded-[10px] bg-primary/10 p-3 shadow-sm"
        >
          <Crown className="h-6 w-6 text-foreground" />
        </div>
        <div className="space-y-1">
          <Heading className="flex items-center justify-center gap-2 text-balance text-base font-semibold text-foreground">
            <Lock aria-hidden="true" className="h-4 w-4" />
            Pro feature
          </Heading>
          <p className="max-w-sm text-pretty text-sm text-muted-foreground">
            {feature} requires a Pro subscription.
          </p>
        </div>
        <Button
          asChild
          size="sm"
          className="min-h-10 gap-2 transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <Link href="/personal/billing/">
            <Crown className="h-4 w-4" />
            Upgrade to Pro
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
