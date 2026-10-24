"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export type CountUpEasing = "easeOut" | "linear" | "expo" | "spring";
export type CountUpMode = "count" | "roll";
export type CountUpFormat = "standard" | "compact";
export type CountUpTrigger = "view" | "load";

export interface CountUpProps {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  className?: string;
  style?: CSSProperties;
  startWhen?: boolean;
  separator?: string;
  prefix?: string;
  suffix?: string;
  mode?: CountUpMode;
  easing?: CountUpEasing;
  decimals?: number;
  format?: CountUpFormat;
  trigger?: CountUpTrigger;
  replayOnHover?: boolean;
  onStart?: () => void;
  onEnd?: () => void;
}

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/* Original easing curves in the spirit of the reference presets. */
const EASINGS: Record<CountUpEasing, (t: number) => number> = {
  linear: (t) => t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  expo: (t) =>
    t >= 1 ? 1 : (1 - Math.pow(2, -10 * t)) / (1 - Math.pow(2, -10)),
  spring: springEase(0.06),
};

function springEase(mass: number) {
  const stiffness = 1 / Math.max(0.001, mass);
  const omega = Math.sqrt(stiffness);
  const zeta = 0.72;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const under = 1 - zeta * zeta;
    const wd = omega * Math.sqrt(Math.max(0.0001, under));
    const phi = Math.atan2(wd, zeta * omega);
    return (
      1 - (Math.exp(-zeta * omega * t) * Math.sin(wd * t + phi)) / Math.sin(phi)
    );
  };
}

const COMPACT_STEPS: Array<[number, string]> = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

const getDecimalPlaces = (num: number): number => {
  const str = num.toString();
  if (str.includes(".")) {
    const decimals = str.split(".")[1];
    if (parseInt(decimals, 10) !== 0) return decimals.length;
  }
  return 0;
};

function scaleFor(
  value: number,
  compact: boolean,
  decimals: number | undefined,
  places: number,
) {
  const abs = Math.abs(value);
  let size = 1;
  let label = "";
  if (compact) {
    for (const [threshold, tag] of COMPACT_STEPS) {
      if (abs >= threshold) {
        size = threshold;
        label = tag;
        break;
      }
    }
  }
  const digits = decimals ?? (label ? (abs / size < 100 ? 1 : 0) : places);
  return { size, label, digits };
}

function splitNumber(value: number, digits: number, size: number) {
  const scaled = value / size;
  const fixed = Math.abs(scaled).toFixed(digits);
  const [int, frac] = fixed.split(".");
  return {
    negative: scaled < 0 || Object.is(scaled, -0),
    int,
    frac: digits > 0 ? frac : "",
  };
}

const group = (int: string, separator: string) =>
  separator ? int.replace(/\B(?=(\d{3})+(?!\d))/g, separator) : int;

const mod10 = (n: number) => ((n % 10) + 10) % 10;

interface RollColumn {
  slot: number;
  place: number;
  from: number;
  to: number;
  delta: number;
  enter: boolean;
  leave: boolean;
}

type RollSlot = { char: string; follow?: number } | { column: RollColumn };

/**
 * Build the odometer layout: one column per digit place (integer and
 * fractional), with separators and the decimal point threaded between them.
 * Each column's delta includes full turns scaled by its rank so the high
 * places spin less than the low ones.
 */
function buildRoll(
  a: number,
  b: number,
  spin: boolean,
  options: {
    compact: boolean;
    decimals?: number;
    places: number;
    separator: string;
  },
) {
  const { compact, decimals, places, separator } = options;
  const { size } = scaleFor(b, compact, decimals, places);
  const pa = splitNumber(a, places, size);
  const pb = splitNumber(b, places, size);
  const intLen = Math.max(
    pa.int.replace(/^-/, "").length,
    pb.int.replace(/^-/, "").length,
  );
  const fracLen = Math.max(pa.frac.length, pb.frac.length);
  const length = intLen + fracLen;

  const slots: RollSlot[] = [];
  const columns: RollColumn[] = [];
  if (pb.negative || pa.negative) slots.push({ char: "-" });

  const digitAt = (
    parts: { int: string; frac: string },
    place: number,
  ): number | null => {
    if (place >= 0) {
      const index = parts.int.length - 1 - place;
      return index >= 0 ? Number(parts.int[index]) : null;
    }
    const index = -place - 1;
    return index < parts.frac.length ? Number(parts.frac[index]) : null;
  };

  for (let place = length - 1; place >= -fracLen; place--) {
    if (place === -1) slots.push({ char: "." });
    const start = digitAt(pa, place);
    const end = digitAt(pb, place);
    const column: RollColumn = {
      slot: slots.length,
      place,
      from: start ?? 0,
      to: end ?? 0,
      delta: 0,
      enter: start === null,
      leave: end === null,
    };
    slots.push({ column });
    columns.push(column);
    if (separator && place > 0 && place % 3 === 0) {
      slots.push({ char: separator, follow: columns.length - 1 });
    }
  }

  const up = spin || b >= a;
  columns.forEach((column, index) => {
    const rank = columns.length - 1 - index;
    const base = up
      ? mod10(column.to - column.from)
      : -mod10(column.from - column.to);
    const turns = spin
      ? Math.max(1, 3 - rank)
      : Math.min(
          Math.floor(Math.abs(b - a) / (size * 10 ** (column.place + 1))),
          Math.max(0, 3 - rank),
        );
    column.delta = base + (up ? 10 : -10) * turns;
  });

  return { slots, columns };
}

