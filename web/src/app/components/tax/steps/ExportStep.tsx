'use client';

import { useState, useCallback, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Download,
  FileSpreadsheet,
  FileJson,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { financeClient } from '@/lib/financeService';
import { TaxExportFormat } from '@/gen/pfinance/v1/finance_service_pb';
import type { WizardState, WizardAction } from '../TaxReviewWizard';

interface ExportStepProps {
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

export function ExportStep({ state, dispatch }: ExportStepProps) {
  const [exporting, setExporting] = useState<'csv' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportedFiles, setExportedFiles] = useState<string[]>([]);

  const handleExport = useCallback(
    async (format: 'csv' | 'json') => {
      if (!state.effectiveUserId) return;
      setExporting(format);
      setError(null);

      try {
        const response = await financeClient.exportTaxReturn({
          userId: state.effectiveUserId,
          financialYear: state.financialYear,
          format: format === 'csv' ? TaxExportFormat.CSV : TaxExportFormat.JSON,
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

        setExportedFiles((prev) => [...prev, format.toUpperCase()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
      } finally {
        setExporting(null);
      }
    },
    [state.effectiveUserId, state.financialYear]
  );

  const calc = state.taxSummary;
  const effectiveWithheld = state.taxWithheld > 0 ? state.taxWithheld : (calc?.taxWithheld ?? 0);
  const refundOrOwed = effectiveWithheld > 0
    ? effectiveWithheld - (calc?.totalTax ?? 0)
    : (calc?.refundOrOwed ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Export & Finish</h2>
          <p className="text-sm text-muted-foreground">
            Download your tax data and complete the review wizard.
          </p>
        </div>
      </div>

      {/* Summary card */}
      {calc && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">FY {state.financialYear} Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-xs text-muted-foreground">Gross Income</div>
                <div className="text-lg font-bold">{formatCurrency(calc.grossIncome)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Deductions</div>
                <div className="text-lg font-bold text-green-600">
                  {formatCurrency(calc.totalDeductions)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Total Tax</div>
                <div className="text-lg font-bold text-red-600">
                  {formatCurrency(calc.totalTax)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  {refundOrOwed >= 0 ? 'Est. Refund' : 'Amount Owed'}
                </div>
                <div
                  className={`text-lg font-bold ${refundOrOwed >= 0 ? 'text-green-600' : 'text-red-600'}`}
                >
                  {formatCurrency(Math.abs(refundOrOwed))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export options */}
      <Card>
        <CardHeader>
          <CardTitle>Download Tax Data</CardTitle>
          <CardDescription>
            Export your tax return data for your accountant or records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Export Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {/* PDF placeholder */}
            <button
              disabled
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed opacity-50 cursor-not-allowed"
            >
              <FileText className="h-10 w-10 text-red-500" />
              <div className="text-center">
                <p className="font-medium">PDF Report</p>
                <p className="text-xs text-muted-foreground">Coming soon</p>
              </div>
            </button>

            {/* CSV */}
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting !== null}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'csv' ? (
                <Loader2 className="h-10 w-10 animate-spin text-green-600" />
              ) : exportedFiles.includes('CSV') ? (
                <CheckCircle2 className="h-10 w-10 text-green-600" />
              ) : (
                <FileSpreadsheet className="h-10 w-10 text-green-600" />
              )}
              <div className="text-center">
                <p className="font-medium">CSV Spreadsheet</p>
                <p className="text-xs text-muted-foreground">For Excel, Google Sheets</p>
              </div>
            </button>

            {/* JSON */}
            <button
              onClick={() => handleExport('json')}
              disabled={exporting !== null}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border-2 border-dashed hover:border-primary hover:bg-accent/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting === 'json' ? (
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
              ) : exportedFiles.includes('JSON') ? (
                <CheckCircle2 className="h-10 w-10 text-blue-600" />
              ) : (
                <FileJson className="h-10 w-10 text-blue-600" />
              )}
              <div className="text-center">
                <p className="font-medium">JSON Data</p>
                <p className="text-xs text-muted-foreground">Structured data export</p>
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Done action */}
      <Card>
        <CardContent className="pt-6 flex flex-col items-center">
          <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
          <h3 className="text-lg font-semibold mb-1">Review Complete</h3>
          <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
            You have completed the tax review wizard for FY {state.financialYear}. Your deductions
            and classifications have been saved.
          </p>
          <Link href="/personal/tax">
            <Button>
              Return to Tax Dashboard
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
