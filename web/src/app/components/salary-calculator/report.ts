/**
 * SalaryCalculator - Report Builder
 *
 * Pure helpers that turn the calculator's state into well-formatted
 * outputs for download (PDF), share (text), and print headers.
 *
 * Keeping this pure (no React, no DOM) means we can test it in isolation
 * and reuse it across export targets.
 */

import { TaxSettings, IncomeFrequency, TaxCountry } from '@/app/types';
import { TaxYear, TaxCategory, TAX_CATEGORY_OPTIONS, getTaxSystem } from '@/app/constants/taxSystems';
import {
  SalaryBreakdown,
  SalarySacrificeCalculation,
  SalarySacrificeEntry,
  OvertimeEntry,
  FringeBenefitEntry,
  NovatedLeaseEntry,
  SalaryInputMode,
} from './types';
import { toAnnualAmount } from './utils';
import type { DeductionsData } from './ExtraSettings/DeductionsSettings';
import type { FamilyBenefitsData, ChildEntry } from './ExtraSettings/FamilyBenefitsSettings';

export interface ReportInput {
  // Identity / metadata
  generatedAt: Date;
  userName: string | null;
  userEmail: string | null;
  taxCountry: TaxCountry;
  taxYear: TaxYear;
  taxCategory: TaxCategory;

  // Calculation results
  breakdowns: SalaryBreakdown[];
  taxSettings: TaxSettings;
  salaryInputMode?: SalaryInputMode;
  salaryInputFrequency?: IncomeFrequency;
  isProratedHours?: boolean;
  proratedHours?: string;
  proratedFrequency?: IncomeFrequency;
  salarySacrificeCalculation: SalarySacrificeCalculation;
  salarySacrifices: SalarySacrificeEntry[];
  overtimeEntries: OvertimeEntry[];
  fringeBenefits: FringeBenefitEntry[];
  novatedLeases?: NovatedLeaseEntry[];
  deductions?: DeductionsData;
  familyBenefits?: FamilyBenefitsData;
  superannuation: number;
  taxableIncome?: number;
  medicareLevy?: number;
  voluntarySuperContribution?: number;
  voluntarySuperTaxSavings?: number;
  baseRemainingCap?: number;
  remainingConcessionalCap?: number;
  studentLoanBalance?: number;
  studentLoanRate: string;
}

export type ReportMetricTone = 'positive' | 'neutral' | 'negative' | 'accent';

export interface ReportMetric {
  label: string;
  value: string;
  tone: ReportMetricTone;
}

export interface ReportRow {
  label: string;
  value: string;
  tone?: ReportMetricTone;
  note?: string;
}

export interface ReportSection {
  title: string;
  rows: ReportRow[];
}

export interface SalaryReportViewModel {
  title: string;
  generatedDate: string;
  preparedFor: string | null;
  taxSystemLabel: string;
  taxYear: TaxYear;
  annual: SalaryBreakdown | null;
  effectiveTaxRate: string;
  heroCards: ReportMetric[];
  frequencyRows: ReportRow[];
  annualRows: ReportRow[];
  detailSections: ReportSection[];
  totalPackageValue: string;
}

const FREQUENCY_ORDER: IncomeFrequency[] = [
  'annually',
  'monthly',
  'fortnightly',
  'weekly',
  'daily',
  'hourly',
];

const frequencyLabel = (f: IncomeFrequency): string => {
  switch (f) {
    case 'annually': return 'Annual';
    case 'monthly':  return 'Monthly';
    case 'fortnightly': return 'Fortnightly';
    case 'weekly':   return 'Weekly';
    case 'daily':    return 'Daily';
    case 'hourly':   return 'Hourly';
    default: return f;
  }
};

export function getCurrencyFormatter(input: Pick<ReportInput, 'taxCountry' | 'taxYear' | 'taxCategory'>) {
  const code = getTaxSystem(input.taxCountry, input.taxYear, input.taxCategory).currency;
  return (amount: number) =>
    new Intl.NumberFormat('en', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(amount);
}

const sortBreakdowns = (b: SalaryBreakdown[]): SalaryBreakdown[] => {
  const order = new Map(FREQUENCY_ORDER.map((f, i) => [f, i]));
  return [...b].sort(
    (a, c) => (order.get(a.frequency) ?? 99) - (order.get(c.frequency) ?? 99),
  );
};

const formatDate = (d: Date): string =>
  d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });

const totalPackageValue = (annual: SalaryBreakdown): number =>
  annual.grossIncome + annual.superannuation + annual.fringeBenefits;

const totalTaxAndDeductions = (annual: SalaryBreakdown): number =>
  annual.tax + annual.medicare + annual.studentLoan;

const EMPTY_DEDUCTIONS: DeductionsData = {
  annualDeductions: 0,
  capitalGains: 0,
  dividends: 0,
  frankingCredits: 0,
  businessIncome: 0,
  businessLoss: 0,
  includesGST: false,
  otherIncome: 0,
  otherTaxOffsets: 0,
};

