/**
 * SalaryCalculator - Utility Functions
 * 
 * Helper functions for salary calculations and formatting.
 */

import { IncomeFrequency, TaxCountry } from '@/app/types';
import { getTaxSystem } from '@/app/constants/taxSystems';

/**
 * Convert an amount from one frequency to annual amount
 */
export function toAnnualAmount(amount: number, frequency: IncomeFrequency): number {
  switch (frequency) {
    case 'weekly':
      return amount * 52;
    case 'fortnightly':
      return amount * 26;
    case 'monthly':
      return amount * 12;
    case 'annually':
    default:
      return amount;
  }
}

/**
 * Convert annual amount to a specific frequency
 */
export function fromAnnualAmount(annualAmount: number, frequency: IncomeFrequency): number {
  switch (frequency) {
    case 'weekly':
      return annualAmount / 52;
    case 'fortnightly':
      return annualAmount / 26;
    case 'monthly':
      return annualAmount / 12;
    case 'annually':
    default:
      return annualAmount;
  }
}

/**
 * Format amount as currency based on tax country
 */
export function formatCurrency(amount: number, country: TaxCountry): string {
  const currencyCode = getTaxSystem(country).currency;
  
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Calculate pro-rata salary based on hours worked
 */
export function calculateProRataSalary(
  baseSalary: number,
  hoursWorked: number,
  hoursFrequency: IncomeFrequency
): number {
  // Standard hours varies based on the frequency
  const standardHours = hoursFrequency === 'weekly' ? 38 : 76; // 38 * 2 for fortnightly
  const proRataRatio = hoursWorked / standardHours;
  return baseSalary * proRataRatio;
}

/**
 * Get pro-rata percentage and summary text
 */
export function getProRataSummary(
  hours: number,
  frequency: IncomeFrequency
): { percentage: number; summary: string } | null {
  if (hours <= 0) return null;
  
  const standardHours = frequency === 'weekly' ? 38 : 76;
  const percentage = Math.round((hours / standardHours) * 100);
  
  return {
    percentage,
    summary: `You work ${hours} hours ${frequency} or ${percentage}% prorata`
  };
}
