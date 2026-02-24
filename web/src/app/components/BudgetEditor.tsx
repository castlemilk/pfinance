'use client';

import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { useBudgets } from '../context/BudgetContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
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
import { Budget, BudgetPeriod, ExpenseCategory } from '@/gen/pfinance/v1/types_pb';
import { timestampDate } from '@bufbuild/protobuf/wkt';

type EditFormData = {
  name: string;
  description: string;
  amount: string;
  period: BudgetPeriod;
  isActive: boolean;
  endDate: string;
  hasEndDate: boolean;
};

interface BudgetEditorProps {
  budget: Budget;
  onSuccess?: () => void;
  onCancel?: () => void;
}

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

export default function BudgetEditor({ budget, onSuccess, onCancel }: BudgetEditorProps) {
  const { updateBudget, loading } = useBudgets();
  const [selectedCategories, setSelectedCategories] = useState<ExpenseCategory[]>(
    [...budget.categoryIds]
  );
  const [saving, setSaving] = useState(false);

  const endDateValue = budget.endDate
    ? timestampDate(budget.endDate).toISOString().split('T')[0]
    : '';

  const form = useForm<EditFormData>({
    defaultValues: {
      name: budget.name,
      description: budget.description || '',
      amount: budget.amount.toString(),
      period: budget.period,
      isActive: budget.isActive,
      endDate: endDateValue,
      hasEndDate: !!budget.endDate,
    },
  });

  // Sync selected categories when budget changes
  useEffect(() => {
    setSelectedCategories([...budget.categoryIds]);
  }, [budget.categoryIds]);

  const onSubmit = async (data: EditFormData) => {
    setSaving(true);
    try {
      const result = await updateBudget(budget.id, {
        name: data.name,
        description: data.description,
        amount: parseFloat(data.amount),
        period: data.period,
        categoryIds: selectedCategories,
        isActive: data.isActive,
        endDate: data.hasEndDate && data.endDate ? new Date(data.endDate) : undefined,
      });

      if (result) {
        onSuccess?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryToggle = (category: ExpenseCategory, checked: boolean | string) => {
    if (checked) {
      setSelectedCategories(prev => [...prev, category]);
    } else {
      setSelectedCategories(prev => prev.filter(c => c !== category));
    }
  };

  const hasEndDate = form.watch('hasEndDate');

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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

        {/* Amount and Period side by side */}
        <div className="grid grid-cols-2 gap-4">
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
                <Select
                  onValueChange={(value) => field.onChange(parseInt(value))}
                  defaultValue={field.value.toString()}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select period" />
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
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Categories */}
        <div className="space-y-3">
          <FormLabel>Categories</FormLabel>
          <FormDescription>
            Select which expense categories this budget applies to. Leave empty to include all.
          </FormDescription>
          <div className="grid grid-cols-2 gap-3">
            {expenseCategories.map((category) => (
              <div key={category.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`edit-category-${category.value}`}
                  checked={selectedCategories.includes(category.value)}
                  onCheckedChange={(checked) =>
                    handleCategoryToggle(category.value, checked === true)
                  }
                />
                <label
                  htmlFor={`edit-category-${category.value}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {category.label}
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Active toggle */}
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
              <div className="space-y-0.5">
                <FormLabel>Active</FormLabel>
                <FormDescription>
                  Inactive budgets stop tracking spending
                </FormDescription>
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
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
                <FormLabel>Set an end date</FormLabel>
                <FormDescription>
                  Leave unchecked for ongoing budgets
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
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Action Buttons */}
        <div className="flex justify-end gap-3 pt-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={saving || loading}>
            {saving ? 'Saving Changes...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
