import OpenAI from 'openai';
import { ExpenseCategory } from '../types';

// Enhanced categorization using OpenAI
export async function smartCategorizeTransactions(
  transactions: Array<{ description: string; amount: number }>,
  apiKey: string
): Promise<Array<{ description: string; amount: number; suggestedCategory: ExpenseCategory; confidence: number }>> {
  
  if (!apiKey) {
    // Fallback to simple categorization
    return transactions.map(t => ({
      ...t,
      suggestedCategory: simpleGuessCategory(t.description),
      confidence: 0.5
    }));
  }

  try {
    const openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true,
    });

    const categories = ['Food', 'Housing', 'Transportation', 'Entertainment', 'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'];
    
    const prompt = `
You are a financial categorization expert. For each transaction description provided, categorize it into one of these categories: ${categories.join(', ')}.

Also provide a confidence score from 0.0 to 1.0 for each categorization.

Transactions to categorize:
${transactions.map((t, i) => `${i + 1}. ${t.description} ($${t.amount})`).join('\n')}

Please respond with a JSON array where each object has:
{
  "index": number (1-based),
  "category": string (one of the valid categories),
  "confidence": number (0.0 to 1.0),
  "reasoning": string (brief explanation)
}

Consider:
- Food includes restaurants, groceries, delivery services
- Housing includes rent, mortgage, utilities related to home
- Transportation includes fuel, public transport, rideshare, parking
- Entertainment includes movies, streaming, games, concerts
- Healthcare includes medical, pharmacy, insurance
- Utilities includes electricity, water, gas, internet, phone
- Shopping includes retail, online purchases, clothing
- Education includes tuition, books, courses
- Travel includes flights, hotels, vacation expenses
- Other for anything that doesn't clearly fit above categories

Be precise and consistent with categorization.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Try to parse JSON from the response
    let categorizations: Array<{
      index: number;
      category: string;
      confidence: number;
      reasoning: string;
    }> = [];

    try {
      // Look for JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        categorizations = JSON.parse(jsonMatch[0]);
      } else {
        // Try to parse the entire response as JSON
        categorizations = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse categorization response:', parseError);
      // Fallback to simple categorization
      return transactions.map(t => ({
        ...t,
        suggestedCategory: simpleGuessCategory(t.description),
        confidence: 0.5
      }));
    }

    // Map the results back to transactions
    return transactions.map((transaction, index) => {
      const categorization = categorizations.find(c => c.index === index + 1);
      if (categorization && categories.includes(categorization.category)) {
        return {
          ...transaction,
          suggestedCategory: categorization.category as ExpenseCategory,
          confidence: Math.max(0, Math.min(1, categorization.confidence))
        };
      } else {
        return {
          ...transaction,
          suggestedCategory: simpleGuessCategory(transaction.description),
          confidence: 0.5
        };
      }
    });

  } catch (error) {
    console.error('Error in smart categorization:', error);
    // Fallback to simple categorization
    return transactions.map(t => ({
      ...t,
      suggestedCategory: simpleGuessCategory(t.description),
      confidence: 0.5
    }));
  }
}

// Enhanced simple categorization with more keywords
const enhancedCategoryKeywords: Record<string, ExpenseCategory> = {
  // Food & Dining
  'restaurant': 'Food',
  'cafe': 'Food',
  'coffee': 'Food',
  'starbucks': 'Food',
  'mcdonald': 'Food',
  'kfc': 'Food',
  'subway': 'Food',
  'pizza': 'Food',
  'uber eats': 'Food',
  'doordash': 'Food',
  'deliveroo': 'Food',
  'menulog': 'Food',
  'grocery': 'Food',
  'supermarket': 'Food',
  'woolworths': 'Food',
  'coles': 'Food',
  'aldi': 'Food',
  'iga': 'Food',
  'safeway': 'Food',
  'trader joe': 'Food',
  'whole foods': 'Food',
  'bakery': 'Food',
  'butcher': 'Food',
  'deli': 'Food',
  'market': 'Food',
  'food': 'Food',
  'dining': 'Food',
  'lunch': 'Food',
  'dinner': 'Food',
  'breakfast': 'Food',
  
  // Housing
  'rent': 'Housing',
  'mortgage': 'Housing',
  'landlord': 'Housing',
  'apartment': 'Housing',
  'property': 'Housing',
  'real estate': 'Housing',
  'home loan': 'Housing',
  'strata': 'Housing',
  'body corporate': 'Housing',
  'council rates': 'Housing',
  'property tax': 'Housing',
  'homeowners': 'Housing',
  'rental': 'Housing',
  
  // Transportation
  'uber': 'Transportation',
  'lyft': 'Transportation',
  'taxi': 'Transportation',
  'fuel': 'Transportation',
  'petrol': 'Transportation',
  'gas station': 'Transportation',
  'shell': 'Transportation',
  'bp': 'Transportation',
  'caltex': 'Transportation',
  'parking': 'Transportation',
  'toll': 'Transportation',
  'metro': 'Transportation',
  'train': 'Transportation',
  'bus': 'Transportation',
  'transport': 'Transportation',
  'car service': 'Transportation',
  'automotive': 'Transportation',
  'mechanic': 'Transportation',
  'car wash': 'Transportation',
  'registration': 'Transportation',
  'insurance car': 'Transportation',
  
  // Entertainment
  'netflix': 'Entertainment',
  'spotify': 'Entertainment',
  'disney': 'Entertainment',
  'amazon prime': 'Entertainment',
  'hulu': 'Entertainment',
  'cinema': 'Entertainment',
  'movie': 'Entertainment',
  'theater': 'Entertainment',
  'theatre': 'Entertainment',
  'concert': 'Entertainment',
  'festival': 'Entertainment',
  'gaming': 'Entertainment',
  'steam': 'Entertainment',
  'playstation': 'Entertainment',
  'xbox': 'Entertainment',
  'nintendo': 'Entertainment',
  'entertainment': 'Entertainment',
  'gym': 'Entertainment',
  'fitness': 'Entertainment',
  'sports': 'Entertainment',
  'club': 'Entertainment',
  'bar': 'Entertainment',
  'pub': 'Entertainment',
  
  // Healthcare
  'doctor': 'Healthcare',
  'dentist': 'Healthcare',
  'pharmacy': 'Healthcare',
  'chemist': 'Healthcare',
  'hospital': 'Healthcare',
  'medical': 'Healthcare',
  'health': 'Healthcare',
  'medicare': 'Healthcare',
  'bupa': 'Healthcare',
  'medibank': 'Healthcare',
  'physiotherapy': 'Healthcare',
  'optometrist': 'Healthcare',
  'specialist': 'Healthcare',
  'pathology': 'Healthcare',
  'radiology': 'Healthcare',
  'prescription': 'Healthcare',
  'clinic': 'Healthcare',
  
  // Utilities
  'electricity': 'Utilities',
  'water': 'Utilities',
  'gas utility': 'Utilities',
  'internet': 'Utilities',
  'phone': 'Utilities',
  'mobile': 'Utilities',
  'telstra': 'Utilities',
  'optus': 'Utilities',
  'vodafone': 'Utilities',
  'tpg': 'Utilities',
  'iinet': 'Utilities',
  'nbn': 'Utilities',
  'agl': 'Utilities',
  'origin': 'Utilities',
  'energy australia': 'Utilities',
  'utility': 'Utilities',
  'council': 'Utilities',
  'water corporation': 'Utilities',
  
  // Shopping
  'amazon': 'Shopping',
  'ebay': 'Shopping',
  'target': 'Shopping',
  'kmart': 'Shopping',
  'myer': 'Shopping',
  'david jones': 'Shopping',
  'big w': 'Shopping',
  'jb hi-fi': 'Shopping',
  'harvey norman': 'Shopping',
  'bunnings': 'Shopping',
  'ikea': 'Shopping',
  'retail': 'Shopping',
  'shopping': 'Shopping',
  'clothing': 'Shopping',
  'fashion': 'Shopping',
  'electronics': 'Shopping',
  'home depot': 'Shopping',
  'walmart': 'Shopping',
  'costco': 'Shopping',
  'online purchase': 'Shopping',
  
  // Education
  'tuition': 'Education',
  'university': 'Education',
  'school': 'Education',
  'course': 'Education',
  'textbook': 'Education',
  'education': 'Education',
  'student': 'Education',
  'training': 'Education',
  'workshop': 'Education',
  'certification': 'Education',
  'udemy': 'Education',
  'coursera': 'Education',
  'skillshare': 'Education',
  'masterclass': 'Education',
  
  // Travel
  'flight': 'Travel',
  'airline': 'Travel',
  'jetstar': 'Travel',
  'qantas': 'Travel',
  'virgin': 'Travel',
  'hotel': 'Travel',
  'motel': 'Travel',
  'airbnb': 'Travel',
  'booking.com': 'Travel',
  'expedia': 'Travel',
  'holiday': 'Travel',
  'vacation': 'Travel',
  'travel': 'Travel',
  'tourism': 'Travel',
  'cruise': 'Travel',
  'rental car': 'Travel',
  'airport': 'Travel'
};

// Pre-computed entries (avoid Object.entries() per call)
const categoryKeywordEntries = Object.entries(enhancedCategoryKeywords);

export function simpleGuessCategory(description: string): ExpenseCategory {
  const lowercaseDesc = description.toLowerCase();

  for (const [keyword, category] of categoryKeywordEntries) {
    if (lowercaseDesc.includes(keyword)) {
      return category;
    }
  }

  return 'Other';
}

// Batch categorization for multiple transactions
export async function batchCategorizeTransactions(
  transactions: Array<{ description: string; amount: number }>,
  apiKey?: string,
  batchSize: number = 10
): Promise<Array<{ description: string; amount: number; suggestedCategory: ExpenseCategory; confidence: number }>> {
  
  if (!apiKey || transactions.length <= batchSize) {
    return smartCategorizeTransactions(transactions, apiKey || '');
  }

  // Process in batches to avoid token limits
  const results = [];
  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const batchResults = await smartCategorizeTransactions(batch, apiKey);
    results.push(...batchResults);
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < transactions.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}