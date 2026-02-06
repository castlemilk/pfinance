/**
 * ExtraSettingsSummary - Print-friendly display of Extra Settings for PDF reports
 *
 * Displays only active (non-default) settings in a structured format
 * suitable for PDF export.
 */

'use client';

import { TaxSettings } from '@/app/types';
import { TaxCategory } from '@/app/constants/taxSystems';
import {
  OvertimeEntry,
  FringeBenefitEntry,
  SalarySacrificeEntry,
  SalarySacrificeCalculation,
  NovatedLeaseEntry,
} from '../salary-calculator/types';
import { DeductionsData } from '../salary-calculator/ExtraSettings/DeductionsSettings';
import { FamilyBenefitsData } from '../salary-calculator/ExtraSettings/FamilyBenefitsSettings';

export interface ExtraSettingsData {
  // Tax configuration
  taxCategory: TaxCategory;
  taxSettings: TaxSettings;
  medicareLevy: number;
  studentLoanRepayment: number;
  studentLoanBalance: number;

  // Superannuation
  superannuation: number;
  voluntarySuper: number;
  voluntarySuperTaxSavings: number;
  superRate: number;

  // Additional income
  overtimeEntries: OvertimeEntry[];
  totalOvertimeAmount: number;
  fringeBenefits: FringeBenefitEntry[];
  totalFringeBenefits: number;

  // Salary packaging
  salarySacrifices: SalarySacrificeEntry[];
  salarySacrificeCalculation: SalarySacrificeCalculation;
  novatedLeases: NovatedLeaseEntry[];
  totalNovatedLease: number;

  // Deductions
  deductions: DeductionsData;

  // Family benefits
  familyBenefits: FamilyBenefitsData;
  childCareSubsidy: number;
}

interface ExtraSettingsSummaryProps {
  settings: ExtraSettingsData;
  formatCurrency: (amount: number) => string;
}

/**
 * Check if any extra settings have non-default/active values
 */
export function hasActiveSettings(settings: ExtraSettingsData): boolean {
  const {
    taxCategory,
    taxSettings,
    medicareLevy,
    studentLoanBalance,
    superannuation,
    voluntarySuper,
    overtimeEntries,
    fringeBenefits,
    salarySacrifices,
    novatedLeases,
    deductions,
    familyBenefits,
  } = settings;

  return (
    taxCategory !== 'resident' ||
    taxSettings.includeSuper ||
    taxSettings.includeMedicare ||
    taxSettings.includeStudentLoan ||
    medicareLevy > 0 ||
    studentLoanBalance > 0 ||
    superannuation > 0 ||
    voluntarySuper > 0 ||
    overtimeEntries.length > 0 ||
    fringeBenefits.length > 0 ||
    salarySacrifices.length > 0 ||
    novatedLeases.length > 0 ||
    deductions.annualDeductions > 0 ||
    deductions.capitalGains > 0 ||
    deductions.dividends > 0 ||
    deductions.businessIncome > 0 ||
    deductions.otherIncome > 0 ||
    familyBenefits.children.length > 0
  );
}

// Section wrapper for consistent styling
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="break-inside-avoid">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 border-b pb-1">
        {title}
      </h4>
      <div className="space-y-1 text-sm mb-4">
        {children}
      </div>
    </div>
  );
}

// Row item for displaying key-value pairs
function Row({ label, value, indent = false, highlight = false }: {
  label: string;
  value: string;
  indent?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`flex justify-between items-center py-0.5 ${indent ? 'pl-4' : ''}`}>
      <span className={`text-muted-foreground ${indent ? 'text-xs' : ''}`}>{label}</span>
      <span className={`font-medium ${highlight ? 'text-green-600 dark:text-green-400' : ''}`}>
        {value}
      </span>
    </div>
  );
}

