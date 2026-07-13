'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Bar, Line, LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { scaleLinear, scaleTime } from '@visx/scale';
import { Group } from '@visx/group';
import { defaultStyles, TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { bisector } from 'd3-array';

import { createAnalyticsCurrencyContext } from '@/app/components/analytics/formatting';
import type { AnalyticsCurrencyContext } from '@/app/components/analytics/types';
import type {
  ForecastHistoryPoint,
  ForecastSeries,
} from '@/app/metrics/types';

import { forecastDomain } from './analyticsChartMath';

interface CashFlowForecastProps {
  incomeForecast: ForecastSeries[];
  expenseForecast: ForecastSeries[];
  netForecast: ForecastSeries[];
  historicalDays?: number;
  incomeHistory?: ForecastHistoryPoint[];
  expenseHistory?: ForecastHistoryPoint[];
  formatMoney?: AnalyticsCurrencyContext['formatMoney'];
  formatDate?: AnalyticsCurrencyContext['formatDate'];
}

interface ParsedHistoryPoint {
  date: Date;
  label: string;
  value: number;
}

interface TooltipMetric {
  value: number;
  lower: number;
  upper: number;
  hasBounds: boolean;
}

interface TooltipData {
  date: Date;
  isForecast: boolean;
  income?: TooltipMetric;
  expenses?: TooltipMetric;
  net?: TooltipMetric;
}

type ForecastKey = 'income' | 'expenses' | 'net';

interface SeriesConfig {
  key: ForecastKey;
  label: string;
  data: ForecastSeries[];
  color: string;
}

interface TimelinePoint {
  date: Date;
  value: number;
}

const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const MARGIN = { top: 22, right: 16, bottom: 40, left: 64 } as const;

const tooltipStyles: React.CSSProperties = {
  ...defaultStyles,
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  fontSize: '12px',
  padding: '8px 12px',
  boxShadow:
    '0 4px 12px color-mix(in srgb, var(--foreground) 15%, transparent)',
};

const bisectTimeline = bisector<TimelinePoint, Date>((point) => point.date).left;

function parseHistory(points: readonly ForecastHistoryPoint[]): ParsedHistoryPoint[] {
  return points
    .map((point) => ({
      date: new Date(point.date),
      label: point.label,
      value: point.value,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.date.getTime()) && Number.isFinite(point.value)
    )
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function parseForecast(points: readonly ForecastSeries[]): ForecastSeries[] {
  return points
    .map((point) => {
      const date = new Date(point.date.getTime());
      const hasBounds =
        point.hasBounds &&
        Number.isFinite(point.lowerBound) &&
        Number.isFinite(point.upperBound);
      return {
        ...point,
        date,
        lowerBound: hasBounds
          ? Math.min(point.lowerBound, point.upperBound)
          : 0,
        upperBound: hasBounds
          ? Math.max(point.lowerBound, point.upperBound)
          : 0,
        hasBounds,
      };
    })
    .filter(
      (point) =>
        Number.isFinite(point.date.getTime()) && Number.isFinite(point.predicted)
    )
    .sort((left, right) => left.date.getTime() - right.date.getTime());
}

function paddedValueDomain(values: readonly number[]): readonly [number, number] {
  const finiteValues = values.filter(Number.isFinite);
  const minimum = Math.min(0, ...finiteValues);
  const maximum = Math.max(0, ...finiteValues);

  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.1 || 1;
    return [minimum - padding, maximum + padding];
  }

  const padding = (maximum - minimum) * 0.08;
  return [minimum - padding, maximum + padding];
}

function boundedRuns(
  points: readonly ForecastSeries[],
  today: Date
): ForecastSeries[][] {
  const runs: ForecastSeries[][] = [];
  let current: ForecastSeries[] = [];

  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (const point of points) {
    if (point.date.getTime() > today.getTime() && point.hasBounds) {
      current.push(point);
    } else {
      flush();
    }
  }
  flush();
  return runs;
}

function toTooltipMetric(point: ForecastSeries | undefined): TooltipMetric | undefined {
  if (!point) return undefined;
  return {
    value: point.predicted,
    lower: point.lowerBound,
    upper: point.upperBound,
    hasBounds: point.hasBounds,
  };
}

function ForecastChart({
  incomeForecast,
  expenseForecast,
  netForecast,
  incomeHistory,
  expenseHistory,
  formatMoney = DEFAULT_FORMATTERS.formatMoney,
  formatDate = DEFAULT_FORMATTERS.formatDate,
  width,
  height,
}: CashFlowForecastProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const today = useMemo(() => new Date(), []);

  const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);

  const parsedIncomeHistory = useMemo(
    () =>
      parseHistory(incomeHistory ?? []).filter(
        (point) => point.date.getTime() <= today.getTime()
      ),
    [incomeHistory, today]
  );
  const parsedExpenseHistory = useMemo(
    () =>
      parseHistory(expenseHistory ?? []).filter(
        (point) => point.date.getTime() <= today.getTime()
      ),
    [expenseHistory, today]
  );
  const parsedIncomeForecast = useMemo(
    () =>
      parseForecast(incomeForecast).filter(
        (point) => point.date.getTime() > today.getTime()
      ),
    [incomeForecast, today]
  );
  const parsedExpenseForecast = useMemo(
    () =>
      parseForecast(expenseForecast).filter(
        (point) => point.date.getTime() > today.getTime()
      ),
    [expenseForecast, today]
  );
  const parsedNetForecast = useMemo(
    () =>
      parseForecast(netForecast).filter(
        (point) => point.date.getTime() > today.getTime()
      ),
    [netForecast, today]
  );

  const incomeHistoryMap = useMemo(
    () =>
      new Map(
        parsedIncomeHistory.map((point) => [point.date.getTime(), point] as const)
      ),
    [parsedIncomeHistory]
  );
  const expenseHistoryMap = useMemo(
    () =>
      new Map(
        parsedExpenseHistory.map((point) => [point.date.getTime(), point] as const)
      ),
    [parsedExpenseHistory]
  );
  const incomeForecastMap = useMemo(
    () =>
      new Map(
        parsedIncomeForecast.map((point) => [point.date.getTime(), point] as const)
      ),
    [parsedIncomeForecast]
  );
  const expenseForecastMap = useMemo(
    () =>
      new Map(
        parsedExpenseForecast.map((point) => [point.date.getTime(), point] as const)
      ),
    [parsedExpenseForecast]
  );
  const netForecastMap = useMemo(
    () =>
      new Map(
        parsedNetForecast.map((point) => [point.date.getTime(), point] as const)
      ),
    [parsedNetForecast]
  );

  const seriesConfigs: SeriesConfig[] = useMemo(
    () => [
      {
        key: 'income',
        label: 'Income',
        data: parsedIncomeForecast,
        color: 'var(--chart-2)',
      },
      {
        key: 'expenses',
        label: 'Expenses',
        data: parsedExpenseForecast,
        color: 'var(--chart-1)',
      },
      {
        key: 'net',
        label: 'Net',
        data: parsedNetForecast,
        color: 'var(--primary)',
      },
    ],
    [parsedExpenseForecast, parsedIncomeForecast, parsedNetForecast]
  );
  const hasConfidenceArea = useMemo(
    () =>
      seriesConfigs.some(
        (config) => boundedRuns(config.data, today).length > 0
      ),
    [seriesConfigs, today]
  );

  const historyDates = useMemo(
    () =>
      [...parsedIncomeHistory, ...parsedExpenseHistory].map((point) => point.date),
    [parsedExpenseHistory, parsedIncomeHistory]
  );
  const futureDates = useMemo(
    () =>
      [
        ...parsedIncomeForecast,
        ...parsedExpenseForecast,
        ...parsedNetForecast,
      ].map((point) => point.date),
    [parsedExpenseForecast, parsedIncomeForecast, parsedNetForecast]
  );
  const hasData = historyDates.length > 0 || futureDates.length > 0;

  const xDomain = useMemo(() => {
    if (historyDates.length > 0 && futureDates.length > 0) {
      return forecastDomain(historyDates, futureDates, today);
    }
    if (historyDates.length > 0) {
      return forecastDomain(historyDates, [today], today);
    }
    if (futureDates.length > 0) {
      return forecastDomain([today], futureDates, today);
    }
    return forecastDomain([], [], today);
  }, [futureDates, historyDates, today]);
  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [...xDomain],
        range: [0, innerWidth],
      }),
    [innerWidth, xDomain]
  );

  const allValues = useMemo(() => {
    const values = [
      ...parsedIncomeHistory.map((point) => point.value),
      ...parsedExpenseHistory.map((point) => point.value),
    ];
    for (const config of seriesConfigs) {
      for (const point of config.data) {
        values.push(point.predicted);
        if (point.hasBounds) values.push(point.lowerBound, point.upperBound);
      }
    }
    return values;
  }, [parsedExpenseHistory, parsedIncomeHistory, seriesConfigs]);
  const valueDomain = useMemo(() => paddedValueDomain(allValues), [allValues]);
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [...valueDomain],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight, valueDomain]
  );
  const renderedYDomain = yScale.domain();

  const timeline = useMemo(() => {
    const byTime = new Map<number, TimelinePoint>();
    for (const point of parsedIncomeHistory) {
      byTime.set(point.date.getTime(), { date: point.date, value: point.value });
    }
    for (const point of parsedExpenseHistory) {
      if (!byTime.has(point.date.getTime())) {
        byTime.set(point.date.getTime(), { date: point.date, value: point.value });
      }
    }
    for (const config of seriesConfigs) {
      for (const point of config.data) {
        if (!byTime.has(point.date.getTime())) {
          byTime.set(point.date.getTime(), {
            date: point.date,
            value: point.predicted,
          });
        }
      }
    }
    return [...byTime.values()].sort(
      (left, right) => left.date.getTime() - right.date.getTime()
    );
  }, [parsedExpenseHistory, parsedIncomeHistory, seriesConfigs]);

  const forecastSummary = useMemo(() => {
    if (futureDates.length > 0) {
      const horizon = new Date(
        Math.max(...futureDates.map((date) => date.getTime()))
      );
      const parts: string[] = [];
      const latestIncome = parsedIncomeForecast.at(-1);
      const latestExpenses = parsedExpenseForecast.at(-1);
      const latestNet = parsedNetForecast.at(-1);
      if (latestIncome) parts.push(`income ${formatMoney(latestIncome.predicted)}`);
      if (latestExpenses) {
        parts.push(`expenses ${formatMoney(latestExpenses.predicted)}`);
      }
      if (latestNet) parts.push(`net ${formatMoney(latestNet.predicted)}`);
      return `Forecast through ${formatDate(horizon)}${
        parts.length > 0 ? `: ${parts.join(', ')}` : ''
      }.`;
    }

    if (historyDates.length > 0) {
      const firstHistory = new Date(
        Math.min(...historyDates.map((date) => date.getTime()))
      );
      const lastHistory = new Date(
        Math.max(...historyDates.map((date) => date.getTime()))
      );
      return `History from ${formatDate(firstHistory)} to ${formatDate(
        lastHistory
      )}. Add forecast data to see what may come next.`;
    }
    return 'No cash flow history or forecast is available.';
  }, [
    formatDate,
    formatMoney,
    futureDates,
    historyDates,
    parsedExpenseForecast,
    parsedIncomeForecast,
    parsedNetForecast,
  ]);

  const showTooltipForDate = useCallback(
    (date: Date) => {
      const isForecast = date.getTime() > today.getTime();
      const time = date.getTime();
      const income = isForecast
        ? toTooltipMetric(incomeForecastMap.get(time))
        : (() => {
            const point = incomeHistoryMap.get(time);
            return point
              ? { value: point.value, lower: 0, upper: 0, hasBounds: false }
              : undefined;
          })();
      const expenses = isForecast
        ? toTooltipMetric(expenseForecastMap.get(time))
        : (() => {
            const point = expenseHistoryMap.get(time);
            return point
              ? { value: point.value, lower: 0, upper: 0, hasBounds: false }
              : undefined;
          })();
      const net = isForecast
        ? toTooltipMetric(netForecastMap.get(time))
        : undefined;
      const firstMetric = income ?? expenses ?? net;
      if (!firstMetric) return;

      showTooltip({
        tooltipData: { date, isForecast, income, expenses, net },
        tooltipLeft: xScale(date) + MARGIN.left,
        tooltipTop: yScale(firstMetric.value) + MARGIN.top,
      });
    },
    [
      expenseForecastMap,
      expenseHistoryMap,
      incomeForecastMap,
      incomeHistoryMap,
      netForecastMap,
      showTooltip,
      today,
      xScale,
      yScale,
    ]
  );

  const firstForecastIndex = timeline.findIndex(
    (point) => point.date.getTime() > today.getTime()
  );
  const focusIndex = firstForecastIndex >= 0 ? firstForecastIndex : 0;
  const handleFocus = useCallback(() => {
    if (timeline.length === 0) return;
    setKeyboardIndex(focusIndex);
    showTooltipForDate(timeline[focusIndex].date);
  }, [focusIndex, showTooltipForDate, timeline]);
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<SVGRectElement>) => {
      if (timeline.length === 0) return;
      if (event.key === 'Escape') {
        hideTooltip();
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextIndex =
        (keyboardIndex + direction + timeline.length) % timeline.length;
      setKeyboardIndex(nextIndex);
      showTooltipForDate(timeline[nextIndex].date);
    },
    [hideTooltip, keyboardIndex, showTooltipForDate, timeline]
  );
  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      if (timeline.length === 0) return;
      const point = localPoint(event) ?? { x: MARGIN.left };
      const targetDate = xScale.invert(point.x - MARGIN.left);
      const index = bisectTimeline(timeline, targetDate, 1);
      const previous = timeline[index - 1];
      const next = timeline[index];
      const closest =
        previous && next
          ? targetDate.getTime() - previous.date.getTime() >
            next.date.getTime() - targetDate.getTime()
            ? next
            : previous
          : previous ?? next;
      if (closest) showTooltipForDate(closest.date);
    },
    [showTooltipForDate, timeline, xScale]
  );

  if (!hasData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data available for forecast chart.
      </div>
    );
  }

  const todayX = xScale(today);
  const incomeHistoryStart = parsedIncomeHistory.at(0)?.date.toISOString();
  const incomeHistoryEnd = parsedIncomeHistory.at(-1)?.date.toISOString();
  const expenseHistoryStart = parsedExpenseHistory.at(0)?.date.toISOString();
  const expenseHistoryEnd = parsedExpenseHistory.at(-1)?.date.toISOString();

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Cash flow history and forecast"
        data-x-domain-start={xDomain[0].toISOString()}
        data-x-domain-end={xDomain[1].toISOString()}
        data-y-domain-min={renderedYDomain[0]}
        data-y-domain-max={renderedYDomain[1]}
      >
        <title>Cash flow history and forecast</title>
        <desc>{forecastSummary}</desc>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.4}
            strokeDasharray="3,3"
            numTicks={5}
          />

          {seriesConfigs.flatMap((config) =>
            boundedRuns(config.data, today).map((run) => {
              const upper = run.map(
                (point, index) =>
                  `${index === 0 ? 'M' : 'L'} ${xScale(point.date)} ${yScale(
                    point.upperBound
                  )}`
              );
              const lower = [...run]
                .reverse()
                .map(
                  (point) =>
                    `L ${xScale(point.date)} ${yScale(point.lowerBound)}`
                );
              return (
                <path
                  key={`${config.key}-${run[0].date.getTime()}`}
                  data-testid={`${config.key}-confidence-band`}
                  data-start-date={run[0].date.toISOString()}
                  data-end-date={run[run.length - 1].date.toISOString()}
                  d={`${upper.join(' ')} ${lower.join(' ')} Z`}
                  fill={config.color}
                  fillOpacity={0.1}
                />
              );
            })
          )}

          {parsedIncomeHistory.length > 0 && (
            <LinePath
              data-testid="income-history-line"
              data-start-date={incomeHistoryStart}
              data-end-date={incomeHistoryEnd}
              data={parsedIncomeHistory}
              x={(point) => xScale(point.date) ?? 0}
              y={(point) => yScale(point.value) ?? 0}
              curve={curveMonotoneX}
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeOpacity={0.72}
            />
          )}
          {parsedExpenseHistory.length > 0 && (
            <LinePath
              data-testid="expenses-history-line"
              data-start-date={expenseHistoryStart}
              data-end-date={expenseHistoryEnd}
              data={parsedExpenseHistory}
              x={(point) => xScale(point.date) ?? 0}
              y={(point) => yScale(point.value) ?? 0}
              curve={curveMonotoneX}
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeOpacity={0.72}
            />
          )}

          {seriesConfigs.map((config) =>
            config.data.length > 0 ? (
              <LinePath
                key={config.key}
                data-testid={`${config.key}-forecast-line`}
                data-start-date={config.data[0].date.toISOString()}
                data-end-date={config.data[config.data.length - 1].date.toISOString()}
                data={config.data}
                x={(point) => xScale(point.date) ?? 0}
                y={(point) => yScale(point.predicted) ?? 0}
                curve={curveMonotoneX}
                stroke={config.color}
                strokeWidth={2}
                strokeDasharray="6,4"
              />
            ) : null
          )}

          <g data-testid="today-marker">
            <Line
              from={{ x: todayX, y: 0 }}
              to={{ x: todayX, y: innerHeight }}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <text
              x={todayX}
              y={-6}
              textAnchor="middle"
              fontSize={10}
              fill="var(--muted-foreground)"
            >
              Today
            </text>
          </g>

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={6}
            tickFormat={(value) =>
              formatDate(value as Date, { day: 'numeric', month: 'short' })
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
            tickFormat={(value) => formatMoney(value as number, true)}
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

          <Bar
            data-testid="forecast-chart-overlay"
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            tabIndex={0}
            aria-label="Explore cash flow values. Use the left and right arrow keys to move between dates."
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseMove={handleTooltip}
            onMouseLeave={hideTooltip}
          />

          {tooltipOpen && tooltipData && (
            <Line
              from={{ x: (tooltipLeft ?? 0) - MARGIN.left, y: 0 }}
              to={{ x: (tooltipLeft ?? 0) - MARGIN.left, y: innerHeight }}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          )}
        </Group>
      </svg>

      <div
        aria-label="Chart legend"
        className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
      >
        {seriesConfigs.map((config) => (
          <span
            key={config.key}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 12,
                height: 2,
                display: 'inline-block',
                backgroundColor: config.color,
              }}
            />
            {config.label}
          </span>
        ))}
        <span>Solid lines: history</span>
        <span>Dashed lines: forecast</span>
        {hasConfidenceArea && <span>Shading: expected range where available</span>}
      </div>
      <p data-testid="forecast-summary" className="mt-2 text-xs text-foreground">
        {forecastSummary}
      </p>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {formatDate(tooltipData.date, { day: 'numeric', month: 'short' })}
            {tooltipData.isForecast ? ' · Forecast' : ' · History'}
          </div>
          {(
            [
              ['income', 'Income', tooltipData.income],
              ['expenses', 'Expenses', tooltipData.expenses],
              ['net', 'Net', tooltipData.net],
            ] as const
          ).map(([key, label, metric]) =>
            metric ? (
              <div key={key} style={{ marginBottom: 2 }}>
                {label}: {formatMoney(metric.value)}
                {tooltipData.isForecast && metric.hasBounds && (
                  <span
                    data-testid={`forecast-range-${key}`}
                    style={{ color: 'var(--muted-foreground)', marginLeft: 6 }}
                  >
                    {formatMoney(metric.lower)} to {formatMoney(metric.upper)}
                  </span>
                )}
              </div>
            ) : null
          )}
        </TooltipWithBounds>
      )}
    </div>
  );
}

export default function CashFlowForecast(props: CashFlowForecastProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        return (
          <ForecastChart
            {...props}
            width={width}
            height={Math.max(height, 280)}
          />
        );
      }}
    </ParentSize>
  );
}
