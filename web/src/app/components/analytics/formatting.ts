import { formatCurrency, getCurrencyForCountry } from '@/app/metrics/utils/currency';
import type { TaxCountry } from '@/app/types';

import type { AnalyticsCurrencyContext } from './types';

function supportedCountry(
  country: TaxCountry | null | undefined
): TaxCountry {
  if (country === 'uk' || country === 'simple') {
    return country;
  }

  return 'australia';
}

function localeForCountry(country: TaxCountry): string {
  if (country === 'uk') {
    return 'en-GB';
  }
  if (country === 'simple') {
    return 'en-US';
  }

  return 'en-AU';
}

export function createAnalyticsCurrencyContext(
  country: TaxCountry | null | undefined
): AnalyticsCurrencyContext {
  const resolvedCountry = supportedCountry(country);
  const locale = localeForCountry(resolvedCountry);
  const currency = getCurrencyForCountry(resolvedCountry);

  return {
    locale,
    currency,
    formatMoney: (amount, compact = false) =>
      formatCurrency(amount, currency, { locale, compact }),
    formatDate: (date, options) => {
      const resolvedDate = typeof date === 'string' ? new Date(date) : date;
      if (Number.isNaN(resolvedDate.getTime())) {
        return 'Not available';
      }

      return new Intl.DateTimeFormat(locale, {
        ...(options ?? {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        timeZone: 'UTC',
      }).format(resolvedDate);
    },
  };
}
