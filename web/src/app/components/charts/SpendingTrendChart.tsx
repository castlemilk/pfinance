'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { AreaClosed, Bar, Line, LinePath } from '@visx/shape';
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

import { fittedTrendEndpoints, forecastDomain } from './analyticsChartMath';

interface DataPoint {
  date: string;
  value: number;
  label?: string;
}

interface SpendingTrendChartProps {
  expenseSeries: DataPoint[];
  incomeSeries?: DataPoint[];
  trendSlope?: number;
  trendRSquared?: number;
  formatMoney?: AnalyticsCurrencyContext['formatMoney'];
  formatDate?: AnalyticsCurrencyContext['formatDate'];
}

interface ParsedPoint {
  date: Date;
  value: number;
  label?: string;
}

interface TooltipData {
  date: Date;
  expense?: number;
  income?: number;
  label?: string;
}

const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const MARGIN = { top: 18, right: 16, bottom: 40, left: 64 } as const;

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

const bisectDate = bisector<ParsedPoint, Date>((point) => point.date).left;

function parsePoints(points: readonly DataPoint[]): ParsedPoint[] {
  return points
    .map((point) => ({
      date: new Date(point.date),
      value: point.value,
      label: point.label,
    }))
    .filter(
      (point) =>
        Number.isFinite(point.date.getTime()) && Number.isFinite(point.value)
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

function confidenceCopy(rSquared: number | undefined): string | null {
  if (rSquared == null || !Number.isFinite(rSquared)) return null;
  if (rSquared >= 0.75) return 'The direction is consistent across this window.';
  if (rSquared >= 0.4) return 'The direction varies across this window.';
  return 'The direction is tentative because spending varies widely.';
}

function TrendChart({
  expenseSeries,
  incomeSeries,
  trendSlope,
  trendRSquared,
  formatMoney = DEFAULT_FORMATTERS.formatMoney,
  formatDate = DEFAULT_FORMATTERS.formatDate,
  width,
  height,
}: SpendingTrendChartProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();
  const [keyboardIndex, setKeyboardIndex] = useState(0);

  const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);

  const parsedExpenses = useMemo(() => parsePoints(expenseSeries), [expenseSeries]);
  const parsedIncomes = useMemo(
    () => parsePoints(incomeSeries ?? []),
    [incomeSeries]
  );
  const allPoints = useMemo(
    () => [...parsedExpenses, ...parsedIncomes],
    [parsedExpenses, parsedIncomes]
  );
  const timeline = useMemo(() => {
    const byTime = new Map<number, ParsedPoint>();
    for (const point of parsedExpenses) {
      byTime.set(point.date.getTime(), point);
    }
    for (const point of parsedIncomes) {
      if (!byTime.has(point.date.getTime())) {
        byTime.set(point.date.getTime(), point);
      }
    }
    return [...byTime.values()].sort(
      (left, right) => left.date.getTime() - right.date.getTime()
    );
  }, [parsedExpenses, parsedIncomes]);
  const incomeMap = useMemo(
    () =>
      new Map(
        parsedIncomes.map((point) => [point.date.getTime(), point.value] as const)
      ),
    [parsedIncomes]
  );
  const expenseMap = useMemo(
    () =>
      new Map(
        parsedExpenses.map((point) => [point.date.getTime(), point.value] as const)
      ),
    [parsedExpenses]
  );

  const fitted = useMemo(
    () =>
      trendSlope == null || parsedExpenses.length < 2
        ? null
        : fittedTrendEndpoints(
            parsedExpenses.map((point) => point.value),
            trendSlope
          ),
    [parsedExpenses, trendSlope]
  );
  const trendLine = useMemo(() => {
    if (!fitted || parsedExpenses.length < 2) return null;
    return [
      { date: parsedExpenses[0].date, value: fitted.start },
      {
        date: parsedExpenses[parsedExpenses.length - 1].date,
        value: fitted.end,
      },
    ];
  }, [fitted, parsedExpenses]);

  const xDomain = useMemo(
    () => forecastDomain(allPoints.map((point) => point.date), []),
    [allPoints]
  );
  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [...xDomain],
        range: [0, innerWidth],
      }),
    [innerWidth, xDomain]
  );

  const valueDomain = useMemo(
    () =>
      paddedValueDomain([
        ...allPoints.map((point) => point.value),
        ...(fitted ? [fitted.start, fitted.end] : []),
      ]),
    [allPoints, fitted]
  );
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

  const trendSummary = useMemo(() => {
    if (!fitted || trendSlope == null) {
      return 'Add more spending history to estimate a direction.';
    }
    if (trendSlope === 0) {
      return 'Spending is broadly steady per period.';
    }
    const direction = trendSlope > 0 ? 'rising' : 'falling';
    return `Spending is ${direction} by ${formatMoney(
      Math.abs(trendSlope)
    )} per period.`;
  }, [fitted, formatMoney, trendSlope]);
  const patternSummary = confidenceCopy(trendRSquared);

  const showPointTooltip = useCallback(
    (point: ParsedPoint) => {
      const time = point.date.getTime();
      const expense = expenseMap.get(time);
      const income = incomeMap.get(time);
      const displayValue = expense ?? income ?? point.value;
      showTooltip({
        tooltipData: {
          date: point.date,
          expense,
          income,
          label: point.label,
        },
        tooltipLeft: xScale(point.date) + MARGIN.left,
        tooltipTop: yScale(displayValue) + MARGIN.top,
      });
    },
    [expenseMap, incomeMap, showTooltip, xScale, yScale]
  );

  const handleFocus = useCallback(() => {
    if (timeline.length === 0) return;
    setKeyboardIndex(0);
    showPointTooltip(timeline[0]);
  }, [showPointTooltip, timeline]);
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
      showPointTooltip(timeline[nextIndex]);
    },
    [hideTooltip, keyboardIndex, showPointTooltip, timeline]
  );

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      if (timeline.length === 0) return;
      const point = localPoint(event) ?? { x: MARGIN.left };
      const targetDate = xScale.invert(point.x - MARGIN.left);
      const index = bisectDate(timeline, targetDate, 1);
      const previous = timeline[index - 1];
      const next = timeline[index];
      const closest =
        previous && next
          ? targetDate.getTime() - previous.date.getTime() >
            next.date.getTime() - targetDate.getTime()
            ? next
            : previous
          : previous ?? next;
      if (closest) showPointTooltip(closest);
    },
    [showPointTooltip, timeline, xScale]
  );

  if (allPoints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No data available for trend chart.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Spending over time"
        data-x-domain-start={xDomain[0].getTime()}
        data-x-domain-end={xDomain[1].getTime()}
        data-y-domain-min={renderedYDomain[0]}
        data-y-domain-max={renderedYDomain[1]}
      >
        <title>Spending over time</title>
        <desc>{trendSummary}</desc>
        <Group left={MARGIN.left} top={MARGIN.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.5}
            strokeDasharray="3,3"
            numTicks={5}
          />

          {parsedIncomes.length > 0 && (
            <>
              <AreaClosed
                data={parsedIncomes}
                x={(point) => xScale(point.date) ?? 0}
                y={(point) => yScale(point.value) ?? 0}
                y0={() => yScale(0)}
                yScale={yScale}
                curve={curveMonotoneX}
                fill="var(--chart-2)"
                fillOpacity={0.16}
              />
              <LinePath
                data={parsedIncomes}
                x={(point) => xScale(point.date) ?? 0}
                y={(point) => yScale(point.value) ?? 0}
                curve={curveMonotoneX}
                stroke="var(--chart-2)"
                strokeWidth={2}
              />
            </>
          )}

          {parsedExpenses.length > 0 && (
            <>
              <AreaClosed
                data={parsedExpenses}
                x={(point) => xScale(point.date) ?? 0}
                y={(point) => yScale(point.value) ?? 0}
                y0={() => yScale(0)}
                yScale={yScale}
                curve={curveMonotoneX}
                fill="var(--chart-1)"
                fillOpacity={0.18}
              />
              <LinePath
                data={parsedExpenses}
                x={(point) => xScale(point.date) ?? 0}
                y={(point) => yScale(point.value) ?? 0}
                curve={curveMonotoneX}
                stroke="var(--chart-1)"
                strokeWidth={2}
              />
            </>
          )}

          {trendLine && fitted && (
            <LinePath
              data-testid="spending-trend-line"
              data-start-value={fitted.start}
              data-end-value={fitted.end}
              data={trendLine}
              x={(point) => xScale(point.date) ?? 0}
              y={(point) => yScale(point.value) ?? 0}
              stroke="var(--primary)"
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
          )}

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(6, Math.max(2, allPoints.length))}
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
            data-testid="spending-chart-overlay"
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            tabIndex={0}
            aria-label="Explore spending values. Use the left and right arrow keys to move between periods."
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            onTouchStart={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseMove={handleTooltip}
            onMouseLeave={hideTooltip}
          />

          {tooltipOpen && tooltipData && (
            <>
              <Line
                from={{ x: (tooltipLeft ?? 0) - MARGIN.left, y: 0 }}
                to={{ x: (tooltipLeft ?? 0) - MARGIN.left, y: innerHeight }}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
              <circle
                cx={(tooltipLeft ?? 0) - MARGIN.left}
                cy={(tooltipTop ?? 0) - MARGIN.top}
                r={4}
                fill="var(--chart-1)"
                stroke="var(--background)"
                strokeWidth={2}
                pointerEvents="none"
              />
            </>
          )}
        </Group>
      </svg>

      <p
        data-testid="spending-trend-summary"
        className="mt-2 text-xs text-muted-foreground"
      >
        {trendSummary}
        {patternSummary ? ` ${patternSummary}` : ''}
      </p>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {formatDate(tooltipData.date, { day: 'numeric', month: 'short' })}
          </div>
          {tooltipData.expense != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Expenses: {formatMoney(tooltipData.expense)}
            </div>
          )}
          {tooltipData.income != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Income: {formatMoney(tooltipData.income)}
            </div>
          )}
        </TooltipWithBounds>
      )}
    </div>
  );
}

export default function SpendingTrendChart(props: SpendingTrendChartProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        return (
          <TrendChart
            {...props}
            width={width}
            height={Math.max(height, 250)}
          />
        );
      }}
    </ParentSize>
  );
}
