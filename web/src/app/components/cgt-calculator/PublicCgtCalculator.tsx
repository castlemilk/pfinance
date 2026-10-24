'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CountUp } from '@/components/gamma/CountUp';
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { getAustralianBrackets } from '@/app/constants/taxSystems';

const EXAMPLE = {
  purchaseCost: '420000',
  salePrice: '560000',
  holdingMonths: '30',
  taxableIncome: '95000',
};

const money = (value: number) =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);

// Marginal rate on the next dollar of taxable income (incl. 2% Medicare levy).
function marginalRate(taxableIncome: number): number {
  const brackets = getAustralianBrackets();
  const bracket = [...brackets].reverse().find((b) => taxableIncome > b.min) ?? brackets[0];
  return bracket.rate + 2;
}

export default function PublicCgtCalculator() {
  const id = useId();
  const [values, setValues] = useState(EXAMPLE);

  const calculation = useMemo(() => {
    const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
    const purchaseCost = num(values.purchaseCost);
    const salePrice = num(values.salePrice);
    const holdingMonths = num(values.holdingMonths);
    const taxableIncome = num(values.taxableIncome);

    if (!Number.isFinite(purchaseCost) || purchaseCost < 0 || purchaseCost > 100_000_000) {
      return { valid: false as const, error: 'Enter a cost base between $0 and $100,000,000.' };
    }
    if (!Number.isFinite(salePrice) || salePrice < 0 || salePrice > 100_000_000) {
      return { valid: false as const, error: 'Enter a sale price between $0 and $100,000,000.' };
    }
    if (!Number.isFinite(holdingMonths) || holdingMonths < 0 || holdingMonths > 1200) {
      return { valid: false as const, error: 'Enter months held between 0 and 1,200.' };
    }
    if (!Number.isFinite(taxableIncome) || taxableIncome < 0 || taxableIncome > 10_000_000) {
      return { valid: false as const, error: 'Enter taxable income between $0 and $10,000,000.' };
    }

    const grossGain = salePrice - purchaseCost;
    const isLoss = grossGain < 0;
    const discountEligible = !isLoss && holdingMonths >= 12;
    const discountPercent = discountEligible ? 50 : 0;
    const taxableGain = Math.max(0, grossGain * (1 - discountPercent / 100));
    const rate = marginalRate(taxableIncome + taxableGain);
    const estimatedCgt = taxableGain * (rate / 100);
    const effectiveRate = grossGain > 0 ? (estimatedCgt / grossGain) * 100 : 0;

    return {
      valid: true as const,
      grossGain,
      isLoss,
      discountEligible,
      discountPercent,
      taxableGain,
      rate,
      estimatedCgt,
      effectiveRate,
    };
  }, [values]);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive capital gains tax calculator
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Estimate the CGT on an asset sale for an Australian individual — including the 50%
            discount once you have held it 12 months or more.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="The asset">
            <CalcField
              id={`${id}-cost`}
              label="Cost base (AUD)"
              hint="Purchase price plus buying and selling costs."
              min={0}
              step="1000"
              value={values.purchaseCost}
              onChange={update('purchaseCost')}
            />
            <CalcField
              id={`${id}-sale`}
              label="Sale price (AUD)"
              min={0}
              step="1000"
              value={values.salePrice}
              onChange={update('salePrice')}
            />
            <div className="grid grid-cols-2 gap-3">
              <CalcField
                id={`${id}-months`}
                label="Months held"
                min={0}
                value={values.holdingMonths}
                onChange={update('holdingMonths')}
              />
              <CalcField
                id={`${id}-income`}
                label="Your taxable income"
                hint="The gain stacks on top of this."
                min={0}
                step="1000"
                value={values.taxableIncome}
                onChange={update('taxableIncome')}
              />
            </div>
          </CalcPanel>
        }
        results={
          <>
          {calculation.valid ? (
            calculation.isLoss ? (
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <Badge variant="default">Capital loss</Badge>
                  <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl" data-testid="cgt-loss">
                    {money(-calculation.grossGain)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    A capital loss cannot offset ordinary income — but it carries forward to reduce
                    future capital gains.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card className="border-primary/40 bg-primary/5">
                  <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="default">
                        Estimated CGT{calculation.discountEligible ? ' — 50% discount applied' : ''}
                      </Badge>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        ~{calculation.effectiveRate.toFixed(1)}% of the gain
                      </span>
                    </div>
                    <p className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                      <span data-testid="cgt-estimated">
                        <CountUp
                          to={calculation.estimatedCgt}
                          prefix="$"
                          separator=","
                          duration={1.2}
                          trigger="view"
                        />
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {money(calculation.grossGain)} gain → {money(calculation.taxableGain)} taxable
                      at ~{calculation.rate}% marginal (incl. Medicare levy)
                    </p>
                  </CardContent>
                </Card>

                <div className="grid gap-4 sm:grid-cols-3">
                  <ResultStat label="Gross gain" value={money(calculation.grossGain)} testId="cgt-gross" />
                  <ResultStat
                    label="CGT discount"
                    value={`${calculation.discountPercent}% (−${money(calculation.grossGain - calculation.taxableGain)})`}
                    testId="cgt-discount"
                  />
                  <ResultStat label="Taxable gain" value={money(calculation.taxableGain)} testId="cgt-taxable" />
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Timing matters</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    Crossing the 12-month line halves the taxable amount for individuals and trusts
                    (companies and foreign residents get no discount). And because the gain is taxed
                    at your marginal rate, selling in a low-income year — parental leave, a sabbatical,
                    the first retirement year — can cut the bill again.
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center gap-3">
                  <CalculatorHandoffCta
                    tool="cgt"
                    title="CGT Calculator"
                    summary={`${money(calculation.grossGain)} gain, ${money(calculation.estimatedCgt)} estimated CGT at ~${calculation.rate}% marginal`}
                    metrics={[
                      { label: 'Gross gain', value: money(calculation.grossGain) },
                      { label: 'Taxable gain', value: money(calculation.taxableGain) },
                      { label: 'Estimated CGT', value: money(calculation.estimatedCgt) },
                    ]}
                    fields={{
                      purchaseCost: Number(values.purchaseCost),
                      salePrice: Number(values.salePrice),
                      holdingMonths: Number(values.holdingMonths),
                      taxableGain: Math.round(calculation.taxableGain),
                      estimatedCgt: Math.round(calculation.estimatedCgt),
                    }}
                    targetPath="/personal/expenses/"
                    label="Log the sale in PFinance"
                  />
                  <p className="text-xs text-muted-foreground">
                    Individual taxpayer estimate only — main residence, small-business concessions,
                    and carried-forward losses can change the result.
                  </p>
                </div>
              </>
            )
          ) : (
            <Card>
              <CardContent className="py-10">
                <p role="status" className="font-medium text-destructive">{calculation.error}</p>
              </CardContent>
            </Card>
          )}
          </>
        }
      />
    </section>
  );
}