export function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 2,
  className = "",
  style,
  startWhen = true,
  separator = "",
  prefix = "",
  suffix = "",
  mode = "count",
  easing = "easeOut",
  decimals,
  format = "standard",
  trigger = "view",
  replayOnHover = false,
  onStart,
  onEnd,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const slotRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const startValue = direction === "down" ? to : from;
  const endValue = direction === "down" ? from : to;
  const valueRef = useRef(startValue);
  const runningRef = useRef(false);
  const [play, setPlay] = useState({
    id: 0,
    from: startValue,
    to: endValue,
  });
  const [inView, setInView] = useState(trigger === "load");
  const compact = format === "compact";
  const places =
    decimals ?? Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

  const formatValue = useCallback(
    (latest: number) => {
      const { size, label, digits } = scaleFor(
        latest,
        compact,
        decimals,
        places,
      );
      const parts = splitNumber(latest, digits, size);
      const body = `${parts.negative ? "-" : ""}${group(parts.int, separator)}${
        parts.frac ? `.${parts.frac}` : ""
      }`;
      return `${prefix}${body}${label}${suffix}`;
    },
    [compact, decimals, places, separator, prefix, suffix],
  );

  const model = useMemo(() => {
    if (mode !== "roll") return null;
    return buildRoll(play.from, play.to, false, {
      compact,
      decimals,
      places,
      separator,
    });
  }, [mode, play, compact, decimals, places, separator]);

  // view trigger
  useEffect(() => {
    if (trigger !== "view" || !ref.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { threshold: 0.35 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [trigger]);

  // play driver
  useEffect(() => {
    if (!inView || !startWhen) return undefined;
    const ease = EASINGS[easing] ?? EASINGS.easeOut;
    const total = Math.max(0, duration);
    const started = performance.now() + delay * 1000;
    let raf = 0;
    runningRef.current = true;
    onStart?.();

    const renderCount = (t: number) => {
      if (textRef.current) {
        textRef.current.textContent = formatValue(t);
      }
    };

    const renderRoll = (elapsed: number) => {
      if (!model) return;
      const { columns } = model;
      const fontSize =
        parseFloat(getComputedStyle(ref.current as Element).fontSize) || 16;
      const cell = 1.2 * fontSize;
      const stagger =
        columns.length > 1
          ? Math.min(0.07, (total * 0.4) / (columns.length - 1))
          : 0;
      const span = Math.max(0.001, total - stagger * (columns.length - 1));
      columns.forEach((column, index) => {
        const box = slotRefs.current[column.slot];
        const strip = box?.firstElementChild as HTMLElement | null;
        if (!strip) return;
        const local = clamp01((elapsed - index * stagger) / span);
        const eased = ease(local);
        const position = column.from + column.delta * eased;
        const lo = Math.min(0, column.delta) - 12;
        const offset = -(position - column.from - lo) * cell;
        strip.style.transform = `translateY(${offset.toFixed(2)}px)`;
      });
    };

    const tick = (now: number) => {
      const raw = total > 0 ? clamp01((now - started) / (total * 1000)) : 1;
      const eased = ease(raw);
      const value = play.from + (play.to - play.from) * eased;
      valueRef.current = value;
      if (mode === "roll") renderRoll(raw * total);
      else renderCount(value);
      if (raw < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        runningRef.current = false;
        if (mode === "roll") renderRoll(total);
        if (mode === "roll" && textRef.current) {
          textRef.current.textContent = formatValue(play.to);
        }
        if (mode === "count") renderCount(play.to);
        onEnd?.();
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      runningRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [play, inView, startWhen]);

  const replay = () => {
    if (runningRef.current) return;
    valueRef.current = startValue;
    if (textRef.current) textRef.current.textContent = formatValue(startValue);
    setPlay((previous) => ({
      id: previous.id + 1,
      from: startValue,
      to: endValue,
    }));
  };

  return (
    <span
      ref={ref}
      className={`gamma-count-up ${className}`.trim()}
      style={style}
      onMouseEnter={replayOnHover ? replay : undefined}
    >
      {mode === "roll" && model ? (
        <span className="gamma-count-up__slots" aria-hidden="true">
          {model.slots.map((slot, index) => {
            if ("column" in slot) {
              const column = slot.column;
              const lo = Math.min(0, column.delta) - 12;
              const hi = Math.max(0, column.delta) + 12;
              const digits: number[] = [];
              for (let i = lo; i <= hi; i += 1)
                digits.push(mod10(column.from + i));
              return (
                <span
                  key={index}
                  className="gamma-count-up__slot"
                  ref={(el) => {
                    slotRefs.current[index] = el;
                  }}
                >
                  <span className="gamma-count-up__strip">
                    {digits.map((digit, i) => (
                      <span key={i} className="gamma-count-up__digit">
                        {digit}
                      </span>
                    ))}
                  </span>
                </span>
              );
            }
            return (
              <span key={index} className="gamma-count-up__slot">
                {slot.char}
              </span>
            );
          })}
        </span>
      ) : (
        <span ref={textRef} className="gamma-count-up__text">
          {formatValue(startValue)}
        </span>
      )}
      {mode === "roll" ? (
        <span ref={textRef} className="gamma-count-up__sr">
          {formatValue(endValue)}
        </span>
      ) : (
        <span className="gamma-count-up__sr">{formatValue(endValue)}</span>
      )}
    </span>
  );
}

export default CountUp;
