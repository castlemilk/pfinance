'use client';

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { curveMonotoneX } from '@visx/curve';
import { localPoint } from '@visx/event';
import { GridRows } from '@visx/grid';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleLinear, scaleTime } from '@visx/scale';
import { AreaStack, Bar, Line } from '@visx/shape';
import {
  defaultStyles,
  TooltipWithBounds,
  useTooltip,
} from '@visx/tooltip';
import { bisector } from 'd3-array';

import { createAnalyticsCurrencyContext } from '@/app/components/analytics/formatting';
import type { AnalyticsCurrencyContext } from '@/app/components/analytics/types';
import type { CategoryStackedTrendPoint } from '@/app/metrics/types';

import { forecastDomain } from './analyticsChartMath';
import {
  normalizeCategoryStackedTrendData,
  parseUtcDateKey,
} from './spendingChartModels';

interface CategoryStackedTrendChartProps {
  points: CategoryStackedTrendPoint[];
  categories: string[];
  formatMoney?: AnalyticsCurrencyContext['formatMoney'];
  formatDate?: AnalyticsCurrencyContext['formatDate'];
}

interface ChartPoint extends CategoryStackedTrendPoint {
  dateValue: Date;
}

interface TooltipData {
  point: ChartPoint;
}

const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const MARGIN = { top: 16, right: 16, bottom: 38, left: 64 } as const;
const CATEGORY_TOKENS: Record<string, string> = {
  Food: 'var(--chart-1)',
  Housing: 'var(--chart-2)',
  Transportation: 'var(--chart-3)',
  Entertainment: 'var(--chart-4)',
  Healthcare: 'var(--chart-5)',
  Utilities: 'var(--chart-2)',
  Shopping: 'var(--chart-4)',
  Education: 'var(--chart-3)',
  Travel: 'var(--chart-5)',
  Other: 'var(--muted-foreground)',
};
const FALLBACK_TOKENS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;

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

const bisectDate = bisector<ChartPoint, Date>((point) => point.dateValue).left;

function colorForCategory(category: string, index: number): string {
  return CATEGORY_TOKENS[category] ?? FALLBACK_TOKENS[index % FALLBACK_TOKENS.length];
}

function parsePoints(points: readonly CategoryStackedTrendPoint[]): ChartPoint[] {
  return points.map((point) => ({
    ...point,
    categories: { ...point.categories },
    dateValue: parseUtcDateKey(point.date) as Date,
  }));
}

function valueDomain(
  points: readonly ChartPoint[],
  categories: readonly string[]
): readonly [number, number] {
  let minimum = 0;
  let maximum = 0;
  for (const point of points) {
    minimum = Math.min(minimum, point.total);
    maximum = Math.max(maximum, point.total);
    let running = 0;
    for (const category of categories) {
      running += point.categories[category] ?? 0;
      minimum = Math.min(minimum, running);
      maximum = Math.max(maximum, running);
    }
  }
  if (minimum === maximum) {
    const padding = Math.abs(minimum) * 0.1 || 1;
    return [minimum - padding, maximum + padding];
  }
  const padding = (maximum - minimum) * 0.08;
  return [minimum - padding, maximum + padding];
}

function keyboardStatus(
  point: ChartPoint,
  categories: readonly string[],
  formatMoney: AnalyticsCurrencyContext['formatMoney'],
  formatDate: AnalyticsCurrencyContext['formatDate']
): string {
  const categoryValues = categories.map(
    (category) => `${category} ${formatMoney(point.categories[category] ?? 0)}`
  );
  return `${formatDate(point.dateValue)}. Total ${formatMoney(point.total)}.${
    categoryValues.length > 0 ? ` ${categoryValues.join('. ')}.` : ''
  }`;
}

