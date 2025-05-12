'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ExpenseForm from './ExpenseForm';
import ExpenseList from './ExpenseList';
import ExpenseVisualization from './ExpenseVisualization';
import IncomeForm from './IncomeForm';
import IncomeList from './IncomeList';
import TaxConfig from './TaxConfig';
import FinanceSummary from './FinanceSummary';
import TransactionImport from './TransactionImport';
import { SalaryCalculator } from './SalaryCalculator';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const [activeIncomeView, setActiveIncomeView] = useState<'income' | 'salary'>('salary');
  
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8 text-center">Income & Expense Tracker</h1>
      
      <div className="mb-8">
        <FinanceSummary />
      </div>
      
      <Tabs defaultValue="income" className="w-full mb-8">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="settings">Tax Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="income" className="mt-6">
          <div className="mb-6 flex justify-center">
            <div className="inline-flex items-center p-1 bg-muted rounded-lg">
              <Button 
                variant={activeIncomeView === 'salary' ? 'default' : 'ghost'} 
                size="sm" 
                onClick={() => setActiveIncomeView('salary')}
                className="rounded-md"
              >
                Salary Calculator
              </Button>
              <Button 
                variant={activeIncomeView === 'income' ? 'default' : 'ghost'} 
                size="sm" 
                onClick={() => setActiveIncomeView('income')}
                className="rounded-md"
              >
                Income Management
              </Button>
            </div>
          </div>
          
          {activeIncomeView === 'salary' ? (
            <SalaryCalculator />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <IncomeForm />
              <div className="space-y-6">
                <IncomeList />
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="expenses" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <ExpenseForm />
            <ExpenseVisualization />
          </div>
          <div className="mt-8 mb-8">
            <ExpenseList />
          </div>
          <div className="mt-8">
            <TransactionImport />
          </div>
        </TabsContent>
        
        <TabsContent value="settings" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <TaxConfig />
            <div className="space-y-4">
              <div className="p-6 rounded-lg border bg-card">
                <h3 className="text-lg font-semibold mb-2">Tax Configuration Help</h3>
                <p className="text-muted-foreground mb-4">
                  Configure your tax settings to get more accurate financial calculations.
                </p>
                <ul className="space-y-2 list-disc pl-5 text-sm text-muted-foreground">
                  <li>Set your marginal tax rate to calculate taxes on your income</li>
                  <li>Toggle tax calculation on/off as needed</li>
                  <li>Enable tax deductions if you have eligible deductions to apply</li>
                </ul>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
} 