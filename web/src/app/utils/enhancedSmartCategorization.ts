import OpenAI from 'openai';
import { ExpenseCategory } from '../types';

// Enhanced transaction data with historical context
export interface EnhancedTransactionData {
  description: string;
  amount: number;
  merchantType?: string;
  frequency?: string;
  timeOfDay?: string;
  dayOfWeek?: string;
}

// Categorization result with detailed confidence metrics
export interface EnhancedCategorizationResult {
  suggestedCategory: ExpenseCategory;
  confidence: number;
  reasoning: string;
  alternativeCategories: Array<{
    category: ExpenseCategory;
    confidence: number;
    reason: string;
  }>;
  matchedPatterns: string[];
  isRecurring: boolean;
}

// Historical learning data structure
interface HistoricalCorrection {
  originalDescription: string;
  originalCategory: ExpenseCategory;
  correctedCategory: ExpenseCategory;
  userConfirmed: boolean;
  timestamp: Date;
  amount?: number;
}

// Enhanced categorization service
export class EnhancedSmartCategorization {
  private apiKey: string;
  private openai: OpenAI;
  private historicalCorrections: HistoricalCorrection[] = [];

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });
    this.loadHistoricalCorrections();
  }

  // Load historical corrections from localStorage
  private loadHistoricalCorrections() {
    try {
      const stored = localStorage.getItem('transaction-learning-data');
      if (stored) {
        this.historicalCorrections = (JSON.parse(stored) as HistoricalCorrection[]).map((item) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
      }
    } catch (error) {
      console.error('Failed to load historical corrections:', error);
    }
  }

  // Save historical corrections to localStorage
  private saveHistoricalCorrections() {
    try {
      localStorage.setItem('transaction-learning-data', JSON.stringify(this.historicalCorrections));
    } catch (error) {
      console.error('Failed to save historical corrections:', error);
    }
  }

  // Record user correction for learning
  public recordCorrection(
    description: string,
    originalCategory: ExpenseCategory,
    correctedCategory: ExpenseCategory,
    amount?: number
  ) {
    const correction: HistoricalCorrection = {
      originalDescription: description,
      originalCategory,
      correctedCategory,
      userConfirmed: true,
      timestamp: new Date(),
      amount
    };

    this.historicalCorrections.push(correction);
    
    // Keep only the last 1000 corrections to avoid storage bloat
    if (this.historicalCorrections.length > 1000) {
      this.historicalCorrections = this.historicalCorrections.slice(-1000);
    }

    this.saveHistoricalCorrections();
  }

  // Find similar historical transactions
  private findSimilarTransactions(description: string, amount?: number): HistoricalCorrection[] {
    const cleanDesc = description.toLowerCase().trim();
    
    return this.historicalCorrections.filter(correction => {
      const cleanCorrectionDesc = correction.originalDescription.toLowerCase().trim();
      
      // Exact match
      if (cleanDesc === cleanCorrectionDesc) return true;
      
      // Similar description (contains 70% of words)
      const descWords = cleanDesc.split(/\s+/);
      const correctionWords = cleanCorrectionDesc.split(/\s+/);
      
      const commonWords = descWords.filter(word => 
        word.length > 2 && correctionWords.some(cw => cw.includes(word) || word.includes(cw))
      );
      
      const similarity = commonWords.length / Math.max(descWords.length, correctionWords.length);
      
      // Amount similarity (within 10% if provided)
      let amountSimilar = true;
      if (amount && correction.amount) {
        const amountDiff = Math.abs(amount - correction.amount) / Math.max(amount, correction.amount);
        amountSimilar = amountDiff <= 0.1;
      }
      
      return similarity >= 0.7 && amountSimilar;
    });
  }

  // Enhanced batch categorization with learning
  public async enhancedBatchCategorization(
    transactions: EnhancedTransactionData[]
  ): Promise<EnhancedCategorizationResult[]> {
    const results: EnhancedCategorizationResult[] = [];

    for (const transaction of transactions) {
      try {
        const result = await this.categorizeTransaction(transaction);
        results.push(result);
      } catch (error) {
        console.error('Failed to categorize transaction:', error);
        // Fallback to basic categorization
        results.push({
          suggestedCategory: 'Other',
          confidence: 0.1,
          reasoning: 'Failed to analyze transaction',
          alternativeCategories: [],
          matchedPatterns: [],
          isRecurring: false
        });
      }
    }

    return results;
  }

  // Categorize individual transaction with enhanced context
  private async categorizeTransaction(
    transaction: EnhancedTransactionData
  ): Promise<EnhancedCategorizationResult> {
    // First check historical data
    const similarTransactions = this.findSimilarTransactions(
      transaction.description,
      transaction.amount
    );

    if (similarTransactions.length > 0) {
      // Use historical data with high confidence
      const mostRecent = similarTransactions[0];
      const confidence = Math.min(0.95, 0.8 + (similarTransactions.length * 0.05));
      
      return {
        suggestedCategory: mostRecent.correctedCategory,
        confidence,
        reasoning: `Based on similar historical transaction: "${mostRecent.originalDescription}"`,
        alternativeCategories: [],
        matchedPatterns: ['historical_match'],
        isRecurring: similarTransactions.length > 2
      };
    }

    // Enhanced prompt with context
    const prompt = this.buildEnhancedPrompt(transaction);

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert financial transaction categorizer. Analyze transactions and provide detailed categorization with confidence scores and reasoning.

Available categories: Food, Housing, Transportation, Entertainment, Healthcare, Utilities, Shopping, Education, Travel, Other

Respond ONLY with valid JSON in this exact format:
{
  "suggestedCategory": "category_name",
  "confidence": 0.85,
  "reasoning": "brief explanation",
  "alternativeCategories": [
    {"category": "alt_category", "confidence": 0.6, "reason": "why this could fit"}
  ],
  "matchedPatterns": ["pattern1", "pattern2"],
  "isRecurring": false
}`
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      const parsed = JSON.parse(response);
      
      return {
        suggestedCategory: this.validateCategory(parsed.suggestedCategory),
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || 'AI categorization',
        alternativeCategories: (parsed.alternativeCategories || []).map((alt: { category: string; confidence?: number; reason?: string }) => ({
          category: this.validateCategory(alt.category),
          confidence: Math.max(0, Math.min(1, alt.confidence || 0)),
          reason: alt.reason || ''
        })),
        matchedPatterns: parsed.matchedPatterns || [],
        isRecurring: Boolean(parsed.isRecurring)
      };

    } catch (error) {
      console.error('OpenAI categorization failed:', error);
      
      // Fallback to rule-based categorization
      return this.fallbackCategorization(transaction);
    }
  }

  // Build enhanced prompt with context
  private buildEnhancedPrompt(transaction: EnhancedTransactionData): string {
    let prompt = `Categorize this transaction:
Description: "${transaction.description}"
Amount: $${transaction.amount}`;

    if (transaction.merchantType) {
      prompt += `\nMerchant Type: ${transaction.merchantType}`;
    }

    if (transaction.frequency) {
      prompt += `\nFrequency: ${transaction.frequency}`;
    }

    if (transaction.timeOfDay) {
      prompt += `\nTime of Day: ${transaction.timeOfDay}`;
    }

    if (transaction.dayOfWeek) {
      prompt += `\nDay of Week: ${transaction.dayOfWeek}`;
    }

    // Add context from recent similar transactions (without exposing sensitive data)
    const recentPatterns = this.getRecentCategorationPatterns();
    if (recentPatterns.length > 0) {
      prompt += `\nRecent user preferences: ${recentPatterns.join(', ')}`;
    }

    prompt += `\n\nProvide categorization with high confidence scores for obvious matches (groceries->Food, gas->Transportation, etc.) and lower confidence for ambiguous cases.`;

    return prompt;
  }

  // Get recent categorization patterns for context
  private getRecentCategorationPatterns(): string[] {
    const recentCorrections = this.historicalCorrections
      .slice(-20) // Last 20 corrections
      .filter(c => c.userConfirmed);

    const patterns: string[] = [];
    
    // Group by category to find patterns
    const categoryMap = new Map<string, string[]>();
    recentCorrections.forEach(correction => {
      const category = correction.correctedCategory;
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category)!.push(correction.originalDescription);
    });

    // Extract common words for each category
    categoryMap.forEach((descriptions, category) => {
      const commonWords = this.findCommonWords(descriptions);
      if (commonWords.length > 0) {
        patterns.push(`${category}: ${commonWords.slice(0, 3).join(', ')}`);
      }
    });

    return patterns.slice(0, 5); // Top 5 patterns
  }

  // Find common words in descriptions
  private findCommonWords(descriptions: string[]): string[] {
    const wordCount = new Map<string, number>();
    
    descriptions.forEach(desc => {
      const words = desc.toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 2);
      
      words.forEach(word => {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      });
    });

    return Array.from(wordCount.entries())
      .filter(([word, count]) => word !== '' && count >= Math.min(2, descriptions.length / 2))
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word);
  }

  // Validate category
  private validateCategory(category: string): ExpenseCategory {
    const validCategories: ExpenseCategory[] = [
      'Food', 'Housing', 'Transportation', 'Entertainment', 
      'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'
    ];
    
    return validCategories.includes(category as ExpenseCategory) 
      ? category as ExpenseCategory 
      : 'Other';
  }

  // Fallback rule-based categorization
  private fallbackCategorization(transaction: EnhancedTransactionData): EnhancedCategorizationResult {
    const description = transaction.description.toLowerCase();
    
    // Enhanced keyword mapping with confidence scores
    const categoryRules = [
      { patterns: ['restaurant', 'cafe', 'food', 'grocery', 'supermarket', 'meal'], category: 'Food' as ExpenseCategory, confidence: 0.9 },
      { patterns: ['rent', 'mortgage', 'property', 'landlord'], category: 'Housing' as ExpenseCategory, confidence: 0.95 },
      { patterns: ['uber', 'taxi', 'gas', 'fuel', 'parking', 'transport'], category: 'Transportation' as ExpenseCategory, confidence: 0.85 },
      { patterns: ['movie', 'cinema', 'netflix', 'spotify', 'entertainment'], category: 'Entertainment' as ExpenseCategory, confidence: 0.8 },
      { patterns: ['doctor', 'pharmacy', 'medical', 'hospital', 'health'], category: 'Healthcare' as ExpenseCategory, confidence: 0.9 },
      { patterns: ['electricity', 'water', 'gas', 'internet', 'phone', 'utility'], category: 'Utilities' as ExpenseCategory, confidence: 0.85 },
      { patterns: ['amazon', 'shop', 'store', 'purchase', 'buy'], category: 'Shopping' as ExpenseCategory, confidence: 0.7 },
      { patterns: ['school', 'university', 'education', 'course', 'tuition'], category: 'Education' as ExpenseCategory, confidence: 0.9 },
      { patterns: ['flight', 'hotel', 'travel', 'vacation', 'trip'], category: 'Travel' as ExpenseCategory, confidence: 0.85 }
    ];

    for (const rule of categoryRules) {
      const matches = rule.patterns.filter(pattern => description.includes(pattern));
      if (matches.length > 0) {
        return {
          suggestedCategory: rule.category,
          confidence: rule.confidence,
          reasoning: `Matched keywords: ${matches.join(', ')}`,
          alternativeCategories: [],
          matchedPatterns: matches,
          isRecurring: false
        };
      }
    }

    return {
      suggestedCategory: 'Other',
      confidence: 0.3,
      reasoning: 'No clear category match found',
      alternativeCategories: [],
      matchedPatterns: [],
      isRecurring: false
    };
  }

  // Get categorization statistics
  public getCategorizationStats() {
    const totalCorrections = this.historicalCorrections.length;
    const categoryCounts = new Map<string, number>();
    
    this.historicalCorrections.forEach(correction => {
      const category = correction.correctedCategory;
      categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    });

    return {
      totalLearned: totalCorrections,
      categoriesCounts: Object.fromEntries(categoryCounts),
      lastUpdated: this.historicalCorrections.length > 0 
        ? this.historicalCorrections[this.historicalCorrections.length - 1].timestamp 
        : null
    };
  }

  // Clear historical data (for privacy/reset)
  public clearLearningData() {
    this.historicalCorrections = [];
    localStorage.removeItem('transaction-learning-data');
  }
}

// Utility function for backward compatibility
export async function enhancedBatchCategorizeTransactions(
  transactions: { description: string; amount: number }[],
  apiKey: string
): Promise<EnhancedCategorizationResult[]> {
  const categorizer = new EnhancedSmartCategorization(apiKey);
  const enhancedTransactions: EnhancedTransactionData[] = transactions.map(t => ({
    description: t.description,
    amount: t.amount
  }));
  
  return categorizer.enhancedBatchCategorization(enhancedTransactions);
}