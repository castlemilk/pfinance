import { jsPDF } from 'jspdf';
import { ExpenseCategory, IncomeFrequency } from '../types';

// Enhanced report data structure
export interface EnhancedReportData {
  title: string;
  subtitle?: string;
  period: {
    start: Date;
    end: Date;
  };
  income: {
    total: number;
    monthlyAverage: number;
    breakdown: Array<{ 
      source: string; 
      amount: number; 
      frequency: IncomeFrequency; 
      percentage: number;
      trend?: 'up' | 'down' | 'stable';
    }>;
    trends: {
      previousPeriod: number;
      growthRate: number;
    };
  };
  expenses: {
    total: number;
    monthlyAverage: number;
    breakdown: Array<{ 
      category: ExpenseCategory; 
      totalAmount: number; 
      percentage: number;
      trend?: 'up' | 'down' | 'stable';
      subcategories?: Array<{ name: string; amount: number }>;
    }>;
    trends: {
      previousPeriod: number;
      changeRate: number;
    };
  };
  savings: {
    amount: number;
    rate: number;
    monthlyAverage: number;
    goalProgress?: {
      target: number;
      achieved: number;
      percentage: number;
    };
  };
  netWorth?: {
    current: number;
    change: number;
    changePercentage: number;
  };
  groupData?: {
    name: string;
    members: number;
    totalGroupExpenses: number;
    userOwed: number;
    userOwes: number;
    netBalance: number;
    expenseBreakdown: Array<{ category: ExpenseCategory; amount: number; percentage: number }>;
  };
  insights: {
    topExpenseCategory: string;
    savingsRate: number;
    spendingTrend: 'increasing' | 'decreasing' | 'stable';
    recommendations: string[];
  };
  metadata: {
    generatedAt: Date;
    reportId: string;
    version: string;
    dataPoints: number;
  };
}

// Export formats
export type ExportFormat = 'pdf' | 'csv' | 'xlsx' | 'json';

// Chart data for visual reports
export interface ChartData {
  expensePieChart: Array<{ name: string; value: number; color: string }>;
  incomeBarChart: Array<{ name: string; amount: number; month: string }>;
  trendLineChart: Array<{ date: string; income: number; expenses: number; savings: number }>;
  savingsProgressChart: Array<{ month: string; target: number; actual: number }>;
}

// Report template types
export type ReportTemplate = 'standard' | 'executive' | 'detailed' | 'minimal';

// Enhanced report generator class
export class EnhancedReportGenerator {
  private data: EnhancedReportData;
  private template: ReportTemplate;
  private includeCharts: boolean;

  constructor(
    data: EnhancedReportData, 
    template: ReportTemplate = 'standard',
    includeCharts: boolean = true
  ) {
    this.data = data;
    this.template = template;
    this.includeCharts = includeCharts;
  }

  // Generate PDF report with enhanced formatting
  public async generatePDF(): Promise<Blob> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let yPosition = 20;

    // Title page
    yPosition = this.addTitlePage(pdf, pageWidth, yPosition);
    
    // Executive summary
    if (this.template === 'executive' || this.template === 'detailed') {
      pdf.addPage();
      yPosition = 20;
      yPosition = this.addExecutiveSummary(pdf, pageWidth, yPosition);
    }

    // Income analysis
    pdf.addPage();
    yPosition = 20;
    yPosition = this.addIncomeAnalysis(pdf, pageWidth, yPosition);

    // Expense analysis
    pdf.addPage();
    yPosition = 20;
    yPosition = this.addExpenseAnalysis(pdf, pageWidth, yPosition);

    // Savings and goals
    pdf.addPage();
    yPosition = 20;
    yPosition = this.addSavingsAnalysis(pdf, pageWidth, yPosition);

    // Group analysis (if applicable)
    if (this.data.groupData) {
      pdf.addPage();
      yPosition = 20;
      yPosition = this.addGroupAnalysis(pdf, pageWidth, yPosition);
    }

    // Insights and recommendations
    pdf.addPage();
    yPosition = 20;
    yPosition = this.addInsightsAndRecommendations(pdf, pageWidth, yPosition);

    // Appendix (if detailed template)
    if (this.template === 'detailed') {
      pdf.addPage();
      yPosition = 20;
      this.addAppendix(pdf, pageWidth, yPosition);
    }

