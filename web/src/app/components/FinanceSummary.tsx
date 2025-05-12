'use client';

import { useState, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { IncomeFrequency } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

export default function FinanceSummary() {
  const { 
    getTotalIncome, 
    getNetIncome, 
    getTotalExpenses, 
    taxConfig,
    incomes 
  } = useFinance();
  
  const [displayPeriod, setDisplayPeriod] = useState<IncomeFrequency>('monthly');
  
  // Format amount to currency
  const formatCurrency = (amount: number, country = taxConfig.country) => {
    // Get currency code from tax system
    const currencyCode = getTaxSystem(country).currency;
    
    return new Intl.NumberFormat('en', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const totalIncome = getTotalIncome(displayPeriod);
  const netIncome = getNetIncome(displayPeriod);
  const totalExpenses = getTotalExpenses();
  // Simple conversion of total expenses to match display period
  const adjustedExpenses = 
    displayPeriod === 'annually' ? totalExpenses : 
    displayPeriod === 'monthly' ? totalExpenses / 12 :
    displayPeriod === 'fortnightly' ? totalExpenses / 26 :
    totalExpenses / 52;
  
  const savingsAmount = netIncome - adjustedExpenses;
  // Ensure savings rate is a valid number
  const savingsRate = totalIncome > 0 ? (savingsAmount / totalIncome) * 100 : 0;
  
  // Ensure the displayed savings rate is never NaN 
  const displaySavingsRate = isNaN(savingsRate) ? 0 : savingsRate;
  
  // Tax amount
  const taxAmount = totalIncome - netIncome;
  
  // Calculate effective tax rate (properly handling progressive tax systems)
  const getEffectiveTaxRate = () => {
    if (!taxConfig.enabled) return 0;
    if (totalIncome <= 0 || taxAmount <= 0) return 0;
    
    // For simple tax system, the effective rate equals the flat rate
    if (taxConfig.country === 'simple') {
      return taxConfig.taxRate;
    }
    
    // For progressive tax systems, calculate based on actual tax amount
    const rate = (taxAmount / totalIncome) * 100;
    return isNaN(rate) ? 0 : rate;
  };

  const effectiveTaxRate = getEffectiveTaxRate();
  
  // Deductions calculation
  const deductionsInfo = useMemo(() => {
    let totalDeductionAmount = 0;
    let taxDeductibleAmount = 0;
    let count = 0;
    
    incomes.forEach(income => {
      if (income.deductions && income.deductions.length > 0) {
        count += income.deductions.length;
        
        // Convert deduction amounts based on frequency
        const frequencyFactor = 
          income.frequency === 'weekly' ? 52 : 
          income.frequency === 'fortnightly' ? 26 : 
          income.frequency === 'monthly' ? 12 : 1;
          
        const targetFactor = 
          displayPeriod === 'weekly' ? 52 : 
          displayPeriod === 'fortnightly' ? 26 : 
          displayPeriod === 'monthly' ? 12 : 1;
          
        income.deductions.forEach(deduction => {
          // Convert to annual then to target period
          const annualAmount = deduction.amount * frequencyFactor;
          const periodAmount = annualAmount / targetFactor;
          
          totalDeductionAmount += periodAmount;
          if (deduction.isTaxDeductible) {
            taxDeductibleAmount += periodAmount;
          }
        });
      }
    });
    
    return {
      count,
      totalAmount: totalDeductionAmount,
      taxDeductibleAmount
    };
  }, [incomes, displayPeriod]);
  
  // Determine savings status
  const getSavingsStatus = () => {
    if (displaySavingsRate >= 20) return "excellent";
    if (displaySavingsRate >= 10) return "good";
    if (displaySavingsRate >= 0) return "fair";
    return "poor";
  };
  
  const savingsStatus = getSavingsStatus();
  const savingsStatusColors: Record<string, string> = {
    excellent: "text-green-600",
    good: "text-emerald-500",
    fair: "text-amber-500",
    poor: "text-red-500"
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Financial Summary</CardTitle>
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
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="flow">Flow</TabsTrigger>
          </TabsList>
          <TabsContent value="summary" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground">Income</h3>
                <p className="text-2xl font-bold">{formatCurrency(totalIncome)}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {displayPeriod}
                  {taxConfig.country !== 'simple' && (
                    <span role="img" aria-label={taxConfig.country} className="ml-1">
                      {countryFlags[taxConfig.country]}
                    </span>
                  )}
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground">Expenses</h3>
                <p className="text-2xl font-bold">{formatCurrency(adjustedExpenses)}</p>
                <p className="text-xs text-muted-foreground">{displayPeriod}</p>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="text-sm font-medium text-muted-foreground">Savings</h3>
                <p className={`text-2xl font-bold ${savingsStatusColors[savingsStatus]}`}>
                  {formatCurrency(savingsAmount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {displaySavingsRate.toFixed(1)}% of income
                </p>
              </div>
            </div>
          </TabsContent>
          <TabsContent value="details" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Income:</span>
                <span className="font-medium">{formatCurrency(totalIncome)}</span>
              </div>
              {taxConfig.enabled && totalIncome > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground flex items-center gap-1">
                    {taxConfig.country !== 'simple' && (
                      <span role="img" aria-label={taxConfig.country} className="text-sm">
                        {countryFlags[taxConfig.country]}
                      </span>
                    )}
                    {taxConfig.country === 'simple' 
                      ? `Tax (${taxConfig.taxRate}%):`
                      : `${getTaxSystem(taxConfig.country).name} Tax (${!isNaN(effectiveTaxRate) ? effectiveTaxRate.toFixed(1) : '0.0'}% effective):`}
                  </span>
                  <span className="font-medium text-red-500">-{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {deductionsInfo.count > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    Deductions ({deductionsInfo.count}):
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
                    Tax based on annual income: {formatCurrency(
                      displayPeriod === 'annually' ? totalIncome :
                      displayPeriod === 'monthly' ? totalIncome * 12 :
                      displayPeriod === 'fortnightly' ? totalIncome * 26 :
                      totalIncome * 52
                    )}
                  </span>
                </div>
              )}
            </div>
          </TabsContent>
          <TabsContent value="flow" className="mt-4">
            <div className="p-2">
              <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                Income Flow Visualization
                {taxConfig.enabled && taxConfig.country !== 'simple' && (
                  <span className="flex items-center text-xs text-muted-foreground gap-1">
                    using
                    <span role="img" aria-label={taxConfig.country}>
                      {countryFlags[taxConfig.country]}
                    </span>
                    {getTaxSystem(taxConfig.country).name} tax system
                  </span>
                )}
              </h3>
              <FinanceFlowDiagram displayPeriod={displayPeriod} />
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