const EMPTY_FAMILY_BENEFITS: FamilyBenefitsData = {
  isCouple: false,
  spouseIncome: 0,
  children: [],
  childSupportReceived: 0,
  childSupportPaid: 0,
};

const CCS_RATES = [
  { maxIncome: 80000, rate: 0.90 },
  { maxIncome: 100000, rate: 0.85 },
  { maxIncome: 120000, rate: 0.80 },
  { maxIncome: 140000, rate: 0.75 },
  { maxIncome: 160000, rate: 0.70 },
  { maxIncome: 180000, rate: 0.65 },
  { maxIncome: 200000, rate: 0.60 },
  { maxIncome: 220000, rate: 0.55 },
  { maxIncome: 240000, rate: 0.50 },
  { maxIncome: 260000, rate: 0.45 },
  { maxIncome: 280000, rate: 0.40 },
  { maxIncome: 300000, rate: 0.35 },
  { maxIncome: 320000, rate: 0.30 },
  { maxIncome: 340000, rate: 0.25 },
  { maxIncome: 360000, rate: 0.20 },
  { maxIncome: 530000, rate: 0.00 },
];

const HOURLY_CAPS: Record<ChildEntry['childcareType'], number> = {
  centre: 13.73,
  family: 12.20,
  afterSchool: 13.73,
  inHome: 34.78,
};

const inputModeLabel = (mode: SalaryInputMode): string =>
  mode === 'net' ? 'Take-home pay' : 'Gross salary';

const taxCategoryLabel = (category: TaxCategory): string =>
  TAX_CATEGORY_OPTIONS.find(option => option.value === category)?.label ?? category;

const yesNo = (value: boolean): string => value ? 'Yes' : 'No';

const childCareLabel = (type: ChildEntry['childcareType']): string => {
  switch (type) {
    case 'centre':
      return 'Centre based';
    case 'family':
      return 'Family day care';
    case 'afterSchool':
      return 'Outside school hours';
    case 'inHome':
      return 'In-home care';
    default:
      return type;
  }
};

const ccsRateForIncome = (income: number): number => {
  const tier = CCS_RATES.find(t => income <= t.maxIncome);
  return tier ? tier.rate : 0;
};

const childCareAnnuals = (child: ChildEntry, familyIncome: number) => {
  const annualCost = child.weeklyCost * 52;
  if (!child.inChildcare || child.age >= 13 || child.weeklyHours <= 0) {
    return { annualCost, subsidy: 0, netCost: annualCost };
  }

  const hourlyCap = HOURLY_CAPS[child.childcareType];
  const cappedHourlyCost = Math.min(child.weeklyCost / child.weeklyHours, hourlyCap);
  const subsidy = cappedHourlyCost * child.weeklyHours * ccsRateForIncome(familyIncome) * 52;
  return {
    annualCost,
    subsidy,
    netCost: Math.max(0, annualCost - subsidy),
  };
};

