/**
 * SettingsSection - Reusable accordion section wrapper
 * 
 * Provides consistent styling for all settings sections with:
 * - Active state highlighting (amber border)
 * - Edit button styling
 * - Summary display when collapsed
 */

'use client';

import { ReactNode } from 'react';
import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
  id: string;
  title: string;
  summary?: string;
  isActive: boolean;
  children: ReactNode;
  badge?: string;
}

export function SettingsSection({
  id,
  title,
  summary,
  isActive,
  children,
  badge,
}: SettingsSectionProps) {
  return (
    <AccordionItem
      value={id}
      className={cn(
        'rounded-lg border px-4 transition-colors',
        isActive 
          ? 'border-amber-500/50 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-950/20' 
          : 'border-border bg-background'
      )}
    >
      <AccordionTrigger className="hover:no-underline py-3">
        <div className="flex items-center gap-3 flex-1">
          <span className="font-medium">{title}</span>
          {isActive && (
            <Badge 
              variant="outline" 
              className="bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700 text-xs"
            >
              Active
            </Badge>
          )}
          {badge && !isActive && (
            <Badge variant="secondary" className="text-xs">
              {badge}
            </Badge>
          )}
        </div>
        {summary && (
          <span className="text-sm text-muted-foreground mr-4 hidden sm:block">
            {summary}
          </span>
        )}
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}
