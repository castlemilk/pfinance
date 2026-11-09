'use client';

import * as React from 'react';
import Link from 'next/link';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CountUp } from '@/components/gamma/CountUp';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';
import {
  compareLoan,
  periodsToYearsMonths,
  simulateLoan,
  type LoanYearRow,
  type RepaymentFrequency,
} from '@/lib/loan-maths';

type FrequencyOption = RepaymentFrequency | 'fortnightly-half';
type RepaymentType = 'pi' | 'io';

const EXAMPLE = {
  loanAmount: '600000',
  ratePercent: '6',
  termYears: '30',
  interestOnlyYears: '5',
  extra: '250',
};

const FREQUENCY_LABELS: Record<FrequencyOption, string> = {
  monthly: 'Monthly',
  fortnightly: 'Fortnightly',
  weekly: 'Weekly',
  'fortnightly-half': 'Fortnightly (half the monthly repayment)',
};

const PERIOD_ADJECTIVE: Record<RepaymentFrequency, string> = {
  monthly: 'Monthly',
  fortnightly: 'Fortnightly',
  weekly: 'Weekly',
};

const PERIOD_NOUN: Record<RepaymentFrequency, string> = {
  monthly: 'month',
  fortnightly: 'fortnight',
  weekly: 'week',
};

const RELATED_TOOLS = [
  { href: '/tools/mortgage-offset-calculator/', label: 'Mortgage offset calculator' },
  { href: '/tools/borrowing-power-calculator/', label: 'Borrowing power calculator' },
  { href: '/tools/stamp-duty-calculator/', label: 'Stamp duty calculator' },
  { href: '/tools/rent-vs-buy-calculator/', label: 'Rent vs buy calculator' },
  { href: '/tools/super-calculator/', label: 'Super calculator' },
];

const money = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

const compactMoney = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** '' and non-numbers become NaN; negatives are clamped to 0. */
const parse = (value: string) => {
  const n = value.trim() === '' ? NaN : Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : NaN;
};

const formatDuration = (periods: number, periodsPerYear: number) => {
  const { years, months } = periodsToYearsMonths(periods, periodsPerYear);
  if (years === 0) return `${months} mo`;
  return months === 0 ? `${years} yrs` : `${years} yrs ${months} mo`;
};

function calculate(values: typeof EXAMPLE, frequencyOption: FrequencyOption, repaymentType: RepaymentType) {
  const loanAmount = parse(values.loanAmount);
  const ratePercent = parse(values.ratePercent);
  const termYears = parse(values.termYears);
  const interestOnly = repaymentType === 'io';
  const ioYears = interestOnly ? parse(values.interestOnlyYears) : 0;
  const extra = values.extra.trim() === '' ? 0 : parse(values.extra);

  if (!Number.isFinite(loanAmount) || loanAmount <= 0 || loanAmount > 20_000_000)
    return { valid: false as const, error: 'Enter a loan amount between $1 and $20,000,000.' };
  if (!Number.isFinite(ratePercent) || ratePercent > 25)
    return { valid: false as const, error: 'Enter an interest rate between 0% and 25%.' };
  if (!Number.isFinite(termYears) || termYears < 1 || termYears > 40)
    return { valid: false as const, error: 'Enter a loan term between 1 and 40 years.' };
  if (interestOnly && (!Number.isFinite(ioYears) || ioYears < 1 || ioYears > 10 || ioYears >= termYears))
    return {
      valid: false as const,
      error: 'Enter an interest-only period of 1 to 10 years, shorter than the loan term.',
    };
  if (!Number.isFinite(extra) || extra > 1_000_000)
    return { valid: false as const, error: 'Enter an extra repayment between $0 and $1,000,000.' };

  const frequency: RepaymentFrequency =
    frequencyOption === 'fortnightly-half' ? 'fortnightly' : frequencyOption;
  const halfMonthly = frequencyOption === 'fortnightly-half';
  const inputs = {
    principal: loanAmount,
    annualRatePercent: ratePercent,
    termYears,
    frequency,
    interestOnlyYears: ioYears,
    extraPerPeriod: extra,
    halfMonthly,
  };
  const comparison = compareLoan(inputs);
  // For the half-monthly option, show what it gains over a true fortnightly schedule.
  const trueFortnightly = halfMonthly ? simulateLoan({ ...inputs, halfMonthly: false }) : null;

  return {
    valid: true as const,
    loanAmount,
    ratePercent,
    termYears,
    ioYears,
    extra,
    frequency,
    halfMonthly,
    interestOnly,
    trueFortnightly,
    ...comparison,
  };
}

