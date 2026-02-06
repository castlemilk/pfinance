import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Gemini model configuration - using flash for faster processing
const MODEL = 'gemini-3-flash-preview';

// Get API key from server-side environment variable (not exposed to client)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!GEMINI_API_KEY) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json(
        { error: 'AI processing not configured on server' },
        { status: 500 }
      );
    }

    // Get the form data with the file
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = formData.get('documentType') as string || 'pdf';

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    console.log(`Processing ${documentType} document: ${file.name} (${file.size} bytes)`);

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Initialize Gemini
    const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Get the appropriate prompt based on document type
    const prompt = documentType === 'image' 
      ? getImageExtractionPrompt() 
      : getPdfExtractionPrompt();

    // Process with Gemini
    const response = await genAI.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: file.type || (documentType === 'image' ? 'image/jpeg' : 'application/pdf'),
                data: base64
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        maxOutputTokens: 65536, // Increased for large documents
      }
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(
        { error: 'No response from AI' },
        { status: 500 }
      );
    }

    // Parse the response
    const transactions = parseResponse(text);

    // Calculate average confidence
    const avgConfidence = transactions.length > 0
      ? transactions.reduce((sum, t) => sum + (t.confidence || 0.8), 0) / transactions.length
      : 0;

    return NextResponse.json({
      success: true,
      transactions: transactions.map(t => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
        reference: t.reference,
        confidence: t.confidence,
        category: t.category,
      })),
      metadata: {
        processingMethod: 'gemini',
        modelUsed: MODEL,
        confidence: avgConfidence,
        documentType,
        itemCount: transactions.length,
        hasMultipleItems: transactions.length > 1,
      }
    });

  } catch (error) {
    console.error('Document processing error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Processing failed' },
      { status: 500 }
    );
  }
}

function getPdfExtractionPrompt(): string {
  return `You are analyzing a bank statement or financial document. Extract all expense/debit transactions.

EXTRACTION RULES:
1. Extract ONLY debit/expense transactions (money going out)
2. Skip credits, deposits, refunds, and transfers between own accounts
3. Convert all dates to YYYY-MM-DD format
4. Express amounts as positive numbers
5. Clean merchant names for readability

OUTPUT FORMAT:
Return ONLY a valid JSON array with this structure (no markdown, no explanation):
[
  {
    "date": "YYYY-MM-DD",
    "description": "cleaned merchant/description",
    "amount": positive_number,
    "reference": "optional_reference",
    "confidence": 0.0_to_1.0
  }
]

If no transactions are found, return an empty array: []`;
}

function getImageExtractionPrompt(): string {
  return `You are analyzing a receipt image, expense photo, or bank transaction screenshot.

Extract ALL financial transaction information with FULL DETAIL:

FOR DETAILED RECEIPTS (itemized):
1. Extract EACH LINE ITEM as a separate transaction
2. Include the item description
3. Include quantity if visible
4. Include the item price
5. Also include a TOTAL entry for the receipt total

FOR SIMPLE RECEIPTS:
1. Merchant/Store name → description
2. Total amount paid → amount (as positive number)
3. Date of transaction → date (YYYY-MM-DD format)

CATEGORIZATION HINTS:
- Grocery stores → category: "Food"
- Restaurants/cafes → category: "Food"
- Gas/petrol stations → category: "Transportation"
- Electronics/clothing stores → category: "Shopping"
- Pharmacies → category: "Healthcare"
- Streaming services → category: "Entertainment"

OUTPUT FORMAT:
Return ONLY a valid JSON object (no markdown, no explanation):
{
  "merchant": "Store/Merchant Name",
  "date": "YYYY-MM-DD",
  "items": [
    {
      "description": "Item description",
      "amount": positive_number,
      "quantity": 1,
      "category": "Food|Shopping|etc"
    }
  ],
  "subtotal": number_or_null,
  "tax": number_or_null,
  "total": positive_number,
  "paymentMethod": "cash|card|etc",
  "confidence": 0.0_to_1.0
}

If it's a simple receipt without line items, just include merchant, date, total, and confidence.
If no transaction found, return: { "error": "No transaction found" }`;
}

interface RawTransaction {
  date?: string | number | Date;
  description?: string;
  amount?: string | number;
  reference?: string;
  balance?: string | number;
  confidence?: number;
  category?: string;
}

interface ReceiptItem {
  description: string;
  amount: number;
  quantity?: number;
  category?: string;
}

interface ReceiptData {
  merchant?: string;
  date?: string;
  items?: ReceiptItem[];
  subtotal?: number;
  tax?: number;
  total?: number;
  paymentMethod?: string;
  confidence?: number;
  error?: string;
}

