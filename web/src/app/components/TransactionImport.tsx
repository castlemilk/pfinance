'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useFinance } from '../context/FinanceContext';
import { ExpenseCategory } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, CheckCircle2, Upload, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Papa from 'papaparse';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import OpenAI from 'openai';
import { batchCategorizeTransactions } from '../utils/smartCategorization';

// Transaction type for parsed data
interface Transaction {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category: ExpenseCategory;
  selected: boolean;
  confidence?: number;
}

// Interface for parsed JSON data from PDF
interface TransactionData {
  date: string;
  description: string;
  amount: string | number;
}

// Map to default categories based on common keywords
const categoryKeywords: Record<string, ExpenseCategory> = {
  'restaurant': 'Food',
  'cafe': 'Food',
  'uber eats': 'Food',
  'doordash': 'Food',
  'grocery': 'Food',
  'supermarket': 'Food',
  'woolworths': 'Food',
  'coles': 'Food',
  'aldi': 'Food',
  'rent': 'Housing',
  'mortgage': 'Housing',
  'landlord': 'Housing',
  'apartment': 'Housing',
  'uber': 'Transportation',
  'lyft': 'Transportation',
  'taxi': 'Transportation',
  'fuel': 'Transportation',
  'petrol': 'Transportation',
  'gas station': 'Transportation',
  'parking': 'Transportation',
  'netflix': 'Entertainment',
  'spotify': 'Entertainment',
  'cinema': 'Entertainment',
  'movie': 'Entertainment',
  'theater': 'Entertainment',
  'concert': 'Entertainment',
  'doctor': 'Healthcare',
  'pharmacy': 'Healthcare',
  'hospital': 'Healthcare',
  'medical': 'Healthcare',
  'electricity': 'Utilities',
  'water': 'Utilities',
  'gas': 'Utilities',
  'internet': 'Utilities',
  'phone': 'Utilities',
  'mobile': 'Utilities',
  'amazon': 'Shopping',
  'ebay': 'Shopping',
  'target': 'Shopping',
  'kmart': 'Shopping',
  'myer': 'Shopping',
  'big w': 'Shopping',
  'tuition': 'Education',
  'university': 'Education',
  'school': 'Education',
  'course': 'Education',
  'textbook': 'Education',
  'flight': 'Travel',
  'hotel': 'Travel',
  'airbnb': 'Travel',
  'holiday': 'Travel',
  'vacation': 'Travel'
};

// Guess category based on transaction description
const guessCategory = (description: string): ExpenseCategory => {
  const lowercaseDesc = description.toLowerCase();
  
  for (const [keyword, category] of Object.entries(categoryKeywords)) {
    if (lowercaseDesc.includes(keyword)) {
      return category;
    }
  }
  
  return 'Other';
};

