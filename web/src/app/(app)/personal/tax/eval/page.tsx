'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { ProFeatureGate } from '../../../../components/ProFeatureGate';
import { financeClient } from '@/lib/financeService';
import type {
  TaxEvalJob,
  TaxEvalResult,
  TaxEvalDeductionCategory,
  TaxEvalFileResult,
  TaxEvalAccuracy,
} from '@/gen/pfinance/v1/finance_service_pb';
import {
  Play,
  Loader2,
  DollarSign,
  FileText,
  BarChart3,
  Clock,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Target,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';

// ============================================================================
// Helpers
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function confidenceBadge(confidence: number) {
  if (confidence >= 0.9) return <Badge variant="default" className="bg-green-600">High ({formatPercent(confidence)})</Badge>;
  if (confidence >= 0.7) return <Badge variant="secondary" className="bg-yellow-600 text-white">Med ({formatPercent(confidence)})</Badge>;
  return <Badge variant="destructive">Low ({formatPercent(confidence)})</Badge>;
}

// ============================================================================
// Components
// ============================================================================

function MetricCard({ title, value, subtitle, icon: Icon }: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AccuracySection({ accuracy }: { accuracy: TaxEvalAccuracy }) {
  const extraction = accuracy.extraction;
  const deductibility = accuracy.deductibility;
  const taxCategory = accuracy.taxCategory;
  const amount = accuracy.amount;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Target className="h-5 w-5" />
          Accuracy Metrics
        </CardTitle>
        <CardDescription>
          {accuracy.filesWithGroundTruth} of {accuracy.filesEvaluated} files have ground truth
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {extraction && (
            <div className="space-y-2 p-3 rounded-lg border">
              <p className="text-sm font-medium">Transaction Extraction</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Precision</span>
                  <span className="font-mono">{formatPercent(extraction.precision)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recall</span>
                  <span className="font-mono">{formatPercent(extraction.recall)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>F1 Score</span>
                  <span className="font-mono">{formatPercent(extraction.f1)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Expected: {extraction.expectedTotal}</span>
                  <span>Found: {extraction.extractedTotal}</span>
                </div>
              </div>
            </div>
          )}

          {deductibility && (
            <div className="space-y-2 p-3 rounded-lg border">
              <p className="text-sm font-medium">Deductibility Classification</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Accuracy</span>
                  <span className="font-mono">{formatPercent(deductibility.accuracy)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Correct</span>
                  <span>{deductibility.correct} / {deductibility.total}</span>
                </div>
              </div>
            </div>
          )}

          {taxCategory && (
            <div className="space-y-2 p-3 rounded-lg border">
              <p className="text-sm font-medium">Tax Category</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between font-medium">
                  <span>Accuracy</span>
                  <span className="font-mono">{formatPercent(taxCategory.accuracy)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Correct</span>
                  <span>{taxCategory.correct} / {taxCategory.total}</span>
                </div>
              </div>
            </div>
          )}

          {amount && (
            <div className="space-y-2 p-3 rounded-lg border">
              <p className="text-sm font-medium">Amount Matching</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Exact (±$0.01)</span>
                  <span className="font-mono">{amount.exactMatches} / {amount.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Close (±5%)</span>
                  <span className="font-mono">{amount.closeMatches} / {amount.total}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">MAE</span>
                  <span className="font-mono">{formatCurrency(amount.meanAbsError)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function DeductionsTable({ deductions }: { deductions: TaxEvalDeductionCategory[] }) {
  const sorted = [...deductions].sort((a, b) => b.totalAmount - a.totalAmount);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Deductions by ATO Category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Items</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Deductible</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((d) => (
              <TableRow key={d.code}>
                <TableCell className="font-mono font-medium">{d.code}</TableCell>
                <TableCell>{d.name}</TableCell>
                <TableCell className="text-right">{d.itemCount}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(d.totalAmount)}</TableCell>
                <TableCell className="text-right font-mono font-medium">{formatCurrency(d.deductibleAmount)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="font-bold border-t-2">
              <TableCell colSpan={2}>Total</TableCell>
              <TableCell className="text-right">{sorted.reduce((s, d) => s + d.itemCount, 0)}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(sorted.reduce((s, d) => s + d.totalAmount, 0))}</TableCell>
              <TableCell className="text-right font-mono">{formatCurrency(sorted.reduce((s, d) => s + d.deductibleAmount, 0))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function FileResultsTable({ files }: { files: TaxEvalFileResult[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Per-File Results ({files.length} files)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((f) => (
              <>
                <TableRow
                  key={f.filename}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setExpanded(expanded === f.filename ? null : f.filename)}
                >
                  <TableCell className="font-mono text-xs max-w-[200px] truncate" title={f.relativePath}>
                    {f.filename}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{f.category || f.documentType || 'unknown'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{f.transactionCount}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatDuration(Number(f.processingMs))}</TableCell>
                  <TableCell>{confidenceBadge(f.overallConfidence)}</TableCell>
                  <TableCell>
                    {f.error ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </TableCell>
                </TableRow>
                {expanded === f.filename && f.taxResults.length > 0 && (
                  <TableRow key={`${f.filename}-details`}>
                    <TableCell colSpan={6} className="bg-muted/30 p-4">
                      <div className="space-y-1 text-xs">
                        {f.taxResults.slice(0, 20).map((item, i) => (
                          <div key={i} className="flex items-center gap-3 py-1 border-b border-border/50 last:border-0">
                            <span className="font-mono w-20 text-right">{formatCurrency(item.amount)}</span>
                            <span className="flex-1 truncate">{item.description}</span>
                            <span className="text-muted-foreground">{item.date}</span>
                            {item.isDeductible && (
                              <Badge variant="outline" className="text-xs">{item.taxCategory}</Badge>
                            )}
                            <span className="font-mono text-muted-foreground">{formatPercent(item.confidence)}</span>
                          </div>
                        ))}
                        {f.taxResults.length > 20 && (
                          <p className="text-muted-foreground pt-2">...and {f.taxResults.length - 20} more</p>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ResultsDashboard({ result }: { result: TaxEvalResult }) {
  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Files Processed"
          value={`${result.successfulFiles} / ${result.totalFiles}`}
          subtitle={result.failedFiles > 0 ? `${result.failedFiles} failed` : undefined}
          icon={FileText}
        />
        <MetricCard
          title="Transactions"
          value={result.totalTransactions}
          subtitle={`${result.totalDeductible} deductible`}
          icon={BarChart3}
        />
        <MetricCard
          title="Total Deductions"
          value={formatCurrency(result.totalDeductionsAmount)}
          subtitle={`of ${formatCurrency(result.totalExpenses)} expenses`}
          icon={DollarSign}
        />
        <MetricCard
          title="Processing Time"
          value={formatDuration(Number(result.durationMs))}
          subtitle={`${result.totalApiCalls} API calls · ${formatCurrency(result.estimatedCostUsd).replace('A', 'US')}`}
          icon={Clock}
        />
      </div>

      {/* Accuracy (if ground truth available) */}
      {result.accuracy && result.accuracy.filesWithGroundTruth > 0 && (
        <AccuracySection accuracy={result.accuracy} />
      )}

      {/* Deductions table */}
      {result.deductions.length > 0 && (
        <DeductionsTable deductions={result.deductions} />
      )}

      {/* Per-file results */}
      {result.fileResults.length > 0 && (
        <FileResultsTable files={result.fileResults} />
      )}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function TaxEvalPage() {
  const [datasetPath, setDatasetPath] = useState('tax25');
  const [method, setMethod] = useState('gemini');
  const [occupation, setOccupation] = useState('engineer');
  const [concurrency, setConcurrency] = useState(3);

  const [job, setJob] = useState<TaxEvalJob | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollJob = useCallback(async (jobId: string) => {
    try {
      const res = await financeClient.getTaxEvalJob({ jobId });
      if (res.job) {
        setJob(res.job);
        if (res.job.status === 'completed' || res.job.status === 'failed') {
          stopPolling();
          setRunning(false);
          if (res.job.status === 'failed') {
            setError(res.job.errorMessage || 'Job failed');
          }
        }
      }
    } catch (err: unknown) {
      stopPolling();
      setRunning(false);
      setError(err instanceof Error ? err.message : 'Failed to poll job');
    }
  }, [stopPolling]);

  const startEval = useCallback(async () => {
    setError(null);
    setJob(null);
    setRunning(true);
    stopPolling();

    try {
      const res = await financeClient.runTaxEval({
        datasetPath,
        method,
        occupation,
        concurrency,
      });

      const jobId = res.jobId;
      if (!jobId) {
        setError('No job ID returned');
        setRunning(false);
        return;
      }

      // Initial poll
      await pollJob(jobId);

      // Start polling interval
      pollRef.current = setInterval(() => pollJob(jobId), 2000);
    } catch (err: unknown) {
      setRunning(false);
      setError(err instanceof Error ? err.message : 'Failed to start eval');
    }
  }, [datasetPath, method, occupation, concurrency, pollJob, stopPolling]);

  return (
    <ProFeatureGate feature="Tax Eval Dashboard">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/personal/tax">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Tax Eval Engine</h1>
            <p className="text-muted-foreground">
              Process documents through the extraction + tax classification pipeline
            </p>
          </div>
        </div>

        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration</CardTitle>
            <CardDescription>Set up the evaluation run parameters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="dataset">Dataset Path</Label>
                <Input
                  id="dataset"
                  value={datasetPath}
                  onChange={(e) => setDatasetPath(e.target.value)}
                  placeholder="tax25"
                  disabled={running}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="method">Extraction Method</Label>
                <Select value={method} onValueChange={setMethod} disabled={running}>
                  <SelectTrigger id="method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gemini">Gemini AI</SelectItem>
                    <SelectItem value="self-hosted">Self-hosted ML</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="occupation">Occupation</Label>
                <Input
                  id="occupation"
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="engineer"
                  disabled={running}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="concurrency">Concurrency</Label>
                <Input
                  id="concurrency"
                  type="number"
                  min={1}
                  max={10}
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value) || 1)}
                  disabled={running}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button onClick={startEval} disabled={running || !datasetPath}>
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Evaluation
                  </>
                )}
              </Button>

              {running && job && (
                <div className="flex items-center gap-3 flex-1">
                  <Progress value={job.progressPercent} className="flex-1 max-w-xs" />
                  <span className="text-sm text-muted-foreground">
                    {job.processedFiles} / {job.totalFiles} files ({job.progressPercent}%)
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Results */}
        {job?.status === 'completed' && job.result && (
          <ResultsDashboard result={job.result} />
        )}
      </div>
    </ProFeatureGate>
  );
}
