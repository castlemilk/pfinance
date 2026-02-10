'use client';

import { useState, useEffect } from 'react';
import { financeClient } from '@/lib/financeService';
import type { ExpenseCategory as ProtoExpenseCategory } from '@/gen/pfinance/v1/types_pb';

export interface MerchantSuggestion {
  suggestedName: string;
  suggestedCategory: ProtoExpenseCategory;
  confidence: number;
  source: string; // "user_history", "static", "keyword"
}

export function useMerchantSuggestion(merchantText: string) {
  const [suggestion, setSuggestion] = useState<MerchantSuggestion | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!merchantText || merchantText.trim().length < 2) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await financeClient.getMerchantSuggestions({
          userId: '',
          merchantText: merchantText.trim(),
        });

        if (!cancelled && response.suggestedName) {
          setSuggestion({
            suggestedName: response.suggestedName,
            suggestedCategory: response.suggestedCategory,
            confidence: response.confidence,
            source: response.source,
          });
        }
      } catch {
        // Silently fail — suggestions are optional
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [merchantText]);

  return { suggestion, loading };
}
