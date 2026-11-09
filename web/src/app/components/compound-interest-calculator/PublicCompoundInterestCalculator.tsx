'use client';

import * as React from 'react';
import Link from 'next/link';
import { scaleLinear } from '@visx/scale';
import { Area, AreaClosed, LinePath } from '@visx/shape';
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
  MAX_TARGET_YEARS,
  projectCompoundGrowth,
  timeToTarget,
  type CompoundingFrequency,
  type CompoundYearRow,
  type ContributionFrequency,
} from '@/lib/compound-interest';

const EXAMPLE = {
  startingBalance: '10000',
  contribution: '500',
  ratePercent: '4.5',
  years: '10',
  target: '50000',
};

const CONTRIBUTION_LABELS: Record<ContributionFrequency, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  annually: 'Annually',
};

const CONTRIBUTION_NOUN: Record<ContributionFrequency, string> = {
  weekly: 'week',
  fortnightly: 'fortnight',
  monthly: 'month',
  annually: 'year',
};

const COMPOUNDING_LABELS: Record<CompoundingFrequency, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annually',
};

const RELATED_TOOLS = [
  { href: '/tools/super-calculator/', label: 'Super calculator' },
  { href: '/tools/mortgage-offset-calculator/', label: 'Mortgage offset calculator' },
  { href: '/tools/rent-vs-buy-calculator/', label: 'Rent vs buy calculator' },
  { href: '/tools/borrowing-power-calculator/', label: 'Borrowing power calculator' },
  { href: '/tools/stamp-duty-calculator/', label: 'Stamp duty calculator' },
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

const formatMonths = (months: number) => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `${rest} mo`;
  return rest === 0 ? `${years} yrs` : `${years} yrs ${rest} mo`;
};

function calculate(
  values: typeof EXAMPLE,
  contributionFrequency: ContributionFrequency,
  compounding: CompoundingFrequency
) {
  const startingBalance = values.startingBalance.trim() === '' ? 0 : parse(values.startingBalance);
  const contribution = values.contribution.trim() === '' ? 0 : parse(values.contribution);
  const ratePercent = parse(values.ratePercent);
  const years = parse(values.years);
  const target = values.target.trim() === '' ? 0 : parse(values.target);

  if (!Number.isFinite(startingBalance) || startingBalance > 100_000_000)
    return { valid: false as const, error: 'Enter a starting balance between $0 and $100,000,000.' };
  if (!Number.isFinite(contribution) || contribution > 1_000_000)
    return { valid: false as const, error: 'Enter a regular deposit between $0 and $1,000,000.' };
  if (!Number.isFinite(ratePercent) || ratePercent > 30)
    return { valid: false as const, error: 'Enter an interest rate between 0% and 30%.' };
  if (!Number.isInteger(years) || years < 1 || years > 60)
    return { valid: false as const, error: 'Enter a whole number of years from 1 to 60.' };
  if (!Number.isFinite(target) || target > 1_000_000_000)
    return { valid: false as const, error: 'Enter a savings target between $0 and $1,000,000,000.' };

  const inputs = {
    startingBalance,
    contribution,
    contributionFrequency,
    annualRatePercent: ratePercent,
    compounding,
    years,
  };
  const projection = projectCompoundGrowth(inputs);
  const monthsToTarget = target > 0 ? timeToTarget(inputs, target) : null;

  return {
    valid: true as const,
    ...projection,
    contribution,
    ratePercent,
    years,
    target,
    monthsToTarget,
  };
}

type ValidResult = Extract<ReturnType<typeof calculate>, { valid: true }>;

