/**
 * Finance Module - Proto Mappers
 * 
 * Utilities for mapping between protobuf types and local types.
 */

import {
  ExpenseCategory as ProtoExpenseCategory,
  ExpenseFrequency as ProtoExpenseFrequency,
  IncomeFrequency as ProtoIncomeFrequency,
  TaxStatus as ProtoTaxStatus,
  TaxCountry as ProtoTaxCountry,
  Expense as ProtoExpense,
  Income as ProtoIncome,
} from '@/gen/pfinance/v1/types_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';
import { 
  Expense, 
  ExpenseCategory, 
  ExpenseFrequency, 
  Income, 
  IncomeFrequency, 
  TaxConfig,
  TaxStatus,
  TaxCountry,
} from '@/app/types';

// ============================================================================
// Category Mappings
// ============================================================================

export const categoryToProto: Record<ExpenseCategory, ProtoExpenseCategory> = {
  'Food': ProtoExpenseCategory.FOOD,
  'Housing': ProtoExpenseCategory.HOUSING,
  'Transportation': ProtoExpenseCategory.TRANSPORTATION,
  'Entertainment': ProtoExpenseCategory.ENTERTAINMENT,
  'Healthcare': ProtoExpenseCategory.HEALTHCARE,
  'Utilities': ProtoExpenseCategory.UTILITIES,
  'Shopping': ProtoExpenseCategory.SHOPPING,
  'Education': ProtoExpenseCategory.EDUCATION,
  'Travel': ProtoExpenseCategory.TRAVEL,
  'Other': ProtoExpenseCategory.OTHER,
};

export const protoToCategory: Record<ProtoExpenseCategory, ExpenseCategory> = {
  [ProtoExpenseCategory.UNSPECIFIED]: 'Other',
  [ProtoExpenseCategory.FOOD]: 'Food',
  [ProtoExpenseCategory.HOUSING]: 'Housing',
  [ProtoExpenseCategory.TRANSPORTATION]: 'Transportation',
  [ProtoExpenseCategory.ENTERTAINMENT]: 'Entertainment',
  [ProtoExpenseCategory.HEALTHCARE]: 'Healthcare',
  [ProtoExpenseCategory.UTILITIES]: 'Utilities',
  [ProtoExpenseCategory.SHOPPING]: 'Shopping',
  [ProtoExpenseCategory.EDUCATION]: 'Education',
  [ProtoExpenseCategory.TRAVEL]: 'Travel',
  [ProtoExpenseCategory.OTHER]: 'Other',
};

// ============================================================================
// Expense Frequency Mappings
// ============================================================================

export const expenseFrequencyToProto: Record<ExpenseFrequency, ProtoExpenseFrequency> = {
  'once': ProtoExpenseFrequency.ONCE,
  'daily': ProtoExpenseFrequency.DAILY,
  'weekly': ProtoExpenseFrequency.WEEKLY,
  'fortnightly': ProtoExpenseFrequency.FORTNIGHTLY,
  'monthly': ProtoExpenseFrequency.MONTHLY,
  'quarterly': ProtoExpenseFrequency.QUARTERLY,
  'annually': ProtoExpenseFrequency.ANNUALLY,
};

export const protoToExpenseFrequency: Record<ProtoExpenseFrequency, ExpenseFrequency> = {
  [ProtoExpenseFrequency.UNSPECIFIED]: 'monthly',
  [ProtoExpenseFrequency.ONCE]: 'once',
  [ProtoExpenseFrequency.DAILY]: 'daily',
  [ProtoExpenseFrequency.WEEKLY]: 'weekly',
  [ProtoExpenseFrequency.FORTNIGHTLY]: 'fortnightly',
  [ProtoExpenseFrequency.MONTHLY]: 'monthly',
  [ProtoExpenseFrequency.QUARTERLY]: 'quarterly',
  [ProtoExpenseFrequency.ANNUALLY]: 'annually',
};

// ============================================================================
// Income Frequency Mappings
// ============================================================================

export const incomeFrequencyToProto: Record<IncomeFrequency, ProtoIncomeFrequency> = {
  'weekly': ProtoIncomeFrequency.WEEKLY,
  'fortnightly': ProtoIncomeFrequency.FORTNIGHTLY,
  'monthly': ProtoIncomeFrequency.MONTHLY,
  'annually': ProtoIncomeFrequency.ANNUALLY,
};

export const protoToIncomeFrequency: Record<ProtoIncomeFrequency, IncomeFrequency> = {
  [ProtoIncomeFrequency.UNSPECIFIED]: 'monthly',
  [ProtoIncomeFrequency.WEEKLY]: 'weekly',
  [ProtoIncomeFrequency.FORTNIGHTLY]: 'fortnightly',
  [ProtoIncomeFrequency.MONTHLY]: 'monthly',
  [ProtoIncomeFrequency.ANNUALLY]: 'annually',
};

// ============================================================================
// Tax Status Mappings
// ============================================================================

export const taxStatusToProto: Record<TaxStatus, ProtoTaxStatus> = {
  'preTax': ProtoTaxStatus.PRE_TAX,
  'postTax': ProtoTaxStatus.POST_TAX,
};

export const protoToTaxStatus: Record<ProtoTaxStatus, TaxStatus> = {
  [ProtoTaxStatus.UNSPECIFIED]: 'preTax',
  [ProtoTaxStatus.PRE_TAX]: 'preTax',
  [ProtoTaxStatus.POST_TAX]: 'postTax',
};

// ============================================================================
// Tax Country Mappings
// ============================================================================

export const taxCountryToProto: Record<TaxCountry, ProtoTaxCountry> = {
  'australia': ProtoTaxCountry.AUSTRALIA,
  'uk': ProtoTaxCountry.UK,
  'simple': ProtoTaxCountry.SIMPLE,
};

export const protoToTaxCountry: Record<ProtoTaxCountry, TaxCountry> = {
  [ProtoTaxCountry.UNSPECIFIED]: 'simple',
  [ProtoTaxCountry.AUSTRALIA]: 'australia',
  [ProtoTaxCountry.UK]: 'uk',
  [ProtoTaxCountry.SIMPLE]: 'simple',
};

// ============================================================================
// Entity Mappers
// ============================================================================

export function mapProtoExpenseToLocal(proto: ProtoExpense): Expense {
  return {
    id: proto.id,
    description: proto.description,
    amount: proto.amount,
    category: protoToCategory[proto.category],
    frequency: protoToExpenseFrequency[proto.frequency],
    date: proto.date ? timestampDate(proto.date) : new Date(),
  };
}

export function mapProtoIncomeToLocal(proto: ProtoIncome): Income {
  return {
    id: proto.id,
    source: proto.source,
    amount: proto.amount,
    frequency: protoToIncomeFrequency[proto.frequency],
    taxStatus: protoToTaxStatus[proto.taxStatus],
    deductions: proto.deductions?.map(d => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      isTaxDeductible: d.isTaxDeductible,
    })),
    date: proto.date ? timestampDate(proto.date) : new Date(),
  };
}

export function mapTaxConfigToProto(config: TaxConfig) {
  return {
    enabled: config.enabled,
    country: taxCountryToProto[config.country],
    taxRate: config.taxRate,
    includeDeductions: config.includeDeductions,
  };
}

export function mapProtoTaxConfigToLocal(proto: {
  enabled: boolean;
  country: ProtoTaxCountry;
  taxRate: number;
  includeDeductions: boolean;
}): TaxConfig {
  return {
    enabled: proto.enabled,
    country: protoToTaxCountry[proto.country],
    taxRate: proto.taxRate,
    includeDeductions: proto.includeDeductions,
  };
}
