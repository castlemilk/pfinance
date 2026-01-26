/**
 * useSalaryCalculations Hook
 * 
 * Core calculation logic for salary, tax, medicare, student loan, and super.
 */

import { useMemo } from 'react';
import { TaxSettings, IncomeFrequency, TaxCountry } from '@/app/types';
import { getTaxSystem, calculateTaxWithBrackets } from '@/app/constants/taxSystems';
import { 
  OvertimeEntry, 
  SalarySacrificeEntry, 
  FringeBenefitEntry,
  SalarySacrificeCalculation,
  FringeBenefitsCalculation,
  SalaryBreakdown
} from '../types';
import { 
  HELP_REPAYMENT_THRESHOLDS, 
  MEDICARE_LEVY_RATE,
  ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT,
  FBT_RATE
} from '../constants';
import { toAnnualAmount, fromAnnualAmount } from '../utils';

interface UseSalaryCalculationsOptions {
  baseSalary: number;
  frequency: IncomeFrequency;
  isProratedHours: boolean;
  proratedHours: number;
  proratedFrequency: IncomeFrequency;
  overtimeEntries: OvertimeEntry[];
  salarySacrifices: SalarySacrificeEntry[];
  fringeBenefits: FringeBenefitEntry[];
  taxSettings: TaxSettings;
  taxCountry: TaxCountry;
  voluntarySuper: number;
  packagingCap: number;
}

interface UseSalaryCalculationsReturn {
  annualSalary: number;
  totalOvertimeAmount: number;
  totalAnnualIncome: number;
  taxableIncome: number;
  incomeTax: number;
  medicareLevy: number;
  studentLoanRepayment: number;
  superannuation: number;
  voluntarySuperContribution: number;
  voluntarySuperTaxSavings: number;
  baseRemainingCap: number;
  remainingConcessionalCap: number;
  netIncome: number;
  salarySacrificeCalculation: SalarySacrificeCalculation;
  fringeBenefitsCalculation: FringeBenefitsCalculation;
  breakdowns: SalaryBreakdown[];
  studentLoanRate: string;
}

