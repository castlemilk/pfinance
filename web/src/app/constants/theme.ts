import { ExpenseCategory } from '../types';

// Category colors for visualizations
export const categoryColors = [
  '#0EA5E9', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#6B7280', // Gray
];

// Frequency colors - more muted/pastel palette to distinguish from categories
export const frequencyColors = {
  weekly: '#94A3B8',    // Slate-400 - muted blue-gray
  fortnightly: '#A78BFA', // Violet-400 - soft purple
  monthly: '#2DD4BF',   // Teal-400 - soft teal
  annually: '#4ADE80',  // Green-400 - soft green
};

// Map expense categories to specific colors
export const getCategoryColor = (category: ExpenseCategory): string => {
  const categoryColorMap: Record<ExpenseCategory, string> = {
    'Food': categoryColors[0],
    'Housing': categoryColors[1],
    'Transportation': categoryColors[2],
    'Entertainment': categoryColors[3],
    'Healthcare': categoryColors[4],
    'Utilities': categoryColors[5],
    'Shopping': categoryColors[6],
    'Education': categoryColors[7],
    'Travel': categoryColors[8],
    'Other': categoryColors[9],
  };
  
  return categoryColorMap[category] || categoryColors[9];
};

// Map frequencies to specific colors using the dedicated palette
export const getFrequencyColor = (frequency: string): string => {
  return frequencyColors[frequency as keyof typeof frequencyColors] || '#CBD5E1';
};

// Map income sources to specific colors
export const getSourceColor = (source: string): string => {
  const sourceColorMap: Record<string, string> = {
    'Salary': categoryColors[0],      // Blue
    'Freelance': categoryColors[7],   // Indigo
    'Investment': categoryColors[2],  // Yellow
    'Rental': categoryColors[1],      // Green
    'Business': categoryColors[6],    // Orange
    'Side Hustle': categoryColors[4], // Purple
    'Dividend': categoryColors[5],    // Pink
    'Interest': categoryColors[8],    // Teal
  };
  
  return sourceColorMap[source] || categoryColors[9];
};

// Get the CSS class for category badges that match the actual category colors
export const getCategoryColorClass = (category: ExpenseCategory): string => {
  return `category-badge-${getCategoryIndex(category)}`;
};

// Get the CSS class for source badges that match their associated colors
export const getSourceColorClass = (source: string): string => {
  const sourceToColorIndex: Record<string, number> = {
    'Salary': 0,         // Blue (#0EA5E9)
    'Freelance': 7,      // Indigo (#6366F1)
    'Investment': 2,     // Yellow (#F59E0B)
    'Rental': 1,         // Green (#10B981)
    'Business': 6,       // Orange (#F97316)
    'Side Hustle': 4,    // Purple (#8B5CF6)
    'Dividend': 5,       // Pink (#EC4899)
    'Interest': 8,       // Teal (#14B8A6)
  };
  
  const colorIndex = sourceToColorIndex[source] || 9;
  return `category-badge-${colorIndex}`;
};

// Get the CSS class for frequency badges
export const getFrequencyColorClass = (frequency: string): string => {
  const frequencyToColorIndex: Record<string, number> = {
    'weekly': 0,        // Blue (#0EA5E9)
    'fortnightly': 7,   // Indigo (#6366F1)
    'monthly': 5,       // Pink (#EC4899)
    'annually': 1,      // Green (#10B981)
  };
  
  const colorIndex = frequencyToColorIndex[frequency] || 9;
  return `category-badge-${colorIndex}`;
};

// Helper function to get category index
function getCategoryIndex(category: ExpenseCategory): number {
  const categoryIndex: Record<ExpenseCategory, number> = {
    'Food': 0,
    'Housing': 1,
    'Transportation': 2,
    'Entertainment': 3,
    'Healthcare': 4,
    'Utilities': 5,
    'Shopping': 6,
    'Education': 7,
    'Travel': 8,
    'Other': 9,
  };
  
  return categoryIndex[category] || 9;
}

// Keep the old functions for backward compatibility until all components are updated
export const getCategoryBadgeVariant = getCategoryColorClass;
export const getSourceBadgeVariant = getSourceColorClass;
export const getFrequencyBadgeVariant = getFrequencyColorClass; 