'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

type PayFrequency = 'weekly' | 'fortnightly' | 'monthly' | 'annually';

const FREQUENCY_MULTIPLIERS: Record<PayFrequency, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  annually: 1,
};

const EXAMPLE = {
  primaryPay: '6500',
  partnerPay: '0',
  frequency: 'monthly' as PayFrequency,
  needsPercent: '50',
  wantsPercent: '30',
  savingsPercent: '20',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

export default function PublicBudgetCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const primary = values.primaryPay.trim() === '' ? NaN : Number(values.primaryPay);
    const partner = values.partnerPay.trim() === '' ? 0 : Number(values.partnerPay);
    const needs = values.needsPercent.trim() === '' ? NaN : Number(values.needsPercent);
    const wants = values.wantsPercent.trim() === '' ? NaN : Number(values.wantsPercent);
    const savings = values.savingsPercent.trim() === '' ? NaN : Number(values.savingsPercent);

    if (!Number.isFinite(primary) || primary <= 0 || primary > 100_000_000) {
      return { valid: false as const, error: 'Enter a valid take-home pay greater than $0.' };
    }
    if (!Number.isFinite(partner) || partner < 0 || partner > 100_000_000) {
      return { valid: false as const, error: 'Enter a partner pay of $0 or more.' };
    }
    if (
      !Number.isFinite(needs) ||
      !Number.isFinite(wants) ||
      !Number.isFinite(savings) ||
      needs < 0 ||
      wants < 0 ||
      savings < 0
    ) {
      return { valid: false as const, error: 'Enter non-negative percentages for each bucket.' };
    }

    const totalPercent = Math.round((needs + wants + savings) * 10) / 10;
    if (Math.abs(totalPercent - 100) > 0.01) {
      return {
        valid: false as const,
        error: `Bucket percentages currently add up to ${totalPercent}%. Adjust them so they total 100%.`,
      };
    }

    const mult = FREQUENCY_MULTIPLIERS[values.frequency];
    const primaryAnnual = primary * mult;
    const partnerAnnual = partner * mult;
    const totalAnnual = primaryAnnual + partnerAnnual;

    const buckets = [
      {
        key: 'needs',
        label: 'Needs (Housing, groceries, utilities, minimum debt)',
        percent: needs,
        annual: (totalAnnual * needs) / 100,
      },
      {
        key: 'wants',
        label: 'Wants (Dining, entertainment, subscriptions, hobbies)',
        percent: wants,
        annual: (totalAnnual * wants) / 100,
      },
      {
        key: 'savings',
        label: 'Savings & Extra Debt Payoff (Emergency fund, offset, super)',
        percent: savings,
        annual: (totalAnnual * savings) / 100,
      },
    ];

    const primaryShare = totalAnnual > 0 ? (primaryAnnual / totalAnnual) * 100 : 100;
    const partnerShare = totalAnnual > 0 ? (partnerAnnual / totalAnnual) * 100 : 0;

    return {
      valid: true as const,
      totalAnnual,
      partnerAnnual,
      buckets,
      primaryShare,
      partnerShare,
    };
  }, [values]);

  const applyPreset = (needs: string, wants: string, savings: string) => {
    setValues((prev) => ({
      ...prev,
      needsPercent: needs,
      wantsPercent: wants,
      savingsPercent: savings,
    }));
  };

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive household budget calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Test 50/30/20 or custom budget splits across weekly, fortnightly, monthly, and annual horizons.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Income &amp; split assumptions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`${id}-frequency`}>Pay cycle</Label>
              <div id={`${id}-frequency`} className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {(['weekly', 'fortnightly', 'monthly', 'annually'] as const).map((freq) => (
                  <Button
                    key={freq}
                    type="button"
                    size="sm"
                    variant={values.frequency === freq ? 'default' : 'outline'}
                    onClick={() => setValues((prev) => ({ ...prev, frequency: freq }))}
                    className="capitalize"
                  >
                    {freq}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${id}-primaryPay`}>Your take-home pay (AUD)</Label>
              <Input
                id={`${id}-primaryPay`}
                type="number"
                inputMode="decimal"
                min={0}
                step="50"
                value={values.primaryPay}
                onChange={(e) => setValues((prev) => ({ ...prev, primaryPay: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${id}-partnerPay`}>Partner take-home pay (optional, AUD)</Label>
              <Input
                id={`${id}-partnerPay`}
                type="number"
                inputMode="decimal"
                min={0}
                step="50"
                value={values.partnerPay}
                onChange={(e) => setValues((prev) => ({ ...prev, partnerPay: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Add a second income to calculate proportional household cost splitting.
              </p>
            </div>

            <div className="border-t pt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">Allocation presets</span>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('50', '30', '20')}>
                    50/30/20
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('60', '20', '20')}>
                    60/20/20
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => applyPreset('70', '10', '20')}>
                    70/10/20
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`${id}-needs`}>Needs (%)</Label>
                  <Input
                    id={`${id}-needs`}
                    type="number"
                    min={0}
                    max={100}
                    value={values.needsPercent}
                    onChange={(e) => setValues((prev) => ({ ...prev, needsPercent: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${id}-wants`}>Wants (%)</Label>
                  <Input
                    id={`${id}-wants`}
                    type="number"
                    min={0}
                    max={100}
                    value={values.wantsPercent}
                    onChange={(e) => setValues((prev) => ({ ...prev, wantsPercent: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`${id}-savings`}>Savings (%)</Label>
                  <Input
                    id={`${id}-savings`}
                    type="number"
                    min={0}
                    max={100}
                    value={values.savingsPercent}
                    onChange={(e) => setValues((prev) => ({ ...prev, savingsPercent: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {calculation.valid ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {calculation.buckets.map((bucket) => (
                  <Card key={bucket.key} className="border-primary/20">
                    <CardContent className="pt-5">
                      <p className="text-xs font-medium text-primary">{bucket.percent}% allocation</p>
                      <p
                        data-testid={`budget-${bucket.key}-monthly`}
                        className="mt-1 text-2xl font-bold tabular-nums"
                      >
                        {money(bucket.annual / 12)}
                        <span className="text-xs font-normal text-muted-foreground"> /mo</span>
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{bucket.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Breakdown by pay horizon</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[480px] text-right text-sm tabular-nums">
                      <thead>
                        <tr className="border-b">
                          <th scope="col" className="p-3 text-left">Category bucket</th>
                          <th scope="col" className="p-3">Weekly</th>
                          <th scope="col" className="p-3">Fortnightly</th>
                          <th scope="col" className="p-3">Monthly</th>
                          <th scope="col" className="p-3">Annual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calculation.buckets.map((bucket) => (
                          <tr key={bucket.key} className="border-b last:border-0">
                            <th scope="row" className="p-3 text-left font-medium">
                              {bucket.label.split(' (')[0]} ({bucket.percent}%)
                            </th>
                            <td className="p-3">{money(bucket.annual / 52)}</td>
                            <td className="p-3">{money(bucket.annual / 26)}</td>
                            <td className="p-3 font-medium">{money(bucket.annual / 12)}</td>
                            <td className="p-3">{money(bucket.annual)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {calculation.partnerAnnual > 0 && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-6">
                    <h3 className="font-semibold">Proportional household split</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Based on combined household take-home pay of {money(calculation.totalAnnual / 12)}/month:
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
                      <div className="rounded-md border bg-background p-3">
                        <span className="text-muted-foreground">Your proportional share:</span>{' '}
                        <strong className="tabular-nums">{calculation.primaryShare.toFixed(1)}%</strong> (
                        {money((calculation.buckets[0].annual / 12) * (calculation.primaryShare / 100))}/mo of Needs)
                      </div>
                      <div className="rounded-md border bg-background p-3">
                        <span className="text-muted-foreground">Partner proportional share:</span>{' '}
                        <strong className="tabular-nums">{calculation.partnerShare.toFixed(1)}%</strong> (
                        {money((calculation.buckets[0].annual / 12) * (calculation.partnerShare / 100))}/mo of Needs)
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
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
