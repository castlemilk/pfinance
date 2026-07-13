import type { TaxCountry } from '@/app/types';

import { createAnalyticsCurrencyContext } from '../formatting';

describe('createAnalyticsCurrencyContext', () => {
  it('formats Australian analytics values with an explicit AUD locale', () => {
    const context = createAnalyticsCurrencyContext('australia');

    expect(context.locale).toBe('en-AU');
    expect(context.currency).toBe('AUD');
    expect(context.formatMoney(1234)).toBe('$1,234');
    expect(context.formatMoney(12500, true)).toBe('$12.5K');
  });

  it('formats UK analytics values with an explicit GBP locale', () => {
    const viewingMemberCountry: TaxCountry = 'uk';
    const context = createAnalyticsCurrencyContext(viewingMemberCountry);

    expect(context.locale).toBe('en-GB');
    expect(context.currency).toBe('GBP');
    expect(context.formatMoney(1234)).toBe('£1,234');
    expect(context.formatMoney(12500, true)).toBe('£12.5K');
  });

  it('formats simple-tax analytics values with an explicit USD locale', () => {
    const context = createAnalyticsCurrencyContext('simple');

    expect(context.locale).toBe('en-US');
    expect(context.currency).toBe('USD');
    expect(context.formatMoney(1234)).toBe('$1,234');
  });

  it.each([null, undefined, 'unsupported-country' as TaxCountry])(
    'falls back to en-AU and AUD for %p',
    (country) => {
      const context = createAnalyticsCurrencyContext(country);

      expect(context.locale).toBe('en-AU');
      expect(context.currency).toBe('AUD');
      expect(context.formatMoney(1234)).toBe('$1,234');
    }
  );

  it('formats dates deterministically in the selected locale', () => {
    const australian = createAnalyticsCurrencyContext('australia');
    const american = createAnalyticsCurrencyContext('simple');

    expect(australian.formatDate('2026-07-13')).toBe('13 July 2026');
    expect(american.formatDate(new Date('2026-07-13T23:30:00.000Z'))).toBe(
      'Jul 13, 2026'
    );
    expect(
      american.formatDate('2026-07-13', {
        month: 'long',
        day: 'numeric',
      })
    ).toBe('July 13');
  });
});
