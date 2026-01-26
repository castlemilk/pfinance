'use client';

import { useState, useEffect, useCallback } from 'react';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { useAuth } from '../context/AuthWithAdminContext';
import { financeClient } from '@/lib/financeService';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowRight, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Users,
  Check,
  RefreshCw
} from 'lucide-react';
import { MemberBalance } from '@/gen/pfinance/v1/types_pb';

interface GroupMemberBalancesProps {
  groupId: string;
}

interface SimplifiedDebt {
  from: {
    userId: string;
    name: string;
  };
  to: {
    userId: string;
    name: string;
  };
  amount: number;
}

export default function GroupMemberBalances({ groupId }: GroupMemberBalancesProps) {
  const { user } = useAuth();
  const { activeGroup } = useMultiUserFinance();

  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<MemberBalance[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebt[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const getMemberName = useCallback((userId: string): string => {
    const member = activeGroup?.members.find(m => m.userId === userId);
    return member?.displayName || member?.email || userId.slice(0, 8);
  }, [activeGroup]);

  // Simplified debt calculation - minimize number of transactions
  const calculateSimplifiedDebts = useCallback((memberBalances: MemberBalance[]) => {
    // Separate into creditors (positive balance - owed money) and debtors (negative balance - owes money)
    const creditors: { userId: string; amount: number }[] = [];
    const debtors: { userId: string; amount: number }[] = [];

    memberBalances.forEach(b => {
      if (b.balance > 0.01) {
        creditors.push({ userId: b.userId, amount: b.balance });
      } else if (b.balance < -0.01) {
        debtors.push({ userId: b.userId, amount: -b.balance });
      }
    });

    // Sort by amount (largest first for optimal matching)
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    const debts: SimplifiedDebt[] = [];
    let i = 0, j = 0;

    // Match debtors to creditors
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      
      const amount = Math.min(debtor.amount, creditor.amount);
      
      if (amount > 0.01) {
        debts.push({
          from: {
            userId: debtor.userId,
            name: getMemberName(debtor.userId),
          },
          to: {
            userId: creditor.userId,
            name: getMemberName(creditor.userId),
          },
          amount,
        });
      }

      debtor.amount -= amount;
      creditor.amount -= amount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    setSimplifiedDebts(debts);
  }, [getMemberName]);

  const loadBalances = useCallback(async () => {
    if (!groupId) return;

    try {
      const response = await financeClient.getMemberBalances({
        groupId,
      });
      setBalances(response.balances);
      setTotalExpenses(response.totalGroupExpenses);
      
      // Calculate simplified debts from balances
      calculateSimplifiedDebts(response.balances);
    } catch (err) {
      console.error('Failed to load balances:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [groupId, calculateSimplifiedDebts]);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBalances();
  };

  const getInitials = (name: string): string => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getUserBalance = () => {
    const userBalance = balances.find(b => b.userId === user?.uid);
    return userBalance?.balance || 0;
  };

  const userBalance = getUserBalance();
  const userDebts = simplifiedDebts.filter(d => d.from.userId === user?.uid);
  const userCredits = simplifiedDebts.filter(d => d.to.userId === user?.uid);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Group Expenses</p>
                <p className="text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Your Balance</p>
                <p className={`text-2xl font-bold ${userBalance > 0 ? 'text-green-600' : userBalance < 0 ? 'text-red-600' : ''}`}>
                  {userBalance > 0 ? '+' : ''}{formatCurrency(userBalance)}
                </p>
              </div>
              {userBalance > 0 ? (
                <TrendingUp className="h-8 w-8 text-green-600" />
              ) : userBalance < 0 ? (
                <TrendingDown className="h-8 w-8 text-red-600" />
              ) : (
                <Check className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {userBalance > 0 ? 'Others owe you' : userBalance < 0 ? 'You owe others' : 'All settled up!'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Members</p>
                <p className="text-2xl font-bold">{balances.length}</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Simplified Payments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Settle Up</CardTitle>
              <CardDescription>
                Simplified payments to settle all debts
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {simplifiedDebts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Check className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="font-medium">All Settled Up!</p>
              <p className="text-sm">No outstanding debts in this group</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Your debts first */}
              {userDebts.map((debt, idx) => (
                <div
                  key={`you-owe-${idx}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10 border-2 border-red-200">
                      <AvatarFallback className="bg-red-100 text-red-700">
                        {getInitials('You')}
                      </AvatarFallback>
                    </Avatar>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {getInitials(debt.to.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        You owe <span className="text-red-600">{debt.to.name}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Pay to settle
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-red-600">
                      {formatCurrency(debt.amount)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Your credits */}
              {userCredits.map((debt, idx) => (
                <div
                  key={`owes-you-${idx}`}
                  className="flex items-center justify-between p-4 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback>
                        {getInitials(debt.from.name)}
                      </AvatarFallback>
                    </Avatar>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <Avatar className="h-10 w-10 border-2 border-green-200">
                      <AvatarFallback className="bg-green-100 text-green-700">
                        {getInitials('You')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        <span className="text-green-600">{debt.from.name}</span> owes you
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Waiting for payment
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-green-600">
                      {formatCurrency(debt.amount)}
                    </p>
                  </div>
                </div>
              ))}

              {/* Other debts */}
              {simplifiedDebts
                .filter(d => d.from.userId !== user?.uid && d.to.userId !== user?.uid)
                .map((debt, idx) => (
                  <div
                    key={`other-${idx}`}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {getInitials(debt.from.name)}
                        </AvatarFallback>
                      </Avatar>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {getInitials(debt.to.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">
                          {debt.from.name} pays {debt.to.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-muted-foreground">
                        {formatCurrency(debt.amount)}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Full Balance Details */}
      <Card>
        <CardHeader>
          <CardTitle>Member Balances</CardTitle>
          <CardDescription>
            Complete breakdown of what each member has paid and owes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {balances.map(balance => (
              <div
                key={balance.userId}
                className="flex items-center justify-between p-3 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(getMemberName(balance.userId))}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {getMemberName(balance.userId)}
                      {balance.userId === user?.uid && (
                        <Badge variant="secondary" className="ml-2">You</Badge>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Paid: {formatCurrency(balance.totalPaid)} • Owed: {formatCurrency(balance.totalOwed)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <Badge 
                    variant={balance.balance > 0 ? 'default' : balance.balance < 0 ? 'destructive' : 'secondary'}
                    className="text-sm"
                  >
                    {balance.balance > 0 ? '+' : ''}{formatCurrency(balance.balance)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
