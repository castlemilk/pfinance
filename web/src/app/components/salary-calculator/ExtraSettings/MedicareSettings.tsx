/**
 * MedicareSettings - Medicare levy and health insurance settings
 */

'use client';

import { TaxSettings } from '@/app/types';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { ATO_MEDICARE_LEVY_URL, MEDICARE_LEVY_RATE } from '../constants';

interface MedicareSettingsProps {
  taxSettings: TaxSettings;
  onTaxSettingChange: (setting: keyof TaxSettings, value: boolean | number) => void;
  medicareLevy: number;
  formatCurrency: (amount: number) => string;
}

export function MedicareSettings({
  taxSettings,
  onTaxSettingChange,
  medicareLevy,
  formatCurrency,
}: MedicareSettingsProps) {
  const isActive = taxSettings.includeMedicare && !taxSettings.medicareExemption && !taxSettings.includePrivateHealth;

  const getSummary = () => {
    if (taxSettings.includePrivateHealth) {
      return 'Private health (no levy)';
    }
    if (taxSettings.medicareExemption) {
      return 'Exempt';
    }
    if (!taxSettings.includeMedicare) {
      return 'Not included';
    }
    return `${formatCurrency(medicareLevy)}/year (${(MEDICARE_LEVY_RATE * 100)}%)`;
  };

  return (
    <SettingsSection
      id="medicare"
      title="Medicare & Health"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Medicare is a levy on income that funds the public health system. It is set at 2% but some circumstances can vary the amount.
        </p>

        {/* Medicare Levy Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              id="include-medicare"
              checked={taxSettings.includeMedicare}
              onCheckedChange={(checked) => onTaxSettingChange('includeMedicare', checked)}
              disabled={taxSettings.includePrivateHealth}
            />
            <Label htmlFor="include-medicare" className="font-medium">
              Medicare Levy (2%)
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p>The Medicare levy is 2% of your taxable income, on top of the tax you pay.</p>
                  <p className="mt-2">You may not need to pay if you&apos;re a foreign resident or meet certain medical requirements.</p>
                  <a
                    href={ATO_MEDICARE_LEVY_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline mt-2 block"
                  >
                    ATO: Medicare levy
                  </a>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          {isActive && (
            <span className="text-sm text-muted-foreground">
              {formatCurrency(medicareLevy)}/year
            </span>
          )}
        </div>

        {/* Medicare Exemption */}
        {taxSettings.includeMedicare && !taxSettings.includePrivateHealth && (
          <div className="flex items-center gap-2 pl-8 border-l-2 border-muted ml-2">
            <Switch
              id="medicare-exemption"
              checked={taxSettings.medicareExemption}
              onCheckedChange={(checked) => onTaxSettingChange('medicareExemption', checked)}
            />
            <Label htmlFor="medicare-exemption" className="text-sm">
              Medicare Exemption
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p>You may be eligible for a Medicare exemption if you meet certain criteria.</p>
                  <a
                    href="https://www.ato.gov.au/Individuals/Medicare-and-private-health-insurance/Medicare-levy/medicare-levy-exemption/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline mt-2 block"
                  >
                    Check your eligibility
                  </a>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}

        {/* Private Healthcare Toggle */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <Switch
              id="private-health"
              checked={taxSettings.includePrivateHealth}
              onCheckedChange={(checked) => onTaxSettingChange('includePrivateHealth', checked)}
            />
            <Label htmlFor="private-health" className="font-medium">
              Private Healthcare
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <p>Having eligible private health insurance may exempt you from the Medicare levy surcharge.</p>
                  <a
                    href="https://www.ato.gov.au/individuals/medicare-and-private-health-insurance/medicare-levy-surcharge/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline mt-2 block"
                  >
                    ATO: Medicare levy surcharge
                  </a>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {taxSettings.includePrivateHealth && (
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 rounded-lg text-sm">
            <p className="text-blue-800 dark:text-blue-200">
              With private health insurance, you are exempt from the Medicare levy surcharge. 
              For simplicity, Medicare levy has been excluded from calculations.
            </p>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
