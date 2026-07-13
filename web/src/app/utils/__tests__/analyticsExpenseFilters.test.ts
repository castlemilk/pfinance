import { timestampFromDate } from '@bufbuild/protobuf/wkt';

import {
  hasAnalyticsExpenseFilters,
  matchesAnalyticsExpenseFilters,
  parseAnalyticsExpenseFilters,
  serializeAnalyticsExpenseFilters,
} from '../analyticsExpenseFilters';
import { ANALYTICS_CATEGORY_SLUGS } from '@/app/components/analytics/links';
import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

describe('analytics expense filter contract', () => {
  it('parses only approved valid query parameters in canonical order', () => {
    const parsed = parseAnalyticsExpenseFilters(
      new URLSearchParams(
        'expenseId=%20expense-42%20&to=2026-07-31&from=2026-07-01&category=transportation&date=2026-07-13&groupId=foreign&unexpected=value'
      )
    );

    expect(parsed).toEqual({
      date: '2026-07-13',
      category: 'transportation',
      from: '2026-07-01',
      to: '2026-07-31',
      expenseId: 'expense-42',
    });
    expect(serializeAnalyticsExpenseFilters(parsed).toString()).toBe(
      'date=2026-07-13&category=transportation&from=2026-07-01&to=2026-07-31&expenseId=expense-42'
    );
  });

  it.each(ANALYTICS_CATEGORY_SLUGS)(
    'round-trips the canonical %s category',
    (category) => {
      const parsed = parseAnalyticsExpenseFilters(
        serializeAnalyticsExpenseFilters({ category })
      );

      expect(parsed).toEqual({ category });
    }
  );

  it.each([
    ['date=2023-02-29', {}],
    ['date=2026-02-30', {}],
    ['date=0000-01-01', {}],
    ['date=2026-7-01', {}],
    ['category=Food', {}],
    ['category=unknown', {}],
    ['expenseId=+++', {}],
    ['from=2026-07-31&to=2026-07-01', {}],
    ['from=invalid&to=2026-07-31', { to: '2026-07-31' }],
    ['date=2024-02-29&debug=true', { date: '2024-02-29' }],
  ] as const)('ignores malformed or unknown values in %s', (query, expected) => {
    expect(parseAnalyticsExpenseFilters(new URLSearchParams(query))).toEqual(
      expected
    );
  });

  it('normalizes malformed runtime values identically when serializing and parsing', () => {
    const malformed = {
      date: '2026-04-31',
      category: 'Food',
      from: '2026-08-20',
      to: '2026-08-01',
      expenseId: '   ',
    } as never;

    const serialized = serializeAnalyticsExpenseFilters(malformed);

    expect(serialized.toString()).toBe('');
    expect(parseAnalyticsExpenseFilters(serialized)).toEqual({});
    expect(hasAnalyticsExpenseFilters({})).toBe(false);
  });

  it('matches a UTC date and canonical category for personal and protobuf expenses', () => {
    const filters = {
      date: '2026-07-13',
      category: 'food' as const,
    };

    expect(
      matchesAnalyticsExpenseFilters(
        {
          id: 'personal-food',
          date: new Date('2026-07-13T23:59:59.999Z'),
          category: 'Food',
        },
        filters
      )
    ).toBe(true);
    expect(
      matchesAnalyticsExpenseFilters(
        {
          id: 'group-food',
          date: timestampFromDate(new Date('2026-07-13T00:00:00.000Z')),
          category: ExpenseCategory.FOOD,
        },
        filters
      )
    ).toBe(true);
    expect(
      matchesAnalyticsExpenseFilters(
        {
          id: 'local-next-day',
          date: new Date('2026-07-14T00:00:00.000Z'),
          category: 'Food',
        },
        filters
      )
    ).toBe(false);
  });

  it('applies inclusive UTC bounds before focused-expense handling', () => {
    const filters = {
      from: '2026-07-01',
      to: '2026-07-31',
      expenseId: 'focus-me',
    };

    expect(
      matchesAnalyticsExpenseFilters(
        {
          id: 'range-start',
          date: new Date('2026-07-01T00:00:00.000Z'),
          category: 'Housing',
        },
        filters
      )
    ).toBe(true);
    expect(
      matchesAnalyticsExpenseFilters(
        {
          id: 'range-end',
          date: new Date('2026-07-31T23:59:59.999Z'),
          category: ExpenseCategory.HOUSING,
        },
        filters
      )
    ).toBe(true);
    expect(
      matchesAnalyticsExpenseFilters(
        {
          id: 'outside',
          date: new Date('2026-08-01T00:00:00.000Z'),
          category: 'Housing',
        },
        filters
      )
    ).toBe(false);
  });
});
