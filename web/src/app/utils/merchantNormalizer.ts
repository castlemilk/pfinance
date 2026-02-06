/**
 * Merchant Normalizer
 *
 * Standardizes merchant names and maps them to expense categories.
 * This helps with consistent reporting and auto-categorization.
 */

import { ExpenseCategory } from '../types';

export interface MerchantInfo {
  name: string;
  category: ExpenseCategory;
  confidence: number;
}

// Common merchant mappings - normalized name and default category
const merchantMappings: Record<string, { name: string; category: ExpenseCategory }> = {
  // Grocery Stores
  'woolworths': { name: 'Woolworths', category: 'Food' },
  'woolies': { name: 'Woolworths', category: 'Food' },
  'coles': { name: 'Coles', category: 'Food' },
  'aldi': { name: 'Aldi', category: 'Food' },
  'iga': { name: 'IGA', category: 'Food' },
  'costco': { name: 'Costco', category: 'Food' },
  'harris farm': { name: 'Harris Farm Markets', category: 'Food' },
  'whole foods': { name: 'Whole Foods', category: 'Food' },
  'trader joe': { name: "Trader Joe's", category: 'Food' },
  'kroger': { name: 'Kroger', category: 'Food' },
  'safeway': { name: 'Safeway', category: 'Food' },
  'publix': { name: 'Publix', category: 'Food' },
  'target': { name: 'Target', category: 'Shopping' },
  'walmart': { name: 'Walmart', category: 'Shopping' },
  'kmart': { name: 'Kmart', category: 'Shopping' },
  'big w': { name: 'Big W', category: 'Shopping' },

  // Fast Food & Restaurants
  'mcdonalds': { name: "McDonald's", category: 'Food' },
  'mcdonald\'s': { name: "McDonald's", category: 'Food' },
  'maccas': { name: "McDonald's", category: 'Food' },
  'burger king': { name: 'Burger King', category: 'Food' },
  'hungry jacks': { name: 'Hungry Jacks', category: 'Food' },
  'kfc': { name: 'KFC', category: 'Food' },
  'subway': { name: 'Subway', category: 'Food' },
  'dominos': { name: "Domino's Pizza", category: 'Food' },
  'domino\'s': { name: "Domino's Pizza", category: 'Food' },
  'pizza hut': { name: 'Pizza Hut', category: 'Food' },
  'starbucks': { name: 'Starbucks', category: 'Food' },
  'gloria jeans': { name: 'Gloria Jeans', category: 'Food' },
  'the coffee club': { name: 'The Coffee Club', category: 'Food' },
  'nandos': { name: "Nando's", category: 'Food' },
  'nando\'s': { name: "Nando's", category: 'Food' },
  'guzman y gomez': { name: 'Guzman Y Gomez', category: 'Food' },
  'chipotle': { name: 'Chipotle', category: 'Food' },
  'wendy\'s': { name: "Wendy's", category: 'Food' },
  'chick-fil-a': { name: 'Chick-fil-A', category: 'Food' },
  'panera': { name: 'Panera Bread', category: 'Food' },
  'five guys': { name: 'Five Guys', category: 'Food' },
  'shake shack': { name: 'Shake Shack', category: 'Food' },

  // Food Delivery
  'uber eats': { name: 'Uber Eats', category: 'Food' },
  'ubereats': { name: 'Uber Eats', category: 'Food' },
  'doordash': { name: 'DoorDash', category: 'Food' },
  'menulog': { name: 'Menulog', category: 'Food' },
  'deliveroo': { name: 'Deliveroo', category: 'Food' },
  'grubhub': { name: 'Grubhub', category: 'Food' },
  'postmates': { name: 'Postmates', category: 'Food' },

  // Transportation
  'uber': { name: 'Uber', category: 'Transportation' },
  'lyft': { name: 'Lyft', category: 'Transportation' },
  'didi': { name: 'DiDi', category: 'Transportation' },
  'ola': { name: 'Ola', category: 'Transportation' },
  'caltex': { name: 'Caltex', category: 'Transportation' },
  'shell': { name: 'Shell', category: 'Transportation' },
  'bp': { name: 'BP', category: 'Transportation' },
  '7-eleven': { name: '7-Eleven', category: 'Transportation' },
  '7eleven': { name: '7-Eleven', category: 'Transportation' },
  'ampol': { name: 'Ampol', category: 'Transportation' },
  'exxon': { name: 'Exxon', category: 'Transportation' },
  'chevron': { name: 'Chevron', category: 'Transportation' },
  'mobil': { name: 'Mobil', category: 'Transportation' },
  'opal': { name: 'Opal Card', category: 'Transportation' },
  'myki': { name: 'Myki', category: 'Transportation' },
  'go card': { name: 'Go Card', category: 'Transportation' },

  // Streaming & Entertainment
  'netflix': { name: 'Netflix', category: 'Entertainment' },
  'spotify': { name: 'Spotify', category: 'Entertainment' },
  'disney plus': { name: 'Disney+', category: 'Entertainment' },
  'disney+': { name: 'Disney+', category: 'Entertainment' },
  'hulu': { name: 'Hulu', category: 'Entertainment' },
  'amazon prime': { name: 'Amazon Prime', category: 'Entertainment' },
  'prime video': { name: 'Amazon Prime Video', category: 'Entertainment' },
  'stan': { name: 'Stan', category: 'Entertainment' },
  'binge': { name: 'Binge', category: 'Entertainment' },
  'youtube premium': { name: 'YouTube Premium', category: 'Entertainment' },
  'youtube music': { name: 'YouTube Music', category: 'Entertainment' },
  'apple music': { name: 'Apple Music', category: 'Entertainment' },
  'apple tv': { name: 'Apple TV+', category: 'Entertainment' },
  'paramount+': { name: 'Paramount+', category: 'Entertainment' },
  'hbo max': { name: 'HBO Max', category: 'Entertainment' },
  'audible': { name: 'Audible', category: 'Entertainment' },
  'kindle unlimited': { name: 'Kindle Unlimited', category: 'Entertainment' },

  // Online Shopping
  'amazon': { name: 'Amazon', category: 'Shopping' },
  'ebay': { name: 'eBay', category: 'Shopping' },
  'etsy': { name: 'Etsy', category: 'Shopping' },
  'shein': { name: 'Shein', category: 'Shopping' },
  'asos': { name: 'ASOS', category: 'Shopping' },
  'the iconic': { name: 'The Iconic', category: 'Shopping' },
  'kogan': { name: 'Kogan', category: 'Shopping' },
  'catch': { name: 'Catch', category: 'Shopping' },
  'wish': { name: 'Wish', category: 'Shopping' },
  'aliexpress': { name: 'AliExpress', category: 'Shopping' },
  'jb hi-fi': { name: 'JB Hi-Fi', category: 'Shopping' },
  'harvey norman': { name: 'Harvey Norman', category: 'Shopping' },
  'officeworks': { name: 'Officeworks', category: 'Shopping' },
  'bunnings': { name: 'Bunnings', category: 'Shopping' },
  'best buy': { name: 'Best Buy', category: 'Shopping' },
  'home depot': { name: 'Home Depot', category: 'Shopping' },
  'lowes': { name: "Lowe's", category: 'Shopping' },
  'ikea': { name: 'IKEA', category: 'Shopping' },
  'zara': { name: 'Zara', category: 'Shopping' },
  'h&m': { name: 'H&M', category: 'Shopping' },
  'uniqlo': { name: 'Uniqlo', category: 'Shopping' },
  'nike': { name: 'Nike', category: 'Shopping' },
  'adidas': { name: 'Adidas', category: 'Shopping' },

  // Tech & Software
  'apple': { name: 'Apple', category: 'Shopping' },
  'google': { name: 'Google', category: 'Utilities' },
  'microsoft': { name: 'Microsoft', category: 'Utilities' },
  'dropbox': { name: 'Dropbox', category: 'Utilities' },
  'adobe': { name: 'Adobe', category: 'Utilities' },
  'github': { name: 'GitHub', category: 'Utilities' },
  'aws': { name: 'Amazon Web Services', category: 'Utilities' },
  'digitalocean': { name: 'DigitalOcean', category: 'Utilities' },

  // Utilities & Bills
  'telstra': { name: 'Telstra', category: 'Utilities' },
  'optus': { name: 'Optus', category: 'Utilities' },
  'vodafone': { name: 'Vodafone', category: 'Utilities' },
  'nbn': { name: 'NBN', category: 'Utilities' },
  'origin energy': { name: 'Origin Energy', category: 'Utilities' },
  'agl': { name: 'AGL', category: 'Utilities' },
  'energy australia': { name: 'EnergyAustralia', category: 'Utilities' },
  'sydney water': { name: 'Sydney Water', category: 'Utilities' },
  'verizon': { name: 'Verizon', category: 'Utilities' },
  'at&t': { name: 'AT&T', category: 'Utilities' },
  't-mobile': { name: 'T-Mobile', category: 'Utilities' },
  'comcast': { name: 'Comcast', category: 'Utilities' },
  'xfinity': { name: 'Xfinity', category: 'Utilities' },

  // Healthcare
  'chemist warehouse': { name: 'Chemist Warehouse', category: 'Healthcare' },
  'priceline': { name: 'Priceline Pharmacy', category: 'Healthcare' },
  'terry white': { name: 'Terry White Chemmart', category: 'Healthcare' },
  'cvs': { name: 'CVS Pharmacy', category: 'Healthcare' },
  'walgreens': { name: 'Walgreens', category: 'Healthcare' },
  'rite aid': { name: 'Rite Aid', category: 'Healthcare' },

  // Fitness
  'fitness first': { name: 'Fitness First', category: 'Healthcare' },
  'anytime fitness': { name: 'Anytime Fitness', category: 'Healthcare' },
  '24 hour fitness': { name: '24 Hour Fitness', category: 'Healthcare' },
  'planet fitness': { name: 'Planet Fitness', category: 'Healthcare' },
  'f45': { name: 'F45 Training', category: 'Healthcare' },
  'crossfit': { name: 'CrossFit', category: 'Healthcare' },

  // Travel
  'qantas': { name: 'Qantas', category: 'Travel' },
  'virgin australia': { name: 'Virgin Australia', category: 'Travel' },
  'jetstar': { name: 'Jetstar', category: 'Travel' },
  'southwest': { name: 'Southwest Airlines', category: 'Travel' },
  'delta': { name: 'Delta Airlines', category: 'Travel' },
  'united': { name: 'United Airlines', category: 'Travel' },
  'american airlines': { name: 'American Airlines', category: 'Travel' },
  'airbnb': { name: 'Airbnb', category: 'Travel' },
  'booking.com': { name: 'Booking.com', category: 'Travel' },
  'expedia': { name: 'Expedia', category: 'Travel' },
  'hotels.com': { name: 'Hotels.com', category: 'Travel' },
  'marriott': { name: 'Marriott', category: 'Travel' },
  'hilton': { name: 'Hilton', category: 'Travel' },
  'ibis': { name: 'Ibis', category: 'Travel' },
  'holiday inn': { name: 'Holiday Inn', category: 'Travel' },
};

