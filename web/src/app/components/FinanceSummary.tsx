'use client';

import { useState } from 'react';
import { useFinance } from '../context/FinanceContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { IncomeFrequency } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import FinanceFlowDiagram from './FinanceFlowDiagram';
import { getTaxSystem } from '../constants/taxSystems';
import { countryFlags } from './TaxConfig';

// Import from the new metrics layer
import { useFinanceMetrics } from '../metrics/hooks/useFinanceMetrics';
import { SAVINGS_STATUS_CLASSES } from '../metrics/utils/colors';

interface FinanceSummaryProps {
  mode?: 'personal' | 'shared';
  groupId?: string;
}

// Loading skeleton for the summary cards
function SummarySkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="p-3 sm:p-4 border rounded-lg bg-background">
          <Skeleton className="h-4 w-16 mb-2" />
          <Skeleton className="h-8 w-24 mb-1" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export default function FinanceSummary({ mode = 'personal', groupId }: FinanceSummaryProps) {
  const {
    incomes,
    expenses,
    taxConfig,
    loading
  } = useFinance();

  const { groupExpenses, groupIncomes } = useMultiUserFinance();

  const [displayPeriod, setDisplayPeriod] = useState<IncomeFrequency>('monthly');

  // Use the new metrics hook for personal mode
  const { metrics, utils } = useFinanceMetrics(
    incomes,
    expenses,
    taxConfig,
    { displayPeriod }
  );

  // For shared mode, we still use the old calculation (can be migrated later)
  const isSharedMode = mode === 'shared' && groupId;

  // Get values from metrics (personal) or calculate for shared
  const totalIncome = isSharedMode
    ? groupIncomes.filter(i => i.groupId === groupId).reduce((sum, i) => sum + i.amount, 0)
    : metrics.income.gross.value;

  const netIncome = isSharedMode
    ? totalIncome // No tax calc for groups yet
    : metrics.income.net.value;

  const adjustedExpenses = isSharedMode
    ? groupExpenses.filter(e => e.groupId === groupId).reduce((sum, e) => sum + e.amount, 0)
    : metrics.expenses.total.value;

  const savingsAmount = isSharedMode
    ? netIncome - adjustedExpenses
    : metrics.savings.amount.value;

  const savingsRate = isSharedMode
    ? (totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0)
    : metrics.savings.rate;

  const displaySavingsRate = isNaN(savingsRate) ? 0 : savingsRate;

  const taxAmount = isSharedMode
    ? 0
    : metrics.tax.amount.value;

  const effectiveTaxRate = isSharedMode
    ? 0
    : metrics.tax.effectiveRate;

  // Savings status from metrics
  const savingsStatus = isSharedMode
    ? (displaySavingsRate >= 20 ? 'excellent' : displaySavingsRate >= 10 ? 'good' : displaySavingsRate >= 0 ? 'fair' : 'poor')
    : metrics.savings.status;

  // Use centralized color classes
  const savingsStatusColors = SAVINGS_STATUS_CLASSES;

  // Format currency using metrics utils
  const formatCurrency = (amount: number) => {
    return utils.formatCurrency(amount);
  };

  // Deductions from metrics
  const deductionsInfo = {
    count: metrics.income.sources.reduce((count, s) => count + (s.isPreTax ? 0 : 0), 0), // Simplified
    totalAmount: metrics.income.deductions.value,
    taxDeductibleAmount: metrics.tax.deductibleAmount.value,
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
        <CardTitle className="text-lg sm:text-xl">Financial Summary</CardTitle>
        <Select
          value={displayPeriod}
          onValueChange={(value) => setDisplayPeriod(value as IncomeFrequency)}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="fortnightly">Fortnightly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="annually">Annually</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary" className="text-xs sm:text-sm">Summary</TabsTrigger>
            <TabsTrigger value="details" className="text-xs sm:text-sm">Details</TabsTrigger>
            <TabsTrigger value="flow" className="text-xs sm:text-sm">Flow</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="space-y-4 mt-4">
            {loading ? (
              <SummarySkeleton />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 sm:p-4 border rounded-lg bg-background">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Income</h3>
                  <p className="text-xl sm:text-2xl font-bold">{formatCurrency(totalIncome)}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    {displayPeriod}
                    {taxConfig.country !== 'simple' && (
                      <span role="img" aria-label={taxConfig.country} className="ml-1">
                        {countryFlags[taxConfig.country as keyof typeof countryFlags]}
                      </span>
                    )}
                  </p>
                </div>
                <div className="p-3 sm:p-4 border rounded-lg bg-background">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Expenses</h3>
                  <p className="text-xl sm:text-2xl font-bold">{formatCurrency(adjustedExpenses)}</p>
                  <p className="text-xs text-muted-foreground">{displayPeriod}</p>
                </div>
                <div className="p-3 sm:p-4 border rounded-lg bg-background">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Savings</h3>
                  <p className={`text-xl sm:text-2xl font-bold ${savingsStatusColors[savingsStatus]}`}>
                    {formatCurrency(savingsAmount)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {displaySavingsRate.toFixed(1)}% of income
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="space-y-2 text-sm sm:text-base">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Income:</span>
                <span className="font-medium">{formatCurrency(totalIncome)}</span>
              </div>
              {taxConfig.enabled && totalIncome > 0 && (
                <div className="flex justify-between items-center gap-2">
                  <span className="text-muted-foreground flex items-center gap-1 min-w-0 text-xs sm:text-sm">
                    {taxConfig.country !== 'simple' && (
                      <span role="img" aria-label={taxConfig.country} className="text-sm shrink-0">
                        {countryFlags[taxConfig.country as keyof typeof countryFlags]}
                      </span>
                    )}
                    <span className="truncate">
                      {taxConfig.country === 'simple'
                        ? `Tax (${taxConfig.taxRate}%):`
                        : `${getTaxSystem(taxConfig.country).name} Tax (${effectiveTaxRate.toFixed(1)}%):`}
                    </span>
                  </span>
                  <span className="font-medium text-red-500 shrink-0">-{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {deductionsInfo.totalAmount > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    Deductions:
                  </span>
                  <span className="font-medium text-amber-500">-{formatCurrency(deductionsInfo.totalAmount)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Net Income:</span>
                <span className="font-medium">{formatCurrency(netIncome)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Expenses:</span>
                <span className="font-medium text-red-500">-{formatCurrency(adjustedExpenses)}</span>
              </div>
              <div className="h-px bg-border my-2"></div>
              <div className="flex justify-between items-center font-semibold">
                <span>Net Savings:</span>
                <span className={savingsStatusColors[savingsStatus]}>
                  {formatCurrency(savingsAmount)}
                </span>
              </div>
              {taxConfig.enabled && taxConfig.country !== 'simple' && totalIncome > 0 && (
                <div className="flex justify-between items-center text-xs text-muted-foreground mt-1 mb-2">
                  <span>
                    Tax based on annual income: {formatCurrency(metrics.income.gross.annualized)}
                  </span>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="flow" className="mt-4">
            <div className="p-1 sm:p-2">
              <h3 className="text-sm font-medium mb-4 flex flex-wrap items-center gap-2">
                Income Flow Visualization
                {taxConfig.enabled && taxConfig.country !== 'simple' && (
                  <span className="flex items-center text-xs text-muted-foreground gap-1">
                    using
                    <span role="img" aria-label={taxConfig.country}>
                      {countryFlags[taxConfig.country as keyof typeof countryFlags]}
                    </span>
                    {getTaxSystem(taxConfig.country).name} tax system
                  </span>
                )}
              </h3>
              <div className="overflow-x-auto -mx-1 sm:-mx-2">
                <div className="min-w-[320px]">
                  <FinanceFlowDiagram displayPeriod={displayPeriod} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                The flow diagram shows how income is distributed across expenses, taxes, and savings.
                {taxConfig.enabled && taxConfig.country !== 'simple' && (
                  <span> Tax is calculated using {getTaxSystem(taxConfig.country).name} progressive tax brackets.</span>
                )}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
