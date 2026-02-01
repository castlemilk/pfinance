import { CountryTaxSystem, TaxCountry, TaxBracket } from '../types';

// Tax year type
export type TaxYear = 
  | '2020-21'
  | '2021-22'
  | '2022-23'
  | '2023-24'
  | '2024-25'
  | '2025-26'
  | '2026-27'
  | '2027-28';

// Tax category type for different residency/employment situations
export type TaxCategory = 
  | 'resident'          // Australian Resident (default)
  | 'non-resident'      // Foreign Resident
  | 'working-holiday'   // Working Holiday Maker (Backpacker visa 417/462)
  | 'no-tax-free';      // No Tax-Free Threshold (second job)

// Australian Tax Brackets by Year
// Source: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents
const australianTaxBracketsByYear: Record<TaxYear, TaxBracket[]> = {
  // 2020-21: Pre Stage 2 changes
  '2020-21': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 37000, rate: 19 },
    { min: 37001, max: 90000, rate: 32.5 },
    { min: 90001, max: 180000, rate: 37 },
    { min: 180001, max: null, rate: 45 }
  ],
  // 2021-22: Same as 2020-21
  '2021-22': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 19 },
    { min: 45001, max: 120000, rate: 32.5 },
    { min: 120001, max: 180000, rate: 37 },
    { min: 180001, max: null, rate: 45 }
  ],
  // 2022-23: Same as 2021-22
  '2022-23': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 19 },
    { min: 45001, max: 120000, rate: 32.5 },
    { min: 120001, max: 180000, rate: 37 },
    { min: 180001, max: null, rate: 45 }
  ],
  // 2023-24: Same as 2022-23
  '2023-24': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 19 },
    { min: 45001, max: 120000, rate: 32.5 },
    { min: 120001, max: 180000, rate: 37 },
    { min: 180001, max: null, rate: 45 }
  ],
  // 2024-25: Stage 3 tax cuts (revised)
  '2024-25': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 16 },
    { min: 45001, max: 135000, rate: 30 },
    { min: 135001, max: 190000, rate: 37 },
    { min: 190001, max: null, rate: 45 }
  ],
  // 2025-26: Same as 2024-25 (projected)
  '2025-26': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 16 },
    { min: 45001, max: 135000, rate: 30 },
    { min: 135001, max: 190000, rate: 37 },
    { min: 190001, max: null, rate: 45 }
  ],
  // 2026-27: Projected (subject to change)
  '2026-27': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 16 },
    { min: 45001, max: 135000, rate: 30 },
    { min: 135001, max: 190000, rate: 37 },
    { min: 190001, max: null, rate: 45 }
  ],
  // 2027-28: Projected (subject to change)
  '2027-28': [
    { min: 0, max: 18200, rate: 0 },
    { min: 18201, max: 45000, rate: 16 },
    { min: 45001, max: 135000, rate: 30 },
    { min: 135001, max: 190000, rate: 37 },
    { min: 190001, max: null, rate: 45 }
  ],
};

// Default tax year
export const DEFAULT_TAX_YEAR: TaxYear = '2024-25';
export const DEFAULT_TAX_CATEGORY: TaxCategory = 'resident';

// Non-Resident (Foreign Resident) Tax Brackets 2024-25
// Source: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-foreign-residents
const nonResidentBrackets: TaxBracket[] = [
  { min: 0, max: 135000, rate: 30 },
  { min: 135001, max: 190000, rate: 37 },
  { min: 190001, max: null, rate: 45 }
];

// Working Holiday Maker (Backpacker) Tax Brackets 2024-25
// Source: https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers
const workingHolidayBrackets: TaxBracket[] = [
  { min: 0, max: 45000, rate: 15 },
  { min: 45001, max: 135000, rate: 30 },
  { min: 135001, max: 190000, rate: 37 },
  { min: 190001, max: null, rate: 45 }
];

// No Tax-Free Threshold (Second Job) - Same rates but no tax-free threshold
// Uses regular rates but starting from 0
const noTaxFreeBrackets: TaxBracket[] = [
  { min: 0, max: 45000, rate: 16 },
  { min: 45001, max: 135000, rate: 30 },
  { min: 135001, max: 190000, rate: 37 },
  { min: 190001, max: null, rate: 45 }
];

// Tax category info for display
export const TAX_CATEGORY_OPTIONS: { 
  value: TaxCategory; 
  label: string; 
  description: string;
  helpUrl?: string;
}[] = [
  { 
    value: 'resident', 
    label: 'Australian Resident',
    description: 'Standard tax rates with tax-free threshold',
    helpUrl: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents'
  },
  { 
    value: 'non-resident', 
    label: 'Non-Resident',
    description: 'Foreign resident tax rates (no tax-free threshold)',
    helpUrl: 'https://www.ato.gov.au/Individuals/Coming-to-Australia-or-going-overseas/Your-tax-residency/'
  },
  { 
    value: 'working-holiday', 
    label: 'Working Holiday Maker',
    description: 'Visa 417, 462 (Backpacker)',
    helpUrl: 'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-working-holiday-makers'
  },
  { 
    value: 'no-tax-free', 
    label: 'No Tax-Free Threshold',
    description: 'Second job or elected no tax-free',
    helpUrl: 'https://www.ato.gov.au/Forms/Tax-file-number-declaration/'
  },
];

