'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useFinance } from '../context/FinanceContext';
import { useSubscription } from '../hooks/useSubscription';
import { ExpenseCategory, ExpenseFrequency } from '../types';
import { financeClient, DocumentType } from '@/lib/financeService';
import { ExtractionMethod, ExtractionStatus } from '@/gen/pfinance/v1/types_pb';
import type { FieldConfidence } from '@/gen/pfinance/v1/types_pb';
import { ConfidenceBadge } from '@/components/ui/confidence-badge';
import { FieldConfidenceDetail } from './FieldConfidenceDetail';
import { ConfidenceWarningBanner } from './ConfidenceWarningBanner';
import { useMerchantSuggestion } from '../hooks/useMerchantSuggestion';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Sparkles,
  Camera,
  Receipt,
  Keyboard,
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  X,
  ImageIcon,
  AlertCircle,
  Cpu,
  Cloud,
  FileText,
  Lock,
} from 'lucide-react';

type EntryMode = 'smart' | 'photo' | 'manual';

interface ParsedExpense {
  description: string;
  amount: number;
  category: ExpenseCategory;
  confidence: number;
  frequency?: ExpenseFrequency;
  date?: Date;
  splitWith?: string[];
  isRecurring?: boolean;
  fieldConfidences?: FieldConfidence;
  fallbackFrom?: string;
  rejectedCount?: number;
}

interface MultiExpenseResult {
  expenses: ParsedExpense[];
  clarifyingQuestion?: string;
}

type FormData = {
  description: string;
  amount: string;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
};

const categories: ExpenseCategory[] = [
  'Food',
  'Housing',
  'Transportation',
  'Entertainment',
  'Healthcare',
  'Utilities',
  'Shopping',
  'Education',
  'Travel',
  'Other',
];

const frequencies: ExpenseFrequency[] = ['once', 'weekly', 'fortnightly', 'monthly', 'annually'];

const categoryKeywords: Record<string, ExpenseCategory> = {
  coffee: 'Food',
  cafe: 'Food',
  restaurant: 'Food',
  lunch: 'Food',
  dinner: 'Food',
  breakfast: 'Food',
  grocery: 'Food',
  supermarket: 'Food',
  uber: 'Transportation',
  lyft: 'Transportation',
  taxi: 'Transportation',
  gas: 'Transportation',
  petrol: 'Transportation',
  parking: 'Transportation',
  netflix: 'Entertainment',
  spotify: 'Entertainment',
  movie: 'Entertainment',
  cinema: 'Entertainment',
  gym: 'Healthcare',
  pharmacy: 'Healthcare',
  doctor: 'Healthcare',
  electric: 'Utilities',
  water: 'Utilities',
  internet: 'Utilities',
  phone: 'Utilities',
  amazon: 'Shopping',
  shopping: 'Shopping',
  clothes: 'Shopping',
  rent: 'Housing',
  mortgage: 'Housing',
  hotel: 'Travel',
  flight: 'Travel',
  airbnb: 'Travel',
};

function guessCategory(description: string): ExpenseCategory {
  const lower = description.toLowerCase();
  for (const [keyword, category] of Object.entries(categoryKeywords)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }
  return 'Other';
}

// Frequency keywords
const frequencyKeywords: Record<string, ExpenseFrequency> = {
  'daily': 'daily',
  'every day': 'daily',
  'weekly': 'weekly',
  'every week': 'weekly',
  'fortnightly': 'fortnightly',
  'bi-weekly': 'fortnightly',
  'biweekly': 'fortnightly',
  'monthly': 'monthly',
  'every month': 'monthly',
  'quarterly': 'quarterly',
  'every quarter': 'quarterly',
  'yearly': 'annually',
  'annually': 'annually',
  'annual': 'annually',
  'every year': 'annually',
};

