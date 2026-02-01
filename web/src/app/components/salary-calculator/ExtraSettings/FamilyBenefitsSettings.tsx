/**
 * FamilyBenefitsSettings - Family Tax Benefit and Child Care Subsidy configuration
 */

'use client';

import { useState } from 'react';
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
import { InfoIcon, PlusIcon, Trash2Icon, BabyIcon, UsersIcon } from 'lucide-react';
import { SettingsSection } from './SettingsSection';

export interface ChildEntry {
  id: string;
  age: number;
  inChildcare: boolean;
  childcareType: 'centre' | 'family' | 'afterSchool' | 'inHome';
  weeklyHours: number;
  weeklyCost: number;
}

export interface FamilyBenefitsData {
  isCouple: boolean;
  spouseIncome: number;
  children: ChildEntry[];
  childSupportReceived: number;
  childSupportPaid: number;
}

interface FamilyBenefitsSettingsProps {
  familyBenefits: FamilyBenefitsData;
  onFamilyBenefitsChange: (benefits: FamilyBenefitsData) => void;
  householdIncome: number;
  formatCurrency: (amount: number) => string;
}

const DEFAULT_FAMILY_BENEFITS: FamilyBenefitsData = {
  isCouple: false,
  spouseIncome: 0,
  children: [],
  childSupportReceived: 0,
  childSupportPaid: 0,
};

// Child Care Subsidy rates based on family income (2024-25)
const CCS_RATES = [
  { maxIncome: 80000, rate: 0.90 },
  { maxIncome: 100000, rate: 0.85 },
  { maxIncome: 120000, rate: 0.80 },
  { maxIncome: 140000, rate: 0.75 },
  { maxIncome: 160000, rate: 0.70 },
  { maxIncome: 180000, rate: 0.65 },
  { maxIncome: 200000, rate: 0.60 },
  { maxIncome: 220000, rate: 0.55 },
  { maxIncome: 240000, rate: 0.50 },
  { maxIncome: 260000, rate: 0.45 },
  { maxIncome: 280000, rate: 0.40 },
  { maxIncome: 300000, rate: 0.35 },
  { maxIncome: 320000, rate: 0.30 },
  { maxIncome: 340000, rate: 0.25 },
  { maxIncome: 360000, rate: 0.20 },
  { maxIncome: 530000, rate: 0.00 },
];

// Hourly rate caps by child care type (2024-25)
const HOURLY_CAPS = {
  centre: 13.73,
  family: 12.20,
  afterSchool: 13.73,
  inHome: 34.78,
};

