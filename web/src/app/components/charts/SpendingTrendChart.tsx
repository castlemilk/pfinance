'use client';

import React, { useMemo, useCallback } from 'react';
import { AreaClosed, LinePath, Bar, Line } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { scaleTime, scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { bisector } from 'd3-array';

// ============================================================================
// Types
// ============================================================================

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
}

interface TooltipData {
  date: Date;
  expense: number;
  income?: number;
  label?: string;
}

// ============================================================================
// Helpers
// ============================================================================

const tooltipStyles: React.CSSProperties = {
  ...defaultStyles,
  backgroundColor: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  fontSize: '12px',
  padding: '8px 12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
};

function formatAmount(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

interface ParsedPoint {
  date: Date;
  value: number;
  label?: string;
}

const bisectDate = bisector<ParsedPoint, Date>((d) => d.date).left;

// ============================================================================
// Inner Chart
// ============================================================================

function TrendChart({
  expenseSeries,
  incomeSeries,
  trendSlope,
  trendRSquared,
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

  const margin = { top: 16, right: 16, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const parsedExpenses = useMemo(
    () =>
      expenseSeries
        .map((d) => ({ date: parseDate(d.date), value: d.value, label: d.label }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()),
    [expenseSeries]
  );

  const parsedIncomes = useMemo(
    () =>
      incomeSeries
        ?.map((d) => ({ date: parseDate(d.date), value: d.value, label: d.label }))
        .sort((a, b) => a.date.getTime() - b.date.getTime()) ?? [],
    [incomeSeries]
  );

  // Build income lookup map for tooltip
  const incomeMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of parsedIncomes) {
      map.set(p.date.toISOString().split('T')[0], p.value);
    }
    return map;
  }, [parsedIncomes]);

  // Scales
  const allPoints = useMemo(() => [...parsedExpenses, ...parsedIncomes], [parsedExpenses, parsedIncomes]);

  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [
          Math.min(...allPoints.map((d) => d.date.getTime())),
          Math.max(...allPoints.map((d) => d.date.getTime())),
        ],
        range: [0, innerWidth],
      }),
    [allPoints, innerWidth]
  );

  const yMax = useMemo(() => Math.max(...allPoints.map((d) => d.value), 0) * 1.1, [allPoints]);

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMax],
        range: [innerHeight, 0],
        nice: true,
      }),
    [yMax, innerHeight]
  );

  // Trend line endpoints
  const trendLine = useMemo(() => {
    if (trendSlope == null || parsedExpenses.length < 2) return null;
    const firstDate = parsedExpenses[0].date.getTime();
    const lastDate = parsedExpenses[parsedExpenses.length - 1].date.getTime();
    const firstValue = parsedExpenses[0].value;
    // Simple linear: y = firstValue + slope * (daysDiff)
    const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);
    const lastValue = firstValue + trendSlope * daysDiff;
    return [
      { date: parsedExpenses[0].date, value: firstValue },
      { date: parsedExpenses[parsedExpenses.length - 1].date, value: lastValue },
    ];
  }, [parsedExpenses, trendSlope]);

  // Tooltip handler
  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event) || { x: 0 };
      const x0 = xScale.invert(point.x - margin.left);
      const index = bisectDate(parsedExpenses, x0, 1);
      const d0 = parsedExpenses[index - 1];
      const d1 = parsedExpenses[index];
      let d = d0;
      if (d1 && d0) {
        d = x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? d1 : d0;
      }
      if (!d) return;

      const dateKey = d.date.toISOString().split('T')[0];
      showTooltip({
        tooltipData: {
          date: d.date,
          expense: d.value,
          income: incomeMap.get(dateKey),
          label: d.label,
        },
        tooltipLeft: xScale(d.date) + margin.left,
        tooltipTop: yScale(d.value) + margin.top,
      });
    },
    [xScale, yScale, parsedExpenses, incomeMap, margin.left, margin.top, showTooltip]
  );

  if (expenseSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available for trend chart.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {/* Grid */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="hsl(var(--border))"
            strokeOpacity={0.5}
            strokeDasharray="3,3"
            numTicks={5}
          />

          {/* Income area */}
          {parsedIncomes.length > 0 && (
            <>
              <AreaClosed
                data={parsedIncomes}
                x={(d) => xScale(d.date) ?? 0}
                y={(d) => yScale(d.value) ?? 0}
                yScale={yScale}
                curve={curveMonotoneX}
                fill="hsl(var(--chart-2))"
                fillOpacity={0.2}
              />
              <LinePath
                data={parsedIncomes}
                x={(d) => xScale(d.date) ?? 0}
                y={(d) => yScale(d.value) ?? 0}
                curve={curveMonotoneX}
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
              />
            </>
          )}

          {/* Expense area */}
          <AreaClosed
            data={parsedExpenses}
            x={(d) => xScale(d.date) ?? 0}
            y={(d) => yScale(d.value) ?? 0}
            yScale={yScale}
            curve={curveMonotoneX}
            fill="hsl(var(--chart-1))"
            fillOpacity={0.2}
          />
          <LinePath
            data={parsedExpenses}
            x={(d) => xScale(d.date) ?? 0}
            y={(d) => yScale(d.value) ?? 0}
            curve={curveMonotoneX}
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
          />

          {/* Trend line */}
          {trendLine && (
            <LinePath
              data={trendLine}
              x={(d) => xScale(d.date) ?? 0}
              y={(d) => yScale(d.value) ?? 0}
              stroke="hsl(var(--primary))"
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
          )}

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(6, expenseSeries.length)}
            tickFormat={(d) => formatDateLabel(d as Date)}
            stroke="hsl(var(--border))"
            tickStroke="hsl(var(--border))"
            tickLabelProps={() => ({
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
              textAnchor: 'middle' as const,
            })}
          />
          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={(d) => `$${(d as number).toLocaleString()}`}
            stroke="hsl(var(--border))"
            tickStroke="hsl(var(--border))"
            tickLabelProps={() => ({
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
              textAnchor: 'end' as const,
              dx: '-0.25em',
              dy: '0.25em',
            })}
          />

          {/* Invisible overlay for tooltip interaction */}
          <Bar
            x={0}
            y={0}
            width={innerWidth}
            height={innerHeight}
            fill="transparent"
            onTouchStart={handleTooltip}
            onTouchMove={handleTooltip}
            onMouseMove={handleTooltip}
            onMouseLeave={hideTooltip}
          />

          {/* Crosshair on hover */}
          {tooltipOpen && tooltipData && (
            <>
              <Line
                from={{ x: (tooltipLeft ?? 0) - margin.left, y: 0 }}
                to={{ x: (tooltipLeft ?? 0) - margin.left, y: innerHeight }}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="3,3"
                pointerEvents="none"
              />
              <circle
                cx={(tooltipLeft ?? 0) - margin.left}
                cy={(tooltipTop ?? 0) - margin.top}
                r={4}
                fill="hsl(var(--chart-1))"
                stroke="hsl(var(--background))"
                strokeWidth={2}
                pointerEvents="none"
              />
            </>
          )}
        </Group>
      </svg>

      {/* R-squared annotation */}
      {trendRSquared != null && (
        <div
          style={{
            position: 'absolute',
            top: margin.top + 4,
            right: margin.right + 4,
            fontSize: 10,
            color: 'hsl(var(--muted-foreground))',
          }}
        >
          R² = {trendRSquared.toFixed(3)}
        </div>
      )}

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {formatDateLabel(tooltipData.date)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'hsl(var(--chart-1))', display: 'inline-block' }} />
            Expenses: {formatAmount(tooltipData.expense)}
          </div>
          {tooltipData.income != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'hsl(var(--chart-2))', display: 'inline-block' }} />
              Income: {formatAmount(tooltipData.income)}
            </div>
          )}
        </TooltipWithBounds>
      )}
    </div>
  );
}

// ============================================================================
// Exported Responsive Wrapper
// ============================================================================

export default function SpendingTrendChart(props: SpendingTrendChartProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 250);
        return <TrendChart {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