function InnerCategoryStackedTrendChart({
  points,
  categories,
  formatMoney,
  formatDate,
  width,
  height,
}: Readonly<{
  points: readonly CategoryStackedTrendPoint[];
  categories: readonly string[];
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
  formatDate: AnalyticsCurrencyContext['formatDate'];
  width: number;
  height: number;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const statusId = useId();
  const [keyboardIndex, setKeyboardIndex] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState('');
  const [inspectionModel, setInspectionModel] = useState<
    readonly CategoryStackedTrendPoint[] | null
  >(null);
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();
  const inspectionCurrent = inspectionModel === points;

  const parsedPoints = useMemo(
    () => parsePoints(points),
    [points]
  );
  const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const xDomain = useMemo(
    () => forecastDomain(parsedPoints.map((point) => point.dateValue), []),
    [parsedPoints]
  );
  const xScale = useMemo(
    () =>
      scaleTime<number>({
        domain: [...xDomain],
        range: [0, innerWidth],
      }),
    [innerWidth, xDomain]
  );
  const yDomain = useMemo(
    () => valueDomain(parsedPoints, categories),
    [categories, parsedPoints]
  );
  const yScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [...yDomain],
        range: [innerHeight, 0],
        nice: true,
      }),
    [innerHeight, yDomain]
  );
  const renderedYDomain = yScale.domain();

  const showPoint = useCallback(
    (point: ChartPoint, announce: boolean) => {
      setInspectionModel(points);
      if (announce) {
        setSelectedStatus(
          keyboardStatus(point, categories, formatMoney, formatDate)
        );
      }
      showTooltip({
        tooltipData: { point },
        tooltipLeft: xScale(point.dateValue) + MARGIN.left,
        tooltipTop: yScale(point.total) + MARGIN.top,
      });
    },
    [categories, formatDate, formatMoney, points, showTooltip, xScale, yScale]
  );

  const showClosestAtX = useCallback(
    (localX: number) => {
      if (parsedPoints.length === 0) return;
      const target = xScale.invert(localX);
      const index = bisectDate(parsedPoints, target, 1);
      const previous = parsedPoints[index - 1];
      const next = parsedPoints[index];
      const closest =
        previous && next
          ? target.getTime() - previous.dateValue.getTime() >
            next.dateValue.getTime() - target.getTime()
            ? next
            : previous
          : previous ?? next;
      if (closest) showPoint(closest, false);
    },
    [parsedPoints, showPoint, xScale]
  );

  const handleTooltip = useCallback(
    (event: React.TouchEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event);
      if (point) showClosestAtX(point.x - MARGIN.left);
    },
    [showClosestAtX]
  );

  const clearSelection = useCallback(() => {
    hideTooltip();
    setSelectedStatus('');
    setInspectionModel(null);
  }, [hideTooltip]);

  /* eslint-disable react-hooks/set-state-in-effect -- New evidence or formatting invalidates transient tooltip and screen-reader selection state. */
  useEffect(() => {
    setKeyboardIndex(0);
    clearSelection();
  }, [categories, clearSelection, formatDate, formatMoney, points]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleKeyboard = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (parsedPoints.length === 0) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : parsedPoints.length - 1;
        setKeyboardIndex(index);
        showPoint(parsedPoints[index], true);
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const currentIndex = inspectionModel === points ? keyboardIndex : 0;
      const index =
        (currentIndex + direction + parsedPoints.length) % parsedPoints.length;
      setKeyboardIndex(index);
      showPoint(parsedPoints[index], true);
    },
    [clearSelection, inspectionModel, keyboardIndex, parsedPoints, points, showPoint]
  );

  if (parsedPoints.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-pretty text-sm text-muted-foreground">
        No category trend data available.
      </div>
    );
  }

  const tooltipRows = inspectionCurrent && tooltipData
    ? categories.map((category, index) => ({
        category,
        amount: tooltipData.point.categories[category] ?? 0,
        color: colorForCategory(category, index),
      }))
    : [];

  return (
    <div className="relative h-full min-h-0 w-full min-w-0">
      <svg
        width={width}
        height={height}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        data-x-domain-start={xDomain[0].toISOString()}
        data-x-domain-end={xDomain[1].toISOString()}
        data-y-domain-min={renderedYDomain[0]}
        data-y-domain-max={renderedYDomain[1]}
      >
        <title id={titleId}>Category spending over time</title>
        <desc id={descriptionId}>
          Stacked areas compare the contribution of each spending category over time.
        </desc>
        <Group left={MARGIN.left} top={MARGIN.top}>
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
            keys={[...categories]}
            value={(point, category) => point.categories[category] ?? 0}
            x={(point) => xScale(point.data.dateValue) ?? 0}
            y0={(point) => yScale(point[0]) ?? 0}
            y1={(point) => yScale(point[1]) ?? 0}
            curve={curveMonotoneX}
            color={(category, index) => colorForCategory(String(category), index)}
            fillOpacity={0.78}
            stroke="var(--background)"
            strokeWidth={1}
          />

          <AxisBottom
            top={innerHeight}
            scale={xScale}
            numTicks={Math.min(6, Math.max(2, parsedPoints.length))}
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

          {inspectionCurrent && tooltipOpen && tooltipData ? (
            <Line
              from={{ x: (tooltipLeft ?? 0) - MARGIN.left, y: 0 }}
              to={{ x: (tooltipLeft ?? 0) - MARGIN.left, y: innerHeight }}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              strokeDasharray="3,3"
              pointerEvents="none"
            />
          ) : null}
        </Group>
      </svg>

      <button
        type="button"
        data-testid="category-chart-overlay"
        aria-label="Explore category spending values. Use left and right arrows to move between dates; Home and End jump to the first and last date."
        aria-describedby={statusId}
        onFocus={() => {
          setKeyboardIndex(0);
          showPoint(parsedPoints[0], true);
        }}
        onBlur={clearSelection}
        onKeyDown={handleKeyboard}
        className="pointer-events-none absolute cursor-crosshair rounded-sm bg-transparent outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        style={{
          left: MARGIN.left,
          top: MARGIN.top,
          width: innerWidth,
          height: innerHeight,
        }}
      >
        <span className="sr-only">Explore category spending chart values</span>
      </button>
      <p id={statusId} role="status" aria-live="polite" className="sr-only">
        {inspectionCurrent ? selectedStatus : ''}
      </p>

      {inspectionCurrent && tooltipOpen && tooltipData ? (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <div className="mb-1 font-semibold">
            {formatDate(tooltipData.point.dateValue, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </div>
          <div className="mb-1.5 tabular-nums">
            Total: {formatMoney(tooltipData.point.total)}
          </div>
          {tooltipRows.map((row) => (
            <div key={row.category} className="mb-0.5 flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block size-2 rounded-sm"
                style={{ backgroundColor: row.color }}
              />
              <span>
                {row.category}: {formatMoney(row.amount)}
              </span>
            </div>
          ))}
        </TooltipWithBounds>
      ) : null}
    </div>
  );
}

