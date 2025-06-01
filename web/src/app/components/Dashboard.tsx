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
import GroupManager from './GroupManager';
import AuthModal from './AuthModal';
import ReportGenerator from './ReportGenerator';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '../context/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LogOut, Users } from 'lucide-react';

export default function Dashboard() {
  const { user, logout, loading } = useAuth();
  const [activeIncomeView, setActiveIncomeView] = useState<'income' | 'salary'>('salary');
  const [showAuthModal, setShowAuthModal] = useState(false);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header with Auth */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Income & Expense Tracker</h1>
        
        {user ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="text-sm">
                  {getInitials(user.displayName || user.email || 'U')}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">
                {user.displayName || user.email}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </div>
        ) : (
          <Button onClick={() => setShowAuthModal(true)}>
            Sign In
          </Button>
        )}
      </div>

      {user ? (
        <>
          <div className="mb-8">
            <FinanceSummary />
          </div>
          
          <Tabs defaultValue="groups" className="w-full mb-8">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="groups">
                <Users className="w-4 h-4 mr-2" />
                Groups
              </TabsTrigger>
              <TabsTrigger value="income">Income</TabsTrigger>
              <TabsTrigger value="expenses">Expenses</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
            
            <TabsContent value="groups" className="mt-6">
              <GroupManager />
            </TabsContent>
        
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
        
        <TabsContent value="reports" className="mt-6">
          <ReportGenerator />
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
        </>
      ) : (
        <div className="text-center py-16">
          <h2 className="text-2xl font-semibold mb-4">Welcome to PFinance</h2>
          <p className="text-muted-foreground mb-8">
            Sign in to start tracking your finances and collaborate with others.
          </p>
          <Button onClick={() => setShowAuthModal(true)} size="lg">
            Get Started
          </Button>
        </div>
      )}

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
} 