/**
 * Period Conversion Utilities
 * 
 * Centralized utilities for converting amounts between different time periods.
 * This eliminates the duplicated period conversion logic across the codebase.
 */

import { IncomeFrequency, ExpenseFrequency } from '../../types';

/**
 * Multipliers to convert from a given frequency to annual
 */
const TO_ANNUAL_MULTIPLIERS: Record<IncomeFrequency | ExpenseFrequency, number> = {
  hourly: 2080, // 40 hours/week * 52 weeks
  daily: 365,
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  annually: 1,
  // ExpenseFrequency extras
  once: 1,
  quarterly: 4,
};

/**
 * Convert an amount from a given frequency to annual
 */
export function toAnnual(amount: number, frequency: IncomeFrequency | ExpenseFrequency): number {
  const multiplier = TO_ANNUAL_MULTIPLIERS[frequency] ?? 1;
  return amount * multiplier;
}

/**
 * Convert an annual amount to a target frequency
 */
export function fromAnnual(annualAmount: number, targetFrequency: IncomeFrequency): number {
  const multiplier = TO_ANNUAL_MULTIPLIERS[targetFrequency] ?? 1;
  return annualAmount / multiplier;
}

/**
 * Convert an amount from one frequency to another
 */
export function convertPeriod(
  amount: number, 
  fromFrequency: IncomeFrequency | ExpenseFrequency, 
  toFrequency: IncomeFrequency
): number {
  const annualized = toAnnual(amount, fromFrequency);
  return fromAnnual(annualized, toFrequency);
}

/**
 * Get the human-readable period label
 */
export function getPeriodLabel(frequency: IncomeFrequency): string {
  const labels: Record<IncomeFrequency, string> = {
    hourly: 'per hour',
    daily: 'per day',
    weekly: 'per week',
    fortnightly: 'per fortnight',
    monthly: 'per month',
    annually: 'per year',
  };
  return labels[frequency] ?? frequency;
}

/**
 * Get the short period label for compact displays
 */
export function getShortPeriodLabel(frequency: IncomeFrequency): string {
  const labels: Record<IncomeFrequency, string> = {
    hourly: '/hr',
    daily: '/day',
    weekly: '/wk',
    fortnightly: '/fn',
    monthly: '/mo',
    annually: '/yr',
  };
  return labels[frequency] ?? frequency;
}

/**
 * Calculate the number of periods in a year
 */
export function getPeriodsPerYear(frequency: IncomeFrequency): number {
  return TO_ANNUAL_MULTIPLIERS[frequency] ?? 1;
}

/**
 * Get the number of days in a period
 */
export function getDaysInPeriod(frequency: IncomeFrequency): number {
  const daysPerYear = 365;
  const periodsPerYear = getPeriodsPerYear(frequency);
  return Math.round(daysPerYear / periodsPerYear);
}
