'use client';

import { useId } from 'react';

import type { ReactNode } from 'react';
import type { AnalyticsScope } from './types';

export function AnalyticsWorkspaceFrame({
  scope,
  controls,
  children,
}: Readonly<{
  scope: AnalyticsScope;
  controls?: ReactNode;
  children: ReactNode;
}>) {
  const headingId = useId();
  const groupName =
    scope.kind === 'group' ? scope.groupName.trim() || 'Group' : '';
  const title =
    scope.kind === 'personal' ? 'Personal analytics' : `${groupName} analytics`;
  const description =
    scope.kind === 'personal'
      ? 'See what changed, what needs attention, and what to do next.'
      : `See shared income, spending, and financial direction for ${groupName}.`;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full min-w-0 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-6"
    >
      <header className="flex flex-col gap-5 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <p className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-foreground">
            <span
              aria-hidden="true"
              className="h-3 w-1 rounded-full bg-primary"
            />
            <span>{scope.kind === 'personal' ? 'Personal scope' : 'Group scope'}</span>
          </p>
          {scope.kind === 'personal' ? (
            <h1
              id={headingId}
              className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h1>
          ) : (
            <h2
              id={headingId}
              className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
            >
              {title}
            </h2>
          )}
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            {description}
          </p>
        </div>
        {controls}
      </header>
      <div className="mt-5 min-w-0">{children}</div>
    </section>
  );
}
