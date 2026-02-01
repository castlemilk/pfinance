/**
 * SalaryCalculator - Utility Functions
 * 
 * Helper functions for salary calculations and formatting.
 */

import { IncomeFrequency, TaxCountry } from '@/app/types';
import { getTaxSystem } from '@/app/constants/taxSystems';

// Constants for time-based calculations
const HOURS_PER_WEEK = 38; // Standard full-time hours
const WEEKS_PER_YEAR = 52;
const DAYS_PER_WEEK = 5; // Standard work days
const HOURS_PER_YEAR = HOURS_PER_WEEK * WEEKS_PER_YEAR; // 1976
const DAYS_PER_YEAR = DAYS_PER_WEEK * WEEKS_PER_YEAR; // 260

/**
 * Convert an amount from one frequency to annual amount
 */
export function toAnnualAmount(amount: number, frequency: IncomeFrequency): number {
  switch (frequency) {
    case 'hourly':
      return amount * HOURS_PER_YEAR;
    case 'daily':
      return amount * DAYS_PER_YEAR;
    case 'weekly':
      return amount * WEEKS_PER_YEAR;
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
    case 'hourly':
      return annualAmount / HOURS_PER_YEAR;
    case 'daily':
      return annualAmount / DAYS_PER_YEAR;
    case 'weekly':
      return annualAmount / WEEKS_PER_YEAR;
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

/**
 * Calculate net income from gross salary
 * This is a helper function used by the reverse calculation
 */
export function calculateNetFromGross(
  grossAnnual: number,
  calculateNetFn: (gross: number) => number
): number {
  return calculateNetFn(grossAnnual);
}

/**
 * Reverse calculation: Calculate gross salary from net (take-home) income
 * Uses binary search to find the gross salary that produces the target net income
 * 
 * @param targetNetAnnual - The desired net annual income
 * @param calculateNetFn - Function that calculates net income from gross annual salary
 * @param tolerance - Acceptable difference in dollars (default: 1)
 * @param maxIterations - Maximum iterations to prevent infinite loops (default: 100)
 * @returns The gross annual salary that produces the target net income
 */
export function calculateGrossFromNet(
  targetNetAnnual: number,
  calculateNetFn: (gross: number) => number,
  tolerance: number = 1,
  maxIterations: number = 100
): number {
  if (targetNetAnnual <= 0) return 0;
  
  // Binary search bounds
  // Lower bound: net income itself (gross must be higher than net)
  // Upper bound: estimate gross as net * 1.5 (conservative estimate for high tax brackets)
  let lowerBound = targetNetAnnual;
  let upperBound = targetNetAnnual * 2;
  
  // Expand upper bound if needed until we find a gross that produces net >= target
  let iterations = 0;
  while (calculateNetFn(upperBound) < targetNetAnnual && iterations < 20) {
    upperBound *= 1.5;
    iterations++;
  }
  
  // Binary search
  iterations = 0;
  while (iterations < maxIterations) {
    const midGross = (lowerBound + upperBound) / 2;
    const midNet = calculateNetFn(midGross);
    const difference = Math.abs(midNet - targetNetAnnual);
    
    if (difference <= tolerance) {
      return midGross;
    }
    
    if (midNet < targetNetAnnual) {
      // Net is too low, need higher gross
      lowerBound = midGross;
    } else {
      // Net is too high, need lower gross
      upperBound = midGross;
    }
    
    iterations++;
  }
  
  // Return best estimate if we didn't converge
  return (lowerBound + upperBound) / 2;
}
