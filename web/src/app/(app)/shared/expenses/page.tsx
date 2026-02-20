'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GroupExpenseForm from '../../../components/GroupExpenseForm';
import GroupExpenseList from '../../../components/GroupExpenseList';
import { useMultiUserFinance } from '../../../context/MultiUserFinanceContext';
import { useAuth } from '../../../context/AuthWithAdminContext';
import { Users, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function SharedExpensesPage() {
  const { user } = useAuth();
  const { activeGroup, getUserOwedAmount, getUserOwesAmount } = useMultiUserFinance();

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sign In Required</h3>
            <p className="text-muted-foreground">
              You need to sign in to access shared expense features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeGroup) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Select a Finance Group</h3>
            <p className="text-muted-foreground">
              Please select or create a finance group from the Groups page to track shared expenses.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const owed = getUserOwedAmount(activeGroup.id, user.uid);
  const owes = getUserOwesAmount(activeGroup.id, user.uid);
  const netBalance = owed - owes;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{activeGroup.name} — Receipts & Statements</h1>
        <p className="text-muted-foreground">
          Upload receipts, import statements, and split expenses with your group
        </p>
      </div>

      {/* Balance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Your Balance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
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
            <div className="p-4 border rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Net Balance</p>
              <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {netBalance >= 0 ? '+' : ''}${Math.abs(netBalance).toFixed(2)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GroupExpenseForm groupId={activeGroup.id} />
        
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Settlement and payment tracking features coming soon!
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• Add expenses and specify who paid</p>
              <p>• Choose how to split: equally, by amount, or by percentage</p>
              <p>• Track who owes what automatically</p>
              <p>• View payment history and balances</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <GroupExpenseList groupId={activeGroup.id} />
    </div>
  );
}