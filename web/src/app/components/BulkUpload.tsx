'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { useFinance } from '../context/FinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { financeClient, DocumentType } from '@/lib/financeService';
import { ExtractionMethod, ExtractionStatus } from '@/gen/pfinance/v1/types_pb';
import type { ExtractedTransaction } from '@/gen/pfinance/v1/types_pb';
import { ExpenseCategory } from '../types';
import { ExpenseFrequency as ProtoExpenseFrequency } from '@/gen/pfinance/v1/types_pb';
import { compressImage, readFileAsDataUrl, base64ToUint8Array } from '../utils/imageCompression';
import {
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  ImageIcon,
  Cpu,
  Cloud,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

// ── Types ──────────────────────────────────────────────

interface BulkFile {
  id: string;
  file: File;
  name: string;
  type: 'receipt' | 'statement';
  status: 'pending' | 'compressing' | 'processing' | 'polling' | 'done' | 'error';
  error?: string;
  transactions: BulkTransaction[];
}

interface BulkTransaction {
  id: string;
  sourceFileId: string;
  sourceFileName: string;
  selected: boolean;
  description: string;
  amount: number;
  category: ExpenseCategory;
  date: string;
  confidence: number;
  rawTransaction: ExtractedTransaction;
}

type BulkStep = 'select' | 'processing' | 'review' | 'importing' | 'done';

const categories: ExpenseCategory[] = [
  'Food', 'Housing', 'Transportation', 'Entertainment', 'Healthcare',
  'Utilities', 'Shopping', 'Education', 'Travel', 'Other',
];

function mapProtoCategory(protoCategory: number): string {
  const categoryMap: Record<number, string> = {
    0: 'Other', 1: 'Food', 2: 'Housing', 3: 'Transportation',
    4: 'Entertainment', 5: 'Healthcare', 6: 'Utilities',
    7: 'Shopping', 8: 'Education', 9: 'Travel', 10: 'Other',
  };
  return categoryMap[protoCategory] || 'Other';
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

let idCounter = 0;
function nextId(prefix: string) {
  return `${prefix}-${++idCounter}-${Date.now()}`;
}

// ── Props ──────────────────────────────────────────────

interface BulkUploadTriggerProps {
  useGemini: boolean;
  setUseGemini: (v: boolean) => void;
}

// ── Component ──────────────────────────────────────────

export function BulkUploadTrigger({ useGemini, setUseGemini }: BulkUploadTriggerProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <div className="text-center py-6 space-y-4">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Bulk Upload</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload multiple receipts or bank statements at once.
            Review all extracted transactions before importing.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="lg">
          Start Bulk Upload
        </Button>
      </div>

      <BulkUploadDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        useGemini={useGemini}
        setUseGemini={setUseGemini}
      />
    </>
  );
}

// ── Dialog ──────────────────────────────────────────────

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  useGemini: boolean;
  setUseGemini: (v: boolean) => void;
}

