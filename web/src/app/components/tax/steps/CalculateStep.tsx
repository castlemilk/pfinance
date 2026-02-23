'use client';

import { useMemo, useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  Calculator,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Loader2,
  Landmark,
} from 'lucide-react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../../context/AuthWithAdminContext';
import type { WizardState, WizardAction } from '../TaxReviewWizard';

interface CalculateStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function CalculateStep({ state, dispatch }: CalculateStepProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch tax summary if not already loaded
  const loadTaxSummary = useCallback(async () => {
    if (!user || state.taxSummary) return;
    setLoading(true);
    setError(null);

    try {
      const response = await financeClient.getTaxSummary({
        userId: user.uid,
        financialYear: state.financialYear,
      });

      if (response.calculation) {
        dispatch({
          type: 'SET_TAX_SUMMARY',
          summary: response.calculation,
          deductions: response.calculation.deductions,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tax calculation');
    } finally {
      setLoading(false);
    }
  }, [user, state.financialYear, state.taxSummary, dispatch]);

  useEffect(() => {
    loadTaxSummary();
  }, [loadTaxSummary]);

  const calc = state.taxSummary;

  // Compute refund/owed with user-provided tax withheld
  const refundOrOwed = useMemo(() => {
    if (!calc) return 0;
    const withheld = state.taxWithheld > 0 ? state.taxWithheld : calc.taxWithheld;
    return withheld - calc.totalTax;
  }, [calc, state.taxWithheld]);

  const effectiveWithheld = state.taxWithheld > 0 ? state.taxWithheld : (calc?.taxWithheld ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Calculator className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Tax Calculation</h2>
          <p className="text-sm text-muted-foreground">
            Full tax breakdown for FY {state.financialYear} based on your income and deductions.
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-[400px] w-full" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && !calc && (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Landmark className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No Tax Data</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Add income records and deductible expenses to see your tax calculation.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && calc && (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Gross Income"
              value={formatCurrency(calc.grossIncome)}
              color="text-foreground"
            />
            <SummaryCard
              label="Total Deductions"
              value={formatCurrency(calc.totalDeductions)}
              color="text-green-600"
            />
            <SummaryCard
              label="Total Tax"
              value={formatCurrency(calc.totalTax)}
              color="text-red-600"
            />
            <SummaryCard
              label={refundOrOwed >= 0 ? 'Estimated Refund' : 'Amount Owed'}
              value={formatCurrency(Math.abs(refundOrOwed))}
              color={refundOrOwed >= 0 ? 'text-green-600' : 'text-red-600'}
              icon={refundOrOwed >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            />
          </div>

          {/* Detailed breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Detailed Tax Breakdown</CardTitle>
              <CardDescription>Step-by-step tax calculation for FY {state.financialYear}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Component</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Income section */}
                  <TableRow>
                    <TableCell className="font-medium">Gross Income</TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.grossIncome)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium text-green-600">Total Deductions</TableCell>
                    <TableCell className="text-right text-green-600">
                      -{formatCurrency(calc.totalDeductions)}
                    </TableCell>
                  </TableRow>

                  {/* Taxable income */}
                  <TableRow className="border-t-2 border-primary/20">
                    <TableCell className="font-bold">Taxable Income</TableCell>
                    <TableCell className="text-right font-bold">{formatCurrency(calc.taxableIncome)}</TableCell>
                  </TableRow>

                  {/* Tax components */}
                  <TableRow>
                    <TableCell>Base Tax</TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.baseTax)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>Medicare Levy (2%)</TableCell>
                    <TableCell className="text-right">{formatCurrency(calc.medicareLevy)}</TableCell>
                  </TableRow>
                  {calc.helpRepayment > 0 && (
                    <TableRow>
                      <TableCell>HELP Repayment</TableCell>
                      <TableCell className="text-right">{formatCurrency(calc.helpRepayment)}</TableCell>
                    </TableRow>
                  )}
                  {calc.lito > 0 && (
                    <TableRow>
                      <TableCell className="text-green-600">Low Income Tax Offset (LITO)</TableCell>
                      <TableCell className="text-right text-green-600">
                        -{formatCurrency(calc.lito)}
                      </TableCell>
                    </TableRow>
                  )}

                  {/* Total tax */}
                  <TableRow className="border-t-2 border-primary/20">
                    <TableCell className="font-bold">Total Tax Liability</TableCell>
                    <TableCell className="text-right font-bold text-red-600">
                      {formatCurrency(calc.totalTax)}
                    </TableCell>
                  </TableRow>

                  {/* Effective rate */}
                  <TableRow>
                    <TableCell className="text-muted-foreground">Effective Tax Rate</TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {(calc.effectiveRate * 100).toFixed(1)}%
                    </TableCell>
                  </TableRow>

                  {/* Tax withheld / refund section */}
                  {effectiveWithheld > 0 && (
                    <>
                      <TableRow className="border-t-2 border-primary/20">
                        <TableCell>Tax Already Withheld</TableCell>
                        <TableCell className="text-right">{formatCurrency(effectiveWithheld)}</TableCell>
                      </TableRow>
                      <TableRow className="bg-accent/30">
                        <TableCell className="font-bold text-lg">
                          {refundOrOwed >= 0 ? 'Estimated Refund' : 'Amount Owed'}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold text-lg ${
                            refundOrOwed >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(Math.abs(refundOrOwed))}
                        </TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          {icon && <span className={color}>{icon}</span>}
        </div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
