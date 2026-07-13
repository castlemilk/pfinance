'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import * as SliderPrimitive from '@radix-ui/react-slider';

import LazyAnomalyScatterPlot from '@/app/components/charts/LazyAnomalyScatterPlot';
import { normalizeAnomalyPoints } from '@/app/components/charts/anomalyChartModels';
import { useAnomalies } from '@/app/metrics/hooks/useAnalyticsData';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import {
  AnalyticsChartSkeleton,
  AnalyticsErrorState,
  AnalyticsInsufficientState,
} from '../AnalyticsStates';
import { buildAnalyticsExpenseUrl } from '../links';
import { getAnalyticsPeriodConfig } from '../periods';

import type { AnomalyPoint, AnalyticsAnomalyCoverage } from '@/app/metrics/types';
import type {
  AnalyticsCurrencyContext,
  AnalyticsScope,
  AnalyticsViewProps,
} from '../types';

const DEFAULT_SENSITIVITY = 0.5;

function clampSensitivity(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_SENSITIVITY;
  return Math.min(1, Math.max(0.1, value as number));
}

function normalizeCoverage(
  source: readonly AnalyticsAnomalyCoverage[]
): AnalyticsAnomalyCoverage[] {
  const byCategory = new Map<string, AnalyticsAnomalyCoverage>();
  for (const coverage of source) {
    const category = coverage.category.trim() || 'Uncategorised';
    const identity = category.toLowerCase();
    const sampleCount = Number.isFinite(coverage.sampleCount)
      ? Math.max(0, Math.trunc(coverage.sampleCount))
      : 0;
    const existing = byCategory.get(identity);
    byCategory.set(identity, {
      category: existing?.category ?? category,
      sampleCount:
        existing === undefined
          ? sampleCount
          : Math.min(existing.sampleCount, sampleCount),
      hasSufficientHistory:
        (existing?.hasSufficientHistory ?? true) &&
        coverage.hasSufficientHistory === true,
    });
  }
  return [...byCategory.values()];
}

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function humanizeReason(reason: string): string {
  const words = reason
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
  return words || 'Unusual pattern';
}

function expectedRangeCopy(
  point: AnomalyPoint,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  return point.hasExpectedRange
    ? `Expected ${formatMoney(point.expectedLowerAmount)}–${formatMoney(
        point.expectedUpperAmount
      )}`
    : `${humanizeReason(point.anomalyType)}; no expected amount range applies.`;
}

function CoverageSummary({
  coverage,
  minimumSample,
}: Readonly<{
  coverage: readonly AnalyticsAnomalyCoverage[];
  minimumSample: number;
}>) {
  const headingId = useId();
  const covered = coverage.filter((item) => item.hasSufficientHistory);
  const uncovered = coverage.filter((item) => !item.hasSufficientHistory);
  const safeMinimum = Number.isFinite(minimumSample)
    ? Math.max(0, Math.trunc(minimumSample))
    : 0;

  return (
    <section
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3
        id={headingId}
        className="text-balance text-lg font-semibold text-foreground"
      >
        Anomaly coverage
      </h3>
      {coverage.length === 0 ? (
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          Coverage details were not reported, so no conclusion can be made
          about categories that may need more history.
        </p>
      ) : (
        <p className="mt-2 text-pretty text-sm text-muted-foreground">
          <span className="tabular-nums">{covered.length}</span> of{' '}
          <span className="tabular-nums">{coverage.length}</span> categories
          assessed. Minimum sample{' '}
          <span className="tabular-nums">{safeMinimum}</span>{' '}
          {plural(safeMinimum, 'transaction')} per category.
        </p>
      )}
      {uncovered.length > 0 ? (
        <ul
          aria-label="Categories needing more anomaly history"
          className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2"
        >
          {uncovered.map((item, index) => (
            <li
              key={`${item.category}:${item.sampleCount}:${index}`}
              className="rounded-[10px] bg-muted/40 px-3 py-2"
            >
              <span className="font-medium text-foreground">{item.category}</span>{' '}
              · <span className="tabular-nums">{item.sampleCount}</span>{' '}
              {plural(item.sampleCount, 'transaction')}
            </li>
          ))}
        </ul>
      ) : coverage.length > 0 ? (
        <p className="mt-3 text-pretty text-sm text-muted-foreground">
          No under-sampled category was reported for this result.
        </p>
      ) : null}
    </section>
  );
}

