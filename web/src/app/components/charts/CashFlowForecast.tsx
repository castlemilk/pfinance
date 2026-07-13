'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { Line, LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { scaleLinear, scaleTime } from '@visx/scale';
import { Group } from '@visx/group';
import { defaultStyles, TooltipWithBounds, useTooltip } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
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

interface ParsedForecastResult {
  data: ForecastSeries[];
  confidenceSequenceValid: boolean;
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
  confidenceSequenceValid: boolean;
}

interface ConfidenceSeries {
  config: SeriesConfig;
  runs: ForecastSeries[][];
}

interface TimelinePoint {
  date: Date;
  value: number;
}

interface ForecastModel {
  incomeHistory: ParsedHistoryPoint[];
  expenseHistory: ParsedHistoryPoint[];
  incomeForecast: ForecastSeries[];
  expenseForecast: ForecastSeries[];
  netForecast: ForecastSeries[];
  seriesConfigs: SeriesConfig[];
  confidenceSeries: ConfidenceSeries[];
  historyDates: Date[];
  futureDates: Date[];
  hasData: boolean;
  hasIncome: boolean;
  hasExpenses: boolean;
  hasNet: boolean;
  hasHistory: boolean;
  hasForecast: boolean;
  hasConfidenceArea: boolean;
  summary: string;
}

