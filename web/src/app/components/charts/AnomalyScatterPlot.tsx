'use client';

import React, { useMemo, useCallback } from 'react';
import { Circle } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { scaleTime, scaleLinear } from '@visx/scale';
import { GridRows, GridColumns } from '@visx/grid';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import type { AnomalyPoint } from '@/app/metrics/types';

// ============================================================================
// Types
// ============================================================================

interface NormalTransaction {
  date: Date;
  amount: number;
}

interface AnomalyScatterPlotProps {
  data: AnomalyPoint[];
  normalTransactions?: NormalTransaction[];
}

interface TooltipData {
  isAnomaly: boolean;
  description?: string;
  amount: number;
  date: Date;
  expectedAmount?: number;
  zScore?: number;
  anomalyType?: string;
  severity?: 'low' | 'medium' | 'high';
  category?: string;
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
  maxWidth: 260,
};

function formatAmount(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function severityColor(severity: 'low' | 'medium' | 'high'): string {
  switch (severity) {
    case 'low':
      return 'hsl(var(--chart-4))';
    case 'medium':
      return 'hsl(var(--chart-5))';
    case 'high':
      return 'hsl(var(--chart-1))';
  }
}

function severityRadius(severity: 'low' | 'medium' | 'high'): number {
  switch (severity) {
    case 'low':
      return 6;
    case 'medium':
      return 8;
    case 'high':
      return 10;
  }
}

// ============================================================================
// Inner Chart
// ============================================================================

function ScatterPlot({
  data,
  normalTransactions,
  width,
  height,
}: AnomalyScatterPlotProps & { width: number; height: number }) {
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

  // Combine all points for scale computation
  const allDates = useMemo(() => {
    const dates: Date[] = data.map((d) => d.date);
    if (normalTransactions) {
      dates.push(...normalTransactions.map((d) => d.date));
    }
    return dates;
  }, [data, normalTransactions]);

  const allAmounts = useMemo(() => {
    const amounts: number[] = data.map((d) => d.amount);
    if (normalTransactions) {
      amounts.push(...normalTransactions.map((d) => d.amount));
    }
    return amounts;
  }, [data, normalTransactions]);

  const xScale = useMemo(() => {
    if (allDates.length === 0) {
      return scaleTime<number>({ domain: [new Date(), new Date()], range: [0, innerWidth] });
    }
    return scaleTime<number>({
      domain: [
        new Date(Math.min(...allDates.map((d) => d.getTime()))),
        new Date(Math.max(...allDates.map((d) => d.getTime()))),
      ],
      range: [0, innerWidth],
      nice: true,
    });
  }, [allDates, innerWidth]);

  const yScale = useMemo(() => {
    const maxAmt = allAmounts.length > 0 ? Math.max(...allAmounts) * 1.1 : 100;
    return scaleLinear<number>({
      domain: [0, maxAmt],
      range: [innerHeight, 0],
      nice: true,
    });
  }, [allAmounts, innerHeight]);

  const handleAnomalyHover = useCallback(
    (event: React.MouseEvent, point: AnomalyPoint) => {
      const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
      if (!rect) return;
      showTooltip({
        tooltipData: {
          isAnomaly: true,
          description: point.description,
          amount: point.amount,
          date: point.date,
          expectedAmount: point.expectedAmount,
          zScore: point.zScore,
          anomalyType: point.anomalyType,
          severity: point.severity,
          category: point.category,
        },
        tooltipLeft: event.clientX - rect.left,
        tooltipTop: event.clientY - rect.top - 10,
      });
    },
    [showTooltip]
  );

  const handleNormalHover = useCallback(
    (event: React.MouseEvent, point: NormalTransaction) => {
      const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
      if (!rect) return;
      showTooltip({
        tooltipData: {
          isAnomaly: false,
          amount: point.amount,
          date: point.date,
        },
        tooltipLeft: event.clientX - rect.left,
        tooltipTop: event.clientY - rect.top - 10,
      });
    },
    [showTooltip]
  );

  if (data.length === 0 && (!normalTransactions || normalTransactions.length === 0)) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available for scatter plot.
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
          <GridColumns
            scale={xScale}
            height={innerHeight}
            stroke="hsl(var(--border))"
            strokeOpacity={0.3}
            strokeDasharray="3,3"
            numTicks={6}
          />

          {/* Normal transaction dots */}
          {normalTransactions?.map((point, i) => (
            <Circle
              key={`normal-${i}`}
              cx={xScale(point.date)}
              cy={yScale(point.amount)}
              r={3}
              fill="hsl(var(--muted-foreground))"
              fillOpacity={0.4}
              style={{ cursor: 'pointer' }}
              onMouseMove={(e) => handleNormalHover(e, point)}
              onMouseLeave={hideTooltip}
            />
          ))}

          {/* Anomaly dots */}
          {data.map((point) => {
            const color = severityColor(point.severity);
            const radius = severityRadius(point.severity);
            return (
              <g key={point.id}>
                {/* Glow ring */}
                <Circle
                  cx={xScale(point.date)}
                  cy={yScale(point.amount)}
                  r={radius + 4}
                  fill={color}
                  fillOpacity={0.15}
                />
                {/* Main dot */}
                <Circle
                  cx={xScale(point.date)}
                  cy={yScale(point.amount)}
                  r={radius}
                  fill={color}
                  stroke="hsl(var(--background))"
                  strokeWidth={1.5}
                  style={{ cursor: 'pointer' }}
                  onMouseMove={(e) => handleAnomalyHover(e, point)}
                  onMouseLeave={hideTooltip}
                />
              </g>
            );
          })}

          {/* Axes */}
          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(6, allDates.length)}
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
          color: 'hsl(var(--muted-foreground))',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'hsl(var(--chart-4))', display: 'inline-block' }} />
          Low
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'hsl(var(--chart-5))', display: 'inline-block' }} />
          Medium
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'hsl(var(--chart-1))', display: 'inline-block' }} />
          High
        </span>
      </div>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          {tooltipData.isAnomaly ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{tooltipData.description}</div>
              <div>Amount: {formatAmount(tooltipData.amount)}</div>
              {tooltipData.expectedAmount != null && (
                <div>Expected: {formatAmount(tooltipData.expectedAmount)}</div>
              )}
              {tooltipData.zScore != null && (
                <div>Z-Score: {tooltipData.zScore.toFixed(2)}</div>
              )}
              {tooltipData.anomalyType && (
                <div>Type: {tooltipData.anomalyType}</div>
              )}
              {tooltipData.category && (
                <div>Category: {tooltipData.category}</div>
              )}
              <div style={{ marginTop: 4, fontSize: 10, color: severityColor(tooltipData.severity!) }}>
                Severity: {tooltipData.severity}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {formatDateLabel(tooltipData.date)}
              </div>
              <div>Amount: {formatAmount(tooltipData.amount)}</div>
            </>
          )}
        </TooltipWithBounds>
      )}
    </div>
  );
}

// ============================================================================
// Exported Responsive Wrapper
// ============================================================================

export default function AnomalyScatterPlot(props: AnomalyScatterPlotProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 250);
        return <ScatterPlot {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
