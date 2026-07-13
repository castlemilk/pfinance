'use client';

import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  hasAnalyticsExpenseFilters,
  normalizeAnalyticsExpenseFilters,
  type AnalyticsExpenseFilters,
} from '@/app/utils/analyticsExpenseFilters';

type AnalyticsExpenseFilterSummaryProps = {
  filters: AnalyticsExpenseFilters;
  onClear: () => void;
};

function formatUtcCalendarDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  const month = new Intl.DateTimeFormat('en-AU', {
    month: 'long',
    timeZone: 'UTC',
  })
    .format(date)
    .slice(0, 3);

  return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
}

function formatCategory(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function AnalyticsExpenseFilterSummary({
  filters,
  onClear,
}: AnalyticsExpenseFilterSummaryProps) {
  const normalizedFilters = normalizeAnalyticsExpenseFilters(filters);
  if (!hasAnalyticsExpenseFilters(normalizedFilters)) {
    return null;
  }

  const range =
    normalizedFilters.from && normalizedFilters.to
      ? `${formatUtcCalendarDate(normalizedFilters.from)} to ${formatUtcCalendarDate(normalizedFilters.to)}`
      : normalizedFilters.from
        ? `From ${formatUtcCalendarDate(normalizedFilters.from)}`
        : normalizedFilters.to
          ? `Through ${formatUtcCalendarDate(normalizedFilters.to)}`
          : null;

  return (
    <section
      role="region"
      aria-label="Active analytics filters"
      className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/[0.04] p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-5 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
        {normalizedFilters.date ? (
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Date</dt>
            <dd className="tabular-nums text-foreground">
              {formatUtcCalendarDate(normalizedFilters.date)}
            </dd>
          </div>
        ) : null}
        {normalizedFilters.category ? (
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Category
            </dt>
            <dd className="text-foreground">
              {formatCategory(normalizedFilters.category)}
            </dd>
          </div>
        ) : null}
        {range ? (
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">Range</dt>
            <dd className="tabular-nums text-foreground">{range}</dd>
          </div>
        ) : null}
        {normalizedFilters.expenseId ? (
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Focused expense
            </dt>
            <dd className="break-all font-mono text-foreground">
              {normalizedFilters.expenseId}
            </dd>
          </div>
        ) : null}
      </dl>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-10 shrink-0 transition-transform active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
        aria-label="Clear analytics filters"
        onClick={onClear}
      >
        <X aria-hidden="true" className="h-4 w-4" />
        Clear filters
      </Button>
    </section>
  );
}
