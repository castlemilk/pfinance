/**
 * IncomeSection - Core salary and frequency inputs
 */

'use client';

import { UseFormReturn } from 'react-hook-form';
import { SalaryFormData, SalaryInputMode } from './types';
import { IncomeFrequency } from '@/app/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon, RotateCcwIcon } from 'lucide-react';

interface IncomeSectionProps {
  form: UseFormReturn<SalaryFormData>;
  onReset: () => void;
  formatCurrency: (amount: number) => string;
  annualSalary: number;
}

export function IncomeSection({
  form,
  onReset,
  formatCurrency,
  annualSalary,
}: IncomeSectionProps) {
  const isProratedHours = form.watch('isProratedHours');
  const proratedHours = form.watch('proratedHours');
  const proratedFrequency = form.watch('proratedFrequency');

  const getProrataSummary = () => {
    if (!isProratedHours) return null;
    
    const hours = parseFloat(proratedHours) || 0;
    const standardHours = proratedFrequency === 'weekly' ? 38 : 76;
    const percentage = Math.round((hours / standardHours) * 100);
    
    return `${hours} hours ${proratedFrequency === 'weekly' ? 'per week' : 'per fortnight'} (${percentage}% FTE)`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Reset */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Income</h2>
          <p className="text-sm text-muted-foreground">
            Enter your salary and adjust settings below
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onReset}
          className="text-xs gap-1"
        >
          <RotateCcwIcon className="h-3 w-3" />
          Reset
        </Button>
      </div>

      <Form {...form}>
        <div className="space-y-4">
          {/* Input Mode Selector */}
          <FormField
            control={form.control}
            name="salaryInputMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Input Type</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="gross">Gross Salary (Before Tax)</SelectItem>
                    <SelectItem value="net">Take-home Pay (After Tax)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Salary Input */}
          <FormField
            control={form.control}
            name="salary"
            render={({ field }) => {
              const inputMode = form.watch('salaryInputMode') as SalaryInputMode;
              const label = inputMode === 'gross' ? 'Gross Salary' : 'Take-home Pay';
              const placeholder = inputMode === 'gross' 
                ? 'Enter your gross salary' 
                : 'Enter your take-home pay';
              
              return (
                <FormItem>
                  <FormLabel className="text-sm font-medium">{label}</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        type="number"
                        step="1000"
                        min="0"
                        placeholder={placeholder}
                        className="pl-7 text-lg font-medium h-12"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              );
            }}
          />

          {/* Pay Cycle */}
          <FormField
            control={form.control}
            name="frequency"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium">Pay Cycle</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="hourly">Hourly</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Pro-rata Toggle */}
          <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Switch
                id="prorata-switch"
                checked={form.watch('isProratedHours')}
                onCheckedChange={(checked) => form.setValue('isProratedHours', checked)}
              />
              <Label htmlFor="prorata-switch" className="font-medium cursor-pointer">
                Pro-rata / Part-time hours
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-80">
                    <p>Enable this if you work part-time. Your salary will be adjusted proportionally.</p>
                    <ul className="list-disc pl-4 mt-1 text-xs">
                      <li>Standard full-time: 38 hours/week</li>
                      <li>Standard full-time: 76 hours/fortnight</li>
                    </ul>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>

          {/* Pro-rata Hours Settings */}
          {isProratedHours && (
            <div className="p-4 bg-muted/30 rounded-lg border space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm">Hours worked</Label>
                  <Input
                    type="number"
                    value={proratedHours}
                    onChange={(e) => form.setValue('proratedHours', e.target.value)}
                    className="mt-1"
                    min="1"
                    max="168"
                    step="0.5"
                  />
                </div>
                <div>
                  <Label className="text-sm">Per</Label>
                  <Select
                    value={proratedFrequency}
                    onValueChange={(value) => form.setValue('proratedFrequency', value as IncomeFrequency)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select period" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Week</SelectItem>
                      <SelectItem value="fortnightly">Fortnight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {getProrataSummary() && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">{getProrataSummary()}</span>
                </div>
              )}
              
              <div className="text-sm font-medium">
                Pro-rata salary: {formatCurrency(annualSalary)}/year
              </div>
            </div>
          )}
        </div>
      </Form>
    </div>
  );
}
