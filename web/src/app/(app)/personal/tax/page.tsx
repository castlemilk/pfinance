'use client';

import { useState, useMemo, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProFeatureGate, UpgradePrompt } from '../../../components/ProFeatureGate';
import { useFinance } from '../../../context/FinanceContext';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../../context/AuthWithAdminContext';
import {
  TAX_YEAR_OPTIONS,
  TaxYear,
  DEFAULT_TAX_YEAR,
  calculateTaxWithBrackets,
  getAustralianBrackets,
  calculateLITO,
} from '../../../constants/taxSystems';
import {
  TAX_DEDUCTION_CATEGORIES,
  getCategoryLabel,
  getCurrentAustralianFY,
  getFYDateRange,
} from '../../../constants/taxDeductions';
import { TaxDeductionCategory } from '@/gen/pfinance/v1/types_pb';
import {
  AlertCircle,
  Download,
  DollarSign,
  Receipt,
  Calculator,
  TrendingDown,
  Sparkles,
  FileJson,
  FileSpreadsheet,
  Landmark,
  Loader2,
} from 'lucide-react';

// ============================================================================
// Shared Helpers
// ============================================================================

function isSubscriptionError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('pro subscription') ||
    lower.includes('pro tier') ||
    lower.includes('requires a pro');
}

function ErrorBanner({ message }: { message: string }) {
  if (isSubscriptionError(message)) {
    return <UpgradePrompt feature="Tax Returns" />;
  }
  return (
    <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  );
}

