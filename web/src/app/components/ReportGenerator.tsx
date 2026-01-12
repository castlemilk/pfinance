'use client';

import { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  FileText, 
  Download, 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { ExpenseCategory, IncomeFrequency } from '../types';

interface ReportData {
  title: string;
  period: {
    start: Date;
    end: Date;
  };
  income: {
    total: number;
    breakdown: Array<{ source: string; amount: number; frequency: IncomeFrequency }>;
  };
  expenses: {
    total: number;
    breakdown: Array<{ category: ExpenseCategory; totalAmount: number; percentage: number }>;
  };
  savings: {
    amount: number;
    rate: number;
  };
  groupData?: {
    name: string;
    members: number;
    totalGroupExpenses: number;
    userOwed: number;
    userOwes: number;
  };
}

type ReportType = 'personal' | 'group' | 'comparison';
type ReportPeriod = 'week' | 'month' | 'quarter' | 'year' | 'custom';

interface ReportGeneratorProps {
  mode?: 'personal' | 'shared';
  groupId?: string;
}

export default function ReportGenerator({ mode = 'personal', groupId }: ReportGeneratorProps) {
  const { user } = useAuth();
  const { 
    getTotalIncome, 
    getNetIncome, 
    getTotalExpenses, 
    getExpenseSummary,
    incomes
  } = useFinance();
  const { 
    activeGroup, 
    groupExpenses, 
    getUserOwedAmount, 
    getUserOwesAmount 
  } = useMultiUserFinance();

  const [reportType, setReportType] = useState<ReportType>('personal');
  const [reportPeriod, setReportPeriod] = useState<ReportPeriod>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [reportTitle, setReportTitle] = useState('Financial Report');
  const [isGenerating, setIsGenerating] = useState(false);

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    let start: Date;
    let end = new Date(now);

    switch (reportPeriod) {
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarterStart = Math.floor(now.getMonth() / 3) * 3;
        start = new Date(now.getFullYear(), quarterStart, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        start = customStartDate ? new Date(customStartDate) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        end = customEndDate ? new Date(customEndDate) : now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { start, end };
  }, [reportPeriod, customStartDate, customEndDate]);

  // Generate report data
  const reportData = useMemo((): ReportData => {
    const totalIncome = getTotalIncome('monthly');
    const netIncome = getNetIncome('monthly');
    const totalExpenses = getTotalExpenses();
    const expenseSummary = getExpenseSummary();
    
    // Filter data by date range
    const filteredIncomes = incomes.filter(income => 
      income.date >= dateRange.start && income.date <= dateRange.end
    );

    const data: ReportData = {
      title: reportTitle,
      period: dateRange,
      income: {
        total: totalIncome,
        breakdown: filteredIncomes.map(income => ({
          source: income.source,
          amount: income.amount,
          frequency: income.frequency
        }))
      },
      expenses: {
        total: totalExpenses / 12, // Convert to monthly
        breakdown: expenseSummary
      },
      savings: {
        amount: netIncome - (totalExpenses / 12),
        rate: totalIncome > 0 ? ((netIncome - (totalExpenses / 12)) / totalIncome) * 100 : 0
      }
    };

    // Add group data if group report
    if (reportType === 'group' && activeGroup && user) {
      data.groupData = {
        name: activeGroup.name,
        members: activeGroup.members.length,
        totalGroupExpenses: groupExpenses.reduce((sum, expense) => sum + expense.amount, 0),
        userOwed: getUserOwedAmount(activeGroup.id, user.uid),
        userOwes: getUserOwesAmount(activeGroup.id, user.uid)
      };
    }

    return data;
  }, [
    reportType, 
    dateRange, 
    reportTitle, 
    getTotalIncome, 
    getNetIncome, 
    getTotalExpenses, 
    getExpenseSummary,
    incomes,
    activeGroup,
    groupExpenses,
    getUserOwedAmount,
    getUserOwesAmount,
    user
  ]);

  const generatePDFReport = async () => {
    setIsGenerating(true);
    try {
      const pdf = new jsPDF();
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 20;

      // Title
      pdf.setFontSize(20);
      pdf.text(reportData.title, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 15;

      // Period
      pdf.setFontSize(12);
      const periodText = `Period: ${reportData.period.start.toLocaleDateString()} - ${reportData.period.end.toLocaleDateString()}`;
      pdf.text(periodText, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 20;

      // Income Section
      pdf.setFontSize(16);
      pdf.text('Income Summary', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(12);
      pdf.text(`Total Income: $${reportData.income.total.toFixed(2)}`, 20, yPosition);
      yPosition += 8;

      if (reportData.income.breakdown.length > 0) {
        pdf.text('Income Sources:', 20, yPosition);
        yPosition += 5;
        reportData.income.breakdown.forEach((income) => {
          pdf.text(`  • ${income.source}: $${income.amount.toFixed(2)} (${income.frequency})`, 25, yPosition);
          yPosition += 5;
        });
      }
      yPosition += 10;

      // Expenses Section
      pdf.setFontSize(16);
      pdf.text('Expense Summary', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(12);
      pdf.text(`Total Expenses: $${reportData.expenses.total.toFixed(2)}`, 20, yPosition);
      yPosition += 8;

      if (reportData.expenses.breakdown.length > 0) {
        pdf.text('Expense Categories:', 20, yPosition);
        yPosition += 5;
        reportData.expenses.breakdown.forEach((expense) => {
          pdf.text(`  • ${expense.category}: $${expense.totalAmount.toFixed(2)} (${expense.percentage.toFixed(1)}%)`, 25, yPosition);
          yPosition += 5;
        });
      }
      yPosition += 10;

      // Savings Section
      pdf.setFontSize(16);
      pdf.text('Savings Summary', 20, yPosition);
      yPosition += 10;
      
      pdf.setFontSize(12);
      pdf.text(`Net Savings: $${reportData.savings.amount.toFixed(2)}`, 20, yPosition);
      yPosition += 5;
      pdf.text(`Savings Rate: ${reportData.savings.rate.toFixed(1)}%`, 20, yPosition);
      yPosition += 15;

      // Group Data (if applicable)
      if (reportData.groupData) {
        pdf.setFontSize(16);
        pdf.text('Group Summary', 20, yPosition);
        yPosition += 10;
        
        pdf.setFontSize(12);
        pdf.text(`Group: ${reportData.groupData.name}`, 20, yPosition);
        yPosition += 5;
        pdf.text(`Members: ${reportData.groupData.members}`, 20, yPosition);
        yPosition += 5;
        pdf.text(`Total Group Expenses: $${reportData.groupData.totalGroupExpenses.toFixed(2)}`, 20, yPosition);
        yPosition += 5;
        pdf.text(`You are owed: $${reportData.groupData.userOwed.toFixed(2)}`, 20, yPosition);
        yPosition += 5;
        pdf.text(`You owe: $${reportData.groupData.userOwes.toFixed(2)}`, 20, yPosition);
      }

      // Footer
      pdf.setFontSize(10);
      pdf.text(`Generated on ${new Date().toLocaleDateString()} by PFinance`, pageWidth / 2, pageHeight - 10, { align: 'center' });

      // Save PDF
      const fileName = `financial-report-${reportData.period.start.toISOString().slice(0, 10)}-to-${reportData.period.end.toISOString().slice(0, 10)}.pdf`;
      pdf.save(fileName);

    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCSVReport = () => {
    const csvData = [];
    
    // Header
    csvData.push(['Financial Report', reportData.title]);
    csvData.push(['Period', `${reportData.period.start.toLocaleDateString()} - ${reportData.period.end.toLocaleDateString()}`]);
    csvData.push([]);

    // Income
    csvData.push(['INCOME SUMMARY']);
    csvData.push(['Total Income', reportData.income.total.toFixed(2)]);
    csvData.push([]);
    csvData.push(['Income Sources', 'Amount', 'Frequency']);
    reportData.income.breakdown.forEach(income => {
      csvData.push([income.source, income.amount.toFixed(2), income.frequency]);
    });
    csvData.push([]);

    // Expenses
    csvData.push(['EXPENSE SUMMARY']);
    csvData.push(['Total Expenses', reportData.expenses.total.toFixed(2)]);
    csvData.push([]);
    csvData.push(['Category', 'Amount', 'Percentage']);
    reportData.expenses.breakdown.forEach(expense => {
      csvData.push([expense.category, expense.totalAmount.toFixed(2), expense.percentage.toFixed(1) + '%']);
    });
    csvData.push([]);

    // Savings
    csvData.push(['SAVINGS SUMMARY']);
    csvData.push(['Net Savings', reportData.savings.amount.toFixed(2)]);
    csvData.push(['Savings Rate', reportData.savings.rate.toFixed(1) + '%']);

    // Group data
    if (reportData.groupData) {
      csvData.push([]);
      csvData.push(['GROUP SUMMARY']);
      csvData.push(['Group Name', reportData.groupData.name]);
      csvData.push(['Members', reportData.groupData.members]);
      csvData.push(['Total Group Expenses', reportData.groupData.totalGroupExpenses.toFixed(2)]);
      csvData.push(['You are owed', reportData.groupData.userOwed.toFixed(2)]);
      csvData.push(['You owe', reportData.groupData.userOwes.toFixed(2)]);
    }

    // Convert to CSV string
    const csvContent = csvData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `financial-report-${reportData.period.start.toISOString().slice(0, 10)}-to-${reportData.period.end.toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Financial Report Generator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Report Configuration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-title">Report Title</Label>
                <Input
                  id="report-title"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Monthly Financial Report"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-type">Report Type</Label>
                <Select value={reportType} onValueChange={(value) => setReportType(value as ReportType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal Finance</SelectItem>
                    <SelectItem value="group" disabled={!activeGroup}>Group Finance</SelectItem>
                    <SelectItem value="comparison">Comparison Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="report-period">Time Period</Label>
                <Select value={reportPeriod} onValueChange={(value) => setReportPeriod(value as ReportPeriod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="week">Last 7 Days</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="quarter">This Quarter</SelectItem>
                    <SelectItem value="year">This Year</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reportPeriod === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="start-date">Start Date</Label>
                    <Input
                      id="start-date"
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-date">End Date</Label>
                    <Input
                      id="end-date"
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-2 mt-6">
                <Button onClick={generatePDFReport} disabled={isGenerating} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  {isGenerating ? 'Generating...' : 'Download PDF'}
                </Button>
                <Button variant="outline" onClick={generateCSVReport} className="flex-1">
                  <FileText className="w-4 h-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>

            {/* Report Preview */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Report Preview</h3>
              
              <div className="border rounded-lg p-4 space-y-4 bg-muted/10">
                <div className="text-center">
                  <h4 className="text-xl font-semibold">{reportData.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {reportData.period.start.toLocaleDateString()} - {reportData.period.end.toLocaleDateString()}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-3 border rounded">
                    <DollarSign className="w-6 h-6 mx-auto mb-1 text-green-500" />
                    <p className="text-sm text-muted-foreground">Income</p>
                    <p className="font-semibold">${reportData.income.total.toFixed(2)}</p>
                  </div>
                  <div className="p-3 border rounded">
                    <TrendingDown className="w-6 h-6 mx-auto mb-1 text-red-500" />
                    <p className="text-sm text-muted-foreground">Expenses</p>
                    <p className="font-semibold">${reportData.expenses.total.toFixed(2)}</p>
                  </div>
                  <div className="p-3 border rounded">
                    <TrendingUp className="w-6 h-6 mx-auto mb-1 text-blue-500" />
                    <p className="text-sm text-muted-foreground">Savings</p>
                    <p className="font-semibold">${reportData.savings.amount.toFixed(2)}</p>
                  </div>
                </div>

                {reportData.groupData && (
                  <div className="border-t pt-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4" />
                      <span className="font-medium">{reportData.groupData.name}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>You are owed: <span className="font-medium text-green-600">${reportData.groupData.userOwed.toFixed(2)}</span></div>
                      <div>You owe: <span className="font-medium text-red-600">${reportData.groupData.userOwes.toFixed(2)}</span></div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground text-center">
                  Report includes {reportData.income.breakdown.length} income sources and {reportData.expenses.breakdown.length} expense categories
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}