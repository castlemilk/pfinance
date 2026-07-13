'use client';

import { useEffect, useRef } from 'react';
import {
  ChartNoAxesCombined,
  CircleAlert,
  Database,
  LayoutDashboard,
  Shapes,
  TrendingUp,
} from 'lucide-react';

import { TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { AnalyticsView } from './AnalyticsWorkspaceShell';

const VIEW_PRESENTATION = {
  overview: { label: 'Overview', Icon: LayoutDashboard },
  spending: { label: 'Spending', Icon: ChartNoAxesCombined },
  categories: { label: 'Categories', Icon: Shapes },
  attention: { label: 'Attention', Icon: CircleAlert },
  forecast: { label: 'Forecast', Icon: TrendingUp },
  'data-quality': { label: 'Data Quality', Icon: Database },
} as const satisfies Record<
  AnalyticsView,
  { readonly label: string; readonly Icon: typeof LayoutDashboard }
>;

type AnalyticsViewNavProps = {
  activeView: AnalyticsView;
  availableViews: readonly AnalyticsView[];
};

export function AnalyticsViewNav({
  activeView,
  availableViews,
}: AnalyticsViewNavProps) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<
    Partial<Record<AnalyticsView, HTMLButtonElement | null>>
  >({});

  useEffect(() => {
    const activeTrigger = triggerRefs.current[activeView];
    if (!activeTrigger) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
    const rail = railRef.current;

    if (rail) {
      const railBounds = rail.getBoundingClientRect();
      const triggerBounds = activeTrigger.getBoundingClientRect();
      const hasMeasurableGeometry =
        railBounds.width > 0 && triggerBounds.width > 0;

      if (hasMeasurableGeometry) {
        const leftOverflow = triggerBounds.left - railBounds.left;
        const rightOverflow = triggerBounds.right - railBounds.right;

        if (leftOverflow < 0 || rightOverflow > 0) {
          const edgePadding = 4;
          const delta =
            leftOverflow < 0
              ? leftOverflow - edgePadding
              : rightOverflow + edgePadding;
          const maxScrollLeft = Math.max(
            0,
            rail.scrollWidth - rail.clientWidth
          );
          const nextScrollLeft = Math.min(
            maxScrollLeft,
            Math.max(0, rail.scrollLeft + delta)
          );

          if (typeof rail.scrollTo === 'function') {
            rail.scrollTo({ left: nextScrollLeft, behavior });
          } else {
            rail.scrollLeft = nextScrollLeft;
          }
        }
        return;
      }
    }

    if (typeof activeTrigger.scrollIntoView !== 'function') return;

    activeTrigger.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
      behavior,
    });
  }, [activeView]);

  return (
    <nav
      aria-label="Analytics views"
      className="max-w-full overflow-hidden"
    >
      {availableViews.length > 0 ? (
        <TabsList
          ref={railRef}
          aria-label="Choose an analytics view"
          className="h-auto min-h-12 w-full max-w-full justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-[10px] border border-border bg-muted/50 p-1"
        >
          {availableViews.map((view) => {
            const { label, Icon } = VIEW_PRESENTATION[view];
            const isActive = view === activeView;

            return (
              <TabsTrigger
                key={view}
                ref={(node) => {
                  triggerRefs.current[view] = node;
                }}
                value={view}
                className="min-h-10 flex-none rounded-md px-3 text-sm normal-case tracking-normal transition-[color,background-color,border-color,box-shadow] duration-150 ease-out motion-reduce:transition-none"
                style={{
                  backgroundColor: isActive ? 'var(--card)' : 'transparent',
                  backgroundImage: 'none',
                  borderColor: isActive ? 'var(--border)' : 'transparent',
                  boxShadow: isActive
                    ? '0 1px 2px color-mix(in oklch, var(--foreground) 10%, transparent), inset 0 1px 0 color-mix(in oklch, var(--background) 70%, transparent)'
                    : 'none',
                  color: isActive
                    ? 'var(--foreground)'
                    : 'var(--muted-foreground)',
                  textShadow: 'none',
                }}
              >
                <Icon aria-hidden="true" className="size-4" />
                <span>{label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      ) : (
        <p className="text-pretty text-sm text-muted-foreground">
          No analytics views are available.
        </p>
      )}
    </nav>
  );
}