// Get Australian tax brackets for a specific year and category
export function getAustralianBrackets(
  year: TaxYear = DEFAULT_TAX_YEAR,
  category: TaxCategory = DEFAULT_TAX_CATEGORY
): TaxBracket[] {
  // For non-standard categories, use the special brackets
  switch (category) {
    case 'non-resident':
      return nonResidentBrackets;
    case 'working-holiday':
      return workingHolidayBrackets;
    case 'no-tax-free':
      return noTaxFreeBrackets;
    case 'resident':
    default:
      return australianTaxBracketsByYear[year] || australianTaxBracketsByYear[DEFAULT_TAX_YEAR];
  }
}

// Tax year labels for display
export const TAX_YEAR_OPTIONS: { value: TaxYear; label: string; isFuture?: boolean }[] = [
  { value: '2020-21', label: '2020-21' },
  { value: '2021-22', label: '2021-22' },
  { value: '2022-23', label: '2022-23' },
  { value: '2023-24', label: '2023-24' },
  { value: '2024-25', label: '2024-25' },
  { value: '2025-26', label: '2025-26', isFuture: true },
  { value: '2026-27', label: '2026-27 *', isFuture: true },
  { value: '2027-28', label: '2027-28 *', isFuture: true },
];

// Australian Tax System (default year)
export const australianTaxSystem: CountryTaxSystem = {
  name: 'Australian',
  currency: 'AUD',
  brackets: getAustralianBrackets(DEFAULT_TAX_YEAR),
  deductionRate: 45 // Maximum marginal rate is used for deductions
};

// Get Australian tax system for a specific year and category
export function getAustralianTaxSystemForYear(
  year: TaxYear, 
  category: TaxCategory = DEFAULT_TAX_CATEGORY
): CountryTaxSystem {
  const categoryInfo = TAX_CATEGORY_OPTIONS.find(c => c.value === category);
  return {
    name: categoryInfo ? `Australian (${categoryInfo.label})` : 'Australian',
    currency: 'AUD',
    brackets: getAustralianBrackets(year, category),
    deductionRate: 45
  };
}

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

// Get tax system by country code, optional year, and optional category
export function getTaxSystem(
  country: TaxCountry, 
  year?: TaxYear, 
  category?: TaxCategory
): CountryTaxSystem {
  switch(country) {
    case 'australia':
      return getAustralianTaxSystemForYear(
        year || DEFAULT_TAX_YEAR, 
        category || DEFAULT_TAX_CATEGORY
      );
    case 'uk':
      return ukTaxSystem;
    case 'simple':
    default:
      return simpleTaxSystem;
  }
}

/**
 * Low Income Tax Offset (LITO) Calculation
 * Source: https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/tax-offsets/low-income-tax-offset
 * 
 * For 2024-25:
 * - Income <= $37,500: LITO = $700
 * - $37,500 < Income <= $45,000: LITO = $700 - ((Income - $37,500) * 0.05)
 * - $45,000 < Income <= $66,667: LITO = $325 - ((Income - $45,000) * 0.015)
 * - Income > $66,667: LITO = $0
 */
export interface LITOConfig {
  maxOffset: number;
  firstThreshold: number;
  firstReductionRate: number;
  secondThreshold: number;
  secondReductionRate: number;
  cutoffThreshold: number;
}

// LITO configurations by tax year (only applies to Australian residents)
const LITOByYear: Record<TaxYear, LITOConfig> = {
  '2020-21': {
    maxOffset: 445,
    firstThreshold: 37000,
    firstReductionRate: 0.015,
    secondThreshold: 66667,
    secondReductionRate: 0,
    cutoffThreshold: 66667,
  },
  '2021-22': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
  '2022-23': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
  '2023-24': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
  '2024-25': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
  '2025-26': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
  '2026-27': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
  '2027-28': {
    maxOffset: 700,
    firstThreshold: 37500,
    firstReductionRate: 0.05,
    secondThreshold: 45000,
    secondReductionRate: 0.015,
    cutoffThreshold: 66667,
  },
};

/**
 * Calculate the Low Income Tax Offset (LITO)
 * Only applies to Australian residents
 */
export function calculateLITO(
  taxableIncome: number,
  year: TaxYear = DEFAULT_TAX_YEAR,
  category: TaxCategory = DEFAULT_TAX_CATEGORY
): number {
  // LITO only applies to Australian residents
  if (category !== 'resident') {
    return 0;
  }

  const config = LITOByYear[year] || LITOByYear[DEFAULT_TAX_YEAR];

  if (taxableIncome <= config.firstThreshold) {
    return config.maxOffset;
  }

  if (taxableIncome <= config.secondThreshold) {
    const reduction = (taxableIncome - config.firstThreshold) * config.firstReductionRate;
    const lito = config.maxOffset - reduction;
    return Math.max(0, lito);
  }

  if (taxableIncome <= config.cutoffThreshold) {
    // Calculate reduction from first phase
    const firstPhaseReduction = (config.secondThreshold - config.firstThreshold) * config.firstReductionRate;
    const afterFirstPhase = config.maxOffset - firstPhaseReduction;
    
    // Calculate reduction from second phase
    const secondPhaseReduction = (taxableIncome - config.secondThreshold) * config.secondReductionRate;
    const lito = afterFirstPhase - secondPhaseReduction;
    return Math.max(0, lito);
  }

  return 0;
}

/**
 * Get LITO config for display
 */
export function getLITOConfig(year: TaxYear = DEFAULT_TAX_YEAR): LITOConfig {
  return LITOByYear[year] || LITOByYear[DEFAULT_TAX_YEAR];
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