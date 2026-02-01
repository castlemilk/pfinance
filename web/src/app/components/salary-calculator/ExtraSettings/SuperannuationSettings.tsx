/**
 * SuperannuationSettings - Superannuation configuration section
 */

'use client';

import { TaxSettings } from '@/app/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { 
  ATO_PERSONAL_SUPER_CONTRIBUTION_URL, 
  ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT 
} from '../constants';

interface SuperannuationSettingsProps {
  taxSettings: TaxSettings;
  onTaxSettingChange: (setting: keyof TaxSettings, value: boolean | number) => void;
  voluntarySuper: string;
  onVoluntarySuperChange: (value: string) => void;
  baseRemainingCap: number;
  remainingConcessionalCap: number;
  voluntarySuperTaxSavings: number;
  superannuation: number;
  formatCurrency: (amount: number) => string;
}

export function SuperannuationSettings({
  taxSettings,
  onTaxSettingChange,
  voluntarySuper,
  onVoluntarySuperChange,
  baseRemainingCap,
  remainingConcessionalCap,
  voluntarySuperTaxSavings,
  superannuation,
  formatCurrency,
}: SuperannuationSettingsProps) {
  const isActive = taxSettings.includeSuper || taxSettings.includeVoluntarySuper;

  const getSummary = () => {
    if (!taxSettings.includeSuper && !taxSettings.includeVoluntarySuper) {
      return 'Not configured';
    }
    const parts = [];
    if (taxSettings.includeSuper) {
      parts.push(`${taxSettings.superRate}% SG`);
    }
    if (taxSettings.includeVoluntarySuper && parseFloat(voluntarySuper) > 0) {
      parts.push(`+ ${formatCurrency(parseFloat(voluntarySuper))} voluntary`);
    }
    return parts.join(' ');
  };

  return (
    <SettingsSection
      id="superannuation"
      title="Superannuation"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Superannuation is money set aside by your employer for your retirement. 
          You can also make additional contributions to grow your super savings.
        </p>

        {/* Concessional cap info */}
        <div className="bg-muted/50 p-3 rounded-md text-sm">
          <div className="flex justify-between">
            <span>Concessional cap remaining:</span>
            <span className="font-medium">
              {formatCurrency(remainingConcessionalCap)} of {formatCurrency(ATO_PERSONAL_SUPER_CONTRIBUTION_LIMIT)}
            </span>
          </div>
          {superannuation > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Employer Super Guarantee:</span>
              <span>{formatCurrency(superannuation)}</span>
            </div>
          )}
        </div>

        {/* Include Super Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="include-super"
              checked={taxSettings.includeSuper}
              onCheckedChange={(checked) => onTaxSettingChange('includeSuper', checked)}
            />
            <Label htmlFor="include-super" className="font-medium">
              Salary includes Superannuation
            </Label>
          </div>
          {taxSettings.includeSuper && (
            <div className="flex items-center gap-2">
              <span className="text-sm">at</span>
              <Input
                type="number"
                value={taxSettings.superRate}
                onChange={(e) => onTaxSettingChange('superRate', parseFloat(e.target.value) || 0)}
                className="w-16 h-8 text-sm"
                step="0.5"
                min="0"
                max="50"
              />
              <span className="text-sm">%</span>
            </div>
          )}
        </div>

        {/* Voluntary Super Toggle */}
        <div className="flex items-center gap-2">
          <Switch
            id="voluntary-super"
            checked={taxSettings.includeVoluntarySuper}
            onCheckedChange={(checked) => onTaxSettingChange('includeVoluntarySuper', checked)}
          />
          <Label htmlFor="voluntary-super" className="font-medium">
            Voluntary Superannuation
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p>After-tax personal contributions. You may be eligible for a Government co-contribution.</p>
                <a
                  href={ATO_PERSONAL_SUPER_CONTRIBUTION_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline mt-2 block"
                >
                  ATO: Personal super contributions
                </a>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Voluntary Super Amount */}
        {taxSettings.includeVoluntarySuper && (
          <div className="pl-8 space-y-4 border-l-2 border-muted ml-2">
            <div className="flex items-center gap-4">
              <Input
                type="number"
                value={voluntarySuper}
                onChange={(e) => {
                  const newValue = Math.min(parseFloat(e.target.value) || 0, baseRemainingCap);
                  onVoluntarySuperChange(newValue.toString());
                }}
                className="w-32 h-8 text-sm"
                min="0"
                max={baseRemainingCap}
                step="100"
              />
              <span className="text-sm text-muted-foreground">
                Max: {formatCurrency(baseRemainingCap)}
              </span>
            </div>
            
            <div className="space-y-2">
              <Slider
                value={[parseFloat(voluntarySuper) || 0]}
                max={baseRemainingCap}
                min={0}
                step={100}
                onValueChange={(value) => onVoluntarySuperChange(value[0].toString())}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatCurrency(0)}</span>
                <span>{formatCurrency(baseRemainingCap)}</span>
              </div>
            </div>

            {voluntarySuperTaxSavings > 0 && (
              <div className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                Estimated tax savings: {formatCurrency(voluntarySuperTaxSavings)}
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-3 w-3 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-80">
                      <p>Concessional super contributions are taxed at 15% instead of your marginal tax rate.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            )}
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
