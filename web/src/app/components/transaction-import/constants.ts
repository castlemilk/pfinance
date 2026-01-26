/**
 * TransactionImport - Constants
 * 
 * Category keywords and mappings for transaction categorization.
 */

import { ExpenseCategory } from '@/app/types';

/**
 * Map to default categories based on common keywords
 */
export const CATEGORY_KEYWORDS: Record<string, ExpenseCategory> = {
  // Food
  'restaurant': 'Food',
  'cafe': 'Food',
  'uber eats': 'Food',
  'doordash': 'Food',
  'grocery': 'Food',
  'supermarket': 'Food',
  'mcdonalds': 'Food',
  'kfc': 'Food',
  'dominos': 'Food',
  'pizza': 'Food',
  'coffee': 'Food',
  'starbucks': 'Food',
  'coles': 'Food',
  'woolworths': 'Food',
  'aldi': 'Food',
  
  // Housing
  'rent': 'Housing',
  'mortgage': 'Housing',
  'property': 'Housing',
  'maintenance': 'Housing',
  'repair': 'Housing',
  'agent': 'Housing',
  
  // Transportation
  'uber': 'Transportation',
  'lyft': 'Transportation',
  'taxi': 'Transportation',
  'fuel': 'Transportation',
  'petrol': 'Transportation',
  'gas': 'Transportation',
  'parking': 'Transportation',
  'toll': 'Transportation',
  'car': 'Transportation',
  'bus': 'Transportation',
  'train': 'Transportation',
  'metro': 'Transportation',
  'transit': 'Transportation',
  
  // Entertainment
  'netflix': 'Entertainment',
  'spotify': 'Entertainment',
  'hulu': 'Entertainment',
  'disney': 'Entertainment',
  'cinema': 'Entertainment',
  'movie': 'Entertainment',
  'game': 'Entertainment',
  'concert': 'Entertainment',
  'event': 'Entertainment',
  'tickets': 'Entertainment',
  
  // Healthcare
  'pharmacy': 'Healthcare',
  'doctor': 'Healthcare',
  'medical': 'Healthcare',
  'hospital': 'Healthcare',
  'health': 'Healthcare',
  'dental': 'Healthcare',
  'dentist': 'Healthcare',
  'optometrist': 'Healthcare',
  'prescription': 'Healthcare',
  
  // Utilities
  'electricity': 'Utilities',
  'water': 'Utilities',
  'gas bill': 'Utilities',
  'internet': 'Utilities',
  'phone': 'Utilities',
  'mobile': 'Utilities',
  'telstra': 'Utilities',
  'optus': 'Utilities',
  
  // Shopping
  'amazon': 'Shopping',
  'ebay': 'Shopping',
  'target': 'Shopping',
  'kmart': 'Shopping',
  'store': 'Shopping',
  'shop': 'Shopping',
  'clothing': 'Shopping',
  'fashion': 'Shopping',
  
  // Education
  'tuition': 'Education',
  'university': 'Education',
  'school': 'Education',
  'course': 'Education',
  'textbook': 'Education',
  'education': 'Education',
  'training': 'Education',
  
  // Travel
  'flight': 'Travel',
  'hotel': 'Travel',
  'airbnb': 'Travel',
  'holiday': 'Travel',
  'vacation': 'Travel',
  'qantas': 'Travel',
  'virgin': 'Travel',
  'jetstar': 'Travel',
  'booking.com': 'Travel',
  'expedia': 'Travel',
};

/**
 * All available expense categories for selection
 */
export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Food',
  'Housing',
  'Transportation',
  'Entertainment',
  'Healthcare',
  'Utilities',
  'Shopping',
  'Education',
  'Travel',
  'Other',
];
