'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinance } from '../../../../context/FinanceContext';
import ReceiptViewer from '../../../../components/ReceiptViewer';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { ExpenseCategory, ExpenseFrequency } from '../../../../types';
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react';
import { getCategoryColor, getFrequencyColor, getInstrumentBadgeStyle } from '../../../../constants/theme';

type EditFormData = {
  description: string;
  amount: string;
  category: ExpenseCategory;
  frequency: ExpenseFrequency;
};

const categories: ExpenseCategory[] = [
  'Food', 'Housing', 'Transportation', 'Entertainment', 'Healthcare',
  'Utilities', 'Shopping', 'Education', 'Travel', 'Other',
];

const frequencies: ExpenseFrequency[] = [
  'once', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'annually',
];

const formatFrequency = (frequency: string) =>
  frequency.charAt(0).toUpperCase() + frequency.slice(1);

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);

export default function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { expenses, updateExpense, deleteExpense, loading } = useFinance();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const expense = expenses.find((e) => e.id === id);

  const form = useForm<EditFormData>({
    defaultValues: {
      description: '',
      amount: '',
      category: 'Food',
      frequency: 'monthly',
    },
  });

  const handleEdit = () => {
    if (!expense) return;
    form.reset({
      description: expense.description,
      amount: expense.amount.toString(),
      category: expense.category,
      frequency: expense.frequency,
    });
    setIsEditDialogOpen(true);
  };

  const onSubmit = (data: EditFormData) => {
    if (!expense) return;
    updateExpense(
      expense.id,
      data.description,
      parseFloat(data.amount),
      data.category,
      data.frequency,
    );
    setIsEditDialogOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!expense) return;
    deleteExpense(expense.id);
    setIsDeleteDialogOpen(false);
    router.push('/personal/expenses/');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!expense) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/personal/expenses/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Expenses
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Expense not found.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/personal/expenses/')}>
              Return to Expenses
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/personal/expenses/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Expenses
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{expense.description}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{formatDate(expense.date)}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleEdit}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="destructive" size="sm" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Amount</dt>
                <dd className="mt-1 text-2xl font-semibold">{formatCurrency(expense.amount)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Category</dt>
                <dd className="mt-1">
                  <Badge
                    style={getInstrumentBadgeStyle(getCategoryColor(expense.category))}
                  >
                    {expense.category}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Frequency</dt>
                <dd className="mt-1">
                  <Badge
                    style={getInstrumentBadgeStyle(getFrequencyColor(expense.frequency))}
                  >
                    {formatFrequency(expense.frequency)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Date</dt>
                <dd className="mt-1 text-sm">{formatDate(expense.date)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Receipt Section */}
      {expense.receiptUrl && (
        <div className="mt-4">
          <ReceiptViewer receiptUrl={expense.receiptUrl} />
        </div>
      )}

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
                      <Input type="number" step="0.01" min="0" placeholder="Enter amount" {...field} />
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select frequency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {frequencies.map((freq) => (
                            <SelectItem key={freq} value={freq}>{formatFrequency(freq)}</SelectItem>
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
              This action cannot be undone. This will permanently delete the expense from your records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end mt-4">
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
