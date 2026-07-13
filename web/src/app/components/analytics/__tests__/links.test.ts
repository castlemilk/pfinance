import {
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

  it.each([
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
  ] as const)('accepts the canonical %s category slug', (category) => {
    expect(buildAnalyticsExpenseUrl(personalScope, { category })).toBe(
      `/personal/expenses?category=${category}`
    );
  });

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
