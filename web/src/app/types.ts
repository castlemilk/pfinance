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

export type ExpenseCategory = 'Housing' | 'Transportation' | 'Food' | 'Utilities' | 'Insurance' | 'Healthcare' | 'Entertainment' | 'Personal' | 'Education' | 'Savings' | 'Debt' | 'Other';

export type ExpenseFrequency = 'once' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'quarterly' | 'annually';

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: Date;
  frequency: ExpenseFrequency;
}

export interface ExpenseSummary {
  category: ExpenseCategory;
  totalAmount: number;
  percentage: number;
} 