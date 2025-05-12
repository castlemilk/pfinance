'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { IncomeFrequency, TaxStatus, Deduction } from '../types';
import { useFinance } from '../context/FinanceContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import DeductionForm from './DeductionForm';

type FormData = {
  source: string;
  amount: string;
  frequency: IncomeFrequency;
  taxStatus: TaxStatus;
};

export default function IncomeForm() {
  const { addIncome } = useFinance();
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  
  const form = useForm<FormData>({
    defaultValues: {
      source: '',
      amount: '',
      frequency: 'monthly',
      taxStatus: 'preTax',
    },
  });

  const onSubmit = (data: FormData) => {
    addIncome(
      data.source,
      parseFloat(data.amount),
      data.frequency,
      data.taxStatus,
      deductions.length > 0 ? deductions : undefined
    );
    form.reset();
    setDeductions([]);
  };

  const handleDeductionsUpdate = (updatedDeductions: Deduction[]) => {
    setDeductions(updatedDeductions);
  };

  const frequencyOptions: IncomeFrequency[] = [
    'weekly',
    'fortnightly',
    'monthly',
    'annually'
  ];

  const taxStatusOptions: TaxStatus[] = [
    'preTax',
    'postTax'
  ];

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Add Income</CardTitle>
      </CardHeader>
      <CardContent>
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
            
            <FormField
              control={form.control}
              name="frequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Frequency</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {frequencyOptions.map((frequency) => (
                        <SelectItem key={frequency} value={frequency}>
                          {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="tax-settings">
                <AccordionTrigger className="text-sm font-medium">
                  Tax Settings
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    <FormField
                      control={form.control}
                      name="taxStatus"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax Status</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select tax status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {taxStatusOptions.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status === 'preTax' ? 'Pre-Tax' : 'Post-Tax'}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
              
              <AccordionItem value="deductions">
                <AccordionTrigger className="text-sm font-medium">
                  Deductions
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-2">
                    <DeductionForm 
                      existingDeductions={deductions} 
                      onSave={handleDeductionsUpdate} 
                    />
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
            
            <Button type="submit" className="w-full mt-6">Add Income</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
} 