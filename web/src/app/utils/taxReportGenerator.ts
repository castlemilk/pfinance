import type { jsPDF } from 'jspdf';

// ── Data types ───────────────────────────────────────────────────────────────

export interface TaxReportData {
  financialYear: string; // e.g. "2024-25"
  userName: string;
  occupation: string;
  generatedDate: Date;

  // Tax calculation (all monetary values in cents)
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  baseTax: number;
  medicareLevy: number;
  helpRepayment: number;
  litoOffset: number;
  totalTaxLiability: number;
  taxWithheld: number;
  refundOrOwed: number; // positive = refund, negative = owed
  effectiveRate: number; // percentage

  // Deduction breakdown by ATO category
  deductionsByCategory: Array<{
    categoryCode: string; // D1, D2, etc.
    categoryLabel: string;
    totalCents: number;
    expenseCount: number;
    topExpenses: Array<{
      date: string;
      merchant: string;
      amountCents: number;
      note: string;
    }>;
  }>;

  // Full expense appendix
  allDeductibleExpenses: Array<{
    date: string;
    merchant: string;
    amountCents: number;
    category: string;
    note: string;
  }>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ── Constants ───────────────────────────────────────────────────────────────

const MARGIN = 15;
const PAGE_HEIGHT = 297; // A4 height in mm
const CONTENT_BOTTOM = PAGE_HEIGHT - 20; // leave footer margin

// Colours
const NAVY = { r: 26, g: 26, b: 46 }; // #1a1a2e
const DARK_SLATE = { r: 30, g: 39, b: 56 }; // #1e2738
const ACCENT_GOLD = { r: 212, g: 175, b: 55 }; // #d4af37
const WHITE = { r: 255, g: 255, b: 255 };
const LIGHT_GRAY = { r: 240, g: 240, b: 245 };
const MID_GRAY = { r: 120, g: 120, b: 130 };
const TEXT_DARK = { r: 40, g: 40, b: 50 };
const GREEN = { r: 34, g: 139, b: 34 };
const RED = { r: 180, g: 40, b: 40 };

// ── Generator ───────────────────────────────────────────────────────────────

export class TaxReportGenerator {
  private data: TaxReportData;