const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const MARGIN = { top: 22, right: 16, bottom: 40, left: 64 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

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

function utcDayStart(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function useUtcToday(): Date {
  const [today, setToday] = useState(() => utcDayStart(new Date()));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    let timer: number | undefined;

    const schedule = () => {
      const now = new Date();
      const nextMidnight = utcDayStart(
        new Date(now.getTime() + DAY_MS)
      ).getTime();
      timer = window.setTimeout(() => {
        setToday(utcDayStart(new Date()));
        schedule();
      }, Math.max(1, nextMidnight - now.getTime()));
    };

    schedule();
    return () => {
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  return today;
}

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

function parseForecast(
  points: readonly ForecastSeries[],
  today: Date
): ParsedForecastResult {
  const data: ForecastSeries[] = [];
  let confidenceSequenceValid = true;
  let previousInputTime: number | null = null;

  for (const point of points) {
    const time = point.date instanceof Date ? point.date.getTime() : Number.NaN;
    if (!Number.isFinite(time) || !Number.isFinite(point.predicted)) {
      confidenceSequenceValid = false;
      continue;
    }
    if (previousInputTime != null && time <= previousInputTime) {
      confidenceSequenceValid = false;
    }
    previousInputTime = time;

    if (time <= today.getTime()) continue;
    const hasBounds =
      point.hasBounds &&
      Number.isFinite(point.lowerBound) &&
      Number.isFinite(point.upperBound);
    data.push({
      ...point,
      date: new Date(time),
      lowerBound: hasBounds
        ? Math.min(point.lowerBound, point.upperBound)
        : 0,
      upperBound: hasBounds
        ? Math.max(point.lowerBound, point.upperBound)
        : 0,
      hasBounds,
    });
  }

  data.sort((left, right) => left.date.getTime() - right.date.getTime());
  return { data, confidenceSequenceValid };
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

function utcCalendarDayNumber(date: Date): number {
  return (
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) /
    DAY_MS
  );
}

function boundedRuns(config: SeriesConfig, today: Date): ForecastSeries[][] {
  if (!config.confidenceSequenceValid) return [];

  const runs: ForecastSeries[][] = [];
  let current: ForecastSeries[] = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };

  for (const point of config.data) {
    if (point.date.getTime() <= today.getTime() || !point.hasBounds) {
      flush();
      continue;
    }
    const previous = current.at(-1);
    if (
      previous &&
      utcCalendarDayNumber(point.date) - utcCalendarDayNumber(previous.date) !== 1
    ) {
      flush();
    }
    current.push(point);
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

function buildForecastModel(
  props: CashFlowForecastProps,
  today: Date,
  formatMoney: AnalyticsCurrencyContext['formatMoney'],
  formatDate: AnalyticsCurrencyContext['formatDate']
): ForecastModel {
  const incomeHistory = parseHistory(props.incomeHistory ?? []).filter(
    (point) => point.date.getTime() <= today.getTime()
  );
  const expenseHistory = parseHistory(props.expenseHistory ?? []).filter(
    (point) => point.date.getTime() <= today.getTime()
  );
  const incomeResult = parseForecast(props.incomeForecast, today);
  const expenseResult = parseForecast(props.expenseForecast, today);
  const netResult = parseForecast(props.netForecast, today);

  const seriesConfigs: SeriesConfig[] = [
    {
      key: 'income',
      label: 'Income',
      data: incomeResult.data,
      color: 'var(--chart-2)',
      confidenceSequenceValid: incomeResult.confidenceSequenceValid,
    },
    {
      key: 'expenses',
      label: 'Expenses',
      data: expenseResult.data,
      color: 'var(--chart-1)',
      confidenceSequenceValid: expenseResult.confidenceSequenceValid,
    },
    {
      key: 'net',
      label: 'Net',
      data: netResult.data,
      color: 'var(--primary)',
      confidenceSequenceValid: netResult.confidenceSequenceValid,
    },
  ];
  const confidenceSeries = seriesConfigs.map((config) => ({
    config,
    runs: boundedRuns(config, today),
  }));
  const historyDates = [...incomeHistory, ...expenseHistory].map(
    (point) => point.date
  );
  const futureDates = seriesConfigs.flatMap((config) =>
    config.data.map((point) => point.date)
  );
  const hasHistory = historyDates.length > 0;
  const hasForecast = futureDates.length > 0;
  const hasConfidenceArea = confidenceSeries.some(({ runs }) => runs.length > 0);

  let summary = 'No cash flow history or forecast is available.';
  if (hasForecast) {
    const latestValues = seriesConfigs.flatMap((config) => {
      const latest = config.data.at(-1);
      return latest
        ? [
            `${config.label} ${formatMoney(latest.predicted)} on ${formatDate(
              latest.date
            )}`,
          ]
        : [];
    });
    summary = `Latest forecast values: ${latestValues.join('; ')}.`;
  } else if (hasHistory) {
    const firstHistory = new Date(
      Math.min(...historyDates.map((date) => date.getTime()))
    );
    const lastHistory = new Date(
      Math.max(...historyDates.map((date) => date.getTime()))
    );
    summary = `History from ${formatDate(firstHistory)} to ${formatDate(
      lastHistory
    )}. Add forecast data to see what may come next.`;
  }

  return {
    incomeHistory,
    expenseHistory,
    incomeForecast: incomeResult.data,
    expenseForecast: expenseResult.data,
    netForecast: netResult.data,
    seriesConfigs,
    confidenceSeries,
    historyDates,
    futureDates,
    hasData: hasHistory || hasForecast,
    hasIncome: incomeHistory.length > 0 || incomeResult.data.length > 0,
    hasExpenses: expenseHistory.length > 0 || expenseResult.data.length > 0,
    hasNet: netResult.data.length > 0,
    hasHistory,
    hasForecast,
    hasConfidenceArea,
    summary,
  };
}

function ForecastPlot({
  model,
  today,
  formatMoney,
  formatDate,
  width,
  height,
}: {
  model: ForecastModel;
  today: Date;
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
  formatDate: AnalyticsCurrencyContext['formatDate'];
  width: number;
  height: number;
}) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState('');
  const statusId = useId();

  const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const xDomain = useMemo(() => {
    if (model.historyDates.length > 0 && model.futureDates.length > 0) {
      return forecastDomain(model.historyDates, model.futureDates, today);
    }
    if (model.historyDates.length > 0) {
      return forecastDomain(model.historyDates, [today], today);
    }
    if (model.futureDates.length > 0) {
      return forecastDomain([today], model.futureDates, today);
    }
    return forecastDomain([], [], today);
  }, [model.futureDates, model.historyDates, today]);
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
      ...model.incomeHistory.map((point) => point.value),
      ...model.expenseHistory.map((point) => point.value),
    ];
    for (const config of model.seriesConfigs) {
      for (const point of config.data) {
        values.push(point.predicted);
        if (point.hasBounds) values.push(point.lowerBound, point.upperBound);
      }
    }
    return values;
  }, [model.expenseHistory, model.incomeHistory, model.seriesConfigs]);
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
    for (const point of model.incomeHistory) {
      byTime.set(point.date.getTime(), { date: point.date, value: point.value });
    }
    for (const point of model.expenseHistory) {
      if (!byTime.has(point.date.getTime())) {
        byTime.set(point.date.getTime(), { date: point.date, value: point.value });
      }
    }
    for (const config of model.seriesConfigs) {
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
  }, [model.expenseHistory, model.incomeHistory, model.seriesConfigs]);

  const incomeHistoryMap = useMemo(
    () =>
      new Map(
        model.incomeHistory.map((point) => [point.date.getTime(), point] as const)
      ),
    [model.incomeHistory]
  );
  const expenseHistoryMap = useMemo(
    () =>
      new Map(
        model.expenseHistory.map((point) => [point.date.getTime(), point] as const)
      ),
    [model.expenseHistory]
  );
  const incomeForecastMap = useMemo(
    () =>
      new Map(
        model.incomeForecast.map((point) => [point.date.getTime(), point] as const)
      ),
    [model.incomeForecast]
  );
  const expenseForecastMap = useMemo(
    () =>
      new Map(
        model.expenseForecast.map((point) => [point.date.getTime(), point] as const)
      ),
    [model.expenseForecast]
  );
  const netForecastMap = useMemo(
    () =>
      new Map(
        model.netForecast.map((point) => [point.date.getTime(), point] as const)
      ),
    [model.netForecast]
  );

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

      const statusParts = [
        income ? `Income ${formatMoney(income.value)}` : null,
        expenses ? `Expenses ${formatMoney(expenses.value)}` : null,
        net ? `Net ${formatMoney(net.value)}` : null,
      ].filter((value): value is string => value != null);
      setSelectedStatus(`${formatDate(date)}. ${statusParts.join('. ')}.`);
      showTooltip({
        tooltipData: { date, isForecast, income, expenses, net },
        tooltipLeft: xScale(date) + MARGIN.left,
        tooltipTop: yScale(firstMetric.value) + MARGIN.top,
      });
    },
    [
      expenseForecastMap,
      expenseHistoryMap,
      formatDate,
      formatMoney,
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
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (timeline.length === 0) return;
      if (event.key === 'Escape') {
        hideTooltip();
        setSelectedStatus('');
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const nextIndex = event.key === 'Home' ? 0 : timeline.length - 1;
        setKeyboardIndex(nextIndex);
        showTooltipForDate(timeline[nextIndex].date);
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
  const showClosestAtX = useCallback(
    (localX: number) => {
      if (timeline.length === 0) return;
      const targetDate = xScale.invert(localX);
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
  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      showClosestAtX(event.clientX - bounds.left);
    },
    [showClosestAtX]
  );
  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLButtonElement>) => {
      const touch = event.touches[0];
      if (!touch) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      showClosestAtX(touch.clientX - bounds.left);
    },
    [showClosestAtX]
  );
  const clearSelection = useCallback(() => {
    hideTooltip();
    setSelectedStatus('');
  }, [hideTooltip]);

  if (!model.hasData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data available for forecast chart.
      </div>
    );
  }

  const todayX = xScale(today);
  const incomeHistoryStart = model.incomeHistory.at(0)?.date.toISOString();
  const incomeHistoryEnd = model.incomeHistory.at(-1)?.date.toISOString();
  const expenseHistoryStart = model.expenseHistory.at(0)?.date.toISOString();
  const expenseHistoryEnd = model.expenseHistory.at(-1)?.date.toISOString();

  return (
    <div className="relative h-full w-full">
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
        <desc>{model.summary}</desc>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.4}
            strokeDasharray="3,3"
            numTicks={5}
          />

          {model.confidenceSeries.flatMap(({ config, runs }) =>
            runs.map((run) => {
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
                  data-end-date={run.at(-1)?.date.toISOString()}
                  d={`${upper.join(' ')} ${lower.join(' ')} Z`}
                  fill={config.color}
                  fillOpacity={0.1}
                />
              );
            })
          )}

          {model.incomeHistory.length > 0 && (
            <LinePath
              data-testid="income-history-line"
              data-start-date={incomeHistoryStart}
              data-end-date={incomeHistoryEnd}
              data={model.incomeHistory}
              x={(point) => xScale(point.date) ?? 0}
              y={(point) => yScale(point.value) ?? 0}
              curve={curveMonotoneX}
              stroke="var(--chart-2)"
              strokeWidth={2}
              strokeOpacity={0.72}
            />
          )}
          {model.expenseHistory.length > 0 && (
            <LinePath
              data-testid="expenses-history-line"
              data-start-date={expenseHistoryStart}
              data-end-date={expenseHistoryEnd}
              data={model.expenseHistory}
              x={(point) => xScale(point.date) ?? 0}
              y={(point) => yScale(point.value) ?? 0}
              curve={curveMonotoneX}
              stroke="var(--chart-1)"
              strokeWidth={2}
              strokeOpacity={0.72}
            />
          )}

          {model.seriesConfigs.map((config) =>
            config.data.length > 0 ? (
              <LinePath
                key={config.key}
                data-testid={`${config.key}-forecast-line`}
                data-start-date={config.data[0].date.toISOString()}
                data-end-date={config.data.at(-1)?.date.toISOString()}
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

          <g data-testid="today-marker" data-date={today.toISOString()}>
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

      <button
        type="button"
        data-testid="forecast-chart-overlay"
        className="absolute cursor-crosshair rounded-sm bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        style={{
          left: MARGIN.left,
          top: MARGIN.top,
          width: innerWidth,
          height: innerHeight,
        }}
        aria-label="Explore cash flow values. Use left and right arrows to move between dates; Home and End jump to the first and last date."
        aria-describedby={statusId}
        onFocus={handleFocus}
        onBlur={clearSelection}
        onKeyDown={handleKeyDown}
        onTouchStart={handleTouchMove}
        onTouchMove={handleTouchMove}
        onMouseMove={handleMouseMove}
        onMouseLeave={clearSelection}
      >
        <span className="sr-only">Explore cash flow chart values</span>
      </button>
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {selectedStatus}
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
  const {
    incomeForecast,
    expenseForecast,
    netForecast,
    incomeHistory,
    expenseHistory,
    formatMoney: formatMoneyProp,
    formatDate: formatDateProp,
  } = props;
  const today = useUtcToday();
  const formatMoney = formatMoneyProp ?? DEFAULT_FORMATTERS.formatMoney;
  const formatDate = formatDateProp ?? DEFAULT_FORMATTERS.formatDate;
  const model = useMemo(
    () =>
      buildForecastModel(
        {
          incomeForecast,
          expenseForecast,
          netForecast,
          incomeHistory,
          expenseHistory,
        },
        today,
        formatMoney,
        formatDate
      ),
    [
      expenseForecast,
      expenseHistory,
      formatDate,
      formatMoney,
      incomeForecast,
      incomeHistory,
      netForecast,
      today,
    ]
  );
  const availableSeries = model.seriesConfigs.filter((config) => {
    if (config.key === 'income') return model.hasIncome;
    if (config.key === 'expenses') return model.hasExpenses;
    return model.hasNet;
  });

  return (
    <div
      data-testid="forecast-chart-layout"
      className="flex h-full min-h-0 flex-col"
    >
      <div
        data-testid="forecast-chart-plot"
        className="relative min-h-0 flex-1"
      >
        <ParentSize>
          {({ width, height }) => {
            if (width < 10 || height < 10) return null;
            return (
              <ForecastPlot
                model={model}
                today={today}
                formatMoney={formatMoney}
                formatDate={formatDate}
                width={width}
                height={height}
              />
            );
          }}
        </ParentSize>
      </div>
      <div
        data-testid="forecast-chart-footer"
        className="shrink-0 pt-2"
      >
        {model.hasData && (
          <div
            data-testid="forecast-legend"
            aria-label="Chart legend"
            className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
          >
            {availableSeries.map((config) => (
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
            {model.hasHistory && <span>Solid lines: history</span>}
            {model.hasForecast && <span>Dashed lines: forecast</span>}
            {model.hasConfidenceArea && (
              <span>Shading: expected range where available</span>
            )}
          </div>
        )}
        <p data-testid="forecast-summary" className="mt-2 text-xs text-foreground">
          {model.summary}
        </p>
      </div>
    </div>
  );
}