export function buildSalaryReportViewModel(input: ReportInput): SalaryReportViewModel {
  const fc = getCurrencyFormatter(input);
  const sorted = sortBreakdowns(input.breakdowns);
  const annual = sorted.find(b => b.frequency === 'annually') ?? sorted[0] ?? null;
  const sys = getTaxSystem(input.taxCountry, input.taxYear, input.taxCategory);
  const preparedFor = [input.userName, input.userEmail].filter(Boolean).join(' · ') || null;
  const salaryInputMode = input.salaryInputMode ?? 'gross';
  const proratedFrequency = input.proratedFrequency ?? 'weekly';
  const deductions = input.deductions ?? EMPTY_DEDUCTIONS;
  const familyBenefits = input.familyBenefits ?? EMPTY_FAMILY_BENEFITS;
  const novatedLeases = input.novatedLeases ?? [];

  const annualRows: ReportRow[] = [];
  const detailSections: ReportSection[] = [];
  let effectiveTaxRate = '0%';
  let totalPackage = 0;

  if (annual) {
    const taxableIncome = annual.grossIncome - annual.taxDeductibleSacrifice -
      (input.taxSettings.includeVoluntarySuper ? annual.voluntarySuper : 0);
    totalPackage = totalPackageValue(annual);
    effectiveTaxRate = annual.grossIncome > 0
      ? `${Math.round((totalTaxAndDeductions(annual) / annual.grossIncome) * 100)}%`
      : '0%';

    annualRows.push({ label: 'Base salary', value: fc(annual.baseSalary), tone: 'neutral' });
    if (annual.overtime > 0) {
      annualRows.push({ label: 'Overtime', value: fc(annual.overtime), tone: 'neutral' });
    }
    if (annual.taxDeductibleSacrifice > 0) {
      annualRows.push({
        label: 'Salary sacrifice (pre-tax)',
        value: `-${fc(annual.taxDeductibleSacrifice)}`,
        tone: 'accent',
      });
    }
    if (input.taxSettings.includeVoluntarySuper && annual.voluntarySuper > 0) {
      annualRows.push({
        label: 'Voluntary super',
        value: `-${fc(annual.voluntarySuper)}`,
        tone: 'accent',
      });
    }
    annualRows.push({ label: 'Taxable income', value: fc(taxableIncome), tone: 'neutral' });
    annualRows.push({ label: 'Income tax', value: `-${fc(annual.tax)}`, tone: 'negative' });
    if (annual.medicare > 0) {
      annualRows.push({ label: 'Medicare levy', value: `-${fc(annual.medicare)}`, tone: 'negative' });
    }
    if (annual.studentLoan > 0) {
      annualRows.push({
        label: `Student loan (${input.studentLoanRate})`,
        value: `-${fc(annual.studentLoan)}`,
        tone: 'negative',
      });
    }
    annualRows.push({ label: 'Net take-home', value: fc(annual.netIncome), tone: 'positive' });

    detailSections.push({
      title: 'Annual breakdown',
      rows: annualRows,
    });
  }

  const enabledRows: ReportRow[] = [];
  if (salaryInputMode === 'net') {
    enabledRows.push({
      label: 'Input mode',
      value: inputModeLabel(salaryInputMode),
      tone: 'accent',
    });
  }
  if (input.isProratedHours) {
    enabledRows.push({
      label: 'Pro-rata hours',
      value: `${input.proratedHours || '0'} hours / ${frequencyLabel(proratedFrequency)}`,
      tone: 'accent',
    });
  }
  if (input.taxCategory !== 'resident') {
    enabledRows.push({
      label: 'Tax category',
      value: taxCategoryLabel(input.taxCategory),
      tone: 'accent',
    });
  }
  if (input.taxSettings.includePrivateHealth) {
    enabledRows.push({
      label: 'Medicare & health',
      value: 'Private health insurance',
      tone: 'accent',
      note: 'Medicare levy excluded',
    });
  } else if (input.taxSettings.medicareExemption) {
    enabledRows.push({
      label: 'Medicare & health',
      value: 'Medicare exemption',
      tone: 'positive',
      note: 'Medicare levy excluded',
    });
  } else if (input.taxSettings.includeMedicare) {
    enabledRows.push({
      label: 'Medicare levy',
      value: input.medicareLevy && input.medicareLevy > 0
        ? `${fc(input.medicareLevy)} / yr`
        : 'Enabled',
      tone: input.medicareLevy && input.medicareLevy > 0 ? 'negative' : 'neutral',
    });
  }
  if (input.taxSettings.includeStudentLoan) {
    enabledRows.push({
      label: 'Student loan',
      value: input.studentLoanBalance && input.studentLoanBalance > 0
        ? `${fc(input.studentLoanBalance)} balance`
        : annual
          ? `${fc(annual.studentLoan)} / yr`
          : 'Enabled',
      tone: 'negative',
      note: annual ? `Repayment ${fc(annual.studentLoan)} / yr at ${input.studentLoanRate}` : undefined,
    });
  }
  if (input.taxSettings.includeSeniorOffset) {
    enabledRows.push({ label: 'Senior offset', value: 'Included', tone: 'accent' });
  }
  if (input.taxSettings.includeDependentChildren) {
    enabledRows.push({ label: 'Dependent children', value: 'Included', tone: 'accent' });
  }
  if (input.taxSettings.includeSpouse) {
    enabledRows.push({ label: 'Spouse settings', value: 'Included', tone: 'accent' });
  }
  if (enabledRows.length) {
    detailSections.push({ title: 'Enabled settings', rows: enabledRows });
  }

  if (input.salarySacrifices.length || input.salarySacrificeCalculation.totalSalarySacrifice > 0) {
    const rows: ReportRow[] = [];
    rows.push({
      label: 'Total salary packaged',
      value: fc(input.salarySacrificeCalculation.totalSalarySacrifice),
      tone: 'accent',
    });
    if (input.salarySacrificeCalculation.estimatedTaxSavings > 0) {
      rows.push({
        label: 'Estimated tax saving',
        value: fc(input.salarySacrificeCalculation.estimatedTaxSavings),
        tone: 'positive',
      });
    }
    for (const s of input.salarySacrifices) {
      const annualAmt = toAnnualAmount(parseFloat(s.amount) || 0, s.frequency);
      rows.push({
        label: s.description || 'Salary sacrifice',
        value: `${fc(annualAmt)} / yr`,
        tone: s.isTaxDeductible ? 'accent' : 'neutral',
        note: s.isTaxDeductible ? 'Pre-tax' : undefined,
      });
    }
    detailSections.push({ title: 'Salary packaging', rows });
  }

  if (novatedLeases.length) {
    const totalAnnual = novatedLeases.reduce((sum, lease) => (
      sum + toAnnualAmount(parseFloat(lease.amount) || 0, lease.frequency)
    ), 0);
    const preTaxAnnual = novatedLeases
      .filter(lease => lease.isPreTax)
      .reduce((sum, lease) => (
        sum + toAnnualAmount(parseFloat(lease.amount) || 0, lease.frequency)
      ), 0);
    const rows: ReportRow[] = [
      { label: 'Total lease payments', value: fc(totalAnnual), tone: 'neutral' },
    ];
    if (preTaxAnnual > 0) {
      rows.push({ label: 'Pre-tax portion', value: fc(preTaxAnnual), tone: 'accent' });
    }
    for (const lease of novatedLeases) {
      const annualAmt = toAnnualAmount(parseFloat(lease.amount) || 0, lease.frequency);
      rows.push({
        label: lease.description || 'Novated lease',
        value: `${fc(annualAmt)} / yr`,
        tone: lease.isPreTax ? 'accent' : 'neutral',
        note: lease.isPreTax ? 'Pre-tax' : 'Post-tax',
      });
    }
    detailSections.push({ title: 'Novated leases', rows });
  }

  if (input.overtimeEntries.length) {
    detailSections.push({
      title: 'Overtime',
      rows: input.overtimeEntries.map((o) => {
        const annualAmt = toAnnualAmount(
          (parseFloat(o.hours) || 0) * (parseFloat(o.rate) || 0),
          o.frequency,
        );
        return {
          label: `${o.hours}h at ${o.rate}/hr`,
          value: `${fc(annualAmt)} / yr`,
          tone: 'neutral',
          note: `${frequencyLabel(o.frequency)}${o.includeSuper ? ' + super' : ''}`,
        };
      }),
    });
  }

  if (input.fringeBenefits.length) {
    detailSections.push({
      title: 'Fringe benefits',
      rows: input.fringeBenefits.map((f) => {
        const annualAmt = toAnnualAmount(parseFloat(f.amount) || 0, f.frequency);
        return {
          label: f.description || 'Fringe benefit',
          value: `${fc(annualAmt)} / yr`,
          tone: f.reportable ? 'accent' : 'neutral',
          note: `${f.type}${f.reportable ? ' · reportable' : ''}`,
        };
      }),
    });
  }

  if (input.taxSettings.includeSuper && annual) {
    const rows: ReportRow[] = [
      {
        label: `Employer super (${input.taxSettings.superRate}%)`,
        value: fc(annual.superannuation),
        tone: 'neutral',
      },
    ];
    if (input.taxSettings.includeVoluntarySuper && annual.voluntarySuper > 0) {
      rows.push({
        label: 'Voluntary contributions',
        value: fc(annual.voluntarySuper),
        tone: 'accent',
      });
    }
    if (input.baseRemainingCap !== undefined) {
      rows.push({
        label: 'Concessional cap before voluntary super',
        value: fc(input.baseRemainingCap),
        tone: 'neutral',
      });
    }
    if (input.remainingConcessionalCap !== undefined) {
      rows.push({
        label: 'Remaining concessional cap',
        value: fc(input.remainingConcessionalCap),
        tone: 'neutral',
      });
    }
    if (input.taxSettings.includeVoluntarySuper && input.voluntarySuperTaxSavings && input.voluntarySuperTaxSavings > 0) {
      rows.push({
        label: 'Estimated voluntary super tax saving',
        value: fc(input.voluntarySuperTaxSavings),
        tone: 'positive',
      });
    }
    rows.push({
      label: 'Total super',
      value: fc(annual.superannuation + annual.voluntarySuper),
      tone: 'positive',
    });
    detailSections.push({ title: 'Superannuation', rows });
  }

  const deductionRows: ReportRow[] = [];
  if (deductions.annualDeductions > 0) {
    deductionRows.push({ label: 'Annual deductions', value: `-${fc(deductions.annualDeductions)}`, tone: 'positive' });
  }
  if (deductions.capitalGains > 0) {
    deductionRows.push({ label: 'Capital gains', value: fc(deductions.capitalGains), tone: 'negative' });
  }
  if (deductions.dividends > 0) {
    deductionRows.push({ label: 'Dividends', value: fc(deductions.dividends), tone: 'negative' });
  }
  if (deductions.frankingCredits > 0) {
    deductionRows.push({ label: 'Franking credits', value: fc(deductions.frankingCredits), tone: 'positive' });
  }
  if (deductions.businessIncome > 0) {
    deductionRows.push({ label: 'Business income', value: fc(deductions.businessIncome), tone: 'negative' });
  }
  if (deductions.businessLoss > 0) {
    deductionRows.push({ label: 'Business loss', value: `-${fc(deductions.businessLoss)}`, tone: 'positive' });
  }
  if (deductions.includesGST) {
    deductionRows.push({ label: 'Business income includes GST', value: yesNo(deductions.includesGST), tone: 'accent' });
  }
  if (deductions.otherIncome > 0) {
    deductionRows.push({ label: 'Other income', value: fc(deductions.otherIncome), tone: 'negative' });
  }
  if (deductions.otherTaxOffsets > 0) {
    deductionRows.push({ label: 'Other tax offsets', value: fc(deductions.otherTaxOffsets), tone: 'positive' });
  }
  if (deductionRows.length) {
    detailSections.push({ title: 'Deductions & other income', rows: deductionRows });
  }

  const familyRows: ReportRow[] = [];
  const hasFamilyConfig = familyBenefits.isCouple ||
    familyBenefits.spouseIncome > 0 ||
    familyBenefits.children.length > 0 ||
    familyBenefits.childSupportReceived > 0 ||
    familyBenefits.childSupportPaid > 0;
  if (hasFamilyConfig) {
    const primaryIncome = input.taxableIncome ?? annual?.grossIncome ?? 0;
    const familyIncome = primaryIncome + (familyBenefits.isCouple ? familyBenefits.spouseIncome : 0);
    familyRows.push({
      label: 'Family status',
      value: familyBenefits.isCouple ? 'Couple' : 'Single',
      tone: 'neutral',
    });
    familyRows.push({
      label: 'Combined family income',
      value: fc(familyIncome),
      tone: 'neutral',
    });
    if (familyBenefits.isCouple || familyBenefits.spouseIncome > 0) {
      familyRows.push({
        label: 'Spouse income',
        value: fc(familyBenefits.spouseIncome),
        tone: 'neutral',
      });
    }
    if (familyBenefits.childSupportReceived > 0) {
      familyRows.push({
        label: 'Child support received',
        value: fc(familyBenefits.childSupportReceived),
        tone: 'positive',
      });
    }
    if (familyBenefits.childSupportPaid > 0) {
      familyRows.push({
        label: 'Child support paid',
        value: `-${fc(familyBenefits.childSupportPaid)}`,
        tone: 'negative',
      });
    }
    if (familyBenefits.children.length) {
      familyRows.push({
        label: 'Children',
        value: String(familyBenefits.children.length),
        tone: 'neutral',
      });
    }
    familyBenefits.children.forEach((child, index) => {
      familyRows.push({
        label: `Child ${index + 1}`,
        value: `Age ${child.age}`,
        tone: 'neutral',
      });
      if (child.inChildcare) {
        const { annualCost, subsidy, netCost } = childCareAnnuals(child, familyIncome);
        familyRows.push({
          label: `Child ${index + 1} care`,
          value: `${fc(subsidy)} subsidy / yr`,
          tone: subsidy > 0 ? 'positive' : 'neutral',
          note: `${childCareLabel(child.childcareType)}, ${child.weeklyHours}h/wk, ${fc(annualCost)} annual cost, ${fc(netCost)} net`,
        });
      }
    });
    detailSections.push({ title: 'Family benefits', rows: familyRows });
  }

  return {
    title: 'Salary Report',
    generatedDate: formatDate(input.generatedAt),
    preparedFor,
    taxSystemLabel: sys.name,
    taxYear: input.taxYear,
    annual,
    effectiveTaxRate,
    heroCards: annual
      ? [
          { label: 'Annual take-home', value: fc(annual.netIncome), tone: 'positive' },
          { label: 'Gross income', value: fc(annual.grossIncome), tone: 'neutral' },
          { label: 'Tax and deductions', value: fc(totalTaxAndDeductions(annual)), tone: 'negative' },
          { label: 'Total package', value: fc(totalPackage), tone: 'accent' },
        ]
      : [
          { label: 'Annual take-home', value: fc(0), tone: 'positive' },
          { label: 'Gross income', value: fc(0), tone: 'neutral' },
          { label: 'Tax and deductions', value: fc(0), tone: 'negative' },
          { label: 'Total package', value: fc(0), tone: 'accent' },
        ],
    frequencyRows: sorted.map((b) => ({
      label: frequencyLabel(b.frequency),
      value: fc(b.netIncome),
      tone: b.frequency === 'annually' ? 'positive' : 'neutral',
    })),
    annualRows,
    detailSections,
    totalPackageValue: fc(totalPackage),
  };
}

