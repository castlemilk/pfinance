'use client';

import { useMemo } from 'react';
import Link from 'next/link';

import { analyticsTimestampDate } from '@/app/metrics/analyticsMappers';
import { useExtractionMetrics } from '@/app/metrics/hooks/useExtractionMetrics';
import { Button } from '@/components/ui/button';
import {
  DocumentType,
  ExtractionMethod,
} from '@/gen/pfinance/v1/types_pb';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import {
  AnalyticsChartSkeleton,
  AnalyticsErrorState,
} from '../AnalyticsStates';

import type { ExtractionEvent } from '@/gen/pfinance/v1/types_pb';
import type {
  AnalyticsCurrencyContext,
  AnalyticsPeriod,
  AnalyticsViewProps,
} from '../types';

const IMPORT_DESTINATION = '/personal/expenses#smart-expense-entry';
const PERIOD_DAYS: Readonly<Record<AnalyticsPeriod, 30 | 90 | 365>> =
  Object.freeze({
    month: 30,
    quarter: 90,
    year: 365,
  });

type NormalizedEvent = {
  readonly key: string;
  readonly documentLabel: string;
  readonly dateLabel: string;
  readonly transactionCount: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly correctedCount: number;
  readonly confidenceLabel: string;
  readonly processingTimeLabel: string;
  readonly methodLabel: string;
};

type CorrectionEntry = {
  readonly key: string;
  readonly label: string;
  readonly count: number;
};

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function boundedRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function numberFormatter(locale: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
  }
}

function percentFormatter(locale: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  } catch {
    return new Intl.NumberFormat('en-AU', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  }
}

function documentLabel(type: DocumentType): string {
  switch (type) {
    case DocumentType.RECEIPT:
      return 'Receipt';
    case DocumentType.BANK_STATEMENT:
      return 'Bank statement';
    case DocumentType.INVOICE:
      return 'Invoice';
    default:
      return 'Document';
  }
}

function extractionMethodLabel(method: ExtractionMethod): string {
  switch (method) {
    case ExtractionMethod.GEMINI:
      return 'Gemini';
    case ExtractionMethod.SELF_HOSTED:
      return 'Gemini (legacy request)';
    default:
      return 'Default extraction';
  }
}

