import type { AnalyticsScope } from './types';

export type AnalyticsCategorySlug =
  | 'food'
  | 'housing'
  | 'transportation'
  | 'entertainment'
  | 'healthcare'
  | 'utilities'
  | 'shopping'
  | 'education'
  | 'travel'
  | 'other';

export type AnalyticsExpenseFilters = {
  date?: string;
  category?: AnalyticsCategorySlug;
  from?: string;
  to?: string;
  expenseId?: string;
};

const ANALYTICS_CATEGORY_SLUGS = new Set<AnalyticsCategorySlug>([
  'food',
  'housing',
  'transportation',
  'entertainment',
  'healthcare',
  'utilities',
  'shopping',
  'education',
  'travel',
  'other',
]);

function isAnalyticsCategorySlug(
  value: unknown
): value is AnalyticsCategorySlug {
  return (
    typeof value === 'string' &&
    ANALYTICS_CATEGORY_SLUGS.has(value as AnalyticsCategorySlug)
  );
}

function isUtcCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day] = match;
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() + 1 === Number(month) &&
    parsed.getUTCDate() === Number(day)
  );
}

export function buildAnalyticsExpenseUrl(
  scope: AnalyticsScope,
  filters: AnalyticsExpenseFilters
): string {
  const basePath =
    scope.kind === 'group' ? '/shared/expenses' : '/personal/expenses';
  const searchParams = new URLSearchParams();

  if (isUtcCalendarDate(filters.date)) {
    searchParams.set('date', filters.date);
  }
  if (isAnalyticsCategorySlug(filters.category)) {
    searchParams.set('category', filters.category);
  }
  if (isUtcCalendarDate(filters.from)) {
    searchParams.set('from', filters.from);
  }
  if (isUtcCalendarDate(filters.to)) {
    searchParams.set('to', filters.to);
  }
  if (
    typeof filters.expenseId === 'string' &&
    filters.expenseId.trim().length > 0
  ) {
    searchParams.set('expenseId', filters.expenseId.trim());
  }

  const query = searchParams.toString();
  return query ? `${basePath}?${query}` : basePath;
}
