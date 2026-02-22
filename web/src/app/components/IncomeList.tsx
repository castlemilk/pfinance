'use client';

import { useState } from 'react';
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
import { Income, IncomeFrequency, TaxStatus } from '../types';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, ChevronRight } from 'lucide-react';
import { getSourceColor, getFrequencyColor } from '../constants/theme';
import { cn } from '@/lib/utils';
import React from 'react';

type EditIncomeFormData = {
  source: string;
  amount: string;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
};

export default function IncomeList() {
  const { incomes, deleteIncome, updateIncome } = useFinance();
  const router = useRouter();
  const [expandedIncomeId, setExpandedIncomeId] = useState<string | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedIncome, setSelectedIncome] = useState<Income | null>(null);
  const [incomeToDelete, setIncomeToDelete] = useState<string | null>(null);

  const form = useForm<EditIncomeFormData>({
    defaultValues: {
      source: '',
      amount: '',
      frequency: 'monthly',
      taxStatus: 'preTax',
    },
  });

  // Format date to a readable string
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  };

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

  // Format frequency to display text
  const formatFrequency = (frequency: string) => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  const toggleExpandIncome = (id: string) => {
    if (expandedIncomeId === id) {
      setExpandedIncomeId(null);
    } else {
      setExpandedIncomeId(id);
    }
  };

  // Handler for opening the edit dialog
  const handleEdit = (income: Income) => {
    setSelectedIncome(income);
    form.reset({
      source: income.source,
      amount: income.amount.toString(),
      frequency: income.frequency,
      taxStatus: income.taxStatus,
    });
    setIsEditDialogOpen(true);
  };

  // Handler for opening the delete confirmation dialog
  const handleDeleteClick = (id: string) => {
    setIncomeToDelete(id);
    setIsDeleteDialogOpen(true);
  };

  // Handler for confirming deletion
  const handleConfirmDelete = () => {
    if (incomeToDelete) {
      deleteIncome(incomeToDelete);
      setIncomeToDelete(null);
    }
    setIsDeleteDialogOpen(false);
  };

  // Handler for submitting the edit form
  const onSubmit = (data: EditIncomeFormData) => {
    if (!selectedIncome) return;

    updateIncome(
      selectedIncome.id,
      data.source,
      parseFloat(data.amount),
      data.frequency,
      data.taxStatus,
      selectedIncome.deductions
    );

    setIsEditDialogOpen(false);
    setSelectedIncome(null);
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg sm:text-xl font-bold">Income Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {incomes.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No income sources recorded yet.</p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-2">
                {incomes.map((income) => (
                  <div
                    key={income.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-background active:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/personal/income/${income.id}/`)}
                  >
                    {/* Expand button */}
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {income.deductions && income.deductions.length > 0 ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleExpandIncome(income.id)}
                        >
                          <ChevronRight className={cn(
                            "h-4 w-4 transition-transform",
                            expandedIncomeId === income.id && "transform rotate-90"
                          )} />
                        </Button>
                      ) : (
                        <div className="w-6" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Badge
                            className="text-xs"
                            style={{
                              backgroundColor: getSourceColor(income.source),
                              color: income.source === 'Investment' ? 'black' : 'white'
                            }}
                          >
                            {income.source}
                          </Badge>
                          <p className="text-xs text-muted-foreground mt-1">{formatShortDate(income.date)}</p>
                        </div>
                        <p className="font-semibold text-sm shrink-0">{formatCurrency(income.amount)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Badge
                          className="text-[10px] px-1.5 py-0"
                          style={{
                            backgroundColor: getFrequencyColor(income.frequency),
                            color: 'black'
                          }}
                        >
                          {formatFrequency(income.frequency)}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {income.taxStatus === 'preTax' ? 'Pre-Tax' : 'Post-Tax'}
                        </Badge>
                      </div>

                      {/* Expanded deductions */}
                      {expandedIncomeId === income.id && income.deductions && income.deductions.length > 0 && (
                        <div className="mt-2 pt-2 border-t space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Deductions</p>
                          {income.deductions.map((deduction) => (
                            <div key={deduction.id} className="flex justify-between items-center text-xs">
                              <span>{deduction.name}</span>
                              <span className="font-medium">{formatCurrency(-deduction.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
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
                        onClick={() => handleEdit(income)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-10 w-10 p-0"
                        onClick={() => handleDeleteClick(income.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[30px]"></TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="hidden md:table-cell">Frequency</TableHead>
                      <TableHead className="hidden md:table-cell">Tax Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="w-[100px] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {incomes.map((income) => (
                      <React.Fragment key={income.id}>
                        <TableRow
                          className="cursor-pointer"
                          onClick={() => router.push(`/personal/income/${income.id}/`)}
                        >
                          <TableCell className="w-[30px] pr-0" onClick={(e) => e.stopPropagation()}>
                            {income.deductions && income.deductions.length > 0 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => toggleExpandIncome(income.id)}
                              >
                                <ChevronRight className={cn(
                                  "h-4 w-4 transition-transform",
                                  expandedIncomeId === income.id && "transform rotate-90"
                                )} />
                              </Button>
                            ) : (
                              <div className="w-6" />
                            )}
                          </TableCell>
                          <TableCell>{formatDate(income.date)}</TableCell>
                          <TableCell>
                            <Badge
                              style={{
                                backgroundColor: getSourceColor(income.source),
                                color: income.source === 'Investment' ? 'black' : 'white'
                              }}
                            >
                              {income.source}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge
                              style={{
                                backgroundColor: getFrequencyColor(income.frequency),
                                color: 'black'
                              }}
                            >
                              {formatFrequency(income.frequency)}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant={income.taxStatus === 'preTax' ? 'default' : 'secondary'}>
                              {income.taxStatus === 'preTax' ? 'Pre-Tax' : 'Post-Tax'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(income.amount)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0 bg-zinc-900 hover:bg-zinc-800 text-white"
                                onClick={() => handleEdit(income)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => handleDeleteClick(income.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>

                        {/* Expandable Row for Deductions */}
                        {expandedIncomeId === income.id && income.deductions && income.deductions.length > 0 && (
                          <TableRow className="bg-muted/50">
                            <TableCell colSpan={7} className="px-4 py-2">
                              <div className="text-sm font-medium mb-2">Deductions</div>
                              <div className="space-y-2">
                                {income.deductions.map((deduction) => (
                                  <div key={deduction.id} className="flex justify-between items-center">
                                    <div>{deduction.name}</div>
                                    <div className="font-medium">{formatCurrency(-deduction.amount)}</div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Edit Income Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[425px]">
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
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        value={field.value}
                      >
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
              income source from your records.
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