export default function PublicCompoundInterestCalculator() {
  const id = React.useId();
  const [values, setValues] = React.useState(EXAMPLE);
  const [contributionFrequency, setContributionFrequency] = React.useState<ContributionFrequency>('monthly');
  const [compounding, setCompounding] = React.useState<CompoundingFrequency>('monthly');

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const result = React.useMemo(
    () => calculate(values, contributionFrequency, compounding),
    [values, contributionFrequency, compounding]
  );

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive compound interest calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Project a savings balance from a starting amount and a regular deposit, and see how
            much of the result is interest.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setValues({ ...EXAMPLE });
            setContributionFrequency('monthly');
            setCompounding('monthly');
          }}
        >
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="Your savings">
            <CalcField
              id={`${id}-start`}
              label="Starting balance (AUD)"
              min={0}
              step="1000"
              value={values.startingBalance}
              onChange={update('startingBalance')}
            />
            <div className="grid grid-cols-2 gap-3">
              <CalcField
                id={`${id}-deposit`}
                label="Regular deposit (AUD)"
                min={0}
                step="50"
                value={values.contribution}
                onChange={update('contribution')}
              />
              <div className="space-y-1.5">
                <label htmlFor={`${id}-deposit-frequency`} className="text-sm font-medium">
                  Deposit every
                </label>
                <Select
                  value={contributionFrequency}
                  onValueChange={(v) => setContributionFrequency(v as ContributionFrequency)}
                >
                  <SelectTrigger id={`${id}-deposit-frequency`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CONTRIBUTION_LABELS) as ContributionFrequency[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {CONTRIBUTION_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CalcField
                id={`${id}-rate`}
                label="Interest rate (% p.a.)"
                min={0}
                max={30}
                step="0.05"
                value={values.ratePercent}
                onChange={update('ratePercent')}
              />
              <div className="space-y-1.5">
                <label htmlFor={`${id}-compounding`} className="text-sm font-medium">
                  Compounds
                </label>
                <Select value={compounding} onValueChange={(v) => setCompounding(v as CompoundingFrequency)}>
                  <SelectTrigger id={`${id}-compounding`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(COMPOUNDING_LABELS) as CompoundingFrequency[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {COMPOUNDING_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CalcField
              id={`${id}-years`}
              label="Years to project"
              min={1}
              max={60}
              step="1"
              value={values.years}
              onChange={update('years')}
            />
            <CalcField
              id={`${id}-target`}
              label="Savings target (AUD, optional)"
              min={0}
              step="1000"
              value={values.target}
              onChange={update('target')}
              hint="Leave blank to skip. Shows how long your current deposit takes to get there."
            />
          </CalcPanel>
        }
        results={
          result.valid ? (
            <CompoundResults
              result={result}
              noun={CONTRIBUTION_NOUN[contributionFrequency]}
              compounding={compounding}
            />
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
        Estimate only. The rate stays fixed, deposits land at the end of each period, and interest
        is credited at the end of each compounding period. Figures are before tax on interest and
        in future dollars, with no allowance for inflation or fees. General information, not
        advice.
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

function CompoundResults({
  result,
  noun,
  compounding,
}: {
  result: ValidResult;
  noun: string;
  compounding: CompoundingFrequency;
}) {
  const goalAmount = result.target > 0 ? result.target : result.finalBalance;
  const interestShare = result.finalBalance > 0 ? (result.totalInterest / result.finalBalance) * 100 : 0;

  let targetMessage: string | null = null;
  if (result.target > 0) {
    if (result.monthsToTarget === 0) {
      targetMessage = `Your starting balance already covers the ${money(result.target)} target.`;
    } else if (result.monthsToTarget === null) {
      targetMessage = `At ${money(result.contribution)} a ${noun}, the balance does not reach ${money(result.target)} within ${MAX_TARGET_YEARS} years.`;
    } else {
      targetMessage = `At ${money(result.contribution)} a ${noun}, you reach ${money(result.target)} in ${formatMonths(result.monthsToTarget)}.`;
    }
  }

  return (
    <>
      <div className="rounded-xl border border-primary/40 bg-primary/5 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Balance after {result.years} {result.years === 1 ? 'year' : 'years'}
        </p>
        <p className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
          <CountUp
            key={Math.round(result.finalBalance)}
            to={Math.round(result.finalBalance)}
            prefix="$"
            separator=","
            duration={1.2}
            trigger="view"
          />
        </p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="compound-final-balance">
          {money(result.finalBalance)}, of which {money(result.totalInterest)} is interest (
          {interestShare.toFixed(0)}%).
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <ResultStat
          label="Starting balance"
          value={money(result.startingBalance)}
          testId="compound-starting"
        />
        <ResultStat
          label="Your deposits"
          value={money(result.totalContributions)}
          sub={`${money(result.contribution)} a ${noun}`}
          testId="compound-contributions"
        />
        <ResultStat
          label="Interest earned"
          value={money(result.totalInterest)}
          sub={`Compounding ${COMPOUNDING_LABELS[compounding].toLowerCase()} at ${result.ratePercent}%`}
          testId="compound-interest-earned"
          emphasize
        />
      </div>

      {targetMessage && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Savings target</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <p data-testid="compound-time-to-target">{targetMessage}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Growth by year</CardTitle>
        </CardHeader>
        <CardContent>
          <figure>
            <GrowthChart rows={result.rows} target={result.target} />
            <figcaption className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
              <span>
                <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-5 rounded-sm bg-primary/30 align-middle" />
                Interest earned
              </span>
              <span>
                <span aria-hidden="true" className="mr-2 inline-block h-2.5 w-5 rounded-sm bg-muted-foreground/30 align-middle" />
                Starting balance and deposits
              </span>
              {result.target > 0 && (
                <span>
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block w-5 border-t-2 border-dashed border-foreground/60 align-middle"
                  />
                  Target
                </span>
              )}
            </figcaption>
          </figure>
        </CardContent>
      </Card>

      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer py-1 font-medium">Year-by-year breakdown</summary>
        <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Compound interest table">
          <table className="w-full min-w-[520px] text-right text-sm tabular-nums">
            <caption className="mb-3 text-left text-xs text-muted-foreground">
              AUD, rounded to whole dollars. Year 0 is your starting balance.
            </caption>
            <thead>
              <tr className="border-b">
                <th scope="col" className="p-2 text-left">Year</th>
                <th scope="col" className="p-2">Deposits</th>
                <th scope="col" className="p-2">Interest</th>
                <th scope="col" className="p-2">Total interest</th>
                <th scope="col" className="p-2">Balance</th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.year} className="border-b last:border-0">
                  <th scope="row" className="p-2 text-left font-medium">{row.year}</th>
                  <td className="p-2">{money(row.contributions)}</td>
                  <td className="p-2">{money(row.interest)}</td>
                  <td className="p-2">{money(row.totalInterest)}</td>
                  <td className="p-2 font-medium">{money(row.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <CalculatorHandoffCta
          tool="compound-interest"
          title="Compound Interest Calculator"
          summary={
            result.target > 0
              ? `Save ${money(result.target)}: ${money(result.contribution)} a ${noun} at ${result.ratePercent}%${result.monthsToTarget ? `, about ${formatMonths(result.monthsToTarget)}` : ''}`
              : `${money(result.finalBalance)} after ${result.years} yrs: ${money(result.contribution)} a ${noun} at ${result.ratePercent}%`
          }
          metrics={[
            { label: 'Final balance', value: money(result.finalBalance) },
            { label: 'Deposits', value: money(result.totalContributions) },
            { label: 'Interest', value: money(result.totalInterest) },
            ...(result.target > 0 && result.monthsToTarget !== null
              ? [{ label: 'Time to target', value: formatMonths(result.monthsToTarget) }]
              : []),
          ]}
          fields={{
            goalAmount: Math.round(goalAmount),
            startingBalance: result.startingBalance,
            contribution: result.contribution,
            annualRatePercent: result.ratePercent,
            years: result.years,
            finalBalance: Math.round(result.finalBalance),
            ...(result.target > 0 ? { target: result.target } : {}),
            ...(result.monthsToTarget !== null ? { monthsToTarget: result.monthsToTarget } : {}),
          }}
          targetPath="/personal/goals/"
          label="Create a savings goal in PFinance"
        />
        <p className="text-xs text-muted-foreground">
          Uses your target, or the projected balance if you did not set one.
        </p>
      </div>
    </>
  );
}

function GrowthChart({ rows, target }: { rows: CompoundYearRow[]; target: number }) {
  const width = 560;
  const height = 220;
  const margin = { top: 10, right: 12, bottom: 28, left: 64 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const maxX = Math.max(1, rows[rows.length - 1].year);
  const maxBalance = Math.max(1, ...rows.map((row) => row.balance));
  // Only stretch the axis to the target when it is within reach of the chart.
  const showTarget = target > 0 && target <= maxBalance * 1.5;
  const x = scaleLinear({ domain: [0, maxX], range: [0, innerW] });
  const y = scaleLinear({ domain: [0, showTarget ? Math.max(maxBalance, target) : maxBalance], range: [innerH, 0], nice: true });
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label="Balance at the end of each year, split into money deposited and interest earned. Exact values are in the year-by-year table."
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        <Area
          data={rows}
          x={(d) => x(d.year)}
          y0={(d) => y(d.totalDeposited)}
          y1={(d) => y(d.balance)}
          className="fill-primary/30"
        />
        <AreaClosed
          data={rows}
          x={(d) => x(d.year)}
          y={(d) => y(d.totalDeposited)}
          yScale={y}
          className="fill-muted-foreground/30"
        />
        <LinePath data={rows} x={(d) => x(d.year)} y={(d) => y(d.balance)} strokeWidth={2} className="stroke-primary" />
        {showTarget && (
          <line
            x1={0}
            x2={innerW}
            y1={y(target)}
            y2={y(target)}
            strokeWidth={1.5}
            strokeDasharray="5 4"
            className="stroke-foreground/60"
          />
        )}
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