export function FamilyBenefitsSettings({
  familyBenefits,
  onFamilyBenefitsChange,
  householdIncome,
  formatCurrency,
}: FamilyBenefitsSettingsProps) {
  const isActive = familyBenefits.children.length > 0;

  const updateField = (field: keyof FamilyBenefitsData, value: boolean | number | ChildEntry[]) => {
    onFamilyBenefitsChange({
      ...familyBenefits,
      [field]: value,
    });
  };

  const addChild = () => {
    const newChild: ChildEntry = {
      id: crypto.randomUUID(),
      age: 3,
      inChildcare: true,
      childcareType: 'centre',
      weeklyHours: 40,
      weeklyCost: 500,
    };
    updateField('children', [...familyBenefits.children, newChild]);
  };

  const removeChild = (id: string) => {
    updateField('children', familyBenefits.children.filter(c => c.id !== id));
  };

  const updateChild = (id: string, field: keyof ChildEntry, value: number | boolean | string) => {
    updateField(
      'children',
      familyBenefits.children.map(child =>
        child.id === id ? { ...child, [field]: value } : child
      )
    );
  };

  // Calculate combined family income
  const totalFamilyIncome = householdIncome + (familyBenefits.isCouple ? familyBenefits.spouseIncome : 0);

  // Get CCS rate based on income
  const getCCSRate = () => {
    const tier = CCS_RATES.find(t => totalFamilyIncome <= t.maxIncome);
    return tier ? tier.rate : 0;
  };

  // Calculate total Child Care Subsidy
  const calculateCCS = () => {
    const rate = getCCSRate();
    if (rate === 0) return 0;

    return familyBenefits.children
      .filter(c => c.inChildcare && c.age < 13)
      .reduce((total, child) => {
        const hourlyCap = HOURLY_CAPS[child.childcareType];
        const cappedHourlyCost = Math.min(child.weeklyCost / child.weeklyHours, hourlyCap);
        const weeklySubsidy = cappedHourlyCost * child.weeklyHours * rate;
        return total + (weeklySubsidy * 52);
      }, 0);
  };

  const getSummary = () => {
    if (!isActive) return 'No children';
    const childCount = familyBenefits.children.length;
    const ccs = calculateCCS();
    if (ccs > 0) {
      return `${childCount} child${childCount > 1 ? 'ren' : ''}, ~${formatCurrency(ccs)}/year CCS`;
    }
    return `${childCount} child${childCount > 1 ? 'ren' : ''}`;
  };

  return (
    <SettingsSection
      id="family-benefits"
      title="Family Tax Benefit"
      summary={getSummary()}
      isActive={isActive}
    >
      <div className="space-y-4">
        <div className="flex items-start gap-2">
          <p className="text-sm text-muted-foreground flex-1">
            Family Tax Benefits and Child Care Subsidy are government payments for eligible families with children.
          </p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="h-4 w-4 text-muted-foreground cursor-help shrink-0" />
              </TooltipTrigger>
              <TooltipContent className="max-w-80">
                <p>Eligibility depends on income, number of children, and care arrangements.</p>
                <a
                  href="https://www.servicesaustralia.gov.au/family-tax-benefit"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline mt-2 block"
                >
                  Services Australia: Family Tax Benefit
                </a>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Family Status */}
        <div className="bg-muted/50 p-4 rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Couple</Label>
            </div>
            <Switch
              checked={familyBenefits.isCouple}
              onCheckedChange={(checked) => updateField('isCouple', checked)}
            />
          </div>

          {familyBenefits.isCouple && (
            <div>
              <Label className="text-xs">Spouse&apos;s Annual Income ($)</Label>
              <Input
                type="number"
                value={familyBenefits.spouseIncome || ''}
                onChange={(e) => updateField('spouseIncome', parseFloat(e.target.value) || 0)}
                className="mt-1 h-8"
                min="0"
                step="1000"
                placeholder="0"
              />
            </div>
          )}

          <div className="text-xs text-muted-foreground pt-2 border-t">
            Combined family income: {formatCurrency(totalFamilyIncome)}
          </div>
        </div>

        {/* CCS Rate Display */}
        {isActive && (
          <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200 dark:border-purple-800 p-4 rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <BabyIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h4 className="font-medium">Child Care Subsidy Estimate</h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">CCS Rate</span>
                <div className="font-semibold text-lg">{Math.round(getCCSRate() * 100)}%</div>
              </div>
              <div>
                <span className="text-purple-600 dark:text-purple-400">Annual Subsidy</span>
                <div className="font-semibold text-lg text-purple-600 dark:text-purple-400">
                  ~{formatCurrency(calculateCCS())}
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              This is an estimate. Actual payments depend on activity tests and other factors.
            </p>
          </div>
        )}

        {/* Children */}
        {familyBenefits.children.map((child, index) => (
          <div
            key={child.id}
            className="space-y-3 p-4 border border-border rounded-lg bg-muted/30"
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BabyIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Child {index + 1}</span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeChild(child.id)}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2Icon className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Age</Label>
                <Input
                  type="number"
                  value={child.age}
                  onChange={(e) => updateChild(child.id, 'age', parseInt(e.target.value) || 0)}
                  className="mt-1 h-8"
                  min="0"
                  max="24"
                />
              </div>
              <div className="flex items-end pb-1">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`childcare-${child.id}`}
                    checked={child.inChildcare}
                    onCheckedChange={(checked) => updateChild(child.id, 'inChildcare', checked)}
                  />
                  <Label htmlFor={`childcare-${child.id}`} className="text-xs">In Child Care</Label>
                </div>
              </div>
            </div>

            {child.inChildcare && child.age < 13 && (
              <>
                <div>
                  <Label className="text-xs">Child Care Type</Label>
                  <Select
                    value={child.childcareType}
                    onValueChange={(value) => updateChild(child.id, 'childcareType', value)}
                  >
                    <SelectTrigger className="mt-1 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="centre">Centre Based Day Care</SelectItem>
                      <SelectItem value="family">Family Day Care</SelectItem>
                      <SelectItem value="afterSchool">After School Care</SelectItem>
                      <SelectItem value="inHome">In Home Care</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Weekly Hours</Label>
                    <Input
                      type="number"
                      value={child.weeklyHours}
                      onChange={(e) => updateChild(child.id, 'weeklyHours', parseInt(e.target.value) || 0)}
                      className="mt-1 h-8"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Weekly Cost ($)</Label>
                    <Input
                      type="number"
                      value={child.weeklyCost}
                      onChange={(e) => updateChild(child.id, 'weeklyCost', parseFloat(e.target.value) || 0)}
                      className="mt-1 h-8"
                      min="0"
                      step="10"
                    />
                  </div>
                </div>

                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <div className="flex justify-between">
                    <span>Annual cost:</span>
                    <span>{formatCurrency(child.weeklyCost * 52)}</span>
                  </div>
                  <div className="flex justify-between text-purple-600 dark:text-purple-400">
                    <span>Est. subsidy ({Math.round(getCCSRate() * 100)}%):</span>
                    <span>~{formatCurrency(child.weeklyCost * getCCSRate() * 52)}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Your cost:</span>
                    <span>~{formatCurrency(child.weeklyCost * (1 - getCCSRate()) * 52)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={addChild}
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          Add Child
        </Button>
      </div>
    </SettingsSection>
  );
}

export { DEFAULT_FAMILY_BENEFITS };
