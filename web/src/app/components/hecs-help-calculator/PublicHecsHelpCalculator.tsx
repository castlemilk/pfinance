'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';

// ATO 2025–26 marginal repayment schedule for HELP/VSL/SFSS/SSL/AASL
// https://www.ato.gov.au/Rates/HELP,-TSL-and-SFSS-repayment-thresholds-and-rates/
const MIN_THRESHOLD_2025_26 = 67_000;
const MID_THRESHOLD = 125_000;
const TOP_THRESHOLD = 179_285;
const MID_BASE = 8_700;

const EXAMPLE = {
  repaymentIncome: '85000',
  helpBalance: '28000',
  indexationRatePercent: '3.2',
  voluntaryRepayment: '0',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

export function compulsoryRepayment2025_26(repaymentIncome: number): number {
  if (repaymentIncome <= MIN_THRESHOLD_2025_26) return 0;
  if (repaymentIncome <= MID_THRESHOLD) {
    return 0.15 * (repaymentIncome - MIN_THRESHOLD_2025_26);
  }
  if (repaymentIncome <= TOP_THRESHOLD) {
    return MID_BASE + 0.17 * (repaymentIncome - MID_THRESHOLD);
  }
  return 0.1 * repaymentIncome;
}

export default function PublicHecsHelpCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
    const repaymentIncome = num(values.repaymentIncome);
    const helpBalance = num(values.helpBalance);
    const indexationRatePercent =
      values.indexationRatePercent.trim() === '' ? 0 : Number(values.indexationRatePercent);
    const voluntaryRepayment =
      values.voluntaryRepayment.trim() === '' ? 0 : Number(values.voluntaryRepayment);

    if (!Number.isFinite(repaymentIncome) || repaymentIncome < 0 || repaymentIncome > 5_000_000) {
      return { valid: false as const, error: 'Enter a repayment income between $0 and $5,000,000.' };
    }
    if (!Number.isFinite(helpBalance) || helpBalance < 0 || helpBalance > 2_000_000) {
      return { valid: false as const, error: 'Enter a HELP debt between $0 and $2,000,000.' };
    }
    if (!Number.isFinite(indexationRatePercent) || indexationRatePercent < 0 || indexationRatePercent > 15) {
      return { valid: false as const, error: 'Enter an indexation rate between 0% and 15%.' };
    }
    if (!Number.isFinite(voluntaryRepayment) || voluntaryRepayment < 0 || voluntaryRepayment > 500_000) {
      return { valid: false as const, error: 'Enter a voluntary repayment between $0 and $500,000.' };
    }

    const compulsory = Math.min(
      compulsoryRepayment2025_26(repaymentIncome),
      helpBalance
    );
    const effectivePercent = repaymentIncome > 0 ? (compulsory / repaymentIncome) * 100 : 0;
    const fortnightly = compulsory / 26;
    const monthly = compulsory / 12;

    // 1 June indexation applies before the year's repayment credits reduce the balance.
    const indexedBalance = helpBalance * (1 + indexationRatePercent / 100);
    const indexationAmount = indexedBalance - helpBalance;
    const yearEndBalance = Math.max(0, indexedBalance - compulsory - voluntaryRepayment);
    const aboveThreshold = Math.max(0, repaymentIncome - MIN_THRESHOLD_2025_26);

    return {
      valid: true as const,
      compulsory,
      effectivePercent,
      fortnightly,
      monthly,
      indexedBalance,
      indexationAmount,
      yearEndBalance,
      aboveThreshold,
      voluntaryRepayment,
    };
  }, [values]);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive HECS-HELP repayment estimator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Estimate your 2025–26 compulsory repayment under the new marginal system, June
            indexation on your balance, and how a voluntary repayment changes the year-end figure.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your income &amp; HELP debt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-income`}>Repayment income (AUD/yr)</Label>
              <Input id={`${id}-income`} type="number" min={0} step="1000" value={values.repaymentIncome} onChange={update('repaymentIncome')} />
              <p className="text-xs text-muted-foreground">
                Taxable income + reportable fringe benefits + reportable super contributions
                (incl. salary sacrifice) + net investment losses + exempt foreign employment income.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-balance`}>Current HELP debt (AUD)</Label>
              <Input id={`${id}-balance`} type="number" min={0} step="500" value={values.helpBalance} onChange={update('helpBalance')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-idx`}>Indexation rate (%)</Label>
                <Input id={`${id}-idx`} type="number" min={0} max={15} step="0.1" value={values.indexationRatePercent} onChange={update('indexationRatePercent')} />
                <p className="text-xs text-muted-foreground">
                  Applied 1 June — the lower of CPI or WPI.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-vol`}>Voluntary repayment ($)</Label>
                <Input id={`${id}-vol`} type="number" min={0} step="100" value={values.voluntaryRepayment} onChange={update('voluntaryRepayment')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {calculation.valid ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="default">2025–26 compulsory repayment</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Effective {calculation.effectivePercent.toFixed(2)}% of repayment income
                    </span>
                  </div>
                  <p
                    data-testid="hecs-compulsory-repayment"
                    className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    {money(calculation.compulsory)} / yr
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ≈ <strong className="text-foreground tabular-nums">{money(calculation.fortnightly)}</strong> per
                    fortnight withheld ({money(calculation.monthly)}/mo)
                    {calculation.aboveThreshold > 0 && (
                      <>
                        {' '}— 15c per $1 over ${MIN_THRESHOLD_2025_26.toLocaleString('en-AU')} on{' '}
                        {money(calculation.aboveThreshold)} of income above the threshold
                      </>
                    )}
                    .
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">1 June indexation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-3xl font-bold tabular-nums" data-testid="hecs-indexation">
                      +{money(calculation.indexationAmount)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Your {money(Number(values.helpBalance))} debt is indexed to{' '}
                      {money(calculation.indexedBalance)} at {values.indexationRatePercent}%.
                      Indexation is applied before the year&apos;s repayments credit.
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Projected year-end balance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-3xl font-bold tabular-nums text-primary" data-testid="hecs-yearend">
                      {money(calculation.yearEndBalance)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {money(calculation.indexedBalance)} indexed − {money(calculation.compulsory)}{' '}
                      compulsory
                      {calculation.voluntaryRepayment > 0 &&
                        ` − ${money(calculation.voluntaryRepayment)} voluntary`}
                      .
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">The salary sacrifice add-back</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Salary sacrifice super and reportable fringe benefits reduce your{' '}
                  <em>taxable</em> income but are <strong>added back</strong> into repayment income.
                  If you package benefits, enter the add-back-inclusive figure above — otherwise the
                  estimate will understate the repayment.
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <CalculatorHandoffCta
                  tool="hecs-help"
                  title="HECS-HELP Repayment Calculator"
                  summary={`${money(calculation.compulsory)}/yr compulsory repayment; balance ${money(Number(values.helpBalance))} → ${money(calculation.yearEndBalance)} after indexation`}
                  metrics={[
                    { label: 'Compulsory repayment', value: `${money(calculation.compulsory)}/yr` },
                    { label: 'Per fortnight', value: money(calculation.fortnightly) },
                    { label: 'Indexation (1 Jun)', value: `+${money(calculation.indexationAmount)}` },
                    { label: 'Year-end balance', value: money(calculation.yearEndBalance) },
                  ]}
                  fields={{
                    repaymentIncome: Number(values.repaymentIncome),
                    helpBalance: Number(values.helpBalance),
                    indexationRatePercent: Number(values.indexationRatePercent),
                    compulsoryRepayment: Math.round(calculation.compulsory),
                    yearEndBalance: Math.round(calculation.yearEndBalance),
                  }}
                  targetPath="/personal/goals/"
                  label="Set a payoff goal in PFinance"
                />
                <p className="text-xs text-muted-foreground">
                  2025–26 ATO marginal schedule. Estimate only — actual repayment is assessed on
                  lodgement.
                </p>
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
