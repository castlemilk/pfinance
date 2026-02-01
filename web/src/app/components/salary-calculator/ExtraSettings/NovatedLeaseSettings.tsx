/**
 * NovatedLeaseSettings - Novated lease (car lease through employer) configuration
 */

'use client';

import { useState } from 'react';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon, CarIcon, Trash2Icon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { toAnnualAmount } from '../utils';

export interface NovatedLeaseEntry {
  id: string;
  description: string;
  amount: string;
  frequency: IncomeFrequency;
  isPreTax: boolean;
}

interface NovatedLeaseSettingsProps {
  novatedLeases: NovatedLeaseEntry[];
  onNovatedLeasesChange: (leases: NovatedLeaseEntry[]) => void;
  formatCurrency: (amount: number) => string;
}

export function NovatedLeaseSettings({
  novatedLeases,
  onNovatedLeasesChange,
  formatCurrency,
}: NovatedLeaseSettingsProps) {
  const [showForm, setShowForm] = useState(false);
  const isActive = novatedLeases.length > 0;

  const addNovatedLease = () => {
    const newLease: NovatedLeaseEntry = {
      id: crypto.randomUUID(),
      description: 'Car Lease',
      amount: '500',
      frequency: 'fortnightly',
      isPreTax: true,
    };
    onNovatedLeasesChange([...novatedLeases, newLease]);
    setShowForm(false);
  };

  const removeNovatedLease = (id: string) => {
    onNovatedLeasesChange(novatedLeases.filter((l) => l.id !== id));
  };

  const updateNovatedLease = (
    id: string,
    field: keyof NovatedLeaseEntry,
    value: string | boolean
  ) => {
    onNovatedLeasesChange(
      novatedLeases.map((lease) =>
        lease.id === id ? { ...lease, [field]: value } : lease
      )
    );
  };

  const calculateTotalAnnual = () => {
    return novatedLeases.reduce((total, lease) => {
      const amount = parseFloat(lease.amount) || 0;
      return total + toAnnualAmount(amount, lease.frequency);
    }, 0);
  };

  const calculatePreTaxTotal = () => {
    return novatedLeases
      .filter((l) => l.isPreTax)
      .reduce((total, lease) => {
        const amount = parseFloat(lease.amount) || 0;
        return total + toAnnualAmount(amount, lease.frequency);
      }, 0);
  };

  const getSummary = () => {
    if (!isActive) return 'None';
    return `${formatCurrency(calculateTotalAnnual())}/year`;
  };

  return (
    <SettingsSection
      id="novated-lease"
      title="Novated Lease"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <p className="text-sm text-muted-foreground flex-1">
            A novated lease allows you to lease a car through your employer, with payments 
            made from your pre-tax salary, potentially reducing your taxable income.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p>A novated lease is a three-way agreement between you, your employer, and a leasing company.</p>
                <p className="mt-2">Pre-tax payments reduce your taxable income, while post-tax payments do not.</p>
                <a
                  href="https://www.ato.gov.au/business/fringe-benefits-tax/types-of-fringe-benefits/car-fringe-benefits/novated-leases"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline mt-2 block"
                >
                  ATO: Novated Leases
                </a>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Summary Card when leases exist */}
        {isActive && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <CarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <h4 className="font-medium">Novated Lease Summary</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Annual</span>
                <div className="font-semibold text-lg">{formatCurrency(calculateTotalAnnual())}</div>
              </div>
              <div>
                <span className="text-blue-600 dark:text-blue-400">Pre-Tax Portion</span>
                <div className="font-semibold text-lg text-blue-600 dark:text-blue-400">
                  {formatCurrency(calculatePreTaxTotal())}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lease Entries */}
        {novatedLeases.map((lease) => (
          <div
            key={lease.id}
            className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Novated Lease</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeNovatedLease(lease.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Input
                type="text"
                value={lease.description}
                onChange={(e) => updateNovatedLease(lease.id, 'description', e.target.value)}
                className="mt-1 h-8"
                placeholder="e.g., Car Lease"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Payment Amount ($)</Label>
                <Input
                  type="number"
                  value={lease.amount}
                  onChange={(e) => updateNovatedLease(lease.id, 'amount', e.target.value)}
                  className="mt-1 h-8"
                  min="0"
                  step="10"
                />
              </div>
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select
                  value={lease.frequency}
                  onValueChange={(value) =>
                    updateNovatedLease(lease.id, 'frequency', value as IncomeFrequency)
                  }
                >
                  <SelectTrigger className="mt-1 h-8">
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
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  id={`pre-tax-${lease.id}`}
                  checked={lease.isPreTax}
                  onCheckedChange={(checked) =>
                    updateNovatedLease(lease.id, 'isPreTax', checked)
                  }
                />
                <Label htmlFor={`pre-tax-${lease.id}`} className="text-sm font-medium">
                  Pre-tax payments
                </Label>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Pre-tax payments reduce your taxable income.</p>
                    <p className="mt-1">Post-tax payments do not affect your taxable income.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="text-xs text-muted-foreground">
              = {formatCurrency(toAnnualAmount(parseFloat(lease.amount) || 0, lease.frequency))}/year
              {lease.isPreTax && ' (reduces taxable income)'}
            </div>
          </div>
        ))}

        {/* Add Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={addNovatedLease}
        >
          <CarIcon className="h-4 w-4 mr-2" />
          Add Novated Lease
        </Button>
      </div>
    </SettingsSection>
  );
}
