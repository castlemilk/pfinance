'use client';

import { useState } from 'react';
import SuperCalculator from '@/app/components/super-calculator/SuperCalculator';
import { Button } from '@/components/ui/button';
import IncomeForm from '../../../components/IncomeForm';
import IncomeList from '../../../components/IncomeList';
import { SalaryCalculator } from '../../../components/SalaryCalculator';

export default function PersonalIncomePage() {
  const [activeView, setActiveView] = useState<'income' | 'salary' | 'super'>('salary');

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Income Management</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Track income, calculate take-home pay and project your super
        </p>
      </div>

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
          <IncomeForm />
          <IncomeList />
        </div>
      )}
    </div>
  );
}
