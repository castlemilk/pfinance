'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { CountUp } from '@/components/gamma/CountUp';
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';

const EXAMPLE = { familyIncome: '150000', hourlyFee: '15.50', daysPerWeek: '3', hoursPerDay: '10.5' };

// 2025–26 CCS settings (from 7 Jul 2025).
const INCOME_90 = 85_279;
const INCOME_0 = 535_279;
const HOURLY_CAPS = {
  cbdc: { label: 'Centre-based day care', cap: 14.63 },
  fdc: { label: 'Family day care', cap: 13.56 },
  oshc: { label: 'Outside school hours (school age)', cap: 12.81 },
  ihc: { label: 'In home care (per family)', cap: 39.8 },
} as const;
const ACTIVITY_BANDS = {
  under48: { label: 'Up to 48h/fortnight — 72h subsidised (3-day guarantee)', hoursPerFortnight: 72 },
  over48: { label: 'More than 48h/fortnight — 100h subsidised', hoursPerFortnight: 100 },
} as const;

const money = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const money2 = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 2 });

type CareKey = keyof typeof HOURLY_CAPS;
type ActivityKey = keyof typeof ACTIVITY_BANDS;

export default function PublicCcsEstimator() {
  const id = React.useId();
  const [values, setValues] = React.useState(EXAMPLE);
  const [care, setCare] = React.useState<CareKey>('cbdc');
  const [activity, setActivity] = React.useState<ActivityKey>('under48');

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const result = React.useMemo(() => {
    const num = (k: keyof typeof EXAMPLE) => (values[k].trim() === '' ? NaN : Number(values[k]));
    const income = num('familyIncome');
    const fee = num('hourlyFee');
    const days = num('daysPerWeek');
    const hours = num('hoursPerDay');

    if (!Number.isFinite(income) || income < 0)
      return { valid: false as const, error: 'Enter combined family income of $0 or more.' };
    if (!Number.isFinite(fee) || fee <= 0 || fee > 100)
      return { valid: false as const, error: 'Enter the hourly fee the service charges.' };
    if (!Number.isFinite(days) || days < 1 || days > 7 || !Number.isInteger(days))
      return { valid: false as const, error: 'Days per week must be a whole number from 1 to 7.' };
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24)
      return { valid: false as const, error: 'Enter the hours per day of care.' };

    const pct =
      income <= INCOME_90
        ? 90
        : income >= INCOME_0
          ? 0
          : 90 - Math.floor((income - INCOME_90) / 5_000);

    const cap = HOURLY_CAPS[care].cap;
    const subsidisedRate = Math.min(fee, cap) * (pct / 100);
    const weeklyHours = days * hours;
    const entitlementHours = ACTIVITY_BANDS[activity].hoursPerFortnight / 2;
    const coveredHours = Math.min(weeklyHours, entitlementHours);
    const weeklySubsidy = subsidisedRate * coveredHours;
    const weeklyFeeTotal = fee * weeklyHours;
    const weeklyOutOfPocket = weeklyFeeTotal - weeklySubsidy;
    const annualOutOfPocket = weeklyOutOfPocket * 52;
    const annualSubsidy = weeklySubsidy * 52;

    return {
      valid: true as const,
      pct,
      cap,
      weeklyHours,
      coveredHours,
      weeklySubsidy,
      weeklyOutOfPocket,
      annualOutOfPocket,
      annualSubsidy,
      capped: fee > cap,
    };
  }, [values, care, activity]);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive CCS estimator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Estimate your Child Care Subsidy percentage, weekly out-of-pocket cost, and what the
            rate cap leaves uncovered.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="Your family and care">
            <CalcField
              id={`${id}-income`}
              label="Combined family income (AUD/yr)"
              min={0}
              step="1000"
              value={values.familyIncome}
              onChange={update('familyIncome')}
              hint="Your estimate lodged with Centrelink for the year."
            />
            <div className="space-y-1.5">
              <label htmlFor={`${id}-care`} className="text-sm font-medium">Care type</label>
              <Select value={care} onValueChange={(v) => setCare(v as CareKey)}>
                <SelectTrigger id={`${id}-care`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(HOURLY_CAPS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <CalcField
              id={`${id}-fee`}
              label="Hourly fee charged (AUD)"
              min={0}
              step="0.25"
              value={values.hourlyFee}
              onChange={update('hourlyFee')}
              hint={`Rate cap for this care type is $${HOURLY_CAPS[care].cap}/h.`}
            />
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-days`} label="Days/week in care" min={1} max={7} value={values.daysPerWeek} onChange={update('daysPerWeek')} />
              <CalcField id={`${id}-hours`} label="Hours/day" min={1} max={14} step="0.5" value={values.hoursPerDay} onChange={update('hoursPerDay')} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-activity`} className="text-sm font-medium">Activity test band</label>
              <Select value={activity} onValueChange={(v) => setActivity(v as ActivityKey)}>
                <SelectTrigger id={`${id}-activity`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTIVITY_BANDS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CalcPanel>
        }
        results={
          result.valid ? (
            <>
              <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Estimated out-of-pocket per week
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
                  <span data-testid="ccs-weekly">
                    <CountUp to={result.weeklyOutOfPocket} prefix="$" separator="," decimals={2} duration={1.2} trigger="view" />
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {result.pct}% CCS rate{result.capped ? `, capped at $${result.cap}/h` : ''} — subsidy covers {money2(result.weeklySubsidy)}/week
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <ResultStat
                  label="CCS percentage"
                  value={`${result.pct}%`}
                  sub={result.pct === 90 ? 'Maximum rate (income ≤ $85,279)' : result.pct === 0 ? 'Income above the cut-off' : 'Tapers 1% per $5,000 of income'}
                  testId="ccs-pct"
                />
                <ResultStat
                  label="Hours covered"
                  value={`${result.coveredHours}h/wk`}
                  sub={`Entitlement ${ACTIVITY_BANDS[activity].hoursPerFortnight}h/fortnight`}
                  testId="ccs-hours"
                />
                <ResultStat
                  label="Annual out-of-pocket"
                  value={money(result.annualOutOfPocket)}
                  sub={`${money(result.annualSubsidy)}/yr subsidised`}
                  testId="ccs-annual"
                />
              </div>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">What moves the number</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The subsidy applies to the lower of your fee and the rate cap — services charging
                  above the cap leave you covering the gap regardless of your percentage. A second
                  child under 5 in care can attract a higher rate (up to 95% under ~$141k family
                  income); Services Australia applies it automatically. The estimate uses
                  2025&ndash;26 settings.
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">{result.error}</p>
              </CardContent>
            </Card>
          )
        }
      />

      <p className="text-xs text-muted-foreground">
        Estimator only — actual entitlement depends on your Centrelink income estimate, provider
        session reports, immunisation and residency rules, and reconciliation at year end.
        General information, not advice.
      </p>

      {result.valid && (
        <CalculatorHandoffCta
          tool="ccs"
          title="CCS Estimate"
          summary={`${result.pct}% CCS → ~${money2(result.weeklyOutOfPocket)}/week out of pocket`}
          metrics={[
            { label: 'CCS rate', value: `${result.pct}%` },
            { label: 'Weekly gap', value: money2(result.weeklyOutOfPocket) },
            { label: 'Annual gap', value: money(result.annualOutOfPocket) },
          ]}
          fields={{ weeklyChildcare: Math.round(result.weeklyOutOfPocket * 100) / 100 }}
          targetPath="/personal/budgets/"
          label="Put childcare in your budget"
        />
      )}
    </section>
  );
}
