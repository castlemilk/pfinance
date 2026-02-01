/**
 * FringeBenefitsSettings - Fringe benefits configuration
 */

'use client';

import { FringeBenefitEntry } from '../types';
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
import { PlusIcon, Trash2Icon, InfoIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { ATO_FBT_URL, FBT_EXEMPT_CAP_INFO } from '../constants';
import { v4 as uuidv4 } from 'uuid';

interface FringeBenefitsSettingsProps {
  fringeBenefits: FringeBenefitEntry[];
  onFringeBenefitsChange: (benefits: FringeBenefitEntry[]) => void;
  formatCurrency: (amount: number) => string;
}

export function FringeBenefitsSettings({
  fringeBenefits,
  onFringeBenefitsChange,
  formatCurrency,
}: FringeBenefitsSettingsProps) {
  const isActive = fringeBenefits.length > 0;

  const addFringeBenefit = () => {
    const newEntry: FringeBenefitEntry = {
      id: uuidv4(),
      description: 'Car Benefit',
      amount: '5000',
      frequency: 'annually',
      type: 'taxable',
      reportable: true,
    };
    onFringeBenefitsChange([...fringeBenefits, newEntry]);
  };

  const removeFringeBenefit = (id: string) => {
    onFringeBenefitsChange(fringeBenefits.filter((e) => e.id !== id));
  };

  const updateFringeBenefit = (
    id: string,
    field: keyof FringeBenefitEntry,
    value: string | boolean | 'taxable' | 'exempt'
  ) => {
    onFringeBenefitsChange(
      fringeBenefits.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const calculateTotalFBT = () => {
    return fringeBenefits.reduce((total, entry) => {
      const amount = parseFloat(entry.amount) || 0;
      let annual = amount;
      
      if (entry.frequency === 'weekly') annual *= 52;
      else if (entry.frequency === 'fortnightly') annual *= 26;
      else if (entry.frequency === 'monthly') annual *= 12;
      
      return total + annual;
    }, 0);
  };

  const getSummary = () => {
    if (!isActive) return 'None';
    return `${formatCurrency(calculateTotalFBT())}/year`;
  };

  return (
    <SettingsSection
      id="fringe-benefits"
      title="Fringe Benefits"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <p className="text-sm text-muted-foreground flex-1">
            Fringe benefits are non-cash benefits provided by your employer, such as company cars or private health insurance.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p>{FBT_EXEMPT_CAP_INFO}</p>
                <a
                  href={ATO_FBT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline mt-2 block"
                >
                  ATO: Fringe Benefits Tax
                </a>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {fringeBenefits.map((entry) => (
          <div
            key={entry.id}
            className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
          >
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Fringe Benefit</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeFringeBenefit(entry.id)}
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
                onChange={(e) => updateFringeBenefit(entry.id, 'description', e.target.value)}
                className="mt-1 h-8"
                placeholder="e.g., Company Car"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Amount ($)</Label>
                <Input
                  type="number"
                  value={entry.amount}
                  onChange={(e) => updateFringeBenefit(entry.id, 'amount', e.target.value)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                />
              </div>
              <div>
                <Label className="text-xs">Frequency</Label>
                <Select
                  value={entry.frequency}
                  onValueChange={(value) =>
                    updateFringeBenefit(entry.id, 'frequency', value as IncomeFrequency)
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Type</Label>
                <Select
                  value={entry.type}
                  onValueChange={(value) =>
                    updateFringeBenefit(entry.id, 'type', value as 'taxable' | 'exempt')
                  }
                >
                  <SelectTrigger className="mt-1 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="taxable">Taxable</SelectItem>
                    <SelectItem value="exempt">Exempt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end pb-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`fbt-reportable-${entry.id}`}
                    checked={entry.reportable}
                    onCheckedChange={(checked) =>
                      updateFringeBenefit(entry.id, 'reportable', checked)
                    }
                  />
                  <Label htmlFor={`fbt-reportable-${entry.id}`} className="text-xs">
                    Reportable
                  </Label>
                </div>
              </div>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={addFringeBenefit}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Fringe Benefit
        </Button>
      </div>
    </SettingsSection>
  );
}
