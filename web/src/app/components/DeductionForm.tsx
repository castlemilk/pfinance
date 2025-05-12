'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Deduction } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage 
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { X } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface DeductionFormProps {
  existingDeductions?: Deduction[];
  onSave: (deductions: Deduction[]) => void;
}

type DeductionFormValues = {
  name: string;
  amount: string;
  isTaxDeductible: boolean;
};

export default function DeductionForm({ existingDeductions = [], onSave }: DeductionFormProps) {
  const [deductions, setDeductions] = useState<Deduction[]>(existingDeductions);
  
  const form = useForm<DeductionFormValues>({
    defaultValues: {
      name: '',
      amount: '',
      isTaxDeductible: true
    }
  });
  
  const addDeduction = (data: DeductionFormValues) => {
    const newDeduction: Deduction = {
      id: uuidv4(),
      name: data.name,
      amount: parseFloat(data.amount),
      isTaxDeductible: data.isTaxDeductible
    };
    
    const updatedDeductions = [...deductions, newDeduction];
    setDeductions(updatedDeductions);
    onSave(updatedDeductions);
    form.reset();
  };
  
  const removeDeduction = (id: string) => {
    const updatedDeductions = deductions.filter(deduction => deduction.id !== id);
    setDeductions(updatedDeductions);
    onSave(updatedDeductions);
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Deductions</h3>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(addDeduction)} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-3 sm:col-span-1">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 401k" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="col-span-3 sm:col-span-1">
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
                        placeholder="0.00"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <div className="col-span-3 sm:col-span-1">
              <FormField
                control={form.control}
                name="isTaxDeductible"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-end h-full space-x-2 pb-2">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                    <FormLabel className="mt-1">Tax Deductible</FormLabel>
                  </FormItem>
                )}
              />
            </div>
          </div>
          
          <Button type="submit" size="sm">+ Add Deduction</Button>
        </form>
      </Form>
      
      {deductions.length > 0 && (
        <div className="border rounded-md p-4 mt-4">
          <h4 className="text-sm font-medium mb-2">Current Deductions</h4>
          <ul className="space-y-2">
            {deductions.map(deduction => (
              <li key={deduction.id} className="flex justify-between items-center text-sm p-2 bg-muted/50 rounded">
                <div>
                  <span className="font-medium">{deduction.name}</span>
                  <span className="ml-2 text-muted-foreground">{formatCurrency(deduction.amount)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  {deduction.isTaxDeductible && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">Tax Deductible</span>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => removeDeduction(deduction.id)} className="h-6 w-6">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
} 