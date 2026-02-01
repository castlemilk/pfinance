/**
 * ExtraSettings - Accordion container for all extra settings sections
 */

'use client';

import { Accordion } from '@/components/ui/accordion';
import { TaxSettings } from '@/app/types';
import { 
  OvertimeEntry, 
  FringeBenefitEntry, 
  SalarySacrificeEntry,
  SalarySacrificeCalculation,
  NovatedLeaseEntry,
} from '../types';
import { SuperannuationSettings } from './SuperannuationSettings';
import { OvertimeSettings } from './OvertimeSettings';
import { FringeBenefitsSettings } from './FringeBenefitsSettings';
import { SalarySacrificeSettings } from './SalarySacrificeSettings';
import { NovatedLeaseSettings } from './NovatedLeaseSettings';
import { TaxCategorySettings } from './TaxCategorySettings';
import { DeductionsSettings, DeductionsData, DEFAULT_DEDUCTIONS } from './DeductionsSettings';
import { FamilyBenefitsSettings, FamilyBenefitsData, DEFAULT_FAMILY_BENEFITS } from './FamilyBenefitsSettings';
import { MedicareSettings } from './MedicareSettings';
import { StudentLoanSettings } from './StudentLoanSettings';
import { TaxCategory } from '@/app/constants/taxSystems';

interface ExtraSettingsProps {
  // Tax settings
  taxSettings: TaxSettings;
  onTaxSettingChange: (setting: keyof TaxSettings, value: boolean | number) => void;
  
  // Tax category
  taxCategory: TaxCategory;
  onTaxCategoryChange: (category: TaxCategory) => void;
  taxYear?: string;
  
  // Overtime
  overtimeEntries: OvertimeEntry[];
  onOvertimeEntriesChange: (entries: OvertimeEntry[]) => void;
  
  // Fringe Benefits
  fringeBenefits: FringeBenefitEntry[];
  onFringeBenefitsChange: (benefits: FringeBenefitEntry[]) => void;
  
  // Novated Lease
  novatedLeases: NovatedLeaseEntry[];
  onNovatedLeasesChange: (leases: NovatedLeaseEntry[]) => void;
  
  // Salary Sacrifice
  salarySacrifices: SalarySacrificeEntry[];
  onSalarySacrificesChange: (sacrifices: SalarySacrificeEntry[]) => void;
  packagingCap: number;
  onPackagingCapChange: (cap: number) => void;
  salarySacrificeCalculation: SalarySacrificeCalculation;
  
  // Superannuation
  voluntarySuper: string;
  onVoluntarySuperChange: (value: string) => void;
  baseRemainingCap: number;
  remainingConcessionalCap: number;
  voluntarySuperTaxSavings: number;
  superannuation: number;
  
  // Deductions & Other Income
  deductions: DeductionsData;
  onDeductionsChange: (deductions: DeductionsData) => void;
  
  // Family Benefits
  familyBenefits: FamilyBenefitsData;
  onFamilyBenefitsChange: (benefits: FamilyBenefitsData) => void;
  
  // Medicare & Student Loan
  medicareLevy: number;
  studentLoanRepayment: number;
  studentLoanRate: string;
  studentLoanBalance: number;
  onStudentLoanBalanceChange: (balance: number) => void;
  taxableIncome: number;
  
  // Utilities
  formatCurrency: (amount: number) => string;
}

