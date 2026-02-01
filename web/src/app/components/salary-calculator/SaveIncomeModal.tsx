/**
 * SaveIncomeModal - Modal for saving salary calculator results to personal finance
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Wallet, Check } from 'lucide-react';
import { useFinance } from '@/app/context/FinanceContext';
import { IncomeFrequency, TaxStatus, Deduction } from '@/app/types';
import { SalaryBreakdown } from './types';

// Backend-supported frequencies (proto enum doesn't include hourly/daily)
type SupportedIncomeFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'annually';

interface SaveIncomeModalProps {
  breakdown: SalaryBreakdown;
  formatCurrency: (amount: number) => string;
}

export function SaveIncomeModal({ breakdown, formatCurrency }: SaveIncomeModalProps) {
  const { addIncome } = useFinance();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  // Form state
  const [sourceName, setSourceName] = useState('Salary');
  const [amountType, setAmountType] = useState<'gross' | 'net'>('gross');
  const [frequency, setFrequency] = useState<SupportedIncomeFrequency>(() => {
    // Default to calculator's frequency if supported, otherwise monthly
    const calcFreq = breakdown.frequency;
    if (['weekly', 'fortnightly', 'monthly', 'annually'].includes(calcFreq)) {
      return calcFreq as SupportedIncomeFrequency;
    }
    return 'monthly';
  });
  const [includeDeductions, setIncludeDeductions] = useState(false);

  // Get the amount based on selection
  const getAmount = () => {
    if (amountType === 'gross') {
      return breakdown.grossIncome;
    }
    return breakdown.netIncome;
  };

  // Build deductions array from breakdown
  const buildDeductions = (): Deduction[] => {
    const deductions: Deduction[] = [];
    
    if (breakdown.tax > 0) {
      deductions.push({
        id: crypto.randomUUID(),
        name: 'Income Tax',
        amount: breakdown.tax,
        isTaxDeductible: false,
      });
    }
    
    if (breakdown.medicare > 0) {
      deductions.push({
        id: crypto.randomUUID(),
        name: 'Medicare Levy',
        amount: breakdown.medicare,
        isTaxDeductible: false,
      });
    }
    
    if (breakdown.studentLoan > 0) {
      deductions.push({
        id: crypto.randomUUID(),
        name: 'Student Loan (HELP/HECS)',
        amount: breakdown.studentLoan,
        isTaxDeductible: false,
      });
    }
    
    if (breakdown.superannuation > 0) {
      deductions.push({
        id: crypto.randomUUID(),
        name: 'Employer Superannuation',
        amount: breakdown.superannuation,
        isTaxDeductible: true,
      });
    }
    
    if (breakdown.voluntarySuper > 0) {
      deductions.push({
        id: crypto.randomUUID(),
        name: 'Voluntary Super Contribution',
        amount: breakdown.voluntarySuper,
        isTaxDeductible: true,
      });
    }
    
    if (breakdown.salarySacrifice > 0) {
      deductions.push({
        id: crypto.randomUUID(),
        name: 'Salary Sacrifice',
        amount: breakdown.salarySacrifice,
        isTaxDeductible: breakdown.taxDeductibleSacrifice > 0,
      });
    }
    
    return deductions;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const amount = getAmount();
      const taxStatus: TaxStatus = amountType === 'gross' ? 'preTax' : 'postTax';
      const deductions = includeDeductions ? buildDeductions() : undefined;
      
      await addIncome(
        sourceName,
        amount,
        frequency as IncomeFrequency,
        taxStatus,
        deductions
      );
      
      setSaved(true);
      setTimeout(() => {
        setOpen(false);
        // Reset state after close
        setTimeout(() => setSaved(false), 300);
      }, 1500);
    } catch (error) {
      console.error('Failed to save income:', error);
    } finally {
      setSaving(false);
    }
  };

  // Convert frequency display
  const frequencyDisplayMap: Record<string, string> = {
    hourly: 'Hour',
    daily: 'Day',
    weekly: 'Week',
    fortnightly: 'Fortnight',
    monthly: 'Month',
    annually: 'Year',
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="gap-2">
          <Wallet className="h-4 w-4" />
          Save as Income
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save to Personal Finance</DialogTitle>
          <DialogDescription>
            Add this calculated salary as an income source in your personal finance tracker.
          </DialogDescription>
        </DialogHeader>
        
        {saved ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-4">
              <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="text-lg font-medium">Income Saved!</p>
            <p className="text-sm text-muted-foreground text-center">
              Your income has been added to your personal finance tracker.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-4 py-4">
              {/* Source Name */}
              <div className="grid gap-2">
                <Label htmlFor="source">Income Source</Label>
                <Input
                  id="source"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  placeholder="e.g., My Company, Primary Job"
                />
              </div>
              
              {/* Amount Type */}
              <div className="grid gap-2">
                <Label htmlFor="amountType">Amount to Save</Label>
                <Select value={amountType} onValueChange={(v) => setAmountType(v as 'gross' | 'net')}>
                  <SelectTrigger id="amountType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gross">
                      <div className="flex flex-col">
                        <span>Gross Salary</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(breakdown.grossIncome)} / {frequencyDisplayMap[breakdown.frequency]}
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="net">
                      <div className="flex flex-col">
                        <span>Net Income (Take-home)</span>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(breakdown.netIncome)} / {frequencyDisplayMap[breakdown.frequency]}
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Frequency */}
              <div className="grid gap-2">
                <Label htmlFor="frequency">Pay Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as SupportedIncomeFrequency)}>
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Include Deductions */}
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="include-deductions">Include Deductions</Label>
                  <p className="text-xs text-muted-foreground">
                    Save tax, super, and other deductions as line items
                  </p>
                </div>
                <Switch
                  id="include-deductions"
                  checked={includeDeductions}
                  onCheckedChange={setIncludeDeductions}
                />
              </div>
              
              {/* Preview */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Preview</p>
                <div className="flex justify-between items-baseline">
                  <span className="text-sm">{sourceName || 'Income'}</span>
                  <span className="text-lg font-semibold">
                    {formatCurrency(getAmount())}
                    <span className="text-sm font-normal text-muted-foreground">
                      /{frequency === 'annually' ? 'yr' : frequency === 'monthly' ? 'mo' : frequency === 'fortnightly' ? '2wk' : 'wk'}
                    </span>
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {amountType === 'gross' ? 'Pre-tax amount' : 'Post-tax (take-home) amount'}
                  {includeDeductions && ' with deductions tracked'}
                </p>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !sourceName.trim()}>
                {saving ? 'Saving...' : 'Save Income'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
