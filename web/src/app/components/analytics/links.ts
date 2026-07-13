import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

import type { AnalyticsScope } from './types';

export const ANALYTICS_CATEGORY_SLUGS = [
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
] as const;

export type AnalyticsCategorySlug = (typeof ANALYTICS_CATEGORY_SLUGS)[number];

export const ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY = {
  [ExpenseCategory.UNSPECIFIED]: 'other',
  [ExpenseCategory.FOOD]: 'food',
  [ExpenseCategory.HOUSING]: 'housing',
  [ExpenseCategory.TRANSPORTATION]: 'transportation',
  [ExpenseCategory.ENTERTAINMENT]: 'entertainment',
  [ExpenseCategory.HEALTHCARE]: 'healthcare',
  [ExpenseCategory.UTILITIES]: 'utilities',
  [ExpenseCategory.SHOPPING]: 'shopping',
  [ExpenseCategory.EDUCATION]: 'education',
  [ExpenseCategory.TRAVEL]: 'travel',
  [ExpenseCategory.OTHER]: 'other',
} satisfies Record<ExpenseCategory, AnalyticsCategorySlug>;

export function analyticsCategorySlug(
  category: ExpenseCategory
): AnalyticsCategorySlug {
  return ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY[category] ?? 'other';
}

export type AnalyticsExpenseFilters = {
  date?: string;
  category?: AnalyticsCategorySlug;
  from?: string;
  to?: string;
  expenseId?: string;
};

const analyticsCategorySlugSet = new Set<AnalyticsCategorySlug>(
  ANALYTICS_CATEGORY_SLUGS
);

function isAnalyticsCategorySlug(
  value: unknown
): value is AnalyticsCategorySlug {
  return (
    typeof value === 'string' &&
    analyticsCategorySlugSet.has(value as AnalyticsCategorySlug)
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
