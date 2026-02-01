/**
 * SummaryPanel - Results display with frequency tabs
 */

'use client';

import { useState } from 'react';
import { TaxSettings, IncomeFrequency } from '@/app/types';
import { SalaryBreakdown, SalarySacrificeCalculation } from './types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { SaveIncomeModal } from './SaveIncomeModal';

interface SummaryPanelProps {
  breakdowns: SalaryBreakdown[];
  taxSettings: TaxSettings;
  salarySacrificeCalculation: SalarySacrificeCalculation;
  superannuation: number;
  studentLoanRate: string;
  lito: number;
  formatCurrency: (amount: number) => string;
}

export function SummaryPanel({
  breakdowns,
  taxSettings,
  salarySacrificeCalculation,
  superannuation,
  studentLoanRate,
  lito,
  formatCurrency,
}: SummaryPanelProps) {
  const [activeTab, setActiveTab] = useState<string>('annually');
  
  const convertToFrequency = (annualAmount: number, frequency: IncomeFrequency): number => {
    if (frequency === 'weekly') return annualAmount / 52;
    if (frequency === 'fortnightly') return annualAmount / 26;
    if (frequency === 'monthly') return annualAmount / 12;
    return annualAmount;
  };

  // Get the currently selected breakdown for the save modal
  const activeBreakdown = breakdowns.find(b => b.frequency === activeTab) || breakdowns[0];

  return (
    <Card className="sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="annually" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="weekly" className="text-xs">Weekly</TabsTrigger>
            <TabsTrigger value="fortnightly" className="text-xs">Fortnightly</TabsTrigger>
            <TabsTrigger value="monthly" className="text-xs">Monthly</TabsTrigger>
            <TabsTrigger value="annually" className="text-xs">Annually</TabsTrigger>
          </TabsList>
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="daily" className="text-xs">Daily</TabsTrigger>
            <TabsTrigger value="hourly" className="text-xs">Hourly</TabsTrigger>
          </TabsList>

          {breakdowns.map((breakdown) => (
            <TabsContent key={breakdown.frequency} value={breakdown.frequency} className="space-y-4 mt-0">
              {/* Net Pay Highlight */}
              <div className="bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30 p-4 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="text-sm text-muted-foreground mb-1">Take-home Pay</div>
                <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(breakdown.netIncome)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  per {breakdown.frequency.replace('ly', '').replace('annual', 'year')}
                </div>
              </div>

              {/* Income Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Taxable Income
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Base Salary</span>
                    <span className="font-medium">{formatCurrency(breakdown.baseSalary)}</span>
                  </div>
                  {breakdown.overtime > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>+ Overtime</span>
                      <span>{formatCurrency(breakdown.overtime)}</span>
                    </div>
                  )}
                  {breakdown.taxDeductibleSacrifice > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>- Salary Sacrifice</span>
                      <span>-{formatCurrency(breakdown.taxDeductibleSacrifice)}</span>
                    </div>
                  )}
                  {taxSettings.includeVoluntarySuper && breakdown.voluntarySuper > 0 && (
                    <div className="flex justify-between text-amber-600 dark:text-amber-400">
                      <span>- Voluntary Super</span>
                      <span>-{formatCurrency(breakdown.voluntarySuper)}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between font-medium">
                    <span>Taxable Income</span>
                    <span>
                      {formatCurrency(
                        breakdown.grossIncome - breakdown.taxDeductibleSacrifice - 
                        (taxSettings.includeVoluntarySuper ? breakdown.voluntarySuper : 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Deductions Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                  Tax & Deductions
                </h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between text-red-600 dark:text-red-400">
                    <span>Income Tax</span>
                    <span>-{formatCurrency(breakdown.tax)}</span>
                  </div>
                  {lito > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span>LITO (Low Income Tax Offset)</span>
                      <span>Included</span>
                    </div>
                  )}
                  {taxSettings.includeMedicare && !taxSettings.medicareExemption && !taxSettings.includePrivateHealth && (
                    <div className="flex justify-between text-red-600 dark:text-red-400">
                      <span>Medicare Levy (2%)</span>
                      <span>-{formatCurrency(breakdown.medicare)}</span>
                    </div>
                  )}
                  {taxSettings.includeStudentLoan && breakdown.studentLoan > 0 && (
                    <div className="flex justify-between text-red-600 dark:text-red-400">
                      <span>Student Loan ({studentLoanRate})</span>
                      <span>-{formatCurrency(breakdown.studentLoan)}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex justify-between font-medium text-red-600 dark:text-red-400">
                    <span>Total Deductions</span>
                    <span>
                      -{formatCurrency(breakdown.tax + breakdown.medicare + breakdown.studentLoan)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Salary Package (if applicable) */}
              {salarySacrificeCalculation.totalSalarySacrifice > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                    Salary Package
                  </h4>
                  <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg border border-blue-200 dark:border-blue-800 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Package Card</span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        +{formatCurrency(convertToFrequency(salarySacrificeCalculation.totalSalarySacrifice, breakdown.frequency))}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-medium">
                      <span>Effective Income</span>
                      <span>
                        {formatCurrency(
                          breakdown.netIncome + 
                          convertToFrequency(salarySacrificeCalculation.totalSalarySacrifice, breakdown.frequency)
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Super Section */}
              {taxSettings.includeSuper && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                    Superannuation
                  </h4>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Employer Super ({taxSettings.superRate}%)</span>
                      <span>{formatCurrency(breakdown.superannuation)}</span>
                    </div>
                    {taxSettings.includeVoluntarySuper && breakdown.voluntarySuper > 0 && (
                      <div className="flex justify-between">
                        <span>+ Voluntary Contributions</span>
                        <span>{formatCurrency(breakdown.voluntarySuper)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Total Package Value */}
              <div className="pt-3 border-t">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Package Value</span>
                  <span className="font-medium">
                    {formatCurrency(
                      breakdown.grossIncome + 
                      breakdown.superannuation + 
                      breakdown.fringeBenefits
                    )}
                  </span>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
      <CardFooter className="pt-0 pb-4">
        <SaveIncomeModal 
          breakdown={activeBreakdown} 
          formatCurrency={formatCurrency}
        />
      </CardFooter>
    </Card>
  );
}
