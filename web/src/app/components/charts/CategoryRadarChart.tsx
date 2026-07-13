'use client';

import React, { useCallback, useId, useMemo } from 'react';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { defaultStyles, TooltipWithBounds, useTooltip } from '@visx/tooltip';

import { createAnalyticsCurrencyContext } from '@/app/components/analytics/formatting';
import type { AnalyticsCurrencyContext } from '@/app/components/analytics/types';
import type { RadarAxis } from '@/app/metrics/types';

export type CategoryRadarChartProps = {
  data: readonly RadarAxis[];
  formatMoney?: AnalyticsCurrencyContext['formatMoney'];
};

type TooltipData = Pick<
  RadarAxis,
  'category' | 'currentValue' | 'previousValue' | 'budgetValue'
>;

const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const GUIDE_LEVELS = [0.25, 0.5, 0.75, 1] as const;

const tooltipStyles: React.CSSProperties = {
  ...defaultStyles,
  backgroundColor: 'var(--popover)',
  backgroundImage: 'none',
  color: 'var(--popover-foreground)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  fontSize: '12px',
  padding: '10px 12px',
  boxShadow: 'var(--shadow-sm)',
};

function validatedAxes(data: readonly RadarAxis[]): RadarAxis[] {
  return data.flatMap((source) => {
    const category = source.category.trim();
    if (
      category.length === 0 ||
      !Number.isFinite(source.currentValue) ||
      !Number.isFinite(source.previousValue) ||
      source.currentValue < 0 ||
      source.previousValue < 0
    ) {
      return [];
    }

    const budgetValue =
      source.budgetValue !== undefined &&
      Number.isFinite(source.budgetValue) &&
      source.budgetValue >= 0
        ? source.budgetValue
        : undefined;
    const suppliedMaximum =
      Number.isFinite(source.maxValue) && source.maxValue >= 0
        ? source.maxValue
        : 0;

    return [
      {
        category,
        currentValue: source.currentValue,
        previousValue: source.previousValue,
        ...(budgetValue === undefined ? {} : { budgetValue }),
        maxValue: Math.max(
          1,
          suppliedMaximum,
          source.currentValue,
          source.previousValue,
          budgetValue ?? 0
        ),
      },
    ];
  });
}

function comparisonLabel(data: readonly RadarAxis[]): string {
  return data.length === 1
    ? `${data[0].category} category spending comparison`
    : `Category spending comparison for ${data.length} categories`;
}

function comparisonDescription(
  data: readonly RadarAxis[],
  formatMoney: AnalyticsCurrencyContext['formatMoney']
): string {
  return data
    .map((axis) => {
      const budget =
        axis.budgetValue === undefined
          ? ''
          : `, budget ${formatMoney(axis.budgetValue)}`;
      return `${axis.category}: current ${formatMoney(
        axis.currentValue
      )}, previous ${formatMoney(axis.previousValue)}${budget}`;
    })
    .join('. ');
}

function amountRows(axis: RadarAxis) {
  return [
    {
      key: 'current',
      label: 'Current period',
      value: axis.currentValue,
      color: 'var(--primary)',
    },
    {
      key: 'previous',
      label: 'Previous period',
      value: axis.previousValue,
      color: 'var(--muted-foreground)',
    },
    ...(axis.budgetValue === undefined
      ? []
      : [
          {
            key: 'budget',
            label: 'Budget',
            value: axis.budgetValue,
            color: 'var(--chart-4)',
          },
        ]),
  ];
}