type ValidResult = Extract<ReturnType<typeof calculate>, { valid: true }>;

export default function PublicHomeLoanRepaymentCalculator() {
  const id = React.useId();
  const [values, setValues] = React.useState(EXAMPLE);
  const [frequencyOption, setFrequencyOption] = React.useState<FrequencyOption>('monthly');
  const [repaymentType, setRepaymentType] = React.useState<RepaymentType>('pi');

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const result = React.useMemo(
    () => calculate(values, frequencyOption, repaymentType),
    [values, frequencyOption, repaymentType]
  );

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive home loan repayment calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Repayments, total interest and the payoff date for a home loan, with an optional
            interest-only period and an extra repayment each period.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setValues({ ...EXAMPLE });
            setFrequencyOption('monthly');
            setRepaymentType('pi');
          }}
        >
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="Your loan">
            <CalcField
              id={`${id}-amount`}
              label="Loan amount (AUD)"
              min={0}
              step="5000"
              value={values.loanAmount}
              onChange={update('loanAmount')}
            />
            <div className="grid grid-cols-2 gap-3">
              <CalcField
                id={`${id}-rate`}
                label="Interest rate (% p.a.)"
                min={0}
                max={25}
                step="0.05"
                value={values.ratePercent}
                onChange={update('ratePercent')}
                hint="The loan's rate, not the comparison rate."
              />
              <CalcField
                id={`${id}-term`}
                label="Loan term (years)"
                min={1}
                max={40}
                step="1"
                value={values.termYears}
                onChange={update('termYears')}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-frequency`} className="text-sm font-medium">
                Repayment frequency
              </label>
              <Select value={frequencyOption} onValueChange={(v) => setFrequencyOption(v as FrequencyOption)}>
                <SelectTrigger id={`${id}-frequency`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as FrequencyOption[]).map((key) => (
                    <SelectItem key={key} value={key}>
                      {FREQUENCY_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Fortnightly and weekly split the annual rate over 26 or 52 repayments. The
                half-monthly option pays half the monthly amount every fortnight.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-type`} className="text-sm font-medium">
                Repayment type
              </label>
              <Select value={repaymentType} onValueChange={(v) => setRepaymentType(v as RepaymentType)}>
                <SelectTrigger id={`${id}-type`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pi">Principal and interest</SelectItem>
                  <SelectItem value="io">Interest-only, then principal and interest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {repaymentType === 'io' && (
              <CalcField
                id={`${id}-io`}
                label="Interest-only period (years)"
                min={1}
                max={10}
                step="1"
                value={values.interestOnlyYears}
                onChange={update('interestOnlyYears')}
                hint="P&I repayments start after this, over the rest of the term."
              />
            )}
            <CalcField
              id={`${id}-extra`}
              label="Extra repayment each period (AUD)"
              min={0}
              step="50"
              value={values.extra}
              onChange={update('extra')}
              hint="On top of the scheduled repayment. Leave at 0 to see the loan as contracted."
            />
          </CalcPanel>
        }
        results={
          result.valid ? (
            <HomeLoanResults result={result} />
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">
                  {result.error}
                </p>
              </CardContent>
            </Card>
          )
        }
      />

      <p className="text-xs text-muted-foreground">
        Estimate only. The rate stays fixed for the whole term and is split evenly across
        repayment periods; lenders usually calculate interest on the daily balance, round
        repayments and add fees, so their figures will differ slightly. Extra repayments keep the
        scheduled repayment the same and shorten the loan. General information, not advice.
      </p>

      <nav aria-label="Related calculators" className="rounded-lg border p-4">
        <p className="text-sm font-medium">Related calculators</p>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          {RELATED_TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link href={tool.href} className="text-primary underline-offset-4 hover:underline">
                {tool.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </section>
  );
}

