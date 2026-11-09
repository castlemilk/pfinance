import type { FinancialReportData } from '@/components/pdf/blocks/report-financial/report.types';
import type { FinanceMetrics } from '../metrics/types';

interface FinancialReportDataOptions {
  title: string;
  author: string;
  metrics: FinanceMetrics;
  periodLabel: string;
  formatCurrency: (amount: number) => string;
  generatedAt?: Date;
}

const formatGeneratedDate = (date: Date) =>
  date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/** Build the PDF document from the same normalized metrics as the dashboard preview. */
export function createFinancialReportData({
  title,
  author,
  metrics,
  periodLabel,
  formatCurrency,
  generatedAt = new Date(),
}: FinancialReportDataOptions): FinancialReportData {
  const incomeSources = metrics.income.sources.map((source) => ({
    source: source.source,
    formattedAmount: formatCurrency(source.amount.value),
    percentage: source.percentageOfTotal,
  }));
  const expenseCategories = metrics.expenses.byCategory.map((category) => ({
    category: category.category,
    amount: category.amount.value,
    formattedAmount: formatCurrency(category.amount.value),
    percentage: category.percentageOfTotal,
  }));
  const savingsAmount = metrics.savings.amount.value;
  const savingsTone = savingsAmount < 0 ? 'destructive' : savingsAmount > 0 ? 'success' : 'info';
  const sourceCount = incomeSources.length;
  const expenseCount = metrics.expenses.expenseCount;

  return {
    title: title.trim() || 'Financial Report',
    subtitle: `Income, expenses, and savings ${periodLabel}`,
    generatedAt: formatGeneratedDate(generatedAt),
    period: periodLabel,
    author: author.trim() || 'PFinance user',
    currency: metrics.currency,
    summary: [
      {
        label: 'Gross income',
        value: formatCurrency(metrics.income.gross.value),
        detail: `${sourceCount} income ${sourceCount === 1 ? 'source' : 'sources'}`,
        tone: 'info',
      },
      {
        label: 'Net income',
        value: formatCurrency(metrics.income.net.value),
        detail: metrics.tax.isEnabled
          ? `${formatCurrency(metrics.tax.amount.value)} estimated tax`
          : 'Before expenses',
        tone: 'info',
      },
      {
        label: 'Expenses',
        value: formatCurrency(metrics.expenses.total.value),
        detail: `${expenseCount} expense ${expenseCount === 1 ? 'entry' : 'entries'}`,
        tone: 'info',
      },
      {
        label: 'Net savings',
        value: formatCurrency(savingsAmount),
        detail: `${metrics.savings.rate.toFixed(1)}% of gross income`,
        tone: savingsTone,
      },
    ],
    expenseCategories,
    incomeSources,
    totals: {
      expenses: formatCurrency(metrics.expenses.total.value),
      income: formatCurrency(metrics.income.gross.value),
    },
  };
}
