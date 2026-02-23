'use client';

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  SkipForward,
  Loader2,
  AlertCircle,
  PartyPopper,
} from 'lucide-react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { useFinance } from '../../../context/FinanceContext';
import { TaxClassificationResult } from '@/gen/pfinance/v1/finance_service_pb';
import { TaxDeductionCategory } from '@/gen/pfinance/v1/types_pb';
import {
  TAX_DEDUCTION_CATEGORIES,
  getCategoryLabel,
  getFYDateRange,
} from '../../../constants/taxDeductions';
import type { WizardState, WizardAction } from '../TaxReviewWizard';

interface ReviewStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

type ReviewDecision = 'approve' | 'reject' | 'recategorize' | 'skip' | null;

interface ReviewItem {
  classificationResult: TaxClassificationResult;
  expenseDescription: string;
  expenseAmount: number;
  expenseDate: Date;
  decision: ReviewDecision;
  newCategory?: TaxDeductionCategory;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ReviewStep({ state, dispatch }: ReviewStepProps) {
  const { user } = useAuth();
  const { expenses } = useFinance();
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Build review items from classify results + expenses
  useEffect(() => {
    if (!state.classifyResults || state.classifyResults.length === 0) return;

    const needsReviewResults = state.classifyResults.filter((r) => r.needsReview);
    const { start, end } = getFYDateRange(state.financialYear);

    const items: ReviewItem[] = needsReviewResults
      .map((result) => {
        const expense = expenses.find((e) => e.id === result.expenseId);
        if (!expense) return null;
        const expDate = new Date(expense.date);
        if (expDate < start || expDate > end) return null;

        return {
          classificationResult: result,
          expenseDescription: expense.description,
          expenseAmount: expense.amount,
          expenseDate: new Date(expense.date),
          decision: null as ReviewDecision,
          newCategory: undefined,
        };
      })
      .filter(Boolean) as ReviewItem[];

    setReviewItems(items);
  }, [state.classifyResults, state.financialYear, expenses]);

  const reviewedCount = useMemo(
    () => reviewItems.filter((i) => i.decision !== null).length,
    [reviewItems]
  );

  const totalCount = reviewItems.length;
  const progressPercent = totalCount > 0 ? (reviewedCount / totalCount) * 100 : 100;

  // Update reviewed count in wizard state
  useEffect(() => {
    dispatch({ type: 'SET_REVIEWED_COUNT', count: reviewedCount });
  }, [reviewedCount, dispatch]);

  const updateDecision = useCallback((expenseId: string, decision: ReviewDecision, newCategory?: TaxDeductionCategory) => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.classificationResult.expenseId === expenseId
          ? { ...item, decision, newCategory }
          : item
      )
    );
    setSaved(false);
  }, []);

  const handleApproveAll = useCallback(() => {
    setReviewItems((prev) =>
      prev.map((item) =>
        item.decision === null ? { ...item, decision: 'approve' } : item
      )
    );
    setSaved(false);
  }, []);

  const handleSaveDecisions = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      const updates = reviewItems
        .filter((item) => item.decision !== null && item.decision !== 'skip')
        .map((item) => {
          const result = item.classificationResult;
          if (item.decision === 'approve') {
            return {
              expenseId: result.expenseId,
              isTaxDeductible: result.isDeductible,
              taxDeductionCategory: result.category,
              taxDeductionNote: result.reasoning,
              taxDeductiblePercent: result.deductiblePercent,
            };
          } else if (item.decision === 'reject') {
            return {
              expenseId: result.expenseId,
              isTaxDeductible: false,
              taxDeductionCategory: TaxDeductionCategory.UNSPECIFIED,
              taxDeductionNote: '',
              taxDeductiblePercent: 0,
            };
          } else if (item.decision === 'recategorize' && item.newCategory !== undefined) {
            return {
              expenseId: result.expenseId,
              isTaxDeductible: true,
              taxDeductionCategory: item.newCategory,
              taxDeductionNote: result.reasoning,
              taxDeductiblePercent: result.deductiblePercent,
            };
          }
          return null;
        })
        .filter(Boolean);

      if (updates.length > 0) {
        await financeClient.batchUpdateExpenseTaxStatus({
          userId: user.uid,
          updates: updates as any[],
        });
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decisions');
    } finally {
      setSaving(false);
    }
  }, [user, reviewItems]);

  // No items to review
  if (totalCount === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/10">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Review Expenses</h2>
            <p className="text-sm text-muted-foreground">
              Review AI-classified expenses that need your attention.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <PartyPopper className="h-16 w-16 text-green-500/50 mb-4" />
            <h3 className="text-lg font-semibold mb-1">All Expenses Classified!</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {state.classifyResult
                ? 'All expenses have been automatically classified with high confidence. No manual review needed.'
                : 'Run the classification step first to identify deductible expenses.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <AlertCircle className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Review Flagged Expenses</h2>
          <p className="text-sm text-muted-foreground">
            These expenses need your input -- the AI was not fully confident in the classification.
          </p>
        </div>
      </div>

      {/* Progress + batch actions */}
      <Card>
        <CardContent className="pt-4 pb-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Reviewed {reviewedCount} of {totalCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleApproveAll}>
                <CheckCircle2 className="h-3 w-3 mr-1.5" />
                Approve All Remaining
              </Button>
              {reviewedCount > 0 && (
                <Button size="sm" onClick={handleSaveDecisions} disabled={saving || saved}>
                  {saving ? (
                    <>
                      <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : saved ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 mr-1.5" />
                      Saved
                    </>
                  ) : (
                    'Save Decisions'
                  )}
                </Button>
              )}
            </div>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Expense review cards */}
      <div className="space-y-3">
        {reviewItems.map((item) => (
          <ReviewItemCard
            key={item.classificationResult.expenseId}
            item={item}
            onDecision={updateDecision}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Review Item Card
// ============================================================================

function ReviewItemCard({
  item,
  onDecision,
}: {
  item: ReviewItem;
  onDecision: (expenseId: string, decision: ReviewDecision, newCategory?: TaxDeductionCategory) => void;
}) {
  const [showRecategorize, setShowRecategorize] = useState(false);
  const result = item.classificationResult;
  const catInfo = TAX_DEDUCTION_CATEGORIES.find((c) => c.id === result.category);

  const getBorderColor = () => {
    switch (item.decision) {
      case 'approve':
        return 'border-green-500/50';
      case 'reject':
        return 'border-red-500/50';
      case 'recategorize':
        return 'border-blue-500/50';
      case 'skip':
        return 'border-muted-foreground/30';
      default:
        return '';
    }
  };

  return (
    <Card className={`transition-colors ${getBorderColor()}`}>
      <CardContent className="pt-4 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3">
          {/* Expense info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm truncate">{item.expenseDescription}</span>
              <Badge variant="outline" className="text-xs shrink-0">
                {formatCurrency(item.expenseAmount)}
              </Badge>
            </div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-muted-foreground">
                {item.expenseDate.toLocaleDateString('en-AU', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
              {catInfo && (
                <Badge variant="outline" className="text-xs">
                  <div className={`w-2 h-2 rounded-full mr-1 ${catInfo.color}`} />
                  {catInfo.code} - {catInfo.label}
                </Badge>
              )}
              <ConfidenceBadge confidence={result.confidence} />
            </div>
            {result.reasoning && (
              <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                {result.reasoning}
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant={item.decision === 'approve' ? 'default' : 'outline'}
              size="sm"
              className={item.decision === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
              onClick={() => {
                onDecision(result.expenseId, 'approve');
                setShowRecategorize(false);
              }}
              title="Approve"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={item.decision === 'reject' ? 'default' : 'outline'}
              size="sm"
              className={item.decision === 'reject' ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={() => {
                onDecision(result.expenseId, 'reject');
                setShowRecategorize(false);
              }}
              title="Reject"
            >
              <XCircle className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={item.decision === 'recategorize' ? 'default' : 'outline'}
              size="sm"
              className={item.decision === 'recategorize' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              onClick={() => setShowRecategorize(!showRecategorize)}
              title="Recategorize"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={item.decision === 'skip' ? 'default' : 'outline'}
              size="sm"
              className={item.decision === 'skip' ? 'bg-muted-foreground hover:bg-muted-foreground/80' : ''}
              onClick={() => {
                onDecision(result.expenseId, 'skip');
                setShowRecategorize(false);
              }}
              title="Skip"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Recategorize dropdown */}
        {showRecategorize && (
          <div className="mt-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Reassign category:</span>
              <Select
                value={item.newCategory !== undefined ? String(item.newCategory) : ''}
                onValueChange={(v) => {
                  const cat = parseInt(v) as TaxDeductionCategory;
                  onDecision(result.expenseId, 'recategorize', cat);
                }}
              >
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {TAX_DEDUCTION_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                        {cat.code} - {cat.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
