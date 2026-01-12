'use client';

import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useBudgets } from '../context/BudgetContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BudgetPeriod, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';

type FormData = {
  name: string;
  description: string;
  amount: string;
  period: BudgetPeriod;
  categoryIds: ExpenseCategory[];
  startDate: string;
  endDate: string;
  hasEndDate: boolean;
};

interface BudgetCreatorProps {
  onSuccess?: () => void;
  financeGroupId?: string;
}

export default function BudgetCreator({ onSuccess, financeGroupId }: BudgetCreatorProps) {
  const { createBudget, loading } = useBudgets();
  const [selectedCategories, setSelectedCategories] = useState<ExpenseCategory[]>([]);

  const form = useForm<FormData>({
    defaultValues: {
      name: '',
      description: '',
      amount: '',
      period: BudgetPeriod.MONTHLY,
      categoryIds: [],
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      hasEndDate: false,
    },
  });

  const onSubmit = async (data: FormData) => {
    const budget = await createBudget({
      name: data.name,
      description: data.description,
      amount: parseFloat(data.amount),
      period: data.period,
      categoryIds: selectedCategories,
      startDate: new Date(data.startDate),
      endDate: data.hasEndDate && data.endDate ? new Date(data.endDate) : undefined,
      financeGroupId,
    });

    if (budget) {
      form.reset();
      setSelectedCategories([]);
      onSuccess?.();
    }
  };

  const budgetPeriods = [
    { value: BudgetPeriod.WEEKLY, label: 'Weekly' },
    { value: BudgetPeriod.FORTNIGHTLY, label: 'Fortnightly' },
    { value: BudgetPeriod.MONTHLY, label: 'Monthly' },
    { value: BudgetPeriod.QUARTERLY, label: 'Quarterly' },
    { value: BudgetPeriod.YEARLY, label: 'Yearly' },
  ];

  const expenseCategories = [
    { value: ExpenseCategory.FOOD, label: 'Food & Dining' },
    { value: ExpenseCategory.HOUSING, label: 'Housing' },
    { value: ExpenseCategory.TRANSPORTATION, label: 'Transportation' },
    { value: ExpenseCategory.ENTERTAINMENT, label: 'Entertainment' },
    { value: ExpenseCategory.HEALTHCARE, label: 'Healthcare' },
    { value: ExpenseCategory.UTILITIES, label: 'Utilities' },
    { value: ExpenseCategory.SHOPPING, label: 'Shopping' },
    { value: ExpenseCategory.EDUCATION, label: 'Education' },
    { value: ExpenseCategory.TRAVEL, label: 'Travel' },
    { value: ExpenseCategory.OTHER, label: 'Other' },
  ];

  const handleCategoryToggle = (category: ExpenseCategory, checked: boolean | string) => {
    if (checked) {
      setSelectedCategories(prev => [...prev, category]);
    } else {
      setSelectedCategories(prev => prev.filter(c => c !== category));
    }
  };

  const hasEndDate = form.watch('hasEndDate');

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create New Budget</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Budget Name */}
            <FormField
              control={form.control}
              name="name"
              rules={{ required: 'Budget name is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Monthly Food Budget" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Brief description of this budget"
                      className="resize-none"
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Amount */}
            <FormField
              control={form.control}
              name="amount"
              rules={{ 
                required: 'Budget amount is required',
                pattern: {
                  value: /^\d+(\.\d{1,2})?$/,
                  message: 'Please enter a valid amount'
                }
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Amount</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      step="0.01"
                      placeholder="0.00" 
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Total amount allocated for this budget period
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Budget Period */}
            <FormField
              control={form.control}
              name="period"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Budget Period</FormLabel>
                  <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value.toString()}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select budget period" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {budgetPeriods.map((period) => (
                        <SelectItem key={period.value} value={period.value.toString()}>
                          {period.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    How often this budget resets
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Categories */}
            <div className="space-y-3">
              <FormLabel>Categories</FormLabel>
              <FormDescription>
                Select which expense categories this budget applies to. Leave empty to include all categories.
              </FormDescription>
              <div className="grid grid-cols-2 gap-3">
                {expenseCategories.map((category) => (
                  <div key={category.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`category-${category.value}`}
                      checked={selectedCategories.includes(category.value)}
                      onCheckedChange={(checked) => 
                        handleCategoryToggle(category.value, checked === true)
                      }
                    />
                    <label
                      htmlFor={`category-${category.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      {category.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            {/* Start Date */}
            <FormField
              control={form.control}
              name="startDate"
              rules={{ required: 'Start date is required' }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormDescription>
                    When this budget becomes active
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* End Date Toggle */}
            <FormField
              control={form.control}
              name="hasEndDate"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>
                      Set an end date for this budget
                    </FormLabel>
                    <FormDescription>
                      Leave unchecked for ongoing budgets that reset each period
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* End Date */}
            {hasEndDate && (
              <FormField
                control={form.control}
                name="endDate"
                rules={{ 
                  required: hasEndDate ? 'End date is required when enabled' : false 
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormDescription>
                      When this budget expires
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Submit Button */}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Budget...' : 'Create Budget'}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}