// Category keywords for fallback
const categoryKeywords: Record<string, ExpenseCategory> = {
  // Food
  'restaurant': 'Food',
  'cafe': 'Food',
  'coffee': 'Food',
  'bakery': 'Food',
  'deli': 'Food',
  'market': 'Food',
  'grocer': 'Food',
  'food': 'Food',
  'pizza': 'Food',
  'sushi': 'Food',
  'thai': 'Food',
  'indian': 'Food',
  'chinese': 'Food',
  'italian': 'Food',
  'mexican': 'Food',
  'burger': 'Food',
  'chicken': 'Food',
  'fish': 'Food',
  'chips': 'Food',

  // Transportation
  'fuel': 'Transportation',
  'petrol': 'Transportation',
  'gas station': 'Transportation',
  'parking': 'Transportation',
  'toll': 'Transportation',
  'taxi': 'Transportation',
  'cab': 'Transportation',
  'transit': 'Transportation',
  'metro': 'Transportation',
  'train': 'Transportation',
  'bus': 'Transportation',
  'ferry': 'Transportation',

  // Entertainment
  'cinema': 'Entertainment',
  'movie': 'Entertainment',
  'theatre': 'Entertainment',
  'theater': 'Entertainment',
  'concert': 'Entertainment',
  'event': 'Entertainment',
  'ticket': 'Entertainment',
  'game': 'Entertainment',
  'gaming': 'Entertainment',
  'arcade': 'Entertainment',
  'bowling': 'Entertainment',
  'golf': 'Entertainment',

  // Shopping
  'store': 'Shopping',
  'shop': 'Shopping',
  'retail': 'Shopping',
  'outlet': 'Shopping',
  'electronics': 'Shopping',
  'fashion': 'Shopping',
  'clothing': 'Shopping',
  'apparel': 'Shopping',
  'shoes': 'Shopping',
  'furniture': 'Shopping',
  'hardware': 'Shopping',
  'home': 'Shopping',

  // Healthcare
  'pharmacy': 'Healthcare',
  'chemist': 'Healthcare',
  'doctor': 'Healthcare',
  'medical': 'Healthcare',
  'dental': 'Healthcare',
  'dentist': 'Healthcare',
  'hospital': 'Healthcare',
  'clinic': 'Healthcare',
  'health': 'Healthcare',
  'optometrist': 'Healthcare',
  'optical': 'Healthcare',
  'physio': 'Healthcare',

  // Utilities
  'electric': 'Utilities',
  'gas': 'Utilities',
  'water': 'Utilities',
  'internet': 'Utilities',
  'phone': 'Utilities',
  'mobile': 'Utilities',
  'broadband': 'Utilities',
  'utility': 'Utilities',

  // Education
  'school': 'Education',
  'university': 'Education',
  'college': 'Education',
  'book': 'Education',
  'course': 'Education',
  'tutor': 'Education',
  'lesson': 'Education',
  'training': 'Education',

  // Travel
  'hotel': 'Travel',
  'motel': 'Travel',
  'hostel': 'Travel',
  'airline': 'Travel',
  'flight': 'Travel',
  'airport': 'Travel',
  'travel': 'Travel',
  'vacation': 'Travel',
  'holiday': 'Travel',
  'resort': 'Travel',

  // Housing
  'rent': 'Housing',
  'mortgage': 'Housing',
  'lease': 'Housing',
  'property': 'Housing',
  'real estate': 'Housing',
  'strata': 'Housing',
  'body corp': 'Housing',
};

