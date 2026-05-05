'use client';

import React, { useCallback, useMemo } from 'react';
import { AreaStack, Bar, Line } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { scaleLinear, scaleTime } from '@visx/scale';
import { localPoint } from '@visx/event';
import { ParentSize } from '@visx/responsive';
import { TooltipWithBounds, defaultStyles, useTooltip } from '@visx/tooltip';
import { bisector } from 'd3-array';
import type { CategoryStackedTrendPoint } from '@/app/metrics/types';

interface CategoryStackedTrendChartProps {
  points: CategoryStackedTrendPoint[];
  categories: string[];
}

interface ChartPoint extends CategoryStackedTrendPoint {
  dateValue: Date;
}

interface TooltipData {
  point: ChartPoint;
}

const categoryColors: Record<string, string> = {
  Food: 'var(--chart-1)',
  Housing: 'var(--chart-2)',
  Transportation: 'var(--chart-3)',
  Entertainment: 'var(--chart-4)',
  Healthcare: 'var(--chart-5)',
  Utilities: '#2563eb',
  Shopping: '#db2777',
  Education: '#7c3aed',
  Travel: '#0891b2',
  Other: '#6b7280',
};

const fallbackColors = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

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

const bisectDate = bisector<ChartPoint, Date>((d) => d.dateValue).left;

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function formatAmount(value: number): string {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateLabel(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function colorForCategory(category: string, index: number): string {
  return categoryColors[category] ?? fallbackColors[index % fallbackColors.length];
}

function InnerCategoryStackedTrendChart({
  points,
  categories,
  width,
  height,
}: CategoryStackedTrendChartProps & { width: number; height: number }) {
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();

  const legendHeight = 58;
  const svgHeight = Math.max(height - legendHeight, 240);
  const margin = { top: 16, right: 16, bottom: 38, left: 60 };
  const innerWidth = Math.max(width - margin.left - margin.right, 0);
  const innerHeight = Math.max(svgHeight - margin.top - margin.bottom, 0);

  const parsedPoints = useMemo(
    () =>
      points
        .map((point) => ({
          ...point,
          dateValue: parseLocalDate(point.date),
        }))
        .sort((a, b) => a.dateValue.getTime() - b.dateValue.getTime()),
    [points]
  );

  const [minDate, maxDate] = useMemo(() => {
    const first = parsedPoints[0]?.dateValue ?? new Date();
    const last = parsedPoints[parsedPoints.length - 1]?.dateValue ?? first;
    if (first.getTime() !== last.getTime()) {
      return [first, last];
    }
    const next = new Date(first);
    next.setDate(next.getDate() + 1);
    return [first, next];
  }, [parsedPoints]);

  const yMax = useMemo(
    () => Math.max(...parsedPoints.map((point) => point.total), 0) * 1.1 || 1,
    [parsedPoints]
  );

  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [minDate, maxDate],
        range: [0, innerWidth],
      }),
    [innerWidth, maxDate, minDate]
  );

  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, yMax],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight, yMax]
  );

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event) || { x: 0 };
      const x0 = xScale.invert(point.x - margin.left);
      const index = bisectDate(parsedPoints, x0, 1);
      const d0 = parsedPoints[index - 1];
      const d1 = parsedPoints[index];
      let nearest = d0;
      if (d1 && d0) {
        nearest =
          x0.getTime() - d0.dateValue.getTime() >
          d1.dateValue.getTime() - x0.getTime()
            ? d1
            : d0;
      }
      if (!nearest) return;

      showTooltip({
        tooltipData: { point: nearest },
        tooltipLeft: xScale(nearest.dateValue) + margin.left,
        tooltipTop: yScale(nearest.total) + margin.top,
      });
    },
    [parsedPoints, showTooltip, xScale, yScale]
  );

  if (points.length === 0 || categories.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No category trend data available.
      </div>
    );
  }

  const tooltipRows = tooltipData
    ? categories
        .map((category, index) => ({
          category,
          amount: tooltipData.point.categories[category] ?? 0,
          color: colorForCategory(category, index),
        }))
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount)
    : [];

  return (
    <div style={{ position: 'relative', height }}>
      <svg width={width} height={svgHeight} aria-label="Stacked category spend over time">
        <Group left={margin.left} top={margin.top}>
          <GridRows
            scale={yScale}
            width={innerWidth}
            stroke="var(--border)"
            strokeOpacity={0.5}
            strokeDasharray="3,3"
            numTicks={5}
          />

          <AreaStack<ChartPoint, string>
            data={parsedPoints}
            keys={categories}
            value={(d, key) => d.categories[key] ?? 0}
            x={(d) => xScale(d.data.dateValue) ?? 0}
            y0={(d) => yScale(d[0]) ?? 0}
            y1={(d) => yScale(d[1]) ?? 0}
            curve={curveMonotoneX}
            color={(key, index) => colorForCategory(String(key), index)}
            fillOpacity={0.78}
            stroke="var(--background)"
            strokeWidth={1}
          />

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(6, points.length)}
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

      <div className="flex flex-wrap gap-x-4 gap-y-2 px-2 text-xs text-muted-foreground">
        {categories.map((category, index) => (
          <div key={category} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: colorForCategory(category, index) }}
            />
            <span>{category}</span>
          </div>
        ))}
      </div>

      {tooltipOpen && tooltipData && (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {tooltipData.point.label}
          </div>
          <div style={{ marginBottom: 6 }}>
            Total: {formatAmount(tooltipData.point.total)}
          </div>
          {tooltipRows.map((row) => (
            <div
              key={row.category}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  backgroundColor: row.color,
                  display: 'inline-block',
                }}
              />
              {row.category}: {formatAmount(row.amount)}
            </div>
          ))}
        </TooltipWithBounds>
      )}
    </div>
  );
}

export default function CategoryStackedTrendChart(props: CategoryStackedTrendChartProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        const chartHeight = Math.max(height, 300);
        return <InnerCategoryStackedTrendChart {...props} width={width} height={chartHeight} />;
      }}
    </ParentSize>
  );
}
