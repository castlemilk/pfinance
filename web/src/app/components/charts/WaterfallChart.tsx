'use client';

import React, { useMemo } from 'react';
import { Bar, Line } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleBand, scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { GridRows } from '@visx/grid';
import { Text } from '@visx/text';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import type { WaterfallBar } from '@/app/metrics/types';

// ============================================================================
// Types
// ============================================================================

interface WaterfallChartProps {
  data: WaterfallBar[];
}

interface TooltipData {
  label: string;
  amount: number;
  type: string;
  runningTotal: number;
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
  return `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactAmount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `$${(value / 1000).toFixed(1)}k`;
  }
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/**
 * Get the color for each bar type.
 * Uses the bar's own color property if set, otherwise falls back to defaults.
 */
function getBarColor(bar: WaterfallBar): string {
  if (bar.color) return bar.color;
  switch (bar.type) {
    case 'income':
      return 'hsl(var(--chart-2))';
    case 'expense':
      return 'hsl(var(--chart-1))';
    case 'tax':
      return 'hsl(var(--chart-4))';
    case 'savings':
      return 'hsl(var(--primary))';
    case 'subtotal':
      return 'hsl(var(--muted-foreground))';
    default:
      return 'hsl(var(--muted-foreground))';
  }
}

// ============================================================================
// Computed Bar Positions
// ============================================================================

interface ComputedBar {
  bar: WaterfallBar;
  barTop: number;
  barBottom: number;
  barHeight: number;
  color: string;
}

function computeBarPositions(data: WaterfallBar[]): ComputedBar[] {
  return data.map((bar) => {
    let barTop: number;
    let barBottom: number;

    if (bar.type === 'subtotal' || bar.type === 'savings') {
      // Subtotal/savings bars go from 0 to runningTotal
      barTop = Math.max(0, bar.runningTotal);
      barBottom = Math.min(0, bar.runningTotal);
    } else if (bar.type === 'income') {
      // Income bars extend upward from (runningTotal - amount) to runningTotal
      barBottom = bar.runningTotal - bar.amount;
      barTop = bar.runningTotal;
    } else {
      // Expense/tax bars extend downward: from previous running total to current
      barTop = bar.runningTotal - bar.amount;
      barBottom = bar.runningTotal;
      // For negative amounts (expense decreasing total), swap
      if (bar.amount < 0) {
        barTop = bar.runningTotal;
        barBottom = bar.runningTotal - bar.amount;
      }
    }

    return {
      bar,
      barTop: Math.max(barTop, barBottom),
      barBottom: Math.min(barTop, barBottom),
      barHeight: Math.abs(barTop - barBottom),
      color: getBarColor(bar),
    };
  });
}

// ============================================================================
// Inner Chart
// ============================================================================

function WaterfallInner({
  data,
  width,
  height,
}: WaterfallChartProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();

  const margin = { top: 24, right: 16, bottom: 60, left: 60 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const computedBars = useMemo(() => computeBarPositions(data), [data]);

  const xScale = useMemo(
    () =>
      scaleBand<string>({
        domain: data.map((d) => d.label),
        range: [0, innerWidth],
        padding: 0.3,
      }),
    [data, innerWidth]
  );

  const yScale = useMemo(() => {
    const allValues = computedBars.flatMap((cb) => [cb.barTop, cb.barBottom, 0]);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const padding = (maxVal - minVal) * 0.1 || 10;
    return scaleLinear<number>({
      domain: [minVal - padding, maxVal + padding],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [computedBars, innerHeight]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available for waterfall chart.
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
            strokeOpacity={0.3}
            strokeDasharray="3,3"
            numTicks={5}
          />

          {/* Zero line */}
          <Line
            from={{ x: 0, y: yScale(0) }}
            to={{ x: innerWidth, y: yScale(0) }}
            stroke="hsl(var(--border))"
            strokeWidth={1}
          />

          {/* Connector lines between bars */}
          {computedBars.map((cb, i) => {
            if (i === computedBars.length - 1) return null;
            const nextCb = computedBars[i + 1];
            const currentX = (xScale(cb.bar.label) ?? 0) + (xScale.bandwidth?.() ?? 0);
            const nextX = xScale(nextCb.bar.label) ?? 0;

            // Connect from the running total of current bar
            const connectY = yScale(cb.bar.runningTotal);

            return (
              <Line
                key={`connector-${i}`}
                from={{ x: currentX, y: connectY }}
                to={{ x: nextX, y: connectY }}
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="2,2"
                strokeOpacity={0.5}
              />
            );
          })}

          {/* Bars */}
          {computedBars.map((cb) => {
            const barX = xScale(cb.bar.label) ?? 0;
            const barW = xScale.bandwidth?.() ?? 0;
            const barY = yScale(cb.barTop);
            const barH = Math.max(1, yScale(cb.barBottom) - yScale(cb.barTop));

            return (
              <g key={`bar-${cb.bar.label}`}>
                <Bar
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  fill={cb.color}
                  fillOpacity={cb.bar.type === 'subtotal' ? 0.5 : 0.85}
                  rx={2}
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(event) => {
                    const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
                    if (!rect) return;
                    showTooltip({
                      tooltipData: {
                        label: cb.bar.label,
                        amount: cb.bar.amount,
                        type: cb.bar.type,
                        runningTotal: cb.bar.runningTotal,
                      },
                      tooltipLeft: event.clientX - rect.left,
                      tooltipTop: event.clientY - rect.top - 10,
                    });
                  }}
                  onMouseLeave={hideTooltip}
                />
                {/* Amount label centered in bar (only if tall enough) */}
                {barH > 16 && (
                  <Text
                    x={barX + barW / 2}
                    y={barY + barH / 2}
                    textAnchor="middle"
                    verticalAnchor="middle"
                    fontSize={10}
                    fill="hsl(var(--foreground))"
                    fontWeight={500}
                  >
                    {formatCompactAmount(cb.bar.amount)}
                  </Text>
                )}
              </g>
            );
          })}

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="hsl(var(--border))"
            tickStroke="hsl(var(--border))"
            tickLabelProps={() => ({
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 10,
              textAnchor: 'middle' as const,
              dy: '0.25em',
            })}
            tickComponent={({ x, y, formattedValue }) => (
              <text
                x={x}
                y={y}
                dy="0.75em"
                fontSize={10}
                fill="hsl(var(--muted-foreground))"
                textAnchor="middle"
                style={{
                  maxWidth: xScale.bandwidth?.() ?? 60,
                  overflow: 'hidden',
                }}
              >
                {formattedValue}
              </text>
            )}
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
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltipData.label}</div>
          <div>Amount: {formatAmount(tooltipData.amount)}</div>
          <div>Running Total: {formatAmount(tooltipData.runningTotal)}</div>
          <div style={{ marginTop: 4, fontSize: 10, color: 'hsl(var(--muted-foreground))' }}>
            Type: {tooltipData.type}
          </div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

// ============================================================================
// Exported Responsive Wrapper
// ============================================================================

export default function WaterfallChart(props: WaterfallChartProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 300);
        return <WaterfallInner {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