/**
 * Normalize a merchant name and determine its category
 */
export function normalizeMerchant(rawMerchant: string): MerchantInfo {
  const lower = rawMerchant.toLowerCase().trim();

  // Remove common prefixes/suffixes
  const cleaned = lower
    .replace(/^(pos |eftpos |visa |mastercard |amex |paypal \*)/i, '')
    .replace(/\s+(pty|ltd|inc|corp|llc|au|us|uk|nz|sg)\.?$/i, '')
    .replace(/\d{3,}/g, '') // Remove long numbers (transaction IDs)
    .replace(/[*#]/g, '')
    .trim();

  // Check direct mapping first
  for (const [key, info] of Object.entries(merchantMappings)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return {
        name: info.name,
        category: info.category,
        confidence: 0.95,
      };
    }
  }

  // Check for partial matches
  for (const [key, info] of Object.entries(merchantMappings)) {
    const words = key.split(' ');
    if (words.some(word => cleaned.includes(word) && word.length > 3)) {
      return {
        name: info.name,
        category: info.category,
        confidence: 0.8,
      };
    }
  }

  // Fall back to keyword-based categorization
  for (const [keyword, category] of Object.entries(categoryKeywords)) {
    if (cleaned.includes(keyword)) {
      return {
        name: formatMerchantName(rawMerchant),
        category,
        confidence: 0.6,
      };
    }
  }

  // Default: clean the name but mark as Other
  return {
    name: formatMerchantName(rawMerchant),
    category: 'Other',
    confidence: 0.3,
  };
}

/**
 * Format a merchant name for display
 */
function formatMerchantName(raw: string): string {
  return raw
    .replace(/^(pos |eftpos |visa |mastercard |amex |paypal \*)/i, '')
    .replace(/\s+(pty|ltd|inc|corp|llc|au|us|uk|nz|sg)\.?$/i, '')
    .replace(/\d{6,}/g, '') // Remove very long numbers
    .replace(/[*#]+/g, '')
    .split(' ')
    .map(word =>
      word.length > 2
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toUpperCase()
    )
    .join(' ')
    .trim()
    .slice(0, 50); // Limit length
}

/**
 * Get all known merchant names for a category
 */
export function getMerchantsByCategory(category: ExpenseCategory): string[] {
  return Object.entries(merchantMappings)
    .filter(([, info]) => info.category === category)
    .map(([, info]) => info.name);
}

/**
 * Get all categories that have merchant mappings
 */
export function getCategoriesWithMerchants(): ExpenseCategory[] {
  const categories = new Set<ExpenseCategory>();
  Object.values(merchantMappings).forEach(info => categories.add(info.category));
  return Array.from(categories);
}
