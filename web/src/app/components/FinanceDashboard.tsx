'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ExpenseForm from './ExpenseForm';
import ExpenseList from './ExpenseList';
import ExpenseVisualization from './ExpenseVisualization';
import IncomeForm from './IncomeForm';
import IncomeList from './IncomeList';
import FinanceSummary from './FinanceSummary';
import TransactionImport from './TransactionImport';
import ReportGenerator from './ReportGenerator';
import GroupExpenseForm from './GroupExpenseForm';
import GroupExpenseList from './GroupExpenseList';
import GroupSelector from './GroupSelector';
import EnhancedGroupSelector from './EnhancedGroupSelector';
import BudgetDashboard from './BudgetDashboard';
import { useAuth } from '../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { 
  Receipt, 
  TrendingUp, 
  FileText, 
  PiggyBank,
  Users,
  AlertCircle
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FinanceDashboardProps {
  mode: 'personal' | 'shared';
}

export default function FinanceDashboard({ mode }: FinanceDashboardProps) {
  const { user } = useAuth();
  const { activeGroup } = useMultiUserFinance();
  const [activeTab, setActiveTab] = useState('overview');

  // Show auth prompt for shared mode
  if (mode === 'shared' && !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
            <p className="text-muted-foreground">
              You need to sign in to access shared finance features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show group selection prompt for shared mode
  if (mode === 'shared' && !activeGroup) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Finance Group</h3>
            <p className="text-muted-foreground">
              Please select or create a finance group from the Groups page to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      {/* Enhanced Group Selector for shared mode */}
      {mode === 'shared' && <EnhancedGroupSelector />}
      
      <div className={`space-y-6 ${mode === 'shared' ? 'mt-6' : ''}`}>
        {/* Page Header - only show for personal mode since shared has header in selector */}
        {mode === 'personal' && (
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Personal Finance</h1>
            <p className="text-muted-foreground">
              Manage your personal income and expenses
            </p>
          </div>
        )}

        {/* Finance Summary */}
        <FinanceSummary mode={mode} groupId={mode === 'shared' ? activeGroup?.id : undefined} />

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <PiggyBank className="w-4 h-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="expenses" className="flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            <span className="hidden sm:inline">Expenses</span>
          </TabsTrigger>
          {mode === 'personal' && (
            <TabsTrigger value="income" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              <span className="hidden sm:inline">Income</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Reports</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Budgets */}
          <BudgetDashboard 
            showGroupBudgets={mode === 'shared'} 
            financeGroupId={mode === 'shared' ? activeGroup?.id : undefined}
          />
          
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              {mode === 'personal' ? (
                <ExpenseList limit={5} />
              ) : (
                <GroupExpenseList groupId={activeGroup!.id} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6 space-y-6">
          {mode === 'personal' ? (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ExpenseForm />
                <ExpenseVisualization />
              </div>
              <ExpenseList />
              <TransactionImport />
            </>
          ) : (
            <>
              {/* Group Expense Management */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <GroupExpenseForm 
                  groupId={activeGroup!.id} 
                  onSuccess={() => {
                    // Refresh expense list
                  }}
                />
                <Card>
                  <CardHeader>
                    <CardTitle>Group Balance Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <GroupBalanceSummary groupId={activeGroup!.id} />
                  </CardContent>
                </Card>
              </div>
              <GroupExpenseList groupId={activeGroup!.id} />
            </>
          )}
        </TabsContent>

        {mode === 'personal' && (
          <TabsContent value="income" className="mt-6 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <IncomeForm />
              <IncomeList />
            </div>
          </TabsContent>
        )}

        <TabsContent value="reports" className="mt-6">
          <ReportGenerator mode={mode} groupId={mode === 'shared' ? activeGroup?.id : undefined} />
        </TabsContent>
      </Tabs>
      </div>
    </>
  );
}

// Group Balance Summary Component
function GroupBalanceSummary({ groupId }: { groupId: string }) {
  const { user } = useAuth();
  const { getUserOwedAmount, getUserOwesAmount, activeGroup } = useMultiUserFinance();
  
  if (!user || !activeGroup) return null;

  const owed = getUserOwedAmount(groupId, user.uid);
  const owes = getUserOwesAmount(groupId, user.uid);
  const netBalance = owed - owes;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">You are owed</p>
          <p className="text-2xl font-bold text-green-600">
            ${owed.toFixed(2)}
          </p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-muted-foreground">You owe</p>
          <p className="text-2xl font-bold text-red-600">
            ${owes.toFixed(2)}
          </p>
        </div>
      </div>
      
      <div className="p-4 border rounded-lg bg-muted/50">
        <p className="text-sm text-muted-foreground">Net Balance</p>
        <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {netBalance >= 0 ? '+' : ''}{netBalance.toFixed(2)}
        </p>
      </div>

      {activeGroup.members.length > 2 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Detailed member-to-member balances coming soon.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}