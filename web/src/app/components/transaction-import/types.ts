/**
 * TransactionImport - Types
 * 
 * Type definitions for transaction import functionality.
 */

import { ExpenseCategory } from '@/app/types';

/**
 * Transaction type for parsed data from CSV/PDF
 */
export interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category: ExpenseCategory;
  selected: boolean;
  confidence?: number;
}

/**
 * Interface for parsed JSON data from PDF
 */
export interface TransactionData {
  date: string;
  description: string;
  amount: string | number;
}

/**
 * Supported file types for transaction import
 */
export type ImportFileType = 'csv' | 'pdf';

/**
 * Import result status
 */
export interface ImportResult {
  success: boolean;
  transactions: Transaction[];
  errors: string[];
}