export function ExtraSettingsSummary({ settings, formatCurrency }: ExtraSettingsSummaryProps) {
  const {
    taxCategory,
    taxSettings,
    medicareLevy,
    studentLoanRepayment,
    studentLoanBalance,
    superannuation,
    voluntarySuper,
    voluntarySuperTaxSavings,
    superRate,
    overtimeEntries,
    totalOvertimeAmount,
    fringeBenefits,
    totalFringeBenefits,
    salarySacrifices,
    salarySacrificeCalculation,
    novatedLeases,
    totalNovatedLease,
    deductions,
    familyBenefits,
    childCareSubsidy,
  } = settings;

  // Determine which sections have active content
  const hasTaxConfig = taxCategory !== 'resident' ||
    (taxSettings.includeMedicare && medicareLevy > 0) ||
    (taxSettings.includeStudentLoan && studentLoanBalance > 0);

  const hasSuperannuation = taxSettings.includeSuper || voluntarySuper > 0;

  const hasAdditionalIncome = overtimeEntries.length > 0 || fringeBenefits.length > 0;

  const hasSalaryPackaging = salarySacrifices.length > 0 || novatedLeases.length > 0;

  const hasDeductions =
    deductions.annualDeductions > 0 ||
    deductions.capitalGains > 0 ||
    deductions.dividends > 0 ||
    deductions.frankingCredits > 0 ||
    deductions.businessIncome > 0 ||
    deductions.businessLoss > 0 ||
    deductions.otherIncome > 0 ||
    deductions.otherTaxOffsets > 0;

  const hasFamilyBenefits = familyBenefits.children.length > 0;

  // Frequency label helper
  const frequencyLabel = (freq: string) => {
    const labels: Record<string, string> = {
      weekly: 'week',
      fortnightly: 'fortnight',
      monthly: 'month',
      annually: 'year',
    };
    return labels[freq] || freq;
  };

  // Calculate overtime multiplier display
  const formatOvertimeRate = (entry: OvertimeEntry) => {
    const rate = parseFloat(entry.rate);
    if (rate === 1.5) return '1.5x (time and a half)';
    if (rate === 2) return '2x (double time)';
    if (rate === 2.5) return '2.5x (double time and a half)';
    return `${rate}x`;
  };

  return (
    <div className="space-y-4">
      {/* Tax Configuration */}
      {hasTaxConfig && (
        <Section title="Tax Configuration">
          {taxCategory !== 'resident' && (
            <Row
              label="Tax Category"
              value={taxCategory === 'non-resident' ? 'Non-Resident' :
                     taxCategory === 'working-holiday' ? 'Working Holiday Maker' :
                     taxCategory.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            />
          )}
          {taxSettings.includeMedicare && medicareLevy > 0 && (
            <Row label="Medicare Levy" value={formatCurrency(medicareLevy)} />
          )}
          {taxSettings.includeStudentLoan && studentLoanBalance > 0 && (
            <>
              <Row label="HELP/HECS Repayment" value={formatCurrency(studentLoanRepayment)} />
              <Row label="Loan Balance" value={formatCurrency(studentLoanBalance)} indent />
            </>
          )}
        </Section>
      )}

      {/* Superannuation */}
      {hasSuperannuation && (
        <Section title="Superannuation">
          {taxSettings.includeSuper && superannuation > 0 && (
            <Row
              label={`Employer Super (${superRate}%)`}
              value={`${formatCurrency(superannuation)}/yr`}
            />
          )}
          {voluntarySuper > 0 && (
            <>
              <Row
                label="Voluntary Contribution"
                value={`${formatCurrency(voluntarySuper)}/yr`}
              />
              {voluntarySuperTaxSavings > 0 && (
                <Row
                  label="Tax Savings"
                  value={`${formatCurrency(voluntarySuperTaxSavings)}/yr`}
                  indent
                  highlight
                />
              )}
            </>
          )}
        </Section>
      )}

      {/* Additional Income */}
      {hasAdditionalIncome && (
        <Section title="Additional Income">
          {overtimeEntries.length > 0 && (
            <>
              {overtimeEntries.map((entry, idx) => (
                <Row
                  key={entry.id}
                  label={`Overtime ${overtimeEntries.length > 1 ? `#${idx + 1}` : ''}`}
                  value={`${entry.hours} hrs/${frequencyLabel(entry.frequency)} @ ${formatOvertimeRate(entry)}`}
                />
              ))}
              <Row
                label="Total Overtime"
                value={`${formatCurrency(totalOvertimeAmount)}/yr`}
                indent
              />
            </>
          )}
          {fringeBenefits.length > 0 && (
            <>
              {fringeBenefits.map((benefit, idx) => (
                <Row
                  key={benefit.id}
                  label={benefit.description || `Fringe Benefit ${idx + 1}`}
                  value={`${formatCurrency(parseFloat(benefit.amount))}/${frequencyLabel(benefit.frequency)} (${benefit.type})`}
                />
              ))}
              {totalFringeBenefits > 0 && (
                <Row
                  label="Total Fringe Benefits"
                  value={`${formatCurrency(totalFringeBenefits)}/yr`}
                  indent
                />
              )}
            </>
          )}
        </Section>
      )}

      {/* Salary Packaging */}
      {hasSalaryPackaging && (
        <Section title="Salary Packaging">
          {salarySacrifices.length > 0 && (
            <>
              {salarySacrifices.map((sacrifice, idx) => (
                <Row
                  key={sacrifice.id}
                  label={sacrifice.description || `Salary Sacrifice ${idx + 1}`}
                  value={`${formatCurrency(parseFloat(sacrifice.amount))}/${frequencyLabel(sacrifice.frequency)}`}
                />
              ))}
              <Row
                label="Total Salary Sacrifice"
                value={`${formatCurrency(salarySacrificeCalculation.totalSalarySacrifice)}/yr`}
                indent
              />
              {salarySacrificeCalculation.estimatedTaxSavings > 0 && (
                <Row
                  label="Estimated Tax Savings"
                  value={`${formatCurrency(salarySacrificeCalculation.estimatedTaxSavings)}/yr`}
                  indent
                  highlight
                />
              )}
            </>
          )}
          {novatedLeases.length > 0 && (
            <>
              {novatedLeases.map((lease, idx) => (
                <Row
                  key={lease.id}
                  label={lease.description || `Novated Lease ${idx + 1}`}
                  value={`${formatCurrency(parseFloat(lease.amount))}/${frequencyLabel(lease.frequency)} (${lease.isPreTax ? 'pre-tax' : 'post-tax'})`}
                />
              ))}
              <Row
                label="Total Novated Lease"
                value={`${formatCurrency(totalNovatedLease)}/yr`}
                indent
              />
            </>
          )}
        </Section>
      )}

      {/* Deductions & Other Income */}
      {hasDeductions && (
        <Section title="Deductions & Other Income">
          {deductions.annualDeductions > 0 && (
            <Row
              label="Work-Related Deductions"
              value={`-${formatCurrency(deductions.annualDeductions)}`}
            />
          )}
          {deductions.capitalGains > 0 && (
            <Row
              label="Capital Gains"
              value={`+${formatCurrency(deductions.capitalGains)}`}
            />
          )}
          {deductions.dividends > 0 && (
            <Row
              label="Dividend Income"
              value={`+${formatCurrency(deductions.dividends)}`}
            />
          )}
          {deductions.frankingCredits > 0 && (
            <Row
              label="Franking Credits"
              value={formatCurrency(deductions.frankingCredits)}
              indent
            />
          )}
          {deductions.businessIncome > 0 && (
            <Row
              label="Business Income"
              value={`+${formatCurrency(deductions.businessIncome)}`}
            />
          )}
          {deductions.businessLoss > 0 && (
            <Row
              label="Business Loss"
              value={`-${formatCurrency(deductions.businessLoss)}`}
            />
          )}
          {deductions.otherIncome > 0 && (
            <Row
              label="Other Income"
              value={`+${formatCurrency(deductions.otherIncome)}`}
            />
          )}
          {deductions.otherTaxOffsets > 0 && (
            <Row
              label="Other Tax Offsets"
              value={formatCurrency(deductions.otherTaxOffsets)}
            />
          )}
        </Section>
      )}

      {/* Family Benefits */}
      {hasFamilyBenefits && (
        <Section title="Family Benefits">
          <Row
            label="Children"
            value={`${familyBenefits.children.length} ${familyBenefits.children.length === 1 ? 'child' : 'children'}`}
          />
          {familyBenefits.isCouple && familyBenefits.spouseIncome > 0 && (
            <Row
              label="Spouse Income"
              value={formatCurrency(familyBenefits.spouseIncome)}
              indent
            />
          )}
          {familyBenefits.children.filter(c => c.inChildcare).length > 0 && (
            <Row
              label="Children in Childcare"
              value={familyBenefits.children.filter(c => c.inChildcare).length.toString()}
              indent
            />
          )}
          {childCareSubsidy > 0 && (
            <Row
              label="Est. Child Care Subsidy"
              value={`~${formatCurrency(childCareSubsidy)}/yr`}
              highlight
            />
          )}
        </Section>
      )}
    </div>
  );
}
