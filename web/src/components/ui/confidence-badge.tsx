'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface ConfidenceBadgeProps {
  confidence: number;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * ConfidenceBadge displays a confidence score with color-coded visual feedback.
 *
 * Thresholds:
 * - Green (>= 0.8): High confidence
 * - Yellow (0.6 - 0.8): Low warning
 * - Red (< 0.6): Low confidence
 */
export function ConfidenceBadge({ confidence, label, size = 'sm', className }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);

  const colorClass =
    confidence >= 0.8
      ? 'bg-green-500/15 text-green-700 border-green-500/30 dark:text-green-400 dark:bg-green-500/10'
      : confidence >= 0.6
        ? 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30 dark:text-yellow-400 dark:bg-yellow-500/10'
        : 'bg-red-500/15 text-red-700 border-red-500/30 dark:text-red-400 dark:bg-red-500/10';

  const sizeClass = size === 'md' ? 'text-sm px-2.5 py-1' : 'text-xs px-1.5 py-0.5';

  return (
    <Badge
      variant="outline"
      className={cn(colorClass, sizeClass, className)}
    >
      {label ? `${label}: ` : ''}{percentage}%
    </Badge>
  );
}
