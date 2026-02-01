/**
 * SalaryCalculator - Types
 * 
 * Type definitions for the salary calculator component.
 */

import { IncomeFrequency } from '@/app/types';

export type SalaryInputMode = 'gross' | 'net';

export type SalaryFormData = {
  salary: string;
  frequency: IncomeFrequency;
  salaryInputMode: SalaryInputMode;
  voluntarySuper: string;
  isProratedHours: boolean;
  proratedHours: string;
  proratedFrequency: IncomeFrequency;
  packagingCap: number;
};

export type OvertimeEntry = {
  id: string;
  hours: string;
  rate: string;
  frequency: IncomeFrequency;
  includeSuper: boolean;
};

export type FringeBenefitEntry = {
  id: string;
  description: string;
  amount: string;
  frequency: IncomeFrequency;
  type: "taxable" | "exempt";
  reportable: boolean;
};

export type SalarySacrificeEntry = {
  id: string;
  description: string;
  amount: string;
  frequency: IncomeFrequency;
  isTaxDeductible: boolean;
};

export type NovatedLeaseEntry = {
  id: string;
  description: string;
  amount: string;
  frequency: IncomeFrequency;
  isPreTax: boolean;
};

export type SalaryBreakdown = {
  frequency: IncomeFrequency;
  grossIncome: number;
  baseSalary: number;
  overtime: number;
  tax: number;
  medicare: number;
  studentLoan: number;
  netIncome: number;
  superannuation: number;
  voluntarySuper: number;
  fringeBenefits: number;
  reportableFBT: number;
  salarySacrifice: number;
  taxDeductibleSacrifice: number;
};

export type SalarySacrificeCalculation = {
  totalSalarySacrifice: number;
  taxDeductibleSacrifice: number;
  nonTaxDeductibleSacrifice: number;
  remainingPackagingCap: number;
  estimatedTaxSavings: number;
  netCashBenefit: number;
  packagingCap: number;
};

export type FringeBenefitsCalculation = {
  taxableFBT: number;
  exemptFBT: number;
  reportableFBT: number;
  totalFBT: number;
};
