'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import IncomeForm from '../../../components/IncomeForm';
import IncomeList from '../../../components/IncomeList';
import { SalaryCalculator } from '../../../components/SalaryCalculator';

export default function PersonalIncomePage() {
  const [activeView, setActiveView] = useState<'income' | 'salary'>('salary');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Income Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track your income sources and calculate take-home pay
        </p>
      </div>

      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 bg-muted rounded-lg w-full sm:w-auto">
          <Button
            variant={activeView === 'salary' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('salary')}
            className="rounded-md flex-1 sm:flex-initial text-xs sm:text-sm"
          >
            Salary Calculator
          </Button>
          <Button
            variant={activeView === 'income' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveView('income')}
            className="rounded-md flex-1 sm:flex-initial text-xs sm:text-sm"
          >
            Income Sources
          </Button>
        </div>
      </div>

      {activeView === 'salary' ? (
        <SalaryCalculator />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <IncomeForm />
          <IncomeList />
        </div>
      )}
    </div>
  );
}
