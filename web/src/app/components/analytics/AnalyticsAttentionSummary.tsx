import Link from 'next/link';

import type {
  AnalyticsCurrencyContext,
  PrimaryAnalyticsAttention,
} from './types';

type AnalyticsAttentionSummaryProps = Readonly<{
  primary: PrimaryAnalyticsAttention | null;
  anomalyCount: number;
  anomalousCents: number;
  coveredCategoryCount: number;
  uncoveredCategoryCount: number;
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
  attentionUrl: string | null;
}>;

const SEVERITY_STYLES = {
  low: 'text-muted-foreground',
  medium: 'text-chart-1',
  high: 'text-destructive',
} as const;

function severityLabel(severity: PrimaryAnalyticsAttention['severity']) {
  return `${severity.charAt(0).toUpperCase()}${severity.slice(1)} severity`;
}

function safeAnomalyCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function safeCategoryCount(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function formattedAnomalousSpend(
  cents: number,
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  if (!Number.isSafeInteger(cents) || cents < 0) {
    return 'Not available';
  }
  return formatMoney(cents / 100);
}

function noPrimaryCopy(
  anomalyCount: number,
  coveredCount: number,
  uncoveredCount: number
) {
  if (anomalyCount > 0) {
    return {
      title: 'Flagged spending needs review',
      description:
        uncoveredCount > 0
          ? `${anomalyCount} transactions were flagged in assessed categories; ${uncoveredCount} categories still need history.`
          : `${anomalyCount} transactions were flagged, but no primary item was supplied.`,
    };
  }

  if (uncoveredCount > 0) {
    return {
      title: 'Assessment is incomplete',
      description: `${coveredCount} ${
        coveredCount === 1 ? 'category was' : 'categories were'
      } assessed with zero flags; ${uncoveredCount} ${
        uncoveredCount === 1 ? 'category still needs' : 'categories still need'
      } history.`,
    };
  }

  if (coveredCount > 0) {
    return {
      title: 'No flagged spending',
      description:
        'No unusual transactions were flagged in categories with enough history.',
    };
  }

  return {
    title: 'Spending checks need more history',
    description:
      'No category has enough history for a reliable spending check yet.',
  };
}

export function AnalyticsAttentionSummary({
  primary,
  anomalyCount,
  anomalousCents,
  coveredCategoryCount,
  uncoveredCategoryCount,
  formatMoney,
  attentionUrl,
}: AnalyticsAttentionSummaryProps) {
  const safeCount = safeAnomalyCount(anomalyCount);
  const safeCoveredCount = safeCategoryCount(coveredCategoryCount);
  const safeUncoveredCount = safeCategoryCount(uncoveredCategoryCount);
  const anomalousSpend = formattedAnomalousSpend(anomalousCents, formatMoney);

  if (!primary) {
    const copy = noPrimaryCopy(
      safeCount,
      safeCoveredCount,
      safeUncoveredCount
    );
    return (
      <section
        aria-labelledby="analytics-attention-title"
        className="rounded-[10px] bg-muted/40 p-4"
      >
        <h3
          id="analytics-attention-title"
          className="text-balance text-base font-semibold text-foreground"
        >
          {copy.title}
        </h3>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
          {copy.description}
        </p>
        {safeCount > 0 ? (
          <p className="mt-3 text-sm font-medium tabular-nums text-foreground">
            {anomalousSpend} flagged
          </p>
        ) : null}
      </section>
    );
  }

  const primaryAmount = Number.isFinite(primary.amount)
    ? formatMoney(primary.amount)
    : 'Not available';
  const countLabel = `${safeCount} flagged ${
    safeCount === 1 ? 'transaction' : 'transactions'
  }`;

  return (
    <section
      aria-labelledby="analytics-attention-title"
      className="rounded-[10px] bg-muted/40 p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-xs font-semibold ${SEVERITY_STYLES[primary.severity]}`}
          >
            {severityLabel(primary.severity)}
          </p>
          <h3
            id="analytics-attention-title"
            className="mt-1 text-balance text-base font-semibold text-foreground"
          >
            {primary.description}
          </h3>
        </div>
        <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
          {primaryAmount}
        </p>
      </div>

      <p className="mt-3 text-pretty text-sm leading-relaxed text-foreground">
        {primary.reason}
      </p>
      {primary.expectedContext ? (
        <p className="mt-1 text-pretty text-xs leading-relaxed text-muted-foreground">
          {primary.expectedContext}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <div className="text-xs text-muted-foreground">
          <span className="tabular-nums">{countLabel}</span>
          <span aria-hidden="true"> · </span>
          <span className="tabular-nums">{anomalousSpend} flagged</span>
        </div>
        {attentionUrl ? (
          <Link
            href={attentionUrl}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-primary outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Review expense
          </Link>
        ) : null}
      </div>
    </section>
  );
}
