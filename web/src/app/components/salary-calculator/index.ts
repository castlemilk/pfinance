/**
 * SalaryCalculator Module - Index
 * 
 * Barrel exports for the salary calculator module.
 */

// Main Component
export { SalaryCalculatorNew } from './SalaryCalculatorNew';

// Sub-components
export { IncomeSection } from './IncomeSection';
export { SummaryPanel } from './SummaryPanel';
export { SaveIncomeModal } from './SaveIncomeModal';
export { PresetSelector, PRESETS } from './PresetSelector';
export type { Preset, PresetType } from './PresetSelector';
export { TaxYearSelector } from './TaxYearSelector';
export { 
  ExtraSettings,
  SettingsSection,
  SuperannuationSettings,
  OvertimeSettings,
  FringeBenefitsSettings,
  SalarySacrificeSettings,
  MedicareSettings,
  StudentLoanSettings,
} from './ExtraSettings';

// Types
export type {
  SalaryFormData,
  SalaryInputMode,
  OvertimeEntry,
  FringeBenefitEntry,
  SalarySacrificeEntry,
  SalaryBreakdown,
  SalarySacrificeCalculation,
  FringeBenefitsCalculation,
} from './types';

// Constants
export {
  ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT,
  ATO_PERSONAL_SUPER_CONTRIBUTION_URL,
  FBT_RATE,
  FBT_EXEMPT_CAP_INFO,
  ATO_FBT_URL,
  ATO_SALARY_SACRIFICE_URL,
  COMMON_PACKAGING_CAPS,
  ATO_STUDENT_LOAN_URL,
  HELP_REPAYMENT_THRESHOLDS,
  ATO_MEDICARE_LEVY_URL,
  MEDICARE_LEVY_RATE,
  DEFAULT_FORM_VALUES,
  DEFAULT_TAX_SETTINGS,
} from './constants';

// Utilities
export {
  toAnnualAmount,
  fromAnnualAmount,
  formatCurrency,
  calculateProRataSalary,
  getProRataSummary,
} from './utils';

// Hooks
export { useSalaryCalculations } from './hooks';
