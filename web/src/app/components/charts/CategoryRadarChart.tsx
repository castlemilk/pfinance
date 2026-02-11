'use client';

import React, { useMemo, useCallback } from 'react';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import type { RadarAxis } from '@/app/metrics/types';

// ============================================================================
// Types
// ============================================================================

interface CategoryRadarChartProps {
  data: RadarAxis[];
}

interface TooltipData {
  category: string;
  currentValue: number;
  previousValue: number;
  budgetValue?: number;
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

function angleSlice(index: number, total: number): number {
  return (Math.PI * 2 * index) / total - Math.PI / 2;
}

function polarToCartesian(angle: number, radius: number, cx: number, cy: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/** Build a polygon path from data values */
function buildPolygonPath(
  data: RadarAxis[],
  getValue: (d: RadarAxis) => number,
  cx: number,
  cy: number,
  maxRadius: number
): string {
  return data
    .map((d, i) => {
      const angle = angleSlice(i, data.length);
      const normalized = d.maxValue > 0 ? getValue(d) / d.maxValue : 0;
      const r = Math.min(normalized, 1.2) * maxRadius; // Cap at 120% for overflow
      const { x, y } = polarToCartesian(angle, r, cx, cy);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ') + ' Z';
}

// ============================================================================
// Concentric guide levels
// ============================================================================

const GUIDE_LEVELS = [0.25, 0.5, 0.75, 1.0];

// ============================================================================
// Inner Chart
// ============================================================================

function RadarChart({
  data,
  width,
  height,
}: CategoryRadarChartProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();

  // Fit chart into available space
  const size = Math.min(width, height, 400);
  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.35; // Leave room for labels
  const labelRadius = maxRadius + 20;

  const hasBudget = useMemo(() => data.some((d) => d.budgetValue != null), [data]);

  // Polygon paths
  const currentPath = useMemo(
    () => buildPolygonPath(data, (d) => d.currentValue, cx, cy, maxRadius),
    [data, cx, cy, maxRadius]
  );

  const previousPath = useMemo(
    () => buildPolygonPath(data, (d) => d.previousValue, cx, cy, maxRadius),
    [data, cx, cy, maxRadius]
  );

  const budgetPath = useMemo(
    () =>
      hasBudget
        ? buildPolygonPath(data, (d) => d.budgetValue ?? 0, cx, cy, maxRadius)
        : null,
    [data, hasBudget, cx, cy, maxRadius]
  );

  const handleAxisHover = useCallback(
    (event: React.MouseEvent, d: RadarAxis) => {
      const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
      if (!rect) return;
      showTooltip({
        tooltipData: {
          category: d.category,
          currentValue: d.currentValue,
          previousValue: d.previousValue,
          budgetValue: d.budgetValue,
        },
        tooltipLeft: event.clientX - rect.left,
        tooltipTop: event.clientY - rect.top - 10,
      });
    },
    [showTooltip]
  );

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available for radar chart.
      </div>
    );
  }

  // Offset to center the chart in the available width/height
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        <Group left={offsetX} top={offsetY}>
          {/* Concentric guide circles */}
          {GUIDE_LEVELS.map((level) => (
            <circle
              key={`guide-${level}`}
              cx={cx}
              cy={cy}
              r={maxRadius * level}
              fill="none"
              stroke="var(--border)"
              strokeOpacity={0.4}
              strokeDasharray={level < 1 ? '2,3' : undefined}
            />
          ))}

          {/* Axis lines from center to edge */}
          {data.map((_, i) => {
            const angle = angleSlice(i, data.length);
            const end = polarToCartesian(angle, maxRadius, cx, cy);
            return (
              <line
                key={`axis-${i}`}
                x1={cx}
                y1={cy}
                x2={end.x}
                y2={end.y}
                stroke="var(--border)"
                strokeOpacity={0.4}
              />
            );
          })}

          {/* Budget polygon (dashed amber) */}
          {budgetPath && (
            <path
              d={budgetPath}
              fill="none"
              stroke="var(--chart-4)"
              strokeWidth={1.5}
              strokeDasharray="5,3"
              opacity={0.7}
            />
          )}

          {/* Previous period polygon (outline muted) */}
          <path
            d={previousPath}
            fill="var(--muted)"
            fillOpacity={0.15}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />

          {/* Current period polygon (filled primary) */}
          <path
            d={currentPath}
            fill="var(--primary)"
            fillOpacity={0.25}
            stroke="var(--primary)"
            strokeWidth={2}
          />

          {/* Axis dots (current) */}
          {data.map((d, i) => {
            const angle = angleSlice(i, data.length);
            const normalized = d.maxValue > 0 ? d.currentValue / d.maxValue : 0;
            const r = Math.min(normalized, 1.2) * maxRadius;
            const pos = polarToCartesian(angle, r, cx, cy);
            return (
              <circle
                key={`dot-${i}`}
                cx={pos.x}
                cy={pos.y}
                r={3.5}
                fill="var(--primary)"
                stroke="var(--background)"
                strokeWidth={1.5}
              />
            );
          })}

          {/* Axis labels */}
          {data.map((d, i) => {
            const angle = angleSlice(i, data.length);
            const pos = polarToCartesian(angle, labelRadius, cx, cy);
            // Determine text anchor based on position
            let textAnchor: 'start' | 'middle' | 'end' = 'middle';
            if (pos.x > cx + 5) textAnchor = 'start';
            else if (pos.x < cx - 5) textAnchor = 'end';
            return (
              <text
                key={`label-${i}`}
                x={pos.x}
                y={pos.y}
                textAnchor={textAnchor}
                dominantBaseline="middle"
                fontSize={11}
                fill="var(--foreground)"
                style={{ fontWeight: 500 }}
              >
                {d.category}
              </text>
            );
          })}

          {/* Invisible hover zones per axis for tooltip */}
          {data.map((d, i) => {
            const angle = angleSlice(i, data.length);
            const end = polarToCartesian(angle, maxRadius + 10, cx, cy);
            return (
              <line
                key={`hover-${i}`}
                x1={cx}
                y1={cy}
                x2={end.x}
                y2={end.y}
                stroke="transparent"
                strokeWidth={20}
                style={{ cursor: 'pointer' }}
                onMouseMove={(e) => handleAxisHover(e, d)}
                onMouseLeave={hideTooltip}
              />
            );
          })}
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltipData.category}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--primary)', display: 'inline-block' }} />
            Current: {formatAmount(tooltipData.currentValue)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--muted-foreground)', display: 'inline-block' }} />
            Previous: {formatAmount(tooltipData.previousValue)}
          </div>
          {tooltipData.budgetValue != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--chart-4)', display: 'inline-block' }} />
              Budget: {formatAmount(tooltipData.budgetValue)}
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

export default function CategoryRadarChart(props: CategoryRadarChartProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 300);
        return <RadarChart {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
