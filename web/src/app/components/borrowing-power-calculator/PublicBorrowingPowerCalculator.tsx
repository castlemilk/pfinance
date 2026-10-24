'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CountUp } from '@/components/gamma/CountUp';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { getAustralianBrackets } from '@/app/constants/taxSystems';

const ASSESSMENT_BUFFER = 3; // APRA expects lenders to assess at rate + 3%
const CARD_LIMIT_LOADING = 3.8; // lenders assess ~3.8% of card limit per month

const EXAMPLE = {
  grossIncome: '110000',
  monthlyExpenses: '3400',
  monthlyDebts: '450',
  cardLimits: '8000',
  deposit: '90000',
  ratePercent: '6.0',
  termYears: '30',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

function annualTax(income: number): number {
  let tax = 0;
  for (const b of getAustralianBrackets()) {
    if (income > b.min) {
      tax += ((Math.min(income, b.max ?? Infinity) - b.min) * b.rate) / 100;
    }
  }
  return tax + income * 0.02; // + Medicare levy
}

function monthlyPayment(principal: number, annualRatePct: number, years: number): number {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r <= 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export default function PublicBorrowingPowerCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
    const grossIncome = num(values.grossIncome);
    const monthlyExpenses = num(values.monthlyExpenses);
    const monthlyDebts = num(values.monthlyDebts);
    const cardLimits = num(values.cardLimits);
    const deposit = num(values.deposit);
    const ratePercent = num(values.ratePercent);
    const termYears = num(values.termYears);

    if (!Number.isFinite(grossIncome) || grossIncome < 0 || grossIncome > 10_000_000) {
      return { valid: false as const, error: 'Enter gross income between $0 and $10,000,000.' };
    }
    if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 20) {
      return { valid: false as const, error: 'Enter a rate between 0% and 20%.' };
    }
    if (!Number.isFinite(termYears) || termYears <= 0 || termYears > 40) {
      return { valid: false as const, error: 'Enter a term between 1 and 40 years.' };
    }
    for (const [v, label] of [
      [monthlyExpenses, 'living expenses'],
      [monthlyDebts, 'debt repayments'],
      [cardLimits, 'card limits'],
      [deposit, 'deposit'],
    ] as const) {
      if (!Number.isFinite(v) || v < 0 || v > 10_000_000) {
        return { valid: false as const, error: `Enter ${label} between $0 and $10,000,000.` };
      }
    }

    const netMonthly = (grossIncome - annualTax(grossIncome)) / 12;
    const cardLoading = cardLimits * (CARD_LIMIT_LOADING / 100);
    const available = Math.max(0, netMonthly - monthlyExpenses - monthlyDebts - cardLoading);

    const assessedRate = ratePercent + ASSESSMENT_BUFFER;
    const r = assessedRate / 100 / 12;
    const n = termYears * 12;
    const maxLoan = available > 0 ? available * ((1 - Math.pow(1 + r, -n)) / r) : 0;
    const maxProperty = maxLoan + deposit;
    const monthlyRepayment = monthlyPayment(maxLoan, ratePercent, termYears);
    const lvr = maxProperty > 0 ? (maxLoan / maxProperty) * 100 : 0;

    return {
      valid: true as const,
      netMonthly,
      cardLoading,
      available,
      assessedRate,
      maxLoan,
      maxProperty,
      monthlyRepayment,
      lvr,
    };
  }, [values]);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const field = (key: keyof typeof EXAMPLE, label: string, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      <Input id={`${id}-${key}`} type="number" min={0} value={values[key]} onChange={update(key)} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive borrowing power estimator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            A lender-style serviceability check: after-tax income minus living expenses, debts, and
            card-limit loadings — then assessed at a 3% rate buffer, the way APRA expects banks to.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your position</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {field('grossIncome', 'Gross annual income (AUD)')}
            {field('monthlyExpenses', 'Monthly living expenses ($)', 'Lenders compare this against HEM benchmarks — understating it inflates the result.')}
            {field('monthlyDebts', 'Other monthly repayments ($)', 'Personal loans, car loans, BNPL, HECS-indexed commitments.')}
            {field('cardLimits', 'Total credit card limits ($)', 'Assessed at ~3.8%/month of the limit, even if you pay in full.')}
            {field('deposit', 'Deposit available ($)')}
            <div className="grid grid-cols-2 gap-3">
              {field('ratePercent', 'Loan rate %')}
              {field('termYears', 'Term (years)')}
            </div>
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-5">
          {calculation.valid ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="default">Estimated maximum property price</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      ~{calculation.lvr.toFixed(0)}% LVR before costs
                    </span>
                  </div>
                  <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                    <span data-testid="borrowing-max-property">
                      <CountUp to={calculation.maxProperty} prefix="$" separator="," duration={1.2} trigger="view" />
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Loan {money(calculation.maxLoan)} + deposit {money(Number(values.deposit))} —
                    before stamp duty and purchase costs
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-4 sm:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs font-medium text-muted-foreground">Monthly repayment</p>
                    <p className="mt-1 text-xl font-bold tabular-nums" data-testid="borrowing-repayment">
                      {money(calculation.monthlyRepayment)}/mo
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">at {values.ratePercent}% actual rate</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs font-medium text-muted-foreground">Serviceability surplus</p>
                    <p className="mt-1 text-xl font-bold tabular-nums" data-testid="borrowing-surplus">
                      {money(calculation.available)}/mo
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">assessed at {calculation.assessedRate}%</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-xs font-medium text-muted-foreground">Net monthly income</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{money(calculation.netMonthly)}/mo</p>
                    <p className="mt-1 text-xs text-muted-foreground">after income tax + Medicare</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Why card limits hurt even at $0 balance</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Lenders assume your {money(Number(values.cardLimits))} card limit is fully drawn and
                  assess ~3.8% of it per month — {money(calculation.cardLoading)}/mo of borrowing
                  capacity here. Lowering a limit by $10,000 typically adds roughly $60–70k of
                  borrowing power at current rates. This estimate ignores HEM floors, lender-specific
                  loadings, and stamp duty — treat it as a planning range, then confirm with a broker.
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <CalculatorHandoffCta
                  tool="borrowing-power"
                  title="Borrowing Power Estimator"
                  summary={`~${money(calculation.maxProperty)} max property (${money(calculation.maxLoan)} loan + ${money(Number(values.deposit))} deposit), ${money(calculation.monthlyRepayment)}/mo repayment`}
                  metrics={[
                    { label: 'Max property', value: money(calculation.maxProperty) },
                    { label: 'Max loan', value: money(calculation.maxLoan) },
                    { label: 'Monthly repayment', value: `${money(calculation.monthlyRepayment)}/mo` },
                  ]}
                  fields={{
                    maxProperty: Math.round(calculation.maxProperty),
                    maxLoan: Math.round(calculation.maxLoan),
                    monthlyRepayment: Math.round(calculation.monthlyRepayment),
                    deposit: Number(values.deposit),
                  }}
                  targetPath="/personal/goals/"
                  label="Set a deposit goal in PFinance"
                />
                <p className="text-xs text-muted-foreground">
                  Estimate only — each lender&apos;s serviceability model differs. Excludes stamp
                  duty, LMI, and purchase costs.
                </p>
              </div>
            </>
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">{calculation.error}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
