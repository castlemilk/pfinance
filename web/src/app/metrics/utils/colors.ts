/**
 * Color Utilities for Metrics Visualization
 * 
 * Centralized color management for charts and visualizations.
 */

import { ExpenseCategory } from '../../types';
import { SavingsStatus } from '../types';

/**
 * Primary category colors for expense visualization
 */
export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  Food: '#0EA5E9',           // Blue
  Housing: '#10B981',        // Green
  Transportation: '#F59E0B', // Yellow
  Entertainment: '#EF4444',  // Red
  Healthcare: '#8B5CF6',     // Purple
  Utilities: '#EC4899',      // Pink
  Shopping: '#F97316',       // Orange
  Education: '#6366F1',      // Indigo
  Travel: '#14B8A6',         // Teal
  Other: '#6B7280',          // Gray
};

/**
 * Get color for an expense category
 */
export function getCategoryColor(category: ExpenseCategory): string {
  return CATEGORY_COLORS[category] ?? CATEGORY_COLORS.Other;
}

/**
 * Colors for income sources
 */
export const INCOME_COLORS = {
  primary: '#3b82f6',   // Blue
  secondary: '#60a5fa', // Light blue
  tertiary: '#93c5fd',  // Lighter blue
  quaternary: '#bfdbfe', // Very light blue
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
  category: '#ef4444',  // Red for main expense node
  subcategory: ['#f87171', '#fca5a5', '#fee2e2', '#fecaca', '#fda4af', '#f43f5e', '#fb7185'],
};

/**
 * Colors for savings visualization
 */
export const SAVINGS_COLORS = {
  category: '#22c55e',   // Green for main savings node
  investments: '#4ade80',
  cash: '#86efac',
  retirement: '#bbf7d0',
};

/**
 * Color for tax node
 */
export const TAX_COLOR = '#f97316'; // Orange

/**
 * Savings status colors
 */
export const SAVINGS_STATUS_COLORS: Record<SavingsStatus, string> = {
  excellent: '#22c55e', // Green
  good: '#10b981',      // Emerald
  fair: '#f59e0b',      // Amber
  poor: '#ef4444',      // Red
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
 * Budget utilization colors
 */
export function getBudgetUtilizationColor(utilization: number): string {
  if (utilization < 50) return '#22c55e';  // Green - healthy
  if (utilization < 75) return '#f59e0b';  // Amber - caution
  if (utilization < 100) return '#f97316'; // Orange - warning
  return '#ef4444';                         // Red - exceeded
}

/**
 * Generate a color scale for a given number of items
 */
export function generateColorScale(count: number, baseHue: number = 210): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    const hue = (baseHue + (i * 360 / count)) % 360;
    colors.push(`hsl(${hue}, 70%, 50%)`);
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
