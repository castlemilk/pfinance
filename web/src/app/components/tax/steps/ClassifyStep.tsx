'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Sparkles, Loader2, CheckCircle2, AlertCircle, FileSearch, SkipForward } from 'lucide-react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from '../../../context/AuthWithAdminContext';
import type { WizardState, WizardAction } from '../TaxReviewWizard';

interface ClassifyStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function ClassifyStep({ state, dispatch }: ClassifyStepProps) {
  const { user } = useAuth();
  const [classifying, setClassifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClassify = useCallback(async () => {
    if (!user) return;
    setClassifying(true);
    setError(null);

    try {
      const response = await financeClient.batchClassifyTaxDeductibility({
        userId: user.uid,
        financialYear: state.financialYear,
        occupation: state.occupation,
        autoApply: true,
      });

      dispatch({
        type: 'SET_CLASSIFY_RESULT',
        result: {
          processed: response.totalProcessed,
          autoApplied: response.autoApplied,
          needsReview: response.needsReview,
          skipped: response.skipped,
        },
        results: response.results,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Classification failed. Please try again.');
    } finally {
      setClassifying(false);
    }
  }, [user, state.financialYear, state.occupation, dispatch]);

  const hasResult = state.classifyResult !== null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10">
          <Sparkles className="h-5 w-5 text-amber-500" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">AI Expense Classification</h2>
          <p className="text-sm text-muted-foreground">
            Automatically identify tax-deductible expenses in your FY {state.financialYear} transactions.
          </p>
        </div>
      </div>

      {/* Classification action card */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Classification</CardTitle>
          <CardDescription>
            Our AI will scan all your expenses for FY {state.financialYear} and classify them by ATO deduction category.
            {state.occupation && ` Your occupation "${state.occupation}" will be used for context.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!hasResult && !classifying && (
            <div className="flex flex-col items-center py-8">
              <FileSearch className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                Click the button below to start AI classification. High-confidence matches will be
                automatically applied. Lower-confidence items will be flagged for your review in the next step.
              </p>
              <Button onClick={handleClassify} size="lg">
                <Sparkles className="h-4 w-4 mr-2" />
                Start Classification
              </Button>
            </div>
          )}

          {classifying && (
            <div className="flex flex-col items-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-sm font-medium">Classifying your expenses...</p>
              <p className="text-xs text-muted-foreground mt-1">
                This may take a moment depending on the number of transactions.
              </p>
            </div>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Classification Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Results */}
          {hasResult && state.classifyResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Processed"
                  value={state.classifyResult.processed}
                  icon={<FileSearch className="h-4 w-4" />}
                  color="text-foreground"
                />
                <StatCard
                  label="Auto-Applied"
                  value={state.classifyResult.autoApplied}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  color="text-green-600"
                />
                <StatCard
                  label="Needs Review"
                  value={state.classifyResult.needsReview}
                  icon={<AlertCircle className="h-4 w-4" />}
                  color="text-amber-600"
                />
                <StatCard
                  label="Skipped"
                  value={state.classifyResult.skipped}
                  icon={<SkipForward className="h-4 w-4" />}
                  color="text-muted-foreground"
                />
              </div>

              {state.classifyResult.needsReview > 0 && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Items Need Review</AlertTitle>
                  <AlertDescription>
                    {state.classifyResult.needsReview} expense{state.classifyResult.needsReview !== 1 ? 's' : ''} had
                    medium confidence and need your review in the next step. You can approve, reject, or
                    recategorize each one.
                  </AlertDescription>
                </Alert>
              )}

              {state.classifyResult.needsReview === 0 && (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>All Clear</AlertTitle>
                  <AlertDescription>
                    All expenses were either automatically classified or skipped. No manual review needed --
                    you can proceed to the next step.
                  </AlertDescription>
                </Alert>
              )}

              {/* Re-run option */}
              <div className="flex justify-center pt-2">
                <Button variant="outline" size="sm" onClick={handleClassify} disabled={classifying}>
                  <Sparkles className="h-3 w-3 mr-2" />
                  Re-run Classification
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className={`flex items-center gap-2 mb-1 ${color}`}>
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
