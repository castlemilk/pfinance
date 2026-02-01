/**
 * SalaryCalculator - Main export
 * 
 * This file re-exports the refactored SalaryCalculator component
 * for backward compatibility with existing imports.
 * 
 * The new implementation uses modular sub-components:
 * - IncomeSection: Core salary inputs
 * - ExtraSettings: Accordion-based settings (with active state highlighting)
 * - SummaryPanel: Results display with frequency tabs
 * 
 * See ./salary-calculator/ for the full implementation.
 */

'use client';

export { SalaryCalculatorNew as SalaryCalculator } from './salary-calculator';
