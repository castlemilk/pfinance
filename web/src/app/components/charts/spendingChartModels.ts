import type {
  CategoryStackedTrendPoint,
  HeatmapCategoryAmount,
  HeatmapData,
  HeatmapDay,
} from '@/app/metrics/types';

const DAY_MILLISECONDS = 86_400_000;

export function parseUtcDateKey(dateKey: string): Date | null {
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

export function normalizeHeatmapData(data: HeatmapData): HeatmapData {
  type AggregatedDay = {
    date: string;
    value: number;
    count: number;
    categories: Map<string, HeatmapCategoryAmount>;
  };

  const daysByDate = new Map<string, AggregatedDay>();
  for (const day of data.days) {
    if (
      !parseUtcDateKey(day.date) ||
      !Number.isFinite(day.value) ||
      !Number.isFinite(day.count)
    ) {
      continue;
    }

    const aggregate = daysByDate.get(day.date) ?? {
      date: day.date,
      value: 0,
      count: 0,
      categories: new Map<string, HeatmapCategoryAmount>(),
    };
    const nextValue = aggregate.value + day.value;
    const nextCount = aggregate.count + day.count;
    if (!Number.isFinite(nextValue) || !Number.isFinite(nextCount)) continue;
    aggregate.value = nextValue;
    aggregate.count = nextCount;

    for (const category of day.categories ?? []) {
      const label = category.category.trim();
      if (
        !label ||
        !Number.isFinite(category.amount) ||
        !Number.isFinite(category.count)
      ) {
        continue;
      }
      const previous = aggregate.categories.get(label);
      const amount = (previous?.amount ?? 0) + category.amount;
      const count = (previous?.count ?? 0) + category.count;
      if (!Number.isFinite(amount) || !Number.isFinite(count)) continue;
      aggregate.categories.set(label, { category: label, amount, count });
    }
    daysByDate.set(day.date, aggregate);
  }

  const days = [...daysByDate.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day): HeatmapDay => {
      const categories = [...day.categories.values()].sort((left, right) =>
        left.category.localeCompare(right.category)
      );
      return {
        date: day.date,
        value: day.value,
        count: day.count,
        ...(categories.length > 0 ? { categories } : {}),
      };
    });

  return {
    days,
    maxValue:
      days.length > 0
        ? Math.max(...days.map((day) => Math.abs(day.value)))
        : 0,
  };
}

export function heatmapWeekCount(days: readonly HeatmapDay[]): number {
  if (days.length === 0) return 0;
  const first = parseUtcDateKey(days[0].date);
  const last = parseUtcDateKey(days[days.length - 1].date);
  if (!first || !last || last < first) return 0;

  const start = new Date(first.getTime());
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(last.getTime());
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  return Math.floor((end.getTime() - start.getTime()) / (7 * DAY_MILLISECONDS)) + 1;
}

export type NormalizedCategoryStackedTrendData = Readonly<{
  points: CategoryStackedTrendPoint[];
  categories: string[];
}>;

export function normalizeCategoryStackedTrendData(
  points: readonly CategoryStackedTrendPoint[],
  categories: readonly string[]
): NormalizedCategoryStackedTrendData {
  const aliasesByCategory = new Map<string, Set<string>>();
  for (const suppliedCategory of categories) {
    const category = suppliedCategory.trim();
    if (!category) continue;
    const aliases = aliasesByCategory.get(category) ?? new Set<string>();
    aliases.add(category);
    aliases.add(suppliedCategory);
    aliasesByCategory.set(category, aliases);
  }
  const normalizedCategories = [...aliasesByCategory.keys()];
  if (normalizedCategories.length === 0) {
    return { points: [], categories: [] };
  }

  const pointsByDate = new Map<string, CategoryStackedTrendPoint>();
  for (const point of points) {
    if (!parseUtcDateKey(point.date)) continue;
    let valid = true;
    const normalizedAmounts: Record<string, number> = {};
    for (const category of normalizedCategories) {
      let amount = 0;
      for (const alias of aliasesByCategory.get(category) ?? []) {
        const suppliedAmount = point.categories[alias];
        if (suppliedAmount === undefined) continue;
        if (!Number.isFinite(suppliedAmount)) {
          valid = false;
          break;
        }
        amount += suppliedAmount;
        if (!Number.isFinite(amount)) {
          valid = false;
          break;
        }
      }
      if (!valid) break;
      normalizedAmounts[category] = amount;
    }
    if (!valid) continue;
    const total = normalizedCategories.reduce(
      (sum, category) => sum + normalizedAmounts[category],
      0
    );
    if (!Number.isFinite(total)) continue;
    pointsByDate.set(point.date, {
      date: point.date,
      label: point.label,
      total,
      categories: normalizedAmounts,
    });
  }

  return {
    categories: normalizedCategories,
    points: [...pointsByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date)
    ),
  };
}

export type TrendPoint = Readonly<{ date: string; value: number }>;

export function normalizeTrendSeries<T extends TrendPoint>(
  source: readonly T[]
): Readonly<{ series: T[]; changed: boolean }> {
  const byDate = new Map<string, T>();
  let changed = false;

  for (const point of source) {
    if (!parseUtcDateKey(point.date) || !Number.isFinite(point.value)) {
      changed = true;
      continue;
    }
    if (byDate.has(point.date)) changed = true;
    byDate.set(point.date, { ...point });
  }

  const series = [...byDate.values()].sort((left, right) =>
    left.date.localeCompare(right.date)
  );
  if (!changed && series.length === source.length) {
    changed = series.some(
      (point, index) =>
        point.date !== source[index]?.date || point.value !== source[index]?.value
    );
  }

  return { series, changed };
}