function QualifiedZeroState({
  coverage,
}: Readonly<{ coverage: readonly AnalyticsAnomalyCoverage[] }>) {
  const covered = coverage.filter((item) => item.hasSufficientHistory);
  const uncovered = coverage.filter((item) => !item.hasSufficientHistory);

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h2 className="text-balance text-xl font-semibold text-foreground">
        No unusual spending was flagged
      </h2>
      <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
        This conclusion applies only to{' '}
        <span className="tabular-nums">{covered.length}</span> covered{' '}
        {plural(covered.length, 'category', 'categories')}.
      </p>
      {uncovered.length > 0 ? (
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          <span className="tabular-nums">{uncovered.length}</span>{' '}
          {plural(uncovered.length, 'category', 'categories')} still needs more
          history: {uncovered
            .map(
              (item) =>
                `${item.category} (${item.sampleCount} ${plural(
                  item.sampleCount,
                  'transaction'
                )})`
            )
            .join(', ')}.
        </p>
      ) : coverage.length > 0 ? (
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Every reported category met the current minimum sample.
        </p>
      ) : (
        <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
          Coverage details were not reported, so this result does not support a
          broader conclusion.
        </p>
      )}
    </section>
  );
}

function AnomalyRow({
  point,
  scope,
  currency,
  index,
}: Readonly<{
  point: AnomalyPoint;
  scope: AnalyticsScope;
  currency: AnalyticsCurrencyContext;
  index: number;
}>) {
  const expenseId = point.expenseId.trim();
  const href = expenseId
    ? buildAnalyticsExpenseUrl(scope, { expenseId })
    : null;

  return (
    <li className="rounded-[10px] border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h4 className="text-balance text-sm font-semibold text-foreground">
              {point.description}
            </h4>
            <span className="tabular-nums text-sm font-semibold text-foreground">
              {currency.formatMoney(point.amount)}
            </span>
          </div>
          <p className="mt-1 text-pretty text-xs text-muted-foreground">
            {point.category} ·{' '}
            {currency.formatDate(point.date, {
              dateStyle: 'medium',
              timeZone: 'UTC',
            })}{' '}
            · {point.severity} severity
          </p>
          <p className="mt-2 text-pretty text-xs text-muted-foreground">
            Reason: {humanizeReason(point.anomalyType)} · Z-score{' '}
            <span className="tabular-nums">{point.zScore.toFixed(2)}</span>
          </p>
          <p className="mt-2 text-pretty text-xs tabular-nums text-muted-foreground">
            {expectedRangeCopy(point, currency.formatMoney)}
          </p>
        </div>
        {href ? (
          <Link
            href={href}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Review {point.description}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md border border-border px-3 text-xs font-semibold text-muted-foreground"
          >
            Review {point.description}
          </span>
        )}
      </div>
      <span className="sr-only">Evidence row {index + 1}</span>
    </li>
  );
}

function AttentionHeader({
  scope,
  visualSensitivity,
  onPreviewSensitivity,
  onCommitSensitivity,
}: Readonly<{
  scope: AnalyticsScope;
  visualSensitivity: number;
  onPreviewSensitivity: (value: number | undefined) => void;
  onCommitSensitivity: (value: number | undefined) => void;
}>) {
  const sensitivityLabelId = useId();
  const scopeLabel =
    scope.kind === 'group' ? scope.groupName.trim() || 'Group' : 'Your finances';

  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-primary">{scopeLabel}</p>
        {scope.kind === 'group' ? (
          <h3 className="mt-1 text-balance text-2xl font-semibold text-foreground">
            Spending attention
          </h3>
        ) : (
          <h2 className="mt-1 text-balance text-2xl font-semibold text-foreground">
            Spending attention
          </h2>
        )}
        <p className="mt-2 max-w-2xl text-pretty text-sm text-muted-foreground">
          Review statistically unusual expenses without treating under-sampled
          categories as normal.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-[10px] border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <label
            id={sensitivityLabelId}
            className="text-sm font-semibold text-foreground"
          >
            Sensitivity
          </label>
          <output className="tabular-nums text-sm font-semibold text-foreground">
            {visualSensitivity.toFixed(1)}
          </output>
        </div>
        <SliderPrimitive.Root
          value={[visualSensitivity]}
          min={0.1}
          max={1}
          step={0.1}
          onValueChange={(value) => onPreviewSensitivity(value[0])}
          onValueCommit={(value) => onCommitSensitivity(value[0])}
          className="relative mt-4 flex min-h-10 w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-labelledby={sensitivityLabelId}
            aria-valuetext={`${visualSensitivity.toFixed(1)} sensitivity`}
            className="block size-5 rounded-full border border-primary bg-background shadow-sm outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:scale-110 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
          />
        </SliderPrimitive.Root>
        <p className="mt-2 text-pretty text-xs text-muted-foreground">
          Changes are applied when you finish adjusting the control.
        </p>
      </div>
    </header>
  );
}

