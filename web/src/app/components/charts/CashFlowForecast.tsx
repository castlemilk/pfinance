'use client';

import React, { useMemo, useCallback } from 'react';
import { AreaClosed, LinePath, Line, Bar } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { scaleTime, scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import { localPoint } from '@visx/event';
import { bisector } from 'd3-array';
import type { ForecastSeries } from '@/app/metrics/types';

// ============================================================================
// Types
// ============================================================================

interface CashFlowForecastProps {
  incomeForecast: ForecastSeries[];
  expenseForecast: ForecastSeries[];
  netForecast: ForecastSeries[];
  historicalDays?: number;
}

interface TooltipData {
  date: Date;
  isForecast: boolean;
  income?: { predicted: number; lower: number; upper: number };
  expense?: { predicted: number; lower: number; upper: number };
  net?: { predicted: number; lower: number; upper: number };
}

// ============================================================================
// Helpers
// ============================================================================

const tooltipStyles: React.CSSProperties = {
  ...defaultStyles,
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
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

interface SeriesConfig {
  label: string;
  data: ForecastSeries[];
  color: string;
}

const bisectDate = bisector<ForecastSeries, Date>((d) => d.date).left;

// ============================================================================
// Inner Chart
// ============================================================================

function ForecastChart({
  incomeForecast,
  expenseForecast,
  netForecast,
  historicalDays = 30,
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

  const margin = { top: 16, right: 16, bottom: 40, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const seriesConfigs: SeriesConfig[] = useMemo(
    () => [
      { label: 'Income', data: incomeForecast, color: 'var(--chart-2)' },
      { label: 'Expenses', data: expenseForecast, color: 'var(--chart-1)' },
      { label: 'Net', data: netForecast, color: 'var(--primary)' },
    ],
    [incomeForecast, expenseForecast, netForecast]
  );

  // Compute "today" divider line position
  const today = useMemo(() => new Date(), []);

  // All dates and values for scale computation
  const allSeries = useMemo(
    () => [...incomeForecast, ...expenseForecast, ...netForecast],
    [incomeForecast, expenseForecast, netForecast]
  );

  const xScale = useMemo(() => {
    if (allSeries.length === 0) {
      return scaleTime<number>({ domain: [new Date(), new Date()], range: [0, innerWidth] });
    }
    return scaleTime<number>({
      domain: [
        new Date(Math.min(...allSeries.map((d) => d.date.getTime()))),
        new Date(Math.max(...allSeries.map((d) => d.date.getTime()))),
      ],
      range: [0, innerWidth],
    });
  }, [allSeries, innerWidth]);

  const yScale = useMemo(() => {
    if (allSeries.length === 0) {
      return scaleLinear<number>({ domain: [0, 100], range: [innerHeight, 0] });
    }
    const allValues = allSeries.flatMap((d) => [d.predicted, d.lowerBound, d.upperBound]);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = (maxVal - minVal) * 0.1 || 10;
    return scaleLinear<number>({
      domain: [Math.min(0, minVal - padding), maxVal + padding],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [allSeries, innerHeight]);

  // Determine which data points are "future" for confidence band rendering
  const isFuture = useCallback(
    (date: Date) => date.getTime() > today.getTime(),
    [today]
  );

  // Tooltip handler
  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event) || { x: 0 };
      const x0 = xScale.invert(point.x - margin.left);

      // Find closest point in each series
      const findClosest = (series: ForecastSeries[]): ForecastSeries | null => {
        if (series.length === 0) return null;
        const idx = bisectDate(series, x0, 1);
        const d0 = series[idx - 1];
        const d1 = series[idx];
        if (!d0 && !d1) return null;
        if (!d0) return d1;
        if (!d1) return d0;
        return x0.getTime() - d0.date.getTime() > d1.date.getTime() - x0.getTime() ? d1 : d0;
      };

      const closestIncome = findClosest(incomeForecast);
      const closestExpense = findClosest(expenseForecast);
      const closestNet = findClosest(netForecast);

      // Use any available series for date
      const refPoint = closestIncome ?? closestExpense ?? closestNet;
      if (!refPoint) return;

      showTooltip({
        tooltipData: {
          date: refPoint.date,
          isForecast: isFuture(refPoint.date),
          income: closestIncome
            ? { predicted: closestIncome.predicted, lower: closestIncome.lowerBound, upper: closestIncome.upperBound }
            : undefined,
          expense: closestExpense
            ? { predicted: closestExpense.predicted, lower: closestExpense.lowerBound, upper: closestExpense.upperBound }
            : undefined,
          net: closestNet
            ? { predicted: closestNet.predicted, lower: closestNet.lowerBound, upper: closestNet.upperBound }
            : undefined,
        },
        tooltipLeft: xScale(refPoint.date) + margin.left,
        tooltipTop: yScale(refPoint.predicted) + margin.top,
      });
    },
    [xScale, yScale, margin, incomeForecast, expenseForecast, netForecast, isFuture, showTooltip]
  );

  if (allSeries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available for forecast chart.
      </div>
    );
  }

  const todayX = xScale(today);

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {/* Grid */}
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.3}
            strokeDasharray="3,3"
            numTicks={5}
          />

          {/* Confidence bands (only for future dates) */}
          {seriesConfigs.map((config) => {
            const futureData = config.data.filter((d) => isFuture(d.date));
            if (futureData.length < 2) return null;

            // Build the band as a polygon: upper path forward, lower path backward
            const upperPoints = futureData.map((d) => ({
              date: d.date,
              value: d.upperBound,
            }));
            const lowerPoints = [...futureData].reverse().map((d) => ({
              date: d.date,
              value: d.lowerBound,
            }));

            const bandPath =
              upperPoints
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScale(p.date)} ${yScale(p.value)}`)
                .join(' ') +
              ' ' +
              lowerPoints
                .map((p) => `L ${xScale(p.date)} ${yScale(p.value)}`)
                .join(' ') +
              ' Z';

            return (
              <path
                key={`band-${config.label}`}
                d={bandPath}
                fill={config.color}
                fillOpacity={0.1}
              />
            );
          })}

          {/* Main prediction lines */}
          {seriesConfigs.map((config) => (
            <LinePath
              key={`line-${config.label}`}
              data={config.data}
              x={(d) => xScale(d.date) ?? 0}
              y={(d) => yScale(d.predicted) ?? 0}
              curve={curveMonotoneX}
              stroke={config.color}
              strokeWidth={2}
              strokeDasharray={
                // Future portion could be dashed, but we keep solid for the main line
                undefined
              }
            />
          ))}

          {/* Vertical "Today" line */}
          {todayX >= 0 && todayX <= innerWidth && (
            <>
              <Line
                from={{ x: todayX, y: 0 }}
                to={{ x: todayX, y: innerHeight }}
                stroke="var(--muted-foreground)"
                strokeWidth={1}
                strokeDasharray="6,4"
              />
              <text
                x={todayX}
                y={-4}
                textAnchor="middle"
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                Today
              </text>
            </>
          )}

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={6}
            tickFormat={(d) => formatDateLabel(d as Date)}
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
            tickFormat={(d) => `$${(d as number).toLocaleString()}`}
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

          {/* Invisible overlay for tooltip */}
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
            <Line
              from={{ x: (tooltipLeft ?? 0) - margin.left, y: 0 }}
              to={{ x: (tooltipLeft ?? 0) - margin.left, y: innerHeight }}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          )}
        </Group>
      </svg>

      {/* Legend */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: margin.right + 4,
          display: 'flex',
          gap: 12,
          fontSize: 10,
          color: 'var(--muted-foreground)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 12, height: 2, backgroundColor: 'var(--chart-2)', display: 'inline-block' }} />
          Income
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 12, height: 2, backgroundColor: 'var(--chart-1)', display: 'inline-block' }} />
          Expenses
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 12, height: 2, backgroundColor: 'var(--primary)', display: 'inline-block' }} />
          Net
        </span>
      </div>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {formatDateLabel(tooltipData.date)}
            {tooltipData.isForecast && (
              <span style={{ fontWeight: 400, fontSize: 10, marginLeft: 6, color: 'var(--muted-foreground)' }}>
                (Forecast)
              </span>
            )}
          </div>
          {tooltipData.income && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--chart-2)', display: 'inline-block' }} />
              Income: {formatAmount(tooltipData.income.predicted)}
              {tooltipData.isForecast && (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                  ({formatAmount(tooltipData.income.lower)} - {formatAmount(tooltipData.income.upper)})
                </span>
              )}
            </div>
          )}
          {tooltipData.expense && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--chart-1)', display: 'inline-block' }} />
              Expenses: {formatAmount(tooltipData.expense.predicted)}
              {tooltipData.isForecast && (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                  ({formatAmount(tooltipData.expense.lower)} - {formatAmount(tooltipData.expense.upper)})
                </span>
              )}
            </div>
          )}
          {tooltipData.net && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--primary)', display: 'inline-block' }} />
              Net: {formatAmount(tooltipData.net.predicted)}
              {tooltipData.isForecast && (
                <span style={{ fontSize: 10, color: 'var(--muted-foreground)' }}>
                  ({formatAmount(tooltipData.net.lower)} - {formatAmount(tooltipData.net.upper)})
                </span>
              )}
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

export default function CashFlowForecast(props: CashFlowForecastProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 280);
        return <ForecastChart {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
