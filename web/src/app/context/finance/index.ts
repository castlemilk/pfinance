/**
 * Finance Module
 * 
 * Barrel exports for clean imports.
 * 
 * Usage:
 *   import { useExpenses, useIncomes, mapProtoExpenseToLocal } from '@/app/context/finance';
 */

// Hooks
export {
  useExpenses,
  useIncomes,
  useTaxConfig,
  useFinanceCalculations,
} from './hooks';

// Mappers
export {
  categoryToProto,
  protoToCategory,
  expenseFrequencyToProto,
  protoToExpenseFrequency,
  incomeFrequencyToProto,
  protoToIncomeFrequency,
  taxStatusToProto,
  protoToTaxStatus,
  taxCountryToProto,
  protoToTaxCountry,
  mapProtoExpenseToLocal,
  mapProtoIncomeToLocal,
  mapTaxConfigToProto,
  mapProtoTaxConfigToLocal,
} from './mappers';
