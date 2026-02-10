'use client';

import React, { useMemo, useCallback } from 'react';
import { HeatmapRect } from '@visx/heatmap';
import { scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import type { HeatmapData, HeatmapDay } from '@/app/metrics/types';

// ============================================================================
// Types
// ============================================================================

interface SpendingHeatmapProps {
  data: HeatmapData;
  onDayClick?: (date: string) => void;
}

interface HeatmapBin {
  bin: number;
  count: number;
  date: string;
  value: number;
}

interface HeatmapBinData {
  bin: number;
  bins: HeatmapBin[];
}

interface TooltipData {
  date: string;
  value: number;
  count: number;
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

const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatAmount(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Transform flat HeatmapDay[] into weekly bin data for HeatmapRect.
 * Each "bin" is a week column, containing up to 7 day entries.
 */
function transformToBinData(days: HeatmapDay[]): HeatmapBinData[] {
  if (days.length === 0) return [];

  // Sort days by date
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  // Determine the start of the first week (Sunday)
  const firstDate = new Date(sorted[0].date);
  const startOfWeek = new Date(firstDate);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  // Build a map for quick lookup
  const dayMap = new Map<string, HeatmapDay>();
  for (const d of sorted) {
    dayMap.set(d.date, d);
  }

  // Build 52 weeks of bins
  const bins: HeatmapBinData[] = [];
  const current = new Date(startOfWeek);

  for (let week = 0; week < 53; week++) {
    const weekBins: HeatmapBin[] = [];
    for (let day = 0; day < 7; day++) {
      const dateStr = current.toISOString().split('T')[0];
      const entry = dayMap.get(dateStr);
      weekBins.push({
        bin: day,
        count: entry?.count ?? 0,
        date: dateStr,
        value: entry?.value ?? 0,
      });
      current.setDate(current.getDate() + 1);
    }
    bins.push({ bin: week, bins: weekBins });
  }

  return bins;
}

/**
 * Extract month label positions from the bin data for the top axis.
 */
function getMonthLabels(binData: HeatmapBinData[], cellSize: number, gap: number): Array<{ label: string; x: number }> {
  const labels: Array<{ label: string; x: number }> = [];
  let lastMonth = -1;

  for (let i = 0; i < binData.length; i++) {
    const firstDay = binData[i].bins[0];
    if (!firstDay) continue;
    const d = new Date(firstDay.date);
    const month = d.getMonth();
    if (month !== lastMonth) {
      labels.push({
        label: MONTH_LABELS[month],
        x: i * (cellSize + gap),
      });
      lastMonth = month;
    }
  }

  return labels;
}

// ============================================================================
// Inner Chart (receives explicit width/height)
// ============================================================================

function HeatmapChart({
  data,
  width,
  height,
  onDayClick,
}: SpendingHeatmapProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();

  const margin = { top: 24, right: 12, bottom: 8, left: 32 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const binData = useMemo(() => transformToBinData(data.days), [data.days]);

  // Cell sizing: fit 53 weeks across the width
  const gap = 2;
  const numWeeks = binData.length || 53;
  const cellSize = Math.max(2, Math.floor((innerWidth - gap * (numWeeks - 1)) / numWeeks));
  const adjustedCellSize = Math.min(cellSize, Math.floor((innerHeight - gap * 6) / 7));

  const colorScale = useMemo(
    () =>
      scaleLinear<string>({
        domain: [0, data.maxValue * 0.5, data.maxValue],
        range: ['hsl(var(--muted))', 'hsl(var(--primary))', 'hsl(var(--chart-1))'],
      }),
    [data.maxValue]
  );

  const xScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, numWeeks - 1],
        range: [0, (adjustedCellSize + gap) * (numWeeks - 1)],
      }),
    [numWeeks, adjustedCellSize, gap]
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, 6],
        range: [0, (adjustedCellSize + gap) * 6],
      }),
    [adjustedCellSize, gap]
  );

  const monthLabels = useMemo(
    () => getMonthLabels(binData, adjustedCellSize, gap),
    [binData, adjustedCellSize, gap]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent, bin: HeatmapBin) => {
      const rect = (event.currentTarget as SVGElement).closest('svg')?.getBoundingClientRect();
      if (!rect) return;
      showTooltip({
        tooltipData: { date: bin.date, value: bin.value, count: bin.count },
        tooltipLeft: event.clientX - rect.left,
        tooltipTop: event.clientY - rect.top - 10,
      });
    },
    [showTooltip]
  );

  if (data.days.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No data available for heatmap.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative' }}>
      <svg width={width} height={height}>
        {/* Month labels along top */}
        <Group left={margin.left} top={margin.top - 8}>
          {monthLabels.map((m, i) => (
            <text
              key={`month-${i}`}
              x={m.x}
              y={0}
              fontSize={10}
              fill="hsl(var(--muted-foreground))"
              textAnchor="start"
            >
              {m.label}
            </text>
          ))}
        </Group>

        {/* Day-of-week labels on left */}
        <Group left={0} top={margin.top}>
          {DAY_LABELS.map((label, i) => (
            <text
              key={`day-${i}`}
              x={margin.left - 6}
              y={i * (adjustedCellSize + gap) + adjustedCellSize / 2}
              fontSize={9}
              fill="hsl(var(--muted-foreground))"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {label}
            </text>
          ))}
        </Group>

        {/* Heatmap grid */}
        <Group left={margin.left} top={margin.top}>
          <HeatmapRect
            data={binData}
            xScale={(d) => xScale(d) ?? 0}
            yScale={(d) => yScale(d) ?? 0}
            colorScale={colorScale}
            binWidth={adjustedCellSize}
            binHeight={adjustedCellSize}
            gap={gap}
            count={(d) => (d as HeatmapBin).value}
          >
            {(heatmap) =>
              heatmap.map((heatmapBins) =>
                heatmapBins.map((bin) => (
                  <rect
                    key={`heatmap-rect-${bin.row}-${bin.column}`}
                    width={bin.width}
                    height={bin.height}
                    x={bin.x}
                    y={bin.y}
                    rx={2}
                    fill={bin.color}
                    style={{ cursor: onDayClick ? 'pointer' : 'default', opacity: bin.opacity }}
                    onMouseMove={(e) => {
                      const originalBin = binData[bin.column]?.bins[bin.row];
                      if (originalBin) handleMouseMove(e, originalBin);
                    }}
                    onMouseLeave={hideTooltip}
                    onClick={() => {
                      const originalBin = binData[bin.column]?.bins[bin.row];
                      if (originalBin && onDayClick) onDayClick(originalBin.date);
                    }}
                  />
                ))
              )
            }
          </HeatmapRect>
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {formatDate(tooltipData.date)}
          </div>
          <div>Spent: {formatAmount(tooltipData.value)}</div>
          <div>Transactions: {tooltipData.count}</div>
        </TooltipWithBounds>
      )}
    </div>
  );
}

// ============================================================================
// Exported Responsive Wrapper
// ============================================================================

export default function SpendingHeatmap(props: SpendingHeatmapProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 140);
        return <HeatmapChart {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
