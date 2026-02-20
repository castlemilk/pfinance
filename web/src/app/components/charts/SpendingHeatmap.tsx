'use client';

import React, { useMemo, useCallback } from 'react';
import { scaleLinear } from '@visx/scale';
import { Group } from '@visx/group';
import { useTooltip, TooltipWithBounds, defaultStyles } from '@visx/tooltip';
import { ParentSize } from '@visx/responsive';
import type { HeatmapData, HeatmapDay, HeatmapCategoryAmount } from '@/app/metrics/types';

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
  categories?: HeatmapCategoryAmount[];
}

interface HeatmapBinData {
  bin: number;
  bins: HeatmapBin[];
}

interface TooltipData {
  date: string;
  value: number;
  count: number;
  categories?: HeatmapCategoryAmount[];
}

// ============================================================================
// Helpers
// ============================================================================

const tooltipStyles: React.CSSProperties = {
  ...defaultStyles,
  backgroundColor: 'var(--popover)',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '12px',
  padding: '0',
  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  maxWidth: '280px',
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
        categories: entry?.categories,
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

  // CSS variables can't be interpolated by D3's scaleLinear, so we use
  // an opacity scale with a fixed fill color for proper heat intensity.
  const opacityScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, data.maxValue],
        range: [0.08, 1],
        clamp: true,
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
        tooltipData: { date: bin.date, value: bin.value, count: bin.count, categories: bin.categories },
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
              fill="var(--muted-foreground)"
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
              fill="var(--muted-foreground)"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {label}
            </text>
          ))}
        </Group>

        {/* Heatmap grid */}
        <Group left={margin.left} top={margin.top}>
          {binData.map((weekData, col) =>
            weekData.bins.map((bin, row) => {
              const x = xScale(col) ?? 0;
              const y = yScale(row) ?? 0;
              const hasValue = bin.value > 0;
              return (
                <rect
                  key={`heatmap-rect-${row}-${col}`}
                  width={adjustedCellSize}
                  height={adjustedCellSize}
                  x={x}
                  y={y}
                  rx={2}
                  fill={hasValue ? 'var(--chart-1)' : 'var(--muted)'}
                  opacity={hasValue ? opacityScale(bin.value) : 0.3}
                  style={{ cursor: hasValue && onDayClick ? 'pointer' : 'default' }}
                  onMouseMove={(e) => handleMouseMove(e, bin)}
                  onMouseLeave={hideTooltip}
                  onClick={() => {
                    if (hasValue && onDayClick) onDayClick(bin.date);
                  }}
                />
              );
            })
          )}
        </Group>
      </svg>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds
          left={tooltipLeft}
          top={tooltipTop}
          style={tooltipStyles}
        >
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {formatDate(tooltipData.date)}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{formatAmount(tooltipData.value)}</span>
              <span style={{ color: 'var(--muted-foreground)' }}>
                {tooltipData.count} transaction{tooltipData.count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          {tooltipData.categories && tooltipData.categories.length > 0 && (
            <div style={{ padding: '8px 12px' }}>
              {tooltipData.categories
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 5)
                .map((cat, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '2px 0' }}>
                    <span style={{ opacity: 0.8 }}>{cat.category}</span>
                    <span style={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                      {formatAmount(cat.amount)}
                      <span style={{ color: 'var(--muted-foreground)', marginLeft: 4, fontSize: 11 }}>
                        ({cat.count})
                      </span>
                    </span>
                  </div>
                ))}
              {tooltipData.categories.length > 5 && (
                <div style={{ color: 'var(--muted-foreground)', fontSize: 11, paddingTop: 4 }}>
                  +{tooltipData.categories.length - 5} more
                </div>
              )}
            </div>
          )}
          {tooltipData.value > 0 && onDayClick && (
            <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', color: 'var(--muted-foreground)', fontSize: 11 }}>
              Click to view expenses
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