// Parse date references
function parseRelativeDate(input: string): Date | undefined {
  const lower = input.toLowerCase();
  const today = new Date();

  if (lower.includes('yesterday')) {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    return date;
  }

  if (lower.includes('last week')) {
    const date = new Date(today);
    date.setDate(date.getDate() - 7);
    return date;
  }

  const lastDayMatch = lower.match(/last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
  if (lastDayMatch) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const targetDay = days.indexOf(lastDayMatch[1].toLowerCase());
    const currentDay = today.getDay();
    let daysAgo = currentDay - targetDay;
    if (daysAgo <= 0) daysAgo += 7;
    const date = new Date(today);
    date.setDate(date.getDate() - daysAgo);
    return date;
  }

  // Try to match "on DATE" patterns
  const dateMatch = lower.match(/(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dateMatch) {
    const month = parseInt(dateMatch[1]) - 1;
    const day = parseInt(dateMatch[2]);
    const year = dateMatch[3] ? parseInt(dateMatch[3]) : today.getFullYear();
    return new Date(year < 100 ? 2000 + year : year, month, day);
  }

  return undefined;
}

// Extract split information
function parseSplitInfo(input: string): string[] | undefined {
  const lower = input.toLowerCase();

  // "split with John" or "split with John, Jane, and Bob"
  const splitMatch = lower.match(/split\s+(?:with\s+)?(.+?)(?:\s+\$|\s*$)/i);
  if (splitMatch) {
    const names = splitMatch[1]
      .replace(/\s+and\s+/gi, ', ')
      .split(/[,\s]+/)
      .map(n => n.trim())
      .filter(n => n.length > 0 && !['with', 'the'].includes(n.toLowerCase()));
    return names.length > 0 ? names : undefined;
  }

  return undefined;
}

// Enhanced multi-item parsing
function parseMultipleExpenses(input: string): MultiExpenseResult {
  const expenses: ParsedExpense[] = [];

  // Pattern: "Coffee $5 and lunch $15"
  const multiPattern = /(.+?)\s+\$?([\d,]+(?:\.\d{2})?)\s+and\s+(.+?)\s+\$?([\d,]+(?:\.\d{2})?)/i;
  const multiMatch = input.match(multiPattern);

  if (multiMatch) {
    expenses.push({
      description: multiMatch[1].trim(),
      amount: parseFloat(multiMatch[2].replace(',', '')),
      category: guessCategory(multiMatch[1]),
      confidence: 0.75,
    });
    expenses.push({
      description: multiMatch[3].trim(),
      amount: parseFloat(multiMatch[4].replace(',', '')),
      category: guessCategory(multiMatch[3]),
      confidence: 0.75,
    });
    return { expenses };
  }

  return { expenses: [] };
}

function parseNaturalLanguage(input: string): ParsedExpense | null {
  // First check for multi-item patterns
  const multiResult = parseMultipleExpenses(input);
  if (multiResult.expenses.length > 0) {
    // For now, return just the first expense - could be enhanced to return all
    return multiResult.expenses[0];
  }

  // Extract frequency if present
  let frequency: ExpenseFrequency | undefined;
  let cleanedInput = input;
  for (const [keyword, freq] of Object.entries(frequencyKeywords)) {
    if (input.toLowerCase().includes(keyword)) {
      frequency = freq;
      cleanedInput = cleanedInput.replace(new RegExp(keyword, 'gi'), '').trim();
      break;
    }
  }

  // Extract date if present
  const date = parseRelativeDate(input);
  if (date) {
    // Remove date references from input
    cleanedInput = cleanedInput
      .replace(/yesterday/gi, '')
      .replace(/last\s+(week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi, '')
      .replace(/(?:on\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/gi, '')
      .trim();
  }

  // Extract split information
  const splitWith = parseSplitInfo(input);
  if (splitWith) {
    cleanedInput = cleanedInput.replace(/split\s+(?:with\s+)?[^$]*/gi, '').trim();
  }

  // Enhanced patterns for expense parsing
  const patterns = [
    // Split pattern: "Split $50 dinner with John"
    /split\s+\$?([\d,]+(?:\.\d{2})?)\s+(.+?)(?:\s+with|$)/i,
    // Recurring pattern: "Monthly Netflix $15.99"
    /(?:monthly|weekly|yearly|daily)\s+(.+?)\s+\$?([\d,]+(?:\.\d{2})?)/i,
    // "$XX.XX description" or "$XX description"
    /\$?([\d,]+(?:\.\d{2})?)\s+(.+)/i,
    // "description $XX.XX" or "description XX.XX"
    /(.+?)\s+\$?([\d,]+(?:\.\d{2})?)\s*$/i,
    // "description for $XX" or "description - $XX"
    /(.+?)(?:\s+for\s+|\s*-\s*)\$?([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = cleanedInput.match(pattern);
    if (match) {
      let description: string;
      let amountStr: string;

      // Determine which group is amount vs description
      if (/^\d/.test(match[1].replace(',', ''))) {
        amountStr = match[1];
        description = match[2];
      } else {
        description = match[1];
        amountStr = match[2];
      }

      const amount = parseFloat(amountStr.replace(',', ''));
      if (!isNaN(amount) && amount > 0) {
        const category = guessCategory(description);
        return {
          description: description.trim(),
          amount,
          category,
          confidence: frequency || date || splitWith ? 0.85 : 0.8,
          frequency: frequency || 'once',
          date,
          splitWith,
          isRecurring: !!frequency && frequency !== 'once',
        };
      }
    }
  }

  return null;
}

export default function SmartExpenseEntry() {
  const { addExpense } = useFinance();
  const { hasProAccess } = useSubscription();
  const [mode, setMode] = useState<EntryMode>('smart');
  const [step, setStep] = useState(1);
  const [smartInput, setSmartInput] = useState('');
  const [parsedExpense, setParsedExpense] = useState<ParsedExpense | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  // Extraction method: false = Self-hosted ML (Qwen), true = Gemini
  const [useGemini, setUseGemini] = useState(false);
  // Track if we're processing a PDF (for UI display)
  const [processingPdf, setProcessingPdf] = useState(false);
  // Track if we're parsing with AI (for smart text entry)
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Merchant suggestion from user history / static normalizer
  const { suggestion: merchantSuggestion } = useMerchantSuggestion(
    parsedExpense?.description ?? ''
  );

  const form = useForm<FormData>({
    defaultValues: {
      description: '',
      amount: '',
      category: 'Food',
      frequency: 'once',
    },
  });

  const totalSteps = mode === 'manual' ? 1 : 2;

  // Map proto category enum to frontend category string
  const mapProtoCategoryToString = (protoCategory: number): ExpenseCategory => {
    const categoryMap: Record<number, ExpenseCategory> = {
      0: 'Other',      // UNSPECIFIED
      1: 'Food',
      2: 'Housing',
      3: 'Transportation',
      4: 'Entertainment',
      5: 'Healthcare',
      6: 'Utilities',
      7: 'Shopping',
      8: 'Education',
      9: 'Travel',
      10: 'Other',
    };
    return categoryMap[protoCategory] || 'Other';
  };

  // Map proto frequency enum to frontend frequency string
  // Proto: 0=UNSPECIFIED, 1=ONCE, 2=DAILY, 3=WEEKLY, 4=FORTNIGHTLY, 5=MONTHLY, 6=QUARTERLY, 7=ANNUALLY
  const mapProtoFrequencyToString = (protoFrequency: number): ExpenseFrequency => {
    const frequencyMap: Record<number, ExpenseFrequency> = {
      0: 'once',        // UNSPECIFIED -> default to one-time
      1: 'once',        // ONCE
      2: 'weekly',      // DAILY -> treat as weekly for simplicity
      3: 'weekly',      // WEEKLY
      4: 'fortnightly', // FORTNIGHTLY
      5: 'monthly',     // MONTHLY
      6: 'monthly',     // QUARTERLY -> treat as monthly
      7: 'annually',    // ANNUALLY
    };
    return frequencyMap[protoFrequency] || 'once';
  };

  // Parse expense text using Gemini AI (debounced)
  const parseWithAI = useCallback(async (text: string) => {
    if (text.length < 3) {
      setIsAiParsing(false);
      return;
    }

    setIsAiParsing(true);
    setAiReasoning(null);

    try {
      const response = await financeClient.parseExpenseText({ text });

      if (response.success && response.expense) {
        const exp = response.expense;
        setParsedExpense({
          description: exp.description,
          amount: exp.amount,
          category: mapProtoCategoryToString(exp.category),
          confidence: exp.confidence,
          frequency: mapProtoFrequencyToString(exp.frequency),
          date: exp.date ? new Date(Number(exp.date.seconds) * 1000) : undefined,
          splitWith: exp.splitWith.length > 0 ? [...exp.splitWith] : undefined,
        });
        setAiReasoning(exp.reasoning || null);
        setError(null);
      } else {
        // Fall back to local parsing
        const parsed = parseNaturalLanguage(text);
        if (parsed) {
          setParsedExpense(parsed);
        } else {
          setParsedExpense(null);
        }
        setAiReasoning(null);
      }
    } catch (err) {
      console.log('AI parsing not available, using local parsing:', err);
      // Fall back to local parsing
      const parsed = parseNaturalLanguage(text);
      if (parsed) {
        setParsedExpense(parsed);
      } else {
        setParsedExpense(null);
      }
      setAiReasoning(null);
    } finally {
      setIsAiParsing(false);
    }
  }, []);

  const handleSmartInputChange = (value: string) => {
    setSmartInput(value);
    setError(null);

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Immediately try local parsing for instant feedback
    const parsed = parseNaturalLanguage(value);
    if (parsed) {
      setParsedExpense(parsed);
    } else {
      setParsedExpense(null);
    }

    // Debounce AI parsing (500ms after user stops typing)
    if (value.length >= 3) {
      setIsAiParsing(true);
      debounceTimerRef.current = setTimeout(() => {
        parseWithAI(value);
      }, 500);
    }
  };

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSmartSubmit = () => {
    if (!parsedExpense) {
      setError('Could not parse expense. Try format: "Coffee $5.50" or "$25 groceries"');
      return;
    }
    setStep(2);
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      setError('Could not access camera. Please use file upload instead.');
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  }, []);

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    let { videoWidth: width, videoHeight: height } = video;
    const maxDimension = 1920;

    // Resize if needed
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      console.log(`Camera capture: ${video.videoWidth}x${video.videoHeight} → ${width}x${height}`);
      setCapturedImage(dataUrl);
      stopCamera();
      processImage(dataUrl);
    }
  };

  // Compress image to reduce upload size - max 1920px, JPEG quality 0.8
  const compressImage = (file: File, maxDimension: number = 1920, quality: number = 0.8): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Calculate new dimensions maintaining aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG with specified quality
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);

        // Log compression stats
        const originalSize = (file.size / 1024).toFixed(1);
        const compressedSize = (compressedDataUrl.length * 0.75 / 1024).toFixed(1); // base64 is ~33% larger
        console.log(`Image compressed: ${originalSize}KB → ~${compressedSize}KB (${img.width}x${img.height} → ${width}x${height})`);

        resolve(compressedDataUrl);
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      // PDFs: read directly without compression
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        processDocument(dataUrl, true, file.name);
      };
      reader.readAsDataURL(file);
    } else {
      // Images: compress before processing
      try {
        setIsCompressing(true);
        setError(null);
        const compressedDataUrl = await compressImage(file);
        setIsCompressing(false);
        setCapturedImage(compressedDataUrl);
        processDocument(compressedDataUrl, false, file.name);
      } catch (err) {
        console.error('Image compression failed:', err);
        setError('Failed to process image. Please try again.');
        setIsCompressing(false);
      }
    }
  };

  const processDocument = async (dataUrl: string, isPdf: boolean = false, filename: string = 'receipt.jpg') => {
    setIsProcessing(true);
    setProcessingPdf(isPdf);
    setError(null);

    try {
      // Convert base64 data URL to Uint8Array
      const base64Data = dataUrl.split(',')[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Determine document type based on file type
      const docType = isPdf ? DocumentType.BANK_STATEMENT : DocumentType.RECEIPT;

      // Try backend extraction API first
      try {
        const response = await financeClient.extractDocument({
          documentData: bytes,
          documentType: docType,
          filename: filename,
          asyncProcessing: false,
          validateWithApi: false,
          extractionMethod: useGemini
            ? ExtractionMethod.GEMINI
            : ExtractionMethod.SELF_HOSTED,
        });

        // Handle async processing (multi-page PDF)
        if (response.status === ExtractionStatus.PROCESSING && response.jobId) {
          // Poll for completion
          const pollJob = async () => {
            const maxPolls = 60; // 1.5s * 60 = 90s max
            for (let i = 0; i < maxPolls; i++) {
              await new Promise(resolve => setTimeout(resolve, 1500));
              try {
                const jobResp = await financeClient.getExtractionJob({ jobId: response.jobId });
                if (jobResp.job?.status === ExtractionStatus.COMPLETED && jobResp.job.result) {
                  return jobResp.job.result;
                }
                if (jobResp.job?.status === ExtractionStatus.FAILED) {
                  throw new Error(jobResp.job.errorMessage || 'Extraction failed');
                }
              } catch (pollErr) {
                console.error('Poll error:', pollErr);
              }
            }
            throw new Error('Extraction timed out');
          };

          try {
            const asyncResult = await pollJob();
            if (asyncResult.transactions.length > 0) {
              const tx = asyncResult.transactions[0];
              const categoryName = mapProtoCategory(tx.suggestedCategory);
              const category = categories.includes(categoryName as ExpenseCategory)
                ? categoryName as ExpenseCategory
                : guessCategory(tx.description);
              setParsedExpense({
                description: tx.normalizedMerchant || tx.description,
                amount: tx.amount,
                category,
                confidence: tx.confidence || 0.85,
                fieldConfidences: tx.fieldConfidences,
                rejectedCount: asyncResult.rejectedTransactions?.length,
              });
              setStep(2);
              return;
            }
          } catch (asyncErr) {
            setError(asyncErr instanceof Error ? asyncErr.message : 'Async extraction failed');
            return;
          }
        }

        if (response.result?.transactions && response.result.transactions.length > 0) {
          const rejectedCount = response.result.rejectedTransactions?.length ?? 0;
          const fallbackFrom = response.result.fallbackFrom
            ? (response.result.fallbackFrom === 1 ? 'Self-Hosted ML' : 'Gemini')
            : undefined;

          // For bank statements (PDFs), handle multiple transactions
          if (isPdf && response.result.transactions.length > 1) {
            // Store all transactions for review
            const allExpenses: ParsedExpense[] = response.result.transactions
              .filter(tx => tx.isDebit) // Only include debits as expenses
              .map(tx => {
                const categoryName = mapProtoCategory(tx.suggestedCategory);
                const category = categories.includes(categoryName as ExpenseCategory)
                  ? categoryName as ExpenseCategory
                  : guessCategory(tx.description);
                return {
                  description: tx.normalizedMerchant || tx.description,
                  amount: tx.amount,
                  category,
                  confidence: tx.confidence || 0.85,
                  fieldConfidences: tx.fieldConfidences,
                  rejectedCount,
                  fallbackFrom,
                };
              });

            if (allExpenses.length > 0) {
              setParsedExpense(allExpenses[0]);
              setStep(2);
              console.log(`Bank statement: Found ${allExpenses.length} expenses out of ${response.result.transactions.length} transactions`);
            } else {
              setError('No expense transactions found in bank statement.');
            }
            return;
          }

          // Single transaction (receipt)
          const tx = response.result.transactions[0];
          const categoryName = mapProtoCategory(tx.suggestedCategory);
          const category = categories.includes(categoryName as ExpenseCategory)
            ? categoryName as ExpenseCategory
            : guessCategory(tx.description);

          setParsedExpense({
            description: tx.normalizedMerchant || tx.description,
            amount: tx.amount,
            category,
            confidence: tx.confidence || 0.85,
            fieldConfidences: tx.fieldConfidences,
            rejectedCount,
            fallbackFrom,
          });
          setStep(2);

          if (response.result.transactions.length > 1) {
            console.log(`Receipt has ${response.result.transactions.length} items detected`);
          }
          return;
        }
      } catch (backendErr) {
        // Backend extraction not available, fall back to frontend API
        console.log('Backend extraction not available, using frontend API:', backendErr);
      }

      // Fallback: Use frontend API route (only for images)
      if (isPdf) {
        setError('PDF processing requires the backend extraction service. Please ensure it is running.');
        return;
      }

      const response = await fetch(dataUrl);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append('file', blob, 'receipt.jpg');
      formData.append('documentType', 'image');

      const apiResponse = await fetch('/api/process-document', {
        method: 'POST',
        body: formData,
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || 'Failed to process image');
      }

      const data = await apiResponse.json();

      if (data.transactions && data.transactions.length > 0) {
        const tx = data.transactions[0];
        const category = tx.category && categories.includes(tx.category as ExpenseCategory)
          ? tx.category as ExpenseCategory
          : guessCategory(tx.description);
        setParsedExpense({
          description: tx.description,
          amount: tx.amount,
          category,
          confidence: tx.confidence || 0.85,
        });
        setStep(2);

        if (data.metadata?.hasMultipleItems && data.transactions.length > 1) {
          console.log(`Receipt has ${data.transactions.length} items detected`);
        }
      } else {
        setError('Could not extract expense from document. Try entering manually.');
      }
    } catch (err) {
      console.error('Document processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process document');
    } finally {
      setIsProcessing(false);
    }
  };

  // Legacy wrapper for camera capture
  const processImage = (dataUrl: string) => processDocument(dataUrl, false, 'receipt.jpg');

  // Map proto ExpenseCategory enum to frontend category string
  function mapProtoCategory(protoCategory: number): string {
    const categoryMap: Record<number, string> = {
      0: 'Other',      // UNSPECIFIED
      1: 'Food',
      2: 'Housing',
      3: 'Transportation',
      4: 'Entertainment',
      5: 'Healthcare',
      6: 'Utilities',
      7: 'Shopping',
      8: 'Education',
      9: 'Travel',
      10: 'Other',
    };
    return categoryMap[protoCategory] || 'Other';
  }

  const handleConfirmExpense = () => {
    if (!parsedExpense) return;

    // Use the parsed frequency, defaulting to 'once'
    const frequency = parsedExpense.frequency || 'once';

    addExpense(
      parsedExpense.description,
      parsedExpense.amount,
      parsedExpense.category,
      frequency as ExpenseFrequency
    );

    setSuccess(true);
    setTimeout(() => {
      resetForm();
    }, 2000);
  };

  const handleManualSubmit = (data: FormData) => {
    addExpense(data.description, parseFloat(data.amount), data.category, data.frequency);
    setSuccess(true);
    setTimeout(() => {
      resetForm();
    }, 2000);
  };

  const resetForm = () => {
    setStep(1);
    setSmartInput('');
    setParsedExpense(null);
    setCapturedImage(null);
    setError(null);
    setSuccess(false);
    form.reset();
    stopCamera();
  };

  const renderModeSelector = () => (
    <div className="grid grid-cols-3 gap-2 mb-6">
      <Button
        variant={mode === 'smart' ? 'default' : 'outline'}
        className="flex flex-col items-center gap-1 h-auto py-3"
        onClick={() => {
          if (!hasProAccess) return;
          setMode('smart');
          resetForm();
        }}
        disabled={!hasProAccess}
      >
        <Sparkles className="h-5 w-5" />
        <span className="text-xs">Quick Add</span>
        {!hasProAccess && <Lock className="h-3 w-3 text-muted-foreground" />}
      </Button>
      <Button
        variant={mode === 'photo' ? 'default' : 'outline'}
        className="flex flex-col items-center gap-1 h-auto py-3"
        onClick={() => {
          if (!hasProAccess) return;
          setMode('photo');
          resetForm();
        }}
        disabled={!hasProAccess}
      >
        <Camera className="h-5 w-5" />
        <span className="text-xs">Receipt</span>
        {!hasProAccess && <Lock className="h-3 w-3 text-muted-foreground" />}
      </Button>
      <Button
        variant={mode === 'manual' ? 'default' : 'outline'}
        className="flex flex-col items-center gap-1 h-auto py-3"
        onClick={() => {
          setMode('manual');
          resetForm();
        }}
      >
        <Keyboard className="h-5 w-5" />
        <span className="text-xs">Manual</span>
      </Button>
    </div>
  );

  const renderSmartEntry = () => (
    <div className="space-y-4">
      {step === 1 && (
        <>
          <div className="space-y-2">
            <Textarea
              placeholder='Try: "Coffee $5.50" • "Split $50 dinner with John" • "Monthly Netflix $15.99" • "$30 groceries yesterday"'
              value={smartInput}
              onChange={(e) => handleSmartInputChange(e.target.value)}
              className="min-h-[100px] text-lg"
              autoFocus
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>💡 <strong>Examples:</strong></p>
              <ul className="list-disc list-inside space-y-0.5 ml-2">
                <li><code>Coffee $5.50</code> - Quick add</li>
                <li><code>Split $50 dinner with John</code> - Split expense</li>
                <li><code>Monthly Netflix $15.99</code> - Recurring</li>
                <li><code>$30 groceries yesterday</code> - Past date</li>
                <li><code>Coffee $5 and lunch $15</code> - Multiple items</li>
              </ul>
            </div>
            {/* AI Parsing Indicator */}
            {isAiParsing && !parsedExpense && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>AI is parsing your expense...</span>
                </div>
              </div>
            )}

            {parsedExpense && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
                    {isAiParsing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span>{aiReasoning ? 'AI parsed' : 'Parsed'}</span>
                    <ConfidenceBadge confidence={parsedExpense.confidence} />
                  </div>
                  {aiReasoning && (
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-300 text-xs">
                      <Sparkles className="h-3 w-3 inline mr-1" />
                      AI
                    </span>
                  )}
                </div>
                <div className="font-medium">{parsedExpense.description}</div>
                <div className="text-lg font-bold">${parsedExpense.amount.toFixed(2)}</div>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mt-1">
                  <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                    {parsedExpense.category}
                  </span>
                  {parsedExpense.frequency && parsedExpense.frequency !== 'monthly' && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-700 dark:text-blue-300">
                      {parsedExpense.frequency}
                    </span>
                  )}
                  {parsedExpense.date && (
                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-700 dark:text-purple-300">
                      📅 {parsedExpense.date.toLocaleDateString()}
                    </span>
                  )}
                  {parsedExpense.splitWith && parsedExpense.splitWith.length > 0 && (
                    <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 rounded text-orange-700 dark:text-orange-300">
                      👥 Split with {parsedExpense.splitWith.join(', ')}
                    </span>
                  )}
                </div>
                {aiReasoning && (
                  <div className="mt-2 pt-2 border-t border-green-200 dark:border-green-800 text-xs text-muted-foreground">
                    <span className="text-green-600 dark:text-green-400">💡</span> {aiReasoning}
                  </div>
                )}
              </div>
            )}
          </div>
          <Button onClick={handleSmartSubmit} disabled={!parsedExpense} className="w-full">
            Continue
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </>
      )}

      {step === 2 && parsedExpense && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <div className="text-3xl font-bold">${parsedExpense.amount.toFixed(2)}</div>
            <div className="text-lg text-muted-foreground">{parsedExpense.description}</div>
            {merchantSuggestion && merchantSuggestion.source === 'user_history' &&
              merchantSuggestion.suggestedName !== parsedExpense.description && (
              <button
                onClick={() => setParsedExpense({ ...parsedExpense, description: merchantSuggestion.suggestedName })}
                className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Use &quot;{merchantSuggestion.suggestedName}&quot;
              </button>
            )}
            {parsedExpense.date && (
              <div className="text-sm text-muted-foreground mt-1">
                📅 {parsedExpense.date.toLocaleDateString()}
              </div>
            )}
            {parsedExpense.splitWith && parsedExpense.splitWith.length > 0 && (
              <div className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                👥 Split with {parsedExpense.splitWith.join(', ')}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={parsedExpense.category}
                  onValueChange={(value) =>
                    setParsedExpense({ ...parsedExpense, category: value as ExpenseCategory })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium">Frequency</label>
                <Select
                  value={parsedExpense.frequency || 'once'}
                  onValueChange={(value) =>
                    setParsedExpense({ ...parsedExpense, frequency: value as ExpenseFrequency })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {frequencies.map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        {freq === 'once' ? 'One-time' : freq.charAt(0).toUpperCase() + freq.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {parsedExpense.isRecurring && (
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-sm text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                This will be recorded as a recurring {parsedExpense.frequency} expense
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleConfirmExpense} className="flex-1">
              <Check className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderPhotoEntry = () => (
    <div className="space-y-4">
      {step === 1 && (
        <>
          {!capturedImage && !isCameraActive && !isCompressing && (
            <div className="space-y-3">
              {/* Extraction Method Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-2">
                  {useGemini ? (
                    <Cloud className="h-4 w-4 text-blue-500" />
                  ) : (
                    <Cpu className="h-4 w-4 text-green-500" />
                  )}
                  <Label htmlFor="extraction-method" className="text-sm font-medium cursor-pointer">
                    {useGemini ? 'Gemini AI' : 'Self-hosted ML'}
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {useGemini ? 'Cloud' : 'Private'}
                  </span>
                  <Switch
                    id="extraction-method"
                    checked={useGemini}
                    onCheckedChange={setUseGemini}
                  />
                </div>
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">Upload a receipt or bank statement</p>
                <p className="text-sm text-muted-foreground">Images (JPG, PNG) or PDF files</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,application/pdf"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="text-center text-sm text-muted-foreground">or</div>
              <Button onClick={startCamera} variant="outline" className="w-full">
                <Camera className="mr-2 h-4 w-4" />
                Take a Photo
              </Button>
            </div>
          )}

          {isCameraActive && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-black">
                <video ref={videoRef} autoPlay playsInline className="w-full" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={stopCamera} className="flex-1">
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button onClick={capturePhoto} className="flex-1">
                  <Camera className="mr-2 h-4 w-4" />
                  Capture
                </Button>
              </div>
            </div>
          )}

          {/* Compressing state */}
          {isCompressing && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-muted min-h-[200px] flex items-center justify-center">
                <ImageIcon className="h-20 w-20 text-muted-foreground/30" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-background/90 rounded-lg p-4 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="font-medium">Compressing image...</p>
                    <p className="text-sm text-muted-foreground">Optimizing for faster upload</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Processing state */}
          {!isCompressing && (capturedImage || processingPdf) && isProcessing && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-muted min-h-[200px] flex items-center justify-center">
                {capturedImage ? (
                  <img src={capturedImage} alt="Captured receipt" className="w-full opacity-50" />
                ) : (
                  <FileText className="h-20 w-20 text-muted-foreground/30" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-background/90 rounded-lg p-4 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="font-medium">
                      {processingPdf ? 'Processing bank statement...' : 'Processing receipt...'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {processingPdf
                        ? 'AI is extracting transactions from PDF'
                        : 'AI is extracting expense details'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(capturedImage || processingPdf) && !isProcessing && error && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden bg-muted min-h-[150px] flex items-center justify-center">
                {capturedImage ? (
                  <img src={capturedImage} alt="Captured receipt" className="w-full" />
                ) : (
                  <FileText className="h-16 w-16 text-muted-foreground/50" />
                )}
              </div>
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Extraction failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button onClick={() => { setError(null); setCapturedImage(null); setProcessingPdf(false); }} variant="outline" className="flex-1">
                  Try Again
                </Button>
                <Button onClick={() => { setError(null); setCapturedImage(null); setProcessingPdf(false); setMode('manual'); }} variant="secondary" className="flex-1">
                  <Keyboard className="mr-2 h-4 w-4" />
                  Enter Manually
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {step === 2 && parsedExpense && (
        <div className="space-y-4">
          {capturedImage && (
            <div className="relative rounded-lg overflow-hidden max-h-40">
              <img src={capturedImage} alt="Receipt" className="w-full object-cover" />
            </div>
          )}

          <div className="text-center py-2">
            <div className="text-3xl font-bold">${parsedExpense.amount.toFixed(2)}</div>
            <div className="text-lg text-muted-foreground">{parsedExpense.description}</div>
            <div className="flex justify-center mt-1">
              <ConfidenceBadge confidence={parsedExpense.confidence} size="md" />
            </div>
            {parsedExpense.fallbackFrom && (
              <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                Fell back from {parsedExpense.fallbackFrom}
              </div>
            )}
          </div>
          <ConfidenceWarningBanner
            overallConfidence={parsedExpense.confidence}
            fieldConfidences={parsedExpense.fieldConfidences}
            rejectedCount={parsedExpense.rejectedCount}
          />
          {parsedExpense.fieldConfidences && (
            <FieldConfidenceDetail fieldConfidences={parsedExpense.fieldConfidences} />
          )}

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Category</label>
              <Select
                value={parsedExpense.category}
                onValueChange={(value) =>
                  setParsedExpense({ ...parsedExpense, category: value as ExpenseCategory })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={resetForm} className="flex-1">
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button onClick={handleConfirmExpense} className="flex-1">
              <Check className="mr-2 h-4 w-4" />
              Add Expense
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  const renderManualEntry = () => (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleManualSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="description"
          rules={{ required: 'Description is required' }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input placeholder="What did you spend on?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="amount"
          rules={{
            required: 'Amount is required',
            validate: (v) => parseFloat(v) > 0 || 'Must be greater than 0',
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Amount</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" min="0" placeholder="0.00" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frequency</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {frequencies.map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        {freq.charAt(0).toUpperCase() + freq.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" className="w-full">
          <Receipt className="mr-2 h-4 w-4" />
          Add Expense
        </Button>
      </form>
    </Form>
  );

  if (success) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Expense Added!</h3>
            <p className="text-muted-foreground">Your expense has been recorded successfully.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Add Expense
        </CardTitle>
        <CardDescription>Choose how you want to add your expense</CardDescription>
      </CardHeader>
      <CardContent>
        {renderModeSelector()}

        {mode !== 'manual' && (
          <div className="mb-4">
            <Progress value={(step / totalSteps) * 100} className="h-1" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Step {step} of {totalSteps}</span>
              <span>{step === 1 ? 'Enter details' : 'Confirm'}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {mode === 'smart' && renderSmartEntry()}
        {mode === 'photo' && renderPhotoEntry()}
        {mode === 'manual' && renderManualEntry()}
      </CardContent>
    </Card>
  );
}
