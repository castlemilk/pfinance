'use client';

import { forwardRef, useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { IncomeFrequency } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  Download,
  FileText,
  Loader2,
  Settings
} from 'lucide-react';

// Import from the metrics layer
import { useFinanceMetrics } from '../metrics/hooks/useFinanceMetrics';
import { SAVINGS_STATUS_CLASSES } from '../metrics/utils/colors';

// Import visualizations (dynamically loaded — heavy visx dependency)
import dynamic from 'next/dynamic';
const ExpenseSankey = dynamic(() => import('./ExpenseSankey'), { ssr: false });
const ExpenseChart = dynamic(() => import('./ExpenseChart'), { ssr: false });

// Import reports components
import { ExtraSettingsSummary, hasActiveSettings, type ExtraSettingsData } from './reports';

interface DashboardReportProps {
  onExport?: () => Promise<void>;
  isExporting?: boolean;
  showExportButton?: boolean;
  extraSettings?: ExtraSettingsData;
}

/**
 * DashboardReport - A unified dashboard view designed for PDF export
 * This component consolidates all key financial visualizations into a single,
 * print-friendly layout that can be captured and exported as a PDF.
 */
const DashboardReport = forwardRef<HTMLDivElement, DashboardReportProps>(
  function DashboardReport({ onExport, isExporting = false, showExportButton = true, extraSettings }, ref) {
    const { incomes, expenses, taxConfig } = useFinance();
    const [displayPeriod, setDisplayPeriod] = useState<IncomeFrequency>('monthly');

    // Use the metrics hook for computed values
    const { metrics, utils, periodLabel } = useFinanceMetrics(
      incomes,
      expenses,
      taxConfig,
      { displayPeriod }
    );

    // Extract key metrics
    const totalIncome = metrics.income.gross.value;
    const netIncome = metrics.income.net.value;
    const totalExpenses = metrics.expenses.total.value;
    const savingsAmount = metrics.savings.amount.value;
    const savingsRate = metrics.savings.rate;
    const savingsStatus = metrics.savings.status;
    const taxAmount = metrics.tax.amount.value;

    // Color classes for savings status
    const savingsStatusColors = SAVINGS_STATUS_CLASSES;

    // Format currency
    const formatCurrency = (amount: number) => utils.formatCurrency(amount);

    // Generate report date
    const reportDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    return (
      <div className="space-y-6">
        {/* Export Controls - Hidden during export */}
        {showExportButton && (
          <div className="flex items-center justify-between no-print">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-bold">Financial Dashboard Report</h2>
              <Select
                value={displayPeriod}
                onValueChange={(value) => setDisplayPeriod(value as IncomeFrequency)}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="fortnightly">Fortnightly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {onExport && (
              <Button onClick={onExport} disabled={isExporting} size="lg">
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export as PDF
                  </>
                )}
              </Button>
            )}
          </div>
        )}

        {/* Exportable Content - This div is captured for PDF */}
        <div 
          ref={ref}
          className="space-y-6 bg-background p-6 rounded-lg export-container"
          style={{ minWidth: '800px' }}
        >
          {/* Report Header */}
          <div className="text-center pb-4 border-b">
            <div className="flex items-center justify-center gap-3 mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src="/logo.png" 
                alt="PFinance Logo" 
                width={48} 
                height={48}
                className="rounded-lg"
              />
              <h1 className="text-3xl font-bold text-foreground">PFinance Report</h1>
            </div>
            <p className="text-muted-foreground mt-1">{periodLabel} Financial Summary</p>
            <p className="text-sm text-muted-foreground">Generated on {reportDate}</p>
          </div>

          {/* Summary Metrics Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Total Income */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-full bg-green-100 dark:bg-green-900 shrink-0">
                    <DollarSign className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Income</span>
                </div>
                <p className="text-xl lg:text-2xl font-bold truncate" title={formatCurrency(totalIncome)}>
                  {formatCurrency(totalIncome)}
                </p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </CardContent>
            </Card>

            {/* Net Income */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-full bg-amber-100 dark:bg-amber-900/50 shrink-0">
                    <TrendingUp className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Net Income</span>
                </div>
                <p className="text-xl lg:text-2xl font-bold truncate" title={formatCurrency(netIncome)}>
                  {formatCurrency(netIncome)}
                </p>
                {taxAmount > 0 && (
                  <p className="text-xs text-[#D16A47] truncate" title={`-${formatCurrency(taxAmount)} tax`}>
                    -{formatCurrency(taxAmount)} tax
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Total Expenses */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-full bg-red-100 dark:bg-red-900 shrink-0">
                    <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expenses</span>
                </div>
                <p className="text-xl lg:text-2xl font-bold truncate" title={formatCurrency(totalExpenses)}>
                  {formatCurrency(totalExpenses)}
                </p>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </CardContent>
            </Card>

            {/* Savings */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-full bg-[#87A96B]/20 dark:bg-[#A0C080]/20 shrink-0">
                    <PiggyBank className="w-4 h-4 text-[#87A96B] dark:text-[#A0C080]" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Savings</span>
                </div>
                <p className={`text-xl lg:text-2xl font-bold truncate ${savingsStatusColors[savingsStatus]}`} title={formatCurrency(savingsAmount)}>
                  {formatCurrency(savingsAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {savingsRate.toFixed(1)}% savings rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Flow Diagram Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Income Flow Visualization
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ExpenseSankey displayPeriod={displayPeriod} />
              </div>
            </CardContent>
          </Card>

          {/* Expense Breakdown Section */}
          <Card>
            <CardHeader>
              <CardTitle>Expense Breakdown by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[350px] overflow-hidden">
                <ExpenseChart displayPeriod={displayPeriod} />
              </div>
            </CardContent>
          </Card>

          {/* Financial Summary Table */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Financial Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="font-medium">Metric</span>
                  <span className="font-medium">Amount ({periodLabel})</span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Gross Income</span>
                  <span className="font-medium">{formatCurrency(totalIncome)}</span>
                </div>
                
                {taxAmount > 0 && (
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Tax ({metrics.tax.effectiveRate.toFixed(1)}% effective)</span>
                    <span className="font-medium text-red-500">-{formatCurrency(taxAmount)}</span>
                  </div>
                )}
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Net Income (after tax)</span>
                  <span className="font-medium">{formatCurrency(netIncome)}</span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Total Expenses</span>
                  <span className="font-medium text-red-500">-{formatCurrency(totalExpenses)}</span>
                </div>
                
                <div className="flex justify-between items-center py-2 border-t font-semibold">
                  <span>Net Savings</span>
                  <span className={savingsStatusColors[savingsStatus]}>
                    {formatCurrency(savingsAmount)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center py-2">
                  <span className="text-muted-foreground">Savings Rate</span>
                  <span className={`font-medium ${savingsStatusColors[savingsStatus]}`}>
                    {savingsRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Financial Configuration - Only show if extraSettings has active items */}
          {extraSettings && hasActiveSettings(extraSettings) && (
            <Card className="break-inside-avoid">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Financial Configuration
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ExtraSettingsSummary
                  settings={extraSettings}
                  formatCurrency={formatCurrency}
                />
              </CardContent>
            </Card>
          )}

          {/* Expense Categories Breakdown */}
          {metrics.expenses.topCategories.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Expense Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {metrics.expenses.topCategories.map((cat) => (
                    <div 
                      key={cat.category}
                      className="p-3 border rounded-lg"
                    >
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium">{cat.category}</span>
                        <span className="text-xs text-muted-foreground">
                          {cat.percentageOfTotal.toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-lg font-semibold">
                        {formatCurrency(cat.amount.value)}
                      </p>
                      <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                        <div 
                          className="bg-primary h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, cat.percentageOfTotal)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Report Footer */}
          <div className="text-center pt-4 border-t text-sm text-muted-foreground">
            <p>Generated by PFinance • {reportDate}</p>
            <p className="text-xs mt-1">This report reflects your financial data as of the generation date.</p>
          </div>
        </div>
      </div>
    );
  }
);

export default DashboardReport;
