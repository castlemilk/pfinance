'use client';

import { useForm } from 'react-hook-form';
import { useState, useEffect } from 'react';
import { useFinance } from '../context/FinanceContext';
import { TaxConfig as TaxConfigType, TaxCountry } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCaption, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { getTaxSystem, australianTaxSystem, ukTaxSystem } from '../constants/taxSystems';

// Add flag constants at the top of the file
export const countryFlags = {
  australia: '🇦🇺',
  uk: '🇬🇧',
  simple: '🌐',
};

export default function TaxConfig() {
  const { taxConfig, updateTaxConfig } = useFinance();
  const [activeTab, setActiveTab] = useState<string>('general');
  const [saveMessage, setSaveMessage] = useState<string>('');
  
  const form = useForm<TaxConfigType>({
    defaultValues: taxConfig,
  });

  const onSubmit = (data: TaxConfigType) => {
    updateTaxConfig(data);
    setSaveMessage('Tax settings saved successfully!');
    form.reset(data);
    
    setTimeout(() => {
      setSaveMessage('');
    }, 3000);
  };

  useEffect(() => {
    form.reset(taxConfig);
  }, [taxConfig, form]);

  const handleCountryChange = (country: TaxCountry) => {
    // Set the country and mark form as dirty
    form.setValue('country', country, { 
      shouldDirty: true,
      shouldTouch: true
    });
    
    // If we switch to a progressive tax system, also update tax rate
    if (country !== 'simple') {
      // Get first bracket rate and mark form as dirty
      form.setValue('taxRate', getTaxSystem(country).brackets[0].rate, {
        shouldDirty: true,
        shouldTouch: true
      });
    }
  };

  // Format rate for display
  const formatRate = (rate: number) => `${rate}%`;
  
  // Format bracket range for display
  const formatBracketRange = (min: number, max: number | null, currency: string) => {
    const formattedMin = new Intl.NumberFormat('en', { 
      style: 'currency', 
      currency: currency,
      maximumFractionDigits: 0 
    }).format(min);
    
    if (max === null) {
      return `${formattedMin} and above`;
    }
    
    const formattedMax = new Intl.NumberFormat('en', { 
      style: 'currency', 
      currency: currency,
      maximumFractionDigits: 0 
    }).format(max);
    
    return `${formattedMin} to ${formattedMax}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Tax Settings</CardTitle>
        <CardDescription>Configure how income tax is calculated</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="brackets">Tax Brackets</TabsTrigger>
          </TabsList>
          
          <TabsContent value="general">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="enabled"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Enable Tax Calculations
                        </FormLabel>
                        <FormDescription>
                          Turn on/off tax calculations for your income
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
                
                <FormField
                  control={form.control}
                  name="country"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tax System</FormLabel>
                      <Select 
                        onValueChange={(value) => handleCountryChange(value as TaxCountry)} 
                        defaultValue={field.value}
                        disabled={!form.watch('enabled')}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select tax system">
                              {field.value && (
                                <div className="flex items-center gap-2">
                                  <span role="img" aria-label={field.value}>{countryFlags[field.value as keyof typeof countryFlags]}</span>
                                  <span>{getTaxSystem(field.value as TaxCountry).name}</span>
                                </div>
                              )}
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="simple">
                            <div className="flex items-center gap-2">
                              <span role="img" aria-label="Global">{countryFlags.simple}</span>
                              <span>Simple Flat Rate</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="australia">
                            <div className="flex items-center gap-2">
                              <span role="img" aria-label="Australia">{countryFlags.australia}</span>
                              <span>Australia</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="uk">
                            <div className="flex items-center gap-2">
                              <span role="img" aria-label="United Kingdom">{countryFlags.uk}</span>
                              <span>United Kingdom</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Choose which country's tax system to use
                      </FormDescription>
                    </FormItem>
                  )}
                />
                
                {form.watch('country') === 'simple' && (
                  <FormField
                    control={form.control}
                    name="taxRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax Rate (%)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            disabled={!form.watch('enabled')}
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>
                          Enter your marginal tax rate as a percentage
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                
                <FormField
                  control={form.control}
                  name="includeDeductions"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Include Deductions
                        </FormLabel>
                        <FormDescription>
                          Apply tax deductions to your calculations
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          disabled={!form.watch('enabled')}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={!form.formState.isDirty}
                >
                  Save Tax Settings
                </Button>
                {saveMessage && (
                  <p className="text-center text-sm text-green-600 mt-2 animate-fadeIn">
                    {saveMessage}
                  </p>
                )}
              </form>
            </Form>
          </TabsContent>
          
          <TabsContent value="brackets">
            <div className="space-y-4">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <span role="img" aria-label={form.watch('country')}>
                  {countryFlags[form.watch('country') as keyof typeof countryFlags]}
                </span>
                <span>{getTaxSystem(form.watch('country')).name} Tax Brackets</span>
              </h3>
              
              {form.watch('country') !== 'simple' && (
                <Table>
                  <TableCaption className="flex items-center justify-center gap-2">
                    <span role="img" aria-label={form.watch('country')}>
                      {countryFlags[form.watch('country') as keyof typeof countryFlags]}
                    </span>
                    <span>Tax rates for the {getTaxSystem(form.watch('country')).name} tax system</span>
                  </TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Income Range</TableHead>
                      <TableHead>Tax Rate</TableHead>
                      <TableHead>Tax on this Bracket</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getTaxSystem(form.watch('country')).brackets.map((bracket, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {formatBracketRange(
                            bracket.min, 
                            bracket.max, 
                            getTaxSystem(form.watch('country')).currency
                          )}
                        </TableCell>
                        <TableCell>{formatRate(bracket.rate)}</TableCell>
                        <TableCell>
                          {bracket.baseAmount !== undefined 
                            ? `${bracket.baseAmount} + ${bracket.rate}% of excess over ${bracket.min}`
                            : `${bracket.rate}% of income`
                          }
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              
              {form.watch('country') === 'simple' && (
                <div className="p-4 border rounded-lg bg-muted">
                  <p>Using simple flat rate tax calculation: {form.watch('taxRate')}% of income.</p>
                </div>
              )}
              
              <p className="text-sm text-muted-foreground mt-4">
                Tax brackets are for informational purposes. The app will automatically calculate 
                taxes based on the selected tax system.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
} 