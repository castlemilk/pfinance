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
import type { ExtractedTransaction, StatementMetadata } from '@/gen/pfinance/v1/types_pb';
import { ExpenseCategory } from '../types';
import { ExpenseFrequency as ProtoExpenseFrequency } from '@/gen/pfinance/v1/types_pb';
import { compressImage, readFileAsDataUrl, base64ToUint8Array } from '../utils/imageCompression';
import { getCurrentAustralianFY } from '@/app/constants/taxDeductions';
import { useRouter } from 'next/navigation';
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
  Sparkles,
  ArrowRight,
  Pause,
  Play,
  Square,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

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
  statementMetadata?: StatementMetadata;
  duplicateWarnings?: string[];
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

const IMPORT_BATCH_SIZE = 10;
const MAX_RETRIES = 2;

interface ImportProgress {
  imported: number;
  skipped: number;
  failed: number;
  total: number;
  reasons: string[];
  failedTransactions: BulkTransaction[];
}

type ImportPhase = 'importing' | 'classifying';

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
  const router = useRouter();

  const [step, setStep] = useState<BulkStep>('select');
  const [files, setFiles] = useState<BulkFile[]>([]);
  const [transactions, setTransactions] = useState<BulkTransaction[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; failed: number; reasons: string[]; failedTransactions: BulkTransaction[] } | null>(null);

  // Batch import progress state
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [importPhase, setImportPhase] = useState<ImportPhase>('importing');
  const [taxProgress, setTaxProgress] = useState(0);
  const taxProgressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tax classification state
  const [classifyForTax, setClassifyForTax] = useState(true);
  const [classifyingTax, setClassifyingTax] = useState(false);
  const [taxClassifyResult, setTaxClassifyResult] = useState<{
    totalProcessed: number;
    autoApplied: number;
    needsReview: number;
    skipped: number;
  } | null>(null);

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

  // Pause/resume state
  const [isPaused, setIsPaused] = useState(false);
  const pausedRef = useRef(false);
  const processingFileIndex = useRef(0);

  // Size-based progress estimation
  const [currentFileProgress, setCurrentFileProgress] = useState(0);
  const processingStartTime = useRef(0);
  const fileProcessingTimes = useRef<{ bytes: number; ms: number }[]>([]);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const processSingleFile = async (bf: BulkFile): Promise<{ transactions: BulkTransaction[]; statementMetadata?: StatementMetadata; duplicateWarnings?: string[] }> => {
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
    let effectiveMetadata = response.statementMetadata;

    if (response.status === ExtractionStatus.PROCESSING && response.jobId) {
      updateFileStatus(bf.id, 'polling');
      const pollResult = await pollExtractionJob(response.jobId);
      if (pollResult) {
        resultTransactions = pollResult.transactions;
        // Prefer metadata from polled result if available (async path)
        if (pollResult.statementMetadata) {
          effectiveMetadata = pollResult.statementMetadata;
        }
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

    return {
      transactions: mapped,
      statementMetadata: effectiveMetadata,
      duplicateWarnings: response.duplicateWarnings.length > 0 ? [...response.duplicateWarnings] : undefined,
    };
  };

  const getEstimatedFileTime = (fileSize: number): number => {
    const times = fileProcessingTimes.current;
    if (times.length === 0) {
      return Math.max(2000, (fileSize / (1024 * 1024)) * 2000);
    }
    const totalProcessedBytes = times.reduce((s, t) => s + t.bytes, 0);
    const totalProcessedMs = times.reduce((s, t) => s + t.ms, 0);
    return fileSize * (totalProcessedMs / totalProcessedBytes);
  };

  const startProgressInterval = (fileSize: number) => {
    stopProgressInterval();
    const interval = setInterval(() => {
      const elapsed = Date.now() - processingStartTime.current;
      const estimatedMs = getEstimatedFileTime(fileSize);
      const progress = Math.min(0.95, elapsed / estimatedMs);
      setCurrentFileProgress(progress);
    }, 500);
    progressIntervalRef.current = interval;
  };

  const stopProgressInterval = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setCurrentFileProgress(0);
  };

  const stopAndReview = () => {
    cancelledRef.current = true;
    stopProgressInterval();
    const allTx: BulkTransaction[] = [];
    for (const bf of files) {
      if (bf.status === 'done') {
        allTx.push(...bf.transactions);
      }
    }
    setTransactions(allTx);
    setStep('review');
  };

  const processAllFiles = async () => {
    cancelledRef.current = false;

    // If resuming from pause, continue from saved index
    if (!isPaused) {
      setStep('processing');
      processingFileIndex.current = 0;
      fileProcessingTimes.current = [];
    }

    setIsPaused(false);
    pausedRef.current = false;

    const allTransactions: BulkTransaction[] = [];

    // Collect transactions from already-completed files before resume point
    for (let i = 0; i < processingFileIndex.current; i++) {
      if (files[i].status === 'done') {
        allTransactions.push(...files[i].transactions);
      }
    }

    for (let i = processingFileIndex.current; i < files.length; i++) {
      if (cancelledRef.current) break;

      if (pausedRef.current) {
        processingFileIndex.current = i;
        setIsPaused(true);
        stopProgressInterval();
        setTransactions(allTransactions);
        return;
      }

      const bf = files[i];
      if (bf.status === 'done') {
        allTransactions.push(...bf.transactions);
        continue;
      }

      try {
        processingStartTime.current = Date.now();
        startProgressInterval(bf.file.size);
        const result = await processSingleFile(bf);
        stopProgressInterval();
        fileProcessingTimes.current.push({
          bytes: bf.file.size,
          ms: Date.now() - processingStartTime.current,
        });
        allTransactions.push(...result.transactions);
        updateFileWithTransactions(bf.id, 'done', result.transactions, result.statementMetadata, result.duplicateWarnings);
      } catch (err) {
        stopProgressInterval();
        fileProcessingTimes.current.push({
          bytes: bf.file.size,
          ms: Date.now() - processingStartTime.current,
        });
        const message = err instanceof Error ? err.message : 'Processing failed';
        updateFileStatus(bf.id, 'error', message);
      }
    }

    stopProgressInterval();
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
      const result = await processSingleFile(updatedBf);

      // Remove old transactions from this file and add new ones
      setTransactions((prev) => [
        ...prev.filter((t) => t.sourceFileId !== fileId),
        ...result.transactions,
      ]);
      updateFileWithTransactions(fileId, 'done', result.transactions, result.statementMetadata, result.duplicateWarnings);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Processing failed';
      updateFileStatus(fileId, 'error', message);
    }
  };

  async function pollExtractionJob(jobId: string): Promise<{ transactions: ExtractedTransaction[]; statementMetadata?: StatementMetadata } | null> {
    const maxPolls = 60;
    for (let i = 0; i < maxPolls; i++) {
      if (cancelledRef.current) return null;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      try {
        const jobResp = await financeClient.getExtractionJob({ jobId });
        if (jobResp.job?.status === ExtractionStatus.COMPLETED && jobResp.job.result) {
          return {
            transactions: jobResp.job.result.transactions,
            statementMetadata: jobResp.job.result.statementMetadata,
          };
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

  function updateFileWithTransactions(id: string, status: BulkFile['status'], txs: BulkTransaction[], metadata?: StatementMetadata, dupWarnings?: string[]) {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status, transactions: txs, statementMetadata: metadata, duplicateWarnings: dupWarnings } : f)),
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

  const importBatch = async (batch: BulkTransaction[]): Promise<{ imported: number; skipped: number; reasons: string[] }> => {
    if (!user?.uid) throw new Error('Not authenticated');

    const fileWithMetadata = files.find((f) => f.statementMetadata);
    const firstFileName = files[0]?.name || '';

    const resp = await financeClient.importExtractedTransactions({
      userId: user.uid,
      groupId: '',
      transactions: batch.map((t) => t.rawTransaction),
      skipDuplicates: true,
      defaultFrequency: ProtoExpenseFrequency.ONCE,
      statementMetadata: fileWithMetadata?.statementMetadata,
      originalFilename: firstFileName,
    });

    return {
      imported: resp.importedCount,
      skipped: resp.skippedCount,
      reasons: [...resp.skippedReasons],
    };
  };

  const importSelected = async (txsToImport?: BulkTransaction[]) => {
    const toImport = txsToImport || selectedTransactions;
    if (!user?.uid || toImport.length === 0) return;
    setStep('importing');
    setImportPhase('importing');

    const progress: ImportProgress = {
      imported: 0,
      skipped: 0,
      failed: 0,
      total: toImport.length,
      reasons: [],
      failedTransactions: [],
    };
    setImportProgress({ ...progress });

    // Split into batches
    const batches: BulkTransaction[][] = [];
    for (let i = 0; i < toImport.length; i += IMPORT_BATCH_SIZE) {
      batches.push(toImport.slice(i, i + IMPORT_BATCH_SIZE));
    }

    for (const batch of batches) {
      let succeeded = false;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await importBatch(batch);
          progress.imported += result.imported;
          progress.skipped += result.skipped;
          progress.reasons.push(...result.reasons);
          succeeded = true;
          break;
        } catch (err) {
          console.error(`Batch import attempt ${attempt + 1} failed:`, err);
          if (attempt < MAX_RETRIES) {
            // Exponential backoff: 500ms, 1500ms
            await new Promise((r) => setTimeout(r, 500 * Math.pow(3, attempt)));
          }
        }
      }

      if (!succeeded) {
        progress.failed += batch.length;
        progress.failedTransactions.push(...batch);
      }

      setImportProgress({ ...progress });
    }

    // Store final import result
    setImportResult({
      imported: progress.imported,
      skipped: progress.skipped,
      failed: progress.failed,
      reasons: progress.reasons,
      failedTransactions: progress.failedTransactions,
    });

    // Run tax classification if enabled and any transactions were imported
    if (classifyForTax && progress.imported > 0) {
      setImportPhase('classifying');
      setClassifyingTax(true);
      setTaxProgress(0);

      // Start animated estimated progress
      const estimatedMs = progress.imported * 200; // ~200ms per expense
      const startTime = Date.now();
      taxProgressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const estimated = Math.min(95, (elapsed / estimatedMs) * 100);
        setTaxProgress(estimated);
      }, 500);

      try {
        const taxResp = await financeClient.batchClassifyTaxDeductibility({
          userId: user.uid,
          financialYear: getCurrentAustralianFY(),
          autoApply: true,
        });
        setTaxClassifyResult({
          totalProcessed: taxResp.totalProcessed,
          autoApplied: taxResp.autoApplied,
          needsReview: taxResp.needsReview,
          skipped: taxResp.skipped,
        });
      } catch (taxErr) {
        console.error('Tax classification failed:', taxErr);
      } finally {
        if (taxProgressIntervalRef.current) {
          clearInterval(taxProgressIntervalRef.current);
          taxProgressIntervalRef.current = null;
        }
        setTaxProgress(100);
        setClassifyingTax(false);
      }
    }

    setStep('done');
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
    setImportProgress(null);
    setImportPhase('importing');
    setTaxProgress(0);
    if (taxProgressIntervalRef.current) {
      clearInterval(taxProgressIntervalRef.current);
      taxProgressIntervalRef.current = null;
    }
    setEditingTxId(null);
    setEditValues({});
    setSortField('date');
    setSortDirection('desc');
    setConfidenceFilter('all');
    setSearchQuery('');
    setClassifyForTax(true);
    setClassifyingTax(false);
    setTaxClassifyResult(null);
    cancelledRef.current = false;
    setIsPaused(false);
    pausedRef.current = false;
    processingFileIndex.current = 0;
    setCurrentFileProgress(0);
    processingStartTime.current = 0;
    fileProcessingTimes.current = [];
    stopProgressInterval();
  };

  // ── Render ───────────────────────────────────────────

  const completedFiles = files.filter((f) => f.status === 'done' || f.status === 'error').length;
  const totalBytes = files.reduce((s, f) => s + f.file.size, 0);
  const completedBytes = files
    .filter((f) => f.status === 'done' || f.status === 'error')
    .reduce((s, f) => s + f.file.size, 0);
  const currentlyProcessing = files.find(
    (f) => f.status === 'compressing' || f.status === 'processing' || f.status === 'polling',
  );
  const currentFileBytes = currentlyProcessing ? currentlyProcessing.file.size * currentFileProgress : 0;
  const progressPercent = totalBytes > 0 ? ((completedBytes + currentFileBytes) / totalBytes) * 100 : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-5xl sm:max-w-5xl max-h-[90vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Batch Document Upload
          </DialogTitle>
          <DialogDescription>
            {step === 'select' && 'Select receipts and bank statements to process.'}
            {step === 'processing' && (
              <>{isPaused ? 'Processing paused' : 'Processing files...'} ({completedFiles}/{files.length}){currentlyProcessing && !isPaused && ` -- ${currentlyProcessing.name}`}</>
            )}
            {step === 'review' && `Review ${transactions.length} extracted transaction${transactions.length !== 1 ? 's' : ''} across ${stats?.uniqueSources ?? 0} file${(stats?.uniqueSources ?? 0) !== 1 ? 's' : ''}.`}
            {step === 'importing' && (importPhase === 'classifying' ? 'Classifying imported expenses for tax...' : 'Importing selected transactions...')}
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
    const totalSize = files.reduce((s, f) => s + f.file.size, 0);

    return (
      <div className="flex flex-col gap-4 min-h-0 flex-1">
        {/* Extraction method toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 flex-shrink-0">
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
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 flex-shrink-0 ${
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
          <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
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
        )}

        {/* Actions */}
        <div className="flex justify-between items-center pt-2 border-t flex-shrink-0">
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
    const times = fileProcessingTimes.current;
    let etaText: string | null = null;
    if (times.length > 0 && !isPaused) {
      const totalProcessedBytes = times.reduce((s, t) => s + t.bytes, 0);
      const totalProcessedMs = times.reduce((s, t) => s + t.ms, 0);
      const bytesPerMs = totalProcessedBytes / totalProcessedMs;
      const remainingBytes = totalBytes - completedBytes - currentFileBytes;
      const etaSeconds = Math.ceil(Math.max(0, remainingBytes / bytesPerMs) / 1000);
      etaText = etaSeconds > 60
        ? `~${Math.floor(etaSeconds / 60)}m ${etaSeconds % 60}s remaining`
        : `~${etaSeconds}s remaining`;
    }

    return (
      <div className="flex flex-col gap-4 min-h-0 flex-1">
        <div className="space-y-2 flex-shrink-0">
          <div className="relative">
            <Progress value={progressPercent} className={`h-2.5 transition-opacity ${isPaused ? 'opacity-50' : ''}`} />
            {isPaused && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Badge variant="secondary" className="text-xs font-medium">Paused</Badge>
              </div>
            )}
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>
              {completedFiles} of {files.length} files processed
              {isPaused && ' — Paused'}
            </span>
            <div className="flex items-center gap-2">
              {etaText && <span className="text-xs">{etaText}</span>}
              <span>{Math.round(progressPercent)}%</span>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
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
                <span className="text-xs text-muted-foreground flex-shrink-0">{formatFileSize(bf.file.size)}</span>
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

        <div className="flex justify-between items-center pt-2 border-t flex-shrink-0">
          <div className="flex gap-2">
            {isPaused ? (
              <Button
                variant="outline"
                onClick={() => {
                  pausedRef.current = false;
                  setIsPaused(false);
                  processAllFiles();
                }}
                className="gap-1.5"
              >
                <Play className="h-3.5 w-3.5" />
                Resume
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={() => { pausedRef.current = true; }}
                className="gap-1.5"
              >
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            onClick={stopAndReview}
            className="gap-1.5"
          >
            <Square className="h-3.5 w-3.5" />
            Stop & Review
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
      <div className="flex flex-col gap-3 min-h-0 flex-1">
        {/* Summary stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-shrink-0">
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
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/30 space-y-2 flex-shrink-0">
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

        {/* Duplicate warnings */}
        {files.some((f) => f.duplicateWarnings && f.duplicateWarnings.length > 0) && (
          <Alert className="border-amber-500/30 bg-amber-500/5 flex-shrink-0">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <AlertTitle className="text-amber-600 dark:text-amber-400">Duplicate Warnings</AlertTitle>
            <AlertDescription>
              <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5 mt-1">
                {files
                  .filter((f) => f.duplicateWarnings && f.duplicateWarnings.length > 0)
                  .flatMap((f) => f.duplicateWarnings!.map((w, i) => (
                    <li key={`${f.id}-${i}`}>{w}</li>
                  )))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Filter / search bar */}
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
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
          <div className="text-xs text-muted-foreground flex-shrink-0">
            Showing {filteredAndSortedTransactions.length} of {transactions.length} transactions
            {visibleSelected.length > 0 && ` (${visibleSelected.length} selected in view)`}
          </div>
        )}

        {/* Table */}
        <div className="min-h-0 flex-1 overflow-y-auto border rounded-md">
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
        </div>

        {/* Tax classification toggle */}
        <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <div>
              <Label className="text-sm font-medium">Classify for Tax Deductibility</Label>
              <p className="text-xs text-muted-foreground">Automatically classify imported expenses for tax</p>
            </div>
          </div>
          <Switch checked={classifyForTax} onCheckedChange={setClassifyForTax} />
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center pt-2 border-t flex-shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
            <span className="text-xs text-muted-foreground">
              Double-click a row to edit values
            </span>
          </div>
          <Button
            onClick={() => importSelected()}
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
    const p = importProgress;
    const processed = p ? p.imported + p.skipped + p.failed : 0;
    const total = p?.total ?? selectedTransactions.length;
    const importPercent = total > 0 ? (processed / total) * 100 : 0;

    return (
      <div className="py-8 px-4 space-y-6 max-w-lg mx-auto w-full">
        {/* Phase 1: Importing */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {importPhase === 'importing' ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
            <h3 className="font-semibold text-sm">
              {importPhase === 'importing'
                ? `Importing transactions... ${processed} of ${total}`
                : `Import complete — ${p?.imported ?? 0} imported`}
            </h3>
          </div>
          <Progress value={importPhase === 'importing' ? importPercent : 100} className="h-2.5" />
          {p && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">{p.imported} imported</span>
              {p.skipped > 0 && <span className="text-muted-foreground">{p.skipped} skipped</span>}
              {p.failed > 0 && <span className="text-amber-600 dark:text-amber-400">{p.failed} failed</span>}
            </div>
          )}
        </div>

        {/* Phase 2: Tax Classification */}
        {importPhase === 'classifying' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-amber-500 flex-shrink-0" />
              <h3 className="font-semibold text-sm">
                Classifying {p?.imported ?? 0} expense{(p?.imported ?? 0) !== 1 ? 's' : ''} for tax deductions...
              </h3>
            </div>
            <Progress value={taxProgress} className="h-2.5" />
            <div className="text-xs text-muted-foreground">
              <Sparkles className="h-3 w-3 inline mr-1 text-amber-500" />
              AI tax classification in progress
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Step: Done ───────────────────────────────────────

  const [showFailedDetails, setShowFailedDetails] = useState(false);

  function renderDoneStep() {
    const hasFailed = (importResult?.failed ?? 0) > 0;

    return (
      <div className="text-center py-10 space-y-4">
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto border ${
          hasFailed
            ? 'bg-amber-100 dark:bg-amber-900/30 border-amber-500/20'
            : 'bg-green-100 dark:bg-green-900/30 border-green-500/20'
        }`}>
          {hasFailed ? (
            <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          ) : (
            <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
          )}
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
              <div className="max-h-[120px] overflow-y-auto">
                <ul className="text-xs text-muted-foreground list-disc list-inside space-y-1">
                  {importResult.reasons.map((r, i) => (
                    <li key={i} className="truncate">{r}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Failed transactions warning + retry */}
        {hasFailed && importResult && (
          <div className="mx-auto max-w-md space-y-3">
            <Alert className="border-amber-500/30 bg-amber-500/5 text-left">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <AlertTitle className="text-amber-600 dark:text-amber-400">
                {importResult.failed} transaction{importResult.failed !== 1 ? 's' : ''} could not be imported
              </AlertTitle>
              <AlertDescription className="text-xs text-muted-foreground">
                These transactions failed after {MAX_RETRIES + 1} attempts. You can retry them or close and try again later.
              </AlertDescription>
            </Alert>
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => importSelected(importResult.failedTransactions)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry {importResult.failed} Failed
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setShowFailedDetails(!showFailedDetails)}
              >
                {showFailedDetails ? 'Hide' : 'Show'} Details
              </Button>
            </div>
            {showFailedDetails && (
              <div className="text-left border rounded-md p-3 max-h-[150px] overflow-y-auto">
                <div className="space-y-1.5">
                  {importResult.failedTransactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between text-xs">
                      <span className="truncate max-w-[250px] text-muted-foreground">{tx.description}</span>
                      <span className="font-mono text-muted-foreground flex-shrink-0">${tx.amount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tax classification results */}
        {taxClassifyResult && (
          <div className="space-y-3 mx-auto max-w-md">
            <div className="flex items-center justify-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-amber-500" />
              Tax Classification Results
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-md border border-green-500/20 bg-green-500/5 text-center">
                <div className="text-lg font-bold text-green-600">{taxClassifyResult.autoApplied}</div>
                <div className="text-xs text-muted-foreground">Auto-classified</div>
              </div>
              <div className="p-2.5 rounded-md border border-amber-500/20 bg-amber-500/5 text-center">
                <div className="text-lg font-bold text-amber-600">{taxClassifyResult.needsReview}</div>
                <div className="text-xs text-muted-foreground">Need Review</div>
              </div>
              <div className="p-2.5 rounded-md border bg-muted/30 text-center">
                <div className="text-lg font-bold text-muted-foreground">{taxClassifyResult.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
            </div>
            {taxClassifyResult.needsReview > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  handleClose();
                  router.push('/personal/tax/review');
                }}
              >
                Start Tax Review
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        <Button onClick={handleClose} size="lg" className="glow-hover">
          Done
        </Button>
      </div>
    );
  }
}
