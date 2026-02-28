'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ExpenseList from './ExpenseList';
import FinanceSummary from './FinanceSummary';
import GroupExpenseForm from './GroupExpenseForm';
import GroupExpenseList from './GroupExpenseList';
import BudgetDashboard from './BudgetDashboard';
import QuickActions from './QuickActions';
import OnboardingChecklist from './OnboardingChecklist';
import UpcomingBillsCard from './recurring/UpcomingBillsCard';
import GoalList from './goals/GoalList';
import InsightsDashboard from './insights/InsightsDashboard';
import AnalyticsPreview from './AnalyticsPreview';
import TaxTrackerWidget from './TaxTrackerWidget';
import { useAuth } from '../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import {
  Users,
  AlertCircle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface FinanceDashboardProps {
  mode: 'personal' | 'shared';
}

export default function FinanceDashboard({ mode }: FinanceDashboardProps) {
  const { user, loading } = useAuth();
  const { activeGroup } = useMultiUserFinance();

  // Show nothing while auth is loading to avoid flicker
  if (loading) {
    return null;
  }

  // Show auth prompt for shared mode
  if (mode === 'shared' && !user) {
    return (
      <div className="flex items-center justify-center min-h-[400px] px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
            <p className="text-muted-foreground text-sm sm:text-base">
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
      <div className="flex items-center justify-center min-h-[400px] px-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Finance Group</h3>
            <p className="text-muted-foreground text-sm sm:text-base">
              Please select a finance group from the dropdown above, or create a new one to continue.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header - only show for personal mode since shared has header in selector */}
      {mode === 'personal' && (
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Personal Finance</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage your personal income and expenses
          </p>
        </div>
      )}

      {/* Finance Summary */}
      <FinanceSummary mode={mode} groupId={mode === 'shared' ? activeGroup?.id : undefined} />

      {/* Quick Actions - personal mode only */}
      {mode === 'personal' && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <QuickActions />
          </CardContent>
        </Card>
      )}

      {/* Upcoming Bills - personal mode only */}
      {mode === 'personal' && <UpcomingBillsCard />}

      {/* Goals Widget - personal mode only */}
      {mode === 'personal' && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-lg sm:text-xl">Financial Goals</CardTitle>
          </CardHeader>
          <CardContent>
            <GoalList compact limit={3} />
          </CardContent>
        </Card>
      )}

      {/* Tax Tracker Widget - personal mode only */}
      {mode === 'personal' && <TaxTrackerWidget />}

      {/* Analytics Preview - personal mode only */}
      {mode === 'personal' && <AnalyticsPreview />}

      {/* Insights Widget - personal mode only */}
      {mode === 'personal' && <InsightsDashboard compact limit={3} />}

      {/* Onboarding Checklist - personal mode only */}
      {mode === 'personal' && <OnboardingChecklist />}

      {/* Shared mode: Group Expense Form */}
      {mode === 'shared' && activeGroup && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <GroupExpenseForm
            groupId={activeGroup.id}
            onSuccess={() => {
              // Refresh expense list
            }}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl">Group Balance Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <GroupBalanceSummary groupId={activeGroup.id} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Budgets */}
      <BudgetDashboard
        showGroupBudgets={mode === 'shared'}
        financeGroupId={mode === 'shared' ? activeGroup?.id : undefined}
      />

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-lg sm:text-xl">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          {mode === 'personal' ? (
            <ExpenseList limit={5} />
          ) : activeGroup ? (
            <GroupExpenseList groupId={activeGroup.id} />
          ) : null}
        </CardContent>
      </Card>
    </div>
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
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="p-3 sm:p-4 border rounded-lg">
          <p className="text-xs sm:text-sm text-muted-foreground">You are owed</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600">
            ${owed.toFixed(2)}
          </p>
        </div>
        <div className="p-3 sm:p-4 border rounded-lg">
          <p className="text-xs sm:text-sm text-muted-foreground">You owe</p>
          <p className="text-lg sm:text-2xl font-bold text-red-600">
            ${owes.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="p-3 sm:p-4 border rounded-lg bg-muted/50">
        <p className="text-xs sm:text-sm text-muted-foreground">Net Balance</p>
        <p className={`text-lg sm:text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {netBalance >= 0 ? '+' : ''}{netBalance.toFixed(2)}
        </p>
      </div>

      {activeGroup.members.length > 2 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Detailed member-to-member balances coming soon.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
