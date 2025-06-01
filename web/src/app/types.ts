export type IncomeFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'annually';
export type TaxStatus = 'preTax' | 'postTax';

export interface TaxSettings {
  includeSuper: boolean;
  superRate: number;
  includeMedicare: boolean;
  medicareExemption: boolean;
  includeSeniorOffset: boolean;
  includeStudentLoan: boolean;
  studentLoanRate: number;
  includeDependentChildren: boolean;
  includeSpouse: boolean;
  includePrivateHealth: boolean;
  includeVoluntarySuper: boolean;
}

export interface Deduction {
  id: string;
  name: string;
  amount: number;
  isTaxDeductible: boolean;
}

export type ExpenseCategory = 'Food' | 'Housing' | 'Transportation' | 'Entertainment' | 'Healthcare' | 'Utilities' | 'Shopping' | 'Education' | 'Travel' | 'Other';

export type ExpenseFrequency = 'once' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: Date;
  frequency: IncomeFrequency;
}

export interface ExpenseSummary {
  category: ExpenseCategory;
  totalAmount: number;
  percentage: number;
}

export interface Income {
  id: string;
  source: string;
  amount: number;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
  deductions?: Deduction[];
  date: Date;
}

export type TaxCountry = 'australia' | 'uk' | 'simple';

export interface TaxBracket {
  min: number;
  max: number | null;
  rate: number;
  baseAmount?: number;
}

export interface CountryTaxSystem {
  name: string;
  currency: string;
  brackets: TaxBracket[];
  deductionRate?: number;
}

export interface TaxConfig {
  enabled: boolean;
  country: TaxCountry;
  taxRate: number;
  includeDeductions: boolean;
  customBrackets?: TaxBracket[];
} 