export function ExtraSettings({
  taxSettings,
  onTaxSettingChange,
  taxCategory,
  onTaxCategoryChange,
  taxYear,
  overtimeEntries,
  onOvertimeEntriesChange,
  fringeBenefits,
  onFringeBenefitsChange,
  novatedLeases,
  onNovatedLeasesChange,
  salarySacrifices,
  onSalarySacrificesChange,
  packagingCap,
  onPackagingCapChange,
  salarySacrificeCalculation,
  voluntarySuper,
  onVoluntarySuperChange,
  baseRemainingCap,
  remainingConcessionalCap,
  voluntarySuperTaxSavings,
  superannuation,
  deductions,
  onDeductionsChange,
  familyBenefits,
  onFamilyBenefitsChange,
  medicareLevy,
  studentLoanRepayment,
  studentLoanRate,
  studentLoanBalance,
  onStudentLoanBalanceChange,
  taxableIncome,
  formatCurrency,
}: ExtraSettingsProps) {
  // Determine which sections are active for default open state
  const getDefaultOpenSections = () => {
    const sections: string[] = [];
    if (taxSettings.includeSuper || taxSettings.includeVoluntarySuper) {
      sections.push('superannuation');
    }
    if (overtimeEntries.length > 0) {
      sections.push('overtime');
    }
    if (salarySacrifices.length > 0) {
      sections.push('salary-sacrifice');
    }
    if (taxCategory !== 'resident') {
      sections.push('tax-category');
    }
    return sections;
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground tracking-wider mb-3">
        Extra Settings
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Customize the calculations to your circumstances. Active sections are highlighted.
      </p>
      
      <Accordion
        type="multiple"
        defaultValue={getDefaultOpenSections()}
        className="space-y-2"
      >
        <SuperannuationSettings
          taxSettings={taxSettings}
          onTaxSettingChange={onTaxSettingChange}
          voluntarySuper={voluntarySuper}
          onVoluntarySuperChange={onVoluntarySuperChange}
          baseRemainingCap={baseRemainingCap}
          remainingConcessionalCap={remainingConcessionalCap}
          voluntarySuperTaxSavings={voluntarySuperTaxSavings}
          superannuation={superannuation}
          formatCurrency={formatCurrency}
        />

        <OvertimeSettings
          overtimeEntries={overtimeEntries}
          onOvertimeEntriesChange={onOvertimeEntriesChange}
          formatCurrency={formatCurrency}
        />

        <SalarySacrificeSettings
          salarySacrifices={salarySacrifices}
          onSalarySacrificesChange={onSalarySacrificesChange}
          packagingCap={packagingCap}
          onPackagingCapChange={onPackagingCapChange}
          calculation={salarySacrificeCalculation}
          formatCurrency={formatCurrency}
        />

        <NovatedLeaseSettings
          novatedLeases={novatedLeases}
          onNovatedLeasesChange={onNovatedLeasesChange}
          formatCurrency={formatCurrency}
        />

        <FringeBenefitsSettings
          fringeBenefits={fringeBenefits}
          onFringeBenefitsChange={onFringeBenefitsChange}
          formatCurrency={formatCurrency}
        />

        <TaxCategorySettings
          taxCategory={taxCategory}
          onTaxCategoryChange={onTaxCategoryChange}
          taxYear={taxYear as import('@/app/constants/taxSystems').TaxYear}
          formatCurrency={formatCurrency}
        />

        <DeductionsSettings
          deductions={deductions}
          onDeductionsChange={onDeductionsChange}
          formatCurrency={formatCurrency}
        />

        <FamilyBenefitsSettings
          familyBenefits={familyBenefits}
          onFamilyBenefitsChange={onFamilyBenefitsChange}
          householdIncome={taxableIncome}
          formatCurrency={formatCurrency}
        />

        <MedicareSettings
          taxSettings={taxSettings}
          onTaxSettingChange={onTaxSettingChange}
          medicareLevy={medicareLevy}
          formatCurrency={formatCurrency}
        />

        <StudentLoanSettings
          taxSettings={taxSettings}
          onTaxSettingChange={onTaxSettingChange}
          studentLoanRepayment={studentLoanRepayment}
          studentLoanRate={studentLoanRate}
          loanBalance={studentLoanBalance}
          onLoanBalanceChange={onStudentLoanBalanceChange}
          taxableIncome={taxableIncome}
          formatCurrency={formatCurrency}
        />
      </Accordion>
    </div>
  );
}

// Re-export individual components for flexibility
export { SettingsSection } from './SettingsSection';
export { SuperannuationSettings } from './SuperannuationSettings';
export { OvertimeSettings } from './OvertimeSettings';
export { FringeBenefitsSettings } from './FringeBenefitsSettings';
export { SalarySacrificeSettings } from './SalarySacrificeSettings';
export { NovatedLeaseSettings } from './NovatedLeaseSettings';
export { TaxCategorySettings } from './TaxCategorySettings';
export { DeductionsSettings, DEFAULT_DEDUCTIONS } from './DeductionsSettings';
export type { DeductionsData } from './DeductionsSettings';
export { FamilyBenefitsSettings, DEFAULT_FAMILY_BENEFITS } from './FamilyBenefitsSettings';
export type { FamilyBenefitsData, ChildEntry } from './FamilyBenefitsSettings';
export { MedicareSettings } from './MedicareSettings';
export { StudentLoanSettings } from './StudentLoanSettings';