function AttentionAnalyticsViewInner({
  scope,
  period,
  currency,
}: AnalyticsViewProps) {
  const chartHeadingId = useId();
  const listHeadingId = useId();
  const [visualSensitivity, setVisualSensitivity] = useState(
    DEFAULT_SENSITIVITY
  );
  const [committedSensitivity, setCommittedSensitivity] = useState(
    DEFAULT_SENSITIVITY
  );
  const lookbackDays = getAnalyticsPeriodConfig(period).anomalyLookbackDays;
  const anomalies = useAnomalies(lookbackDays, committedSensitivity, scope);
  const coverage = useMemo(
    () => normalizeCoverage(anomalies.categoryCoverage),
    [anomalies.categoryCoverage]
  );
  const points = useMemo(
    () => normalizeAnomalyPoints(anomalies.data ?? []),
    [anomalies.data]
  );
  const displayedTotal = useMemo(
    () => points.reduce((total, point) => total + point.amount, 0),
    [points]
  );
  const tableRows = useMemo(
    () =>
      points.map((point) => [
        point.description,
        currency.formatDate(point.date, {
          dateStyle: 'medium',
          timeZone: 'UTC',
        }),
        currency.formatMoney(point.amount),
        point.category,
        point.severity,
        humanizeReason(point.anomalyType),
        point.zScore.toFixed(2),
        expectedRangeCopy(point, currency.formatMoney),
      ]),
    [currency, points]
  );

  if (anomalies.error) {
    return (
      <AnalyticsErrorState
        message={anomalies.error}
        onRetry={() => void anomalies.refetch()}
      />
    );
  }
  if (anomalies.loading || anomalies.data === null) {
    return <AnalyticsChartSkeleton label="Loading spending attention" />;
  }
  const header = (
    <AttentionHeader
      scope={scope}
      visualSensitivity={visualSensitivity}
      onPreviewSensitivity={(value) =>
        setVisualSensitivity(clampSensitivity(value))
      }
      onCommitSensitivity={(value) => {
        const committed = clampSensitivity(value);
        setVisualSensitivity(committed);
        setCommittedSensitivity(committed);
      }}
    />
  );
  if (points.length === 0 && !anomalies.hasSufficientHistory) {
    return (
      <div className="space-y-5">
        {header}
        <AnalyticsInsufficientState
          title="More history is needed for anomaly detection"
          coveredCategories={coverage
            .filter((item) => item.hasSufficientHistory)
            .map((item) => item.category)}
          uncoveredCategories={coverage
            .filter((item) => !item.hasSufficientHistory)
            .map((item) => item.category)}
        />
      </div>
    );
  }
  if (points.length === 0) {
    return (
      <div className="space-y-5">
        {header}
        <QualifiedZeroState coverage={coverage} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <CoverageSummary
        coverage={coverage}
        minimumSample={anomalies.minimumSample}
      />

      <figure
        aria-labelledby={chartHeadingId}
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <figcaption className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3
              id={chartHeadingId}
              className="text-balance text-lg font-semibold text-foreground"
            >
              Flagged spending patterns
            </h3>
            <p className="mt-1 text-pretty text-sm text-muted-foreground">
              Each expense contributes once, using its strongest anomaly reason.
            </p>
          </div>
          <dl className="shrink-0 text-left sm:text-right">
            <dt className="text-xs font-medium text-muted-foreground">
              Flagged total
            </dt>
            <dd className="mt-1 tabular-nums text-lg font-semibold text-foreground">
              {currency.formatMoney(displayedTotal)}
            </dd>
          </dl>
        </figcaption>
        <div className="mt-4 h-[360px] min-w-0 overflow-hidden rounded-[10px] bg-muted/20 p-2">
          <LazyAnomalyScatterPlot
            data={points}
            formatMoney={currency.formatMoney}
            formatDate={currency.formatDate}
          />
        </div>
        <div className="mt-3">
          <AccessibleDataSummary
            caption="Flagged spending anomaly evidence"
            columns={[
              'Expense',
              'Date',
              'Amount',
              'Category',
              'Severity',
              'Reason',
              'Z-score',
              'Expected range',
            ]}
            rows={tableRows}
          />
        </div>
      </figure>

      <section
        aria-labelledby={listHeadingId}
        className="rounded-2xl border border-border bg-card p-5 shadow-sm"
      >
        <h3
          id={listHeadingId}
          className="text-balance text-lg font-semibold text-foreground"
        >
          Expenses to review
        </h3>
        <p className="mt-1 text-pretty text-sm text-muted-foreground">
          Open the exact scoped expense when a stable identifier is available.
        </p>
        <ol className="mt-4 space-y-3">
          {points.map((point, index) => (
            <AnomalyRow
              key={`${point.expenseId || point.id || 'anomaly'}:${index}`}
              point={point}
              scope={scope}
              currency={currency}
              index={index}
            />
          ))}
        </ol>
      </section>
    </div>
  );
}

function viewKey({ scope, period }: AnalyticsViewProps): string {
  const scopeIdentity =
    scope.kind === 'group' ? `group:${scope.groupId}` : 'personal';
  return `${scopeIdentity}:${period}`;
}

export function AttentionAnalyticsView(props: AnalyticsViewProps) {
  return <AttentionAnalyticsViewInner key={viewKey(props)} {...props} />;
}