/**
 * Build a plain-text salary report — suitable for sharing, copying,
 * embedding in an email, or printing as a text fallback.
 *
 * Width: 60 cols, monospace-friendly. Two columns where used.
 */
export function buildSalaryReportText(input: ReportInput): string {
  const fc = getCurrencyFormatter(input);
  const lines: string[] = [];
  const sorted = sortBreakdowns(input.breakdowns);
  const annual = sorted.find(b => b.frequency === 'annually') ?? sorted[0];
  const sys = getTaxSystem(input.taxCountry, input.taxYear, input.taxCategory);

  const pad = (left: string, right: string, width = 60): string => {
    const space = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(space) + right;
  };
  const rule = (ch = '-') => ch.repeat(60);

  lines.push('PFINANCE  ·  SALARY CALCULATOR');
  lines.push(rule('='));
  lines.push(`Generated: ${formatDate(input.generatedAt)}`);
  if (input.userName)  lines.push(`Prepared for: ${input.userName}`);
  if (input.userEmail) lines.push(`Email: ${input.userEmail}`);
  lines.push(`Tax system: ${sys.name}  ·  Year ${input.taxYear}`);
  lines.push('');

  if (annual) {
    lines.push('TAKE-HOME SUMMARY');
    lines.push(rule());
    lines.push(pad('Gross income (annual)',  fc(annual.grossIncome)));
    lines.push(pad('Income tax',             '-' + fc(annual.tax)));
    if (annual.medicare > 0)    lines.push(pad('Medicare levy',     '-' + fc(annual.medicare)));
    if (annual.studentLoan > 0) lines.push(pad(`Student loan (${input.studentLoanRate})`, '-' + fc(annual.studentLoan)));
    if (annual.taxDeductibleSacrifice > 0)
      lines.push(pad('Salary sacrifice (pre-tax)', '-' + fc(annual.taxDeductibleSacrifice)));
    if (input.taxSettings.includeVoluntarySuper && annual.voluntarySuper > 0)
      lines.push(pad('Voluntary super',      '-' + fc(annual.voluntarySuper)));
    lines.push(rule());
    lines.push(pad('NET TAKE-HOME (annual)', fc(annual.netIncome)));
    lines.push('');
  }

  lines.push('BY PAY FREQUENCY');
  lines.push(rule());
  lines.push(pad('Frequency', 'Take-home'));
  lines.push(rule('.'));
  for (const b of sorted) {
    lines.push(pad(frequencyLabel(b.frequency), fc(b.netIncome)));
  }
  lines.push('');

  if (input.overtimeEntries.length) {
    lines.push('OVERTIME');
    lines.push(rule());
    for (const o of input.overtimeEntries) {
      const annualAmt = toAnnualAmount(
        (parseFloat(o.hours) || 0) * (parseFloat(o.rate) || 0),
        o.frequency,
      );
      lines.push(pad(
        `${o.hours}h @ ${o.rate}/hr (${o.frequency})`,
        fc(annualAmt) + '/yr',
      ));
    }
    lines.push('');
  }

  if (input.salarySacrifices.length) {
    lines.push('SALARY SACRIFICE ITEMS');
    lines.push(rule());
    for (const s of input.salarySacrifices) {
      const annualAmt = toAnnualAmount(parseFloat(s.amount) || 0, s.frequency);
      const tag = s.isTaxDeductible ? ' (pre-tax)' : '';
      lines.push(pad(
        `${s.description || 'Salary sacrifice'}${tag}`,
        fc(annualAmt) + '/yr',
      ));
    }
    lines.push('');
  }

  if (input.fringeBenefits.length) {
    lines.push('FRINGE BENEFITS');
    lines.push(rule());
    for (const f of input.fringeBenefits) {
      const annualAmt = toAnnualAmount(parseFloat(f.amount) || 0, f.frequency);
      lines.push(pad(
        `${f.description || 'Fringe benefit'} (${f.type})`,
        fc(annualAmt) + '/yr',
      ));
    }
    lines.push('');
  }

  if (input.taxSettings.includeSuper && annual) {
    lines.push('SUPERANNUATION');
    lines.push(rule());
    lines.push(pad(`Employer super (${input.taxSettings.superRate}%)`, fc(annual.superannuation)));
    if (input.taxSettings.includeVoluntarySuper && annual.voluntarySuper > 0)
      lines.push(pad('Voluntary contributions', fc(annual.voluntarySuper)));
    lines.push(rule());
    lines.push(pad('Total super', fc(annual.superannuation + annual.voluntarySuper)));
    lines.push('');
  }

  if (annual) {
    const totalPackage = annual.grossIncome + annual.superannuation + annual.fringeBenefits;
    lines.push(rule('='));
    lines.push(pad('TOTAL PACKAGE VALUE', fc(totalPackage)));
    lines.push(rule('='));
  }

  lines.push('');
  lines.push('Calculator: ' + (typeof window !== 'undefined'
    ? `${window.location.origin}/personal/income`
    : '/personal/income'));

  return lines.join('\n');
}

