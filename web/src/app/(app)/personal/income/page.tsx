'use client';

import { useState } from 'react';
import SuperCalculator from '@/app/components/super-calculator/SuperCalculator';
import { Button } from '@/components/ui/button';
import PendingCalculatorBanner from '@/app/components/calculator-handoff/PendingCalculatorBanner';
import type { CalculatorSnapshot } from '@/lib/calculator-handoff';
import IncomeForm from '../../../components/IncomeForm';
import IncomeList from '../../../components/IncomeList';
import { SalaryCalculator } from '../../../components/SalaryCalculator';
import { IncomeFrequency, TaxStatus } from '../../../types';

interface IncomePrefill {
  source: string;
  amount: string;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
  key: number;
}

const SUPPORTED_FREQUENCIES = ['weekly', 'fortnightly', 'monthly', 'annually'] as const;

export default function PersonalIncomePage() {
  const [activeView, setActiveView] = useState<'income' | 'salary' | 'super'>('salary');
  const [prefill, setPrefill] = useState<IncomePrefill | null>(null);

  const applySnapshot = (snapshot: CalculatorSnapshot) => {
    const frequency = SUPPORTED_FREQUENCIES.includes(
      snapshot.fields.frequency as (typeof SUPPORTED_FREQUENCIES)[number]
    )
      ? (snapshot.fields.frequency as IncomeFrequency)
      : 'monthly';
    const net = Number(snapshot.fields.netIncome);
    setPrefill({
      source: 'Salary',
      amount: Number.isFinite(net) && net > 0 ? String(Math.round(net * 100) / 100) : '',
      frequency,
      taxStatus: 'postTax',
      key: Date.now(),
    });
    setActiveView('income');
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Income Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track income, calculate take-home pay and project your super
        </p>
      </div>

      <PendingCalculatorBanner
        tools={['salary']}
        applyLabel="Apply to income form"
        onApply={applySnapshot}
      />

      <div className="flex justify-center">
        <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-lg w-full sm:w-auto">
          <Button
            variant={activeView === 'salary' ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={activeView === 'salary'}
            onClick={() => setActiveView('salary')}
            className="min-h-11 whitespace-normal rounded-md px-2 text-sm"
          >
            Salary Calculator
          </Button>
          <Button
            variant={activeView === 'super' ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={activeView === 'super'}
            onClick={() => setActiveView('super')}
            className="min-h-11 whitespace-normal rounded-md px-2 text-sm"
          >
            Super Calculator
          </Button>
          <Button
            variant={activeView === 'income' ? 'default' : 'ghost'}
            size="sm"
            aria-pressed={activeView === 'income'}
            onClick={() => setActiveView('income')}
            className="min-h-11 whitespace-normal rounded-md px-2 text-sm"
          >
            Income Sources
          </Button>
        </div>
      </div>

      {activeView === 'salary' ? (
        <SalaryCalculator />
      ) : activeView === 'super' ? (
        <SuperCalculator />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <IncomeForm
            key={prefill?.key ?? 'default'}
            initialValues={
              prefill
                ? {
                    source: prefill.source,
                    amount: prefill.amount,
                    frequency: prefill.frequency,
                    taxStatus: prefill.taxStatus,
                  }
                : undefined
            }
          />
          <IncomeList />
        </div>
      )}
    </div>
  );
}
