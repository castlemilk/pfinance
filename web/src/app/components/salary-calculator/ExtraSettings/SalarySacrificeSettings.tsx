/**
 * SalarySacrificeSettings - Salary sacrifice/packaging configuration
 */

'use client';

import { SalarySacrificeEntry, SalarySacrificeCalculation } from '../types';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { PlusIcon, Trash2Icon, InfoIcon, ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { SettingsSection } from './SettingsSection';
import { ATO_SALARY_SACRIFICE_URL, COMMON_PACKAGING_CAPS } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface SalarySacrificeSettingsProps {
  salarySacrifices: SalarySacrificeEntry[];
  onSalarySacrificesChange: (sacrifices: SalarySacrificeEntry[]) => void;
  packagingCap: number;
  onPackagingCapChange: (cap: number) => void;
  calculation: SalarySacrificeCalculation;
  formatCurrency: (amount: number) => string;
}

export function SalarySacrificeSettings({
  salarySacrifices,
  onSalarySacrificesChange,
  packagingCap,
  onPackagingCapChange,
  calculation,
  formatCurrency,
}: SalarySacrificeSettingsProps) {
  const [showDetails, setShowDetails] = useState(false);
  const isActive = salarySacrifices.length > 0;

  const addSalarySacrifice = () => {
    const newEntry: SalarySacrificeEntry = {
      id: uuidv4(),
      description: salarySacrifices.length === 0 ? 'Salary Package' : 'Meal Card',
      amount: salarySacrifices.length === 0 ? '611' : '110',
      frequency: 'fortnightly',
      isTaxDeductible: true,
    };
    onSalarySacrificesChange([...salarySacrifices, newEntry]);
  };

  const removeSalarySacrifice = (id: string) => {
    onSalarySacrificesChange(salarySacrifices.filter((e) => e.id !== id));
  };

  const updateSalarySacrifice = (
    id: string,
    field: keyof SalarySacrificeEntry,
    value: string | boolean
  ) => {
    onSalarySacrificesChange(
      salarySacrifices.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const getSummary = () => {
    if (!isActive) return 'Not configured';
    return `${formatCurrency(calculation.totalSalarySacrifice)}/year`;
  };

  return (
    <SettingsSection
      id="salary-sacrifice"
      title="Salary Sacrifice"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <p className="text-sm text-muted-foreground flex-1">
            Salary sacrificing allows you to redirect part of your pre-tax salary toward benefits, reducing your taxable income.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p>Many NFPs and charities offer salary packaging with caps that vary by organization type.</p>
                <a
                  href={ATO_SALARY_SACRIFICE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline mt-2 block"
                >
                  ATO: Salary Sacrifice Arrangements
                </a>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Packaging Cap Configuration */}
        <div className="bg-muted/50 p-3 rounded-lg space-y-2">
          <div className="flex justify-between items-center">
            <Label className="text-sm font-medium">Salary Packaging Cap</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p className="font-medium mb-1">Common caps:</p>
                  <ul className="text-xs space-y-1">
                    {COMMON_PACKAGING_CAPS.map((cap) => (
                      <li key={cap.value}>
                        <button
                          type="button"
                          className="hover:text-blue-500 hover:underline"
                          onClick={() => onPackagingCapChange(cap.value)}
                        >
                          {cap.label}: ${cap.value.toLocaleString()}
                        </button>
                      </li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">$</span>
            <Input
              type="number"
              value={packagingCap}
              onChange={(e) => onPackagingCapChange(parseInt(e.target.value) || 0)}
              className="h-8 flex-1"
              min="0"
              step="100"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onPackagingCapChange(15899)}
              className="text-xs"
            >
              Default
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Set to 0 for no cap, or select a common cap from the tooltip
          </p>
        </div>

        {/* Summary Card (when there are sacrifices) */}
        {isActive && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border border-green-200 dark:border-green-800 p-4 rounded-lg">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Package Amount</span>
                <div className="font-semibold text-lg">{formatCurrency(calculation.totalSalarySacrifice)}/year</div>
              </div>
              <div>
                <span className="text-green-600 dark:text-green-400">Tax Savings</span>
                <div className="font-semibold text-lg text-green-600 dark:text-green-400">
                  {formatCurrency(calculation.estimatedTaxSavings)}/year
                </div>
              </div>
            </div>
            
            <div className="border-t border-green-200 dark:border-green-800 mt-3 pt-3">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total Benefit</span>
                <span className="font-bold text-lg">
                  {formatCurrency(calculation.totalSalarySacrifice + calculation.estimatedTaxSavings)}/year
                </span>
              </div>
            </div>

            {packagingCap > 0 && (
              <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-800">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cap remaining:</span>
                  <span className={calculation.remainingPackagingCap <= 0 ? 'text-red-500' : ''}>
                    {formatCurrency(calculation.remainingPackagingCap)}
                  </span>
                </div>
                <div className="mt-2 h-2 bg-green-200 dark:bg-green-900 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 dark:bg-green-400 transition-all"
                    style={{ width: `${Math.min(100, (calculation.totalSalarySacrifice / packagingCap) * 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Expandable Details */}
            <Collapsible open={showDetails} onOpenChange={setShowDetails}>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-3 pt-2 border-t border-green-200 dark:border-green-800 w-full">
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                {showDetails ? 'Hide' : 'Show'} breakdown
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2 space-y-2 text-sm">
                {salarySacrifices.map((entry) => {
                  const amount = parseFloat(entry.amount) || 0;
                  return (
                    <div key={entry.id} className="flex justify-between">
                      <span className="text-muted-foreground">{entry.description}:</span>
                      <span>{formatCurrency(amount)} per {entry.frequency.replace('ly', '')}</span>
                    </div>
                  );
                })}
                <div className="flex justify-between text-green-600 dark:text-green-400 pt-2 border-t border-green-200 dark:border-green-800">
                  <span>Tax savings:</span>
                  <span>{formatCurrency(calculation.estimatedTaxSavings / 26)} per fortnight</span>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Individual Sacrifice Entries */}
        {salarySacrifices.map((entry) => (
          <div
            key={entry.id}
            className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
          >
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Salary Sacrifice Item</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeSalarySacrifice(entry.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <Label className="text-xs">Description</Label>
              <Input
                type="text"
                value={entry.description}
                onChange={(e) => updateSalarySacrifice(entry.id, 'description', e.target.value)}
                className="mt-1 h-8"
                placeholder="e.g., Salary Package, Meal Card"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  value={entry.amount}
                  onChange={(e) => updateSalarySacrifice(entry.id, 'amount', e.target.value)}
                  className="mt-1 h-8"
                  min="0"
                  step="10"
                />
              </div>
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select
                  value={entry.frequency}
                  onValueChange={(value) =>
                    updateSalarySacrifice(entry.id, 'frequency', value as IncomeFrequency)
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

            <div className="flex items-center justify-between pt-2">
              <Label htmlFor={`tax-deductible-${entry.id}`} className="text-xs">
                Tax Deductible
              </Label>
              <Switch
                id={`tax-deductible-${entry.id}`}
                checked={entry.isTaxDeductible}
                onCheckedChange={(checked) =>
                  updateSalarySacrifice(entry.id, 'isTaxDeductible', checked)
                }
              />
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={addSalarySacrifice}
          disabled={packagingCap > 0 && calculation.remainingPackagingCap <= 0}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Salary Sacrifice
        </Button>
      </div>
    </SettingsSection>
  );
}
