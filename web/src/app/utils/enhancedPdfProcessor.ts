import OpenAI from 'openai';

// Enhanced transaction data structure
export interface ExtractedTransaction {
  date: Date;
  description: string;
  amount: number;
  balance?: number;
  transactionType?: 'debit' | 'credit';
  reference?: string;
  confidence: number;
}

// PDF processing result
export interface PdfProcessingResult {
  transactions: ExtractedTransaction[];
  metadata: {
    processingMethod: 'gpt4o' | 'gpt4o_vision' | 'fallback';
    confidence: number;
    pageCount?: number;
    extractedText?: string;
    warnings: string[];
  };
}

// Enhanced PDF processor with multiple extraction methods
export class EnhancedPdfProcessor {
  private apiKey: string;
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
  }

  // Main processing method with fallback strategies
  public async processPdf(file: File): Promise<PdfProcessingResult> {
    const warnings: string[] = [];
    
    try {
      // Method 1: Try GPT-4o with file search (most accurate)
      const result = await this.processWithFileSearch(file);
      if (result.transactions.length > 0) {
        return {
          ...result,
          metadata: {
            ...result.metadata,
            processingMethod: 'gpt4o',
            warnings
          }
        };
      }
      warnings.push('File search method found no transactions');
    } catch (error) {
      console.warn('File search method failed:', error);
      warnings.push(`File search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    try {
      // Method 2: Try GPT-4o Vision (for image-based PDFs)
      const result = await this.processWithVision(file);
      if (result.transactions.length > 0) {
        return {
          ...result,
          metadata: {
            ...result.metadata,
            processingMethod: 'gpt4o_vision',
            warnings
          }
        };
      }
      warnings.push('Vision method found no transactions');
    } catch (error) {
      console.warn('Vision method failed:', error);
      warnings.push(`Vision processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Method 3: Fallback to rule-based extraction (if we had text content)
    warnings.push('All AI methods failed, no transactions could be extracted');
    
    return {
      transactions: [],
      metadata: {
        processingMethod: 'fallback',
        confidence: 0,
        warnings
      }
    };
  }

  // Method 1: GPT-4o with file search (best for text PDFs)
  private async processWithFileSearch(file: File): Promise<PdfProcessingResult> {
    // Upload file to OpenAI
    const fileUploadResponse = await this.openai.files.create({
      file: file,
      purpose: 'assistants',
    });

    try {
      // Create specialized assistant
      const assistant = await this.openai.beta.assistants.create({
        name: "Enhanced Transaction Extractor",
        instructions: this.getEnhancedInstructions(),
        model: "gpt-4o",
        tools: [{ type: "file_search" }],
      });

      // Create thread and add message
      const thread = await this.openai.beta.threads.create();
      
      await this.openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: this.getExtractionPrompt(),
        attachments: [{
          file_id: fileUploadResponse.id,
          tools: [{ type: "file_search" }]
        }]
      });

      // Run assistant
      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
      });

      // Poll for completion with timeout
      const result = await this.pollForCompletion(thread.id, run.id, 60000); // 60 second timeout
      
      // Extract and parse response
      const transactions = this.parseAssistantResponse(result);
      
      return {
        transactions,
        metadata: {
          processingMethod: 'gpt4o',
          confidence: transactions.length > 0 ? 0.9 : 0,
          warnings: []
        }
      };

    } finally {
      // Clean up uploaded file
      try {
        await this.openai.files.delete(fileUploadResponse.id);
      } catch (error) {
        console.warn('Failed to delete uploaded file:', error);
      }
    }
  }

  // Method 2: GPT-4o Vision (for image-based PDFs)
  private async processWithVision(file: File): Promise<PdfProcessingResult> {
    // Convert PDF to images (this would require additional libraries in a real implementation)
    // For now, we'll try to process the PDF directly as an image
    
    const base64 = await this.fileToBase64(file);
    
    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: this.getVisionInstructions()
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract all transaction data from this bank statement PDF. Focus on debits/expenses only."
              },
              {
                type: "image_url",
                image_url: {
                  url: base64
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from Vision API');
      }

      const transactions = this.parseVisionResponse(response);
      
      return {
        transactions,
        metadata: {
          processingMethod: 'gpt4o_vision',
          confidence: transactions.length > 0 ? 0.85 : 0,
          warnings: []
        }
      };

    } catch (error) {
      throw new Error(`Vision processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Enhanced instructions for file search method
  private getEnhancedInstructions(): string {
    return `
You are an expert at extracting transaction data from bank statements and credit card PDFs.

EXTRACTION RULES:
1. Extract ONLY debit/expense transactions (money going out)
2. Skip credits, deposits, transfers between own accounts
3. Include date, description, amount, and any reference numbers
4. Convert all dates to YYYY-MM-DD format
5. Extract amounts as positive numbers
6. Clean up merchant names (remove extra spaces, codes)

COMMON BANK FORMATS:
- Commonwealth Bank, ANZ, Westpac, NAB (Australia)
- Chase, Bank of America, Wells Fargo (USA)
- Barclays, HSBC, Lloyds (UK)

OUTPUT FORMAT:
Return ONLY a JSON array with this structure:
[
  {
    "date": "YYYY-MM-DD",
    "description": "cleaned merchant name",
    "amount": positive_number,
    "reference": "optional_reference",
    "balance": optional_balance_after_transaction,
    "confidence": confidence_score_0_to_1
  }
]

QUALITY CHECKS:
- Verify dates are reasonable (not future dates)
- Ensure amounts are positive and realistic
- Clean up merchant names for readability
- Assign confidence based on text clarity and pattern matching
`;
  }

  // Enhanced extraction prompt
  private getExtractionPrompt(): string {
    return `
Analyze this bank statement and extract all expense/debit transactions.

SPECIFIC REQUIREMENTS:
- Only extract transactions where money is being spent (debits)
- Skip any credits, deposits, or transfers
- Clean merchant names (remove location codes, extra characters)
- Convert dates to YYYY-MM-DD format
- Include confidence score for each transaction

Look for common transaction patterns:
- Purchase at retailers (grocery stores, restaurants, gas stations)
- Online payments (Amazon, streaming services, utilities)
- ATM withdrawals and fees
- Subscription services
- Professional services

Return clean JSON array with transaction objects.
`;
  }

  // Vision-specific instructions
  private getVisionInstructions(): string {
    return `
You are analyzing a bank statement image/PDF. Extract transaction data with high accuracy.

Focus on:
1. Transaction tables/lists
2. Date columns (various formats)
3. Description/Merchant columns
4. Amount columns (look for debit amounts)
5. Reference/Transaction ID columns

Common visual patterns:
- Tables with alternating row colors
- Date-Description-Amount layouts
- Separate debit/credit columns
- Running balance columns

Return JSON array with extracted transaction data.
`;
  }

  // Poll for assistant completion with timeout
  private async pollForCompletion(threadId: string, runId: string, timeoutMs: number): Promise<string> {
    const startTime = Date.now();
    const pollInterval = 1000; // 1 second

    while (Date.now() - startTime < timeoutMs) {
      // @ts-expect-error - OpenAI API compatibility
      const runStatus = await this.openai.beta.threads.runs.retrieve(threadId, runId);
      
      if (runStatus.status === 'completed') {
        const messages = await this.openai.beta.threads.messages.list(threadId);
        const assistantMessages = messages.data.filter(msg => msg.role === 'assistant');
        
        if (assistantMessages.length > 0) {
          const lastMessage = assistantMessages[0];
          if (lastMessage.content && lastMessage.content.length > 0) {
            const textContent = lastMessage.content.find(c => c.type === 'text');
            if (textContent && 'text' in textContent) {
              return textContent.text.value;
            }
          }
        }
        
        throw new Error('No assistant response found');
      }
      
      if (runStatus.status === 'failed') {
        throw new Error(`Assistant run failed: ${runStatus.last_error?.message || 'Unknown error'}`);
      }
      
      if (runStatus.status === 'cancelled') {
        throw new Error('Assistant run was cancelled');
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('Assistant run timed out');
  }

  // Parse assistant response to extract transactions
  private parseAssistantResponse(response: string): ExtractedTransaction[] {
    try {
      // Look for JSON array in response
      const jsonMatch = response.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (!jsonMatch) {
        // Try to find JSON in code blocks
        const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (codeBlockMatch) {
          return this.parseJsonTransactions(codeBlockMatch[1]);
        }
        throw new Error('No JSON found in response');
      }
      
      return this.parseJsonTransactions(jsonMatch[0]);
    } catch (error) {
      console.error('Failed to parse assistant response:', error);
      return [];
    }
  }

  // Parse vision response
  private parseVisionResponse(response: string): ExtractedTransaction[] {
    return this.parseAssistantResponse(response); // Same parsing logic
  }

  // Parse JSON transaction data with validation
  private parseJsonTransactions(jsonString: string): ExtractedTransaction[] {
    try {
      const parsed = JSON.parse(jsonString);
      
      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }
      
      return (parsed as unknown[])
        .map((item, index: number) => this.validateAndCleanTransaction(item, index))
        .filter((transaction): transaction is ExtractedTransaction => transaction !== null);
        
    } catch (error) {
      console.error('JSON parsing failed:', error);
      return [];
    }
  }

  // Validate and clean individual transaction
  private validateAndCleanTransaction(item: unknown, index: number): ExtractedTransaction | null {
    try {
      if (typeof item !== 'object' || item === null) return null;
      
      const txItem = item as Record<string, unknown>;

      // Validate required fields
      if (!txItem.date || !txItem.description || txItem.amount === undefined) {
        console.warn(`Transaction ${index} missing required fields:`, item);
        return null;
      }

      // Parse and validate date
      const date = new Date(txItem.date as string | number | Date);
      if (isNaN(date.getTime())) {
        console.warn(`Transaction ${index} has invalid date:`, txItem.date);
        return null;
      }

      // Validate amount
      const amountValue = txItem.amount as string | number;
      const amount = typeof amountValue === 'string' ? parseFloat(amountValue) : amountValue;
      if (isNaN(amount) || amount <= 0) {
        console.warn(`Transaction ${index} has invalid amount:`, txItem.amount);
        return null;
      }

      // Clean description
      const description = String(txItem.description)
        .trim()
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .replace(/[^\w\s\-&.,()]/g, '') // Remove special characters except common ones
        .slice(0, 200); // Limit length

      return {
        date,
        description,
        amount,
        balance: txItem.balance ? parseFloat(txItem.balance as string) : undefined,
        transactionType: (txItem.transactionType as 'debit' | 'credit') || 'debit',
        reference: txItem.reference ? String(txItem.reference).trim() : undefined,
        confidence: Math.max(0, Math.min(1, (txItem.confidence as number) || 0.8))
      };

    } catch (error) {
      console.error(`Failed to validate transaction ${index}:`, error);
      return null;
    }
  }

  // Convert file to base64
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  }

  // Detect potential duplicate transactions
  public detectDuplicates(
    newTransactions: ExtractedTransaction[], 
    existingTransactions: { date: Date; description: string; amount: number }[]
  ): { transaction: ExtractedTransaction; duplicates: Array<{ date: Date; description: string; amount: number }> }[] {
    const results: { transaction: ExtractedTransaction; duplicates: Array<{ date: Date; description: string; amount: number }> }[] = [];

    newTransactions.forEach(newTx => {
      const duplicates = existingTransactions.filter(existing => {
        // Same date and amount
        const sameDate = Math.abs(newTx.date.getTime() - existing.date.getTime()) < 24 * 60 * 60 * 1000; // Within 1 day
        const sameAmount = Math.abs(newTx.amount - existing.amount) < 0.01; // Within 1 cent
        
        // Similar description (70% similarity)
        const descSimilarity = this.calculateStringSimilarity(
          newTx.description.toLowerCase(),
          existing.description.toLowerCase()
        );
        
        return sameDate && sameAmount && descSimilarity > 0.7;
      });

      if (duplicates.length > 0) {
        results.push({ transaction: newTx, duplicates });
      }
    });

    return results;
  }

  // Calculate string similarity (Jaccard similarity)
  private calculateStringSimilarity(str1: string, str2: string): number {
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }
}