function humanizeMetricKey(value: string, prefix: string): string {
  const normalized = value
    .trim()
    .replace(prefix, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();

  if (!normalized) return 'Other';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function correctionEntries(
  values: Readonly<Record<string, number>>,
  prefix: string
): readonly CorrectionEntry[] {
  return Object.entries(values)
    .map(([key, value]) => ({
      key,
      label: humanizeMetricKey(key, prefix),
      count: nonNegativeInteger(value),
    }))
    .filter((entry) => entry.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label)
    );
}

function normalizeEvent(
  event: ExtractionEvent,
  index: number,
  currency: AnalyticsCurrencyContext,
  formatCount: Intl.NumberFormat,
  formatPercent: Intl.NumberFormat
): NormalizedEvent {
  const label = documentLabel(event.documentType);
  const date = analyticsTimestampDate(event.createdAt);
  const dateLabel = date
    ? currency.formatDate(date, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : 'Date unavailable';
  const processingTime = Number.isFinite(event.processingTimeMs)
    ? `${formatCount.format(nonNegativeInteger(event.processingTimeMs))} ms`
    : 'Not available';

  return Object.freeze({
    key: `${event.id.trim() || 'unidentified'}:${index}`,
    documentLabel: label,
    dateLabel,
    transactionCount: nonNegativeInteger(event.transactionCount),
    acceptedCount: nonNegativeInteger(event.acceptedCount),
    rejectedCount: nonNegativeInteger(event.rejectedCount),
    correctedCount: nonNegativeInteger(event.correctedCount),
    confidenceLabel: formatPercent.format(
      boundedRatio(event.overallConfidence)
    ),
    processingTimeLabel: processingTime,
    methodLabel: extractionMethodLabel(event.method),
  });
}

function Metric({
  label,
  value,
  description,
}: Readonly<{ label: string; value: string; description: string }>) {
  return (
    <div className="min-w-0 rounded-[10px] bg-muted/40 p-4">
      <dt className="text-pretty text-xs font-medium text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-2 break-words font-mono text-2xl font-semibold tabular-nums text-foreground">
        {value}
      </dd>
      <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function CorrectionBreakdown({
  title,
  entries,
  formatCount,
}: Readonly<{
  title: string;
  entries: readonly CorrectionEntry[];
  formatCount: Intl.NumberFormat;
}>) {
  if (entries.length === 0) return null;
  const maximum = entries[0]?.count ?? 0;

  return (
    <section className="min-w-0 rounded-[10px] border border-border bg-background p-4">
      <h4 className="text-balance text-sm font-semibold text-foreground">
        {title}
      </h4>
      <ol className="mt-3 space-y-3">
        {entries.map((entry) => (
          <li key={entry.key} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 break-words text-muted-foreground">
                {entry.label}
              </span>
              <span className="shrink-0 font-mono font-semibold tabular-nums text-foreground">
                {formatCount.format(entry.count)}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{
                  width: `${maximum > 0 ? (entry.count / maximum) * 100 : 0}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExtractionEventCard({ event }: Readonly<{ event: NormalizedEvent }>) {
  return (
    <article
      aria-label={`${event.documentLabel} extraction from ${event.dateLabel}`}
      className="min-w-0 rounded-[10px] border border-border bg-background p-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h4 className="text-balance text-sm font-semibold text-foreground">
            {event.documentLabel} extraction
          </h4>
          <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
            {event.dateLabel}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 font-mono tabular-nums sm:grid-cols-5">
        {[
          ['Transactions', event.transactionCount],
          ['Accepted', event.acceptedCount],
          ['Rejected', event.rejectedCount],
          ['Corrected', event.correctedCount],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm font-semibold text-foreground">
              {value}
            </dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Confidence</dt>
          <dd className="mt-1 break-words text-sm font-semibold text-foreground">
            {event.confidenceLabel}
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-pretty text-xs text-muted-foreground">
        {event.methodLabel}, processing time{' '}
        <span className="font-mono tabular-nums">{event.processingTimeLabel}</span>
      </p>
    </article>
  );
}

function ExtractionEmptyState() {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-balance text-xl font-semibold text-foreground">
        No extraction history for this period
      </h3>
      <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
        No receipts or statements were imported in this analytics period, so
        there is no extraction quality to review yet.
      </p>
      <Button
        asChild
        variant="outline"
        size="lg"
        className="mt-5 min-h-10 normal-case tracking-normal transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Link href={IMPORT_DESTINATION}>Import a receipt or statement</Link>
      </Button>
    </section>
  );
}

function PersonalDataQualityAnalyticsView({
  period,
  currency,
}: Readonly<Pick<AnalyticsViewProps, 'period' | 'currency'>>) {
  const metrics = useExtractionMetrics(PERIOD_DAYS[period]);
  const formatCount = useMemo(
    () => numberFormatter(currency.locale),
    [currency.locale]
  );
  const formatPercent = useMemo(
    () => percentFormatter(currency.locale),
    [currency.locale]
  );

  if (metrics.loading || (!metrics.error && metrics.data === null)) {
    return <AnalyticsChartSkeleton label="Loading data quality analytics" />;
  }
  if (metrics.error) {
    return (
      <AnalyticsErrorState
        message={metrics.error}
        onRetry={() => void metrics.refetch()}
      />
    );
  }

  const data = metrics.data;
  if (!data || nonNegativeInteger(data.totalExtractions) === 0) {
    return (
      <div className="space-y-5">
        <header className="flex flex-col gap-2">
          <p className="inline-flex border-l-2 border-primary pl-2 text-sm font-medium text-foreground">
            Your imports
          </p>
          <h2 className="text-balance text-2xl font-semibold text-foreground">
            Data quality
          </h2>
          <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
            See where imported transactions needed review and what to check next.
          </p>
        </header>
        <ExtractionEmptyState />
      </div>
    );
  }

  const fieldCorrections = correctionEntries(
    data.correctionsByField,
    'CORRECTION_FIELD_TYPE_'
  );
  const categoryCorrections = correctionEntries(
    data.correctionsByCategory,
    'EXPENSE_CATEGORY_'
  );
  const events = data.recentEvents
    .slice(0, 10)
    .map((event, index) =>
      normalizeEvent(event, index, currency, formatCount, formatPercent)
    );
  const eventRows = events.map((event) => [
    event.documentLabel,
    event.dateLabel,
    formatCount.format(event.transactionCount),
    formatCount.format(event.acceptedCount),
    formatCount.format(event.rejectedCount),
    formatCount.format(event.correctedCount),
    event.confidenceLabel,
    event.processingTimeLabel,
  ]);

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2">
        <p className="inline-flex border-l-2 border-primary pl-2 text-sm font-medium text-foreground">
          Your imports
        </p>
        <h2 className="text-balance text-2xl font-semibold text-foreground">
          Data quality
        </h2>
        <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
          See where imported transactions needed review and what to check next.
        </p>
      </header>

      <section
        aria-labelledby="review-quality-heading"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <h3
          id="review-quality-heading"
          className="text-balance text-lg font-semibold text-foreground"
        >
          Review quality
        </h3>
        <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
          Corrections and review outcomes lead this view; model confidence adds
          context rather than replacing human review.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric
            label="Correction rate"
            value={formatPercent.format(boundedRatio(data.correctionRate))}
            description="Share of extracted transactions with a recorded correction."
          />
          <Metric
            label="Corrections recorded"
            value={formatCount.format(nonNegativeInteger(data.totalCorrections))}
            description="Changes saved after reviewing imported data."
          />
          <Metric
            label="Transactions extracted"
            value={formatCount.format(nonNegativeInteger(data.totalTransactions))}
            description="Transactions included in this quality window."
          />
          <Metric
            label="Average confidence"
            value={formatPercent.format(boundedRatio(data.averageConfidence))}
            description="Model confidence before any human correction."
          />
        </dl>

        {fieldCorrections.length > 0 || categoryCorrections.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <CorrectionBreakdown
              title="Fields needing correction"
              entries={fieldCorrections}
              formatCount={formatCount}
            />
            <CorrectionBreakdown
              title="Corrected categories"
              entries={categoryCorrections}
              formatCount={formatCount}
            />
          </div>
        ) : (
          <p className="mt-4 rounded-[10px] bg-muted/40 p-4 text-pretty text-sm text-muted-foreground">
            No field or category correction breakdown was reported for this period.
          </p>
        )}
      </section>

      <section
        aria-labelledby="recent-extraction-reviews-heading"
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3
              id="recent-extraction-reviews-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Recent extraction reviews
            </h3>
            <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
              Outcome counts show what was accepted, rejected, or corrected.
              Processing time is retained as secondary technical context.
            </p>
          </div>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="min-h-10 shrink-0 normal-case tracking-normal transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            <Link href={IMPORT_DESTINATION}>Open import tools</Link>
          </Button>
        </div>

        {events.length > 0 ? (
          <>
            <div className="mt-4 space-y-3">
              {events.map((event) => (
                <ExtractionEventCard key={event.key} event={event} />
              ))}
            </div>
            <div className="mt-4">
              <AccessibleDataSummary
                caption="Recent extraction review details"
                columns={[
                  'Document',
                  'Date',
                  'Transactions',
                  'Accepted',
                  'Rejected',
                  'Corrected',
                  'Confidence',
                  'Processing time',
                ]}
                rows={eventRows}
              />
            </div>
          </>
        ) : (
          <p className="mt-4 rounded-[10px] bg-muted/40 p-4 text-pretty text-sm text-muted-foreground">
            No recent extraction detail was returned for this period.
          </p>
        )}
      </section>
    </div>
  );
}

export function DataQualityAnalyticsView(props: AnalyticsViewProps) {
  if (props.scope.kind !== 'personal') return null;

  return (
    <PersonalDataQualityAnalyticsView
      period={props.period}
      currency={props.currency}
    />
  );
}