function HomeLoanResults({ result }: { result: ValidResult }) {
  const { plan, base } = result;
  const noun = PERIOD_NOUN[result.frequency];
  const ppy = plan.periodsPerYear;
  const firstRepayment = result.interestOnly ? plan.interestOnlyRepayment : plan.repayment;
  const piYears = result.termYears - result.ioYears;
  const headlineLabel = `${PERIOD_ADJECTIVE[result.frequency]} repayment${result.halfMonthly ? ' (half the monthly amount)' : ''}`;

  return (
    <>
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {headlineLabel}
          {result.interestOnly ? `, interest-only for ${result.ioYears} yrs` : ''}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          <CountUp
            key={Math.round(firstRepayment)}
            to={Math.round(firstRepayment)}
            prefix="$"
            separator=","
            duration={1}
            trigger="view"
          />
          <span className="text-base font-medium text-muted-foreground"> / {noun}</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="home-loan-repayment">
          {result.interestOnly
            ? `${money(firstRepayment)} a ${noun} interest-only, then ${money(plan.repayment)} a ${noun} principal and interest over the last ${piYears} years.`
            : `${money(plan.repayment)} a ${noun} principal and interest over ${result.termYears} years.`}
          {result.extra > 0 ? ` Plus your ${money(result.extra)} extra each ${noun}.` : ''}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ResultStat
          label="Total interest"
          value={money(plan.totalInterest)}
          sub={result.extra > 0 ? 'Including your extra repayments' : 'Over the full term'}
          testId="home-loan-total-interest"
        />
        <ResultStat
          label="Total repaid"
          value={money(plan.totalPaid)}
          sub={`${money(result.loanAmount)} borrowed plus interest`}
          testId="home-loan-total-paid"
        />
        <ResultStat
          label="Paid off in"
          value={formatDuration(plan.periodsToRepay, ppy)}
          sub={`${plan.periodsToRepay.toLocaleString('en-AU')} repayments`}
          testId="home-loan-payoff"
        />
      </div>

      {result.extra > 0 ? (
        <Card className="border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">What {money(result.extra)} extra each {noun} saves</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">Interest saved</p>
              <p className="text-2xl font-bold tabular-nums text-primary" data-testid="home-loan-interest-saved">
                {money(result.interestSaved)}
              </p>
              <p className="text-xs text-muted-foreground">
                vs {money(base.totalInterest)} with scheduled repayments only
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time saved</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="home-loan-time-saved">
                {formatDuration(result.periodsSaved, ppy)}
              </p>
              <p className="text-xs text-muted-foreground">
                Paid off in {formatDuration(plan.periodsToRepay, ppy)} instead of{' '}
                {formatDuration(base.periodsToRepay, ppy)}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Add an extra repayment to see the interest and time it takes off the loan.
        </p>
      )}

      {result.trueFortnightly && (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Paying half the monthly repayment every fortnight comes to 13 monthly repayments a year.
          Compared with a true fortnightly repayment of{' '}
          {money(result.trueFortnightly.repayment)}, it saves{' '}
          <strong className="text-foreground">
            {money(Math.max(0, result.trueFortnightly.totalInterest - plan.totalInterest))}
          </strong>{' '}
          in interest and finishes{' '}
          {formatDuration(Math.max(0, result.trueFortnightly.periodsToRepay - plan.periodsToRepay), ppy)} sooner.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Loan balance by year</CardTitle>
        </CardHeader>
        <CardContent>
          <figure>
            <BalanceChart plan={plan.years} base={result.extra > 0 ? base.years : null} />
            <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>
                <span aria-hidden="true" className="mr-2 inline-block h-0.5 w-5 bg-primary align-middle" />
                {result.extra > 0 ? 'With your extra repayment' : 'Balance owing'}
              </span>
              {result.extra > 0 && (
                <span>
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block w-5 border-t-2 border-dashed border-muted-foreground align-middle"
                  />
                  Scheduled repayments only
                </span>
              )}
            </figcaption>
          </figure>
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer py-1 font-medium">Year-by-year breakdown</summary>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Home loan repayment table">
          <table className="w-full min-w-[480px] text-right text-sm tabular-nums">
            <caption className="mb-3 text-left text-xs text-muted-foreground">
              AUD, rounded to whole dollars{result.extra > 0 ? ', including your extra repayment' : ''}.
              Year 0 is the day the loan starts.
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="p-2 text-left">Year</th>
                <th scope="col" className="p-2">Interest</th>
                <th scope="col" className="p-2">Principal</th>
                <th scope="col" className="p-2">Balance owing</th>
              </tr>
            </thead>
            <tbody>
              {plan.years.map((row) => (
                <tr key={row.year} className="border-b last:border-0">
                  <th scope="row" className="p-2 text-left font-medium">{row.year}</th>
                  <td className="p-2">{money(row.interest)}</td>
                  <td className="p-2">{money(row.principal)}</td>
                  <td className="p-2 font-medium">{money(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <CalculatorHandoffCta
          tool="home-loan"
          title="Home Loan Repayment Calculator"
          summary={`${money(result.loanAmount)} at ${result.ratePercent}% over ${result.termYears} yrs: ${money(firstRepayment)} a ${noun}, ${money(plan.totalInterest)} interest, paid off in ${formatDuration(plan.periodsToRepay, ppy)}`}
          metrics={[
            { label: 'Repayment', value: `${money(firstRepayment)}/${noun}` },
            { label: 'Total interest', value: money(plan.totalInterest) },
            { label: 'Paid off in', value: formatDuration(plan.periodsToRepay, ppy) },
            ...(result.extra > 0 ? [{ label: 'Interest saved', value: money(result.interestSaved) }] : []),
          ]}
          fields={{
            loanAmount: result.loanAmount,
            annualRatePercent: result.ratePercent,
            termYears: result.termYears,
            frequency: result.halfMonthly ? 'fortnightly-half' : result.frequency,
            interestOnlyYears: result.ioYears,
            extraPerPeriod: result.extra,
            repayment: Math.round(firstRepayment),
            totalInterest: Math.round(plan.totalInterest),
            periodsToRepay: plan.periodsToRepay,
          }}
          targetPath="/personal/goals/"
          label="Track the payoff in PFinance"
        />
        <p className="text-xs text-muted-foreground">Turn the loan into a payoff goal.</p>
      </div>
    </>
  );
}

function BalanceChart({ plan, base }: { plan: LoanYearRow[]; base: LoanYearRow[] | null }) {
  const width = 560;
  const height = 220;
  const margin = { top: 10, right: 12, bottom: 28, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const all = base ? [...plan, ...base] : plan;
  const maxX = Math.max(1, ...all.map((row) => row.year));
  const maxY = Math.max(1, ...all.map((row) => row.balance));
  const x = scaleLinear({ domain: [0, maxX], range: [0, innerW] });
  const y = scaleLinear({ domain: [0, maxY], range: [innerH, 0], nice: true });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Loan balance owing at the end of each year. Exact values are in the year-by-year table."
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        {base && (
          <LinePath
            data={base}
            x={(d) => x(d.year)}
            y={(d) => y(d.balance)}
            strokeWidth={2}
            strokeDasharray="5 4"
            className="stroke-muted-foreground"
          />
        )}
        <LinePath
          data={plan}
          x={(d) => x(d.year)}
          y={(d) => y(d.balance)}
          strokeWidth={2.5}
          className="stroke-primary"
        />
        <AxisBottom
          scale={x}
          top={innerH}
          numTicks={Math.min(maxX, 10)}
          tickFormat={(v) => `${v}`}
          tickLabelProps={() => ({ fontSize: 10, fill: 'currentColor', textAnchor: 'middle' })}
        />
        <AxisLeft
          scale={y}
          numTicks={5}
          tickFormat={(v) => compactMoney.format(Number(v))}
          tickLabelProps={() => ({ fontSize: 10, fill: 'currentColor', textAnchor: 'end', dy: 3 })}
        />
      </g>
    </svg>
  );
}
