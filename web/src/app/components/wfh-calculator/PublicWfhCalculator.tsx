'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const FIXED_RATE_PER_HOUR = 0.67;

const EXAMPLE = {
  hoursPerWeek: '16',
  weeksWorked: '48',
  monthlyMobileBill: '85',
  mobileWorkPercent: '50',
  monthlyInternetBill: '90',
  internetWorkPercent: '30',
  annualEnergyAndStationery: '180',
  marginalTaxRatePercent: '32',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

export default function PublicWfhCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const hoursPerWeek = values.hoursPerWeek.trim() === '' ? NaN : Number(values.hoursPerWeek);
    const weeksWorked = values.weeksWorked.trim() === '' ? NaN : Number(values.weeksWorked);
    const monthlyMobileBill = values.monthlyMobileBill.trim() === '' ? 0 : Number(values.monthlyMobileBill);
    const mobileWorkPercent = values.mobileWorkPercent.trim() === '' ? 0 : Number(values.mobileWorkPercent);
    const monthlyInternetBill = values.monthlyInternetBill.trim() === '' ? 0 : Number(values.monthlyInternetBill);
    const internetWorkPercent = values.internetWorkPercent.trim() === '' ? 0 : Number(values.internetWorkPercent);
    const annualEnergyAndStationery =
      values.annualEnergyAndStationery.trim() === '' ? 0 : Number(values.annualEnergyAndStationery);
    const marginalTaxRatePercent =
      values.marginalTaxRatePercent.trim() === '' ? NaN : Number(values.marginalTaxRatePercent);

    if (!Number.isFinite(hoursPerWeek) || hoursPerWeek < 0 || hoursPerWeek > 120) {
      return { valid: false as const, error: 'Enter weekly WFH hours between 0 and 120.' };
    }
    if (!Number.isFinite(weeksWorked) || weeksWorked < 0 || weeksWorked > 52) {
      return { valid: false as const, error: 'Enter weeks worked between 0 and 52.' };
    }
    if (
      !Number.isFinite(monthlyMobileBill) ||
      monthlyMobileBill < 0 ||
      !Number.isFinite(monthlyInternetBill) ||
      monthlyInternetBill < 0 ||
      !Number.isFinite(annualEnergyAndStationery) ||
      annualEnergyAndStationery < 0
    ) {
      return { valid: false as const, error: 'Enter non-negative dollar amounts for bills.' };
    }
    if (
      !Number.isFinite(mobileWorkPercent) ||
      mobileWorkPercent < 0 ||
      mobileWorkPercent > 100 ||
      !Number.isFinite(internetWorkPercent) ||
      internetWorkPercent < 0 ||
      internetWorkPercent > 100
    ) {
      return { valid: false as const, error: 'Work-use percentages must be between 0% and 100%.' };
    }
    if (
      !Number.isFinite(marginalTaxRatePercent) ||
      marginalTaxRatePercent < 0 ||
      marginalTaxRatePercent > 60
    ) {
      return { valid: false as const, error: 'Enter a marginal tax rate between 0% and 60%.' };
    }

    const totalHours = hoursPerWeek * weeksWorked;
    const fixedRateDeduction = totalHours * FIXED_RATE_PER_HOUR;

    const mobileDeduction = monthlyMobileBill * 12 * (mobileWorkPercent / 100);
    const internetDeduction = monthlyInternetBill * 12 * (internetWorkPercent / 100);
    const actualCostDeduction = mobileDeduction + internetDeduction + annualEnergyAndStationery;

    const taxRate = marginalTaxRatePercent / 100;
    const fixedRateTaxSaving = fixedRateDeduction * taxRate;
    const actualCostTaxSaving = actualCostDeduction * taxRate;
    const difference = Math.abs(actualCostDeduction - fixedRateDeduction);
    const winner =
      actualCostDeduction > fixedRateDeduction
        ? ('Actual Cost Method' as const)
        : ('Fixed Rate Method' as const);

    return {
      valid: true as const,
      totalHours,
      fixedRateDeduction,
      fixedRateTaxSaving,
      mobileDeduction,
      internetDeduction,
      annualEnergyAndStationery,
      actualCostDeduction,
      actualCostTaxSaving,
      difference,
      winner,
    };
  }, [values]);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive WFH deduction comparison calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Compare the ATO 67c/hr Fixed Rate Method against the Actual Cost Method based on your hours and work-use bills.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your WFH hours &amp; bills</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-hoursPerWeek`}>WFH hours / week</Label>
                <Input
                  id={`${id}-hoursPerWeek`}
                  type="number"
                  min={0}
                  max={120}
                  step="1"
                  value={values.hoursPerWeek}
                  onChange={(e) => setValues((p) => ({ ...p, hoursPerWeek: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-weeksWorked`}>Weeks worked / yr</Label>
                <Input
                  id={`${id}-weeksWorked`}
                  type="number"
                  min={0}
                  max={52}
                  step="1"
                  value={values.weeksWorked}
                  onChange={(e) => setValues((p) => ({ ...p, weeksWorked: e.target.value }))}
                />
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actual Cost Method Inputs
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-mobileBill`}>Mobile bill ($/mo)</Label>
                  <Input
                    id={`${id}-mobileBill`}
                    type="number"
                    min={0}
                    step="5"
                    value={values.monthlyMobileBill}
                    onChange={(e) => setValues((p) => ({ ...p, monthlyMobileBill: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-mobileWork`}>Mobile work (%)</Label>
                  <Input
                    id={`${id}-mobileWork`}
                    type="number"
                    min={0}
                    max={100}
                    step="5"
                    value={values.mobileWorkPercent}
                    onChange={(e) => setValues((p) => ({ ...p, mobileWorkPercent: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-internetBill`}>Internet bill ($/mo)</Label>
                  <Input
                    id={`${id}-internetBill`}
                    type="number"
                    min={0}
                    step="5"
                    value={values.monthlyInternetBill}
                    onChange={(e) => setValues((p) => ({ ...p, monthlyInternetBill: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-internetWork`}>Internet work (%)</Label>
                  <Input
                    id={`${id}-internetWork`}
                    type="number"
                    min={0}
                    max={100}
                    step="5"
                    value={values.internetWorkPercent}
                    onChange={(e) => setValues((p) => ({ ...p, internetWorkPercent: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${id}-energy`}>
                  Apportioned annual electricity, gas &amp; stationery (AUD/yr)
                </Label>
                <Input
                  id={`${id}-energy`}
                  type="number"
                  min={0}
                  step="10"
                  value={values.annualEnergyAndStationery}
                  onChange={(e) =>
                    setValues((p) => ({ ...p, annualEnergyAndStationery: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${id}-taxRate`}>Marginal tax + Medicare (%)</Label>
                <div className="flex gap-1">
                  {(['18', '32', '39', '47'] as const).map((rate) => (
                    <Button
                      key={rate}
                      type="button"
                      size="sm"
                      variant={values.marginalTaxRatePercent === rate ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs"
                      onClick={() => setValues((p) => ({ ...p, marginalTaxRatePercent: rate }))}
                    >
                      {rate}%
                    </Button>
                  ))}
                </div>
              </div>
              <Input
                id={`${id}-taxRate`}
                type="number"
                min={0}
                max={60}
                step="0.5"
                value={values.marginalTaxRatePercent}
                onChange={(e) =>
                  setValues((p) => ({ ...p, marginalTaxRatePercent: e.target.value }))
                }
              />
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {calculation.valid ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="default">Higher Deduction Estimate</Badge>
                    <span className="text-xs text-muted-foreground">
                      {calculation.totalHours} total WFH hours / year
                    </span>
                  </div>
                  <p
                    data-testid="wfh-recommended-method"
                    className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    {calculation.winner} (+{money(calculation.difference)} extra deduction)
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Estimated tax reduction:{' '}
                    <strong className="text-foreground tabular-nums">
                      {money(
                        Math.max(calculation.fixedRateTaxSaving, calculation.actualCostTaxSaving)
                      )}
                    </strong>{' '}
                    vs{' '}
                    <span className="tabular-nums">
                      {money(
                        Math.min(calculation.fixedRateTaxSaving, calculation.actualCostTaxSaving)
                      )}
                    </span>{' '}
                    at {values.marginalTaxRatePercent}% marginal rate.
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card
                  className={
                    calculation.winner === 'Fixed Rate Method' ? 'border-primary/50' : undefined
                  }
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Method 1: Fixed Rate (67c/hr)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p
                      data-testid="wfh-fixed-rate-total"
                      className="text-3xl font-bold tabular-nums text-foreground"
                    >
                      {money(calculation.fixedRateDeduction)}
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li>
                        • {calculation.totalHours} hrs × $0.67/hr ={' '}
                        {money(calculation.fixedRateDeduction)}
                      </li>
                      <li>
                        • Separate mobile phone &amp; internet deduction: <strong>$0</strong>{' '}
                        (bundled into 67c/hr rate)
                      </li>
                      <li>
                        • Requires full-year contemporaneous hours log + 1 bill per expense type
                      </li>
                    </ul>
                  </CardContent>
                </Card>

                <Card
                  className={
                    calculation.winner === 'Actual Cost Method' ? 'border-primary/50' : undefined
                  }
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Method 2: Actual Cost Method</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p
                      data-testid="wfh-actual-cost-total"
                      className="text-3xl font-bold tabular-nums text-primary"
                    >
                      {money(calculation.actualCostDeduction)}
                    </p>
                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                      <li>
                        • Mobile phone ({values.mobileWorkPercent}% work):{' '}
                        <strong>{money(calculation.mobileDeduction)}/yr</strong>
                      </li>
                      <li>
                        • Home internet ({values.internetWorkPercent}% work):{' '}
                        <strong>{money(calculation.internetDeduction)}/yr</strong>
                      </li>
                      <li>
                        • Apportioned power &amp; stationery:{' '}
                        <strong>{money(calculation.annualEnergyAndStationery)}/yr</strong>
                      </li>
                      <li>• Requires all bills claimed + 4-week representative usage diary</li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">
                  {calculation.error}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
