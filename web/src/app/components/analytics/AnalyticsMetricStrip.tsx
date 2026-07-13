export type AnalyticsMetricTone =
  | 'positive'
  | 'negative'
  | 'neutral'
  | 'attention';

export type AnalyticsMetricItem = Readonly<{
  label: string;
  value: string;
  detail: string;
  tone: AnalyticsMetricTone;
}>;

export type AnalyticsMetricTuple = readonly [
  AnalyticsMetricItem,
  AnalyticsMetricItem,
  AnalyticsMetricItem,
  AnalyticsMetricItem,
];

type AnalyticsMetricStripProps = Readonly<{
  metrics: AnalyticsMetricTuple;
}>;

const TONE_STYLES: Readonly<
  Record<AnalyticsMetricTone, { label: string; accentClassName: string }>
> = Object.freeze({
  positive: { label: 'Positive', accentClassName: 'bg-chart-2' },
  negative: { label: 'Negative', accentClassName: 'bg-destructive' },
  neutral: { label: 'Neutral', accentClassName: 'bg-muted-foreground' },
  attention: { label: 'Needs attention', accentClassName: 'bg-chart-1' },
});

export function AnalyticsMetricStrip({ metrics }: AnalyticsMetricStripProps) {
  return (
    <section
      aria-label="Current period summary"
      data-testid="analytics-metric-strip"
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
    >
      <dl className="grid grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric, index) => {
          const tone = TONE_STYLES[metric.tone];
          return (
            <div
              key={metric.label}
              data-testid="analytics-metric"
              data-tone={metric.tone}
              className={`min-w-0 px-4 py-5 sm:px-5 ${
                index % 2 === 1 ? 'border-l border-border' : ''
              } ${index >= 2 ? 'border-t border-border lg:border-t-0' : ''} ${
                index === 2 ? 'lg:border-l' : ''
              }`}
            >
              <dt className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span
                  aria-hidden="true"
                  data-testid="analytics-metric-tone-accent"
                  className={`h-3 w-1 rounded-full ${tone.accentClassName}`}
                />
                <span>{metric.label}</span>
              </dt>
              <dd
                data-testid="analytics-metric-value"
                className="mt-2 break-words font-mono text-xl font-semibold leading-tight tabular-nums text-foreground [overflow-wrap:anywhere] sm:text-2xl"
              >
                <span className="sr-only">{tone.label}: </span>
                {metric.value}
              </dd>
              <dd className="mt-1 text-pretty font-mono text-xs leading-relaxed tabular-nums text-muted-foreground">
                {metric.detail}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
