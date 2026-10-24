'use client';

import { useEffect, useState } from 'react';

export type CalculatorTool =
  | 'salary'
  | 'budget'
  | 'super'
  | 'wfh'
  | 'mortgage-offset'
  | 'hecs-help'
  | 'debt-payoff'
  | 'insurance-needs'
  | 'cgt'
  | 'borrowing-power'
  | 'risk-profile';

export interface CalculatorSnapshot {
  tool: CalculatorTool;
  title: string;
  summary: string;
  metrics: { label: string; value: string }[];
  fields: Record<string, string | number>;
  targetPath: string;
  savedAt: string;
}

export const CALCULATOR_HANDOFF_KEY = 'pfinance-pending-calculator';

export function saveCalculatorSnapshot(
  snapshot: Omit<CalculatorSnapshot, 'savedAt'>
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CALCULATOR_HANDOFF_KEY,
      JSON.stringify({ ...snapshot, savedAt: new Date().toISOString() })
    );
  } catch {
    // localStorage may be unavailable (private mode, quota) — handoff is best-effort
  }
}

export function readCalculatorSnapshot(): CalculatorSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CALCULATOR_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CalculatorSnapshot;
    if (!parsed.tool || !parsed.savedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearCalculatorSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CALCULATOR_HANDOFF_KEY);
  } catch {
    // best-effort
  }
}

export function usePendingCalculatorSnapshot(tools: CalculatorTool[]): {
  snapshot: CalculatorSnapshot | null;
  dismiss: () => void;
} {
  const [snapshot, setSnapshot] = useState<CalculatorSnapshot | null>(null);

  useEffect(() => {
    const pending = readCalculatorSnapshot();
    if (pending && tools.includes(pending.tool)) {
      setSnapshot(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismiss = () => {
    clearCalculatorSnapshot();
    setSnapshot(null);
  };

  return { snapshot, dismiss };
}
