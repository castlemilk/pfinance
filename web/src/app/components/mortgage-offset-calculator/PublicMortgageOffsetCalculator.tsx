'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';

const EXAMPLE = {
  loanBalance: '650000',
  annualRatePercent: '5.9',
  remainingYears: '25',
  offsetBalance: '40000',
  hisaRatePercent: '4.5',
  marginalTaxRatePercent: '32',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

interface Amortization {
  months: number;
  totalInterest: number;
}

function amortize(
  principal: number,
  annualRate: number,
  monthlyPayment: number,
  offset: number,
  maxMonths: number
): Amortization | null {
  const monthlyRate = annualRate / 12;
  let balance = principal;
  let totalInterest = 0;
  let months = 0;
  while (months < maxMonths && balance > 0.005) {
    const interest = Math.max(0, (balance - offset) * monthlyRate);
    const principalPaid = monthlyPayment - interest;
    if (principalPaid <= 0) return null; // repayment never catches up
    balance = Math.max(0, balance - principalPaid);
    totalInterest += interest;
    months++;
  }
  return { months: Math.max(1, months), totalInterest };
}

export default function PublicMortgageOffsetCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
    const loanBalance = num(values.loanBalance);
    const annualRatePercent = num(values.annualRatePercent);
    const remainingYears = num(values.remainingYears);
    const offsetBalance = values.offsetBalance.trim() === '' ? 0 : Number(values.offsetBalance);
    const hisaRatePercent = values.hisaRatePercent.trim() === '' ? 0 : Number(values.hisaRatePercent);
    const marginalTaxRatePercent = num(values.marginalTaxRatePercent);

    if (!Number.isFinite(loanBalance) || loanBalance <= 0 || loanBalance > 50_000_000) {
      return { valid: false as const, error: 'Enter a loan balance between $1 and $50,000,000.' };
    }
    if (!Number.isFinite(annualRatePercent) || annualRatePercent <= 0 || annualRatePercent > 20) {
      return { valid: false as const, error: 'Enter a loan interest rate between 0% and 20%.' };
    }
    if (!Number.isFinite(remainingYears) || remainingYears <= 0 || remainingYears > 40) {
      return { valid: false as const, error: 'Enter a remaining term between 1 and 40 years.' };
    }
    if (!Number.isFinite(offsetBalance) || offsetBalance < 0 || offsetBalance > loanBalance) {
      return { valid: false as const, error: 'Offset balance must be between $0 and the loan balance.' };
    }
    if (!Number.isFinite(hisaRatePercent) || hisaRatePercent < 0 || hisaRatePercent > 20) {
      return { valid: false as const, error: 'Enter a savings rate between 0% and 20%.' };
    }
    if (
      !Number.isFinite(marginalTaxRatePercent) ||
      marginalTaxRatePercent < 0 ||
      marginalTaxRatePercent > 60
    ) {
      return { valid: false as const, error: 'Enter a marginal tax rate between 0% and 60%.' };
    }

    const monthlyRate = annualRatePercent / 100 / 12;
    const monthsTotal = Math.round(remainingYears * 12);
    const monthlyPayment =
      (loanBalance * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -monthsTotal));

    const withoutOffset = amortize(loanBalance, annualRatePercent / 100, monthlyPayment, 0, monthsTotal);
    const withOffset = amortize(
      loanBalance,
      annualRatePercent / 100,
      monthlyPayment,
      offsetBalance,
      monthsTotal
    );

    if (!withoutOffset || !withOffset) {
      return {
        valid: false as const,
        error: 'The repayment never catches up to the interest at these settings — check the rate and term.',
      };
    }

    const interestSaved = withoutOffset.totalInterest - withOffset.totalInterest;
    const monthsSaved = withoutOffset.months - withOffset.months;

    // After-tax comparison: offset saves interest at the loan rate tax-free;
    // a HISA earns the savings rate minus marginal tax.
    const taxRate = marginalTaxRatePercent / 100;
    const offsetEffectiveRate = annualRatePercent;
    const hisaEffectiveRate = hisaRatePercent * (1 - taxRate);
    const annualAdvantage = offsetBalance * ((offsetEffectiveRate - hisaEffectiveRate) / 100);
    const firstYearHisaInterestAfterTax = offsetBalance * (hisaRatePercent / 100) * (1 - taxRate);

    return {
      valid: true as const,
      monthlyPayment,
      withoutOffset,
      withOffset,
      interestSaved,
      monthsSaved,
      offsetEffectiveRate,
      hisaEffectiveRate,
      annualAdvantage,
      firstYearHisaInterestAfterTax,
    };
  }, [values]);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive mortgage offset calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            See how much interest and time a 100% offset account saves on your Australian home
            loan — and whether it beats parking the same cash in a high-interest savings account
            after tax.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your loan &amp; savings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-loan`}>Loan balance (AUD)</Label>
              <Input id={`${id}-loan`} type="number" min={1} step="1000" value={values.loanBalance} onChange={update('loanBalance')} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-rate`}>Loan rate (% p.a.)</Label>
                <Input id={`${id}-rate`} type="number" min={0} max={20} step="0.05" value={values.annualRatePercent} onChange={update('annualRatePercent')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-years`}>Years remaining</Label>
                <Input id={`${id}-years`} type="number" min={1} max={40} step="1" value={values.remainingYears} onChange={update('remainingYears')} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-offset`}>Offset / savings balance (AUD)</Label>
              <Input id={`${id}-offset`} type="number" min={0} step="1000" value={values.offsetBalance} onChange={update('offsetBalance')} />
              <p className="text-xs text-muted-foreground">
                Cash parked in a 100% offset account (emergency fund, sinking funds, savings).
              </p>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Alternative: high-interest savings
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-hisa`}>HISA rate (% p.a.)</Label>
                  <Input id={`${id}-hisa`} type="number" min={0} max={20} step="0.05" value={values.hisaRatePercent} onChange={update('hisaRatePercent')} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-mtr`}>Marginal tax + Medicare (%)</Label>
                  <Input id={`${id}-mtr`} type="number" min={0} max={60} step="0.5" value={values.marginalTaxRatePercent} onChange={update('marginalTaxRatePercent')} />
                </div>
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
                    <Badge variant="default">Offset outcome</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Repayment ≈ {money(calculation.monthlyPayment)}/mo
                    </span>
                  </div>
                  <p
                    data-testid="offset-interest-saved"
                    className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl"
                  >
                    {money(calculation.interestSaved)} interest saved
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Loan repaid{' '}
                    <strong className="text-foreground">
                      {Math.floor(calculation.monthsSaved / 12)} yrs {calculation.monthsSaved % 12} mo
                    </strong>{' '}
                    sooner ({calculation.withOffset.months} vs {calculation.withoutOffset.months}{' '}
                    months).
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Without offset</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-3xl font-bold tabular-nums">
                      {money(calculation.withoutOffset.totalInterest)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total interest over {Math.round(calculation.withoutOffset.months / 12)} years
                      ({calculation.withoutOffset.months} repayments of{' '}
                      {money(calculation.monthlyPayment)}).
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">With {money(Number(values.offsetBalance))} offset</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p
                      data-testid="offset-total-interest"
                      className="text-3xl font-bold tabular-nums text-primary"
                    >
                      {money(calculation.withOffset.totalInterest)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Total interest over {Math.round(calculation.withOffset.months / 12)} years —
                      interest is only charged on the balance above your offset.
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Offset vs high-interest savings account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Offset effective return</p>
                      <p className="text-xl font-bold tabular-nums" data-testid="offset-effective-rate">
                        {calculation.offsetEffectiveRate.toFixed(2)}% tax-free
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">HISA after-tax return</p>
                      <p className="text-xl font-bold tabular-nums">
                        {calculation.hisaEffectiveRate.toFixed(2)}%
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Offset advantage (year 1)</p>
                      <p className="text-xl font-bold tabular-nums text-primary">
                        {money(calculation.annualAdvantage)}/yr
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Savings interest is taxed at your marginal rate; offset savings are untaxed
                    because they reduce deductible-from-nothing personal loan interest. Keep in mind
                    offset money stays redraw-accessible — it is not locked in the loan.
                  </p>
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <CalculatorHandoffCta
                  tool="mortgage-offset"
                  title="Mortgage Offset Calculator"
                  summary={`${money(Number(values.offsetBalance))} offset saves ${money(calculation.interestSaved)} interest and ${Math.floor(calculation.monthsSaved / 12)}y ${calculation.monthsSaved % 12}m on a ${money(Number(values.loanBalance))} loan`}
                  metrics={[
                    { label: 'Interest saved', value: money(calculation.interestSaved) },
                    {
                      label: 'Time saved',
                      value: `${Math.floor(calculation.monthsSaved / 12)}y ${calculation.monthsSaved % 12}m`,
                    },
                    { label: 'Repayment', value: `${money(calculation.monthlyPayment)}/mo` },
                    {
                      label: 'Offset effective rate',
                      value: `${calculation.offsetEffectiveRate.toFixed(2)}%`,
                    },
                  ]}
                  fields={{
                    loanBalance: Number(values.loanBalance),
                    annualRatePercent: Number(values.annualRatePercent),
                    remainingYears: Number(values.remainingYears),
                    offsetBalance: Number(values.offsetBalance),
                    interestSaved: Math.round(calculation.interestSaved),
                    monthsSaved: calculation.monthsSaved,
                  }}
                  targetPath="/personal/goals/"
                  label="Track payoff in PFinance"
                />
                <p className="text-xs text-muted-foreground">
                  Estimates only — excludes fees, rate changes, and redraw rules.
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
