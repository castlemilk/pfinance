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
import { LogOut, Users, UserPlus } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
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

  // Don't show loading screen - app works without auth
  
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
          <Button variant="outline" onClick={() => setShowAuthModal(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Sign In for Multi-User Features
          </Button>
        )}
      </div>

      <div className="mb-8">
        <FinanceSummary />
      </div>
      
      <Tabs defaultValue="income" className="w-full mb-8">
        <TabsList className={`grid w-full ${user ? 'grid-cols-5' : 'grid-cols-4'}`}>
          {user && (
            <TabsTrigger value="groups">
              <Users className="w-4 h-4 mr-2" />
              Groups
            </TabsTrigger>
          )}
          <TabsTrigger value="income">Income</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        
        {user && (
          <TabsContent value="groups" className="mt-6">
            <GroupManager />
            <div className="mt-4 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Multi-User Features:</strong> Create groups to share and track finances with family members, roommates, or business partners.
              </p>
            </div>
          </TabsContent>
        )}
        
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
              {!user && (
                <div className="p-6 rounded-lg border bg-card border-primary/20">
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Multi-User Features
                  </h3>
                  <p className="text-muted-foreground mb-4">
                    Sign in to unlock collaborative features:
                  </p>
                  <ul className="space-y-2 list-disc pl-5 text-sm text-muted-foreground mb-4">
                    <li>Create shared finance groups</li>
                    <li>Invite family members or partners</li>
                    <li>Track shared expenses and income</li>
                    <li>Sync data across devices</li>
                  </ul>
                  <Button onClick={() => setShowAuthModal(true)} className="w-full">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Sign In to Enable
                  </Button>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  );
}