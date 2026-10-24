import { useId, type CSSProperties, type MeterHTMLAttributes } from "react";

export type SegmentedMeterProps = Omit<
  MeterHTMLAttributes<HTMLMeterElement>,
  "value" | "min" | "max" | "low" | "high" | "optimum" | "children"
> & {
  label: string;
  value: number;
  description?: string;
  min?: number;
  max?: number;
  low?: number;
  high?: number;
  optimum?: number;
  segments?: number;
  formatValue?: (value: number) => string;
};

/** A bounded measurement backed by a native meter, with readable threshold feedback. */
export function SegmentedMeter({
  label,
  value,
  description,
  min = 0,
  max = 100,
  low,
  high,
  optimum,
  segments = 10,
  formatValue = String,
  id,
  className = "",
  ...meterProps
}: SegmentedMeterProps) {
  const generatedId = useId();
  const meterId = id ?? generatedId;
  const lower = Number.isFinite(min) ? min : 0;
  const upper = Math.max(
    lower + Number.EPSILON,
    Number.isFinite(max) && max > lower ? max : lower + 100,
  );
  const clamp = (amount: number) => Math.max(lower, Math.min(upper, amount));
  const selected = clamp(Number.isFinite(value) ? value : lower);
  const lowerThreshold = clamp(
    low !== undefined && Number.isFinite(low)
      ? low
      : lower + (upper - lower) / 3,
  );
  const upperThreshold = Math.max(
    lowerThreshold,
    clamp(
      high !== undefined && Number.isFinite(high)
        ? high
        : lower + ((upper - lower) * 2) / 3,
    ),
  );
  const ideal = clamp(
    optimum !== undefined && Number.isFinite(optimum) ? optimum : upper,
  );
  const count = Number.isFinite(segments)
    ? Math.max(1, Math.min(40, Math.floor(segments)))
    : 10;
  const fraction = (selected - lower) / (upper - lower);
  const tone =
    ideal < lowerThreshold
      ? selected <= lowerThreshold
        ? "success"
        : selected >= upperThreshold
          ? "danger"
          : "warning"
      : ideal > upperThreshold
        ? selected >= upperThreshold
          ? "success"
          : selected <= lowerThreshold
            ? "danger"
            : "warning"
        : selected >= lowerThreshold && selected <= upperThreshold
          ? "success"
          : "warning";
  const quality =
    tone === "success"
      ? "In the preferred range"
      : tone === "danger"
        ? "Outside the preferred range"
        : "Near the preferred range";
  const descriptionId = `${meterId}-description`;

  return (
    <div className={`segmented-meter ${className}`} data-tone={tone}>
      <div className="segmented-meter-heading">
        <label htmlFor={meterId}>{label}</label>
        <strong>{formatValue(selected)}</strong>
      </div>
      <meter
        {...meterProps}
        id={meterId}
        className="segmented-meter-native"
        value={selected}
        min={lower}
        max={upper}
        low={lowerThreshold}
        high={upperThreshold}
        optimum={ideal}
        aria-valuetext={formatValue(selected)}
        aria-describedby={[meterProps["aria-describedby"], descriptionId]
          .filter(Boolean)
          .join(" ")}
      >
        {formatValue(selected)}
      </meter>
      <div className="segmented-meter-segments" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <span key={index}>
            <i
              style={
                {
                  "--meter-part": `${Math.max(0, Math.min(1, fraction * count - index)) * 100}%`,
                } as CSSProperties
              }
            />
          </span>
        ))}
      </div>
      <p className="segmented-meter-description" id={descriptionId}>
        <span>{quality}.</span>
        {description && <> {description}</>}
      </p>
    </div>
  );
}
