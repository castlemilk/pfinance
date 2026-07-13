export interface FittedTrendEndpoints {
  intercept: number;
  start: number;
  end: number;
}

/**
 * Reconstruct the fitted line represented by a least-squares slope.
 *
 * The analytics service returns the slope, while the chart owns the observed
 * values. Least-squares lines pass through (mean x, mean y), so the intercept
 * can be recovered without pretending the first observation lies on the fit.
 */
export function fittedTrendEndpoints(
  values: readonly number[],
  slope: number
): FittedTrendEndpoints | null {
  if (
    values.length === 0 ||
    !Number.isFinite(slope) ||
    values.some((value) => !Number.isFinite(value))
  ) {
    return null;
  }

  const meanY = values.reduce((sum, value) => sum + value, 0) / values.length;
  const meanX = (values.length - 1) / 2;
  const intercept = meanY - slope * meanX;
  const start = intercept;
  const end = intercept + slope * (values.length - 1);

  if (![intercept, start, end].every(Number.isFinite)) {
    return null;
  }

  return { intercept, start, end };
}

const HALF_DAY_MS = 12 * 60 * 60 * 1000;
const MIN_DATE_MS = -8_640_000_000_000_000;
const MAX_DATE_MS = 8_640_000_000_000_000;

function validTimes(dates: readonly Date[]): number[] {
  return dates
    .map((date) => date.getTime())
    .filter((time) => Number.isFinite(time));
}

function expandedSingleton(time: number): readonly [Date, Date] {
  const start = new Date(Math.max(MIN_DATE_MS, time - HALF_DAY_MS));
  const end = new Date(Math.min(MAX_DATE_MS, time + HALF_DAY_MS));
  return Object.freeze([Object.freeze(start), Object.freeze(end)]);
}

/**
 * Build a safe chart domain without sorting or retaining the caller's Dates.
 * Invalid dates are ignored, and collapsed domains are expanded by one day.
 */
export function forecastDomain(
  history: readonly Date[],
  future: readonly Date[],
  today: Date = new Date()
): readonly [Date, Date] {
  const historyTimes = validTimes(history);
  const futureTimes = validTimes(future);
  const todayTime = today.getTime();
  const hasValidToday = Number.isFinite(todayTime);

  const times = [...historyTimes, ...futureTimes];
  if (historyTimes.length > 0 && futureTimes.length > 0 && hasValidToday) {
    times.push(todayTime);
  }

  if (times.length === 0) {
    return expandedSingleton(hasValidToday ? todayTime : 0);
  }

  const startTime = Math.min(...times);
  const endTime = Math.max(...times);
  if (startTime === endTime) {
    return expandedSingleton(startTime);
  }

  return Object.freeze([
    Object.freeze(new Date(startTime)),
    Object.freeze(new Date(endTime)),
  ]);
}