function LoadingSkeleton() {
  return <Skeleton className="h-[400px] w-full" />;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCurrencyDetailed(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ============================================================================
// Tab: Summary
// ============================================================================

function SummaryTab() {
  const { user } = useAuth();
  const [fy, setFy] = useState<TaxYear>(getCurrentAustralianFY());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [taxData, setTaxData] = useState<{
    grossIncome: number;
    totalDeductions: number;
    taxableIncome: number;
    baseTax: number;
    medicareLevy: number;
    helpRepayment: number;
    lito: number;
    totalTax: number;
    effectiveRate: number;
    taxWithheld: number;
    refundOrOwed: number;
    deductions: Array<{ category: number; totalAmount: number; expenseCount: number }>;
  } | null>(null);

  const loadTaxSummary = useCallback(async (selectedFY: TaxYear) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.getTaxSummary({
        userId: user.uid,
        financialYear: selectedFY,
      });
      const calc = response.calculation;
      if (calc) {
        setTaxData({
          grossIncome: calc.grossIncome,
          totalDeductions: calc.totalDeductions,
          taxableIncome: calc.taxableIncome,
          baseTax: calc.baseTax,
          medicareLevy: calc.medicareLevy,
          helpRepayment: calc.helpRepayment,
          lito: calc.lito,
          totalTax: calc.totalTax,
          effectiveRate: calc.effectiveRate,
          taxWithheld: calc.taxWithheld,
          refundOrOwed: calc.refundOrOwed,
          deductions: calc.deductions.map(d => ({
            category: d.category,
            totalAmount: d.totalAmount,
            expenseCount: d.expenseCount,
          })),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax summary');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load on FY change
  const handleFYChange = useCallback((val: string) => {
    const newFY = val as TaxYear;
    setFy(newFY);
    loadTaxSummary(newFY);
  }, [loadTaxSummary]);

  // Initial load
  useState(() => {
    loadTaxSummary(fy);
  });

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gross Income</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(taxData?.grossIncome ?? 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Deductions</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(taxData?.totalDeductions ?? 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxable Income</CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-2xl font-bold">{formatCurrency(taxData?.taxableIncome ?? 0)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {(taxData?.refundOrOwed ?? 0) >= 0 ? 'Estimated Refund' : 'Tax Owed'}
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className={`text-2xl font-bold ${(taxData?.refundOrOwed ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(Math.abs(taxData?.refundOrOwed ?? 0))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tax Breakdown */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Tax Breakdown</CardTitle>
            <CardDescription>Detailed tax calculation for FY {fy}</CardDescription>
          </div>
          <Select value={fy} onValueChange={handleFYChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_YEAR_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {error && <ErrorBanner message={error} />}
          {loading && <LoadingSkeleton />}
          {!loading && !error && taxData && (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Gross Income</TableCell>
                    <TableCell className="text-right">{formatCurrencyDetailed(taxData.grossIncome)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-green-600">Total Deductions</TableCell>
                    <TableCell className="text-right text-green-600">-{formatCurrencyDetailed(taxData.totalDeductions)}</TableCell>
                  </TableRow>
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold">Taxable Income</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrencyDetailed(taxData.taxableIncome)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Base Tax</TableCell>
                    <TableCell className="text-right">{formatCurrencyDetailed(taxData.baseTax)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Medicare Levy (2%)</TableCell>
                    <TableCell className="text-right">{formatCurrencyDetailed(taxData.medicareLevy)}</TableCell>
                  </TableRow>
                  {taxData.helpRepayment > 0 && (
                    <TableRow>
                      <TableCell>HELP Repayment</TableCell>
                      <TableCell className="text-right">{formatCurrencyDetailed(taxData.helpRepayment)}</TableCell>
                    </TableRow>
                  )}
                  {taxData.lito > 0 && (
                    <TableRow>
                      <TableCell className="text-green-600">Low Income Tax Offset (LITO)</TableCell>
                      <TableCell className="text-right text-green-600">-{formatCurrencyDetailed(taxData.lito)}</TableCell>
                    </TableRow>
                  )}
                  <TableRow className="border-t-2">
                    <TableCell className="font-bold">Total Tax</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrencyDetailed(taxData.totalTax)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Effective Tax Rate</TableCell>
                    <TableCell className="text-right">{(taxData.effectiveRate * 100).toFixed(1)}%</TableCell>
                  </TableRow>
                  {taxData.taxWithheld > 0 && (
                    <>
                      <TableRow>
                        <TableCell>Tax Already Withheld</TableCell>
                        <TableCell className="text-right">{formatCurrencyDetailed(taxData.taxWithheld)}</TableCell>
                      </TableRow>
                      <TableRow className="border-t-2">
                        <TableCell className="font-bold">
                          {taxData.refundOrOwed >= 0 ? 'Estimated Refund' : 'Amount Owed'}
                        </TableCell>
                        <TableCell className={`text-right font-bold ${taxData.refundOrOwed >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrencyDetailed(Math.abs(taxData.refundOrOwed))}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          {!loading && !error && !taxData && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Landmark className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No tax data available</p>
              <p className="text-sm">Add income and mark expenses as tax-deductible to see your tax summary.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deduction Breakdown by Category */}
      {taxData && taxData.deductions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Deductions by Category</CardTitle>
            <CardDescription>Breakdown of your tax deductions by ATO category</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {taxData.deductions.map((d, i) => {
                const catInfo = TAX_DEDUCTION_CATEGORIES.find(c => c.id === d.category);
                const pct = taxData.totalDeductions > 0 ? (d.totalAmount / taxData.totalDeductions) * 100 : 0;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${catInfo?.color ?? 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium truncate">
                          {catInfo?.label ?? 'Unknown'} {catInfo?.code ? `(${catInfo.code})` : ''}
                        </span>
                        <span className="text-sm font-medium">{formatCurrencyDetailed(d.totalAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{d.expenseCount} expense{d.expenseCount !== 1 ? 's' : ''}</span>
                        <span>{pct.toFixed(1)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${catInfo?.color ?? 'bg-gray-400'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================================
// Tab: Deductions
// ============================================================================

function DeductionsTab() {
  const { user } = useAuth();
  const { expenses } = useFinance();
  const [fy, setFy] = useState<TaxYear>(getCurrentAustralianFY());
  const [classifying, setClassifying] = useState(false);
  const [classifyResult, setClassifyResult] = useState<{
    totalProcessed: number;
    autoApplied: number;
    needsReview: number;
    skipped: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { start, end } = useMemo(() => getFYDateRange(fy), [fy]);

  const deductibleExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (!e.isTaxDeductible) return false;
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
  }, [expenses, start, end]);

  const totalDeductible = useMemo(() => {
    return deductibleExpenses.reduce((sum, e) => {
      const pct = e.taxDeductiblePercent ?? 1;
      return sum + e.amount * pct;
    }, 0);
  }, [deductibleExpenses]);

  const handleBatchClassify = useCallback(async () => {
    if (!user) return;
    setClassifying(true);
    setError(null);
    setClassifyResult(null);
    try {
      const response = await financeClient.batchClassifyTaxDeductibility({
        userId: user.uid,
        financialYear: fy,
        autoApply: true,
      });
      setClassifyResult({
        totalProcessed: response.totalProcessed,
        autoApplied: response.autoApplied,
        needsReview: response.needsReview,
        skipped: response.skipped,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed');
    } finally {
      setClassifying(false);
    }
  }, [user, fy]);

  return (
    <div className="space-y-4">
      {/* AI Classify Banner */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-amber-500" />
              Find Deductible Expenses
            </CardTitle>
            <CardDescription>
              Use AI to automatically identify tax-deductible expenses in your FY {fy} transactions
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={fy} onValueChange={(v) => setFy(v as TaxYear)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_YEAR_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleBatchClassify} disabled={classifying}>
              {classifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Classifying...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Classify All
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        {(classifyResult || error) && (
          <CardContent>
            {error && <ErrorBanner message={error} />}
            {classifyResult && (
              <div className="grid grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{classifyResult.totalProcessed}</div>
                  <div className="text-xs text-muted-foreground">Processed</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-green-600">{classifyResult.autoApplied}</div>
                  <div className="text-xs text-muted-foreground">Auto-applied</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-amber-600">{classifyResult.needsReview}</div>
                  <div className="text-xs text-muted-foreground">Needs Review</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-muted-foreground">{classifyResult.skipped}</div>
                  <div className="text-xs text-muted-foreground">Skipped</div>
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* Deductible Expenses List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Deductible Expenses</CardTitle>
              <CardDescription>
                {deductibleExpenses.length} expense{deductibleExpenses.length !== 1 ? 's' : ''} totalling {formatCurrencyDetailed(totalDeductible)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {deductibleExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No deductible expenses yet</p>
              <p className="text-sm">Mark expenses as tax-deductible or use AI classification above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Deductible</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deductibleExpenses.map(expense => {
                  const pct = expense.taxDeductiblePercent ?? 1;
                  const deductibleAmount = expense.amount * pct;
                  return (
                    <TableRow key={expense.id}>
                      <TableCell className="text-sm">
                        {new Date(expense.date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short' })}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{expense.description}</span>
                          {expense.taxDeductionNote && (
                            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                              {expense.taxDeductionNote}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {expense.taxDeductionCategory && expense.taxDeductionCategory !== 'Unspecified'
                            ? expense.taxDeductionCategory
                            : expense.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {formatCurrencyDetailed(expense.amount)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-green-600">
                        {pct < 1 ? `${(pct * 100).toFixed(0)}% = ` : ''}
                        {formatCurrencyDetailed(deductibleAmount)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Tab: Calculator
// ============================================================================

function CalculatorTab() {
  const [fy, setFy] = useState<TaxYear>(getCurrentAustralianFY());
  const [grossIncome, setGrossIncome] = useState<string>('85000');
  const [deductions, setDeductions] = useState<string>('0');
  const [includeHELP, setIncludeHELP] = useState(false);
  const [medicareExempt, setMedicareExempt] = useState(false);

  const calculation = useMemo(() => {
    const income = parseFloat(grossIncome) || 0;
    const deductionsAmt = parseFloat(deductions) || 0;
    const taxableIncome = Math.max(0, income - deductionsAmt);

    const brackets = getAustralianBrackets(fy, 'resident');
    const baseTax = calculateTaxWithBrackets(taxableIncome, brackets);
    const lito = calculateLITO(taxableIncome, fy, 'resident');

    // Medicare levy (simplified - 2%)
    let medicareLevy = 0;
    if (!medicareExempt && taxableIncome > 24276) {
      if (taxableIncome <= 30345) {
        medicareLevy = (taxableIncome - 24276) * 0.10;
      } else {
        medicareLevy = taxableIncome * 0.02;
      }
    }

    // HELP repayment (simplified)
    let helpRepayment = 0;
    if (includeHELP && taxableIncome >= 54435) {
      const helpBrackets = [
        { threshold: 159663, rate: 0.10 },
        { threshold: 150626, rate: 0.095 },
        { threshold: 142100, rate: 0.09 },
        { threshold: 134056, rate: 0.085 },
        { threshold: 126467, rate: 0.08 },
        { threshold: 119309, rate: 0.075 },
        { threshold: 112556, rate: 0.07 },
        { threshold: 106185, rate: 0.065 },
        { threshold: 100174, rate: 0.06 },
        { threshold: 94503, rate: 0.055 },
        { threshold: 89154, rate: 0.05 },
        { threshold: 84107, rate: 0.045 },
        { threshold: 79346, rate: 0.04 },
        { threshold: 74855, rate: 0.035 },
        { threshold: 70618, rate: 0.03 },
        { threshold: 66620, rate: 0.025 },
        { threshold: 62850, rate: 0.02 },
        { threshold: 54435, rate: 0.01 },
      ];
      for (const b of helpBrackets) {
        if (taxableIncome >= b.threshold) {
          helpRepayment = taxableIncome * b.rate;
          break;
        }
      }
    }

    const totalTax = Math.max(0, baseTax + medicareLevy + helpRepayment - lito);
    const effectiveRate = income > 0 ? totalTax / income : 0;
    const takeHome = income - totalTax;

    return {
      taxableIncome,
      baseTax,
      medicareLevy,
      helpRepayment,
      lito,
      totalTax,
      effectiveRate,
      takeHome,
    };
  }, [grossIncome, deductions, fy, includeHELP, medicareExempt]);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Input Card */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Calculator</CardTitle>
          <CardDescription>Estimate your Australian tax for FY {fy}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="calc-fy">Financial Year</Label>
            <Select value={fy} onValueChange={(v) => setFy(v as TaxYear)}>
              <SelectTrigger id="calc-fy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_YEAR_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gross-income">Gross Income ($)</Label>
            <Input
              id="gross-income"
              type="number"
              value={grossIncome}
              onChange={(e) => setGrossIncome(e.target.value)}
              placeholder="85000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deductions">Deductions ($)</Label>
            <Input
              id="deductions"
              type="number"
              value={deductions}
              onChange={(e) => setDeductions(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="include-help">HELP/HECS Debt</Label>
            <Switch
              id="include-help"
              checked={includeHELP}
              onCheckedChange={setIncludeHELP}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="medicare-exempt">Medicare Exemption</Label>
            <Switch
              id="medicare-exempt"
              checked={medicareExempt}
              onCheckedChange={setMedicareExempt}
            />
          </div>
        </CardContent>
      </Card>

      {/* Result Card */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Estimate</CardTitle>
          <CardDescription>Based on {fy} resident tax brackets</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Gross Income</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrencyDetailed(parseFloat(grossIncome) || 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-green-600">Deductions</TableCell>
                <TableCell className="text-right text-green-600">
                  -{formatCurrencyDetailed(parseFloat(deductions) || 0)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-bold">Taxable Income</TableCell>
                <TableCell className="text-right font-bold">
                  {formatCurrencyDetailed(calculation.taxableIncome)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Base Tax</TableCell>
                <TableCell className="text-right">{formatCurrencyDetailed(calculation.baseTax)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Medicare Levy</TableCell>
                <TableCell className="text-right">{formatCurrencyDetailed(calculation.medicareLevy)}</TableCell>
              </TableRow>
              {calculation.helpRepayment > 0 && (
                <TableRow>
                  <TableCell>HELP Repayment</TableCell>
                  <TableCell className="text-right">{formatCurrencyDetailed(calculation.helpRepayment)}</TableCell>
                </TableRow>
              )}
              {calculation.lito > 0 && (
                <TableRow>
                  <TableCell className="text-green-600">LITO</TableCell>
                  <TableCell className="text-right text-green-600">
                    -{formatCurrencyDetailed(calculation.lito)}
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="border-t-2">
                <TableCell className="font-bold">Total Tax</TableCell>
                <TableCell className="text-right font-bold text-red-600">
                  {formatCurrencyDetailed(calculation.totalTax)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Effective Rate</TableCell>
                <TableCell className="text-right">{(calculation.effectiveRate * 100).toFixed(1)}%</TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-bold text-green-600">Take Home Pay</TableCell>
                <TableCell className="text-right font-bold text-green-600">
                  {formatCurrencyDetailed(calculation.takeHome)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Tab: Export
// ============================================================================

function ExportTab() {
  const { user } = useAuth();
  const [fy, setFy] = useState<TaxYear>(getCurrentAustralianFY());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    if (!user) return;
    setExporting(true);
    setError(null);
    try {
      const response = await financeClient.exportTaxReturn({
        userId: user.uid,
        financialYear: fy,
        format: format === 'csv' ? 1 : 2, // TAX_EXPORT_FORMAT_CSV=1, JSON=2
      });

      // Download the file
      const blob = new Blob([response.data as BlobPart], { type: response.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [user, fy]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Export Tax Return</CardTitle>
          <CardDescription>Download your tax return data for FY {fy}</CardDescription>
        </div>
        <Select value={fy} onValueChange={(v) => setFy(v as TaxYear)}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TAX_YEAR_OPTIONS.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error && <ErrorBanner message={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => handleExport('csv')}
            disabled={exporting}
            className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileSpreadsheet className="h-10 w-10 text-green-600" />
            <div className="text-center">
              <p className="font-medium">CSV Spreadsheet</p>
              <p className="text-xs text-muted-foreground">Compatible with Excel, Google Sheets</p>
            </div>
          </button>

          <button
            onClick={() => handleExport('json')}
            disabled={exporting}
            className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileJson className="h-10 w-10 text-blue-600" />
            <div className="text-center">
              <p className="font-medium">JSON Data</p>
              <p className="text-xs text-muted-foreground">Structured data for developers</p>
            </div>
          </button>
        </div>

        {exporting && (
          <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Preparing export...
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Tax Page
// ============================================================================

export default function TaxReturnsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Tax Returns</h2>
        <p className="text-muted-foreground">
          Track deductions, estimate your Australian tax return, and export for your accountant.
        </p>
      </div>

      <ProFeatureGate feature="Tax Returns" mode="blur">
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="deductions">Deductions</TabsTrigger>
            <TabsTrigger value="calculator">Calculator</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
          </TabsList>
          <TabsContent value="summary"><SummaryTab /></TabsContent>
          <TabsContent value="deductions"><DeductionsTab /></TabsContent>
          <TabsContent value="calculator"><CalculatorTab /></TabsContent>
          <TabsContent value="export"><ExportTab /></TabsContent>
        </Tabs>
      </ProFeatureGate>
    </div>
  );
}
