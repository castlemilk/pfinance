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
import { TaxYear, TaxCategory, getTaxSystem } from '@/app/constants/taxSystems';
import {
  SalaryBreakdown,
  SalarySacrificeCalculation,
  SalarySacrificeEntry,
  OvertimeEntry,
  FringeBenefitEntry,
} from './types';
import { toAnnualAmount } from './utils';

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
  salarySacrificeCalculation: SalarySacrificeCalculation;
  salarySacrifices: SalarySacrificeEntry[];
  overtimeEntries: OvertimeEntry[];
  fringeBenefits: FringeBenefitEntry[];
  superannuation: number;
  studentLoanRate: string;
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
  lines.push(`Tax system: ${sys.label}  ·  Year ${input.taxYear}`);
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
  taxSettings: TaxSettings;
  taxCountry: TaxCountry;
  taxYear: TaxYear;
  taxCategory: TaxCategory;
  salarySacrifices: SalarySacrificeEntry[];
  overtimeEntries: OvertimeEntry[];
  fringeBenefits: FringeBenefitEntry[];
}): string {
  const payload = {
    salary: input.salary,
    frequency: input.frequency,
    taxSettings: input.taxSettings,
    country: input.taxCountry,
    taxYear: input.taxYear,
    taxCategory: input.taxCategory,
    salarySacrifices: input.salarySacrifices,
    overtimeEntries: input.overtimeEntries,
    fringeBenefits: input.fringeBenefits,
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
  const fc = getCurrencyFormatter(input);
  const sys = getTaxSystem(input.taxCountry, input.taxYear, input.taxCategory);
  const sorted = sortBreakdowns(input.breakdowns);
  const annual = sorted.find(b => b.frequency === 'annually') ?? sorted[0];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 48; // margin
  const contentW = pageW - M * 2;
  let y = M;

  const ensureSpace = (need: number) => {
    if (y + need > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  const setBody = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(40);
  };

  const setHeading = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(20);
  };

  const setMuted = () => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(120);
  };

  const sectionRule = () => {
    doc.setDrawColor(220);
    doc.setLineWidth(0.5);
    doc.line(M, y, M + contentW, y);
    y += 12;
  };

  const row = (left: string, right: string, opts: { bold?: boolean; muted?: boolean } = {}) => {
    ensureSpace(16);
    if (opts.bold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    if (opts.muted) doc.setTextColor(120);
    else doc.setTextColor(40);
    doc.setFontSize(10);
    doc.text(left, M, y);
    doc.text(right, M + contentW, y, { align: 'right' });
    y += 14;
  };

  const sectionTitle = (title: string) => {
    ensureSpace(28);
    y += 8;
    setHeading();
    doc.text(title, M, y);
    y += 6;
    sectionRule();
    setBody();
  };

  // ── Header ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15);
  doc.text('Salary Report', M, y);
  y += 22;

  setMuted();
  doc.text(`Generated ${formatDate(input.generatedAt)}`, M, y);
  doc.text(
    `${sys.label}  ·  ${input.taxYear}`,
    M + contentW, y, { align: 'right' },
  );
  y += 14;

  if (input.userName || input.userEmail) {
    doc.text(
      [input.userName, input.userEmail].filter(Boolean).join('  ·  '),
      M, y,
    );
    y += 14;
  }

  y += 6;
  doc.setDrawColor(15);
  doc.setLineWidth(1);
  doc.line(M, y, M + contentW, y);
  y += 8;

  // ── Hero net pay ──────────────────────────────────────────────
  if (annual) {
    ensureSpace(80);
    y += 14;
    setMuted();
    doc.text('Annual take-home pay', M, y);
    y += 22;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.setTextColor(20, 120, 80);
    doc.text(fc(annual.netIncome), M, y);
    y += 14;
    setMuted();
    doc.text(
      `Gross ${fc(annual.grossIncome)}  ·  Effective tax ${
        annual.grossIncome > 0
          ? Math.round(((annual.tax + annual.medicare + annual.studentLoan) / annual.grossIncome) * 100)
          : 0
      }%`,
      M, y,
    );
    y += 8;
    setBody();
  }

  // ── Annual breakdown ──────────────────────────────────────────
  if (annual) {
    sectionTitle('Annual breakdown');
    row('Base salary', fc(annual.baseSalary));
    if (annual.overtime > 0) row('Overtime', fc(annual.overtime));
    if (annual.taxDeductibleSacrifice > 0) row('Salary sacrifice (pre-tax)', '-' + fc(annual.taxDeductibleSacrifice), { muted: true });
    if (input.taxSettings.includeVoluntarySuper && annual.voluntarySuper > 0)
      row('Voluntary super', '-' + fc(annual.voluntarySuper), { muted: true });
    row('Income tax', '-' + fc(annual.tax));
    if (annual.medicare > 0) row('Medicare levy', '-' + fc(annual.medicare));
    if (annual.studentLoan > 0) row(`Student loan (${input.studentLoanRate})`, '-' + fc(annual.studentLoan));
    y += 4;
    sectionRule();
    row('Net take-home', fc(annual.netIncome), { bold: true });
  }

  // ── Frequency table ───────────────────────────────────────────
  sectionTitle('By pay frequency');
  row('Frequency', 'Take-home', { bold: true });
  for (const b of sorted) {
    row(frequencyLabel(b.frequency), fc(b.netIncome));
  }

  // ── Overtime ──────────────────────────────────────────────────
  if (input.overtimeEntries.length) {
    sectionTitle('Overtime');
    for (const o of input.overtimeEntries) {
      const annualAmt = toAnnualAmount(
        (parseFloat(o.hours) || 0) * (parseFloat(o.rate) || 0),
        o.frequency,
      );
      row(
        `${o.hours}h @ ${o.rate}/hr (${o.frequency})${o.includeSuper ? ' · super' : ''}`,
        fc(annualAmt) + ' / yr',
      );
    }
  }

  // ── Salary sacrifice ──────────────────────────────────────────
  if (input.salarySacrifices.length) {
    sectionTitle('Salary sacrifice');
    for (const s of input.salarySacrifices) {
      const annualAmt = toAnnualAmount(parseFloat(s.amount) || 0, s.frequency);
      row(
        `${s.description || 'Salary sacrifice'}${s.isTaxDeductible ? ' · pre-tax' : ''}`,
        fc(annualAmt) + ' / yr',
      );
    }
  }

  // ── Fringe benefits ───────────────────────────────────────────
  if (input.fringeBenefits.length) {
    sectionTitle('Fringe benefits');
    for (const f of input.fringeBenefits) {
      const annualAmt = toAnnualAmount(parseFloat(f.amount) || 0, f.frequency);
      row(
        `${f.description || 'Fringe benefit'} · ${f.type}${f.reportable ? ' · reportable' : ''}`,
        fc(annualAmt) + ' / yr',
      );
    }
  }

  // ── Super ─────────────────────────────────────────────────────
  if (input.taxSettings.includeSuper && annual) {
    sectionTitle('Superannuation');
    row(`Employer (${input.taxSettings.superRate}%)`, fc(annual.superannuation));
    if (input.taxSettings.includeVoluntarySuper && annual.voluntarySuper > 0)
      row('Voluntary', fc(annual.voluntarySuper));
    sectionRule();
    row('Total super', fc(annual.superannuation + annual.voluntarySuper), { bold: true });
  }

  // ── Total package ─────────────────────────────────────────────
  if (annual) {
    const totalPackage = annual.grossIncome + annual.superannuation + annual.fringeBenefits;
    ensureSpace(40);
    y += 12;
    doc.setDrawColor(15);
    doc.setLineWidth(1);
    doc.line(M, y, M + contentW, y);
    y += 16;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15);
    doc.text('Total package value', M, y);
    doc.text(fc(totalPackage), M + contentW, y, { align: 'right' });
    y += 14;
  }

  // ── Footer (page numbers) ─────────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `pfinance  ·  generated ${formatDate(input.generatedAt)}`,
      M, pageH - 20,
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
