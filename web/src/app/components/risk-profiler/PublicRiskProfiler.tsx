'use client';

import { useId, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GuidedSteps, type GuidedStep } from '@/components/gamma/GuidedSteps';
import { SegmentedMeter } from '@/components/gamma/SegmentedMeter';
import CalculatorHandoffCta from '../calculator-handoff/CalculatorHandoffCta';

// Each answer value carries a 1–4 risk score.
const QUESTIONS: GuidedStep[] = [
  {
    id: 'horizon',
    title: 'When will you need the money?',
    description: 'The longer the horizon, the more volatility a portfolio can absorb.',
    choices: [
      { value: '1', label: 'Within 3 years', detail: 'Short goals — capital stability matters most.' },
      { value: '2', label: '3–5 years', detail: 'Some room to ride out a downturn.' },
      { value: '3', label: '5–10 years', detail: 'Time for a growth-tilted mix.' },
      { value: '4', label: '10+ years', detail: 'Decades to compound through cycles.' },
    ],
  },
  {
    id: 'reaction',
    title: 'Your portfolio drops 20% in a month. You…',
    description: 'The honest answer here, not the aspirational one.',
    choices: [
      { value: '1', label: 'Sell everything', detail: 'Losing money keeps me up at night.' },
      { value: '2', label: 'Sell some to sleep at night', detail: 'I would trim the position.' },
      { value: '3', label: 'Hold and wait it out', detail: 'Markets recover; I would not act.' },
      { value: '4', label: 'Buy more', detail: 'A 20% discount is an opportunity.' },
    ],
  },
  {
    id: 'income',
    title: 'How stable is your household income?',
    description: 'Volatile income lowers how much portfolio risk is sensible.',
    choices: [
      { value: '1', label: 'Variable or uncertain', detail: 'Contract, casual, or commission-heavy.' },
      { value: '2', label: 'Stable', detail: 'Regular salary or wages.' },
      { value: '4', label: 'Very stable with buffer', detail: 'Dual income or months of buffer saved.' },
    ],
  },
  {
    id: 'goal',
    title: 'What is the money for?',
    description: 'Preservation and growth pull the allocation in opposite directions.',
    choices: [
      { value: '1', label: 'Protect what I have', detail: 'Avoid losses first, returns second.' },
      { value: '2', label: 'Steady income + modest growth', detail: 'Reliable returns with some upside.' },
      { value: '3', label: 'Grow meaningfully', detail: 'Comfortable with swings for better returns.' },
      { value: '4', label: 'Maximise long-run growth', detail: 'Accept deep drawdowns for the best outcome.' },
    ],
  },
  {
    id: 'experience',
    title: 'How much investing have you done?',
    description: 'First downturns hit harder than expected — experience calibrates the answers above.',
    choices: [
      { value: '1', label: 'None yet', detail: 'Savings accounts and super only.' },
      { value: '2', label: 'Some', detail: 'Shares, ETFs, or super choice options.' },
      { value: '3', label: 'Experienced', detail: 'Held investments through a market fall.' },
    ],
  },
];

const PROFILES = [
  {
    max: 8,
    name: 'Conservative',
    growth: 25,
    blurb: 'Capital stability first. Typical mixes hold ~75% in defensive assets (cash, bonds, fixed interest) with a small growth sleeve for inflation protection.',
  },
  {
    max: 12,
    name: 'Balanced',
    growth: 50,
    blurb: 'Roughly even split between growth and defensive assets. Accepts moderate swings for returns that outpace inflation over time.',
  },
  {
    max: 16,
    name: 'Growth',
    growth: 70,
    blurb: 'Growth-tilted mix (~70% shares and property). Expect regular negative years in exchange for stronger long-run compounding.',
  },
  {
    max: 20,
    name: 'High growth',
    growth: 90,
    blurb: 'Almost all growth assets. Deep drawdowns are the price of admission — suits long horizons and steady nerves.',
  },
] as const;

export default function PublicRiskProfiler() {
  const id = useId();
  const [answers, setAnswers] = useState<Record<string, string> | null>(null);

  const result = useMemo(() => {
    if (!answers) return null;
    const score = QUESTIONS.reduce((sum, q) => sum + Number(answers[q.id] ?? 0), 0);
    const profile = PROFILES.find((p) => score <= p.max) ?? PROFILES[PROFILES.length - 1];
    return { score, profile };
  }, [answers]);

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5 text-left">
      <div>
        <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-tight">
          Interactive risk profile quiz
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Five questions on horizon, reactions, income stability, goals, and experience — the same
          fact-find a planner runs before suggesting an asset mix.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(320px,1fr)_minmax(0,2fr)]">
        <div className="flex justify-center lg:justify-start">
          <GuidedSteps
            steps={QUESTIONS}
            progressLabel="Risk profile"
            completeTitle="Your profile is ready."
            completeBody="Your suggested mix is on the right. Start again any time to change an answer."
            onComplete={setAnswers}
          />
        </div>

        <div className="min-w-0 space-y-5">
          {result ? (
            <>
              <Card className="border-primary/40 bg-primary/5">
                <CardContent className="pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge variant="default" data-testid="risk-profile-name">{result.profile.name}</Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      Score {result.score} / 20
                    </span>
                  </div>
                  <div className="mt-4">
                    <SegmentedMeter
                      label="Risk capacity"
                      value={result.score}
                      min={5}
                      max={20}
                      low={9}
                      high={16}
                      optimum={20}
                      segments={15}
                      formatValue={(v) => `${Math.round(v)} / 20`}
                      description="Higher scores support a larger growth allocation."
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Suggested asset mix — {result.profile.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <p className="text-muted-foreground">{result.profile.blurb}</p>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Growth assets (shares, property)</span>
                      <span data-testid="risk-growth-share" className="tabular-nums">{result.profile.growth}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${result.profile.growth}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>Defensive assets (cash, bonds)</span>
                      <span className="tabular-nums">{100 - result.profile.growth}%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-chart-2 transition-all"
                        style={{ width: `${100 - result.profile.growth}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A starting allocation, not a portfolio. Real mixes also weigh tax position,
                    existing super option, and concentration in your employer or home.
                  </p>
                </CardContent>
              </Card>

              <div className="flex flex-wrap items-center gap-3">
                <CalculatorHandoffCta
                  tool="risk-profile"
                  title="Investment Risk Profiler"
                  summary={`${result.profile.name} profile (${result.score}/20) — suggested mix ~${result.profile.growth}% growth / ${100 - result.profile.growth}% defensive`}
                  metrics={[
                    { label: 'Risk score', value: `${result.score}/20` },
                    { label: 'Profile', value: result.profile.name },
                    { label: 'Growth share', value: `${result.profile.growth}%` },
                  ]}
                  fields={{
                    riskScore: result.score,
                    profile: result.profile.name,
                    growthShare: result.profile.growth,
                  }}
                  targetPath="/personal/goals/"
                  label="Set an investing goal in PFinance"
                />
                <p className="text-xs text-muted-foreground">
                  General information only — not personal financial advice. A licensed adviser weighs
                  your full situation before recommending an allocation.
                </p>
              </div>
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex min-h-[280px] flex-col items-center justify-center py-10 text-center">
                <p className="font-medium text-muted-foreground">Answer the five questions</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Your risk capacity score and a suggested growth/defensive split appear here the
                  moment you finish.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
