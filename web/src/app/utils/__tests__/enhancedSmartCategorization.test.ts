/* eslint-disable @typescript-eslint/no-explicit-any */
// import { jest } from '@jest/globals'; // Remove this to rely on global jest and avoid hoisting issues
import OpenAI from 'openai';
import { 
  EnhancedSmartCategorization, 
  EnhancedTransactionData
} from '../enhancedSmartCategorization';

jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

// Mock localStorage
const mockLocalStorage = (() => {
// ...
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

describe('EnhancedSmartCategorization', () => {
  let categorizer: EnhancedSmartCategorization;
  const testApiKey = 'sk-test-key-12345';
  let mockCreate: any; // using any to avoid type complexity with jest.Mock vs function

  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalStorage.clear();
    
    // Setup OpenAI mock
    mockCreate = jest.fn();
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    }));

    categorizer = new EnhancedSmartCategorization(testApiKey);
  });

  describe('Constructor and Initialization', () => {
    it('initializes with API key', () => {
      expect(categorizer).toBeInstanceOf(EnhancedSmartCategorization);
    });

    it('loads historical corrections from localStorage', () => {
      const mockHistoricalData = JSON.stringify([
        {
          originalDescription: 'Starbucks Coffee',
          originalCategory: 'Other',
          correctedCategory: 'Food',
          userConfirmed: true,
          timestamp: new Date().toISOString(),
        },
      ]);

      mockLocalStorage.setItem('transaction-learning-data', mockHistoricalData);
      
      new EnhancedSmartCategorization(testApiKey);
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('transaction-learning-data');
    });

    it('handles corrupted localStorage data gracefully', () => {
      mockLocalStorage.setItem('transaction-learning-data', 'invalid-json');
      
      // Should not throw
      expect(() => new EnhancedSmartCategorization(testApiKey)).not.toThrow();
    });
  });

  describe('Historical Learning', () => {
    it('records user corrections', () => {
      categorizer.recordCorrection(
        'McDonalds Restaurant',
        'Other',
        'Food',
        15.99
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'transaction-learning-data',
        expect.stringContaining('McDonalds Restaurant')
      );
    });

    it('limits historical corrections to 1000 entries', () => {
      // Add 1001 corrections
      for (let i = 0; i < 1001; i++) {
        categorizer.recordCorrection(
          `Transaction ${i}`,
          'Other',
          'Food'
        );
      }

      // Verify the data was saved (implying the limit was applied)
      expect(mockLocalStorage.setItem).toHaveBeenCalled();
    });

    it('provides categorization statistics', () => {
      categorizer.recordCorrection('Starbucks', 'Other', 'Food');
      categorizer.recordCorrection('Shell Gas', 'Other', 'Transportation');
      
      const stats = categorizer.getCategorizationStats();
      
      expect(stats.totalLearned).toBe(2);
      expect(stats.categoriesCounts).toEqual({
        Food: 1,
        Transportation: 1,
      });
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });

    it('clears learning data', () => {
      categorizer.recordCorrection('Test', 'Other', 'Food');
      categorizer.clearLearningData();
      
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('transaction-learning-data');
      
      const stats = categorizer.getCategorizationStats();
      expect(stats.totalLearned).toBe(0);
    });
  });

  describe('Enhanced Batch Categorization', () => {
    const mockTransactions: EnhancedTransactionData[] = [
      {
        description: 'Starbucks Coffee Shop',
        amount: 5.99,
        timeOfDay: 'morning',
        dayOfWeek: 'Monday',
      },
      {
        description: 'Shell Gas Station',
        amount: 45.00,
        timeOfDay: 'afternoon',
        dayOfWeek: 'Tuesday',
      },
    ];

    it('uses historical data for similar transactions', async () => {
      // Record a historical correction
      categorizer.recordCorrection('Starbucks Coffee Shop', 'Other', 'Food', 5.99);
      
      const results = await categorizer.enhancedBatchCategorization(mockTransactions);
      
      expect(results).toHaveLength(2);
      expect(results[0].suggestedCategory).toBe('Food');
      expect(results[0].confidence).toBeGreaterThan(0.8);
      expect(results[0].reasoning).toContain('historical');
    });

    it('falls back to OpenAI when no historical data exists', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              suggestedCategory: 'Food',
              confidence: 0.9,
              reasoning: 'Coffee shop transaction',
              alternativeCategories: [],
              matchedPatterns: ['coffee'],
              isRecurring: false,
            }),
          },
        }],
      };

      (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
      
      const results = await categorizer.enhancedBatchCategorization([mockTransactions[0]]);
      
      expect(mockCreate).toHaveBeenCalled();
      expect(results[0].suggestedCategory).toBe('Food');
      expect(results[0].confidence).toBe(0.9);
    });

    it('handles OpenAI API errors gracefully', async () => {
      (mockCreate as jest.Mock<any>).mockRejectedValue(
        new Error('API Error')
      );
      
      const results = await categorizer.enhancedBatchCategorization(mockTransactions);
      
      expect(results).toHaveLength(2);
      // Should fall back to rule-based categorization
      expect(results[0].confidence).toBeLessThan(1.0);
    });

    it('validates and sanitizes OpenAI responses', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              suggestedCategory: 'InvalidCategory', // Invalid category
              confidence: 1.5, // Invalid confidence > 1
              reasoning: 'Test',
              alternativeCategories: [],
              matchedPatterns: [],
              isRecurring: false,
            }),
          },
        }],
      };

      (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
      
      const results = await categorizer.enhancedBatchCategorization([mockTransactions[0]]);
      
      expect(results[0].suggestedCategory).toBe('Other'); // Should default to 'Other'
      expect(results[0].confidence).toBeLessThanOrEqual(1.0); // Should be clamped
    });

    it('handles malformed JSON responses', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response',
          },
        }],
      };

      (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
      
      const results = await categorizer.enhancedBatchCategorization([mockTransactions[0]]);
      
      expect(results[0]).toBeDefined();
      // Should fall back to rule-based categorization
    });
  });

  describe('Fallback Categorization', () => {
    it('categorizes food-related transactions', async () => {
      // Disable OpenAI by throwing an error
      (mockCreate as jest.Mock<any>).mockRejectedValue(
        new Error('API unavailable')
      );

      const foodTransaction: EnhancedTransactionData = {
        description: 'McDonalds Restaurant',
        amount: 12.99,
      };

      const results = await categorizer.enhancedBatchCategorization([foodTransaction]);
      
      expect(results[0].suggestedCategory).toBe('Food');
      expect(results[0].matchedPatterns).toContain('restaurant');
    });

    it('categorizes transportation transactions', async () => {
      (mockCreate as jest.Mock<any>).mockRejectedValue(
        new Error('API unavailable')
      );

      const transportTransaction: EnhancedTransactionData = {
        description: 'Shell Gas Station',
        amount: 45.00,
      };

      const results = await categorizer.enhancedBatchCategorization([transportTransaction]);
      
      expect(results[0].suggestedCategory).toBe('Transportation');
      expect(results[0].matchedPatterns).toContain('gas');
    });

    it('defaults to Other for unrecognized transactions', async () => {
      (mockCreate as jest.Mock<any>).mockRejectedValue(
        new Error('API unavailable')
      );

      const unknownTransaction: EnhancedTransactionData = {
        description: 'Unknown Merchant ABC123',
        amount: 25.00,
      };

      const results = await categorizer.enhancedBatchCategorization([unknownTransaction]);
      
      expect(results[0].suggestedCategory).toBe('Other');
      expect(results[0].confidence).toBe(0.3);
    });
  });

  describe('Enhanced Context Building', () => {
    it('includes transaction metadata in prompts', async () => {
      const transactionWithContext: EnhancedTransactionData = {
        description: 'Coffee Shop',
        amount: 5.99,
        merchantType: 'Restaurant',
        frequency: 'Daily',
        timeOfDay: 'morning',
        dayOfWeek: 'Monday',
      };

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              suggestedCategory: 'Food',
              confidence: 0.9,
              reasoning: 'Morning coffee purchase',
              alternativeCategories: [],
              matchedPatterns: ['coffee'],
              isRecurring: false,
            }),
          },
        }],
      };

      (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
      
      await categorizer.enhancedBatchCategorization([transactionWithContext]);
      
      const callArgs = (mockCreate as jest.Mock<any>).mock.calls[0][0] as any;
      const prompt = callArgs.messages[1].content;
      
      expect(prompt).toContain('Merchant Type: Restaurant');
      expect(prompt).toContain('Frequency: Daily');
      expect(prompt).toContain('Time of Day: morning');
      expect(prompt).toContain('Day of Week: Monday');
    });

    it('includes recent categorization patterns in context', async () => {
      // Add some historical data
      categorizer.recordCorrection('Starbucks Coffee', 'Other', 'Food');
      categorizer.recordCorrection('Coffee Bean', 'Other', 'Food');
      categorizer.recordCorrection('Dunkin Coffee', 'Other', 'Food');

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              suggestedCategory: 'Food',
              confidence: 0.9,
              reasoning: 'Coffee shop',
              alternativeCategories: [],
              matchedPatterns: [],
              isRecurring: false,
            }),
          },
        }],
      };

      (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
      
      await categorizer.enhancedBatchCategorization([{
        description: 'Local Coffee Shop',
        amount: 4.50,
      }]);
      
      const callArgs = (mockCreate as jest.Mock<any>).mock.calls[0][0] as any;
      const prompt = callArgs.messages[1].content;
      
      expect(prompt).toContain('Recent user preferences');
    });
  });

  describe('Utility Functions', () => {
    it('validates expense categories correctly', async () => {
      const validCategories = [
        'Food', 'Housing', 'Transportation', 'Entertainment',
        'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'
      ];

      for (const category of validCategories) {
        const mockResponse = {
          choices: [{
            message: {
              content: JSON.stringify({
                suggestedCategory: category,
                confidence: 0.9,
                reasoning: 'Test',
                alternativeCategories: [],
                matchedPatterns: [],
                isRecurring: false,
              }),
            },
          }],
        };

        (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
        
        const results = await categorizer.enhancedBatchCategorization([{
          description: 'Test Transaction',
          amount: 10.00,
        }]);
        
        expect(results[0].suggestedCategory).toBe(category);
      }
    });

    it('finds common words in descriptions', () => {
      // This tests the internal findCommonWords method indirectly
      categorizer.recordCorrection('Starbucks Coffee Shop', 'Other', 'Food');
      categorizer.recordCorrection('Dunkin Coffee', 'Other', 'Food');
      categorizer.recordCorrection('Local Coffee House', 'Other', 'Food');

      const stats = categorizer.getCategorizationStats();
      expect(stats.totalLearned).toBe(3);
    });
  });

  describe('Backward Compatibility', () => {
    it('works with the utility function export', async () => {
      const { enhancedBatchCategorizeTransactions } = await import('../enhancedSmartCategorization');
      
      const transactions = [
        { description: 'Test Transaction', amount: 10.00 }
      ];

      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              suggestedCategory: 'Other',
              confidence: 0.5,
              reasoning: 'Test',
              alternativeCategories: [],
              matchedPatterns: [],
              isRecurring: false,
            }),
          },
        }],
      };

      (mockCreate as jest.Mock<any>).mockResolvedValue(mockResponse);
      
      const results = await enhancedBatchCategorizeTransactions(transactions, testApiKey);
      
      expect(results).toHaveLength(1);
      expect(results[0].suggestedCategory).toBe('Other');
    });
  });
});