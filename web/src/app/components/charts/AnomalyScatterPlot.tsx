'use client';

import React, { useId, useMemo, useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridColumns, GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleLinear, scaleTime } from '@visx/scale';

import type { AnomalyPoint } from '@/app/metrics/types';

interface NormalTransaction {
  readonly date: Date;
  readonly amount: number;
}

interface AnomalyScatterPlotProps {
  readonly data: readonly AnomalyPoint[];
  readonly normalTransactions?: readonly NormalTransaction[];
  readonly formatMoney?: (amount: number, compact?: boolean) => string;
  readonly formatDate?: (
    date: Date | string,
    options?: Intl.DateTimeFormatOptions
  ) => string;
}

const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

const SEVERITY_COLOR = {
  low: 'var(--chart-4)',
  medium: 'var(--chart-5)',
  high: 'var(--chart-1)',
} as const;

const DEFAULT_MONEY_FORMATTER = (amount: number, compact = false) =>
  new Intl.NumberFormat(undefined, {
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : 2,
  }).format(amount);

const DEFAULT_DATE_FORMATTER = (
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
    ...options,
  }).format(typeof date === 'string' ? new Date(date) : date);

function finiteDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function identityForPoint(point: AnomalyPoint): string {
  const expenseId = point.expenseId.trim();
  if (expenseId) return `expense:${expenseId}`;
  const anomalyId = point.id.trim();
  if (anomalyId) return `anomaly:${anomalyId}`;
  return [
    point.description.trim(),
    point.category.trim(),
    point.date.getTime(),
    point.amount,
  ].join(':');
}

