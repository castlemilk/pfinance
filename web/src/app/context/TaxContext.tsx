'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { financeClient } from '@/lib/financeService';
import { useAuth } from './AuthWithAdminContext';
import { useFinance } from './FinanceContext';
import type { TaxCalculation } from '@/gen/pfinance/v1/types_pb';
import { useSubscription } from '../hooks/useSubscription';

interface TaxContextType {
  currentEstimate: TaxCalculation | null;
  loading: boolean;
  error: string | null;
  refreshEstimate: () => Promise<void>;
}

const TaxContext = createContext<TaxContextType | undefined>(undefined);

const DEBOUNCE_MS = 2000;

export function TaxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { expenses, incomes, loading: financeLoading } = useFinance();
  const { isPro } = useSubscription();
  const [currentEstimate, setCurrentEstimate] = useState<TaxCalculation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFetchRef = useRef<string>('');

  const fetchEstimate = useCallback(async () => {
    if (!user?.uid || !isPro) return;

    setLoading(true);
    setError(null);
    try {
      const response = await financeClient.getTaxEstimate({
        userId: user.uid,
      });
      if (response.calculation) {
        setCurrentEstimate(response.calculation);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load tax estimate';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user?.uid, isPro]);

  // Debounced re-fetch when expenses/incomes change
  useEffect(() => {
    if (financeLoading || !user?.uid || !isPro) return;

    // Create a fingerprint to avoid unnecessary refetches
    const fingerprint = `${expenses.length}-${incomes.length}`;
    if (fingerprint === lastFetchRef.current) return;
    lastFetchRef.current = fingerprint;

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      fetchEstimate();
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [expenses.length, incomes.length, financeLoading, user?.uid, isPro, fetchEstimate]);

  const value: TaxContextType = {
    currentEstimate,
    loading,
    error,
    refreshEstimate: fetchEstimate,
  };

  return (
    <TaxContext.Provider value={value}>
      {children}
    </TaxContext.Provider>
  );
}

export function useTax() {
  const context = useContext(TaxContext);
  if (context === undefined) {
    throw new Error('useTax must be used within a TaxProvider');
  }
  return context;
}
