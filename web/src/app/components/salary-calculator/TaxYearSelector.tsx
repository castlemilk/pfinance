/**
 * TaxYearSelector - Select the tax year for calculations
 */

'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { InfoIcon, CalendarIcon } from 'lucide-react';
import { TaxYear, TAX_YEAR_OPTIONS, getAustralianBrackets } from '@/app/constants/taxSystems';

interface TaxYearSelectorProps {
  value: TaxYear;
  onChange: (year: TaxYear) => void;
}

export function TaxYearSelector({ value, onChange }: TaxYearSelectorProps) {
  const selectedOption = TAX_YEAR_OPTIONS.find(opt => opt.value === value);
  const brackets = getAustralianBrackets(value);
  
  // Format bracket for display
  const formatBracketSummary = () => {
    const rates = brackets.map(b => `${b.rate}%`).join(' → ');
    return rates;
  };

  return (
    <div className="flex items-center gap-2">
      <CalendarIcon className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={(v) => onChange(v as TaxYear)}>
        <SelectTrigger className="w-[130px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TAX_YEAR_OPTIONS.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value}
              className="flex items-center gap-2"
            >
              <span>{option.label}</span>
              {option.isFuture && (
                <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">
                  Future
                </Badge>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help" />
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            <p className="font-medium mb-1">Tax Year: {selectedOption?.label}</p>
            <p className="text-xs text-muted-foreground mb-2">
              Tax rates: {formatBracketSummary()}
            </p>
            <div className="text-xs space-y-1">
              {brackets.map((bracket, i) => (
                <div key={i} className="flex justify-between gap-4">
                  <span>
                    {bracket.max === null 
                      ? `$${bracket.min.toLocaleString()}+`
                      : `$${bracket.min.toLocaleString()} - $${bracket.max.toLocaleString()}`
                    }
                  </span>
                  <span className="font-medium">{bracket.rate}%</span>
                </div>
              ))}
            </div>
            {selectedOption?.isFuture && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                * Future rates are projections and subject to change
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
