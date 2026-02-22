'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
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
import { Input } from '@/components/ui/input';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Download,
  Trash2,
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
  retryCount: number;
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
  isEditing?: boolean;
}

type BulkStep = 'select' | 'processing' | 'review' | 'importing' | 'done';
type SortField = 'description' | 'amount' | 'date' | 'category' | 'confidence' | 'source';
type SortDirection = 'asc' | 'desc';
type ConfidenceFilter = 'all' | 'high' | 'medium' | 'low';

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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto border border-primary/20">
          <Upload className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">Batch Document Upload</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Upload multiple receipts or bank statements at once.
            Review and edit all extracted transactions before importing.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="lg" className="glow-hover">
          Start Batch Upload
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

  // Sort & filter state
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{ description?: string; amount?: string; date?: string }>({});

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
        retryCount: 0,
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

  const processSingleFile = async (bf: BulkFile): Promise<BulkTransaction[]> => {
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

    // Map to BulkTransaction -- filter to debits only
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

    return mapped;
  };

  const processAllFiles = async () => {
    cancelledRef.current = false;
    setStep('processing');

    const allTransactions: BulkTransaction[] = [];

    for (let i = 0; i < files.length; i++) {
      if (cancelledRef.current) break;

      const bf = files[i];
      if (bf.status === 'done') {
        // Already processed (e.g. from a retry), include its transactions
        allTransactions.push(...bf.transactions);
        continue;
      }

      try {
        const mapped = await processSingleFile(bf);
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

  const retryFile = async (fileId: string) => {
    const bf = files.find((f) => f.id === fileId);
    if (!bf) return;

    // Increment retry count
    setFiles((prev) =>
      prev.map((f) => (f.id === fileId ? { ...f, status: 'pending' as const, error: undefined, retryCount: f.retryCount + 1 } : f)),
    );

    try {
      const updatedBf = { ...bf, status: 'pending' as const, retryCount: bf.retryCount + 1 };
      const mapped = await processSingleFile(updatedBf);

      // Remove old transactions from this file and add new ones
      setTransactions((prev) => [
        ...prev.filter((t) => t.sourceFileId !== fileId),
        ...mapped,
      ]);
      updateFileWithTransactions(fileId, 'done', mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      updateFileStatus(fileId, 'error', message);
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
    setTransactions((prev) =>
      prev.map((t) => {
        // Only toggle visible (filtered) transactions
        if (isTransactionVisible(t)) {
          return { ...t, selected };
        }
        return t;
      }),
    );
  };

  const updateCategory = (txId: string, category: ExpenseCategory) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, category } : t)),
    );
  };

  const removeTransaction = (txId: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== txId));
  };

  // ── Inline editing ──────────────────────────────────

  const startEditing = (tx: BulkTransaction) => {
    setEditingTxId(tx.id);
    setEditValues({
      description: tx.description,
      amount: tx.amount.toFixed(2),
      date: tx.date,
    });
  };

  const saveEditing = () => {
    if (!editingTxId) return;
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id !== editingTxId) return t;
        return {
          ...t,
          description: editValues.description || t.description,
          amount: parseFloat(editValues.amount || String(t.amount)) || t.amount,
          date: editValues.date || t.date,
        };
      }),
    );
    setEditingTxId(null);
    setEditValues({});
  };

  const cancelEditing = () => {
    setEditingTxId(null);
    setEditValues({});
  };

  // ── Sorting ──────────────────────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  // ── Filtering ────────────────────────────────────────

  const isTransactionVisible = useCallback((tx: BulkTransaction): boolean => {
    // Confidence filter
    if (confidenceFilter === 'high' && tx.confidence < 0.8) return false;
    if (confidenceFilter === 'medium' && (tx.confidence < 0.6 || tx.confidence >= 0.8)) return false;
    if (confidenceFilter === 'low' && tx.confidence >= 0.6) return false;

    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        tx.description.toLowerCase().includes(q) ||
        tx.sourceFileName.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q)
      );
    }

    return true;
  }, [confidenceFilter, searchQuery]);

  // ── Computed values ──────────────────────────────────

  const filteredAndSortedTransactions = useMemo(() => {
    const visible = transactions.filter(isTransactionVisible);

    return visible.sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;
      switch (sortField) {
        case 'description':
          return a.description.localeCompare(b.description) * dir;
        case 'amount':
          return (a.amount - b.amount) * dir;
        case 'date':
          return a.date.localeCompare(b.date) * dir;
        case 'category':
          return a.category.localeCompare(b.category) * dir;
        case 'confidence':
          return (a.confidence - b.confidence) * dir;
        case 'source':
          return a.sourceFileName.localeCompare(b.sourceFileName) * dir;
        default:
          return 0;
      }
    });
  }, [transactions, sortField, sortDirection, isTransactionVisible]);

  const selectedTransactions = transactions.filter((t) => t.selected);
  const selectedTotal = selectedTransactions.reduce((sum, t) => sum + t.amount, 0);
  const visibleSelected = filteredAndSortedTransactions.filter((t) => t.selected);
  const allVisibleSelected = filteredAndSortedTransactions.length > 0 && filteredAndSortedTransactions.every((t) => t.selected);
  const someVisibleSelected = filteredAndSortedTransactions.some((t) => t.selected) && !allVisibleSelected;

  const stats = useMemo(() => {
    if (transactions.length === 0) return null;
    const total = transactions.reduce((s, t) => s + t.amount, 0);
    const avgConfidence = transactions.reduce((s, t) => s + t.confidence, 0) / transactions.length;
    const highConfidence = transactions.filter((t) => t.confidence >= 0.8).length;
    const lowConfidence = transactions.filter((t) => t.confidence < 0.6).length;
    const uniqueSources = new Set(transactions.map((t) => t.sourceFileName)).size;
    return { total, avgConfidence, highConfidence, lowConfidence, uniqueSources };
  }, [transactions]);

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
        reasons: [...resp.skippedReasons],
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
    setEditingTxId(null);
    setEditValues({});
    setSortField('date');
    setSortDirection('desc');
    setConfidenceFilter('all');
    setSearchQuery('');
    cancelledRef.current = false;
  };

  // ── Render ───────────────────────────────────────────

  const completedFiles = files.filter((f) => f.status === 'done' || f.status === 'error').length;
  const progressPercent = files.length > 0 ? (completedFiles / files.length) * 100 : 0;
  const currentlyProcessing = files.find(
    (f) => f.status === 'compressing' || f.status === 'processing' || f.status === 'polling',
  );

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Batch Document Upload
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Select receipts and bank statements to process.'}
            {step === 'processing' && (
              <>Processing files... ({completedFiles}/{files.length}){currentlyProcessing && ` -- ${currentlyProcessing.name}`}</>
            )}
            {step === 'review' && `Review ${transactions.length} extracted transaction${transactions.length !== 1 ? 's' : ''} across ${stats?.uniqueSources ?? 0} file${(stats?.uniqueSources ?? 0) !== 1 ? 's' : ''}.`}
            {step === 'importing' && 'Importing selected transactions...'}
            {step === 'done' && 'Import complete!'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
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
    const totalSize = files.reduce((s, f) => s + f.file.size, 0);

    return (
      <div className="space-y-4">
        {/* Extraction method toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            {useGemini ? <Cloud className="h-4 w-4 text-blue-500" /> : <Cpu className="h-4 w-4 text-green-500" />}
            <Label className="text-sm font-medium">{useGemini ? 'Gemini AI' : 'Self-hosted ML'}</Label>
            <span className="text-xs text-muted-foreground">
              ({useGemini ? 'Cloud processing' : 'Private processing'})
            </span>
          </div>
          <Switch checked={useGemini} onCheckedChange={setUseGemini} />
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
            isDragging
              ? 'border-primary bg-primary/5 scale-[1.01]'
              : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30'
          }`}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium">Drop files here or click to browse</p>
          <p className="text-sm text-muted-foreground mt-1">
            JPG, PNG, WebP, PDF -- select multiple files at once
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
          <ScrollArea className="max-h-[220px]">
            <div className="space-y-2">
              {files.map((bf) => (
                <div
                  key={bf.id}
                  className="flex items-center justify-between p-2.5 rounded-md border bg-card transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {bf.type === 'statement' ? (
                      <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-green-500 flex-shrink-0" />
                    )}
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm truncate max-w-[250px]">{bf.name}</span>
                        </TooltipTrigger>
                        <TooltipContent><p>{bf.name}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <Badge variant="secondary" className="text-xs flex-shrink-0">
                      {bf.type === 'statement' ? 'Statement' : 'Receipt'}
                    </Badge>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatFileSize(bf.file.size)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 flex-shrink-0 hover:text-destructive"
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
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {files.length} file{files.length !== 1 ? 's' : ''} selected
            {files.length > 0 && ` (${formatFileSize(totalSize)} total)`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={processAllFiles} disabled={files.length === 0} className="glow-hover">
              Process {files.length > 0 ? `${files.length} File${files.length !== 1 ? 's' : ''}` : 'All'}
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
        <div className="space-y-2">
          <Progress value={progressPercent} className="h-2.5" />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{completedFiles} of {files.length} files processed</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
        </div>

        <ScrollArea className="max-h-[350px]">
          <div className="space-y-2">
            {files.map((bf) => (
              <div
                key={bf.id}
                className={`flex items-center justify-between p-3 rounded-md border transition-colors ${
                  bf.status === 'error'
                    ? 'border-destructive/30 bg-destructive/5'
                    : bf.status === 'done'
                      ? 'border-green-500/20 bg-green-500/5'
                      : ''
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {bf.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />}
                  {bf.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />}
                  {bf.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />}
                  {(bf.status === 'compressing' || bf.status === 'processing' || bf.status === 'polling') && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  )}
                  <span className="text-sm truncate">{bf.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {bf.status === 'compressing' && (
                    <span className="text-xs text-muted-foreground animate-pulse">Compressing...</span>
                  )}
                  {bf.status === 'processing' && (
                    <span className="text-xs text-primary animate-pulse">Extracting...</span>
                  )}
                  {bf.status === 'polling' && (
                    <span className="text-xs text-muted-foreground animate-pulse">Waiting for results...</span>
                  )}
                  {bf.status === 'done' && (
                    <Badge variant="secondary" className="text-xs">
                      {bf.transactions.length} transaction{bf.transactions.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {bf.status === 'error' && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-xs text-red-500 max-w-[180px] truncate cursor-help">
                            {bf.error}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-[300px]">
                          <p className="text-sm">{bf.error}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => {
              cancelledRef.current = true;
              setStep('select');
            }}
          >
            Cancel Processing
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Review ─────────────────────────────────────

  function renderReviewStep() {
    if (transactions.length === 0) {
      return (
        <div className="text-center py-12 space-y-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h3 className="font-semibold text-lg">No Transactions Found</h3>
            <p className="text-muted-foreground text-sm mt-1">
              No transactions were extracted from the uploaded files.
            </p>
          </div>
          <Button variant="outline" onClick={() => { resetState(); }}>
            Try Again
          </Button>
        </div>
      );
    }

    const errorFiles = files.filter((f) => f.status === 'error');

    return (
      <div className="space-y-3">
        {/* Summary stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-md border bg-card text-center">
              <div className="text-lg font-bold font-mono">${stats.total.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">Total Amount</div>
            </div>
            <div className="p-2.5 rounded-md border bg-card text-center">
              <div className="text-lg font-bold">{transactions.length}</div>
              <div className="text-xs text-muted-foreground">Transactions</div>
            </div>
            <div className="p-2.5 rounded-md border bg-card text-center">
              <div className="text-lg font-bold">{Math.round(stats.avgConfidence * 100)}%</div>
              <div className="text-xs text-muted-foreground">Avg Confidence</div>
            </div>
            <div className="p-2.5 rounded-md border bg-card text-center">
              <div className="text-lg font-bold">{selectedTransactions.length}</div>
              <div className="text-xs text-muted-foreground">Selected</div>
            </div>
          </div>
        )}

        {/* Error warnings with retry */}
        {errorFiles.length > 0 && (
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              {errorFiles.length} file{errorFiles.length !== 1 ? 's' : ''} failed to process
            </div>
            <div className="space-y-1">
              {errorFiles.map((f) => (
                <div key={f.id} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground truncate max-w-[300px]">
                    {f.name}: {f.error}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1 flex-shrink-0"
                    onClick={() => retryFile(f.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter / search bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <Input
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={confidenceFilter} onValueChange={(v) => setConfidenceFilter(v as ConfidenceFilter)}>
              <SelectTrigger className="h-8 text-xs w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All confidence</SelectItem>
                <SelectItem value="high" className="text-xs">High (80%+)</SelectItem>
                <SelectItem value="medium" className="text-xs">Medium (60-80%)</SelectItem>
                <SelectItem value="low" className="text-xs">Low (&lt;60%)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1 text-xs">
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleAll(true)}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => toggleAll(false)}>
              Deselect
            </Button>
          </div>
        </div>

        {/* Results count */}
        {(searchQuery || confidenceFilter !== 'all') && (
          <div className="text-xs text-muted-foreground">
            Showing {filteredAndSortedTransactions.length} of {transactions.length} transactions
            {visibleSelected.length > 0 && ` (${visibleSelected.length} selected in view)`}
          </div>
        )}

        {/* Table */}
        <ScrollArea className="max-h-[380px] border rounded-md">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) {
                        // Indeterminate state when some but not all are selected
                        (el as unknown as HTMLInputElement).indeterminate = someVisibleSelected;
                      }
                    }}
                    onCheckedChange={(checked) => toggleAll(!!checked)}
                  />
                </TableHead>
                <TableHead className="w-[110px]">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort('source')}>
                    Source <SortIcon field="source" />
                  </button>
                </TableHead>
                <TableHead>
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort('description')}>
                    Description <SortIcon field="description" />
                  </button>
                </TableHead>
                <TableHead className="w-[130px]">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort('category')}>
                    Category <SortIcon field="category" />
                  </button>
                </TableHead>
                <TableHead className="w-[100px] text-right">
                  <button className="flex items-center gap-1 ml-auto hover:text-foreground transition-colors" onClick={() => handleSort('amount')}>
                    Amount <SortIcon field="amount" />
                  </button>
                </TableHead>
                <TableHead className="w-[100px]">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort('date')}>
                    Date <SortIcon field="date" />
                  </button>
                </TableHead>
                <TableHead className="w-[80px]">
                  <button className="flex items-center gap-1 hover:text-foreground transition-colors" onClick={() => handleSort('confidence')}>
                    Conf. <SortIcon field="confidence" />
                  </button>
                </TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedTransactions.map((tx) => (
                <TableRow
                  key={tx.id}
                  className={`group ${tx.selected ? '' : 'opacity-50'} ${editingTxId === tx.id ? 'bg-primary/5' : ''}`}
                  onDoubleClick={() => {
                    if (editingTxId !== tx.id) startEditing(tx);
                  }}
                >
                  <TableCell>
                    <Checkbox
                      checked={tx.selected}
                      onCheckedChange={() => toggleTransaction(tx.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="text-xs truncate max-w-[100px] block cursor-default">
                            {tx.sourceFileName.length > 12
                              ? tx.sourceFileName.slice(0, 10) + '...'
                              : tx.sourceFileName}
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent><p>{tx.sourceFileName}</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className="max-w-[220px]">
                    {editingTxId === tx.id ? (
                      <Input
                        value={editValues.description || ''}
                        onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditing();
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="h-7 text-xs"
                        autoFocus
                      />
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="font-medium text-sm truncate block cursor-default">
                              {tx.description}
                            </span>
                          </TooltipTrigger>
                          {tx.description.length > 25 && (
                            <TooltipContent><p>{tx.description}</p></TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={tx.category}
                      onValueChange={(v) => updateCategory(tx.id, v as ExpenseCategory)}
                    >
                      <SelectTrigger className="h-7 text-xs">
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
                  <TableCell className="text-right">
                    {editingTxId === tx.id ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={editValues.amount || ''}
                        onChange={(e) => setEditValues({ ...editValues, amount: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditing();
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="h-7 text-xs text-right w-[80px] ml-auto"
                      />
                    ) : (
                      <span className="font-mono text-sm">${tx.amount.toFixed(2)}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingTxId === tx.id ? (
                      <Input
                        type="date"
                        value={editValues.date || ''}
                        onChange={(e) => setEditValues({ ...editValues, date: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditing();
                          if (e.key === 'Escape') cancelEditing();
                        }}
                        className="h-7 text-xs"
                      />
                    ) : (
                      <span className="text-sm">{tx.date}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <ConfidenceBadge confidence={tx.confidence} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      {editingTxId === tx.id ? (
                        <>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={saveEditing}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={cancelEditing}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                          onClick={() => removeTransaction(tx.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredAndSortedTransactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No transactions match your filter criteria.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <span className="text-xs text-muted-foreground">
              Double-click a row to edit values
            </span>
          </div>
          <Button
            onClick={importSelected}
            disabled={selectedTransactions.length === 0}
            className="glow-hover"
          >
            <Download className="h-4 w-4 mr-2" />
            Import {selectedTransactions.length} Selected (${selectedTotal.toFixed(2)})
          </Button>
        </div>
      </div>
    );
  }

  // ── Step: Importing ──────────────────────────────────

  function renderImportingStep() {
    return (
      <div className="text-center py-16 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
        <div>
          <h3 className="font-semibold text-lg">Importing Transactions</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Creating {selectedTransactions.length} expense{selectedTransactions.length !== 1 ? 's' : ''}...
          </p>
        </div>
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────

  function renderDoneStep() {
    return (
      <div className="text-center py-10 space-y-4">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto border border-green-500/20">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-2xl font-bold">
            {importResult?.imported ?? 0} Transaction{(importResult?.imported ?? 0) !== 1 ? 's' : ''} Imported
          </h3>
          {(importResult?.skipped ?? 0) > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {importResult!.skipped} duplicate{importResult!.skipped !== 1 ? 's' : ''} skipped
            </p>
          )}
          {importResult?.reasons && importResult.reasons.length > 0 && (
            <div className="mt-4 text-left mx-auto max-w-md">
              <p className="text-xs font-medium text-muted-foreground mb-2">Skip reasons:</p>
              <ScrollArea className="max-h-[120px]">
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                  {importResult.reasons.map((r, i) => (
                    <li key={i} className="truncate">{r}</li>
                  ))}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>
        <Button onClick={handleClose} size="lg" className="glow-hover">
          Done
        </Button>
      </div>
    );
  }
}