/**
 * Build the encoded share URL. Now includes ALL line-item entries so
 * a recipient sees the full picture, not just the headline salary.
 */
export function buildShareUrl(input: {
  origin: string;
  pathname: string;
  salary: string;
  frequency: IncomeFrequency;
  salaryInputMode?: SalaryInputMode;
  voluntarySuper?: string;
  packagingCap?: number;
  isProratedHours?: boolean;
  proratedHours?: string;
  proratedFrequency?: IncomeFrequency;
  taxSettings: TaxSettings;
  taxCountry: TaxCountry;
  taxYear: TaxYear;
  taxCategory: TaxCategory;
  studentLoanBalance?: number;
  salarySacrifices: SalarySacrificeEntry[];
  overtimeEntries: OvertimeEntry[];
  fringeBenefits: FringeBenefitEntry[];
  novatedLeases?: NovatedLeaseEntry[];
  deductions?: DeductionsData;
  familyBenefits?: FamilyBenefitsData;
}): string {
  const payload = {
    salary: input.salary,
    frequency: input.frequency,
    salaryInputMode: input.salaryInputMode,
    voluntarySuper: input.voluntarySuper,
    packagingCap: input.packagingCap,
    isProratedHours: input.isProratedHours,
    proratedHours: input.proratedHours,
    proratedFrequency: input.proratedFrequency,
    taxSettings: input.taxSettings,
    country: input.taxCountry,
    taxYear: input.taxYear,
    taxCategory: input.taxCategory,
    studentLoanBalance: input.studentLoanBalance,
    salarySacrifices: input.salarySacrifices,
    overtimeEntries: input.overtimeEntries,
    fringeBenefits: input.fringeBenefits,
    novatedLeases: input.novatedLeases ?? [],
    deductions: input.deductions,
    familyBenefits: input.familyBenefits,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  return `${input.origin}${input.pathname}?calculator=${encoded}`;
}

/**
 * Decode a share URL payload. Tolerates both the legacy (raw btoa) and
 * the new utf8-safe (encodeURIComponent + btoa) encodings.
 */
export function decodeSharePayload(encoded: string): Record<string, unknown> | null {
  try {
    // Try utf8-safe decode first.
    const json = decodeURIComponent(escape(atob(encoded)));
    return JSON.parse(json);
  } catch {
    try {
      return JSON.parse(atob(encoded));
    } catch {
      return null;
    }
  }
}

/**
 * Build a styled PDF from the report data using jsPDF text APIs.
 * No html2canvas — we hand-place text so the output is crisp,
 * selectable, multi-page-aware, and small (KB not MB).
 */
export async function generateSalaryPdf(input: ReportInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const model = buildSalaryReportViewModel(input);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 42;
  const contentW = pageW - M * 2;
  const color = {
    paper: [248, 242, 231] as const,
    panel: [255, 251, 242] as const,
    ink: [61, 45, 34] as const,
    muted: [126, 102, 78] as const,
    amber: [232, 142, 50] as const,
    amberSoft: [253, 232, 190] as const,
    sage: [104, 132, 88] as const,
    sageSoft: [225, 236, 213] as const,
    rust: [174, 83, 57] as const,
    rustSoft: [246, 220, 207] as const,
    line: [221, 207, 188] as const,
    white: [255, 255, 255] as const,
  };
  let y = M;

  const fill = (c: readonly [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: readonly [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const textColor = (c: readonly [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const toneColor = (tone?: ReportMetricTone): readonly [number, number, number] => {
    switch (tone) {
      case 'positive':
        return color.sage;
      case 'negative':
        return color.rust;
      case 'accent':
        return color.amber;
      case 'neutral':
      default:
        return color.ink;
    }
  };

  const paintPage = () => {
    fill(color.paper);
    doc.rect(0, 0, pageW, pageH, 'F');
    fill(color.amberSoft);
    doc.rect(0, 0, pageW, 5, 'F');
  };

  const ensureSpace = (need: number) => {
    if (y + need > pageH - M) {
      doc.addPage();
      paintPage();
      y = M;
    }
  };

  const setBody = (size = 10) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    textColor(color.ink);
  };

  const setHeading = (size = 12) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(size);
    textColor(color.ink);
  };

  const setMuted = (size = 9) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(size);
    textColor(color.muted);
  };

  const drawPill = (label: string, x: number, top: number, width: number, tone: ReportMetricTone) => {
    const bg = tone === 'positive'
      ? color.sageSoft
      : tone === 'negative'
        ? color.rustSoft
        : tone === 'accent'
          ? color.amberSoft
          : color.paper;
    fill(bg);
    stroke(color.line);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, top, width, 20, 10, 10, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    textColor(toneColor(tone));
    doc.text(label, x + width / 2, top + 13, { align: 'center' });
  };

  const drawHeader = () => {
    fill(color.ink);
    doc.roundedRect(M, y, contentW, 102, 12, 12, 'F');
    fill(color.amber);
    doc.roundedRect(M, y, 10, 102, 5, 5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    textColor(color.amberSoft);
    doc.text('PFINANCE', M + 26, y + 25);

    doc.setFontSize(28);
    textColor(color.white);
    doc.text(model.title, M + 26, y + 58);

    setMuted(9);
    textColor([228, 210, 182]);
    doc.text(`Generated ${model.generatedDate}`, M + 26, y + 80);
    doc.text(`${model.taxSystemLabel} | ${model.taxYear}`, M + contentW - 22, y + 25, { align: 'right' });
    doc.text(`Effective tax rate ${model.effectiveTaxRate}`, M + contentW - 22, y + 80, { align: 'right' });

    if (model.preparedFor) {
      drawPill(model.preparedFor, M + contentW - 214, y + 40, 192, 'accent');
    }

    y += 126;
  };

  const drawHero = () => {
    if (!model.annual) return;
    ensureSpace(116);
    fill(color.panel);
    stroke(color.line);
    doc.setLineWidth(0.8);
    doc.roundedRect(M, y, contentW, 104, 12, 12, 'FD');

    setMuted(10);
    doc.text('Annual take-home pay', M + 22, y + 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(32);
    textColor(color.sage);
    doc.text(model.heroCards[0].value, M + 22, y + 65);
    setMuted(9);
    doc.text(`Gross ${model.heroCards[1].value} | Tax and deductions ${model.heroCards[2].value}`, M + 22, y + 86);

    drawPill(model.heroCards[3].value + ' package', M + contentW - 174, y + 22, 146, 'accent');
    drawPill(`${model.effectiveTaxRate} effective tax`, M + contentW - 174, y + 52, 146, 'negative');
    y += 124;
  };

  const drawMetricCards = () => {
    ensureSpace(128);
    const gap = 10;
    const cardW = (contentW - gap * 3) / 4;
    const cardH = 72;
    model.heroCards.forEach((metric, i) => {
      const x = M + i * (cardW + gap);
      fill(color.panel);
      stroke(color.line);
      doc.setLineWidth(0.7);
      doc.roundedRect(x, y, cardW, cardH, 8, 8, 'FD');
      fill(metric.tone === 'positive'
        ? color.sage
        : metric.tone === 'negative'
          ? color.rust
          : metric.tone === 'accent'
            ? color.amber
            : color.ink);
      doc.roundedRect(x + 10, y + 10, 18, 18, 5, 5, 'F');
      setMuted(8);
      doc.text(metric.label.toUpperCase(), x + 10, y + 43, { maxWidth: cardW - 20 });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      textColor(toneColor(metric.tone));
      doc.text(metric.value, x + 10, y + 61, { maxWidth: cardW - 20 });
    });
    y += cardH + 24;
  };

  const drawSection = (section: ReportSection) => {
    if (!section.rows.length) return;
    ensureSpace(42);
    setHeading(13);
    doc.text(section.title, M, y);
    y += 10;
    stroke(color.line);
    doc.setLineWidth(0.8);
    doc.line(M, y, M + contentW, y);
    y += 10;

    for (const row of section.rows) {
      const rowH = row.note ? 34 : 27;
      ensureSpace(rowH + 6);
      fill(color.panel);
      stroke(color.line);
      doc.setLineWidth(0.5);
      doc.roundedRect(M, y, contentW, rowH, 6, 6, 'FD');

      setBody(10);
      doc.text(row.label, M + 12, y + 17, { maxWidth: contentW - 150 });
      if (row.note) {
        setMuted(8);
        doc.text(row.note, M + 12, y + 29, { maxWidth: contentW - 150 });
      }
      doc.setFont('helvetica', row.label.toLowerCase().includes('net take-home') || row.label.toLowerCase().includes('total') ? 'bold' : 'normal');
      doc.setFontSize(10);
      textColor(toneColor(row.tone));
      doc.text(row.value, M + contentW - 12, y + (row.note ? 22 : 17), { align: 'right' });
      y += rowH + 6;
    }
    y += 12;
  };

  const drawFrequencyGrid = () => {
    if (!model.frequencyRows.length) return;
    ensureSpace(124);
    setHeading(13);
    doc.text('Take-home by pay frequency', M, y);
    y += 18;
    const columns = 3;
    const gap = 10;
    const cellW = (contentW - gap * (columns - 1)) / columns;
    const cellH = 48;
    const startY = y;
    ensureSpace(Math.ceil(model.frequencyRows.length / columns) * (cellH + 8));
    model.frequencyRows.forEach((row, i) => {
      const col = i % columns;
      const rowIndex = Math.floor(i / columns);
      const x = M + col * (cellW + gap);
      const top = startY + rowIndex * (cellH + 8);
      fill(color.panel);
      stroke(color.line);
      doc.roundedRect(x, top, cellW, cellH, 7, 7, 'FD');
      setMuted(8);
      doc.text(row.label.toUpperCase(), x + 10, top + 17);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      textColor(toneColor(row.tone));
      doc.text(row.value, x + 10, top + 36, { maxWidth: cellW - 20 });
    });
    y = startY + Math.ceil(model.frequencyRows.length / columns) * (cellH + 8);
    y += 12;
  };

  paintPage();
  drawHeader();
  drawHero();
  drawMetricCards();

  const annualSection = model.detailSections.find(section => section.title === 'Annual breakdown');
  if (annualSection) {
    drawSection(annualSection);
  }
  drawFrequencyGrid();
  for (const section of model.detailSections) {
    if (section.title !== 'Annual breakdown') {
      drawSection(section);
    }
  }

  if (model.annual) {
    ensureSpace(70);
    fill(color.ink);
    doc.roundedRect(M, y, contentW, 54, 10, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    textColor(color.white);
    doc.text('Total package value', M + 18, y + 33);
    doc.setFontSize(18);
    textColor(color.amberSoft);
    doc.text(model.totalPackageValue, M + contentW - 18, y + 34, { align: 'right' });
    y += 72;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    textColor(color.muted);
    doc.text(
      `PFinance | generated ${model.generatedDate}`,
      M, pageH - 20,
    );
    doc.text(
      'Estimate only',
      pageW / 2, pageH - 20, { align: 'center' },
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageW - M, pageH - 20, { align: 'right' },
    );
  }

  return doc.output('blob');
}

/**
 * Pick a sensible default filename for the downloaded PDF.
 */
export function defaultReportFilename(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  return `pfinance-salary-${iso}.pdf`;
}
