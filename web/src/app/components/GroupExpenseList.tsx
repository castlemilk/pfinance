'use client';

import { useState } from 'react';
import { useAuth } from '../context/AuthWithAdminContext';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';
import { Expense, ExpenseAllocation, SplitType, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import { Timestamp, timestampDate } from '@bufbuild/protobuf/wkt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Users,
  CheckCircle2,
  XCircle,
  DollarSign
} from 'lucide-react';

interface GroupExpenseListProps {
  groupId: string;
}

export default function GroupExpenseList({ }: GroupExpenseListProps) {
  const { user } = useAuth();
  const { activeGroup, groupExpenses } = useMultiUserFinance();
  const [loading] = useState(false);

  // Use expenses from context which are already being refreshed
  const expenses = groupExpenses;

  const formatDate = (date: Timestamp | Date | string | number | undefined) => {
    if (!date) return '';
    
    let d: Date;
    if (typeof date === 'object' && date !== null && 'seconds' in date) {
      // Protobuf Timestamp
      d = timestampDate(date as Timestamp);
    } else {
      d = new Date(date as string | number | Date);
    }
    
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getCategoryHex = (category: ExpenseCategory): string => {
    // Amber Terminal Glow palette - retro earth tones
    const colors: { [key in ExpenseCategory]?: string } = {
      [ExpenseCategory.FOOD]: '#FFA94D',          // Warm amber
      [ExpenseCategory.HOUSING]: '#87A96B',       // Avocado green
      [ExpenseCategory.TRANSPORTATION]: '#D16A47', // Rust
      [ExpenseCategory.ENTERTAINMENT]: '#E07E50', // Tawny orange
      [ExpenseCategory.HEALTHCARE]: '#A0C080',    // Sage green
      [ExpenseCategory.UTILITIES]: '#C4A35A',     // Golden tan
      [ExpenseCategory.SHOPPING]: '#B8860B',      // Dark goldenrod
      [ExpenseCategory.EDUCATION]: '#8B7355',     // Warm brown
      [ExpenseCategory.TRAVEL]: '#6B8E23',        // Olive drab
      [ExpenseCategory.OTHER]: '#8B8378',         // Warm gray
    };
    return colors[category] || '#8B8378';
  };

  const getCategoryLabel = (category: ExpenseCategory): string => {
    const labels: { [key in ExpenseCategory]?: string } = {
      [ExpenseCategory.FOOD]: 'Food',
      [ExpenseCategory.HOUSING]: 'Housing',
      [ExpenseCategory.TRANSPORTATION]: 'Transportation',
      [ExpenseCategory.ENTERTAINMENT]: 'Entertainment',
      [ExpenseCategory.HEALTHCARE]: 'Healthcare',
      [ExpenseCategory.UTILITIES]: 'Utilities',
      [ExpenseCategory.SHOPPING]: 'Shopping',
      [ExpenseCategory.EDUCATION]: 'Education',
      [ExpenseCategory.TRAVEL]: 'Travel',
      [ExpenseCategory.OTHER]: 'Other',
      [ExpenseCategory.UNSPECIFIED]: 'Uncategorized',
    };
    return labels[category] || 'Other';
  };

  const getSplitTypeLabel = (splitType: SplitType): string => {
    switch (splitType) {
      case SplitType.EQUAL:
        return 'Equal Split';
      case SplitType.PERCENTAGE:
        return 'By Percentage';
      case SplitType.AMOUNT:
        return 'By Amount';
      case SplitType.SHARES:
        return 'By Shares';
      default:
        return 'Not Split';
    }
  };

  const getUserAllocation = (expense: Expense, userId: string): ExpenseAllocation | undefined => {
    return expense.allocations?.find(a => a.userId === userId);
  };

  const getMemberName = (userId: string): string => {
    const member = activeGroup?.members.find(m => m.userId === userId);
    return member?.displayName || member?.email || userId;
  };

  const getMemberInfo = (userId: string) => {
    const member = activeGroup?.members.find(m => m.userId === userId);

    // If it's the current user, use their auth data as fallback
    if (userId === user?.uid) {
      const displayName = member?.displayName || user.displayName || user.email || 'You';
      const email = member?.email || user.email || '';
      return {
        displayName,
        email,
        initials: (displayName || 'U').slice(0, 2).toUpperCase(),
        photoURL: user.photoURL,
      };
    }

    // For other members, use group member data
    const displayName = member?.displayName || member?.email || `User ${userId.slice(0, 6)}...`;
    return {
      displayName,
      email: member?.email || '',
      initials: (member?.displayName || member?.email || userId.slice(0, 2)).slice(0, 2).toUpperCase(),
      photoURL: null,
    };
  };

  if (loading) {
    return <div>Loading expenses...</div>;
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Group Expenses</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-center">Paid By</TableHead>
              <TableHead>Split</TableHead>
              <TableHead>Your Share</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No expenses yet
                </TableCell>
              </TableRow>
            ) : (
              expenses.map((expense) => {
                const userAllocation = user ? getUserAllocation(expense, user.uid) : undefined;
                const isUserPayer = expense.paidByUserId === user?.uid;
                
                return (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">
                      {formatDate(expense.date)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{expense.description}</span>
                        <Badge variant="secondary" style={{
                          backgroundColor: getCategoryHex(expense.category) + '15',
                          color: getCategoryHex(expense.category),
                          border: `1px solid ${getCategoryHex(expense.category)}40`,
                          textShadow: `0 0 6px ${getCategoryHex(expense.category)}30`,
                        }}>
                          {getCategoryLabel(expense.category)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(expense.amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const payer = getMemberInfo(expense.paidByUserId);
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Avatar className={`h-7 w-7 cursor-pointer mx-auto ${isUserPayer ? 'ring-2 ring-green-500 ring-offset-1' : ''}`}>
                                {payer.photoURL && (
                                  <AvatarImage src={payer.photoURL} alt={payer.displayName} />
                                )}
                                <AvatarFallback className={`text-xs ${isUserPayer ? 'bg-green-100 text-green-700' : ''}`}>
                                  {payer.initials}
                                </AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="p-3">
                              <div className="space-y-1">
                                <p className="font-medium">{payer.displayName}{isUserPayer && ' (You)'}</p>
                                {payer.email && <p className="text-xs opacity-80">{payer.email}</p>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span className="text-sm">{getSplitTypeLabel(expense.splitType)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {userAllocation ? (
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4" />
                          <span className={isUserPayer ? 'text-green-600' : ''}>
                            {formatCurrency(userAllocation.amount)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger>
                          {expense.isSettled ? (
                            <Badge variant="secondary" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Settled
                            </Badge>
                          ) : userAllocation?.isPaid ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              Paid
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="w-3 h-3" />
                              Unpaid
                            </Badge>
                          )}
                        </TooltipTrigger>
                        <TooltipContent className="p-3">
                          <div className="space-y-3">
                            <p className="font-semibold">Payment Status</p>
                            {expense.allocations?.map((allocation) => {
                              const memberInfo = getMemberInfo(allocation.userId);
                              const isCurrentUser = allocation.userId === user?.uid;
                              return (
                              <div key={allocation.userId} className="flex items-center gap-2 text-sm">
                                {allocation.isPaid ? (
                                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-red-500 shrink-0" />
                                )}
                                <Avatar className={`h-5 w-5 ${isCurrentUser ? 'ring-1 ring-green-500' : ''}`}>
                                  {memberInfo.photoURL && (
                                    <AvatarImage src={memberInfo.photoURL} alt={memberInfo.displayName} />
                                  )}
                                  <AvatarFallback className={`text-[9px] ${isCurrentUser ? 'bg-green-100 text-green-700' : ''}`}>
                                    {memberInfo.initials}
                                  </AvatarFallback>
                                </Avatar>
                                <span className={isCurrentUser ? 'font-medium' : ''}>
                                  {memberInfo.displayName}{isCurrentUser && ' (You)'}
                                </span>
                                <span className="text-muted-foreground ml-auto">
                                  {formatCurrency(allocation.amount)}
                                </span>
                              </div>
                            );
                            })}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}