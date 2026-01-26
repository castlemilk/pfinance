/**
 * TransactionImport - Utility Functions
 * 
 * Helper functions for transaction processing and categorization.
 */

import { ExpenseCategory } from '@/app/types';
import { CATEGORY_KEYWORDS } from './constants';

/**
 * Guess category based on transaction description using keyword matching
 */
export function guessCategory(description: string): ExpenseCategory {
  const lowerDesc = description.toLowerCase();
  
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (lowerDesc.includes(keyword.toLowerCase())) {
      return category;
    }
  }
  
  return 'Other';
}

/**
 * Convert file to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

/**
 * Parse amount from string, handling various formats
 */
export function parseAmount(value: string | number): number {
  if (typeof value === 'number') return Math.abs(value);
  
  // Remove currency symbols and thousands separators
  const cleaned = value
    .replace(/[$,]/g, '')
    .replace(/\s/g, '')
    .trim();
  
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : Math.abs(parsed);
}

/**
 * Parse date from various formats
 */
export function parseDate(dateStr: string): Date {
  // Try common date formats
  // Try common date formats
  // const formats = [
  //   // DD/MM/YYYY
  //   /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  //   // YYYY-MM-DD
  //   /^(\d{4})-(\d{2})-(\d{2})$/,
  //   // DD-MM-YYYY
  //   /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
  //   // MM/DD/YYYY
  //   /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  // ];
  
  // First try native parsing
  const nativeParsed = new Date(dateStr);
  if (!isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }
  
  // Try DD/MM/YYYY format specifically
  const ddmmMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmMatch) {
    const [, day, month, year] = ddmmMatch;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  return new Date(); // Default to now if parsing fails
}

/**
 * Generate unique ID for transaction
 */
export function generateTransactionId(): string {
  return `tx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
