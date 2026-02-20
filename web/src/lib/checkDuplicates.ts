import { financeClient } from './financeService';
import { ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import type { DuplicateCandidate } from '@/gen/pfinance/v1/types_pb';

export interface DuplicateMatch {
  existingExpenseId: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  matchScore: number;
  matchReason: string;
}

function mapCandidate(c: DuplicateCandidate): DuplicateMatch {
  const amount = Number(c.amountCents) !== 0 ? Number(c.amountCents) / 100 : c.amount;
  return {
    existingExpenseId: c.existingExpenseId,
    description: c.description,
    amount,
    date: c.date,
    category: ExpenseCategory[c.category] || '',
    matchScore: c.matchScore,
    matchReason: c.matchReason,
  };
}

/**
 * Check if an expense-to-be-created has duplicates among existing expenses.
 * Returns an array of duplicate matches (empty if no duplicates).
 */
export async function checkForDuplicates(
  userId: string,
  description: string,
  amount: number,
  date?: string,
): Promise<DuplicateMatch[]> {
  try {
    const res = await financeClient.checkDuplicates({
      userId,
      transactions: [
        {
          id: '',
          description,
          normalizedMerchant: description,
          amount,
          amountCents: BigInt(Math.round(amount * 100)),
          date: date || new Date().toISOString().split('T')[0],
          isDebit: true,
          confidence: 1.0,
        },
      ],
    });

    const allMatches: DuplicateMatch[] = [];
    for (const [, candidateList] of Object.entries(res.duplicates)) {
      for (const c of candidateList.candidates) {
        allMatches.push(mapCandidate(c));
      }
    }
    return allMatches;
  } catch (err) {
    console.warn('Duplicate check failed (non-blocking):', err);
    return [];
  }
}
