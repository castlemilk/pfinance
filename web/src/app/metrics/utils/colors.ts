/**
 * Color Utilities for Metrics Visualization
 *
 * Amber Terminal Glow Theme - Retro-futuristic CRT aesthetic
 * Colors inspired by 70s amber monitors with warm earth tones
 */

import { ExpenseCategory } from '../../types';
import { SavingsStatus } from '../types';

/**
 * Primary category colors for expense visualization
 * Using the Amber Terminal palette: amber, avocado, rust, golden tones
 */
export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Food: '#FFA94D',           // Amber (primary)
  Housing: '#87A96B',        // Avocado green
  Transportation: '#D16A47', // Rust
  Entertainment: '#E07E50',  // Tawny orange
  Healthcare: '#A0C080',     // Sage green
  Utilities: '#C4A35A',      // Golden tan
  Shopping: '#B8860B',       // Dark goldenrod
  Education: '#8B7355',      // Warm brown
  Travel: '#6B8E23',         // Olive drab
  Other: '#8B8378',          // Warm gray
};

/**
 * Get color for an expense category
 */
export function getCategoryColor(category: ExpenseCategory): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}

/**
 * Colors for income sources
 * Blue-shifted ambers for distinction from expenses
 */
export const INCOME_COLORS = {
  primary: '#E8B84A',    // Warm gold
  secondary: '#D4A843',  // Darker gold
  tertiary: '#C49A3C',   // Bronze gold
  quaternary: '#B08C35', // Deep gold
};

/**
 * Get color for an income source (cycles through available colors)
 */
export function getIncomeColor(index: number): string {
  const colors = Object.values(INCOME_COLORS);
  return colors[index % colors.length];
}

/**
 * Colors for expense flow visualization
 */
export const EXPENSE_FLOW_COLORS = {
  category: '#D16A47',  // Rust for main expense node
  subcategory: ['#E07E50', '#C4A35A', '#B8860B', '#8B7355', '#A0856B', '#987654', '#876543'],
};

/**
 * Colors for savings visualization
 */
export const SAVINGS_COLORS = {
  category: '#87A96B',     // Avocado green for main savings node
  investments: '#A0C080',  // Sage green
  cash: '#B8D4A0',         // Light sage
  retirement: '#6B8E23',   // Olive
};

/**
 * Color for tax node
 */
export const TAX_COLOR = '#C4A35A'; // Golden tan

/**
 * Savings status colors - Terminal feedback palette
 */
export const SAVINGS_STATUS_COLORS: Record<SavingsStatus, string> = {
  excellent: '#87A96B', // Avocado green
  good: '#A0C080',      // Sage green
  fair: '#FFA94D',      // Amber warning
  poor: '#D16A47',      // Rust red
};

/**
 * Get color for savings status
 */
export function getSavingsStatusColor(status: SavingsStatus): string {
  return SAVINGS_STATUS_COLORS[status];
}

/**
 * Tailwind CSS class names for savings status (for components using Tailwind)
 */
export const SAVINGS_STATUS_CLASSES: Record<SavingsStatus, string> = {
  excellent: 'text-green-600 dark:text-green-400',
  good: 'text-emerald-500 dark:text-emerald-400',
  fair: 'text-amber-500 dark:text-amber-400',
  poor: 'text-red-500 dark:text-red-400',
};

/**
 * Get Tailwind class for savings status
 */
export function getSavingsStatusClass(status: SavingsStatus): string {
  return SAVINGS_STATUS_CLASSES[status];
}

/**
 * Budget utilization colors - Amber to rust gradient
 */
export function getBudgetUtilizationColor(utilization: number): string {
  if (utilization < 50) return '#87A96B';  // Avocado - healthy
  if (utilization < 75) return '#FFA94D';  // Amber - caution
  if (utilization < 100) return '#E07E50'; // Tawny - warning
  return '#D16A47';                         // Rust - exceeded
}

/**
 * Generate a color scale for a given number of items
 * Uses warm hues (amber, rust, gold, olive range)
 */
export function generateColorScale(count: number, baseHue: number = 45): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    // Cycle through warm hues: 30-80 (orange to yellow-green)
    const hue = 30 + ((baseHue + (i * 50 / count)) % 50);
    colors.push(`hsl(${hue}, 60%, 55%)`);
  }
  return colors;
}

/**
 * Lighten a hex color
 */
export function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0x0000FF) + Math.round(255 * percent / 100));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}

/**
 * Darken a hex color
 */
export function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0x00FF) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0x0000FF) - Math.round(255 * percent / 100));
  return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
}
