/**
 * DeductionsSettings - Tax deductions and other income configuration
 */

'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { InfoIcon, ChevronDownIcon, MinusCircleIcon, PlusCircleIcon } from 'lucide-react';
import { useState } from 'react';
import { SettingsSection } from './SettingsSection';

export interface DeductionsData {
  // Tax Deductions
  annualDeductions: number;
  
  // Capital Gains
  capitalGains: number;
  
  // Dividends & Franking
  dividends: number;
  frankingCredits: number;
  
  // Business Income
  businessIncome: number;
  businessLoss: number;
  includesGST: boolean;
  
  // Other
  otherIncome: number;
  otherTaxOffsets: number;
}

interface DeductionsSettingsProps {
  deductions: DeductionsData;
  onDeductionsChange: (deductions: DeductionsData) => void;
  formatCurrency: (amount: number) => string;
}

const DEFAULT_DEDUCTIONS: DeductionsData = {
  annualDeductions: 0,
  capitalGains: 0,
  dividends: 0,
  frankingCredits: 0,
  businessIncome: 0,
  businessLoss: 0,
  includesGST: false,
  otherIncome: 0,
  otherTaxOffsets: 0,
};

export function DeductionsSettings({
  deductions,
  onDeductionsChange,
  formatCurrency,
}: DeductionsSettingsProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  
  const updateField = (field: keyof DeductionsData, value: number | boolean) => {
    onDeductionsChange({
      ...deductions,
      [field]: value,
    });
  };

  const hasDeductions = deductions.annualDeductions > 0;
  const hasCapitalGains = deductions.capitalGains > 0;
  const hasDividends = deductions.dividends > 0 || deductions.frankingCredits > 0;
  const hasBusinessIncome = deductions.businessIncome > 0 || deductions.businessLoss > 0;
  const hasOtherIncome = deductions.otherIncome > 0 || deductions.otherTaxOffsets > 0;
  
  const isActive = hasDeductions || hasCapitalGains || hasDividends || hasBusinessIncome || hasOtherIncome;

  const toggleSection = (section: string) => {
    setExpandedSections(prev =>
      prev.includes(section)
        ? prev.filter(s => s !== section)
        : [...prev, section]
    );
  };

  const calculateNetEffect = () => {
    // Amounts that reduce taxable income (negative = good for tax)
    const reductions = deductions.annualDeductions + deductions.businessLoss;
    
    // Amounts that increase taxable income
    const additions = deductions.capitalGains + deductions.dividends + 
                      deductions.businessIncome + deductions.otherIncome;
    
    // Tax offsets reduce tax payable
    const offsets = deductions.frankingCredits + deductions.otherTaxOffsets;
    
    return { reductions, additions, offsets };
  };

  const getSummary = () => {
    if (!isActive) return 'None';
    const { reductions, additions, offsets } = calculateNetEffect();
    
    const parts = [];
    if (reductions > 0) parts.push(`-${formatCurrency(reductions)} deductions`);
    if (additions > 0) parts.push(`+${formatCurrency(additions)} income`);
    if (offsets > 0) parts.push(`${formatCurrency(offsets)} offsets`);
    
    return parts.join(', ') || 'Configured';
  };

  return (
    <SettingsSection
      id="deductions"
      title="Deductions & Other Income"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Add tax deductions, capital gains, dividends, business income, and other sources of income or offsets.
        </p>

        {/* Summary Card when items exist */}
        {isActive && (
          <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
            {calculateNetEffect().reductions > 0 && (
              <div className="flex justify-between text-green-600 dark:text-green-400">
                <span className="flex items-center gap-1">
                  <MinusCircleIcon className="h-4 w-4" /> Deductions
                </span>
                <span>-{formatCurrency(calculateNetEffect().reductions)}</span>
              </div>
            )}
            {calculateNetEffect().additions > 0 && (
              <div className="flex justify-between text-amber-600 dark:text-amber-400">
                <span className="flex items-center gap-1">
                  <PlusCircleIcon className="h-4 w-4" /> Additional Income
                </span>
                <span>+{formatCurrency(calculateNetEffect().additions)}</span>
              </div>
            )}
            {calculateNetEffect().offsets > 0 && (
              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                <span>Tax Offsets</span>
                <span>{formatCurrency(calculateNetEffect().offsets)}</span>
              </div>
            )}
          </div>
        )}

        {/* Tax Deductions */}
        <Collapsible
          open={expandedSections.includes('deductions') || hasDeductions}
          onOpenChange={() => toggleSection('deductions')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <span className="font-medium text-sm">Annual Tax Deductions</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${
              expandedSections.includes('deductions') || hasDeductions ? 'rotate-180' : ''
            }`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 pl-3 space-y-3">
            <div className="flex items-start gap-2">
              <p className="text-xs text-muted-foreground flex-1">
                Eligible expenses you can claim as deductions to reduce your taxable income.
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <a
                      href="https://www.ato.gov.au/individuals-and-families/income-deductions-offsets-and-records/deductions-you-can-claim"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      ATO: Deductions you can claim
                    </a>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <Label className="text-xs">Total Deductions ($)</Label>
              <Input
                type="number"
                value={deductions.annualDeductions || ''}
                onChange={(e) => updateField('annualDeductions', parseFloat(e.target.value) || 0)}
                className="mt-1 h-8"
                min="0"
                step="100"
                placeholder="0"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Capital Gains */}
        <Collapsible
          open={expandedSections.includes('capital') || hasCapitalGains}
          onOpenChange={() => toggleSection('capital')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <span className="font-medium text-sm">Capital Gains</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${
              expandedSections.includes('capital') || hasCapitalGains ? 'rotate-180' : ''
            }`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 pl-3 space-y-3">
            <div className="flex items-start gap-2">
              <p className="text-xs text-muted-foreground flex-1">
                Reportable capital gains from the sale of assets like shares or property.
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <a
                      href="https://www.ato.gov.au/general/capital-gains-tax/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      ATO: Capital Gains Tax
                    </a>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <Label className="text-xs">Annual Capital Gains ($)</Label>
              <Input
                type="number"
                value={deductions.capitalGains || ''}
                onChange={(e) => updateField('capitalGains', parseFloat(e.target.value) || 0)}
                className="mt-1 h-8"
                min="0"
                step="100"
                placeholder="0"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Dividends & Franking */}
        <Collapsible
          open={expandedSections.includes('dividends') || hasDividends}
          onOpenChange={() => toggleSection('dividends')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <span className="font-medium text-sm">Dividends & Franking Credits</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${
              expandedSections.includes('dividends') || hasDividends ? 'rotate-180' : ''
            }`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 pl-3 space-y-3">
            <div className="flex items-start gap-2">
              <p className="text-xs text-muted-foreground flex-1">
                Income from dividends and franking (imputation) credits.
              </p>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <a
                      href="https://www.ato.gov.au/forms-and-instructions/you-and-your-shares-2023/franking-tax-offsets"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:underline"
                    >
                      ATO: Franking Tax Offsets
                    </a>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Dividends ($)</Label>
                <Input
                  type="number"
                  value={deductions.dividends || ''}
                  onChange={(e) => updateField('dividends', parseFloat(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Franking Credits ($)</Label>
                <Input
                  type="number"
                  value={deductions.frankingCredits || ''}
                  onChange={(e) => updateField('frankingCredits', parseFloat(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                  placeholder="0"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Business Income */}
        <Collapsible
          open={expandedSections.includes('business') || hasBusinessIncome}
          onOpenChange={() => toggleSection('business')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <span className="font-medium text-sm">Business Income</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${
              expandedSections.includes('business') || hasBusinessIncome ? 'rotate-180' : ''
            }`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 pl-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Small business or sole trader income and losses.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Business Income ($)</Label>
                <Input
                  type="number"
                  value={deductions.businessIncome || ''}
                  onChange={(e) => updateField('businessIncome', parseFloat(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Business Loss ($)</Label>
                <Input
                  type="number"
                  value={deductions.businessLoss || ''}
                  onChange={(e) => updateField('businessLoss', parseFloat(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="includes-gst"
                checked={deductions.includesGST}
                onCheckedChange={(checked) => updateField('includesGST', checked)}
              />
              <Label htmlFor="includes-gst" className="text-xs">Includes GST</Label>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Other Income & Offsets */}
        <Collapsible
          open={expandedSections.includes('other') || hasOtherIncome}
          onOpenChange={() => toggleSection('other')}
        >
          <CollapsibleTrigger className="flex items-center justify-between w-full p-3 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
            <span className="font-medium text-sm">Other Income & Offsets</span>
            <ChevronDownIcon className={`h-4 w-4 transition-transform ${
              expandedSections.includes('other') || hasOtherIncome ? 'rotate-180' : ''
            }`} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 pl-3 space-y-3">
            <p className="text-xs text-muted-foreground">
              Other sources of income and tax offsets or credits.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Other Income ($)</Label>
                <Input
                  type="number"
                  value={deductions.otherIncome || ''}
                  onChange={(e) => updateField('otherIncome', parseFloat(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                  placeholder="0"
                />
              </div>
              <div>
                <Label className="text-xs">Tax Offsets ($)</Label>
                <Input
                  type="number"
                  value={deductions.otherTaxOffsets || ''}
                  onChange={(e) => updateField('otherTaxOffsets', parseFloat(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  step="100"
                  placeholder="0"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </SettingsSection>
  );
}

export { DEFAULT_DEDUCTIONS };
