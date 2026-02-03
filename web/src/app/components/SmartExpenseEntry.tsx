'use client';

import { useState, useRef, useCallback } from 'react';
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
import { ExpenseCategory, ExpenseFrequency } from '../types';
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
} from 'lucide-react';

type EntryMode = 'smart' | 'photo' | 'manual';

interface ParsedExpense {
  description: string;
  amount: number;
  category: ExpenseCategory;
  confidence: number;
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

const frequencies: ExpenseFrequency[] = ['weekly', 'fortnightly', 'monthly', 'annually'];

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

function parseNaturalLanguage(input: string): ParsedExpense | null {
  // Match patterns like "Coffee at Starbucks $5.50" or "$25.99 groceries" or "lunch 15.50"
  const patterns = [
    // "$XX.XX description" or "$XX description"
    /\$?([\d,]+(?:\.\d{2})?)\s+(.+)/i,
    // "description $XX.XX" or "description XX.XX"
    /(.+?)\s+\$?([\d,]+(?:\.\d{2})?)\s*$/i,
    // "description for $XX" or "description - $XX"
    /(.+?)(?:\s+for\s+|\s*-\s*)\$?([\d,]+(?:\.\d{2})?)/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
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
          confidence: 0.8,
        };
      }
    }
  }

  return null;
}

export default function SmartExpenseEntry() {
  const { addExpense } = useFinance();
  const [mode, setMode] = useState<EntryMode>('smart');
  const [step, setStep] = useState(1);
  const [smartInput, setSmartInput] = useState('');
  const [parsedExpense, setParsedExpense] = useState<ParsedExpense | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  const form = useForm<FormData>({
    defaultValues: {
      description: '',
      amount: '',
      category: 'Food',
      frequency: 'monthly',
    },
  });

  const totalSteps = mode === 'manual' ? 1 : 2;

  const handleSmartInputChange = (value: string) => {
    setSmartInput(value);
    setError(null);

    // Try to parse as we type
    const parsed = parseNaturalLanguage(value);
    if (parsed) {
      setParsedExpense(parsed);
    } else {
      setParsedExpense(null);
    }
  };

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

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(dataUrl);
      stopCamera();
      processImage(dataUrl);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      processImage(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (dataUrl: string) => {
    setIsProcessing(true);
    setError(null);

    try {
      // Convert base64 to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Create form data
      const formData = new FormData();
      formData.append('file', blob, 'receipt.jpg');
      formData.append('documentType', 'image');

      // Call our API route
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
        setParsedExpense({
          description: tx.description,
          amount: tx.amount,
          category: guessCategory(tx.description),
          confidence: tx.confidence || 0.85,
        });
        setStep(2);
      } else {
        setError('Could not extract expense from image. Try entering manually.');
      }
    } catch (err) {
      console.error('Image processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process image');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmExpense = () => {
    if (!parsedExpense) return;

    addExpense(parsedExpense.description, parsedExpense.amount, parsedExpense.category, 'monthly');

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
          setMode('smart');
          resetForm();
        }}
      >
        <Sparkles className="h-5 w-5" />
        <span className="text-xs">Quick Add</span>
      </Button>
      <Button
        variant={mode === 'photo' ? 'default' : 'outline'}
        className="flex flex-col items-center gap-1 h-auto py-3"
        onClick={() => {
          setMode('photo');
          resetForm();
        }}
      >
        <Camera className="h-5 w-5" />
        <span className="text-xs">Receipt</span>
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
              placeholder='Type naturally, e.g. "Coffee at Starbucks $5.50" or "$25 groceries at Woolworths"'
              value={smartInput}
              onChange={(e) => handleSmartInputChange(e.target.value)}
              className="min-h-[100px] text-lg"
              autoFocus
            />
            {parsedExpense && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm mb-1">
                  <Check className="h-4 w-4" />
                  <span>Parsed successfully</span>
                </div>
                <div className="font-medium">{parsedExpense.description}</div>
                <div className="text-lg font-bold">${parsedExpense.amount.toFixed(2)}</div>
                <div className="text-sm text-muted-foreground">Category: {parsedExpense.category}</div>
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
          </div>

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
          {!capturedImage && !isCameraActive && (
            <div className="space-y-3">
              <div
                className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <p className="font-medium">Upload a receipt photo</p>
                <p className="text-sm text-muted-foreground">or drag and drop</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
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

          {capturedImage && isProcessing && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden">
                <img src={capturedImage} alt="Captured receipt" className="w-full opacity-50" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-background/90 rounded-lg p-4 text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                    <p className="font-medium">Processing receipt...</p>
                    <p className="text-sm text-muted-foreground">AI is extracting expense details</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {capturedImage && !isProcessing && error && (
            <div className="space-y-3">
              <div className="relative rounded-lg overflow-hidden">
                <img src={capturedImage} alt="Captured receipt" className="w-full" />
              </div>
              <Button onClick={() => setCapturedImage(null)} variant="outline" className="w-full">
                Try Again
              </Button>
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
            <div className="text-xs text-muted-foreground mt-1">
              Confidence: {Math.round(parsedExpense.confidence * 100)}%
            </div>
          </div>

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
