'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Repeat,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  Filter,
  CalendarClock,
} from 'lucide-react';
import { useRecurring } from '../../context/RecurringContext';
import RecurringBadge from './RecurringBadge';
import type { RecurringTransaction, RecurringTransactionStatus } from '../../types';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: Date): string => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
};

function getStatusBadge(status: RecurringTransactionStatus) {
  switch (status) {
    case 'active':
      return <Badge className="bg-primary/20 text-primary border-primary/30">Active</Badge>;
    case 'paused':
      return <Badge variant="secondary">Paused</Badge>;
    case 'ended':
      return <Badge variant="outline" className="text-muted-foreground">Ended</Badge>;
  }
}

type TypeFilter = 'all' | 'expense' | 'income';

export default function RecurringTransactionList() {
  const {
    recurringTransactions,
    loading,
    deleteRecurring,
    pauseRecurring,
    resumeRecurring,
  } = useRecurring();

  const [statusFilter, setStatusFilter] = useState<RecurringTransactionStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [sortBy, setSortBy] = useState<'nextOccurrence' | 'amount' | 'created'>('nextOccurrence');

  const filteredAndSorted = useMemo(() => {
    let filtered = recurringTransactions;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    if (typeFilter !== 'all') {
      filtered = filtered.filter(r => typeFilter === 'expense' ? r.isExpense : !r.isExpense);
    }

    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'nextOccurrence':
          return a.nextOccurrence.getTime() - b.nextOccurrence.getTime();
        case 'amount':
          return b.amount - a.amount;
        case 'created':
          return b.createdAt.getTime() - a.createdAt.getTime();
        default:
          return 0;
      }
    });
  }, [recurringTransactions, statusFilter, typeFilter, sortBy]);

  const handleDelete = async (item: RecurringTransaction) => {
    if (window.confirm(`Delete recurring transaction "${item.description}"?`)) {
      await deleteRecurring(item.id);
    }
  };

  if (loading && recurringTransactions.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      {recurringTransactions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters:</span>
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as RecurringTransactionStatus | 'all')}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
              <SelectItem value="ended">Ended</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="expense">Expenses</SelectItem>
              <SelectItem value="income">Income</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nextOccurrence">Next Due</SelectItem>
              <SelectItem value="amount">Amount</SelectItem>
              <SelectItem value="created">Recently Created</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* List */}
      {filteredAndSorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Repeat className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Recurring Transactions</h3>
            <p className="text-muted-foreground">
              {statusFilter !== 'all' || typeFilter !== 'all'
                ? 'No transactions match your current filters.'
                : 'Add a recurring expense or income to start tracking your regular transactions.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredAndSorted.map((item) => (
            <Card key={item.id} className={`${item.status === 'paused' || item.status === 'ended' ? 'opacity-60' : ''} transition-all hover:shadow-sm`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{item.description}</span>
                      {getStatusBadge(item.status)}
                      <RecurringBadge frequency={item.frequency} />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Next: {formatDate(item.nextOccurrence)}
                      </span>
                      {item.tags && item.tags.length > 0 && (
                        <span className="text-xs">{item.tags.join(', ')}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pl-3">
                    <span className={`font-semibold whitespace-nowrap ${item.isExpense ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {item.isExpense ? '-' : '+'}{formatCurrency(item.amount)}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.status === 'active' && (
                          <DropdownMenuItem onClick={() => pauseRecurring(item.id)}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </DropdownMenuItem>
                        )}
                        {item.status === 'paused' && (
                          <DropdownMenuItem onClick={() => resumeRecurring(item.id)}>
                            <Play className="h-4 w-4 mr-2" />
                            Resume
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(item)} className="text-destructive">
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      {filteredAndSorted.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div className="text-center">
            <div className="text-2xl font-bold">{recurringTransactions.filter(r => r.status === 'active').length}</div>
            <div className="text-sm text-muted-foreground">Active</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(recurringTransactions.filter(r => r.isExpense && r.status === 'active').reduce((sum, r) => sum + r.amount, 0))}
            </div>
            <div className="text-sm text-muted-foreground">Monthly Expenses</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(recurringTransactions.filter(r => !r.isExpense && r.status === 'active').reduce((sum, r) => sum + r.amount, 0))}
            </div>
            <div className="text-sm text-muted-foreground">Monthly Income</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold">{recurringTransactions.filter(r => r.status === 'paused').length}</div>
            <div className="text-sm text-muted-foreground">Paused</div>
          </div>
        </div>
      )}
    </div>
  );
}
