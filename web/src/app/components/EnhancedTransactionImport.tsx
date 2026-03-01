'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ExpenseCategory } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle2, Upload, FileText, Brain, TrendingUp, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Import enhanced utilities
import { EnhancedSmartCategorization } from '../utils/enhancedSmartCategorization';
import { EnhancedPdfProcessor } from '../utils/enhancedPdfProcessor';

// Enhanced transaction type
interface EnhancedTransaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category: ExpenseCategory;
  selected: boolean;
  confidence?: number;
  reasoning?: string;
  alternatives?: Array<{ category: ExpenseCategory; confidence: number }>;
  isRecurring?: boolean;
  isPotentialDuplicate?: boolean;
  duplicateOf?: string[];
  source: 'csv' | 'pdf';
  reference?: string;
}

// Processing statistics
interface ProcessingStats {
  totalTransactions: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  potentialDuplicates: number;
  avgConfidence: number;
}

export default function EnhancedTransactionImport() {
  const { addExpense, addExpenses, expenses } = useFinance();
  const [isDragging, setIsDragging] = useState(false);
  const [transactions, setTransactions] = useState<EnhancedTransaction[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [pdfProcessingEnabled, setPdfProcessingEnabled] = useState(false);
  const [enhancedCategorizationEnabled, setEnhancedCategorizationEnabled] = useState(true);
  const [duplicateDetectionEnabled, setDuplicateDetectionEnabled] = useState(true);
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Enhanced categorization service
  const [categorizer, setCategorizer] = useState<EnhancedSmartCategorization | null>(null);
  const [pdfProcessor, setPdfProcessor] = useState<EnhancedPdfProcessor | null>(null);

  // Basic category guessing (fallback)
  const guessBasicCategory = useCallback((description: string): ExpenseCategory => {
    const desc = description.toLowerCase();
    if (desc.includes('food') || desc.includes('restaurant')) return 'Food';
    if (desc.includes('gas') || desc.includes('fuel')) return 'Transportation';
    if (desc.includes('rent') || desc.includes('mortgage')) return 'Housing';
    return 'Other';
  }, []);

  // Calculate processing statistics
  const calculateProcessingStats = useCallback((transactions: EnhancedTransaction[]): ProcessingStats => {
    const confidenceScores = transactions
      .map(tx => tx.confidence || 0.5)
      .filter(c => c > 0);

    const highConfidence = confidenceScores.filter(c => c >= 0.8).length;
    const mediumConfidence = confidenceScores.filter(c => c >= 0.5 && c < 0.8).length;
    const lowConfidence = confidenceScores.filter(c => c < 0.5).length;
    const potentialDuplicates = transactions.filter(tx => tx.isPotentialDuplicate).length;
    const avgConfidence = confidenceScores.length > 0 
      ? confidenceScores.reduce((sum, c) => sum + c, 0) / confidenceScores.length
      : 0;

    return {
      totalTransactions: transactions.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      potentialDuplicates,
      avgConfidence
    };
  }, []);

  // Parse CSV data
  const parseCSVData = useCallback((data: Record<string, string>[]): EnhancedTransaction[] => {
    if (data.length === 0) {
      throw new Error('No data found in CSV file');
    }

    const headers = Object.keys(data[0]).map(h => h.toLowerCase());
    
    const dateColumn = headers.find(h => 
      h.includes('date') || h.includes('time') || h === 'posted'
    );
    const descriptionColumn = headers.find(h => 
      h.includes('description') || h.includes('narrative') || h.includes('merchant')
    );
    const amountColumn = headers.find(h => 
      h.includes('amount') || h.includes('debit') || h.includes('value')
    );

    if (!dateColumn || !descriptionColumn || !amountColumn) {
      throw new Error('Could not identify required columns in CSV');
    }

    return data
      .map((row, index) => {
        const amountValue = row[amountColumn]?.replace(/[^\d.-]/g, '');
        const amount = amountValue ? parseFloat(amountValue) : 0;
        
        if (amount <= 0) return null; // Skip non-expense transactions
        
        const description = row[descriptionColumn]?.trim() || 'Unknown Transaction';
        const dateStr = row[dateColumn];
        
        let date: Date;
        try {
          date = new Date(dateStr);
          if (isNaN(date.getTime())) throw new Error('Invalid date');
        } catch {
          date = new Date();
        }

        return {
          id: `csv-${index}-${Date.now()}`,
          date,
          description,
          amount: Math.abs(amount),
          category: guessBasicCategory(description),
          selected: true,
          source: 'csv' as const
        };
      })
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null);
  }, [guessBasicCategory]);

  // Process CSV file
  const processCSVFile = useCallback(async (file: File): Promise<EnhancedTransaction[]> => {
    const PapaParse = (await import('papaparse')).default;
    return new Promise((resolve, reject) => {
      PapaParse.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const transactions = parseCSVData(results.data as Record<string, string>[]);
            resolve(transactions);
          } catch (error) {
            reject(error);
          }
        },
        error: (error) => {
          reject(new Error(`CSV parsing failed: ${error.message}`));
        }
      });
    });
  }, [parseCSVData]);

  // Process PDF file using enhanced processor
  const processPDFFile = useCallback(async (file: File): Promise<EnhancedTransaction[]> => {
    if (!pdfProcessor) {
      throw new Error('PDF processor not initialized');
    }

    const result = await pdfProcessor.processPdf(file);
    
    if (result.metadata.warnings.length > 0) {
      console.warn('PDF processing warnings:', result.metadata.warnings);
    }

    return result.transactions.map((tx, index) => ({
      id: `pdf-${index}-${Date.now()}`,
      date: tx.date,
      description: tx.description,
      amount: tx.amount,
      category: guessBasicCategory(tx.description),
      selected: true,
      confidence: tx.confidence,
      source: 'pdf' as const,
      reference: tx.reference
    }));
  }, [pdfProcessor, guessBasicCategory]);

  // Apply enhanced categorization
  const applyEnhancedCategorization = useCallback(async (
    transactions: EnhancedTransaction[]
  ): Promise<EnhancedTransaction[]> => {
    if (!categorizer) return transactions;

    try {
      const transactionData = transactions.map(tx => ({
        description: tx.description,
        amount: tx.amount,
        timeOfDay: tx.date.getHours() < 12 ? 'morning' : tx.date.getHours() < 18 ? 'afternoon' : 'evening',
        dayOfWeek: tx.date.toLocaleDateString('en-US', { weekday: 'long' })
      }));

      const results = await categorizer.enhancedBatchCategorization(transactionData);

      return transactions.map((tx, index) => {
        const result = results[index];
        if (result) {
          return {
            ...tx,
            category: result.suggestedCategory,
            confidence: result.confidence,
            reasoning: result.reasoning,
            alternatives: result.alternativeCategories,
            isRecurring: result.isRecurring
          };
        }
        return tx;
      });

    } catch (error) {
      console.error('Enhanced categorization failed:', error);
      setError('Enhanced categorization failed, using basic categorization');
      return transactions;
    }
  }, [categorizer]);

  // Detect potential duplicates
  const detectDuplicates = useCallback(async (
    transactions: EnhancedTransaction[]
  ): Promise<EnhancedTransaction[]> => {
    if (!pdfProcessor || !expenses) return transactions;

    try {
      const existingTransactions = expenses.map(expense => ({
        date: new Date(expense.date || Date.now()),
        description: expense.description,
        amount: expense.amount
      }));

      const duplicateResults = pdfProcessor.detectDuplicates(
        transactions.map(tx => ({
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          confidence: tx.confidence || 0.8
        })),
        existingTransactions
      );

      const duplicateMap = new Map<string, string[]>();
      duplicateResults.forEach(result => {
        const txId = transactions.find(tx => 
          tx.description === result.transaction.description &&
          tx.amount === result.transaction.amount
        )?.id;
        
        if (txId) {
          duplicateMap.set(txId, result.duplicates.map(d => d.description));
        }
      });

      return transactions.map(tx => ({
        ...tx,
        isPotentialDuplicate: duplicateMap.has(tx.id),
        duplicateOf: duplicateMap.get(tx.id) || []
      }));

    } catch (error) {
      console.error('Duplicate detection failed:', error);
      return transactions;
    }
  }, [pdfProcessor, expenses]);

  // Load settings and initialize services
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
      setCategorizer(new EnhancedSmartCategorization(savedApiKey));
      setPdfProcessor(new EnhancedPdfProcessor(savedApiKey));
    }
    
    const savedPdfProcessing = localStorage.getItem('pdf-processing-enabled');
    if (savedPdfProcessing === 'true') {
      setPdfProcessingEnabled(true);
    }

    const savedEnhancedCategorization = localStorage.getItem('enhanced-categorization-enabled');
    if (savedEnhancedCategorization !== null) {
      setEnhancedCategorizationEnabled(savedEnhancedCategorization === 'true');
    }

    const savedDuplicateDetection = localStorage.getItem('duplicate-detection-enabled');
    if (savedDuplicateDetection !== null) {
      setDuplicateDetectionEnabled(savedDuplicateDetection === 'true');
    }
  }, []);

  // Update services when API key changes
  useEffect(() => {
    if (apiKey) {
      setCategorizer(new EnhancedSmartCategorization(apiKey));
      setPdfProcessor(new EnhancedPdfProcessor(apiKey));
    }
  }, [apiKey]);

  // Save settings to localStorage
  useEffect(() => {
    localStorage.setItem('pdf-processing-enabled', pdfProcessingEnabled.toString());
    localStorage.setItem('enhanced-categorization-enabled', enhancedCategorizationEnabled.toString());
    localStorage.setItem('duplicate-detection-enabled', duplicateDetectionEnabled.toString());
  }, [pdfProcessingEnabled, enhancedCategorizationEnabled, duplicateDetectionEnabled]);

  // Handle file processing
  const handleFiles = useCallback(async (files: FileList) => {
    setIsLoading(true);
    setError(null);
    setProcessingStats(null);
    
    const file = files[0];
    const fileName = file.name.toLowerCase();
    const isPDF = fileName.endsWith('.pdf');
    const isCSV = fileName.endsWith('.csv');
    
    try {
      let extractedTransactions: EnhancedTransaction[] = [];

      if (isCSV) {
        extractedTransactions = await processCSVFile(file);
      } else if (isPDF && pdfProcessingEnabled && pdfProcessor) {
        extractedTransactions = await processPDFFile(file);
      } else {
        const acceptedTypes = pdfProcessingEnabled ? 'CSV and PDF' : 'CSV';
        throw new Error(`File type not supported. Only ${acceptedTypes} files are accepted.`);
      }

      if (extractedTransactions.length === 0) {
        throw new Error('No transactions found in the file.');
      }

      // Apply enhanced categorization if enabled
      if (enhancedCategorizationEnabled && categorizer) {
        extractedTransactions = await applyEnhancedCategorization(extractedTransactions);
      }

      // Detect duplicates if enabled
      if (duplicateDetectionEnabled) {
        extractedTransactions = await detectDuplicates(extractedTransactions);
      }

      // Calculate processing statistics
      const stats = calculateProcessingStats(extractedTransactions);
      setProcessingStats(stats);

      setTransactions(extractedTransactions);
      setIsImportDialogOpen(true);
      setSuccessMessage(`Successfully processed ${extractedTransactions.length} transactions`);

    } catch (error) {
      console.error('File processing failed:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [pdfProcessingEnabled, enhancedCategorizationEnabled, duplicateDetectionEnabled, categorizer, pdfProcessor, processCSVFile, processPDFFile, applyEnhancedCategorization, detectDuplicates, calculateProcessingStats]);

  // Handle category change with learning
  const handleCategoryChange = (id: string, newCategory: ExpenseCategory) => {
    const transaction = transactions.find(tx => tx.id === id);
    if (transaction && categorizer && transaction.category !== newCategory) {
      // Record the correction for learning
      categorizer.recordCorrection(
        transaction.description,
        transaction.category,
        newCategory,
        transaction.amount
      );
    }

    setTransactions(prev => 
      prev.map(tx => 
        tx.id === id ? { ...tx, category: newCategory } : tx
      )
    );
  };

  // Toggle transaction selection
  const handleToggleSelect = (id: string) => {
    setTransactions(prev => 
      prev.map(tx => 
        tx.id === id ? { ...tx, selected: !tx.selected } : tx
      )
    );
  };

  // Import selected transactions
  const importSelectedTransactions = async () => {
    try {
      const selectedTransactions = transactions.filter(tx => tx.selected);
      
      if (selectedTransactions.length === 0) {
        setError('Please select at least one transaction to import');
        return;
      }

      const transactionsToAdd = selectedTransactions.map(tx => ({
        description: tx.description,
        amount: tx.amount,
        category: tx.category,
        frequency: 'monthly' as const
      }));

      if (addExpenses) {
        addExpenses(transactionsToAdd);
      } else {
        // Fallback to individual adds
        for (const tx of transactionsToAdd) {
          addExpense(tx.description, tx.amount, tx.category, tx.frequency);
        }
      }

      setIsImportDialogOpen(false);
      setTransactions([]);
      setProcessingStats(null);
      setSuccessMessage(`Successfully imported ${selectedTransactions.length} transactions`);
      
      setTimeout(() => setSuccessMessage(null), 3000);

    } catch (error) {
      console.error('Import failed:', error);
      setError(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Drag and drop handlers
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(files);
      if (e.target) {
        e.target.value = '';
      }
    }
  }, [handleFiles]);

  // Save API key
  const handleSaveApiKey = () => {
    if (!apiKey.trim().startsWith('sk-')) {
      setError('Please enter a valid OpenAI API key starting with "sk-"');
      return;
    }
    
    localStorage.setItem('openai-api-key', apiKey);
    setCategorizer(new EnhancedSmartCategorization(apiKey));
    setPdfProcessor(new EnhancedPdfProcessor(apiKey));
    setApiKeyDialogOpen(false);
    setSuccessMessage('API key saved successfully');
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  // Get confidence badge color
  const getConfidenceBadgeColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.5) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const categories: ExpenseCategory[] = [
    'Food', 'Housing', 'Transportation', 'Entertainment', 
    'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Enhanced Transaction Import
          </span>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <Switch 
                id="pdf-processing"
                checked={pdfProcessingEnabled}
                onCheckedChange={setPdfProcessingEnabled}
                disabled={!apiKey}
              />
              <Label htmlFor="pdf-processing" className="text-sm">
                PDF Import {pdfProcessingEnabled && '✓'}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                id="enhanced-categorization"
                checked={enhancedCategorizationEnabled}
                onCheckedChange={setEnhancedCategorizationEnabled}
                disabled={!apiKey}
              />
              <Label htmlFor="enhanced-categorization" className="text-sm">
                Smart Categorization {enhancedCategorizationEnabled && '✓'}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                id="duplicate-detection"
                checked={duplicateDetectionEnabled}
                onCheckedChange={setDuplicateDetectionEnabled}
              />
              <Label htmlFor="duplicate-detection" className="text-sm">
                Duplicate Detection {duplicateDetectionEnabled && '✓'}
              </Label>
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          Advanced transaction import with AI-powered categorization and duplicate detection
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging ? 'border-primary bg-primary/10' : 'border-border'
          } transition-colors duration-200 cursor-pointer`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept={pdfProcessingEnabled ? '.csv,.pdf' : '.csv'}
            onChange={handleFileInput}
          />
          
          <div className="flex justify-center mb-4">
            {pdfProcessingEnabled ? (
              <>
                <Upload className="w-8 h-8 text-muted-foreground mr-2" />
                <FileText className="w-8 h-8 text-muted-foreground" />
              </>
            ) : (
              <Upload className="w-10 h-10 text-muted-foreground" />
            )}
          </div>
          
          <div className="text-lg font-medium mb-2">
            {isDragging ? 'Drop your file here' : `Upload ${pdfProcessingEnabled ? 'CSV or PDF' : 'CSV'} file`}
          </div>
          
          <div className="text-sm text-muted-foreground mb-4">
            Supports bank statements, credit card exports, and budgeting app data
          </div>

          {!apiKey && (
            <div className="mb-4">
              <Button 
                variant="outline" 
                onClick={(e) => {
                  e.stopPropagation();
                  setApiKeyDialogOpen(true);
                }}
                className="flex items-center gap-2"
              >
                <Brain className="w-4 h-4" />
                Configure AI Features
              </Button>
            </div>
          )}
          
          {isLoading && (
            <div className="mt-4 text-sm text-muted-foreground">
              Processing file with AI enhancements...
            </div>
          )}
          
          {error && (
            <div className="mt-4 text-sm text-red-500 flex items-center justify-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          
          {successMessage && (
            <div className="mt-4 text-sm text-green-500 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-4 h-4" />
              {successMessage}
            </div>
          )}
        </div>

        {categorizer && (
          <div className="mt-4 p-4 border rounded-lg bg-muted/50">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Learning Statistics
            </h4>
            <div className="text-sm text-muted-foreground">
              {(() => {
                const stats = categorizer.getCategorizationStats();
                return (
                  <div>
                    <p>Learned from {stats.totalLearned} user corrections</p>
                    {stats.lastUpdated && (
                      <p>Last updated: {stats.lastUpdated.toLocaleDateString()}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </CardContent>
      
      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configure AI Features</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enable AI-powered PDF processing and smart categorization with your OpenAI API key.
            </p>
            <div className="space-y-2">
              <Label htmlFor="api-key">OpenAI API Key</Label>
              <input
                id="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveApiKey}>
              Save & Enable AI Features
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Enhanced Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen} modal>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Review Enhanced Import Results
            </DialogTitle>
          </DialogHeader>
          
          <Tabs defaultValue="transactions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="transactions">
                Transactions ({transactions.filter(t => t.selected).length} selected)
              </TabsTrigger>
              <TabsTrigger value="insights">
                Processing Insights
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="transactions" className="mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">Select</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map(transaction => (
                    <TableRow key={transaction.id} className={transaction.isPotentialDuplicate ? 'bg-yellow-50' : ''}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={transaction.selected}
                          onChange={() => handleToggleSelect(transaction.id)}
                          className="w-4 h-4"
                        />
                      </TableCell>
                      <TableCell>
                        {transaction.date.toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {transaction.description}
                        {transaction.reasoning && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {transaction.reasoning}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        ${transaction.amount.toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={transaction.category}
                          onValueChange={(value) => handleCategoryChange(transaction.id, value as ExpenseCategory)}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.map(category => (
                              <SelectItem key={category} value={category}>
                                {category}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        {transaction.confidence !== undefined && (
                          <Badge className={getConfidenceBadgeColor(transaction.confidence)}>
                            {(transaction.confidence * 100).toFixed(0)}%
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {transaction.isRecurring && (
                            <Badge variant="outline" className="text-xs">
                              Recurring
                            </Badge>
                          )}
                          {transaction.isPotentialDuplicate && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Duplicate?
                            </Badge>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {transaction.source.toUpperCase()}
                          </Badge>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            
            <TabsContent value="insights" className="mt-4">
              {processingStats && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold">{processingStats.totalTransactions}</div>
                      <div className="text-sm text-muted-foreground">Total Transactions</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-green-600">{processingStats.highConfidence}</div>
                      <div className="text-sm text-muted-foreground">High Confidence (≥80%)</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-yellow-600">{processingStats.mediumConfidence}</div>
                      <div className="text-sm text-muted-foreground">Medium Confidence (50-79%)</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-red-600">{processingStats.lowConfidence}</div>
                      <div className="text-sm text-muted-foreground">Low Confidence (&lt;50%)</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold text-orange-600">{processingStats.potentialDuplicates}</div>
                      <div className="text-sm text-muted-foreground">Potential Duplicates</div>
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-2xl font-bold">{(processingStats.avgConfidence * 100).toFixed(1)}%</div>
                      <div className="text-sm text-muted-foreground">Average Confidence</div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={importSelectedTransactions}
              disabled={transactions.filter(t => t.selected).length === 0}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              Import {transactions.filter(t => t.selected).length} Transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