  constructor(data: TaxReportData) {
    this.data = data;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  async generatePDF(): Promise<Blob> {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();

    // Section 1 – Cover page
    this.addCoverPage(pdf, pageWidth);

    // Section 2 – Income Summary
    pdf.addPage();
    this.addIncomeSummary(pdf, pageWidth);

    // Section 3 – Deductions by ATO Category
    pdf.addPage();
    this.addDeductionsSummary(pdf, pageWidth);

    // Section 4 – Tax Calculation
    pdf.addPage();
    this.addTaxCalculation(pdf, pageWidth);

    // Section 5 – Appendix
    pdf.addPage();
    this.addAppendix(pdf, pageWidth);

    return new Promise((resolve) => {
      resolve(pdf.output('blob'));
    });
  }

  async downloadPDF(filename?: string): Promise<void> {
    const blob = await this.generatePDF();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `tax-report-${this.data.financialYear}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Section 1: Cover Page ───────────────────────────────────────────────

  private addCoverPage(pdf: jsPDF, pageWidth: number): void {
    // Full-page dark background
    pdf.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    pdf.rect(0, 0, pageWidth, PAGE_HEIGHT, 'F');

    // Decorative accent line at top
    pdf.setFillColor(ACCENT_GOLD.r, ACCENT_GOLD.g, ACCENT_GOLD.b);
    pdf.rect(0, 0, pageWidth, 3, 'F');

    let y = 80;

    // Title
    pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    pdf.setFontSize(32);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Tax Return Summary', pageWidth / 2, y, { align: 'center' });
    y += 16;

    // Subtitle – financial year
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(ACCENT_GOLD.r, ACCENT_GOLD.g, ACCENT_GOLD.b);
    pdf.text(`Financial Year ${this.data.financialYear}`, pageWidth / 2, y, {
      align: 'center',
    });
    y += 30;

    // Divider line
    pdf.setDrawColor(ACCENT_GOLD.r, ACCENT_GOLD.g, ACCENT_GOLD.b);
    pdf.setLineWidth(0.5);
    pdf.line(pageWidth / 2 - 40, y, pageWidth / 2 + 40, y);
    y += 20;

    // User details
    pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(this.data.userName, pageWidth / 2, y, { align: 'center' });
    y += 8;

    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
    pdf.text(this.data.occupation, pageWidth / 2, y, { align: 'center' });
    y += 8;

    pdf.text(
      `Generated: ${this.data.generatedDate.toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`,
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 30;

    // Quick summary box
    const boxW = pageWidth - MARGIN * 2 - 20;
    const boxX = (pageWidth - boxW) / 2;
    pdf.setFillColor(DARK_SLATE.r, DARK_SLATE.g, DARK_SLATE.b);
    pdf.roundedRect(boxX, y, boxW, 50, 3, 3, 'F');

    y += 14;
    pdf.setFontSize(9);
    pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
    pdf.text('GROSS INCOME', boxX + 15, y);
    pdf.text('TOTAL DEDUCTIONS', boxX + boxW / 3 + 5, y);
    pdf.text('EST. REFUND / OWED', boxX + (boxW * 2) / 3 + 5, y);
    y += 8;

    pdf.setFontSize(13);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    pdf.text(formatCurrency(this.data.grossIncome), boxX + 15, y);
    pdf.text(formatCurrency(this.data.totalDeductions), boxX + boxW / 3 + 5, y);

    // Refund in green, owed in red
    if (this.data.refundOrOwed >= 0) {
      pdf.setTextColor(GREEN.r, GREEN.g, GREEN.b);
      pdf.text(formatCurrency(this.data.refundOrOwed), boxX + (boxW * 2) / 3 + 5, y);
    } else {
      pdf.setTextColor(RED.r, RED.g, RED.b);
      pdf.text(formatCurrency(Math.abs(this.data.refundOrOwed)), boxX + (boxW * 2) / 3 + 5, y);
    }
    y += 8;
    if (this.data.refundOrOwed < 0) {
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(RED.r, RED.g, RED.b);
      pdf.text('(amount owed)', boxX + (boxW * 2) / 3 + 5, y);
    }

    // Disclaimer at bottom
    pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'italic');
    const disclaimer =
      'This document is for personal reference only. Consult a tax professional for your official tax return.';
    const disclaimerLines = pdf.splitTextToSize(disclaimer, pageWidth - 60);
    pdf.text(disclaimerLines, pageWidth / 2, PAGE_HEIGHT - 25, { align: 'center' });

    // Bottom accent line
    pdf.setFillColor(ACCENT_GOLD.r, ACCENT_GOLD.g, ACCENT_GOLD.b);
    pdf.rect(0, PAGE_HEIGHT - 3, pageWidth, 3, 'F');
  }

  // ── Section 2: Income Summary ───────────────────────────────────────────

  private addIncomeSummary(pdf: jsPDF, pageWidth: number): void {
    let y = MARGIN;

    y = this.addSectionHeader(pdf, pageWidth, y, 'Income Summary');
    y += 10;

    // Gross income card
    pdf.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
    pdf.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, 28, 3, 3, 'F');
    y += 10;

    pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.text('GROSS INCOME (FY ' + this.data.financialYear + ')', MARGIN + 8, y);
    y += 10;

    pdf.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatCurrency(this.data.grossIncome), MARGIN + 8, y);
    y += 18;

    // Explanation text
    pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    const incomeNote =
      'This is the total assessable income recorded during the financial year, including salary, wages, and other income sources. This figure is used as the starting point for your tax calculation.';
    const noteLines = pdf.splitTextToSize(incomeNote, pageWidth - MARGIN * 2 - 10);
    pdf.text(noteLines, MARGIN + 5, y);
    y += noteLines.length * 5 + 10;

    this.addFooter(pdf, pageWidth);
  }

  // ── Section 3: Deductions by ATO Category ──────────────────────────────

  private addDeductionsSummary(pdf: jsPDF, pageWidth: number): void {
    let y = MARGIN;

    y = this.addSectionHeader(pdf, pageWidth, y, 'Tax Deductions Summary');
    y += 5;

    // Total deductions
    pdf.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Total Deductions:', MARGIN, y);
    pdf.setFont('helvetica', 'bold');
    pdf.text(formatCurrency(this.data.totalDeductions), MARGIN + 42, y);
    y += 10;

    const categoriesWithExpenses = this.data.deductionsByCategory.filter(
      (c) => c.expenseCount > 0
    );

    if (categoriesWithExpenses.length === 0) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
      pdf.text('No deductible expenses recorded for this financial year.', MARGIN, y);
      this.addFooter(pdf, pageWidth);
      return;
    }

    for (const cat of categoriesWithExpenses) {
      // Check page overflow
      if (y > CONTENT_BOTTOM - 50) {
        this.addFooter(pdf, pageWidth);
        pdf.addPage();
        y = MARGIN;
        y = this.addSectionHeader(pdf, pageWidth, y, 'Tax Deductions Summary (cont.)');
        y += 5;
      }

      // Category header bar
      pdf.setFillColor(NAVY.r, NAVY.g, NAVY.b);
      pdf.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, 9, 2, 2, 'F');
      pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.text(
        `${cat.categoryCode} — ${cat.categoryLabel}`,
        MARGIN + 4,
        y + 6
      );

      // Right-aligned total
      const totalStr = formatCurrency(cat.totalCents);
      pdf.text(totalStr, pageWidth - MARGIN - 4, y + 6, { align: 'right' });
      y += 12;

      // Expense count
      pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.text(
        `${cat.expenseCount} expense${cat.expenseCount !== 1 ? 's' : ''}`,
        MARGIN + 4,
        y
      );
      y += 6;

      // Top expenses (up to 5)
      const topExpenses = cat.topExpenses.slice(0, 5);
      if (topExpenses.length > 0) {
        // Mini table header
        pdf.setFontSize(8);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
        pdf.text('Date', MARGIN + 6, y);
        pdf.text('Merchant', MARGIN + 32, y);
        pdf.text('Amount', pageWidth - MARGIN - 4, y, { align: 'right' });
        y += 1;
        pdf.setDrawColor(200, 200, 210);
        pdf.setLineWidth(0.2);
        pdf.line(MARGIN + 4, y, pageWidth - MARGIN - 4, y);
        y += 4;

        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
        for (const exp of topExpenses) {
          if (y > CONTENT_BOTTOM - 10) {
            this.addFooter(pdf, pageWidth);
            pdf.addPage();
            y = MARGIN + 5;
          }
          pdf.setFontSize(8);
          pdf.text(formatDate(exp.date), MARGIN + 6, y);
          // Truncate merchant if too long
          const merchantMax = pageWidth - MARGIN * 2 - 70;
          const merchant =
            pdf.getTextWidth(exp.merchant) > merchantMax
              ? exp.merchant.substring(0, 30) + '...'
              : exp.merchant;
          pdf.text(merchant, MARGIN + 32, y);
          pdf.text(formatCurrency(exp.amountCents), pageWidth - MARGIN - 4, y, {
            align: 'right',
          });
          y += 5;
        }
      }

      y += 6; // space between categories
    }

    this.addFooter(pdf, pageWidth);
  }

  // ── Section 4: Tax Calculation ──────────────────────────────────────────

  private addTaxCalculation(pdf: jsPDF, pageWidth: number): void {
    let y = MARGIN;

    y = this.addSectionHeader(pdf, pageWidth, y, 'Tax Calculation Breakdown');
    y += 10;

    const tableX = MARGIN;
    const tableW = pageWidth - MARGIN * 2;
    const labelX = tableX + 6;
    const valueX = tableX + tableW - 6;

    const addRow = (
      label: string,
      value: string,
      options?: {
        bold?: boolean;
        indent?: boolean;
        separator?: boolean;
        highlight?: boolean;
        color?: { r: number; g: number; b: number };
      }
    ) => {
      const opts = options || {};

      if (opts.separator) {
        pdf.setDrawColor(180, 180, 190);
        pdf.setLineWidth(0.3);
        pdf.line(tableX + 4, y, tableX + tableW - 4, y);
        y += 3;
      }

      if (opts.highlight) {
        pdf.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
        pdf.rect(tableX, y - 4, tableW, 8, 'F');
      }

      const xPos = opts.indent ? labelX + 8 : labelX;

      pdf.setFontSize(10);
      pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      pdf.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
      pdf.text(label, xPos, y);

      if (opts.color) {
        pdf.setTextColor(opts.color.r, opts.color.g, opts.color.b);
      }
      pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
      pdf.text(value, valueX, y, { align: 'right' });

      y += 8;
    };

    // Table border
    pdf.setDrawColor(200, 200, 210);
    pdf.setLineWidth(0.3);

    addRow('Gross Income', formatCurrency(this.data.grossIncome), { bold: true });
    addRow(
      'Less: Total Deductions',
      `(${formatCurrency(this.data.totalDeductions)})`,
      { indent: true }
    );
    addRow('Taxable Income', formatCurrency(this.data.taxableIncome), {
      bold: true,
      separator: true,
      highlight: true,
    });

    y += 4; // extra space

    addRow('Base Tax', formatCurrency(this.data.baseTax));
    addRow('+ Medicare Levy (2%)', formatCurrency(this.data.medicareLevy), {
      indent: true,
    });
    if (this.data.helpRepayment > 0) {
      addRow('+ HELP/HECS Repayment', formatCurrency(this.data.helpRepayment), {
        indent: true,
      });
    }
    if (this.data.litoOffset > 0) {
      addRow(
        '- Low Income Tax Offset (LITO)',
        `(${formatCurrency(this.data.litoOffset)})`,
        { indent: true }
      );
    }

    addRow('Total Tax Liability', formatCurrency(this.data.totalTaxLiability), {
      bold: true,
      separator: true,
      highlight: true,
    });

    y += 4;

    addRow('Less: Tax Withheld (PAYG)', `(${formatCurrency(this.data.taxWithheld)})`, {
      indent: true,
    });

    // Double line before final result
    pdf.setDrawColor(NAVY.r, NAVY.g, NAVY.b);
    pdf.setLineWidth(0.5);
    pdf.line(tableX + 4, y - 2, tableX + tableW - 4, y - 2);
    pdf.line(tableX + 4, y, tableX + tableW - 4, y);
    y += 6;

    if (this.data.refundOrOwed >= 0) {
      addRow('Estimated Refund', formatCurrency(this.data.refundOrOwed), {
        bold: true,
        color: GREEN,
      });
    } else {
      addRow('Amount Owed', formatCurrency(Math.abs(this.data.refundOrOwed)), {
        bold: true,
        color: RED,
      });
    }

    y += 6;

    // Effective tax rate
    pdf.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    pdf.roundedRect(tableX, y, tableW, 12, 2, 2, 'F');
    pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Effective Tax Rate', labelX, y + 8);
    pdf.text(`${this.data.effectiveRate.toFixed(2)}%`, valueX, y + 8, {
      align: 'right',
    });

    this.addFooter(pdf, pageWidth);
  }

  // ── Section 5: Appendix ─────────────────────────────────────────────────

  private addAppendix(pdf: jsPDF, pageWidth: number): void {
    let y = MARGIN;

    y = this.addSectionHeader(pdf, pageWidth, y, 'Appendix: All Deductible Expenses');
    y += 5;

    const expenses = this.data.allDeductibleExpenses;
    if (expenses.length === 0) {
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);
      pdf.text('No deductible expenses to display.', MARGIN, y);
      this.addFooter(pdf, pageWidth);
      return;
    }

    // Column positions
    const colDate = MARGIN + 2;
    const colMerchant = MARGIN + 26;
    const colAmount = pageWidth - MARGIN - 42;
    const colCategory = pageWidth - MARGIN - 80;
    const colNote = pageWidth - MARGIN - 2;

    const addTableHeader = () => {
      pdf.setFillColor(NAVY.r, NAVY.g, NAVY.b);
      pdf.rect(MARGIN, y - 4, pageWidth - MARGIN * 2, 7, 'F');
      pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Date', colDate, y);
      pdf.text('Merchant', colMerchant, y);
      pdf.text('Category', colCategory, y);
      pdf.text('Amount', colAmount, y);
      pdf.text('Note', colNote, y, { align: 'right' });
      y += 5;
    };

    addTableHeader();

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);

    for (let i = 0; i < expenses.length; i++) {
      if (y > CONTENT_BOTTOM - 10) {
        this.addFooter(pdf, pageWidth);
        pdf.addPage();
        y = MARGIN + 5;
        addTableHeader();
      }

      const exp = expenses[i];

      // Alternate row background
      if (i % 2 === 0) {
        pdf.setFillColor(LIGHT_GRAY.r, LIGHT_GRAY.g, LIGHT_GRAY.b);
        pdf.rect(MARGIN, y - 3, pageWidth - MARGIN * 2, 5, 'F');
      }

      pdf.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
      pdf.setFontSize(7);

      pdf.text(formatDate(exp.date), colDate, y);

      // Truncate merchant
      const merchantText =
        exp.merchant.length > 22 ? exp.merchant.substring(0, 20) + '..' : exp.merchant;
      pdf.text(merchantText, colMerchant, y);

      // Truncate category
      const catText =
        exp.category.length > 16 ? exp.category.substring(0, 14) + '..' : exp.category;
      pdf.text(catText, colCategory, y);

      pdf.text(formatCurrency(exp.amountCents), colAmount, y);

      // Truncate note
      const noteText = exp.note
        ? exp.note.length > 14
          ? exp.note.substring(0, 12) + '..'
          : exp.note
        : '';
      pdf.text(noteText, colNote, y, { align: 'right' });

      y += 5;
    }

    // Summary line
    y += 3;
    pdf.setDrawColor(NAVY.r, NAVY.g, NAVY.b);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, y, pageWidth - MARGIN, y);
    y += 6;

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(TEXT_DARK.r, TEXT_DARK.g, TEXT_DARK.b);
    pdf.text(`Total: ${expenses.length} expenses`, MARGIN + 2, y);
    pdf.text(formatCurrency(this.data.totalDeductions), colAmount, y);

    this.addFooter(pdf, pageWidth);
  }

  // ── Shared helpers ──────────────────────────────────────────────────────

  private addSectionHeader(
    pdf: jsPDF,
    pageWidth: number,
    y: number,
    title: string
  ): number {
    // Dark header bar
    pdf.setFillColor(NAVY.r, NAVY.g, NAVY.b);
    pdf.rect(0, y, pageWidth, 14, 'F');

    // Gold accent underline
    pdf.setFillColor(ACCENT_GOLD.r, ACCENT_GOLD.g, ACCENT_GOLD.b);
    pdf.rect(0, y + 14, pageWidth, 1, 'F');

    pdf.setTextColor(WHITE.r, WHITE.g, WHITE.b);
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, MARGIN, y + 10);

    return y + 22;
  }

  private addFooter(pdf: jsPDF, pageWidth: number): void {
    const pageNum = pdf.getNumberOfPages();
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(MID_GRAY.r, MID_GRAY.g, MID_GRAY.b);

    pdf.text(
      `PFinance Tax Report — FY ${this.data.financialYear}`,
      MARGIN,
      PAGE_HEIGHT - 8
    );
    pdf.text(`Page ${pageNum}`, pageWidth - MARGIN, PAGE_HEIGHT - 8, {
      align: 'right',
    });
  }
}
