'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Settings } from 'lucide-react';
import { TAX_YEAR_OPTIONS, TaxYear } from '../../../constants/taxSystems';
import type { WizardState, WizardAction } from '../TaxReviewWizard';

interface ConfigureStepProps {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
}

export function ConfigureStep({ state, dispatch }: ConfigureStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Settings className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Configure Your Tax Review</h2>
          <p className="text-sm text-muted-foreground">
            Set up the parameters for your financial year review.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {/* Financial Year */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Financial Year</CardTitle>
            <CardDescription className="text-xs">
              Select the Australian financial year to review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select
              value={state.financialYear}
              onValueChange={(v) => dispatch({ type: 'SET_FINANCIAL_YEAR', value: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select FY" />
              </SelectTrigger>
              <SelectContent>
                {TAX_YEAR_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    FY {opt.label}{opt.isFuture ? ' (projected)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Occupation */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Occupation</CardTitle>
            <CardDescription className="text-xs">
              Helps AI classify work-related deductions accurately
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="e.g., Software Engineer, Teacher, Nurse"
              value={state.occupation}
              onChange={(e) => dispatch({ type: 'SET_OCCUPATION', value: e.target.value })}
            />
          </CardContent>
        </Card>

        {/* Tax Withheld */}
        <Card className="sm:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Tax Already Withheld</CardTitle>
            <CardDescription className="text-xs">
              Total tax withheld from your payslips during the year (from your payment summary / income statement)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                placeholder="0.00"
                value={state.taxWithheld || ''}
                onChange={(e) =>
                  dispatch({ type: 'SET_TAX_WITHHELD', value: parseFloat(e.target.value) || 0 })
                }
                className="pl-7"
                min="0"
                step="100"
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toggle options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tax Situation</CardTitle>
          <CardDescription className="text-xs">
            These settings affect your tax calculation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="help-debt" className="text-sm font-medium">
                HELP / HECS-HELP Debt
              </Label>
              <p className="text-xs text-muted-foreground">
                Do you have an outstanding Higher Education Loan?
              </p>
            </div>
            <Switch
              id="help-debt"
              checked={state.hasHelpDebt}
              onCheckedChange={(v) => dispatch({ type: 'SET_HAS_HELP_DEBT', value: v })}
            />
          </div>

          <div className="border-t" />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="medicare-exemption" className="text-sm font-medium">
                Medicare Levy Exemption
              </Label>
              <p className="text-xs text-muted-foreground">
                Are you exempt from the Medicare levy? (e.g., foreign resident with reciprocal agreement)
              </p>
            </div>
            <Switch
              id="medicare-exemption"
              checked={state.medicareExemption}
              onCheckedChange={(v) => dispatch({ type: 'SET_MEDICARE_EXEMPTION', value: v })}
            />
          </div>

          <div className="border-t" />

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="private-health" className="text-sm font-medium">
                Private Health Insurance
              </Label>
              <p className="text-xs text-muted-foreground">
                Do you hold an appropriate level of private patient hospital cover?
              </p>
            </div>
            <Switch
              id="private-health"
              checked={state.privateHealth}
              onCheckedChange={(v) => dispatch({ type: 'SET_PRIVATE_HEALTH', value: v })}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
