/**
 * StudentLoanSettings - Student loan (HELP/HECS) settings with repayment projections
 */

'use client';

import { useMemo, useState } from 'react';
import { TaxSettings } from '@/app/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon, TrendingDownIcon, CalendarIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { ATO_STUDENT_LOAN_URL, HELP_REPAYMENT_THRESHOLDS } from '../constants';

// CPI Indexation rate for HELP debt (historical average ~3%)
const DEFAULT_INDEXATION_RATE = 3;

interface StudentLoanSettingsProps {
  taxSettings: TaxSettings;
  onTaxSettingChange: (setting: keyof TaxSettings, value: boolean | number) => void;
  studentLoanRepayment: number;
  studentLoanRate: string;
  taxableIncome: number;
  loanBalance: number;
  onLoanBalanceChange: (balance: number) => void;
  formatCurrency: (amount: number) => string;
}

export function StudentLoanSettings({
  taxSettings,
  onTaxSettingChange,
  studentLoanRepayment,
  studentLoanRate,
  taxableIncome,
  loanBalance,
  onLoanBalanceChange,
  formatCurrency,
}: StudentLoanSettingsProps) {
  const [showProjection, setShowProjection] = useState(false);
  const [salaryGrowth, setSalaryGrowth] = useState(3); // 3% default
  const [indexationRate, setIndexationRate] = useState(DEFAULT_INDEXATION_RATE);
  
  const isActive = taxSettings.includeStudentLoan;

  // Calculate repayment projection
  const projection = useMemo(() => {
    if (!isActive || loanBalance <= 0 || studentLoanRepayment <= 0) {
      return null;
    }

    const years: Array<{
      year: number;
      startBalance: number;
      indexation: number;
      repayment: number;
      endBalance: number;
      income: number;
    }> = [];

    let balance = loanBalance;
    let income = taxableIncome;
    let year = 1;
    const maxYears = 30;

    while (balance > 0 && year <= maxYears) {
      // Apply indexation first (on 1st June each year)
      const indexation = balance * (indexationRate / 100);
      const balanceAfterIndexation = balance + indexation;

      // Calculate repayment based on income
      const threshold = HELP_REPAYMENT_THRESHOLDS.find(
        (t) => income >= t.min && income <= t.max
      );
      const repayment = threshold ? income * threshold.rate : 0;

      const endBalance = Math.max(0, balanceAfterIndexation - repayment);

      years.push({
        year,
        startBalance: balance,
        indexation,
        repayment,
        endBalance,
        income,
      });

      balance = endBalance;
      income = income * (1 + salaryGrowth / 100);
      year++;
    }

    return {
      years,
      totalYears: years.length,
      totalRepaid: years.reduce((sum, y) => sum + y.repayment, 0),
      totalIndexation: years.reduce((sum, y) => sum + y.indexation, 0),
      paidOff: balance === 0,
    };
  }, [isActive, loanBalance, studentLoanRepayment, taxableIncome, salaryGrowth, indexationRate]);

  const getSummary = () => {
    if (!isActive) return 'No loan';
    if (studentLoanRepayment === 0) return 'Below threshold';
    if (loanBalance > 0 && projection) {
      return `${formatCurrency(loanBalance)} debt, ~${projection.totalYears} years`;
    }
    return `${formatCurrency(studentLoanRepayment)}/year (${studentLoanRate})`;
  };

  // Find the current and next threshold
  const currentThreshold = HELP_REPAYMENT_THRESHOLDS.find(
    (t) => taxableIncome >= t.min && taxableIncome <= t.max
  );
  const currentIndex = currentThreshold 
    ? HELP_REPAYMENT_THRESHOLDS.indexOf(currentThreshold)
    : 0;
  const nextThreshold = currentIndex < HELP_REPAYMENT_THRESHOLDS.length - 1
    ? HELP_REPAYMENT_THRESHOLDS[currentIndex + 1]
    : null;

  return (
    <SettingsSection
      id="student-loan"
      title="Student Loan"
      summary={getSummary()}
      isActive={isActive && studentLoanRepayment > 0}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          HELP, HECS-HELP, FEE-HELP, VET Student Loan, and other study loans are repaid through the tax system once your income exceeds the threshold.
        </p>

        {/* Student Loan Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="include-student-loan"
              checked={taxSettings.includeStudentLoan}
              onCheckedChange={(checked) => onTaxSettingChange('includeStudentLoan', checked)}
            />
            <Label htmlFor="include-student-loan" className="font-medium">
              I have a student loan
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p>Includes HELP, HECS-HELP, FEE-HELP, VET Student Loans, SA-HELP, TSL, SSL, and SFSS.</p>
                  <p className="mt-2">Repayment rates range from 1% to 10% based on your income.</p>
                  <a
                    href={ATO_STUDENT_LOAN_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline mt-2 block"
                  >
                    ATO: Study and training support loans
                  </a>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Loan Balance Input */}
        {isActive && (
          <div>
            <Label className="text-sm">Current Loan Balance ($)</Label>
            <Input
              type="number"
              value={loanBalance || ''}
              onChange={(e) => onLoanBalanceChange(parseFloat(e.target.value) || 0)}
              className="mt-1"
              min="0"
              step="1000"
              placeholder="e.g. 45000"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Check your balance on <a href="https://my.gov.au" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">myGov</a>
            </p>
          </div>
        )}

        {/* Repayment Information */}
        {isActive && (
          <div className="space-y-3 pl-8 border-l-2 border-muted ml-2">
            {/* Current Rate Box */}
            <div className="bg-muted/50 p-4 rounded-lg">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Current Rate</span>
                  <div className="font-semibold text-lg">{studentLoanRate}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Annual Repayment</span>
                  <div className="font-semibold text-lg">{formatCurrency(studentLoanRepayment)}</div>
                </div>
              </div>
              
              {studentLoanRepayment > 0 && (
                <div className="mt-3 pt-3 border-t text-sm text-muted-foreground">
                  {formatCurrency(studentLoanRepayment / 26)} per fortnight withheld
                </div>
              )}
            </div>

            {/* Threshold Information */}
            {studentLoanRepayment === 0 && currentThreshold && (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 rounded-lg text-sm">
                <p className="text-green-800 dark:text-green-200">
                  Your income ({formatCurrency(taxableIncome)}) is below the repayment threshold of {formatCurrency(currentThreshold.max)}.
                  No repayments required.
                </p>
              </div>
            )}

            {nextThreshold && studentLoanRepayment > 0 && (
              <div className="text-xs text-muted-foreground">
                Next threshold: At {formatCurrency(nextThreshold.min)}, rate increases to {(nextThreshold.rate * 100).toFixed(1)}%
              </div>
            )}

            {/* Repayment Projection */}
            {loanBalance > 0 && projection && (
              <div className="space-y-3">
                {/* Projection Summary */}
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDownIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-medium">Repayment Projection</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Debt Free In</span>
                      <div className="font-semibold text-lg flex items-center gap-2">
                        ~{projection.totalYears} years
                        {projection.paidOff && <Badge variant="outline" className="text-green-600">Paid Off</Badge>}
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Total Repaid</span>
                      <div className="font-semibold text-lg">{formatCurrency(projection.totalRepaid)}</div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Total indexation (interest):</span>
                      <span>{formatCurrency(projection.totalIndexation)}</span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span>Extra paid due to indexation:</span>
                      <span>{formatCurrency(projection.totalRepaid - loanBalance)}</span>
                    </div>
                  </div>
                </div>

                {/* Projection Settings */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    Projection Settings
                  </summary>
                  <div className="mt-3 space-y-4 pl-4 border-l-2 border-muted">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <Label>Annual Salary Growth</Label>
                        <span>{salaryGrowth}%</span>
                      </div>
                      <Slider
                        value={[salaryGrowth]}
                        onValueChange={([value]) => setSalaryGrowth(value)}
                        min={0}
                        max={10}
                        step={0.5}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <Label>Indexation Rate (CPI)</Label>
                        <span>{indexationRate}%</span>
                      </div>
                      <Slider
                        value={[indexationRate]}
                        onValueChange={([value]) => setIndexationRate(value)}
                        min={0}
                        max={10}
                        step={0.5}
                        className="w-full"
                      />
                    </div>
                  </div>
                </details>

                {/* Year-by-Year Projection Table */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View year-by-year projection
                  </summary>
                  <div className="mt-2 max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="text-left py-1">Year</th>
                          <th className="text-right py-1">Balance</th>
                          <th className="text-right py-1">Index</th>
                          <th className="text-right py-1">Repay</th>
                          <th className="text-right py-1">End</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projection.years.map((year) => (
                          <tr key={year.year} className="border-b border-muted">
                            <td className="py-1">{year.year}</td>
                            <td className="text-right py-1">${Math.round(year.startBalance).toLocaleString()}</td>
                            <td className="text-right py-1 text-red-500">+${Math.round(year.indexation).toLocaleString()}</td>
                            <td className="text-right py-1 text-green-600">-${Math.round(year.repayment).toLocaleString()}</td>
                            <td className="text-right py-1 font-medium">${Math.round(year.endBalance).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            {/* Repayment Thresholds Table (collapsed by default) */}
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View all repayment thresholds
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b">
                      <th className="text-left py-1">Income</th>
                      <th className="text-right py-1">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {HELP_REPAYMENT_THRESHOLDS.map((threshold, index) => (
                      <tr 
                        key={index} 
                        className={`border-b border-muted ${
                          currentThreshold === threshold ? 'bg-amber-50 dark:bg-amber-950/30' : ''
                        }`}
                      >
                        <td className="py-1">
                          {threshold.max === Infinity 
                            ? `$${threshold.min.toLocaleString()}+`
                            : `$${threshold.min.toLocaleString()} - $${threshold.max.toLocaleString()}`
                          }
                        </td>
                        <td className="text-right py-1">
                          {(threshold.rate * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
