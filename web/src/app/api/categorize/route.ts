import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Gemini model configuration
const MODEL = 'gemini-2.0-flash';

// Get API key from server-side environment variable
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

interface TransactionInput {
  description: string;
  amount: number;
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json(
        { error: 'AI processing not configured on server' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const transactions: TransactionInput[] = body.transactions;

    if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
      return NextResponse.json(
        { error: 'No transactions provided' },
        { status: 400 }
      );
    }

    console.log(`Categorizing ${transactions.length} transactions`);

    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const categories = ['Food', 'Housing', 'Transportation', 'Entertainment', 'Healthcare', 'Utilities', 'Shopping', 'Education', 'Travel', 'Other'];
    
    const prompt = `You are a financial categorization expert. For each transaction, categorize it into one of these categories: ${categories.join(', ')}.

Transactions to categorize:
${transactions.map((t, i) => `${i + 1}. ${t.description} ($${t.amount})`).join('\n')}

Respond with ONLY a JSON array (no markdown, no explanation):
[
  {
    "index": 1,
    "category": "Food",
    "confidence": 0.95,
    "reasoning": "Restaurant transaction"
  }
]

Guidelines:
- Food: Restaurants, groceries, delivery
- Housing: Rent, mortgage, repairs
- Transportation: Fuel, transit, rideshare, parking
- Entertainment: Streaming, gaming, movies
- Healthcare: Medical, pharmacy, insurance
- Utilities: Electricity, water, internet, phone
- Shopping: Retail, online shopping, clothing
- Education: Tuition, books, courses
- Travel: Flights, hotels, vacation
- Other: Anything else`;

    const response = await genAI.models.generateContent({
      model: MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.1,
        maxOutputTokens: 4096,
      }
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      );
    }

    // Parse response
    let jsonString = text.trim();
    const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }
    
    const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonString = jsonMatch[0];
    }

    const categorizations = JSON.parse(jsonString);

    // Map results back to transactions
    const results = transactions.map((transaction, index) => {
      const cat = categorizations.find((c: { index: number }) => c.index === index + 1);
      return {
        ...transaction,
        suggestedCategory: cat?.category && categories.includes(cat.category) ? cat.category : 'Other',
        confidence: cat?.confidence ? Math.max(0, Math.min(1, cat.confidence)) : 0.5,
        reasoning: cat?.reasoning || ''
      };
    });

    return NextResponse.json({
      success: true,
      categorizations: results
    });

  } catch (error) {
    console.error('Categorization error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Categorization failed' },
      { status: 500 }
    );
  }
}
