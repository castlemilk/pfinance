'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';
import { SegmentedMeter } from '@/components/gamma/SegmentedMeter';
import { CalcField, CalcLayout, CalcPanel, ResultStat } from '@/app/components/calculator-ui';

const EXAMPLE = { salary: '110000', sgRate: '12', sacrifice: '5000', personalDeductible: '0', ncc: '0', tsb: '450000' };

// 2025–26 settings.
const CC_CAP = 30_000;
const NCC_CAP = 120_000;
const DIV293_THRESHOLD = 250_000;
const CARRY_FORWARD_TSB = 500_000;
// Bring-forward availability by total super balance at 30 Jun 2025 (general TBC $2m).
const BF_BANDS = [
  { under: 1_760_000, cap: 360_000, label: 'Full 3-year bring-forward ($360k)' },
  { under: 1_880_000, cap: 240_000, label: '2-year bring-forward ($240k)' },
  { under: 2_000_000, cap: 120_000, label: 'Annual cap only ($120k)' },
  { under: Infinity, cap: 0, label: 'Nil — TSB at/above the $2m general TBC' },
] as const;

const money = (n: number) =>
  n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });

export default function PublicSuperCapsChecker() {
  const id = React.useId();
  const [values, setValues] = React.useState(EXAMPLE);

  const update = (key: keyof typeof EXAMPLE) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((p) => ({ ...p, [key]: e.target.value }));

  const result = React.useMemo(() => {
    const num = (k: keyof typeof EXAMPLE) => (values[k].trim() === '' ? NaN : Number(values[k]));
    const salary = num('salary');
    const sgRate = num('sgRate');
    const sacrifice = num('sacrifice');
    const personal = num('personalDeductible');
    const ncc = num('ncc');
    const tsb = num('tsb');

    for (const [v, msg] of [
      [salary, 'salary'],
      [sgRate, 'SG rate'],
      [sacrifice, 'salary sacrifice'],
      [personal, 'personal deductible'],
      [ncc, 'non-concessional'],
      [tsb, 'total super balance'],
    ] as const) {
      if (!Number.isFinite(v) || v < 0)
        return { valid: false as const, error: `Enter a ${msg} of $0 or more.` };
    }
    if (sgRate > 30) return { valid: false as const, error: 'SG rate is a percentage — usually 12%.' };

    const sg = salary * (sgRate / 100);
    const totalCC = sg + sacrifice + personal;
    const ccHeadroom = CC_CAP - totalCC;
    const ccPct = Math.min(100, (totalCC / CC_CAP) * 100);

    const bf = BF_BANDS.find((b) => tsb < b.under)!;
    const nccRoom = Math.min(NCC_CAP, Math.max(0, bf.cap)) - Math.min(ncc, NCC_CAP);
    const nccExcess = Math.max(0, ncc - bf.cap);
    const carryForwardEligible = tsb < CARRY_FORWARD_TSB;

    const div293Income = salary + sacrifice; // income + concessional contributions
    const div293Applies = div293Income > DIV293_THRESHOLD;
    const div293Tax = div293Applies
      ? Math.min(totalCC, div293Income - DIV293_THRESHOLD) * 0.15
      : 0;

    return { valid: true as const, sg, totalCC, ccHeadroom, ccPct, bf, nccRoom, nccExcess, carryForwardEligible, div293Applies, div293Tax };
  }, [values]);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
            Interactive contribution cap checker
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Check concessional and non-concessional headroom, bring-forward eligibility, and the
            Division&nbsp;293 flag — 2025&ndash;26 settings.
          </p>
        </div>
        <Button variant="outline" onClick={() => setValues({ ...EXAMPLE })}>
          Reset example
        </Button>
      </div>

      <CalcLayout
        inputs={
          <CalcPanel title="Your contributions this year">
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-salary`} label="Salary + bonuses (AUD)" min={0} step="1000" value={values.salary} onChange={update('salary')} />
              <CalcField id={`${id}-sg`} label="Employer SG (%)" min={0} max={30} step="0.5" value={values.sgRate} onChange={update('sgRate')} hint="12% from 1 Jul 2025." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CalcField id={`${id}-sacrifice`} label="Salary sacrifice (AUD/yr)" min={0} step="500" value={values.sacrifice} onChange={update('sacrifice')} />
              <CalcField id={`${id}-personal`} label="Personal deductible (AUD/yr)" min={0} step="500" value={values.personalDeductible} onChange={update('personalDeductible')} />
            </div>
            <CalcField
              id={`${id}-ncc`}
              label="Non-concessional planned (AUD)"
              min={0}
              step="1000"
              value={values.ncc}
              onChange={update('ncc')}
              hint="After-tax contributions this financial year."
            />
            <CalcField
              id={`${id}-tsb`}
              label="Total super balance at last 30 June (AUD)"
              min={0}
              step="10000"
              value={values.tsb}
              onChange={update('tsb')}
              hint="Drives NCC eligibility — find it in myGov."
            />
          </CalcPanel>
        }
        results={
          result.valid ? (
            <>
              <SegmentedMeter
                label="Concessional cap used"
                description={`${money(result.totalCC)} of the ${money(CC_CAP)} cap`}
                value={result.ccPct}
                min={0}
                max={100}
                low={80}
                high={95}
                optimum={100}
                segments={15}
                formatValue={(v) => `${Math.round(v)}%`}
              />
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ResultStat
                  label="Concessional headroom"
                  value={result.ccHeadroom >= 0 ? money(result.ccHeadroom) : `−${money(-result.ccHeadroom)}`}
                  sub={result.ccHeadroom >= 0 ? 'Room before the $30k cap' : 'Excess — taxed at marginal rate'}
                  testId="caps-cc-headroom"
                />
                <ResultStat
                  label="NCC room (annual)"
                  value={money(Math.max(0, result.nccRoom))}
                  sub={result.bf.label}
                  testId="caps-ncc-room"
                />
                <ResultStat
                  label="Division 293"
                  value={result.div293Applies ? `+${money(result.div293Tax)}` : 'No'}
                  sub={result.div293Applies ? 'Extra 15% on part of concessional' : 'Below the $250k threshold'}
                  testId="caps-div293"
                />
                <ResultStat
                  label="Carry-forward eligible"
                  value={result.carryForwardEligible ? 'Yes' : 'No'}
                  sub="Unused CC caps from 5 prior years (TSB < $500k)"
                  testId="caps-carry"
                />
              </div>
              {(result.ccHeadroom < 0 || result.nccExcess > 0) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Breach flags</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm text-muted-foreground">
                    {result.ccHeadroom < 0 && (
                      <p>Concessional contributions exceed the cap by {money(-result.ccHeadroom)} — the excess counts in your taxable income with a credit for the 15% already paid.</p>
                    )}
                    {result.nccExcess > 0 && (
                      <p>Planned NCCs exceed your available cap by {money(result.nccExcess)} — excess NCCs are taxed at 47% unless released.</p>
                    )}
                  </CardContent>
                </Card>
              )}
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
        2025&ndash;26 caps: $30k concessional, $120k NCC, bring-forward bands tied to the $2m
        general transfer balance cap. Unused concessional carry-forward needs TSB under $500k and
        rolls off after 5 years. If you are inside a bring-forward period already, the annual
        amounts differ. General information, not advice.
      </p>

      {result.valid && (
        <CalculatorHandoffCta
          tool="super-caps"
          title="Cap Check"
          summary={`${money(result.totalCC)} of $30k concessional used${result.ccHeadroom >= 0 ? `, ${money(result.ccHeadroom)} headroom` : `, ${money(-result.ccHeadroom)} over`}`}
          metrics={[
            { label: 'CC used', value: `${Math.round(result.ccPct)}%` },
            { label: 'Headroom', value: money(Math.max(0, result.ccHeadroom)) },
            { label: 'Div 293', value: result.div293Applies ? money(result.div293Tax) : 'No' },
          ]}
          fields={{ annualConcessional: Math.round(result.totalCC) }}
          targetPath="/personal/goals/"
          label="Set a contributions goal"
        />
      )}
    </section>
  );
}
