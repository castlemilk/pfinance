/**
 * Currency Formatting Utilities
 * 
 * Centralized utilities for formatting monetary amounts.
 */

import { TaxCountry } from '../../types';

/**
 * Currency codes by tax country
 */
const CURRENCY_BY_COUNTRY: Record<TaxCountry, string> = {
  australia: 'AUD',
  uk: 'GBP',
  simple: 'USD',
};

/**
 * Get the currency code for a tax country
 */
export function getCurrencyForCountry(country: TaxCountry): string {
  return CURRENCY_BY_COUNTRY[country] ?? 'USD';
}

/**
 * Format a number as currency
 */
export function formatCurrency(
  amount: number, 
  currency: string = 'USD',
  options?: {
    locale?: string;
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
    compact?: boolean;
  }
): string {
  const { 
    locale = 'en', 
    maximumFractionDigits = amount < 10 ? 2 : 0,
    minimumFractionDigits = 0,
    compact = false 
  } = options ?? {};

  const formatOptions: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    maximumFractionDigits,
    minimumFractionDigits,
  };

  if (compact && Math.abs(amount) >= 1000) {
    formatOptions.notation = 'compact';
    formatOptions.maximumFractionDigits = 1;
  }

  return new Intl.NumberFormat(locale, formatOptions).format(amount);
}

/**
 * Format a number as a percentage
 */
export function formatPercentage(
  value: number, 
  decimals: number = 1,
  options?: {
    locale?: string;
    includeSign?: boolean;
  }
): string {
  const { locale = 'en', includeSign = false } = options ?? {};
  
  const formatted = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
  
  if (includeSign && value > 0) {
    return `+${formatted}`;
  }
  
  return formatted;
}

/**
 * Parse a currency string back to a number
 */
export function parseCurrency(value: string): number {
  // Remove currency symbols and formatting
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Get the currency symbol
 */
export function getCurrencySymbol(currency: string = 'USD', locale: string = 'en'): string {
  const formatted = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(0);
  
  // Extract the symbol by removing the number
  return formatted.replace(/[\d,.\s]/g, '').trim();
}