function compareCandidates(left: AnomalyPoint, right: AnomalyPoint): number {
  return (
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
    Math.abs(right.zScore) - Math.abs(left.zScore) ||
    right.date.getTime() - left.date.getTime() ||
    right.amount - left.amount ||
    identityForPoint(left).localeCompare(identityForPoint(right)) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Produces the one-point-per-expense evidence model shared by charts and views.
 * The source array and its dates are always copied before sorting or filtering.
 */
export function normalizeAnomalyPoints(
  source: readonly AnomalyPoint[]
): AnomalyPoint[] {
  const candidates = source
    .filter(
      (point) =>
        point !== null &&
        typeof point === 'object' &&
        finiteDate(point.date) &&
        Number.isFinite(point.amount) &&
        Number.isFinite(point.zScore) &&
        point.severity in SEVERITY_RANK
    )
    .map((point) => {
      const hasExpectedRange =
        point.hasExpectedRange === true &&
        Number.isFinite(point.expectedLowerAmount) &&
        Number.isFinite(point.expectedUpperAmount) &&
        point.expectedLowerAmount <= point.expectedUpperAmount;

      return {
        ...point,
        id: point.id.trim(),
        expenseId: point.expenseId.trim(),
        description: point.description.trim() || 'Unlabelled expense',
        category: point.category.trim() || 'Uncategorised',
        date: new Date(point.date.getTime()),
        expectedAmount: Number.isFinite(point.expectedAmount)
          ? point.expectedAmount
          : 0,
        expectedLowerAmount: hasExpectedRange
          ? point.expectedLowerAmount
          : 0,
        expectedUpperAmount: hasExpectedRange
          ? point.expectedUpperAmount
          : 0,
        hasExpectedRange,
        anomalyType: point.anomalyType.trim() || 'unusual_pattern',
      };
    })
    .sort(compareCandidates);

  const seen = new Set<string>();
  return candidates.filter((point) => {
    const identity = identityForPoint(point);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function normalizeNormalTransactions(
  source: readonly NormalTransaction[]
): NormalTransaction[] {
  return source
    .filter(
      (point) => finiteDate(point.date) && Number.isFinite(point.amount)
    )
    .map((point) => ({
      date: new Date(point.date.getTime()),
      amount: point.amount,
    }))
    .sort(
      (left, right) =>
        left.date.getTime() - right.date.getTime() ||
        left.amount - right.amount
    );
}

function paddedDateDomain(dates: readonly Date[]): readonly [Date, Date] {
  const minimum = Math.min(...dates.map((date) => date.getTime()));
  const maximum = Math.max(...dates.map((date) => date.getTime()));
  const span = maximum - minimum;
  const padding =
    span === 0
      ? 12 * 60 * 60 * 1_000
      : Math.max(span * 0.05, 60 * 60 * 1_000);
  return [new Date(minimum - padding), new Date(maximum + padding)];
}

function paddedAmountDomain(
  amounts: readonly number[]
): readonly [number, number] {
  let minimum = Math.min(0, ...amounts);
  let maximum = Math.max(0, ...amounts);
  if (minimum === maximum) {
    const padding = Math.max(Math.abs(minimum) * 0.1, 1);
    minimum -= padding;
    maximum += padding;
  } else {
    const padding = Math.max((maximum - minimum) * 0.08, 0.01);
    minimum -= padding;
    maximum += padding;
  }
  return [minimum, maximum];
}

function expectedRangeCopy(
  point: AnomalyPoint,
  formatMoney: NonNullable<AnomalyScatterPlotProps['formatMoney']>
): string {
  return point.hasExpectedRange
    ? `Expected ${formatMoney(point.expectedLowerAmount)} to ${formatMoney(
        point.expectedUpperAmount
      )}.`
    : 'No expected amount range applies to this anomaly reason.';
}

function inspectionCopy(
  point: AnomalyPoint,
  formatMoney: NonNullable<AnomalyScatterPlotProps['formatMoney']>,
  formatDate: NonNullable<AnomalyScatterPlotProps['formatDate']>
): string {
  const severity = `${point.severity.slice(0, 1).toUpperCase()}${point.severity.slice(1)}`;
  return `${formatDate(point.date)}. ${point.description}. ${formatMoney(
    point.amount
  )}. ${severity} severity. ${point.category}. ${point.anomalyType.replace(
    /[_-]+/g,
    ' '
  )}. Z-score ${point.zScore.toFixed(2)}. ${expectedRangeCopy(
    point,
    formatMoney
  )}`;
}

function Marker({
  point,
  x,
  y,
  onEnter,
  onLeave,
}: Readonly<{
  point: AnomalyPoint;
  x: number;
  y: number;
  onEnter: () => void;
  onLeave: () => void;
}>) {
  const common = {
    fill: SEVERITY_COLOR[point.severity],
    stroke: 'var(--background)',
    strokeWidth: 1.5,
    onMouseEnter: onEnter,
    onMouseLeave: onLeave,
    'data-severity': point.severity,
  };

  if (point.severity === 'high') {
    return (
      <polygon
        {...common}
        points={`${x},${y - 10} ${x + 10},${y + 8} ${x - 10},${y + 8}`}
      />
    );
  }
  if (point.severity === 'medium') {
    return (
      <rect
        {...common}
        x={x - 7}
        y={y - 7}
        width={14}
        height={14}
        transform={`rotate(45 ${x} ${y})`}
      />
    );
  }
  return <circle {...common} cx={x} cy={y} r={6} />;
}

function ScatterPlot({
  data,
  normalTransactions,
  formatMoney,
  formatDate,
  width,
  height,
}: Readonly<{
  data: readonly AnomalyPoint[];
  normalTransactions: readonly NormalTransaction[];
  formatMoney: NonNullable<AnomalyScatterPlotProps['formatMoney']>;
  formatDate: NonNullable<AnomalyScatterPlotProps['formatDate']>;
  width: number;
  height: number;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const [selection, setSelection] = useState<Readonly<{
    modelKey: string;
    index: number;
  }> | null>(null);
  const modelKey = useMemo(
    () =>
      data
        .map((point) =>
          [
            identityForPoint(point),
            point.date.getTime(),
            point.amount,
            point.zScore,
            point.severity,
            point.hasExpectedRange,
            point.expectedLowerAmount,
            point.expectedUpperAmount,
          ].join(':')
        )
        .join('|'),
    [data]
  );

  const selectedIndex =
    selection?.modelKey === modelKey ? selection.index : null;

  const margin = { top: 24, right: 20, bottom: 48, left: 72 };
  const innerWidth = Math.max(width - margin.left - margin.right, 1);
  const innerHeight = Math.max(height - margin.top - margin.bottom, 1);
  const dates = [
    ...data.map((point) => point.date),
    ...normalTransactions.map((point) => point.date),
  ];
  const amounts = [
    ...data.map((point) => point.amount),
    ...normalTransactions.map((point) => point.amount),
  ];
  const [dateStart, dateEnd] = paddedDateDomain(dates);
  const [amountMinimum, amountMaximum] = paddedAmountDomain(amounts);
  const xScale = scaleTime<number>({
    domain: [dateStart, dateEnd],
    range: [0, innerWidth],
  });
  const yScale = scaleLinear<number>({
    domain: [amountMinimum, amountMaximum],
    range: [innerHeight, 0],
  });
  const selected = selectedIndex === null ? null : data[selectedIndex] ?? null;

  function moveSelection(key: string) {
    if (data.length === 0) return;
    if (key === 'Escape') {
      setSelection(null);
      return;
    }
    if (key === 'Home') {
      setSelection({ modelKey, index: 0 });
      return;
    }
    if (key === 'End') {
      setSelection({ modelKey, index: data.length - 1 });
      return;
    }
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      setSelection((current) => {
        const currentIndex =
          current?.modelKey === modelKey ? current.index : null;
        return {
          modelKey,
          index: currentIndex === null ? 0 : (currentIndex + 1) % data.length,
        };
      });
      return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      setSelection((current) => {
        const currentIndex =
          current?.modelKey === modelKey ? current.index : null;
        return {
          modelKey,
          index:
            currentIndex === null
              ? data.length - 1
              : (currentIndex - 1 + data.length) % data.length,
        };
      });
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="relative min-h-0 flex-1">
        <svg
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          width={width}
          height={height}
          data-x-domain-start={dateStart.toISOString()}
          data-x-domain-end={dateEnd.toISOString()}
          data-y-domain-min={amountMinimum}
          data-y-domain-max={amountMaximum}
        >
          <title id={titleId}>Spending anomaly scatter plot</title>
          <desc id={descriptionId}>
            {`${data.length} flagged spending ${data.length === 1 ? 'pattern' : 'patterns'} plotted by date and amount. Marker shape distinguishes severity.`}
          </desc>
          <Group left={margin.left} top={margin.top}>
            <GridRows
              scale={yScale}
              width={innerWidth}
              stroke="var(--border)"
              strokeOpacity={0.35}
              numTicks={5}
            />
            <GridColumns
              scale={xScale}
              height={innerHeight}
              stroke="var(--border)"
              strokeOpacity={0.35}
              numTicks={Math.min(5, dates.length + 1)}
            />

            {normalTransactions.map((point, index) => (
              <circle
                key={`normal:${point.date.getTime()}:${point.amount}:${index}`}
                cx={xScale(point.date)}
                cy={yScale(point.amount)}
                r={2.5}
                fill="var(--muted-foreground)"
                fillOpacity={0.45}
              />
            ))}

            {data.map((point, index) => (
              <Marker
                key={`${identityForPoint(point)}:${index}`}
                point={point}
                x={xScale(point.date)}
                y={yScale(point.amount)}
                onEnter={() => setSelection({ modelKey, index })}
                onLeave={() => setSelection(null)}
              />
            ))}

            <AxisBottom
              top={innerHeight}
              scale={xScale}
              numTicks={Math.min(5, dates.length + 1)}
              tickFormat={(value) =>
                formatDate(new Date(value.valueOf()), {
                  month: 'short',
                  day: 'numeric',
                  timeZone: 'UTC',
                })
              }
              stroke="var(--border)"
              tickStroke="var(--border)"
              tickLabelProps={() => ({
                fill: 'var(--muted-foreground)',
                fontSize: 10,
                textAnchor: 'middle' as const,
              })}
            />
            <AxisLeft
              scale={yScale}
              numTicks={5}
              tickFormat={(value) => formatMoney(Number(value), true)}
              stroke="var(--border)"
              tickStroke="var(--border)"
              tickLabelProps={() => ({
                fill: 'var(--muted-foreground)',
                fontSize: 10,
                textAnchor: 'end' as const,
                dx: '-0.25em',
                dy: '0.25em',
              })}
            />
          </Group>
        </svg>

        {selected ? (
          <div className="pointer-events-none absolute right-3 top-3 max-w-64 rounded-[10px] border border-border bg-popover p-3 text-xs text-popover-foreground shadow-sm">
            <p className="font-semibold">{selected.description}</p>
            <p className="mt-1 tabular-nums">
              {formatDate(selected.date)} · {formatMoney(selected.amount)}
            </p>
            <p className="mt-1 text-muted-foreground">
              {selected.category} · {selected.severity} ·{' '}
              {selected.anomalyType.replace(/[_-]+/g, ' ')} · Z-score{' '}
              <span className="tabular-nums">{selected.zScore.toFixed(2)}</span>
            </p>
            <p className="mt-1 text-muted-foreground">
              {expectedRangeCopy(selected, formatMoney)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ul
          aria-label="Anomaly severity legend"
          className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
        >
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rounded-full bg-[var(--chart-4)]" />
            Low · circle
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 rotate-45 bg-[var(--chart-5)]" />
            Medium · diamond
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[var(--chart-1)]">▲</span>
            High · triangle
          </li>
        </ul>
        {data.length > 0 ? (
          <button
            type="button"
            aria-label="Explore spending anomalies"
            onFocus={() =>
              setSelection((current) =>
                current?.modelKey === modelKey
                  ? current
                  : { modelKey, index: 0 }
              )
            }
            onBlur={() => setSelection(null)}
            onKeyDown={(event) => {
              if (
                [
                  'ArrowRight',
                  'ArrowDown',
                  'ArrowLeft',
                  'ArrowUp',
                  'Home',
                  'End',
                  'Escape',
                ].includes(event.key)
              ) {
                event.preventDefault();
                moveSelection(event.key);
              }
            }}
            className="min-h-10 rounded-md border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100"
          >
            Explore chart
          </button>
        ) : null}
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {selected ? inspectionCopy(selected, formatMoney, formatDate) : ''}
      </p>

      <table
        data-testid="anomaly-chart-data-table"
        aria-label="Spending anomaly chart data"
        className="sr-only"
      >
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Expense</th>
            <th scope="col">Amount</th>
            <th scope="col">Category</th>
            <th scope="col">Severity</th>
            <th scope="col">Reason</th>
            <th scope="col">Z-score</th>
            <th scope="col">Expected range</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point, index) => (
            <tr key={`table:${identityForPoint(point)}:${index}`}>
              <td>{formatDate(point.date)}</td>
              <td>{point.description}</td>
              <td>{formatMoney(point.amount)}</td>
              <td>{point.category}</td>
              <td>{point.severity}</td>
              <td>{point.anomalyType.replace(/[_-]+/g, ' ')}</td>
              <td>{point.zScore.toFixed(2)}</td>
              <td>{expectedRangeCopy(point, formatMoney)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AnomalyScatterPlot({
  data,
  normalTransactions = [],
  formatMoney = DEFAULT_MONEY_FORMATTER,
  formatDate = DEFAULT_DATE_FORMATTER,
}: AnomalyScatterPlotProps) {
  const normalizedData = useMemo(() => normalizeAnomalyPoints(data), [data]);
  const normalizedNormalTransactions = useMemo(
    () => normalizeNormalTransactions(normalTransactions),
    [normalTransactions]
  );

  if (normalizedData.length === 0 && normalizedNormalTransactions.length === 0) {
    return (
      <div className="flex h-full min-h-64 items-center justify-center text-pretty text-sm text-muted-foreground">
        No anomaly data is available for this chart.
      </div>
    );
  }

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        return (
          <ScatterPlot
            data={normalizedData}
            normalTransactions={normalizedNormalTransactions}
            formatMoney={formatMoney}
            formatDate={formatDate}
            width={width}
            height={Math.max(height, 280)}
          />
        );
      }}
    </ParentSize>
  );
}
