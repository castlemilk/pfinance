'use client';

import LazyCashFlowForecast from '@/app/components/charts/LazyCashFlowForecast';
import { useCashFlowForecast } from '@/app/metrics/hooks/useAnalyticsData';
import type {
  ForecastHistoryPoint,
  ForecastSeries,
} from '@/app/metrics/types';

import { AccessibleDataSummary } from '../AccessibleDataSummary';
import {
  AnalyticsChartSkeleton,
  AnalyticsErrorState,
} from '../AnalyticsStates';
import { getAnalyticsPeriodConfig } from '../periods';

import type {
  AnalyticsCurrencyContext,
  AnalyticsViewProps,
} from '../types';

type ForecastTableRow = readonly [
  phase: 'History' | 'Forecast',
  series: 'Income' | 'Expenses' | 'Net',
  date: string,
  value: string,
  range: string,
];

type ForecastTableEntry = {
  readonly sortDate: number;
  readonly row: ForecastTableRow;
};

function sortDate(value: Date | string): number {
  const milliseconds =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : Number.MAX_SAFE_INTEGER;
}

function formattedDate(
  value: Date | string,
  currency: AnalyticsCurrencyContext
): string {
  return currency.formatDate(value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function historyRows(
  series: 'Income' | 'Expenses',
  points: readonly ForecastHistoryPoint[],
  currency: AnalyticsCurrencyContext
): ForecastTableEntry[] {
  return points.map((point) => ({
    sortDate: sortDate(point.date),
    row: [
      'History',
      series,
      formattedDate(point.date, currency),
      currency.formatMoney(point.value),
      'Not available',
    ],
  }));
}

function meaningfulRange(
  point: ForecastSeries,
  currency: AnalyticsCurrencyContext
): string {
  if (
    !point.hasBounds ||
    !Number.isFinite(point.lowerBound) ||
    !Number.isFinite(point.upperBound) ||
    (point.lowerBound === 0 && point.upperBound === 0)
  ) {
    return 'Not available';
  }

  const lower = Math.min(point.lowerBound, point.upperBound);
  const upper = Math.max(point.lowerBound, point.upperBound);
  return `${currency.formatMoney(lower)} to ${currency.formatMoney(upper)}`;
}

function futureRows(
  series: 'Income' | 'Expenses' | 'Net',
  points: readonly ForecastSeries[],
  currency: AnalyticsCurrencyContext
): ForecastTableEntry[] {
  return points.map((point) => ({
    sortDate: sortDate(point.date),
    row: [
      'Forecast',
      series,
      formattedDate(point.date, currency),
      currency.formatMoney(point.predicted),
      meaningfulRange(point, currency),
    ],
  }));
}

function forecastRows(
  incomeHistory: readonly ForecastHistoryPoint[],
  expenseHistory: readonly ForecastHistoryPoint[],
  incomeForecast: readonly ForecastSeries[],
  expenseForecast: readonly ForecastSeries[],
  netForecast: readonly ForecastSeries[],
  currency: AnalyticsCurrencyContext
): readonly ForecastTableRow[] {
  const entries = [
    ...historyRows('Income', incomeHistory, currency),
    ...historyRows('Expenses', expenseHistory, currency),
    ...futureRows('Income', incomeForecast, currency),
    ...futureRows('Expenses', expenseForecast, currency),
    ...futureRows('Net', netForecast, currency),
  ];

  return entries
    .sort((left, right) => {
      const dateOrder = left.sortDate - right.sortDate;
      if (dateOrder !== 0) return dateOrder;
      if (left.row[0] !== right.row[0]) {
        return left.row[0] === 'History' ? -1 : 1;
      }
      return left.row[1].localeCompare(right.row[1]);
    })
    .map((entry) => entry.row);
}

function latestNetProjection(
  points: readonly ForecastSeries[]
): ForecastSeries | null {
  return (
    [...points]
      .filter(
        (point) =>
          Number.isFinite(point.predicted) &&
          sortDate(point.date) !== Number.MAX_SAFE_INTEGER
      )
      .sort((left, right) => sortDate(right.date) - sortDate(left.date))[0] ??
    null
  );
}

function projectionDirection(value: number): string {
  if (Math.abs(value) < 0.005) return 'near break-even';
  return value > 0 ? 'positive' : 'negative';
}

export function ForecastAnalyticsView({
  scope,
  period,
  currency,
}: AnalyticsViewProps) {
  const forecastDays = getAnalyticsPeriodConfig(period).forecastDays;
  const forecast = useCashFlowForecast(forecastDays, scope);
  const isUnresolved =
    forecast.incomeForecast === null &&
    forecast.expenseForecast === null &&
    forecast.netForecast === null &&
    forecast.incomeHistory === null &&
    forecast.expenseHistory === null;
  const incomeForecast = forecast.incomeForecast ?? [];
  const expenseForecast = forecast.expenseForecast ?? [];
  const netForecast = forecast.netForecast ?? [];
  const incomeHistory = forecast.incomeHistory ?? [];
  const expenseHistory = forecast.expenseHistory ?? [];
  const rows = forecastRows(
    incomeHistory,
    expenseHistory,
    incomeForecast,
    expenseForecast,
    netForecast,
    currency
  );
  const currentProjection = latestNetProjection(netForecast);

  if (forecast.loading || (!forecast.error && isUnresolved)) {
    return <AnalyticsChartSkeleton label="Loading cash flow forecast" />;
  }
  if (forecast.error) {
    return (
      <AnalyticsErrorState
        message={forecast.error}
        onRetry={() => void forecast.refetch()}
        headingLevel={scope.kind === 'personal' ? 2 : 3}
      />
    );
  }

  const hasData = rows.length > 0;
  const scopeLabel =
    scope.kind === 'group'
      ? scope.groupName.trim() || 'This group'
      : 'Your finances';
  const ViewHeading = scope.kind === 'personal' ? 'h2' : 'h3';
  const SectionHeading = scope.kind === 'personal' ? 'h3' : 'h4';

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-2">
        <p className="inline-flex border-l-2 border-primary pl-2 text-sm font-medium text-foreground">
          {scopeLabel}
        </p>
        <ViewHeading className="text-balance text-2xl font-semibold text-foreground">
          Cash flow forecast
        </ViewHeading>
        <p className="max-w-2xl text-pretty text-sm text-muted-foreground">
          Compare recorded cash flow with the projected direction for this horizon.
        </p>
      </header>

      {currentProjection ? (
        <section
          aria-labelledby="forecast-takeaway-heading"
          className={`rounded-2xl border border-border border-l-4 bg-card p-5 shadow-sm ${
            currentProjection.predicted < -0.005
              ? 'border-l-destructive'
              : 'border-l-chart-2'
          }`}
        >
          <SectionHeading
            id="forecast-takeaway-heading"
            className="text-balance text-sm font-semibold text-foreground"
          >
            Projected net position
          </SectionHeading>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">
            {currency.formatMoney(currentProjection.predicted)}
          </p>
          <p className="mt-2 max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            By {formattedDate(currentProjection.date, currency)}, the projected
            net position is {projectionDirection(currentProjection.predicted)}.
            {' '}Expected range: {meaningfulRange(currentProjection, currency)}.
          </p>
        </section>
      ) : null}

      {!hasData ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <SectionHeading className="text-balance text-xl font-semibold text-foreground">
            Forecast needs recorded history
          </SectionHeading>
          <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
            Add income and expenses to build enough history for a cash flow forecast.
          </p>
        </section>
      ) : (
        <figure
          aria-labelledby="cash-flow-forecast-heading"
          className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <figcaption>
            <SectionHeading
              id="cash-flow-forecast-heading"
              className="text-balance text-lg font-semibold text-foreground"
            >
              Cash flow history and forecast
            </SectionHeading>
            <p className="mt-1 max-w-2xl text-pretty text-sm text-muted-foreground">
              Solid lines show recorded values. Dashed lines show modelled values.
            </p>
          </figcaption>
          <div className="mt-4 h-[440px] min-w-0 overflow-hidden rounded-[10px] bg-muted/20 p-2 sm:h-[480px]">
            <LazyCashFlowForecast
              incomeForecast={incomeForecast}
              expenseForecast={expenseForecast}
              netForecast={netForecast}
              incomeHistory={incomeHistory}
              expenseHistory={expenseHistory}
              formatMoney={currency.formatMoney}
              formatDate={currency.formatDate}
            />
          </div>
          <div className="mt-3">
            <AccessibleDataSummary
              caption="Cash flow history and forecast values"
              columns={['Phase', 'Series', 'Date', 'Value', 'Expected range']}
              rows={rows}
            />
          </div>
        </figure>
      )}
    </div>
  );
}
