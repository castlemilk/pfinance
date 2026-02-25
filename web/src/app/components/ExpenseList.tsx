'use client';

import { useState, useEffect, useMemo } from 'react';
import { useFinance } from '../context/FinanceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useForm } from 'react-hook-form';
import { Expense, ExpenseCategory, ExpenseFrequency } from '../types';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Share2, X, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getCategoryColor, getFrequencyColor, getInstrumentBadgeStyle } from '../constants/theme';
import ContributeExpenseModal from './ContributeExpenseModal';
import { useMultiUserFinance } from '../context/MultiUserFinanceContext';

type EditFormData = {
  description: string;
  amount: string;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
};

interface ExpenseListProps {
  limit?: number;
  /** YYYY-MM-DD date string to filter expenses to a specific day */
  filterDate?: string | null;
  /** Called when the user clears the date filter */
  onClearFilter?: () => void;
}

export default function ExpenseList({ limit, filterDate, onClearFilter }: ExpenseListProps = {}) {
  const { expenses, deleteExpense, deleteExpenses, updateExpense } = useFinance();
  const { groups } = useMultiUserFinance();
  const router = useRouter();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToShare, setExpenseToShare] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

  // Check if user has groups to share with
  const canShare = groups.length > 0;

  // Filter expenses by date if filterDate is provided
  const filteredExpenses = useMemo(() => {
    if (!filterDate) return expenses;
    return expenses.filter((e) => {
      const d = e.date;
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}` === filterDate;
    });
  }, [expenses, filterDate]);

  const form = useForm<EditFormData>({
    defaultValues: {
      description: '',
      amount: '',
      category: 'Food',
      frequency: 'monthly',
    },
  });

  // Add event listeners for shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Format date to a readable string
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  // Short date for mobile cards
  const formatShortDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

  // Format amount to currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Format frequency to be more readable
  const formatFrequency = (frequency: ExpenseFrequency) => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  // Handler for opening the edit dialog
  const handleEdit = (expense: Expense) => {
    setSelectedExpense(expense);
    form.reset({
      description: expense.description,
      amount: expense.amount.toString(),
      category: expense.category,
      frequency: expense.frequency,
    });
    setIsEditDialogOpen(true);
  };

  // Handler for opening the share dialog
  const handleShare = (expense: Expense) => {
    setExpenseToShare(expense);
    setIsShareDialogOpen(true);
  };

  // Handler for opening the delete confirmation dialog
  const handleDeleteClick = (id: string) => {
    setExpenseToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  // Handler for confirming deletion
  const handleConfirmDelete = () => {
    if (expenseToDelete) {
      deleteExpense(expenseToDelete);
      setExpenseToDelete(null);
    }
    setIsDeleteDialogOpen(false);
  };

  // Handler for submitting the edit form
  const onSubmit = (data: EditFormData) => {
    if (!selectedExpense) return;

    updateExpense(
      selectedExpense.id,
      data.description,
      parseFloat(data.amount),
      data.category,
      data.frequency
    );

    setIsEditDialogOpen(false);
    setSelectedExpense(null);
  };

  // Handler for toggling expense selection with shift-click support
  const handleToggleSelect = (id: string, index: number) => {
    try {
      if (isShiftPressed && lastSelectedIndex !== null) {
        // Get the range of indices to select
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);

        // Get all IDs in the range
        const idsInRange = expenses.slice(start, end + 1).map(e => e.id);

        // Create a new Set by spreading the existing selections
        const newSelections = new Set([...selectedExpenseIds]);

        // Determine if we should select or deselect based on the clicked item's current state
        const shouldSelect = !selectedExpenseIds.has(id);

        // Apply the operation to all items in the range
        for (const rangeId of idsInRange) {
          if (shouldSelect) {
            newSelections.add(rangeId);
          } else {
            newSelections.delete(rangeId);
          }
        }

        setSelectedExpenseIds(newSelections);
      } else {
        // Create a new Set by spreading the existing selections
        const newSelections = new Set([...selectedExpenseIds]);

        // Toggle the clicked item
        if (newSelections.has(id)) {
          newSelections.delete(id);
        } else {
          newSelections.add(id);
        }

        setSelectedExpenseIds(newSelections);
      }
    } catch (error) {
      console.error('Error in handleToggleSelect:', error);
    }

    // Always update lastSelectedIndex to the current click
    setLastSelectedIndex(index);
  };

  // Handler for selecting all expenses
  const handleSelectAll = () => {
    if (selectedExpenseIds.size === filteredExpenses.length) {
      setSelectedExpenseIds(new Set());
    } else {
      setSelectedExpenseIds(new Set(filteredExpenses.map(e => e.id)));
    }
    // Reset last selected index when using select all
    setLastSelectedIndex(null);
  };

  // Handler for batch deletion
  const handleBatchDelete = () => {
    if (selectedExpenseIds.size > 0) {
      deleteExpenses(Array.from(selectedExpenseIds));
      setSelectedExpenseIds(new Set());
    }
  };

  const categories: ExpenseCategory[] = [
    'Food',
    'Housing',
    'Transportation',
    'Entertainment',
    'Healthcare',
    'Utilities',
    'Shopping',
    'Education',
    'Travel',
    'Other'
  ];

  const frequencies: ExpenseFrequency[] = [
    'once',
    'daily',
    'weekly',
    'fortnightly',
    'monthly',
    'quarterly',
    'annually'
  ];

  const displayExpenses = filteredExpenses;
  const visibleExpenses = limit ? displayExpenses.slice(0, limit) : displayExpenses;

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <CardTitle className="text-lg sm:text-xl font-bold">Expense History</CardTitle>
            <div className="flex gap-2">
              {selectedExpenseIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleBatchDelete}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Delete Selected</span> ({selectedExpenseIds.size})
                </Button>
              )}
            </div>
          </div>
          {filterDate && (
            <div className="flex items-center gap-2 mt-2 p-2 rounded-md bg-accent/50 text-sm">
              <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs sm:text-sm">
                Showing {displayExpenses.length} expense{displayExpenses.length !== 1 ? 's' : ''} for{' '}
                <span className="font-medium">
                  {new Date(filterDate + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </span>
              {onClearFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-10 w-10 p-0 ml-auto"
                  onClick={onClearFilter}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {displayExpenses.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              {filterDate ? 'No expenses found for this date.' : 'No expenses recorded yet.'}
            </p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {visibleExpenses.map((expense, index) => (
                  <div
                    key={expense.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-background active:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/personal/expenses/${expense.id}/`)}
                  >
                    {/* Checkbox */}
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExpenseIds.has(expense.id)}
                        onChange={() => handleToggleSelect(expense.id, index)}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{expense.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatShortDate(expense.date)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-semibold text-sm">{formatCurrency(expense.amount)}</p>
                          {expense.isTaxDeductible && (
                            <Badge variant="outline" className="text-[10px] border-green-500 text-green-600 px-1 py-0">
                              Tax
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Badge
                          className="text-[10px] px-1.5 py-0"
                          style={getInstrumentBadgeStyle(getCategoryColor(expense.category))}
                        >
                          {expense.category}
                        </Badge>
                        <Badge
                          className="text-[10px] px-1.5 py-0"
                          style={getInstrumentBadgeStyle(getFrequencyColor(expense.frequency))}
                        >
                          {formatFrequency(expense.frequency)}
                        </Badge>
                      </div>
                    </div>

                    {/* Actions */}
                    <div
                      className="flex flex-col gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 w-10 p-0"
                        onClick={() => handleEdit(expense)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-10 w-10 p-0"
                        onClick={() => handleDeleteClick(expense.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
                {/* Mobile select all */}
                {displayExpenses.length > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={displayExpenses.length > 0 && selectedExpenseIds.size === displayExpenses.length}
                        onChange={handleSelectAll}
                        className="w-4 h-4"
                      />
                      Select all
                    </label>
                  </div>
                )}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto" data-testid="expense-table-desktop">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[50px]">
                        <input
                          type="checkbox"
                          checked={displayExpenses.length > 0 && selectedExpenseIds.size === displayExpenses.length}
                          onChange={handleSelectAll}
                          className="w-4 h-4"
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleExpenses.map((expense, index) => (
                      <TableRow
                        key={expense.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/personal/expenses/${expense.id}/`)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedExpenseIds.has(expense.id)}
                            onChange={() => handleToggleSelect(expense.id, index)}
                            className="w-4 h-4 cursor-pointer"
                          />
                        </TableCell>
                        <TableCell>{formatDate(expense.date)}</TableCell>
                        <TableCell className="font-medium">{expense.description}</TableCell>
                        <TableCell>
                          <Badge
                            style={getInstrumentBadgeStyle(getCategoryColor(expense.category))}
                          >
                            {expense.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            style={getInstrumentBadgeStyle(getFrequencyColor(expense.frequency))}
                          >
                            {formatFrequency(expense.frequency)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          <div className="flex items-center justify-end gap-1.5">
                            {expense.isTaxDeductible && (
                              <Badge variant="outline" className="text-xs border-green-500 text-green-600">
                                Tax
                              </Badge>
                            )}
                            {formatCurrency(expense.amount)}
                          </div>
                        </TableCell>
                        <TableCell className="w-[140px] text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1">
                            {canShare && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleShare(expense)}
                                title="Share with group"
                              >
                                <Share2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 bg-zinc-900 hover:bg-zinc-800 text-white"
                              onClick={() => handleEdit(expense)}
                              title="Edit expense"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleDeleteClick(expense.id)}
                              title="Delete expense"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter expense description" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Enter amount"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="frequency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Frequency</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {frequencies.map((freq) => (
                            <SelectItem key={freq} value={freq}>
                              {formatFrequency(freq)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="submit" className="w-full sm:w-auto">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete the
              expense from your records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end mt-4">
            <Button
              variant="outline"
              onClick={() => setIsDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Share Expense Modal */}
      {expenseToShare && (
        <ContributeExpenseModal
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          expense={expenseToShare}
          onContributed={() => setExpenseToShare(null)}
        />
      )}
    </>
  );
}