// Helper function to convert file to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export default function TransactionImport() {
  const { addExpense, addExpenses } = useFinance();
  const [isDragging, setIsDragging] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = useState(false);
  const [pdfProcessingEnabled, setPdfProcessingEnabled] = useState(false);
  const [smartCategorizationEnabled, setSmartCategorizationEnabled] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved API key and PDF processing preference on component mount
  useEffect(() => {
    const savedApiKey = localStorage.getItem('openai-api-key');
    if (savedApiKey) {
      setApiKey(savedApiKey);
    }
    
    // Try to load PDF processing preference
    const savedPdfProcessing = localStorage.getItem('pdf-processing-enabled');
    if (savedPdfProcessing === 'true') {
      setPdfProcessingEnabled(true);
    }
  }, []);
  
  // Store PDF processing preference when it changes
  useEffect(() => {
    localStorage.setItem('pdf-processing-enabled', pdfProcessingEnabled.toString());
    console.log("PDF processing setting saved to localStorage:", pdfProcessingEnabled);
    
    // Update file input accept attribute
    if (fileInputRef.current) {
      fileInputRef.current.accept = pdfProcessingEnabled 
        ? '.csv,.pdf,application/pdf,text/csv' 
        : '.csv,text/csv';
      console.log("Updated file input accept attribute:", fileInputRef.current.accept);
    }
    
    // Clear any error messages when toggling
    setError(null);
  }, [pdfProcessingEnabled]);

  // Process files
  const handleFiles = useCallback((files: FileList) => {
    setIsLoading(true);
    setError(null);
    
    const file = files[0]; // Only process the first file for now
    
    console.log("Processing file:", file.name, "Type:", file.type);
    console.log("PDF processing enabled state:", pdfProcessingEnabled);
    
    // Check file type more robustly
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    
    const isPDF = fileType.includes('pdf') || fileName.endsWith('.pdf');
    const isCSV = fileType.includes('csv') || fileName.endsWith('.csv');
    
    console.log("File type detection - isPDF:", isPDF, "isCSV:", isCSV, "fileType:", fileType, "fileName:", fileName);
    
    if (isCSV) {
      processCSVFile(file);
    } else if (isPDF) {
      if (pdfProcessingEnabled) {
        console.log("PDF processing is enabled, continuing with processing");
        // For PDF files, we'll use the OpenAI API
        if (!apiKey) {
          console.log("No API key found, showing dialog");
          setApiKeyDialogOpen(true);
          setIsLoading(false);
          return;
        }
        console.log("Processing PDF with API key");
        processPDFFile(file);
      } else {
        console.log("PDF file detected but PDF processing is NOT enabled");
        setError(`PDF processing is not enabled. Please toggle "Enable PDF Import" to process PDF files.`);
        setIsLoading(false);
      }
    } else {
      // Neither CSV nor PDF or unsupported format
      const acceptedTypes = pdfProcessingEnabled ? 'CSV and PDF' : 'CSV';
      setError(`File type not supported. Only ${acceptedTypes} files are accepted. Received file: ${file.name} (${file.type})`);
      setIsLoading(false);
    }
  }, [pdfProcessingEnabled, apiKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files.length === 0) return;
    
    console.log("File dropped, PDF processing enabled:", pdfProcessingEnabled);
    handleFiles(files);
  }, [pdfProcessingEnabled, handleFiles]);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle file input change
  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    console.log("File selected via input, PDF processing enabled:", pdfProcessingEnabled);
    handleFiles(files);
    // Reset file input
    e.target.value = '';
  }, [pdfProcessingEnabled, handleFiles]);

  // Process CSV file
  const processCSVFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const parsedTransactions = processCSV(results.data as Record<string, string>[]);
          
          // Apply smart categorization if enabled
          const finalTransactions = await applySmartCategorization(parsedTransactions);
          setTransactions(finalTransactions);
          setIsImportDialogOpen(true);
          setIsLoading(false);
        } catch {
          setError('Failed to process the CSV file. Please check the format.');
          setIsLoading(false);
        }
      },
      error: (error) => {
        setError(`Error parsing CSV file: ${error.message}`);
        setIsLoading(false);
      }
    });
  };

  // Process PDF file using ChatGPT API
  const processPDFFile = async (file: File) => {
    console.log('Extracting transactions from PDF using OpenAI Assistants API...');
    setError('');
    setIsLoading(true);
    
    try {
      // Get the file content as a base64 string
      const base64String = await fileToBase64(file);
      
      // Create a Blob from the base64 string of the PDF
      const byteCharacters = atob(base64String.split(',')[1]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const pdfBlob = new Blob([byteArray], { type: 'application/pdf' });
      
      // Create a File object from the Blob
      const pdfFile = new File([pdfBlob], 'statement.pdf', { type: 'application/pdf' });
      
      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });
      
      // 1. Upload the file
      const fileUploadResponse = await openai.files.create({
        file: pdfFile,
        purpose: 'assistants',
      });
      
      console.log('File uploaded:', fileUploadResponse);
      
      // 2. Create an assistant specifically for extracting transactions
      const assistant = await openai.beta.assistants.create({
        name: "Transaction Extractor",
        instructions: `
          You are a specialized assistant for extracting transaction data from bank statements and credit card PDFs.
          Your goal is to extract all transaction information and return it as a JSON array.
          
          Focus on extracting:
          1. Date (in YYYY-MM-DD format)
          2. Description (the merchant or transaction description)
          3. Amount (as a positive number for expenses, negative for income)
          
          Only extract debit/expense transactions (money going out).
          Format your output as a valid JSON array of objects with the fields: date, description, and amount.
          
          Australian bank statements (Westpac, ANZ, Commonwealth, NAB) typically show dates in DD/MM/YYYY format. 
          Convert them to YYYY-MM-DD format for the output.
        `,
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      });
      
      console.log('Assistant created:', assistant);
      
      // 3. Create a thread
      const thread = await openai.beta.threads.create();
      console.log('Thread created:', thread);
      
      // 4. Add a message to the thread with the file attached
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: "Extract all expense/debit transactions from this bank statement and format them as a JSON array with date (YYYY-MM-DD), description, and amount fields. The amount should be a positive number representing the expense amount.",
        attachments: [
          {
            file_id: fileUploadResponse.id,
            tools: [{ type: "file_search" }]
          }
        ]
      });
      
      // 5. Run the assistant
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
      });
      
      // 6. Poll for the completion of the run
      // @ts-expect-error - OpenAI API compatibility
      let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      
      // Wait for the run to complete
      while (runStatus.status !== 'completed' && runStatus.status !== 'failed') {
        console.log('Run status:', runStatus.status);
        
        // Wait for 1 second before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check status again
        // @ts-expect-error - OpenAI API compatibility
        runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
        
        if (runStatus.status === 'failed') {
          throw new Error(`Run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
        }
      }
      
      // 7. List messages to get the assistant's response
      const messages = await openai.beta.threads.messages.list(thread.id);
      
      // Get the last message from the assistant
      const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
      const lastMessage = assistantMessages[0];
      
      if (!lastMessage) {
        throw new Error('No response from the assistant');
      }
      
      console.log('Assistant response:', lastMessage);
      
      // Extract JSON from the response
      let jsonData = null;
      
      // Process text content
      if (lastMessage.content && lastMessage.content.length > 0) {
        for (const content of lastMessage.content) {
          if (content.type === 'text') {
            const text = content.text.value;
            console.log('Trying to extract JSON from:', text);
            
            // Try to find JSON array in the response
            try {
              // Check for JSON array with standard JSON format
              const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/g);
              if (jsonMatch) {
                jsonData = JSON.parse(jsonMatch[0]);
              } else {
                // Check for JSON inside code blocks
                const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (codeBlockMatch) {
                  jsonData = JSON.parse(codeBlockMatch[1]);
                }
              }
            } catch (e) {
              console.error('Error parsing JSON:', e);
            }
          }
        }
      }
      
      let transactions: Transaction[] = [];
      
      if (jsonData && Array.isArray(jsonData)) {
        transactions = jsonData.map((item: TransactionData, index: number) => {
          const dateObj = item.date ? new Date(item.date) : new Date();
          const amount = typeof item.amount === 'string' ? parseFloat(item.amount) : item.amount;
          return {
            id: `import-pdf-${index}-${Date.now()}`,
            date: dateObj,
            description: item.description || 'Unknown',
            amount: amount,
            category: guessCategory(item.description || ''),
            selected: true
          };
        });
      } else {
        throw new Error('No valid transaction data found in the response');
      }
      
      console.log('Extracted transactions:', transactions);
      
      // Clean up - delete the file
      try {
        // @ts-expect-error - OpenAI API compatibility
        await openai.files.del(fileUploadResponse.id);
        console.log('File deleted');
      } catch (e) {
        console.error('Error deleting file:', e);
      }
      
      if (transactions.length === 0) {
        setError('No transactions found in the PDF. Try uploading a CSV file instead.');
        setIsLoading(false);
        return;
      }
      
      setIsLoading(false);
      setTransactions(transactions);
      setIsImportDialogOpen(true);
    } catch (error: unknown) {
      console.error('Error extracting transactions from PDF:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setError(`Failed to extract transactions from PDF: ${errorMessage}. Try uploading a CSV file instead.`);
      setIsLoading(false);
    }
  };

  // Toggle PDF processing
  const handleTogglePdfProcessing = () => {
    const newValue = !pdfProcessingEnabled;
    console.log(`Toggling PDF processing from ${pdfProcessingEnabled} to ${newValue}`);
    setPdfProcessingEnabled(newValue);
    
    // Show info message to user
    if (newValue) {
      setSuccessMessage('PDF Import Enabled - You can now upload PDF files');
    } else {
      setSuccessMessage('PDF Import Disabled');
    }
    
    setTimeout(() => {
      setSuccessMessage(null);
    }, 3000);
  };

  // Process CSV data based on common bank formats
  const processCSV = (data: Record<string, string>[]): Transaction[] => {
    if (data.length === 0) {
      throw new Error('No data found in the file');
    }
    
    // Try to identify the format based on headers
    const headers = Object.keys(data[0]).map(h => h.toLowerCase());
    
    // Check for date column
    const dateColumn = headers.find(h => 
      h.includes('date') || h.includes('time') || h === 'posted' || h === 'transaction date'
    );
    
    // Check for description/narrative column
    const descriptionColumn = headers.find(h => 
      h.includes('description') || h.includes('narrative') || h.includes('details') || 
      h.includes('merchant') || h.includes('payee')
    );
    
    // Check for amount column (could be debit/credit or just amount)
    const amountColumn = headers.find(h => 
      h.includes('amount') || h.includes('debit') || h.includes('credit') || 
      h.includes('value') || h.includes('sum')
    );
    
    if (!dateColumn || !descriptionColumn || !amountColumn) {
      throw new Error('Could not identify required columns in the CSV');
    }
    
    // Map transactions, ignoring income (positive values)
    return data
      .map((row, index) => {
        let amount = parseFloat(row[amountColumn].replace(/[^\d.-]/g, ''));
        
        // Some banks show debits as positive and credits as negative, others vice versa
        // For consistency, expenses should be positive in our app
        if (amount < 0) {
          amount = Math.abs(amount);
        } else {
          // Skip positive amounts as they're likely income
          return null;
        }
        
        const description = row[descriptionColumn];
        const dateStr = row[dateColumn];
        
        // Try to parse the date, falling back to today if it fails
        let date;
        try {
          date = new Date(dateStr);
          // If date is invalid, throw an error
          if (isNaN(date.getTime())) {
            throw new Error('Invalid date');
          }
        } catch {
          date = new Date();
        }
        
        return {
          id: `import-${index}-${Date.now()}`,
          date,
          description,
          amount,
          category: guessCategory(description),
          selected: true
        };
      })
      .filter(Boolean) as Transaction[]; // Filter out null values
  };

  // Handle category change for a transaction
  const handleCategoryChange = (id: string, category: ExpenseCategory) => {
    setTransactions(prev => 
      prev.map(t => 
        t.id === id ? { ...t, category } : t
      )
    );
  };

  // Toggle transaction selection
  const handleToggleSelect = useCallback((id: string) => {
    setTransactions(prev => 
      prev.map(t => 
        t.id === id ? { ...t, selected: !t.selected } : t
      )
    );
  }, []);

  // Log context information for debugging purposes
  useEffect(() => {
    console.log('TransactionImport mounted, checking context');
    console.log('addExpense function from context:', addExpense);
    console.log('addExpenses function from context:', addExpenses);
    
    // Test if the functions work with a dummy expense
    if (addExpense && typeof addExpense === 'function') {
      console.log('addExpense appears to be a valid function');
    } else {
      console.warn('addExpense is not available or not a function');
    }
    
    if (addExpenses && typeof addExpenses === 'function') {
      console.log('addExpenses (batch) appears to be a valid function');
    } else {
      console.warn('addExpenses (batch) is not available or not a function');
    }
  }, [addExpense, addExpenses]);

  // Direct import function using the new batch method
  const directImport = useCallback(() => {
    console.log('Direct import triggered');
    
    try {
      const selectedTransactions = transactions.filter(t => t.selected);
      
      if (!addExpenses || typeof addExpenses !== 'function') {
        console.error('Context issue: addExpenses is not a function:', addExpenses);
        setError('Internal error: batch import function not available');
        return;
      }
      
      if (selectedTransactions.length === 0) {
        console.warn('No transactions selected');
        setError('Please select at least one transaction to import');
        return;
      }
      
      console.log(`Attempting to batch import ${selectedTransactions.length} transactions`);
      
      // Prepare the batch of transactions
      const transactionsToAdd = selectedTransactions.map(t => ({
        description: t.description,
        amount: t.amount,
        category: t.category,
        frequency: 'monthly' as const
      }));
      
      // Use the batch import method
      addExpenses(transactionsToAdd);
      console.log('Batch import completed');
      
      // Close dialog and show success message
      setIsImportDialogOpen(false);
      setTransactions([]);
      setSuccessMessage(`Successfully imported ${selectedTransactions.length} transactions`);
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      
    } catch (error) {
      console.error('Direct import failed:', error);
      setError(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, [transactions, addExpenses]);

  // Apply smart categorization to transactions
  const applySmartCategorization = async (transactionsToProcess: Transaction[]) => {
    if (!smartCategorizationEnabled || !apiKey) {
      return transactionsToProcess;
    }

    setIsLoading(true);
    setError(null);

    try {
      const transactionData = transactionsToProcess.map(t => ({
        description: t.description,
        amount: t.amount
      }));

      const categorizedData = await batchCategorizeTransactions(transactionData, apiKey);

      const enhancedTransactions = transactionsToProcess.map((transaction, index) => {
        const categorized = categorizedData[index];
        if (categorized) {
          return {
            ...transaction,
            category: categorized.suggestedCategory,
            confidence: categorized.confidence
          };
        }
        return transaction;
      });

      setSuccessMessage(`Smart categorization applied! Average confidence: ${
        (categorizedData.reduce((sum, t) => sum + t.confidence, 0) / categorizedData.length * 100).toFixed(1)
      }%`);

      setTimeout(() => setSuccessMessage(null), 5000);

      return enhancedTransactions;
    } catch (error) {
      console.error('Smart categorization failed:', error);
      setError('Smart categorization failed. Using basic categorization.');
      setTimeout(() => setError(null), 5000);
      return transactionsToProcess;
    } finally {
      setIsLoading(false);
    }
  };

  // Save API key and process the PDF
  const handleSaveApiKey = () => {
    if (apiKey.trim() === '') {
      setError('API Key cannot be empty');
      return;
    }
    
    localStorage.setItem('openai-api-key', apiKey);
    setApiKeyDialogOpen(false);
    
    // Restart processing
    setIsLoading(true);
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput?.files && fileInput.files.length > 0) {
      processPDFFile(fileInput.files[0]);
    } else {
      setIsLoading(false);
      setError('Please select a PDF file again');
    }
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Get all expense categories for dropdown
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
    'Other'
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Import Transactions</span>
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <Switch 
                id="pdf-processing"
                checked={pdfProcessingEnabled}
                onCheckedChange={handleTogglePdfProcessing}
              />
              <Label 
                htmlFor="pdf-processing" 
                className={`text-sm font-normal cursor-pointer ${pdfProcessingEnabled ? 'text-primary font-semibold' : ''}`}
              >
                Enable PDF Import {pdfProcessingEnabled && '(On)'}
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch 
                id="smart-categorization"
                checked={smartCategorizationEnabled}
                onCheckedChange={setSmartCategorizationEnabled}
                disabled={!apiKey}
              />
              <Label 
                htmlFor="smart-categorization" 
                className={`text-sm font-normal cursor-pointer ${smartCategorizationEnabled ? 'text-primary font-semibold' : ''}`}
              >
                Smart Categorization {smartCategorizationEnabled && '(On)'}
              </Label>
            </div>
          </div>
        </CardTitle>
        <CardDescription>
          Drag and drop your bank statement or credit card CSV{pdfProcessingEnabled ? ' or PDF' : ''} to import transactions
          {pdfProcessingEnabled && <span className="ml-1 text-primary">(PDF import is enabled)</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center ${
            isDragging ? 'border-primary bg-primary/10' : 'border-border'
          } transition-colors duration-200 cursor-pointer relative`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input
            type="file"
            id="file-input"
            ref={fileInputRef}
            className="hidden"
            accept={pdfProcessingEnabled ? '.csv,.pdf,application/pdf,text/csv' : '.csv,text/csv'}
            onChange={handleFileInput}
          />
          {pdfProcessingEnabled ? (
            <div className="flex justify-center mb-4">
              <Upload className="w-8 h-8 text-muted-foreground mr-2" />
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
          ) : (
            <Upload className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
          )}
          
          <div className="text-lg font-medium mb-1">
            {isDragging ? 'Drop your file here' : `Drag & drop your ${pdfProcessingEnabled ? 'CSV or PDF' : 'CSV'} file here`}
          </div>
          
          <div className="text-sm text-muted-foreground mb-4">
            or click to browse files {pdfProcessingEnabled ? '(CSV and PDF supported)' : '(only CSV format supported)'}
          </div>
          
          {pdfProcessingEnabled && !apiKey && (
            <div className="mt-2 mb-2 text-sm text-amber-500 flex items-center justify-center gap-1">
              <AlertCircle className="w-4 h-4" />
              OpenAI API key required for PDF processing. <Button onClick={() => setShowApiKeyInput(true)} variant="link" className="p-0 h-auto text-amber-500 underline">Configure now</Button>
            </div>
          )}
          
          {isLoading && (
            <div className="mt-4 text-sm text-muted-foreground">
              Processing file...
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
        
        {pdfProcessingEnabled && (
          <div className="flex justify-end mt-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setShowApiKeyInput(!showApiKeyInput)}
            >
              {showApiKeyInput ? 'Hide API Key Settings' : 'Show API Key Settings'}
            </Button>
          </div>
        )}
        
        {pdfProcessingEnabled && showApiKeyInput && (
          <div className="mt-4 p-4 border rounded-md">
            <h4 className="font-medium mb-2">OpenAI API Key Settings</h4>
            <p className="text-sm text-muted-foreground mb-4">
              PDF processing requires an OpenAI API key with GPT-4 Vision access.
              Your key is stored locally in your browser and never sent to our servers.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your OpenAI API key"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 flex-1"
              />
              <Button onClick={handleSaveApiKey}>
                Save
              </Button>
            </div>
          </div>
        )}
        
        <div className="mt-4 text-sm text-muted-foreground">
          <h3 className="font-medium mb-2">Supported formats:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Most major bank CSVs (Commonwealth, ANZ, Westpac, NAB)</li>
            <li>Credit card statements (Visa, Mastercard, Amex)</li>
            {pdfProcessingEnabled && <li>Bank and credit card PDF statements</li>}
            <li>Exported transactions from budgeting apps</li>
          </ul>
        </div>
      </CardContent>
      
      {/* API Key Dialog */}
      <Dialog open={apiKeyDialogOpen} onOpenChange={setApiKeyDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>OpenAI API Key Required</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              PDF processing requires an OpenAI API key with GPT-4 Vision access.
              Your key is stored locally in your browser and never sent to our servers.
            </p>
            <div className="space-y-2">
              <Label htmlFor="api-key-input" className="text-sm">Your OpenAI API Key</Label>
              <input
                id="api-key-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                You need an API key with access to GPT-4 Vision. 
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline ml-1">
                  Get a key from OpenAI
                </a>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApiKeyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveApiKey} disabled={!apiKey.trim().startsWith('sk-')}>Save and Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Review & Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        // Only allow closing through the Cancel button to prevent accidental closures
        if (!open) {
          setIsImportDialogOpen(false);
        }
      }}>
        <DialogContent className="!w-[90vw] !max-w-[90vw] sm:!max-w-[90vw] md:!max-w-[90vw] lg:!max-w-[90vw] xl:!max-w-[90vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Transactions</DialogTitle>
          </DialogHeader>
          
          <div className="mt-4">
            <div className="text-sm mb-4 flex justify-between items-center">
              <span>
                Found <strong>{transactions.length}</strong> transactions.
                Select which ones to import and verify categories.
              </span>
              
              <span className="text-muted-foreground">
                {transactions.filter(t => t.selected).length} selected
              </span>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Import</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Category</TableHead>
                  {smartCategorizationEnabled && <TableHead className="w-[100px]">Confidence</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map(transaction => (
                  <TableRow key={transaction.id}>
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
                    <TableCell className="max-w-[300px] truncate">
                      {transaction.description}
                    </TableCell>
                    <TableCell>
                      {formatCurrency(transaction.amount)}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={transaction.category}
                        onValueChange={(value) => handleCategoryChange(transaction.id, value as ExpenseCategory)}
                        disabled={!transaction.selected}
                      >
                        <SelectTrigger className="w-[150px]">
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
                    {smartCategorizationEnabled && (
                      <TableCell>
                        {transaction.confidence !== undefined ? (
                          <div className="flex items-center">
                            <div className={`text-xs px-2 py-1 rounded ${
                              transaction.confidence > 0.8 ? 'bg-green-100 text-green-800' :
                              transaction.confidence > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {(transaction.confidence * 100).toFixed(0)}%
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              Cancel
            </Button>
            <button
              type="button"
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 ${transactions.filter(t => t.selected).length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Import button clicked manually');
                directImport();
              }}
              disabled={transactions.filter(t => t.selected).length === 0}
            >
              Import {transactions.filter(t => t.selected).length} Transactions
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-green-600 text-white hover:bg-green-700 h-10 px-4 py-2"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                alert('Test import triggered');
                console.log('Test import button clicked');
                
                if (addExpense && typeof addExpense === 'function') {
                  try {
                    // Create a test expense directly
                    addExpense('Test Transaction', 99.99, 'Food', 'monthly');
                    console.log('Test expense added successfully');
                    alert('Test expense added successfully!');
                  } catch (error) {
                    console.error('Failed to add test expense:', error);
                    alert('Failed to add test expense: ' + error);
                  }
                } else {
                  console.error('addExpense not available for test button');
                  alert('addExpense not available for test button');
                }
              }}
            >
              Test Import
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
} 