// Merchant normalizer mapping (simplified version for API route)
const merchantCategories: Record<string, string> = {
  'woolworths': 'Food', 'coles': 'Food', 'aldi': 'Food',
  'mcdonalds': 'Food', 'starbucks': 'Food', 'subway': 'Food',
  'uber eats': 'Food', 'doordash': 'Food', 'deliveroo': 'Food',
  'uber': 'Transportation', 'lyft': 'Transportation', 'shell': 'Transportation', 'bp': 'Transportation',
  'netflix': 'Entertainment', 'spotify': 'Entertainment', 'disney': 'Entertainment',
  'amazon': 'Shopping', 'target': 'Shopping', 'walmart': 'Shopping',
  'cvs': 'Healthcare', 'walgreens': 'Healthcare', 'pharmacy': 'Healthcare',
};

function normalizeMerchantName(merchant: string): { name: string; category: string } {
  const lower = merchant.toLowerCase().trim();

  for (const [key, category] of Object.entries(merchantCategories)) {
    if (lower.includes(key)) {
      // Capitalize first letter of each word
      const name = merchant
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
      return { name, category };
    }
  }

  return {
    name: merchant.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
    category: 'Other'
  };
}

function parseResponse(response: string): RawTransaction[] {
  try {
    let jsonString = response.trim();

    // Remove markdown code blocks if present
    const codeBlockMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonString = codeBlockMatch[1].trim();
    }

    // Try to find JSON object or array
    const jsonObjectMatch = jsonString.match(/\{[\s\S]*\}/);
    const jsonArrayMatch = jsonString.match(/\[\s*[\s\S]*\]/);

    if (jsonObjectMatch) {
      jsonString = jsonObjectMatch[0];
    } else if (jsonArrayMatch) {
      jsonString = jsonArrayMatch[0];
    }

    // Handle truncated JSON - try to recover partial data
    let parsed;
    try {
      parsed = JSON.parse(jsonString);
    } catch (parseError) {
      console.warn('JSON parse failed, attempting to recover truncated response...');
      // Try to fix truncated JSON by finding last complete object
      const lastCompleteObject = jsonString.lastIndexOf('},');
      const lastObject = jsonString.lastIndexOf('}');

      if (lastCompleteObject > 0) {
        // Cut at last complete object and close the array
        jsonString = jsonString.substring(0, lastCompleteObject + 1) + ']';
        console.log('Recovered truncated JSON, parsing again...');
        parsed = JSON.parse(jsonString);
      } else if (lastObject > 0 && jsonString.indexOf('[') === 0) {
        // Try closing after last complete object
        jsonString = jsonString.substring(0, lastObject + 1) + ']';
        parsed = JSON.parse(jsonString);
      } else {
        throw parseError; // Re-throw if we can't recover
      }
    }

    // Handle new receipt format (object with items)
    if (parsed && !Array.isArray(parsed) && typeof parsed === 'object') {
      const receiptData = parsed as ReceiptData;

      if (receiptData.error) {
        console.warn('Receipt parsing returned error:', receiptData.error);
        return [];
      }

      const merchantInfo = normalizeMerchantName(receiptData.merchant || 'Unknown');
      const transactions: RawTransaction[] = [];

      // If we have itemized data, create transactions for each item
      if (receiptData.items && receiptData.items.length > 0) {
        for (const item of receiptData.items) {
          if (item.amount && item.amount > 0) {
            transactions.push({
              date: receiptData.date || new Date().toISOString().split('T')[0],
              description: `${merchantInfo.name} - ${item.description}`,
              amount: item.amount * (item.quantity || 1),
              confidence: (receiptData.confidence || 0.85) * 0.9, // Slightly lower confidence for items
              category: item.category || merchantInfo.category,
            });
          }
        }
      }

      // Always add the total as a primary transaction
      if (receiptData.total && receiptData.total > 0) {
        transactions.unshift({
          date: receiptData.date || new Date().toISOString().split('T')[0],
          description: merchantInfo.name,
          amount: receiptData.total,
          confidence: receiptData.confidence || 0.85,
          category: merchantInfo.category,
        });
      }

      return transactions;
    }

    // Handle legacy array format
    if (!Array.isArray(parsed)) {
      console.warn('Response is not an array or valid receipt object');
      return [];
    }

    // Validate and clean transactions
    return parsed
      .map((item: RawTransaction, index: number) => {
        if (!item.date || !item.description || item.amount === undefined) {
          console.warn(`Transaction ${index} missing required fields`);
          return null;
        }

        const amount = typeof item.amount === 'string'
          ? parseFloat(item.amount.replace(/[^0-9.-]/g, ''))
          : item.amount;

        if (isNaN(amount) || amount <= 0) {
          console.warn(`Transaction ${index} has invalid amount`);
          return null;
        }

        const merchantInfo = normalizeMerchantName(String(item.description));

        return {
          date: item.date,
          description: merchantInfo.name.slice(0, 200),
          amount,
          reference: item.reference ? String(item.reference).trim() : undefined,
          confidence: Math.max(0, Math.min(1, item.confidence || 0.8)),
          category: item.category || merchantInfo.category,
        };
      })
      .filter((tx): tx is NonNullable<typeof tx> => tx !== null);

  } catch (error) {
    console.error('Failed to parse response:', error);
    console.log('Raw response:', response);
    return [];
  }
}
