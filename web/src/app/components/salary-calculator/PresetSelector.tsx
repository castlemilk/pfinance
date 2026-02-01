/**
 * PresetSelector - Quick-select presets for common employment scenarios
 */

'use client';

import { TaxSettings } from '@/app/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { 
  ChevronDownIcon, 
  BriefcaseIcon, 
  HeartIcon, 
  BuildingIcon, 
  ClockIcon,
  UserIcon,
  PlaneIcon,
  InfoIcon,
} from 'lucide-react';
import { SalarySacrificeEntry } from './types';
import { DEFAULT_TAX_SETTINGS, DEFAULT_FORM_VALUES } from './constants';
import { v4 as uuidv4 } from 'uuid';

export type PresetType = 
  | 'standard'
  | 'nfp-charity'
  | 'healthcare'
  | 'casual'
  | 'sole-trader'
  | 'working-holiday'
  | 'second-job';

interface Preset {
  id: PresetType;
  name: string;
  description: string;
  icon: React.ReactNode;
  taxSettings: Partial<TaxSettings>;
  formDefaults: {
    salary?: string;
    frequency?: 'weekly' | 'fortnightly' | 'monthly' | 'annually';
    packagingCap?: number;
  };
  salarySacrifices?: SalarySacrificeEntry[];
}

const PRESETS: Preset[] = [
  {
    id: 'standard',
    name: 'Standard Employee',
    description: 'Full-time employee with super and Medicare',
    icon: <BriefcaseIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
    },
    formDefaults: {
      packagingCap: 0,
    },
    salarySacrifices: [],
  },
  {
    id: 'nfp-charity',
    name: 'NFP/Charity Worker',
    description: 'Includes $15,899 salary packaging cap',
    icon: <HeartIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
    },
    formDefaults: {
      packagingCap: 15899,
    },
    salarySacrifices: [
      {
        id: uuidv4(),
        description: 'Salary Package',
        amount: '611',
        frequency: 'fortnightly',
        isTaxDeductible: true,
      },
    ],
  },
  {
    id: 'healthcare',
    name: 'Healthcare Worker',
    description: 'Public hospital packaging ($15,899 cap)',
    icon: <BuildingIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
    },
    formDefaults: {
      packagingCap: 15899,
    },
    salarySacrifices: [
      {
        id: uuidv4(),
        description: 'Salary Package',
        amount: '611',
        frequency: 'fortnightly',
        isTaxDeductible: true,
      },
    ],
  },
  {
    id: 'casual',
    name: 'Casual Worker',
    description: 'Hourly rate, no leave loading',
    icon: <ClockIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
      includeSuper: true,
      superRate: 11.5,
    },
    formDefaults: {
      frequency: 'weekly',
      packagingCap: 0,
    },
    salarySacrifices: [],
  },
  {
    id: 'sole-trader',
    name: 'Sole Trader',
    description: 'No super guarantee obligation',
    icon: <UserIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
      includeSuper: false,
    },
    formDefaults: {
      packagingCap: 0,
    },
    salarySacrifices: [],
  },
  {
    id: 'working-holiday',
    name: 'Working Holiday',
    description: 'Backpacker visa (417/462) tax rates',
    icon: <PlaneIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
      includeMedicare: false,
    },
    formDefaults: {
      packagingCap: 0,
    },
    salarySacrifices: [],
  },
  {
    id: 'second-job',
    name: 'Second Job',
    description: 'No tax-free threshold applied',
    icon: <BriefcaseIcon className="h-4 w-4" />,
    taxSettings: {
      ...DEFAULT_TAX_SETTINGS,
    },
    formDefaults: {
      packagingCap: 0,
    },
    salarySacrifices: [],
  },
];

interface PresetSelectorProps {
  currentPreset?: PresetType;
  onPresetSelect: (preset: Preset) => void;
}

export function PresetSelector({ currentPreset, onPresetSelect }: PresetSelectorProps) {
  const selectedPreset = PRESETS.find(p => p.id === currentPreset);

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            {selectedPreset ? (
              <>
                {selectedPreset.icon}
                <span className="hidden sm:inline">{selectedPreset.name}</span>
                <span className="sm:hidden">Preset</span>
              </>
            ) : (
              <>
                <BriefcaseIcon className="h-4 w-4" />
                <span>Select Preset</span>
              </>
            )}
            <ChevronDownIcon className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="flex items-center gap-2">
            Quick Presets
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">
                    Select a preset to quickly configure the calculator for common scenarios.
                    You can still adjust individual settings afterward.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {PRESETS.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => onPresetSelect(preset)}
              className="flex items-start gap-3 py-2 cursor-pointer"
            >
              <span className="mt-0.5 text-muted-foreground">
                {preset.icon}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{preset.name}</span>
                  {currentPreset === preset.id && (
                    <Badge variant="secondary" className="text-[10px] px-1 py-0">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {preset.description}
                </p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {selectedPreset && (
        <Badge variant="outline" className="text-xs hidden md:flex">
          {selectedPreset.name}
        </Badge>
      )}
    </div>
  );
}

export { PRESETS };
export type { Preset };
