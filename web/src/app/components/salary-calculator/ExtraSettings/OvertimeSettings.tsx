/**
 * OvertimeSettings - Overtime entries configuration
 */

'use client';

import { OvertimeEntry } from '../types';
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
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { v4 as uuidv4 } from 'uuid';

interface OvertimeSettingsProps {
  overtimeEntries: OvertimeEntry[];
  onOvertimeEntriesChange: (entries: OvertimeEntry[]) => void;
  formatCurrency: (amount: number) => string;
}

export function OvertimeSettings({
  overtimeEntries,
  onOvertimeEntriesChange,
  formatCurrency,
}: OvertimeSettingsProps) {
  const isActive = overtimeEntries.length > 0;

  const addOvertimeEntry = () => {
    const newEntry: OvertimeEntry = {
      id: uuidv4(),
      hours: '5',
      rate: '50.00',
      frequency: 'weekly',
      includeSuper: true,
    };
    onOvertimeEntriesChange([...overtimeEntries, newEntry]);
  };

  const removeOvertimeEntry = (id: string) => {
    onOvertimeEntriesChange(overtimeEntries.filter((e) => e.id !== id));
  };

  const updateOvertimeEntry = (
    id: string,
    field: keyof OvertimeEntry,
    value: string | boolean
  ) => {
    onOvertimeEntriesChange(
      overtimeEntries.map((entry) =>
        entry.id === id ? { ...entry, [field]: value } : entry
      )
    );
  };

  const calculateTotalOvertime = () => {
    return overtimeEntries.reduce((total, entry) => {
      const hours = parseFloat(entry.hours) || 0;
      const rate = parseFloat(entry.rate) || 0;
      let amount = hours * rate;
      
      // Convert to annual
      if (entry.frequency === 'weekly') amount *= 52;
      else if (entry.frequency === 'fortnightly') amount *= 26;
      else if (entry.frequency === 'monthly') amount *= 12;
      
      return total + amount;
    }, 0);
  };

  const getSummary = () => {
    if (!isActive) return 'No overtime';
    const total = calculateTotalOvertime();
    return `${formatCurrency(total)}/year`;
  };

  return (
    <SettingsSection
      id="overtime"
      title="Overtime"
      summary={getSummary()}
      isActive={isActive}
      badge={isActive ? `${overtimeEntries.length} entries` : undefined}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add overtime hours worked regularly. You can specify whether super is paid on overtime.
        </p>

        {overtimeEntries.map((entry) => (
          <div
            key={entry.id}
            className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
          >
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Overtime Entry</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeOvertimeEntry(entry.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Hours</Label>
                <Input
                  type="number"
                  value={entry.hours}
                  onChange={(e) => updateOvertimeEntry(entry.id, 'hours', e.target.value)}
                  className="mt-1 h-8"
                  min="0"
                  step="0.5"
                />
              </div>
              <div>
                <Label className="text-xs">Hourly Rate ($)</Label>
                <Input
                  type="number"
                  value={entry.rate}
                  onChange={(e) => updateOvertimeEntry(entry.id, 'rate', e.target.value)}
                  className="mt-1 h-8"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Per</Label>
              <Select
                value={entry.frequency}
                onValueChange={(value) =>
                  updateOvertimeEntry(entry.id, 'frequency', value as IncomeFrequency)
                }
              >
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Week</SelectItem>
                  <SelectItem value="fortnightly">Fortnight</SelectItem>
                  <SelectItem value="monthly">Month</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Label htmlFor={`overtime-super-${entry.id}`} className="text-xs">
                Include Superannuation
              </Label>
              <Switch
                id={`overtime-super-${entry.id}`}
                checked={entry.includeSuper}
                onCheckedChange={(checked) =>
                  updateOvertimeEntry(entry.id, 'includeSuper', checked)
                }
              />
            </div>

            <div className="text-xs text-muted-foreground pt-1 border-t">
              {formatCurrency((parseFloat(entry.hours) || 0) * (parseFloat(entry.rate) || 0))} per {entry.frequency.replace('ly', '')}
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={addOvertimeEntry}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Overtime
        </Button>
      </div>
    </SettingsSection>
  );
}
