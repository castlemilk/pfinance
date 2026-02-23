'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Receipt, Loader2, AlertCircle, ChevronDown, ChevronRight, Landmark } from 'lucide-react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useFinance } from '../../../context/FinanceContext';
import { TaxDeductionCategory } from '@/gen/pfinance/v1/types_pb';
import {
  TAX_DEDUCTION_CATEGORIES,
  getFYDateRange,
} from '../../../constants/taxDeductions';
import type { WizardState, WizardAction } from '../TaxReviewWizard';

interface DeductionsStepProps {
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

export function DeductionsStep({ state, dispatch }: DeductionsStepProps) {
  const { user } = useAuth();
  const { expenses } = useFinance();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTaxSummary = useCallback(async () => {
    if (!user) return;
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
      setError(err instanceof Error ? err.message : 'Failed to load tax summary');
    } finally {
      setLoading(false);
    }
  }, [user, state.financialYear, dispatch]);

  // Load on mount
  useEffect(() => {
    loadTaxSummary();
  }, [loadTaxSummary]);

  const { start, end } = useMemo(() => getFYDateRange(state.financialYear), [state.financialYear]);

  // Group deductible expenses by category for expandable sections
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, typeof expenses>();
    const fyExpenses = expenses.filter((e) => {
      if (!e.isTaxDeductible) return false;
      const d = new Date(e.date);
      return d >= start && d <= end;
    });

    for (const exp of fyExpenses) {
      const catLabel = exp.taxDeductionCategory || 'Unspecified';
      if (!map.has(catLabel)) {
        map.set(catLabel, []);
      }
      map.get(catLabel)!.push(exp);
    }

    return map;
  }, [expenses, start, end]);

  const deductionSummaries = state.deductionSummaries;
  const totalDeductions = state.taxSummary?.totalDeductions ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-green-500/10">
          <Receipt className="h-5 w-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Deduction Breakdown</h2>
          <p className="text-sm text-muted-foreground">
            Your tax deductions for FY {state.financialYear} grouped by ATO category.
          </p>
        </div>
      </div>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading && !error && deductionSummaries.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Landmark className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold mb-1">No Deductions Found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              No tax-deductible expenses were found for FY {state.financialYear}.
              Go back to the Classify step to identify deductible expenses.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && deductionSummaries.length > 0 && (
        <>
          {/* Total summary card */}
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-muted-foreground">Total Deductions</span>
                  <div className="text-3xl font-bold text-green-600">
                    {formatCurrency(totalDeductions)}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm text-muted-foreground">Categories</span>
                  <div className="text-2xl font-bold">{deductionSummaries.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-category cards */}
          <div className="space-y-3">
            {deductionSummaries.map((summary) => {
              const catInfo = TAX_DEDUCTION_CATEGORIES.find((c) => c.id === summary.category);
              const pct = totalDeductions > 0 ? (summary.totalAmount / totalDeductions) * 100 : 0;

              // Find matching expenses for this category
              const catLabel = catInfo?.label || 'Unknown';
              const categoryExpenses = expensesByCategory.get(catLabel) || [];

              return (
                <DeductionCategoryCard
                  key={summary.category}
                  code={catInfo?.code ?? '??'}
                  label={catLabel}
                  description={catInfo?.description ?? ''}
                  color={catInfo?.color ?? 'bg-gray-500'}
                  totalAmount={summary.totalAmount}
                  expenseCount={summary.expenseCount}
                  percentage={pct}
                  expenses={categoryExpenses}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Category Card with expandable expenses
// ============================================================================

function DeductionCategoryCard({
  code,
  label,
  description,
  color,
  totalAmount,
  expenseCount,
  percentage,
  expenses,
}: {
  code: string;
  label: string;
  description: string;
  color: string;
  totalAmount: number;
  expenseCount: number;
  percentage: number;
  expenses: any[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardContent className="pt-4 pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-10 rounded-full ${color}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">
                      {code}
                    </Badge>
                    <span className="font-medium text-sm">{label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-green-600">
                      {formatCurrency(totalAmount)}
                    </span>
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground">
                    {expenseCount} expense{expenseCount !== 1 ? 's' : ''} -- {percentage.toFixed(1)}% of
                    total
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${color}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 pb-3">
            <p className="text-xs text-muted-foreground py-2">{description}</p>
            {expenses.length > 0 ? (
              <div className="space-y-1">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded text-xs hover:bg-accent/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground shrink-0">
                        {new Date(exp.date).toLocaleDateString('en-AU', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>
                      <span className="truncate">{exp.description}</span>
                    </div>
                    <span className="font-medium shrink-0 ml-2">{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">
                Expense details not available locally. Check the server data for full breakdown.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
