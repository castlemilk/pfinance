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

  const getCategoryColor = (category: ExpenseCategory): string => {
    // Amber Terminal Glow palette - retro earth tones
    const colors: { [key in ExpenseCategory]?: string } = {
      [ExpenseCategory.FOOD]: 'bg-amber-500',          // Warm amber
      [ExpenseCategory.HOUSING]: 'bg-[#87A96B]',       // Avocado green
      [ExpenseCategory.TRANSPORTATION]: 'bg-[#A0C080]', // Sage green
      [ExpenseCategory.ENTERTAINMENT]: 'bg-[#E07E50]', // Tawny orange
      [ExpenseCategory.HEALTHCARE]: 'bg-[#D16A47]',    // Rust red
      [ExpenseCategory.UTILITIES]: 'bg-[#C4956A]',     // Tan
      [ExpenseCategory.SHOPPING]: 'bg-[#B8A88A]',      // Sand
      [ExpenseCategory.EDUCATION]: 'bg-[#8B7355]',     // Coffee brown
      [ExpenseCategory.TRAVEL]: 'bg-[#6B8E6B]',        // Forest olive
      [ExpenseCategory.OTHER]: 'bg-[#9A7B4F]',         // Sienna
    };
    return colors[category] || 'bg-[#9A7B4F]';
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
    return {
      displayName: member?.displayName || 'Unknown',
      email: member?.email || '',
      initials: (member?.displayName || member?.email || 'U').slice(0, 2).toUpperCase(),
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
                        <Badge className={getCategoryColor(expense.category)} variant="secondary">
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
                                {isUserPayer && user?.photoURL && (
                                  <AvatarImage src={user.photoURL} alt={payer.displayName} />
                                )}
                                <AvatarFallback className={`text-xs ${isUserPayer ? 'bg-green-100 text-green-700' : ''}`}>
                                  {payer.initials}
                                </AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="p-3">
                              <div className="space-y-1">
                                <p className="font-medium">{payer.displayName}{isUserPayer && ' (You)'}</p>
                                <p className="text-xs opacity-80">{payer.email}</p>
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
                                  {isCurrentUser && user?.photoURL && (
                                    <AvatarImage src={user.photoURL} alt={memberInfo.displayName} />
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