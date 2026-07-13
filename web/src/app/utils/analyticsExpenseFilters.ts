import { timestampDate, type Timestamp } from '@bufbuild/protobuf/wkt';

import {
  ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY,
  ANALYTICS_CATEGORY_SLUGS,
  type AnalyticsCategorySlug,
  type AnalyticsExpenseFilters,
} from '@/app/components/analytics/links';
import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

export type { AnalyticsExpenseFilters } from '@/app/components/analytics/links';

type AnalyticsExpenseFilterSource = Pick<URLSearchParams, 'get'>;

type AnalyticsExpenseLike = {
  id: string;
  date?: Date | Timestamp | string | number;
  category: string | ExpenseCategory;
};

const analyticsCategorySlugSet = new Set<AnalyticsCategorySlug>(
  ANALYTICS_CATEGORY_SLUGS
);

function isUtcCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  if (Number(year) < 1) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

function isAnalyticsCategorySlug(
  value: unknown
): value is AnalyticsCategorySlug {
  return (
    typeof value === 'string' &&
    analyticsCategorySlugSet.has(value as AnalyticsCategorySlug)
  );
}

export function normalizeAnalyticsExpenseFilters(
  filters: AnalyticsExpenseFilters
): AnalyticsExpenseFilters {
  const normalized: AnalyticsExpenseFilters = {};

  if (isUtcCalendarDate(filters.date)) {
    normalized.date = filters.date;
  }
  if (isAnalyticsCategorySlug(filters.category)) {
    normalized.category = filters.category;
  }
  if (isUtcCalendarDate(filters.from)) {
    normalized.from = filters.from;
  }
  if (isUtcCalendarDate(filters.to)) {
    normalized.to = filters.to;
  }

  if (
    normalized.from !== undefined &&
    normalized.to !== undefined &&
    normalized.from > normalized.to
  ) {
    delete normalized.from;
    delete normalized.to;
  }

  if (typeof filters.expenseId === 'string') {
    const expenseId = filters.expenseId.trim();
    if (expenseId.length > 0) {
      normalized.expenseId = expenseId;
    }
  }

  return normalized;
}

export function parseAnalyticsExpenseFilters(
  searchParams: AnalyticsExpenseFilterSource
): AnalyticsExpenseFilters {
  return normalizeAnalyticsExpenseFilters({
    date: searchParams.get('date') ?? undefined,
    category: (searchParams.get('category') ?? undefined) as
      | AnalyticsCategorySlug
      | undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    expenseId: searchParams.get('expenseId') ?? undefined,
  });
}

export function serializeAnalyticsExpenseFilters(
  filters: AnalyticsExpenseFilters
): URLSearchParams {
  const normalized = normalizeAnalyticsExpenseFilters(filters);
  const searchParams = new URLSearchParams();

  if (normalized.date) {
    searchParams.set('date', normalized.date);
  }
  if (normalized.category) {
    searchParams.set('category', normalized.category);
  }
  if (normalized.from) {
    searchParams.set('from', normalized.from);
  }
  if (normalized.to) {
    searchParams.set('to', normalized.to);
  }
  if (normalized.expenseId) {
    searchParams.set('expenseId', normalized.expenseId);
  }

  return searchParams;
}

export function hasAnalyticsExpenseFilters(
  filters: AnalyticsExpenseFilters
): boolean {
  return Object.keys(normalizeAnalyticsExpenseFilters(filters)).length > 0;
}

function expenseUtcCalendarDate(
  value: AnalyticsExpenseLike['date']
): string | null {
  if (value === undefined) {
    return null;
  }

  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object' && 'seconds' in value) {
    date = timestampDate(value);
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function expenseCategorySlug(
  category: AnalyticsExpenseLike['category']
): AnalyticsCategorySlug | null {
  if (typeof category === 'number') {
    return (
      ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY[category] ?? null
    );
  }

  const normalized = category.trim().toLowerCase();
  return isAnalyticsCategorySlug(normalized) ? normalized : null;
}

export function matchesAnalyticsExpenseFilters(
  expense: AnalyticsExpenseLike,
  filters: AnalyticsExpenseFilters
): boolean {
  const normalized = normalizeAnalyticsExpenseFilters(filters);

  if (
    normalized.category !== undefined &&
    expenseCategorySlug(expense.category) !== normalized.category
  ) {
    return false;
  }

  if (normalized.date || normalized.from || normalized.to) {
    const expenseDate = expenseUtcCalendarDate(expense.date);
    if (!expenseDate) {
      return false;
    }
    if (normalized.date && expenseDate !== normalized.date) {
      return false;
    }
    if (normalized.from && expenseDate < normalized.from) {
      return false;
    }
    if (normalized.to && expenseDate > normalized.to) {
      return false;
    }
  }

  return true;
}
