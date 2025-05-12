import { CountryTaxSystem, TaxCountry } from '../types';

// Australian Tax Brackets 2023-2024
export const australianTaxSystem: CountryTaxSystem = {
  name: 'Australian',
  currency: 'AUD',
  brackets: [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 19 },
    { min: 45001, max: 120000, rate: 32.5 },
    { min: 120001, max: 180000, rate: 37 },
    { min: 180001, max: null, rate: 45 }
  ],
  deductionRate: 45 // Maximum marginal rate is used for deductions
};

// UK Tax Brackets 2023-2024
export const ukTaxSystem: CountryTaxSystem = {
  name: 'United Kingdom',
  currency: 'GBP',
  brackets: [
    { min: 0, max: 12570, rate: 0 },
    { min: 12571, max: 50270, rate: 20 },
    { min: 50271, max: 125140, rate: 40 },
    { min: 125141, max: null, rate: 45 }
  ],
  deductionRate: 40 // Higher rate is typically used for deductions
};

// Simple flat rate system (original implementation)
export const simpleTaxSystem: CountryTaxSystem = {
  name: 'Simple Flat Rate',
  currency: 'USD',
  brackets: [
    { min: 0, max: null, rate: 20 } // Default 20% flat rate
  ]
};

// Get tax system by country code
export function getTaxSystem(country: TaxCountry): CountryTaxSystem {
  switch(country) {
    case 'australia':
      return australianTaxSystem;
    case 'uk':
      return ukTaxSystem;
    case 'simple':
    default:
      return simpleTaxSystem;
  }
}

// Calculate tax using progressive brackets
export function calculateTaxWithBrackets(income: number, brackets: CountryTaxSystem['brackets']): number {
  // The Australian and UK tax systems are progressive - each bracket applies only to the portion
  // of income that falls within that bracket. However, some systems include a "baseAmount" that 
  // represents a fixed amount plus a percentage of the excess.
  
  if (income <= 0) return 0;
  
  // Sort brackets by minimum amount to ensure correct order
  const sortedBrackets = [...brackets].sort((a, b) => a.min - b.min);
  
  // Find the applicable bracket
  const applicableBracket = sortedBrackets.find(b => 
    income >= b.min && (b.max === null || income <= b.max)
  );
  
  if (!applicableBracket) return 0;
  
  // If there's a baseAmount, use the simplified calculation
  if (applicableBracket.baseAmount !== undefined) {
    const baseAmount = applicableBracket.baseAmount;
    const taxableExcess = income - applicableBracket.min;
    const taxOnExcess = taxableExcess * (applicableBracket.rate / 100);
    
    return baseAmount + taxOnExcess;
  }
  
  // Otherwise, do a proper progressive calculation
  let totalTax = 0;
  let remainingIncome = income;
  
  for (let i = 0; i < sortedBrackets.length; i++) {
    const bracket = sortedBrackets[i];
    
    if (bracket.min > income) break; // Skip brackets that don't apply
    
    // Calculate the amount of income in this bracket
    const nextBracketMin = i < sortedBrackets.length - 1 ? sortedBrackets[i + 1].min : Infinity;
    const upperLimit = bracket.max !== null ? Math.min(bracket.max, income) : income;
    const lowerLimit = bracket.min;
    const amountInBracket = Math.min(upperLimit - lowerLimit, remainingIncome);
    
    // Calculate tax for this bracket
    const taxForBracket = amountInBracket * (bracket.rate / 100);
    totalTax += taxForBracket;
    
    // Reduce remaining income
    remainingIncome -= amountInBracket;
    
    if (remainingIncome <= 0) break;
  }
  
  return totalTax;
} 