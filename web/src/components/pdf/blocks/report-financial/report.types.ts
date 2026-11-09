import type { PdfcnTheme } from '@/types/pdf-themes';

export type ReportTone = 'success' | 'warning' | 'destructive' | 'info';

export interface SummaryMetric {
  label: string;
  value: string;
  detail?: string;
  tone?: ReportTone;
}

export type ExpenseCategoryRow = Record<string, unknown> & {
  category: string;
  amount: number;
  formattedAmount: string;
  percentage: number;
};

export type IncomeSourceRow = Record<string, unknown> & {
  source: string;
  formattedAmount: string;
  percentage: number;
};

export interface FinancialReportData {
  title: string;
  subtitle: string;
  generatedAt: string;
  period: string;
  author: string;
  currency: string;
  summary: SummaryMetric[];
  expenseCategories: ExpenseCategoryRow[];
  incomeSources: IncomeSourceRow[];
  totals: {
    expenses: string;
    income: string;
  };
}

export interface ReportTemplateProps {
  theme?: PdfcnTheme;
  data: FinancialReportData;
}