    return new Promise((resolve) => {
      const pdfBlob = pdf.output('blob');
      resolve(pdfBlob);
    });
  }

  // Generate Excel-compatible XLSX data
  public generateXLSXData(): any {
    const workbook = {
      SheetNames: ['Summary', 'Income', 'Expenses', 'Trends'],
      Sheets: {
        Summary: this.createSummarySheet(),
        Income: this.createIncomeSheet(),
        Expenses: this.createExpenseSheet(),
        Trends: this.createTrendsSheet()
      }
    };

    if (this.data.groupData) {
      workbook.SheetNames.push('Group');
      (workbook.Sheets as any)['Group'] = this.createGroupSheet();
    }

    return workbook;
  }

  // Generate comprehensive CSV export
  public generateCSV(): string {
    const csvData: string[][] = [];
    
    // Header information
    csvData.push([this.data.title]);
    csvData.push([`Period: ${this.data.period.start.toLocaleDateString()} - ${this.data.period.end.toLocaleDateString()}`]);
    csvData.push([`Generated: ${this.data.metadata.generatedAt.toLocaleDateString()}`]);
    csvData.push([]);

    // Summary section
    csvData.push(['FINANCIAL SUMMARY']);
    csvData.push(['Metric', 'Amount', 'Monthly Average', 'Trend']);
    csvData.push(['Total Income', this.data.income.total.toFixed(2), this.data.income.monthlyAverage.toFixed(2), this.formatTrend(this.data.income.trends.growthRate)]);
    csvData.push(['Total Expenses', this.data.expenses.total.toFixed(2), this.data.expenses.monthlyAverage.toFixed(2), this.formatTrend(this.data.expenses.trends.changeRate)]);
    csvData.push(['Net Savings', this.data.savings.amount.toFixed(2), this.data.savings.monthlyAverage.toFixed(2), '']);
    csvData.push(['Savings Rate', `${this.data.savings.rate.toFixed(1)}%`, '', '']);
    csvData.push([]);

    // Income breakdown
    csvData.push(['INCOME BREAKDOWN']);
    csvData.push(['Source', 'Amount', 'Frequency', 'Percentage', 'Trend']);
    this.data.income.breakdown.forEach(income => {
      csvData.push([
        income.source,
        income.amount.toFixed(2),
        income.frequency,
        `${income.percentage.toFixed(1)}%`,
        income.trend || ''
      ]);
    });
    csvData.push([]);

    // Expense breakdown
    csvData.push(['EXPENSE BREAKDOWN']);
    csvData.push(['Category', 'Amount', 'Percentage', 'Trend']);
    this.data.expenses.breakdown.forEach(expense => {
      csvData.push([
        expense.category,
        expense.totalAmount.toFixed(2),
        `${expense.percentage.toFixed(1)}%`,
        expense.trend || ''
      ]);
    });
    csvData.push([]);

    // Group data
    if (this.data.groupData) {
      csvData.push(['GROUP SUMMARY']);
      csvData.push(['Group Name', this.data.groupData.name]);
      csvData.push(['Members', this.data.groupData.members.toString()]);
      csvData.push(['Total Group Expenses', this.data.groupData.totalGroupExpenses.toFixed(2)]);
      csvData.push(['You are owed', this.data.groupData.userOwed.toFixed(2)]);
      csvData.push(['You owe', this.data.groupData.userOwes.toFixed(2)]);
      csvData.push(['Net Balance', this.data.groupData.netBalance.toFixed(2)]);
      csvData.push([]);
    }

    // Insights
    csvData.push(['INSIGHTS & RECOMMENDATIONS']);
    csvData.push(['Top Expense Category', this.data.insights.topExpenseCategory]);
    csvData.push(['Spending Trend', this.data.insights.spendingTrend]);
    csvData.push([]);
    csvData.push(['Recommendations']);
    this.data.insights.recommendations.forEach((rec, index) => {
      csvData.push([`${index + 1}. ${rec}`]);
    });

    return csvData.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  }

  // Generate JSON export
  public generateJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }

  // Create chart data for visualization
  public generateChartData(): ChartData {
    const colors = [
      '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8',
      '#82CA9D', '#FFC658', '#FF7C7C', '#8DD1E1', '#D084D0'
    ];

    return {
      expensePieChart: this.data.expenses.breakdown.map((expense, index) => ({
        name: expense.category,
        value: expense.totalAmount,
        color: colors[index % colors.length]
      })),
      incomeBarChart: this.data.income.breakdown.map(income => ({
        name: income.source,
        amount: income.amount,
        month: this.data.period.start.toLocaleDateString('en-US', { month: 'short' })
      })),
      trendLineChart: this.generateTrendData(),
      savingsProgressChart: this.generateSavingsProgressData()
    };
  }

  // Private helper methods
  private addTitlePage(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    // Title
    pdf.setFontSize(24);
    pdf.text(this.data.title, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 20;

    if (this.data.subtitle) {
      pdf.setFontSize(16);
      pdf.text(this.data.subtitle, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;
    }

    // Period
    pdf.setFontSize(14);
    const periodText = `${this.data.period.start.toLocaleDateString()} - ${this.data.period.end.toLocaleDateString()}`;
    pdf.text(periodText, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 30;

    // Key metrics box
    pdf.setDrawColor(0);
    pdf.setFillColor(240, 240, 240);
    pdf.roundedRect(20, yPosition, pageWidth - 40, 80, 5, 5, 'FD');
    yPosition += 15;

    pdf.setFontSize(12);
    pdf.text('Financial Summary', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 15;

    const metrics = [
      [`Total Income: $${this.data.income.total.toFixed(2)}`, `Total Expenses: $${this.data.expenses.total.toFixed(2)}`],
      [`Net Savings: $${this.data.savings.amount.toFixed(2)}`, `Savings Rate: ${this.data.savings.rate.toFixed(1)}%`]
    ];

    metrics.forEach(row => {
      pdf.text(row[0], 30, yPosition);
      pdf.text(row[1], pageWidth / 2 + 10, yPosition);
      yPosition += 10;
    });

    yPosition += 30;

    // Report metadata
    pdf.setFontSize(10);
    pdf.text(`Report ID: ${this.data.metadata.reportId}`, 20, yPosition);
    yPosition += 5;
    pdf.text(`Generated: ${this.data.metadata.generatedAt.toLocaleString()}`, 20, yPosition);
    yPosition += 5;
    pdf.text(`Data Points: ${this.data.metadata.dataPoints}`, 20, yPosition);

    return yPosition;
  }

  private addExecutiveSummary(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    pdf.setFontSize(18);
    pdf.text('Executive Summary', 20, yPosition);
    yPosition += 15;

    pdf.setFontSize(11);
    const summaryText = this.generateExecutiveSummaryText();
    const lines = pdf.splitTextToSize(summaryText, pageWidth - 40);
    pdf.text(lines, 20, yPosition);
    yPosition += lines.length * 5 + 10;

    return yPosition;
  }

  private addIncomeAnalysis(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    pdf.setFontSize(18);
    pdf.text('Income Analysis', 20, yPosition);
    yPosition += 15;

    // Income summary
    pdf.setFontSize(12);
    pdf.text(`Total Income: $${this.data.income.total.toFixed(2)}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Monthly Average: $${this.data.income.monthlyAverage.toFixed(2)}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Growth Rate: ${this.data.income.trends.growthRate > 0 ? '+' : ''}${this.data.income.trends.growthRate.toFixed(1)}%`, 20, yPosition);
    yPosition += 15;

    // Income breakdown table
    this.addTableHeader(pdf, 20, yPosition, ['Source', 'Amount', 'Frequency', '%'], [40, 30, 30, 20]);
    yPosition += 8;

    this.data.income.breakdown.forEach(income => {
      pdf.setFontSize(10);
      pdf.text(income.source, 20, yPosition);
      pdf.text(`$${income.amount.toFixed(2)}`, 60, yPosition);
      pdf.text(income.frequency, 90, yPosition);
      pdf.text(`${income.percentage.toFixed(1)}%`, 120, yPosition);
      yPosition += 6;
    });

    return yPosition + 10;
  }

  private addExpenseAnalysis(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    pdf.setFontSize(18);
    pdf.text('Expense Analysis', 20, yPosition);
    yPosition += 15;

    // Expense summary
    pdf.setFontSize(12);
    pdf.text(`Total Expenses: $${this.data.expenses.total.toFixed(2)}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Monthly Average: $${this.data.expenses.monthlyAverage.toFixed(2)}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Change Rate: ${this.data.expenses.trends.changeRate > 0 ? '+' : ''}${this.data.expenses.trends.changeRate.toFixed(1)}%`, 20, yPosition);
    yPosition += 15;

    // Expense breakdown table
    this.addTableHeader(pdf, 20, yPosition, ['Category', 'Amount', '%', 'Trend'], [50, 30, 15, 25]);
    yPosition += 8;

    this.data.expenses.breakdown.forEach(expense => {
      pdf.setFontSize(10);
      pdf.text(expense.category, 20, yPosition);
      pdf.text(`$${expense.totalAmount.toFixed(2)}`, 70, yPosition);
      pdf.text(`${expense.percentage.toFixed(1)}%`, 100, yPosition);
      pdf.text(expense.trend || 'Stable', 115, yPosition);
      yPosition += 6;
    });

    return yPosition + 10;
  }

  private addSavingsAnalysis(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    pdf.setFontSize(18);
    pdf.text('Savings & Goals', 20, yPosition);
    yPosition += 15;

    pdf.setFontSize(12);
    pdf.text(`Net Savings: $${this.data.savings.amount.toFixed(2)}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Savings Rate: ${this.data.savings.rate.toFixed(1)}%`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Monthly Average: $${this.data.savings.monthlyAverage.toFixed(2)}`, 20, yPosition);
    yPosition += 15;

    if (this.data.savings.goalProgress) {
      pdf.text('Goal Progress:', 20, yPosition);
      yPosition += 8;
      pdf.setFontSize(10);
      pdf.text(`Target: $${this.data.savings.goalProgress.target.toFixed(2)}`, 25, yPosition);
      yPosition += 6;
      pdf.text(`Achieved: $${this.data.savings.goalProgress.achieved.toFixed(2)}`, 25, yPosition);
      yPosition += 6;
      pdf.text(`Progress: ${this.data.savings.goalProgress.percentage.toFixed(1)}%`, 25, yPosition);
      yPosition += 10;
    }

    return yPosition;
  }

  private addGroupAnalysis(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    if (!this.data.groupData) return yPosition;

    pdf.setFontSize(18);
    pdf.text('Group Finance Analysis', 20, yPosition);
    yPosition += 15;

    pdf.setFontSize(12);
    pdf.text(`Group: ${this.data.groupData.name}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Members: ${this.data.groupData.members}`, 20, yPosition);
    yPosition += 8;
    pdf.text(`Total Group Expenses: $${this.data.groupData.totalGroupExpenses.toFixed(2)}`, 20, yPosition);
    yPosition += 15;

    // Balance summary
    pdf.text('Your Balance:', 20, yPosition);
    yPosition += 8;
    pdf.setFontSize(10);
    pdf.text(`You are owed: $${this.data.groupData.userOwed.toFixed(2)}`, 25, yPosition);
    yPosition += 6;
    pdf.text(`You owe: $${this.data.groupData.userOwes.toFixed(2)}`, 25, yPosition);
    yPosition += 6;
    pdf.text(`Net balance: $${this.data.groupData.netBalance.toFixed(2)}`, 25, yPosition);

    return yPosition + 15;
  }

  private addInsightsAndRecommendations(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    pdf.setFontSize(18);
    pdf.text('Insights & Recommendations', 20, yPosition);
    yPosition += 15;

    // Key insights
    pdf.setFontSize(12);
    pdf.text('Key Insights:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(10);
    pdf.text(`• Top expense category: ${this.data.insights.topExpenseCategory}`, 25, yPosition);
    yPosition += 6;
    pdf.text(`• Spending trend: ${this.data.insights.spendingTrend}`, 25, yPosition);
    yPosition += 6;
    pdf.text(`• Current savings rate: ${this.data.insights.savingsRate.toFixed(1)}%`, 25, yPosition);
    yPosition += 15;

    // Recommendations
    pdf.setFontSize(12);
    pdf.text('Recommendations:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(10);
    this.data.insights.recommendations.forEach((rec, index) => {
      const lines = pdf.splitTextToSize(`${index + 1}. ${rec}`, pageWidth - 50);
      pdf.text(lines, 25, yPosition);
      yPosition += lines.length * 5 + 3;
    });

    return yPosition;
  }

  private addAppendix(pdf: jsPDF, pageWidth: number, yPosition: number): number {
    pdf.setFontSize(18);
    pdf.text('Appendix', 20, yPosition);
    yPosition += 15;

    // Methodology
    pdf.setFontSize(12);
    pdf.text('Methodology:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(10);
    const methodologyText = 'This report analyzes financial data based on recorded transactions during the specified period. Income and expense calculations are normalized to monthly averages for comparison purposes. Trends are calculated by comparing the current period to the previous period of equal length.';
    const lines = pdf.splitTextToSize(methodologyText, pageWidth - 40);
    pdf.text(lines, 20, yPosition);
    yPosition += lines.length * 5 + 10;

    // Data sources
    pdf.setFontSize(12);
    pdf.text('Data Sources:', 20, yPosition);
    yPosition += 10;

    pdf.setFontSize(10);
    pdf.text(`• Transaction records: ${this.data.metadata.dataPoints} entries`, 25, yPosition);
    yPosition += 6;
    pdf.text('• Manual income entries', 25, yPosition);
    yPosition += 6;
    pdf.text('• Categorized expense tracking', 25, yPosition);

    return yPosition;
  }

  private addTableHeader(pdf: jsPDF, x: number, y: number, headers: string[], widths: number[]): void {
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    let currentX = x;
    headers.forEach((header, index) => {
      pdf.text(header, currentX, y);
      currentX += widths[index];
    });
    pdf.setFont('helvetica', 'normal');
  }

  private generateExecutiveSummaryText(): string {
    const savingsRate = this.data.savings.rate;
    const spendingTrend = this.data.insights.spendingTrend;
    const topCategory = this.data.insights.topExpenseCategory;

    return `During the reporting period from ${this.data.period.start.toLocaleDateString()} to ${this.data.period.end.toLocaleDateString()}, total income was $${this.data.income.total.toFixed(2)} with total expenses of $${this.data.expenses.total.toFixed(2)}, resulting in net savings of $${this.data.savings.amount.toFixed(2)} (${savingsRate.toFixed(1)}% savings rate). The largest expense category was ${topCategory}, and spending trends show a ${spendingTrend} pattern. ${this.data.groupData ? `Group expenses totaled $${this.data.groupData.totalGroupExpenses.toFixed(2)} with a net balance of $${this.data.groupData.netBalance.toFixed(2)}.` : ''}`;
  }

  private createSummarySheet(): any {
    return {
      'A1': { v: 'Financial Summary', t: 's' },
      'A2': { v: 'Period', t: 's' },
      'B2': { v: `${this.data.period.start.toLocaleDateString()} - ${this.data.period.end.toLocaleDateString()}`, t: 's' },
      'A4': { v: 'Metric', t: 's' },
      'B4': { v: 'Amount', t: 's' },
      'C4': { v: 'Monthly Average', t: 's' },
      'A5': { v: 'Total Income', t: 's' },
      'B5': { v: this.data.income.total, t: 'n' },
      'C5': { v: this.data.income.monthlyAverage, t: 'n' },
      'A6': { v: 'Total Expenses', t: 's' },
      'B6': { v: this.data.expenses.total, t: 'n' },
      'C6': { v: this.data.expenses.monthlyAverage, t: 'n' },
      'A7': { v: 'Net Savings', t: 's' },
      'B7': { v: this.data.savings.amount, t: 'n' },
      'C7': { v: this.data.savings.monthlyAverage, t: 'n' },
      'A8': { v: 'Savings Rate', t: 's' },
      'B8': { v: this.data.savings.rate / 100, t: 'n', z: '0.00%' },
      '!ref': 'A1:C8'
    };
  }

  private createIncomeSheet(): any {
    const sheet: any = {
      'A1': { v: 'Income Breakdown', t: 's' },
      'A3': { v: 'Source', t: 's' },
      'B3': { v: 'Amount', t: 's' },
      'C3': { v: 'Frequency', t: 's' },
      'D3': { v: 'Percentage', t: 's' }
    };

    this.data.income.breakdown.forEach((income, index) => {
      const row = index + 4;
      sheet[`A${row}`] = { v: income.source, t: 's' };
      sheet[`B${row}`] = { v: income.amount, t: 'n' };
      sheet[`C${row}`] = { v: income.frequency, t: 's' };
      sheet[`D${row}`] = { v: income.percentage / 100, t: 'n', z: '0.00%' };
    });

    const lastRow = this.data.income.breakdown.length + 3;
    sheet['!ref'] = `A1:D${lastRow}`;
    return sheet;
  }

  private createExpenseSheet(): any {
    const sheet: any = {
      'A1': { v: 'Expense Breakdown', t: 's' },
      'A3': { v: 'Category', t: 's' },
      'B3': { v: 'Amount', t: 's' },
      'C3': { v: 'Percentage', t: 's' },
      'D3': { v: 'Trend', t: 's' }
    };

    this.data.expenses.breakdown.forEach((expense, index) => {
      const row = index + 4;
      sheet[`A${row}`] = { v: expense.category, t: 's' };
      sheet[`B${row}`] = { v: expense.totalAmount, t: 'n' };
      sheet[`C${row}`] = { v: expense.percentage / 100, t: 'n', z: '0.00%' };
      sheet[`D${row}`] = { v: expense.trend || 'Stable', t: 's' };
    });

    const lastRow = this.data.expenses.breakdown.length + 3;
    sheet['!ref'] = `A1:D${lastRow}`;
    return sheet;
  }

  private createTrendsSheet(): any {
    const sheet: any = {
      'A1': { v: 'Financial Trends', t: 's' },
      'A3': { v: 'Metric', t: 's' },
      'B3': { v: 'Current Period', t: 's' },
      'C3': { v: 'Previous Period', t: 's' },
      'D3': { v: 'Change %', t: 's' }
    };

    sheet['A4'] = { v: 'Income', t: 's' };
    sheet['B4'] = { v: this.data.income.total, t: 'n' };
    sheet['C4'] = { v: this.data.income.trends.previousPeriod, t: 'n' };
    sheet['D4'] = { v: this.data.income.trends.growthRate / 100, t: 'n', z: '0.00%' };

    sheet['A5'] = { v: 'Expenses', t: 's' };
    sheet['B5'] = { v: this.data.expenses.total, t: 'n' };
    sheet['C5'] = { v: this.data.expenses.trends.previousPeriod, t: 'n' };
    sheet['D5'] = { v: this.data.expenses.trends.changeRate / 100, t: 'n', z: '0.00%' };

    sheet['!ref'] = 'A1:D5';
    return sheet;
  }

  private createGroupSheet(): any {
    if (!this.data.groupData) return {};

    const sheet: any = {
      'A1': { v: 'Group Finance Analysis', t: 's' },
      'A3': { v: 'Group Name', t: 's' },
      'B3': { v: this.data.groupData.name, t: 's' },
      'A4': { v: 'Members', t: 's' },
      'B4': { v: this.data.groupData.members, t: 'n' },
      'A5': { v: 'Total Group Expenses', t: 's' },
      'B5': { v: this.data.groupData.totalGroupExpenses, t: 'n' },
      'A6': { v: 'You are owed', t: 's' },
      'B6': { v: this.data.groupData.userOwed, t: 'n' },
      'A7': { v: 'You owe', t: 's' },
      'B7': { v: this.data.groupData.userOwes, t: 'n' },
      'A8': { v: 'Net Balance', t: 's' },
      'B8': { v: this.data.groupData.netBalance, t: 'n' }
    };

    sheet['!ref'] = 'A1:B8';
    return sheet;
  }

  private generateTrendData(): Array<{ date: string; income: number; expenses: number; savings: number }> {
    // This would normally come from historical data
    // For now, generate sample trend data
    const trends = [];
    const startDate = new Date(this.data.period.start);
    const endDate = new Date(this.data.period.end);
    const monthsDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30);
    
    for (let i = 0; i <= Math.min(monthsDiff, 12); i++) {
      const date = new Date(startDate);
      date.setMonth(date.getMonth() + i);
      
      trends.push({
        date: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income: this.data.income.monthlyAverage * (0.9 + Math.random() * 0.2),
        expenses: this.data.expenses.monthlyAverage * (0.9 + Math.random() * 0.2),
        savings: this.data.savings.monthlyAverage * (0.8 + Math.random() * 0.4)
      });
    }
    
    return trends;
  }

  private generateSavingsProgressData(): Array<{ month: string; target: number; actual: number }> {
    // Sample savings progress data
    const progress = [];
    const target = this.data.savings.goalProgress?.target || this.data.savings.monthlyAverage * 12;
    const monthlyTarget = target / 12;
    
    for (let i = 1; i <= 12; i++) {
      const month = new Date(2024, i - 1, 1).toLocaleDateString('en-US', { month: 'short' });
      progress.push({
        month,
        target: monthlyTarget * i,
        actual: (monthlyTarget * i) * (0.8 + Math.random() * 0.4)
      });
    }
    
    return progress;
  }

  private formatTrend(changeRate: number): string {
    if (changeRate > 5) return '↗ Increasing';
    if (changeRate < -5) return '↘ Decreasing';
    return '→ Stable';
  }
}