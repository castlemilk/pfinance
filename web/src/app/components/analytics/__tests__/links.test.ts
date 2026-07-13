import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

import {
  ANALYTICS_CATEGORY_SLUGS,
  ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY,
  analyticsCategorySlug,
  buildAnalyticsExpenseUrl,
  type AnalyticsExpenseFilters,
} from '../links';
import type { AnalyticsScope } from '../types';

const personalScope: AnalyticsScope = { kind: 'personal' };
const groupScope: AnalyticsScope = {
  kind: 'group',
  groupId: 'group-42',
  groupName: 'Home',
};

describe('buildAnalyticsExpenseUrl', () => {
  it('uses the personal and group expense routes', () => {
    expect(buildAnalyticsExpenseUrl(personalScope, {})).toBe(
      '/personal/expenses'
    );
    expect(buildAnalyticsExpenseUrl(groupScope, {})).toBe('/shared/expenses');
  });

  it('serialises validated filters in stable canonical order', () => {
    expect(
      buildAnalyticsExpenseUrl(personalScope, {
        expenseId: 'expense/with space',
        to: '2026-07-31',
        from: '2026-07-01',
        category: 'transportation',
        date: '2026-07-13',
      })
    ).toBe(
      '/personal/expenses?date=2026-07-13&category=transportation&from=2026-07-01&to=2026-07-31&expenseId=expense%2Fwith+space'
    );
  });

  it('builds the approved group category range link', () => {
    expect(
      buildAnalyticsExpenseUrl(groupScope, {
        category: 'food',
        from: '2026-07-01',
        to: '2026-07-13',
      })
    ).toBe(
      '/shared/expenses?category=food&from=2026-07-01&to=2026-07-13'
    );
  });

  it.each(ANALYTICS_CATEGORY_SLUGS)(
    'accepts the canonical %s category slug',
    (category) => {
    expect(buildAnalyticsExpenseUrl(personalScope, { category })).toBe(
      `/personal/expenses?category=${category}`
    );
    }
  );

  it('accepts real UTC calendar dates, including leap day', () => {
    expect(
      buildAnalyticsExpenseUrl(personalScope, {
        date: '2024-02-29',
        from: '2024-02-01',
        to: '2024-02-29',
      })
    ).toBe(
      '/personal/expenses?date=2024-02-29&from=2024-02-01&to=2024-02-29'
    );
  });

  it.each([
    '2023-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-7-01',
    ' 2026-07-01',
    'not-a-date',
    '',
  ])('ignores malformed date value %p', (date) => {
    expect(buildAnalyticsExpenseUrl(personalScope, { date })).toBe(
      '/personal/expenses'
    );
  });

  it.each([
    ['date', '0000-01-01'],
    ['date', '0000-02-29'],
    ['from', '0000-01-01'],
    ['from', '0000-02-29'],
    ['to', '0000-01-01'],
    ['to', '0000-02-29'],
  ] as const)('rejects year-zero %s value %s', (field, value) => {
    expect(
      buildAnalyticsExpenseUrl(personalScope, { [field]: value })
    ).toBe('/personal/expenses');
  });

  it('ignores non-canonical categories and empty identifiers at runtime', () => {
    const malformedFilters = {
      category: 'Food',
      expenseId: '   ',
      from: '2026-04-31',
    } as unknown as AnalyticsExpenseFilters;

    expect(buildAnalyticsExpenseUrl(groupScope, malformedFilters)).toBe(
      '/shared/expenses'
    );
  });
});

describe('analytics category contract', () => {
  const generatedCategoryMappings = [
    [ExpenseCategory.FOOD, 'food'],
    [ExpenseCategory.HOUSING, 'housing'],
    [ExpenseCategory.TRANSPORTATION, 'transportation'],
    [ExpenseCategory.ENTERTAINMENT, 'entertainment'],
    [ExpenseCategory.HEALTHCARE, 'healthcare'],
    [ExpenseCategory.UTILITIES, 'utilities'],
    [ExpenseCategory.SHOPPING, 'shopping'],
    [ExpenseCategory.EDUCATION, 'education'],
    [ExpenseCategory.TRAVEL, 'travel'],
    [ExpenseCategory.OTHER, 'other'],
    [ExpenseCategory.UNSPECIFIED, 'other'],
  ] as const;

  it('exports the exact canonical category slugs in stable order', () => {
    expect(ANALYTICS_CATEGORY_SLUGS).toEqual([
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
  });

  it.each(generatedCategoryMappings)(
    'maps generated ExpenseCategory %s to %s',
    (category, expectedSlug) => {
      expect(ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY[category]).toBe(
        expectedSlug
      );
      expect(analyticsCategorySlug(category)).toBe(expectedSlug);
    }
  );

  it('exhaustively maps the generated enum and safely handles unknown runtime values', () => {
    expect(
      Object.keys(ANALYTICS_CATEGORY_SLUG_BY_EXPENSE_CATEGORY)
    ).toHaveLength(generatedCategoryMappings.length);
    expect(analyticsCategorySlug(999 as ExpenseCategory)).toBe('other');
  });

  it('passes a generated category mapping into the canonical link builder', () => {
    const category = analyticsCategorySlug(ExpenseCategory.FOOD);

    expect(buildAnalyticsExpenseUrl(groupScope, { category })).toBe(
      '/shared/expenses?category=food'
    );
  });
});