function CompactCategoryComparison({
  data,
  formatMoney,
}: Readonly<{
  data: readonly RadarAxis[];
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
}>) {
  const descriptionId = useId();

  return (
    <div
      role="img"
      aria-label={comparisonLabel(data)}
      aria-describedby={descriptionId}
      data-testid={
        data.length === 1
          ? 'single-category-comparison'
          : 'compact-category-comparison'
      }
      className="flex h-full min-h-64 flex-col justify-center gap-6 rounded-[10px] bg-muted/20 p-4 sm:p-6"
    >
      <span id={descriptionId} className="sr-only">
        {comparisonDescription(data, formatMoney)}
      </span>
      {data.map((axis, axisIndex) => {
        const rows = amountRows(axis);
        const maximum = Math.max(1, ...rows.map((row) => row.value));
        return (
          <section
            key={`${axis.category}:${axisIndex}`}
            aria-hidden="true"
            className="space-y-3"
          >
            <h3 className="text-sm font-semibold text-foreground">
              {axis.category}
            </h3>
            {rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground">
                    {row.label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {formatMoney(row.value)}
                  </p>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    data-testid={`category-bar-${row.key}`}
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: row.color,
                      width:
                        row.value === 0
                          ? '0%'
                          : `${Math.max(2, (row.value / maximum) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

function angleSlice(index: number, total: number): number {
  return (Math.PI * 2 * index) / total - Math.PI / 2;
}

function polarToCartesian(
  angle: number,
  radius: number,
  centerX: number,
  centerY: number
) {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

function polygonPath(
  data: readonly RadarAxis[],
  value: (axis: RadarAxis) => number,
  centerX: number,
  centerY: number,
  maximumRadius: number
): string {
  const points = data.map((axis, index) => {
    const radius =
      Math.min(1, value(axis) / axis.maxValue) * maximumRadius;
    return polarToCartesian(
      angleSlice(index, data.length),
      radius,
      centerX,
      centerY
    );
  });

  return `${points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ')} Z`;
}

function RadarPlot({
  data,
  formatMoney,
  width,
  height,
}: Readonly<{
  data: readonly RadarAxis[];
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
  width: number;
  height: number;
}>) {
  const titleId = useId();
  const descriptionId = useId();
  const {
    tooltipData,
    tooltipLeft,
    tooltipTop,
    tooltipOpen,
    showTooltip,
    hideTooltip,
  } = useTooltip<TooltipData>();
  const size = Math.min(width, height, 420);
  const centerX = size / 2;
  const centerY = size / 2;
  const maximumRadius = size * 0.32;
  const labelRadius = maximumRadius + 24;
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;
  const hasBudget = data.some((axis) => axis.budgetValue !== undefined);
  const currentPath = polygonPath(
    data,
    (axis) => axis.currentValue,
    centerX,
    centerY,
    maximumRadius
  );
  const previousPath = polygonPath(
    data,
    (axis) => axis.previousValue,
    centerX,
    centerY,
    maximumRadius
  );
  const budgetPath = hasBudget
    ? polygonPath(
        data,
        (axis) => axis.budgetValue ?? 0,
        centerX,
        centerY,
        maximumRadius
      )
    : null;

  const showAxisTooltip = useCallback(
    (event: React.MouseEvent<SVGLineElement>, axis: RadarAxis) => {
      const bounds = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
      if (!bounds) return;
      showTooltip({
        tooltipData: axis,
        tooltipLeft: event.clientX - bounds.left,
        tooltipTop: event.clientY - bounds.top - 10,
      });
    },
    [showTooltip]
  );

  return (
    <div className="relative h-full min-h-0">
      <svg
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
        width={width}
        height={height}
      >
        <title id={titleId}>{comparisonLabel(data)}</title>
        <desc id={descriptionId}>{comparisonDescription(data, formatMoney)}</desc>
        <Group left={offsetX} top={offsetY}>
          {GUIDE_LEVELS.map((level) => (
            <circle
              key={level}
              aria-hidden="true"
              cx={centerX}
              cy={centerY}
              r={maximumRadius * level}
              fill="none"
              stroke="var(--border)"
              strokeOpacity={level === 1 ? 0.7 : 0.4}
              strokeDasharray={level === 1 ? undefined : '2,3'}
            />
          ))}

          {data.map((axis, index) => {
            const end = polarToCartesian(
              angleSlice(index, data.length),
              maximumRadius,
              centerX,
              centerY
            );
            return (
              <line
                key={`axis:${axis.category}:${index}`}
                aria-hidden="true"
                x1={centerX}
                y1={centerY}
                x2={end.x}
                y2={end.y}
                stroke="var(--border)"
                strokeOpacity={0.55}
              />
            );
          })}

          {budgetPath ? (
            <path
              aria-hidden="true"
              d={budgetPath}
              fill="none"
              stroke="var(--chart-4)"
              strokeWidth={1.5}
              strokeDasharray="5,3"
            />
          ) : null}
          <path
            aria-hidden="true"
            d={previousPath}
            fill="var(--muted)"
            fillOpacity={0.2}
            stroke="var(--muted-foreground)"
            strokeWidth={1.25}
            strokeDasharray="3,3"
          />
          <path
            aria-hidden="true"
            d={currentPath}
            fill="var(--primary)"
            fillOpacity={0.22}
            stroke="var(--primary)"
            strokeWidth={2}
          />

          {data.map((axis, index) => {
            const angle = angleSlice(index, data.length);
            const point = polarToCartesian(
              angle,
              (axis.currentValue / axis.maxValue) * maximumRadius,
              centerX,
              centerY
            );
            const label = polarToCartesian(
              angle,
              labelRadius,
              centerX,
              centerY
            );
            const hoverEnd = polarToCartesian(
              angle,
              maximumRadius + 10,
              centerX,
              centerY
            );
            const textAnchor =
              label.x > centerX + 5
                ? 'start'
                : label.x < centerX - 5
                  ? 'end'
                  : 'middle';

            return (
              <React.Fragment key={`category:${axis.category}:${index}`}>
                <circle
                  aria-hidden="true"
                  cx={point.x}
                  cy={point.y}
                  r={3.5}
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth={1.5}
                />
                <text
                  aria-hidden="true"
                  x={label.x}
                  y={label.y}
                  textAnchor={textAnchor}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--foreground)"
                  style={{ fontWeight: 600 }}
                >
                  {axis.category}
                </text>
                <line
                  aria-hidden="true"
                  x1={centerX}
                  y1={centerY}
                  x2={hoverEnd.x}
                  y2={hoverEnd.y}
                  stroke="transparent"
                  strokeWidth={20}
                  style={{ cursor: 'crosshair' }}
                  onMouseMove={(event) => showAxisTooltip(event, axis)}
                  onMouseLeave={hideTooltip}
                />
              </React.Fragment>
            );
          })}
        </Group>
      </svg>

      {tooltipOpen && tooltipData ? (
        <TooltipWithBounds left={tooltipLeft} top={tooltipTop} style={tooltipStyles}>
          <p className="font-semibold">{tooltipData.category}</p>
          <dl className="mt-1 grid grid-cols-[auto_auto] gap-x-3 gap-y-1 tabular-nums">
            <dt>Current</dt>
            <dd>{formatMoney(tooltipData.currentValue)}</dd>
            <dt>Previous</dt>
            <dd>{formatMoney(tooltipData.previousValue)}</dd>
            {tooltipData.budgetValue === undefined ? null : (
              <>
                <dt>Budget</dt>
                <dd>{formatMoney(tooltipData.budgetValue)}</dd>
              </>
            )}
          </dl>
        </TooltipWithBounds>
      ) : null}
    </div>
  );
}

export default function CategoryRadarChart({
  data,
  formatMoney = DEFAULT_FORMATTERS.formatMoney,
}: CategoryRadarChartProps) {
  const axes = useMemo(() => validatedAxes(data), [data]);

  if (axes.length === 0) {
    return (
      <p
        role="status"
        className="flex h-full min-h-64 items-center justify-center rounded-[10px] bg-muted/20 p-4 text-pretty text-sm text-muted-foreground"
      >
        No category comparison data is available.
      </p>
    );
  }

  if (axes.length <= 2) {
    return <CompactCategoryComparison data={axes} formatMoney={formatMoney} />;
  }

  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 10) return null;
        return (
          <RadarPlot
            data={axes}
            formatMoney={formatMoney}
            width={width}
            height={Math.max(height, 300)}
          />
        );
      }}
    </ParentSize>
  );
}
