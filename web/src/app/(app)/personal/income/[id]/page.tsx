'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useFinance } from '../../../../context/FinanceContext';
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
import { IncomeFrequency, TaxStatus } from '../../../../types';
import { ArrowLeft, Pencil, Trash2, Loader2 } from 'lucide-react';
import { getSourceColor, getFrequencyColor } from '../../../../constants/theme';

type EditIncomeFormData = {
  source: string;
  amount: string;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
};

const formatFrequency = (frequency: string) =>
  frequency.charAt(0).toUpperCase() + frequency.slice(1);

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);

export default function IncomeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { incomes, updateIncome, deleteIncome, loading } = useFinance();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const income = incomes.find((i) => i.id === id);

  const form = useForm<EditIncomeFormData>({
    defaultValues: {
      source: '',
      amount: '',
      frequency: 'monthly',
      taxStatus: 'preTax',
    },
  });

  const handleEdit = () => {
    if (!income) return;
    form.reset({
      source: income.source,
      amount: income.amount.toString(),
      frequency: income.frequency,
      taxStatus: income.taxStatus,
    });
    setIsEditDialogOpen(true);
  };

  const onSubmit = (data: EditIncomeFormData) => {
    if (!income) return;
    updateIncome(
      income.id,
      data.source,
      parseFloat(data.amount),
      data.frequency,
      data.taxStatus,
      income.deductions,
    );
    setIsEditDialogOpen(false);
  };

  const handleConfirmDelete = () => {
    if (!income) return;
    deleteIncome(income.id);
    setIsDeleteDialogOpen(false);
    router.push('/personal/income');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!income) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/personal/income')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Income
        </Button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Income not found.</p>
            <Button variant="outline" className="mt-4" onClick={() => router.push('/personal/income')}>
              Return to Income
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => router.push('/personal/income')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Income
        </Button>

        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{income.source}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">{formatDate(income.date)}</p>
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
                <dd className="mt-1 text-2xl font-semibold">{formatCurrency(income.amount)}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Source</dt>
                <dd className="mt-1">
                  <Badge
                    style={{
                      backgroundColor: getSourceColor(income.source),
                      color: income.source === 'Investment' ? 'black' : 'white',
                    }}
                  >
                    {income.source}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Frequency</dt>
                <dd className="mt-1">
                  <Badge
                    style={{
                      backgroundColor: getFrequencyColor(income.frequency),
                      color: 'black',
                    }}
                  >
                    {formatFrequency(income.frequency)}
                  </Badge>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">Tax Status</dt>
                <dd className="mt-1">
                  <Badge variant={income.taxStatus === 'preTax' ? 'default' : 'secondary'}>
                    {income.taxStatus === 'preTax' ? 'Pre-Tax' : 'Post-Tax'}
                  </Badge>
                </dd>
              </div>
            </dl>

            {/* Deductions breakdown */}
            {income.deductions && income.deductions.length > 0 && (
              <div className="mt-8 border-t pt-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-3">Deductions</h3>
                <div className="space-y-2">
                  {income.deductions.map((deduction) => (
                    <div key={deduction.id} className="flex justify-between items-center">
                      <span className="text-sm">{deduction.name}</span>
                      <span className="text-sm font-medium">{formatCurrency(-deduction.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center border-t pt-2 mt-2">
                    <span className="text-sm font-medium">Total Deductions</span>
                    <span className="text-sm font-semibold">
                      {formatCurrency(-income.deductions.reduce((sum, d) => sum + d.amount, 0))}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Income Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Income</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter income source" {...field} />
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
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="fortnightly">Fortnightly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                          <SelectItem value="annually">Annually</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax Status</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tax status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="preTax">Pre-Tax</SelectItem>
                          <SelectItem value="postTax">Post-Tax</SelectItem>
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
              This action cannot be undone. This will permanently delete the income source from your records.
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