function BulkUploadDialog({ open, onOpenChange, useGemini, setUseGemini }: BulkUploadDialogProps) {
  const { refreshData } = useFinance();
  const { user } = useAuth();

  const [step, setStep] = useState<BulkStep>('select');
  const [files, setFiles] = useState<BulkFile[]>([]);
  const [transactions, setTransactions] = useState<BulkTransaction[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; reasons: string[] } | null>(null);

  const cancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Helpers ──────────────────────────────────────────

  const addFiles = useCallback((fileList: FileList) => {
    const newFiles: BulkFile[] = Array.from(fileList)
      .filter((f) => {
        const ext = f.name.toLowerCase();
        return (
          f.type.startsWith('image/') ||
          f.type === 'application/pdf' ||
          ext.endsWith('.pdf') ||
          ext.endsWith('.jpg') ||
          ext.endsWith('.jpeg') ||
          ext.endsWith('.png') ||
          ext.endsWith('.webp')
        );
      })
      .map((f) => ({
        id: nextId('bf'),
        file: f,
        name: f.name,
        type: isPdfFile(f) ? 'statement' as const : 'receipt' as const,
        status: 'pending' as const,
        transactions: [],
      }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ── Drag & Drop ──────────────────────────────────────

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = '';
      }
    },
    [addFiles],
  );

  // ── Processing ───────────────────────────────────────

  const processAllFiles = async () => {
    cancelledRef.current = false;
    setStep('processing');

    const allTransactions: BulkTransaction[] = [];

    for (let i = 0; i < files.length; i++) {
      if (cancelledRef.current) break;

      const bf = files[i];

      try {
        // Compress images, read PDFs directly
        let dataUrl: string;
        const isPdf = isPdfFile(bf.file);

        if (isPdf) {
          updateFileStatus(bf.id, 'processing');
          dataUrl = await readFileAsDataUrl(bf.file);
        } else {
          updateFileStatus(bf.id, 'compressing');
          dataUrl = await compressImage(bf.file);
          updateFileStatus(bf.id, 'processing');
        }

        const bytes = base64ToUint8Array(dataUrl);
        const docType = isPdf ? DocumentType.BANK_STATEMENT : DocumentType.RECEIPT;

        const response = await financeClient.extractDocument({
          documentData: bytes,
          documentType: docType,
          filename: bf.name,
          asyncProcessing: false,
          validateWithApi: false,
          extractionMethod: useGemini
            ? ExtractionMethod.GEMINI
            : ExtractionMethod.SELF_HOSTED,
        });

        let resultTransactions: ExtractedTransaction[] = [];

        if (response.status === ExtractionStatus.PROCESSING && response.jobId) {
          updateFileStatus(bf.id, 'polling');
          const result = await pollExtractionJob(response.jobId);
          if (result) {
            resultTransactions = result;
          }
        } else if (response.result) {
          resultTransactions = response.result.transactions;
        }

        // Map to BulkTransaction — filter to debits only
        const mapped: BulkTransaction[] = resultTransactions
          .filter((tx) => tx.isDebit)
          .map((tx) => {
            const catName = mapProtoCategory(tx.suggestedCategory);
            const category = categories.includes(catName as ExpenseCategory)
              ? (catName as ExpenseCategory)
              : 'Other';
            return {
              id: nextId('bt'),
              sourceFileId: bf.id,
              sourceFileName: bf.name,
              selected: (tx.confidence || 0) >= 0.5,
              description: tx.normalizedMerchant || tx.description,
              amount: tx.amount,
              category,
              date: tx.date || new Date().toISOString().split('T')[0],
              confidence: tx.confidence || 0,
              rawTransaction: tx,
            };
          });

        allTransactions.push(...mapped);
        updateFileWithTransactions(bf.id, 'done', mapped);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Processing failed';
        updateFileStatus(bf.id, 'error', message);
      }
    }

    setTransactions(allTransactions);
    if (!cancelledRef.current) {
      setStep('review');
    }
  };

  async function pollExtractionJob(jobId: string): Promise<ExtractedTransaction[] | null> {
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      if (cancelledRef.current) return null;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const jobResp = await financeClient.getExtractionJob({ jobId });
        if (jobResp.job?.status === ExtractionStatus.COMPLETED && jobResp.job.result) {
          return jobResp.job.result.transactions;
        }
        if (jobResp.job?.status === ExtractionStatus.FAILED) {
          throw new Error(jobResp.job.errorMessage || 'Extraction failed');
        }
      } catch (pollErr) {
        console.error('Poll error:', pollErr);
      }
    }
    throw new Error('Extraction timed out');
  }

  function updateFileStatus(id: string, status: BulkFile['status'], error?: string) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status, error } : f)),
    );
  }

  function updateFileWithTransactions(id: string, status: BulkFile['status'], txs: BulkTransaction[]) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status, transactions: txs } : f)),
    );
  }

  // ── Review helpers ───────────────────────────────────

  const toggleTransaction = (txId: string) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, selected: !t.selected } : t)),
    );
  };

  const toggleAll = (selected: boolean) => {
    setTransactions((prev) => prev.map((t) => ({ ...t, selected })));
  };

  const updateCategory = (txId: string, category: ExpenseCategory) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, category } : t)),
    );
  };

  const selectedTransactions = transactions.filter((t) => t.selected);
  const selectedTotal = selectedTransactions.reduce((sum, t) => sum + t.amount, 0);

  // ── Import ───────────────────────────────────────────

  const importSelected = async () => {
    if (!user?.uid || selectedTransactions.length === 0) return;
    setStep('importing');

    try {
      const resp = await financeClient.importExtractedTransactions({
        userId: user.uid,
        groupId: '',
        transactions: selectedTransactions.map((t) => t.rawTransaction),
        skipDuplicates: true,
        defaultFrequency: ProtoExpenseFrequency.ONCE,
      });
      setImportResult({
        imported: resp.importedCount,
        skipped: resp.skippedCount,
        reasons: resp.skippedReasons,
      });
      setStep('done');
    } catch (err) {
      console.error('Import failed:', err);
      setStep('review');
    }
  };

  // ── Close / Reset ────────────────────────────────────

  const handleClose = () => {
    if (step === 'done') {
      refreshData();
    }
    resetState();
    onOpenChange(false);
  };

  const resetState = () => {
    setStep('select');
    setFiles([]);
    setTransactions([]);
    setImportResult(null);
    cancelledRef.current = false;
  };

  // ── Render ───────────────────────────────────────────

  const completedFiles = files.filter((f) => f.status === 'done' || f.status === 'error').length;
  const progressPercent = files.length > 0 ? (completedFiles / files.length) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Bulk Upload</DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Select receipts and statements to process.'}
            {step === 'processing' && `Processing files... (${completedFiles}/${files.length})`}
            {step === 'review' && `Review ${transactions.length} extracted transactions.`}
            {step === 'importing' && 'Importing transactions...'}
            {step === 'done' && 'Import complete!'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col min-h-0">
          {step === 'select' && renderSelectStep()}
          {step === 'processing' && renderProcessingStep()}
          {step === 'review' && renderReviewStep()}
          {step === 'importing' && renderImportingStep()}
          {step === 'done' && renderDoneStep()}
        </div>
      </DialogContent>
    </Dialog>
  );

  // ── Step: Select ─────────────────────────────────────

  function renderSelectStep() {
    return (
      <div className="flex flex-col gap-4 min-h-0 h-full">
        {/* Extraction method toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            {useGemini ? <Cloud className="h-4 w-4 text-blue-500" /> : <Cpu className="h-4 w-4 text-green-500" />}
            <Label className="text-sm">{useGemini ? 'Gemini AI' : 'Self-hosted ML'}</Label>
          </div>
          <Switch checked={useGemini} onCheckedChange={setUseGemini} />
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors flex-shrink-0 ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Drop files here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">
            JPG, PNG, WebP, PDF — select multiple files
          </p>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,.pdf,application/pdf"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-2">
              {files.map((bf) => (
                <div
                  key={bf.id}
                  className="flex items-center justify-between p-2 rounded-md border bg-card"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {bf.type === 'statement' ? (
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                    )}
                    <span className="text-sm truncate">{bf.name}</span>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {bf.type === 'statement' ? 'Statement' : 'Receipt'}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {(bf.file.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 flex-shrink-0"
                    onClick={(e) => { e.stopPropagation(); removeFile(bf.id); }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-2 flex-shrink-0">
          <span className="text-sm text-muted-foreground">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
            {files.length > 0 && ` (${(files.reduce((sum, f) => sum + f.file.size, 0) / (1024 * 1024)).toFixed(1)} MB total)`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={processAllFiles} disabled={files.length === 0}>
              Process {files.length} File{files.length !== 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Processing ─────────────────────────────────

  function renderProcessingStep() {
    return (
      <div className="space-y-4">
        <Progress value={progressPercent} className="h-2" />
        <p className="text-sm text-center text-muted-foreground">
          {completedFiles} of {files.length} files processed
        </p>

        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2">
            {files.map((bf) => (
              <div
                key={bf.id}
                className="flex items-center justify-between p-3 rounded-md border"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {bf.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  {bf.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  {(bf.status === 'pending') && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}
                  {(bf.status === 'compressing' || bf.status === 'processing' || bf.status === 'polling') && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  )}
                  <span className="text-sm truncate">{bf.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {bf.status === 'compressing' && <span className="text-xs text-muted-foreground">Compressing...</span>}
                  {bf.status === 'processing' && <span className="text-xs text-muted-foreground">Extracting...</span>}
                  {bf.status === 'polling' && <span className="text-xs text-muted-foreground">Waiting...</span>}
                  {bf.status === 'done' && (
                    <span className="text-xs text-muted-foreground">
                      {bf.transactions.length} transaction{bf.transactions.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  {bf.status === 'error' && (
                    <span className="text-xs text-red-500 max-w-[200px] truncate">{bf.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2">
          <Button
            variant="outline"
            onClick={() => {
              cancelledRef.current = true;
              setStep('select');
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Review ─────────────────────────────────────

  function renderReviewStep() {
    if (transactions.length === 0) {
      return (
        <div className="text-center py-8 space-y-3">
          <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">No transactions were extracted from the uploaded files.</p>
          <Button variant="outline" onClick={() => { resetState(); }}>
            Try Again
          </Button>
        </div>
      );
    }

    const errorFiles = files.filter((f) => f.status === 'error');

    return (
      <div className="space-y-3">
        {/* Summary */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {files.filter((f) => f.status === 'done').length} file{files.filter((f) => f.status === 'done').length !== 1 ? 's' : ''} &middot;{' '}
            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} &middot;{' '}
            ${transactions.reduce((s, t) => s + t.amount, 0).toFixed(2)} total
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>
              Deselect All
            </Button>
          </div>
        </div>

        {/* Error warnings */}
        {errorFiles.length > 0 && (
          <div className="p-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-700 dark:text-yellow-400">
            {errorFiles.length} file{errorFiles.length !== 1 ? 's' : ''} failed to process:{' '}
            {errorFiles.map((f) => f.name).join(', ')}
          </div>
        )}

        {/* Table */}
        <ScrollArea className="max-h-[400px] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-[120px]">Source</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[140px]">Category</TableHead>
                <TableHead className="w-[90px] text-right">Amount</TableHead>
                <TableHead className="w-[100px]">Date</TableHead>
                <TableHead className="w-[80px]">Confidence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((tx) => (
                <TableRow key={tx.id} className={tx.selected ? '' : 'opacity-50'}>
                  <TableCell>
                    <Checkbox
                      checked={tx.selected}
                      onCheckedChange={() => toggleTransaction(tx.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs truncate max-w-[110px] block">
                      {tx.sourceFileName.length > 15
                        ? tx.sourceFileName.slice(0, 12) + '...'
                        : tx.sourceFileName}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {tx.description}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={tx.category}
                      onValueChange={(v) => updateCategory(tx.id, v as ExpenseCategory)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c} value={c} className="text-xs">
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${tx.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-sm">{tx.date}</TableCell>
                  <TableCell>
                    <ConfidenceBadge confidence={tx.confidence} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={importSelected}
            disabled={selectedTransactions.length === 0}
          >
            Import {selectedTransactions.length} Selected (${selectedTotal.toFixed(2)})
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Importing ──────────────────────────────────

  function renderImportingStep() {
    return (
      <div className="text-center py-12 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">
          Importing {selectedTransactions.length} transaction{selectedTransactions.length !== 1 ? 's' : ''}...
        </p>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────

  function renderDoneStep() {
    return (
      <div className="text-center py-8 space-y-4">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">
            Imported {importResult?.imported ?? 0} Transaction{(importResult?.imported ?? 0) !== 1 ? 's' : ''}
          </h3>
          {(importResult?.skipped ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              Skipped {importResult!.skipped} duplicate{importResult!.skipped !== 1 ? 's' : ''}
            </p>
          )}
          {importResult?.reasons && importResult.reasons.length > 0 && (
            <div className="mt-3 text-left mx-auto max-w-md">
              <p className="text-xs text-muted-foreground mb-1">Skip reasons:</p>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                {importResult.reasons.slice(0, 5).map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
                {importResult.reasons.length > 5 && (
                  <li>...and {importResult.reasons.length - 5} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
        <Button onClick={handleClose}>Done</Button>
      </div>
    );
  }
}
