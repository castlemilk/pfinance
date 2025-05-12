'use client';

import { useState, useEffect } from 'react';
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
import { Expense, ExpenseCategory, IncomeFrequency } from '../types';
import { Pencil, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getCategoryColor, getFrequencyColor } from '../constants/theme';

type EditFormData = {
  description: string;
  amount: string;
  category: ExpenseCategory;
  frequency: IncomeFrequency;
};

export default function ExpenseList() {
  const { expenses, deleteExpense, deleteExpenses, updateExpense } = useFinance();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [isShiftPressed, setIsShiftPressed] = useState(false);

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

  // Format amount to currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Format frequency to be more readable
  const formatFrequency = (frequency: IncomeFrequency) => {
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
    if (selectedExpenseIds.size === expenses.length) {
      setSelectedExpenseIds(new Set());
    } else {
      setSelectedExpenseIds(new Set(expenses.map(e => e.id)));
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

  const frequencies: IncomeFrequency[] = [
    'weekly',
    'fortnightly',
    'monthly',
    'annually'
  ];

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-bold">Expense History</CardTitle>
            <div className="flex gap-2">
              {selectedExpenseIds.size > 0 && (
                <Button
                  variant="destructive"
                  onClick={handleBatchDelete}
                  className="flex items-center gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete Selected ({selectedExpenseIds.size})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No expenses recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[50px]">
                    <input
                      type="checkbox"
                      checked={selectedExpenseIds.size === expenses.length}
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
                {expenses.map((expense, index) => (
                  <TableRow key={expense.id}>
                    <TableCell>
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
                        style={{ 
                          backgroundColor: getCategoryColor(expense.category),
                          color: ['Transportation', 'Other'].includes(expense.category) ? 'black' : 'white'
                        }}
                      >
                        {expense.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge 
                        style={{ 
                          backgroundColor: getFrequencyColor(expense.frequency),
                          color: 'black'
                        }}
                      >
                        {formatFrequency(expense.frequency)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(expense.amount)}</TableCell>
                    <TableCell className="w-[100px] text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 bg-zinc-900 hover:bg-zinc-800 text-white"
                          onClick={() => handleEdit(expense)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handleDeleteClick(expense.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Edit Expense Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
              
              <div className="grid grid-cols-2 gap-4">
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
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
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
    </>
  );
} 