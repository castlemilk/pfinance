'use client';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Group } from '@visx/group';
import { ParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';

import { createAnalyticsCurrencyContext } from '@/app/components/analytics/formatting';
import type { AnalyticsCurrencyContext } from '@/app/components/analytics/types';
import type {
  HeatmapCategoryAmount,
  HeatmapData,
  HeatmapDay,
} from '@/app/metrics/types';
import type { Expense, ExpenseCategory } from '@/app/types';

interface SpendingHeatmapProps {
  data: HeatmapData;
  onDayClick?: (date: string) => void;
  expenses?: Expense[];
  formatMoney?: AnalyticsCurrencyContext['formatMoney'];
  formatDate?: AnalyticsCurrencyContext['formatDate'];
}

interface HeatmapBin {
  bin: number;
  count: number;
  date: string;
  value: number;
  categories?: HeatmapCategoryAmount[];
  inRange: boolean;
}

interface HeatmapBinData {
  bin: number;
  bins: HeatmapBin[];
}

interface ActiveDay {
  date: string;
  value: number;
  count: number;
  categories?: HeatmapCategoryAmount[];
  left: number;
  top: number;
}

const DEFAULT_FORMATTERS = createAnalyticsCurrencyContext(undefined);
const HIDE_DELAY = 200;
const MAX_RENDERED_DAYS = 400;
const MARGIN = { top: 28, right: 12, bottom: 8, left: 36 } as const;
const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
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

function categoryColor(category: ExpenseCategory): string {
  return CATEGORY_COLORS[category] ?? 'var(--muted-foreground)';
}

function utcDateFromKey(dateKey: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || year > 9_999) return null;

  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

function toUtcDateKey(date: Date): string | null {
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9_999) return null;
  return `${String(year).padStart(4, '0')}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function copiedDay(day: HeatmapDay): HeatmapDay | null {
  if (
    !utcDateFromKey(day.date) ||
    !Number.isFinite(day.value) ||
    !Number.isFinite(day.count)
  ) {
    return null;
  }
  return {
    date: day.date,
    value: day.value,
    count: day.count,
    categories: day.categories?.map((category) => ({ ...category })),
  };
}

function transformToBinData(days: readonly HeatmapDay[]): HeatmapBinData[] {
  const sorted = days
    .map(copiedDay)
    .filter((day): day is HeatmapDay => day !== null)
    .sort((left, right) => left.date.localeCompare(right.date));
  if (sorted.length === 0) return [];

  const firstDate = utcDateFromKey(sorted[0].date);
  const lastDate = utcDateFromKey(sorted[sorted.length - 1].date);
  if (!firstDate || !lastDate) return [];
  const span = Math.floor((lastDate.getTime() - firstDate.getTime()) / 86_400_000) + 1;
  if (span < 1 || span > MAX_RENDERED_DAYS) return [];

  const startOfWeek = new Date(firstDate.getTime());
  startOfWeek.setUTCDate(startOfWeek.getUTCDate() - startOfWeek.getUTCDay());
  const endOfWeek = new Date(lastDate.getTime());
  endOfWeek.setUTCDate(endOfWeek.getUTCDate() + (6 - endOfWeek.getUTCDay()));

  const byDate = new Map(sorted.map((day) => [day.date, day] as const));
  const bins: HeatmapBinData[] = [];
  const cursor = new Date(startOfWeek.getTime());

  for (let week = 0; cursor <= endOfWeek; week += 1) {
    const weekBins: HeatmapBin[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const date = toUtcDateKey(cursor);
      if (!date) return [];
      const entry = byDate.get(date);
      weekBins.push({
        bin: weekday,
        date,
        value: entry?.value ?? 0,
        count: entry?.count ?? 0,
        categories: entry?.categories?.map((category) => ({ ...category })),
        inRange: cursor >= firstDate && cursor <= lastDate,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    bins.push({ bin: week, bins: weekBins });
  }

  return bins;
}

function transactionLabel(count: number): string {
  return `${count} ${count === 1 ? 'transaction' : 'transactions'}`;
}

function DayDetailCard({
  activeDay,
  expenses,
  onDayClick,
  formatMoney,
  formatDate,
}: Readonly<{
  activeDay: ActiveDay;
  expenses: readonly Expense[] | undefined;
  onDayClick?: (date: string) => void;
  formatMoney: AnalyticsCurrencyContext['formatMoney'];
  formatDate: AnalyticsCurrencyContext['formatDate'];
}>) {
  const dayExpenses = useMemo(
    () =>
      (expenses ?? [])
        .filter((expense) => toUtcDateKey(expense.date) === activeDay.date)
        .filter((expense) => Number.isFinite(expense.amount))
        .map((expense) => ({ ...expense, date: new Date(expense.date.getTime()) }))
        .sort((left, right) => right.amount - left.amount),
    [activeDay.date, expenses]
  );
  const categories = useMemo(
    () =>
      (activeDay.categories ?? [])
        .map((category) => ({ ...category }))
        .filter(
          (category) =>
            Number.isFinite(category.amount) && Number.isFinite(category.count)
        )
        .sort((left, right) => right.amount - left.amount),
    [activeDay.categories]
  );
  const longDate = formatDate(activeDay.date, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <section
      aria-label={`Spending details for ${longDate}`}
      className="w-full overflow-hidden rounded-[10px]"
    >
      <header className="border-b border-border px-3 py-2.5">
        <h3 className="font-semibold text-popover-foreground">{longDate}</h3>
        <div className="mt-0.5 flex justify-between gap-4">
          <span className="text-sm font-bold tabular-nums text-popover-foreground">
            {formatMoney(activeDay.value)}
          </span>
          <span className="text-xs text-muted-foreground">
            {transactionLabel(activeDay.count)}
          </span>
        </div>
      </header>

      {dayExpenses.length > 0 ? (
        <div className="max-h-60 overflow-y-auto">
          {dayExpenses.map((expense) => {
            const amount = formatMoney(expense.amount);
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: categoryColor(expense.category) }}
                />
                <span className="min-w-0 flex-1 truncate text-left text-xs">
                  {expense.description}
                </span>
                <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                  {expense.category}
                </span>
                <span className="shrink-0 text-xs font-semibold tabular-nums">
                  {amount}
                </span>
              </>
            );
            return onDayClick ? (
              <button
                key={expense.id}
                type="button"
                aria-label={`${expense.description}, ${expense.category}, ${amount}`}
                onClick={() => onDayClick(activeDay.date)}
                className="flex min-h-10 w-full items-center gap-2 px-3 text-popover-foreground outline-none transition-[color,background-color,box-shadow,transform] duration-150 ease-out hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {content}
              </button>
            ) : (
              <div
                key={expense.id}
                className="flex min-h-10 items-center gap-2 px-3 text-popover-foreground"
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : categories.length > 0 ? (
        <div className="px-3 py-2">
          {categories.slice(0, 5).map((category) => (
            <div
              key={`${category.category}:${category.count}`}
              className="flex min-h-7 items-center justify-between gap-3 text-xs"
            >
              <span className="truncate text-popover-foreground">
                {category.category}
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-popover-foreground">
                {formatMoney(category.amount)}{' '}
                <span className="font-normal text-muted-foreground">
                  ({category.count})
                </span>
              </span>
            </div>
          ))}
          {categories.length > 5 ? (
            <p className="pt-1 text-[0.6875rem] text-muted-foreground">
              +{categories.length - 5} more
            </p>
          ) : null}
        </div>
      ) : null}

      {activeDay.value !== 0 && onDayClick ? (
        <button
          type="button"
          onClick={() => onDayClick(activeDay.date)}
          className="flex min-h-10 w-full items-center justify-center border-t border-border px-3 text-xs font-semibold text-primary outline-none transition-[color,background-color,box-shadow,transform] duration-150 ease-out hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          View all expenses <span aria-hidden="true">→</span>
        </button>
      ) : null}
    </section>
  );
}

function HeatmapChart({
  data,
  width,
  height,
  onDayClick,
  expenses,
  formatMoney = DEFAULT_FORMATTERS.formatMoney,
  formatDate = DEFAULT_FORMATTERS.formatDate,
}: SpendingHeatmapProps & Readonly<{ width: number; height: number }>) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeDay, setActiveDay] = useState<ActiveDay | null>(null);

  const clearHideTimeout = useCallback(() => {
    if (hideTimeoutRef.current !== null) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  }, []);
  const hideDay = useCallback(() => {
    clearHideTimeout();
    setActiveDay(null);
  }, [clearHideTimeout]);
  const startHideTimeout = useCallback(() => {
    clearHideTimeout();
    hideTimeoutRef.current = setTimeout(() => setActiveDay(null), HIDE_DELAY);
  }, [clearHideTimeout]);

  useEffect(() => () => clearHideTimeout(), [clearHideTimeout]);

  const binData = useMemo(() => transformToBinData(data.days), [data.days]);
  const innerWidth = Math.max(1, width - MARGIN.left - MARGIN.right);
  const innerHeight = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const weekCount = Math.max(binData.length, 1);
  const horizontalGap = innerWidth / weekCount >= 4 ? 2 : 0.5;
  const horizontalCell = Math.max(
    0.5,
    (innerWidth - horizontalGap * (weekCount - 1)) / weekCount
  );
  const verticalGap = innerHeight >= 28 ? 2 : 0.5;
  const verticalCell = Math.max(0.5, (innerHeight - verticalGap * 6) / 7);
  const cellSize = Math.min(horizontalCell, verticalCell);
  const xStep =
    weekCount > 1 ? Math.max(cellSize, (innerWidth - cellSize) / (weekCount - 1)) : 0;
  const yStep = cellSize + verticalGap;

  const opacityScale = useMemo(
    () =>
      scaleLinear<number>({
        domain: [0, Number.isFinite(data.maxValue) && data.maxValue > 0 ? data.maxValue : 1],
        range: [0.18, 1],
        clamp: true,
      }),
    [data.maxValue]
  );

  const monthLabels = useMemo(() => {
    const labels: Array<{ label: string; column: number }> = [];
    let previousMonth = -1;
    binData.forEach((week, column) => {
      const day = week.bins.find((candidate) => candidate.inRange);
      if (!day) return;
      const parsed = utcDateFromKey(day.date);
      if (!parsed || parsed.getUTCMonth() === previousMonth) return;
      previousMonth = parsed.getUTCMonth();
      labels.push({
        column,
        label: formatDate(day.date, { month: 'short' }),
      });
    });
    return labels;
  }, [binData, formatDate]);
  const weekdayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const sample = new Date('2026-07-05T00:00:00.000Z');
        sample.setUTCDate(sample.getUTCDate() + index);
        return formatDate(sample, { weekday: 'short' });
      }),
    [formatDate]
  );

  const showDay = useCallback(
    (bin: HeatmapBin, left: number, top: number) => {
      clearHideTimeout();
      const tooltipWidth = Math.min(320, Math.max(width - 16, 0));
      const clampedLeft = Math.max(8, Math.min(left, Math.max(8, width - tooltipWidth - 8)));
      const clampedTop = Math.max(8, Math.min(top, Math.max(8, height - 184)));
      setActiveDay({
        date: bin.date,
        value: bin.value,
        count: bin.count,
        categories: bin.categories?.map((category) => ({ ...category })),
        left: clampedLeft,
        top: clampedTop,
      });
    },
    [clearHideTimeout, height, width]
  );

  const showMouseDay = useCallback(
    (event: React.MouseEvent<SVGRectElement>, bin: HeatmapBin) => {
      const container = containerRef.current;
      const bounds = container?.getBoundingClientRect();
      const left = bounds ? event.clientX - bounds.left + 12 : MARGIN.left + 12;
      const top = bounds ? event.clientY - bounds.top - 10 : MARGIN.top + 8;
      showDay(bin, left, top);
    },
    [showDay]
  );

  if (binData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-pretty p-4 text-sm text-muted-foreground">
        No data available for heatmap.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full min-h-0 w-full min-w-0">
      <svg
        width={width}
        height={height}
        role="img"
        aria-labelledby={`${titleId} ${descriptionId}`}
      >
        <title id={titleId}>Daily spending heatmap</title>
        <desc id={descriptionId}>
          Calendar cells show daily spending intensity. Focus a valued day to inspect it.
        </desc>

        <Group
          left={MARGIN.left}
          top={MARGIN.top - 10}
          role="group"
          aria-label="Month labels"
        >
          {monthLabels.map((month) => (
            <text
              key={`${month.column}:${month.label}`}
              x={month.column * xStep}
              y={0}
              fontSize={10}
              fill="var(--muted-foreground)"
              textAnchor="start"
            >
              {month.label}
            </text>
          ))}
        </Group>

        <Group
          left={0}
          top={MARGIN.top}
          role="group"
          aria-label="Weekday labels"
        >
          {weekdayLabels.map((label, index) => (
            <text
              key={`${index}:${label}`}
              x={MARGIN.left - 6}
              y={index * yStep + cellSize / 2}
              fontSize={9}
              fill="var(--muted-foreground)"
              textAnchor="end"
              dominantBaseline="middle"
            >
              {index % 2 === 1 ? label : ''}
            </text>
          ))}
        </Group>

        <Group
          left={MARGIN.left}
          top={MARGIN.top}
          role="group"
          aria-label="Daily spending cells"
        >
          {binData.flatMap((week, column) =>
            week.bins.map((bin, row) => {
              const x = column * xStep;
              const y = row * yStep;
              const hasValue = bin.inRange && (bin.value !== 0 || bin.count !== 0);
              const interactive = hasValue;
              const dateLabel = interactive
                ? formatDate(bin.date, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '';
              const accessibleName = interactive
                ? `${dateLabel}, ${formatMoney(bin.value)}, ${transactionLabel(bin.count)}`
                : undefined;

              return (
                <rect
                  key={`${bin.date}:${row}:${column}`}
                  width={cellSize}
                  height={cellSize}
                  x={x}
                  y={y}
                  rx={Math.min(2, cellSize / 3)}
                  fill={hasValue ? 'var(--chart-1)' : 'var(--muted)'}
                  opacity={hasValue ? opacityScale(Math.abs(bin.value)) : bin.inRange ? 0.35 : 0.16}
                  role={interactive ? 'button' : undefined}
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={accessibleName}
                  aria-hidden={interactive ? undefined : true}
                  className={
                    interactive
                      ? 'cursor-pointer outline-none transition-[opacity,stroke,stroke-width] duration-150 ease-out hover:opacity-90 focus-visible:stroke-ring focus-visible:stroke-[3px] motion-reduce:transition-none'
                      : undefined
                  }
                  onMouseEnter={
                    interactive ? (event) => showMouseDay(event, bin) : undefined
                  }
                  onMouseLeave={interactive ? startHideTimeout : undefined}
                  onFocus={
                    interactive
                      ? () => showDay(bin, MARGIN.left + x + cellSize + 10, MARGIN.top + y)
                      : undefined
                  }
                  onBlur={interactive ? hideDay : undefined}
                  onClick={
                    interactive && onDayClick ? () => onDayClick(bin.date) : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === 'Escape') {
                            event.preventDefault();
                            hideDay();
                            return;
                          }
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onDayClick?.(bin.date);
                          }
                        }
                      : undefined
                  }
                />
              );
            })
          )}
        </Group>
      </svg>

      {activeDay ? (
        <div
          onMouseEnter={clearHideTimeout}
          onMouseLeave={startHideTimeout}
          onKeyDown={(event) => {
            if (event.key === 'Escape') hideDay();
          }}
          className="absolute z-50 rounded-[10px] border border-border bg-popover text-popover-foreground shadow-sm"
          style={{
            left: activeDay.left,
            top: activeDay.top,
            width: Math.min(320, Math.max(width - 16, 1)),
            maxHeight: Math.max(height - 16, 1),
            overflowY: 'auto',
          }}
        >
          <DayDetailCard
            activeDay={activeDay}
            expenses={expenses}
            onDayClick={onDayClick}
            formatMoney={formatMoney}
            formatDate={formatDate}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function SpendingHeatmap(props: SpendingHeatmapProps) {
  return (
    <ParentSize>
      {({ width, height }) => {
        if (width < 64 || height < 64) {
          return (
            <div
              role="img"
              aria-label="Daily spending heatmap needs more space"
              className="h-full w-full overflow-hidden"
            />
          );
        }
        return <HeatmapChart {...props} width={width} height={height} />;
      }}
    </ParentSize>
  );
}
