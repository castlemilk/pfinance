/**
 * TaxCategorySettings - Tax category (residency status) configuration
 */

'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon, ExternalLinkIcon, CheckIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';
import { 
  TaxCategory, 
  TAX_CATEGORY_OPTIONS, 
  getAustralianBrackets,
  TaxYear,
  DEFAULT_TAX_YEAR,
} from '@/app/constants/taxSystems';

interface TaxCategorySettingsProps {
  taxCategory: TaxCategory;
  onTaxCategoryChange: (category: TaxCategory) => void;
  taxYear?: TaxYear;
  formatCurrency: (amount: number) => string;
}

export function TaxCategorySettings({
  taxCategory,
  onTaxCategoryChange,
  taxYear = DEFAULT_TAX_YEAR,
  formatCurrency,
}: TaxCategorySettingsProps) {
  const isActive = taxCategory !== 'resident';
  const selectedOption = TAX_CATEGORY_OPTIONS.find(opt => opt.value === taxCategory);
  const brackets = getAustralianBrackets(taxYear, taxCategory);

  const getSummary = () => {
    if (!isActive) return 'Australian Resident';
    return selectedOption?.label || 'Custom';
  };

  return (
    <SettingsSection
      id="tax-category"
      title="Tax Category"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your tax residency status affects the tax rates applied to your income. 
          Non-residents and working holiday makers have different tax rates.
        </p>

        <div className="space-y-2">
          {TAX_CATEGORY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onTaxCategoryChange(option.value)}
              className={`w-full flex items-start gap-3 p-3 rounded-lg border transition-colors text-left ${
                taxCategory === option.value
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                taxCategory === option.value
                  ? 'border-primary bg-primary'
                  : 'border-muted-foreground'
              }`}>
                {taxCategory === option.value && (
                  <CheckIcon className="h-2.5 w-2.5 text-primary-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {option.label}
                  </span>
                  {option.helpUrl && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={option.helpUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLinkIcon className="h-3 w-3" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Check eligibility on ATO website</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {option.description}
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Tax Rates Preview */}
        <div className="bg-muted/50 p-4 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-sm font-medium">Tax Rates for {selectedOption?.label}</h4>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>These are the marginal tax rates. Each rate applies only to income within that bracket.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <div className="space-y-1 text-sm">
            {brackets.map((bracket, index) => (
              <div key={index} className="flex justify-between">
                <span className="text-muted-foreground">
                  {bracket.max === null
                    ? `${formatCurrency(bracket.min)}+`
                    : `${formatCurrency(bracket.min)} - ${formatCurrency(bracket.max)}`}
                </span>
                <span className={`font-medium ${bracket.rate === 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                  {bracket.rate}%
                </span>
              </div>
            ))}
          </div>

          {taxCategory !== 'resident' && (
            <div className="mt-3 pt-3 border-t text-xs text-amber-600 dark:text-amber-400">
              {taxCategory === 'non-resident' && (
                <p>Foreign residents do not have a tax-free threshold and cannot claim the Medicare levy exemption.</p>
              )}
              {taxCategory === 'working-holiday' && (
                <p>Working holiday makers pay 15% on the first $45,000 regardless of residency status.</p>
              )}
              {taxCategory === 'no-tax-free' && (
                <p>Without the tax-free threshold, tax is withheld from your first dollar of income.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}