export function useSalaryCalculations({
  baseSalary,
  frequency,
  isProratedHours,
  proratedHours,
  proratedFrequency,
  overtimeEntries,
  salarySacrifices,
  fringeBenefits,
  taxSettings,
  taxCountry,
  voluntarySuper,
  packagingCap,
}: UseSalaryCalculationsOptions): UseSalaryCalculationsReturn {
  
  // Convert salary to annual amount
  const annualSalary = useMemo(() => {
    let salary = toAnnualAmount(baseSalary, frequency);
    
    // Apply pro-rata calculation if enabled
    if (isProratedHours && proratedHours > 0) {
      const standardHours = proratedFrequency === 'weekly' ? 38 : 76;
      const proRataRatio = proratedHours / standardHours;
      salary = salary * proRataRatio;
    }
    
    return salary;
  }, [baseSalary, frequency, isProratedHours, proratedHours, proratedFrequency]);

  // Calculate total overtime
  const totalOvertimeAmount = useMemo(() => {
    return overtimeEntries.reduce((total, entry) => {
      const hours = parseFloat(entry.hours) || 0;
      const rate = parseFloat(entry.rate) || 0;
      const amount = toAnnualAmount(hours * rate, entry.frequency);
      return total + amount;
    }, 0);
  }, [overtimeEntries]);

  // Total income (salary + overtime)
  const totalAnnualIncome = useMemo(() => {
    return annualSalary + totalOvertimeAmount;
  }, [annualSalary, totalOvertimeAmount]);

  // Calculate salary sacrifice
  const salarySacrificeCalculation = useMemo((): SalarySacrificeCalculation => {
    const totalSalarySacrifice = salarySacrifices.reduce((total, ss) => {
      const amount = parseFloat(ss.amount) || 0;
      return total + toAnnualAmount(amount, ss.frequency);
    }, 0);
    
    const taxDeductibleSacrifice = salarySacrifices
      .filter(ss => ss.isTaxDeductible)
      .reduce((total, ss) => {
        const amount = parseFloat(ss.amount) || 0;
        return total + toAnnualAmount(amount, ss.frequency);
      }, 0);
    
    const remainingPackagingCap = Math.max(0, packagingCap - totalSalarySacrifice);
    
    // Calculate estimated tax savings
    let estimatedTaxSavings = 0;
    if (taxDeductibleSacrifice > 0) {
      const taxSystem = getTaxSystem(taxCountry);
      const taxWithoutSacrifice = calculateTaxWithBrackets(totalAnnualIncome, taxSystem.brackets);
      const taxWithSacrifice = calculateTaxWithBrackets(totalAnnualIncome - taxDeductibleSacrifice, taxSystem.brackets);
      estimatedTaxSavings = taxWithoutSacrifice - taxWithSacrifice;
    }
    
    return {
      totalSalarySacrifice,
      taxDeductibleSacrifice,
      nonTaxDeductibleSacrifice: totalSalarySacrifice - taxDeductibleSacrifice,
      remainingPackagingCap,
      estimatedTaxSavings,
      netCashBenefit: taxDeductibleSacrifice - estimatedTaxSavings,
      packagingCap
    };
  }, [salarySacrifices, packagingCap, totalAnnualIncome, taxCountry]);

  // Calculate fringe benefits
  const fringeBenefitsCalculation = useMemo((): FringeBenefitsCalculation => {
    const taxableFBT = fringeBenefits
      .filter(fb => fb.type === "taxable")
      .reduce((total, fb) => {
        const amount = parseFloat(fb.amount) || 0;
        return total + toAnnualAmount(amount, fb.frequency);
      }, 0);
    
    const exemptFBT = fringeBenefits
      .filter(fb => fb.type === "exempt")
      .reduce((total, fb) => {
        const amount = parseFloat(fb.amount) || 0;
        return total + toAnnualAmount(amount, fb.frequency);
      }, 0);
    
    const reportableFBT = fringeBenefits
      .filter(fb => fb.reportable)
      .reduce((total, fb) => {
        const amount = parseFloat(fb.amount) || 0;
        let annualAmount = toAnnualAmount(amount, fb.frequency);
        
        // If taxable, gross up the amount
        if (fb.type === "taxable") {
          annualAmount = annualAmount * (1 / (1 - FBT_RATE));
        }
        
        return total + annualAmount;
      }, 0);
    
    return {
      taxableFBT,
      exemptFBT,
      reportableFBT,
      totalFBT: taxableFBT + exemptFBT
    };
  }, [fringeBenefits]);

  // Calculate taxable income
  const taxableIncome = useMemo(() => {
    let taxable = totalAnnualIncome;
    
    // Subtract tax deductible salary sacrifice
    taxable -= salarySacrificeCalculation.taxDeductibleSacrifice;
    
    // Subtract voluntary super contributions
    if (taxSettings.includeVoluntarySuper) {
      taxable -= voluntarySuper;
    }
    
    return Math.max(0, taxable);
  }, [totalAnnualIncome, salarySacrificeCalculation.taxDeductibleSacrifice, taxSettings.includeVoluntarySuper, voluntarySuper]);

  // Calculate income tax
  const incomeTax = useMemo(() => {
    const taxSystem = getTaxSystem(taxCountry);
    return calculateTaxWithBrackets(taxableIncome, taxSystem.brackets);
  }, [taxableIncome, taxCountry]);

  // Calculate Medicare Levy
  const medicareLevy = useMemo(() => {
    if (!taxSettings.includeMedicare || taxSettings.medicareExemption || taxSettings.includePrivateHealth) {
      return 0;
    }
    return taxableIncome * MEDICARE_LEVY_RATE;
  }, [taxableIncome, taxSettings.includeMedicare, taxSettings.medicareExemption, taxSettings.includePrivateHealth]);

  // Calculate student loan repayment
  const studentLoanRepayment = useMemo(() => {
    if (!taxSettings.includeStudentLoan) return 0;
    
    const threshold = HELP_REPAYMENT_THRESHOLDS.find(
      t => taxableIncome >= t.min && taxableIncome <= t.max
    );
    
    if (!threshold) return 0;
    return taxableIncome * threshold.rate;
  }, [taxableIncome, taxSettings.includeStudentLoan]);

  // Get student loan rate as string
  const studentLoanRate = useMemo(() => {
    if (!taxSettings.includeStudentLoan) return '0%';
    
    const threshold = HELP_REPAYMENT_THRESHOLDS.find(
      t => taxableIncome >= t.min && taxableIncome <= t.max
    );
    
    if (!threshold) return '0%';
    return `${(threshold.rate * 100).toFixed(1)}%`;
  }, [taxableIncome, taxSettings.includeStudentLoan]);

  // Calculate superannuation
  const superannuation = useMemo(() => {
    if (!taxSettings.includeSuper) return 0;
    
    let totalSuper = annualSalary * (taxSettings.superRate / 100);
    
    // Add super on overtime if applicable
    overtimeEntries.forEach(entry => {
      if (entry.includeSuper) {
        const hours = parseFloat(entry.hours) || 0;
        const rate = parseFloat(entry.rate) || 0;
        const overtimeAmount = toAnnualAmount(hours * rate, entry.frequency);
        totalSuper += overtimeAmount * (taxSettings.superRate / 100);
      }
    });
    
    return totalSuper;
  }, [annualSalary, taxSettings.includeSuper, taxSettings.superRate, overtimeEntries]);

  // Base remaining cap before voluntary contributions
  const baseRemainingCap = useMemo(() => {
    return Math.max(0, ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT - superannuation);
  }, [superannuation]);

  // Voluntary super contribution (capped)
  const voluntarySuperContribution = useMemo(() => {
    if (!taxSettings.includeVoluntarySuper) return 0;
    return Math.min(voluntarySuper, baseRemainingCap);
  }, [taxSettings.includeVoluntarySuper, voluntarySuper, baseRemainingCap]);

  // Tax savings from voluntary super
  const voluntarySuperTaxSavings = useMemo(() => {
    if (!taxSettings.includeVoluntarySuper) return 0;
    const marginalRate = 0.325;
    const superTaxRate = 0.15;
    return voluntarySuperContribution * (marginalRate - superTaxRate);
  }, [voluntarySuperContribution, taxSettings.includeVoluntarySuper]);

  // Remaining concessional cap
  const remainingConcessionalCap = useMemo(() => {
    return Math.max(0, baseRemainingCap - voluntarySuperContribution);
  }, [baseRemainingCap, voluntarySuperContribution]);

  // Calculate net income
  const netIncome = useMemo(() => {
    let net = totalAnnualIncome;
    
    net -= incomeTax;
    net -= medicareLevy;
    net -= studentLoanRepayment;
    
    if (taxSettings.includeVoluntarySuper) {
      net -= voluntarySuper;
    }
    
    net -= salarySacrificeCalculation.totalSalarySacrifice;
    
    return Math.max(0, net);
  }, [
    totalAnnualIncome, 
    incomeTax, 
    medicareLevy, 
    studentLoanRepayment, 
    taxSettings.includeVoluntarySuper, 
    voluntarySuper,
    salarySacrificeCalculation.totalSalarySacrifice
  ]);

  // Create breakdowns for all frequencies
  const breakdowns = useMemo((): SalaryBreakdown[] => {
    const frequencies: IncomeFrequency[] = ['weekly', 'fortnightly', 'monthly', 'annually'];
    
    return frequencies.map(freq => ({
      frequency: freq,
      grossIncome: fromAnnualAmount(totalAnnualIncome, freq),
      baseSalary: fromAnnualAmount(annualSalary, freq),
      overtime: fromAnnualAmount(totalOvertimeAmount, freq),
      tax: fromAnnualAmount(incomeTax, freq),
      medicare: fromAnnualAmount(medicareLevy, freq),
      studentLoan: fromAnnualAmount(studentLoanRepayment, freq),
      netIncome: fromAnnualAmount(netIncome, freq),
      superannuation: fromAnnualAmount(superannuation, freq),
      voluntarySuper: fromAnnualAmount(voluntarySuperContribution, freq),
      fringeBenefits: fromAnnualAmount(fringeBenefitsCalculation.totalFBT, freq),
      reportableFBT: fromAnnualAmount(fringeBenefitsCalculation.reportableFBT, freq),
      salarySacrifice: fromAnnualAmount(salarySacrificeCalculation.totalSalarySacrifice, freq),
      taxDeductibleSacrifice: fromAnnualAmount(salarySacrificeCalculation.taxDeductibleSacrifice, freq),
    }));
  }, [
    totalAnnualIncome, 
    annualSalary, 
    totalOvertimeAmount, 
    incomeTax, 
    medicareLevy, 
    studentLoanRepayment, 
    netIncome, 
    superannuation, 
    voluntarySuperContribution,
    fringeBenefitsCalculation,
    salarySacrificeCalculation
  ]);

  return {
    annualSalary,
    totalOvertimeAmount,
    totalAnnualIncome,
    taxableIncome,
    incomeTax,
    medicareLevy,
    studentLoanRepayment,
    superannuation,
    voluntarySuperContribution,
    voluntarySuperTaxSavings,
    baseRemainingCap,
    remainingConcessionalCap,
    netIncome,
    salarySacrificeCalculation,
    fringeBenefitsCalculation,
    breakdowns,
    studentLoanRate,
  };
}