export default function CategoryStackedTrendChart(
  props: CategoryStackedTrendChartProps
) {
  const normalized = useMemo(
    () => normalizeCategoryStackedTrendData(props.points, props.categories),
    [props.categories, props.points]
  );
  const { categories, points } = normalized;
  const hasData = points.length > 0 && categories.length > 0;
  const formatMoney = props.formatMoney ?? DEFAULT_FORMATTERS.formatMoney;
  const formatDate = props.formatDate ?? DEFAULT_FORMATTERS.formatDate;
  const modelKey = JSON.stringify(normalized);

  return (
    <div
      data-testid="category-chart-layout"
      className="flex h-full min-h-0 flex-col"
    >
      <div
        data-testid="category-chart-plot"
        className="relative min-h-0 flex-1"
      >
        {!hasData ? (
          <div className="flex h-full items-center justify-center p-4 text-pretty text-sm text-muted-foreground">
            No category trend data available.
          </div>
        ) : (
          <ParentSize>
            {({ width, height }) => {
              if (width < 96 || height < 96) {
                return (
                  <div
                    role="img"
                    aria-label="Category spending chart needs more space"
                    className="h-full w-full overflow-hidden"
                  />
                );
              }
              return (
                <InnerCategoryStackedTrendChart
                  key={modelKey}
                  points={points}
                  categories={categories}
                  formatMoney={formatMoney}
                  formatDate={formatDate}
                  width={width}
                  height={height}
                />
              );
            }}
          </ParentSize>
        )}
      </div>
      {hasData ? (
        <div
          data-testid="category-chart-legend"
          className="flex shrink-0 flex-wrap gap-x-4 gap-y-2 px-2 pt-2 text-xs text-muted-foreground"
        >
          {categories.map((category, index) => (
            <div key={category} className="flex items-center gap-1.5">
              <span
                data-testid="category-color"
                data-color-token={colorForCategory(category, index)}
                aria-hidden="true"
                className="size-2.5 rounded-sm"
                style={{ backgroundColor: colorForCategory(category, index) }}
              />
              <span>{category}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
