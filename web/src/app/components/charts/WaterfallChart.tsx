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
import { createAnalyticsCurrencyContext } from '@/app/components/analytics/formatting';
import type { AnalyticsCurrencyContext } from '@/app/components/analytics/types';
import type { WaterfallBar } from '@/app/metrics/types';

// ============================================================================
// Types
// ============================================================================

interface WaterfallChartProps {
  data: WaterfallBar[];
  formatMoney?: AnalyticsCurrencyContext['formatMoney'];
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
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: '6px',
  fontSize: '12px',
  fontFamily: 'var(--font-mono)',
  padding: '8px 12px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
};
const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const WATERFALL_MARGIN = { top: 24, right: 16, bottom: 78, left: 60 } as const;
const MIN_WATERFALL_BAR_WIDTH = 88;

/**
 * Get the color for each bar type.
 * Uses the bar's own color property if set, otherwise falls back to defaults.
 */
function getBarColor(bar: WaterfallBar): string {
  if (bar.color) return bar.color;
  switch (bar.type) {
    case 'income':
      return 'var(--chart-2)';
    case 'expense':
      return 'var(--chart-1)';
    case 'tax':
      return 'var(--chart-4)';
    case 'savings':
      return 'var(--primary)';
    case 'subtotal':
      return 'var(--muted-foreground)';
    default:
      return 'var(--muted-foreground)';
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
    let firstEndpoint: number;
    let secondEndpoint: number;

    if (bar.type === 'subtotal' || bar.type === 'savings') {
      firstEndpoint = 0;
      secondEndpoint = bar.runningTotal;
    } else {
      // Amount is the signed cash-flow effect supplied by the frontend mapper.
      firstEndpoint = bar.runningTotal - bar.amount;
      secondEndpoint = bar.runningTotal;
    }

    const barTop = Math.max(firstEndpoint, secondEndpoint);
    const barBottom = Math.min(firstEndpoint, secondEndpoint);

    return {
      bar,
      barTop,
      barBottom,
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
  formatMoney = DEFAULT_FORMATTERS.formatMoney,
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

  const margin = WATERFALL_MARGIN;
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
      <svg aria-hidden="true" focusable="false" width={width} height={height}>
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

          {/* Zero line */}
          <Line
            from={{ x: 0, y: yScale(0) }}
            to={{ x: innerWidth, y: yScale(0) }}
            stroke="var(--border)"
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
                stroke="var(--muted-foreground)"
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
                    fill="var(--foreground)"
                    fontFamily="var(--font-mono)"
                    fontWeight={500}
                  >
                    {formatMoney(cb.bar.amount, true)}
                  </Text>
                )}
              </g>
            );
          })}

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            stroke="var(--border)"
            tickStroke="var(--border)"
            tickLabelProps={() => ({
              fill: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
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
                fontFamily="var(--font-mono)"
                fill="var(--muted-foreground)"
                textAnchor="end"
                transform={`rotate(-25 ${x} ${y})`}
              >
                {formattedValue}
              </text>
            )}
          />
          <AxisLeft
            scale={yScale}
            numTicks={5}
            tickFormat={(value) => formatMoney(value as number, true)}
            stroke="var(--border)"
            tickStroke="var(--border)"
            tickLabelProps={() => ({
              fill: 'var(--muted-foreground)',
              fontFamily: 'var(--font-mono)',
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
          <div>Amount: {formatMoney(tooltipData.amount)}</div>
          <div>Running Total: {formatMoney(tooltipData.runningTotal)}</div>
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted-foreground)' }}>
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
        const minimumWidth =
          WATERFALL_MARGIN.left +
          WATERFALL_MARGIN.right +
          Math.max(props.data.length, 1) * MIN_WATERFALL_BAR_WIDTH;
        const chartWidth = Math.max(width, minimumWidth);
        const isScrollable = chartWidth > width;

        return (
          <div
            role="region"
            aria-label="Scrollable money-flow chart"
            tabIndex={isScrollable ? 0 : undefined}
            className="h-full w-full max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-[10px] outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
          >
            <WaterfallInner
              {...props}
              width={chartWidth}
              height={chartHeight}
            />
          </div>
        );
      }}
    </ParentSize>
  );
}
