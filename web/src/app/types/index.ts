export type ExpenseCategory = 
  | 'Food' 
  | 'Housing' 
  | 'Transportation' 
  | 'Entertainment' 
  | 'Healthcare'
  | 'Utilities'
  | 'Shopping'
  | 'Education'
  | 'Travel'
  | 'Other';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: Date;
  frequency: ExpenseFrequency;
}

export type ExpenseFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'annually';

export interface ExpenseSummary {
  category: ExpenseCategory;
  totalAmount: number;
  percentage: number;
}

// Income related types
export type IncomeFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'annually';

export type TaxStatus = 'preTax' | 'postTax';

export interface Income {
  id: string;
  source: string;
  amount: number;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
  deductions?: Deduction[];
  date: Date;
}

export interface Deduction {
  id: string;
  name: string;
  amount: number;
  isTaxDeductible: boolean;
}

// Tax related types
export type TaxCountry = 'australia' | 'uk' | 'simple';

export interface TaxBracket {
  min: number;
  max: number | null; // null means no upper limit
  rate: number; // Percentage (e.g., 25 = 25%)
  baseAmount?: number; // Fixed amount for some tax systems
}

export interface CountryTaxSystem {
  name: string;
  currency: string;
  brackets: TaxBracket[];
  deductionRate?: number; // Some countries have different rates for deductions
}

export interface TaxConfig {
  enabled: boolean;
  country: TaxCountry;
  taxRate: number; // Used for simple flat-rate calculation
  includeDeductions: boolean;
  customBrackets?: TaxBracket[]; // Allow custom brackets
}

// Salary calculator types
export interface SalaryCalculatorConfig {
  salary: number;
  frequency: IncomeFrequency;
  taxSettings: TaxSettings;
  taxYear: string;
}

export interface TaxSettings {
  includeSuper: boolean;
  superRate: number;
  includeMedicare: boolean;
  medicareExemption: boolean;
  includeSeniorOffset: boolean;
  includeStudentLoan: boolean;
  studentLoanRate?: number; // Now optional - we're using ATO thresholds instead
  includeDependentChildren: boolean;
  includeSpouse: boolean;
  includePrivateHealth: boolean;
  includeVoluntarySuper: boolean;
}

export interface MedicareLevySettings {
  rate: number; // Usually 2% in Australia
  surchargeRate: number; // Medicare Levy Surcharge for high-income earners
  exemptionThreshold: number; // Income threshold for exemption
  reductionThreshold: number; // Income threshold for reduction
}

export interface StudentLoanSettings {
  enabled: boolean;
  repaymentRate: number; // Percentage of income
  threshold: number; // Repayment threshold
}

export interface TaxOffsetSettings {
  lowIncome: boolean; // Low Income Tax Offset (LITO)
  seniorAndPensioner: boolean; // Senior and Pensioner Tax Offset (SAPTO)
  dependentChildren: boolean;
  spouse: boolean;
}

export interface SalaryBreakdown {
  grossIncome: number;
  tax: number;
  medicare: number;
  studentLoan: number;
  superannuation: number;
  netIncome: number;
}

export interface TaxBandInfo {
  rates: number[];
  thresholds: number[];
  labels: string[];
} 