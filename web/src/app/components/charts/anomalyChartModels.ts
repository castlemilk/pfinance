import type { AnomalyPoint } from '@/app/metrics/types';

const SEVERITY_RANK = {
  low: 1,
  medium: 2,
  high: 3,
} as const;

function finiteSupportedDate(value: unknown): value is Date {
  return (
    value instanceof Date &&
    Number.isFinite(value.getTime()) &&
    value.getUTCFullYear() >= 1 &&
    value.getUTCFullYear() <= 9_999
  );
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function anomalyPointIdentity(point: AnomalyPoint): string {
  const expenseId = safeText(point.expenseId);
  if (expenseId) return `expense:${expenseId}`;
  const anomalyId = safeText(point.id);
  if (anomalyId) return `anomaly:${anomalyId}`;
  return [
    safeText(point.description),
    safeText(point.category),
    point.date.getTime(),
    point.amount,
  ].join(':');
}

function compareCandidates(left: AnomalyPoint, right: AnomalyPoint): number {
  return (
    SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity] ||
    Math.abs(right.zScore) - Math.abs(left.zScore) ||
    right.date.getTime() - left.date.getTime() ||
    right.amount - left.amount ||
    anomalyPointIdentity(left).localeCompare(anomalyPointIdentity(right)) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Produces the one-point-per-expense evidence model shared by charts and views.
 * This module intentionally has no client or chart dependency so lazy chart
 * bundles stay outside the analytics view's initial JavaScript.
 */
export function normalizeAnomalyPoints(
  source: readonly AnomalyPoint[]
): AnomalyPoint[] {
  const candidates = source
    .filter(
      (point) =>
        point !== null &&
        typeof point === 'object' &&
        finiteSupportedDate(point.date) &&
        Number.isFinite(point.amount) &&
        Number.isFinite(point.zScore) &&
        Object.hasOwn(SEVERITY_RANK, point.severity)
    )
    .map((point) => {
      const hasExpectedRange =
        point.hasExpectedRange === true &&
        Number.isFinite(point.expectedLowerAmount) &&
        Number.isFinite(point.expectedUpperAmount) &&
        point.expectedLowerAmount <= point.expectedUpperAmount;

      return {
        ...point,
        id: safeText(point.id),
        expenseId: safeText(point.expenseId),
        description: safeText(point.description) || 'Unlabelled expense',
        category: safeText(point.category) || 'Uncategorised',
        date: new Date(point.date.getTime()),
        expectedAmount: Number.isFinite(point.expectedAmount)
          ? point.expectedAmount
          : 0,
        expectedLowerAmount: hasExpectedRange
          ? point.expectedLowerAmount
          : 0,
        expectedUpperAmount: hasExpectedRange
          ? point.expectedUpperAmount
          : 0,
        hasExpectedRange,
        anomalyType: safeText(point.anomalyType) || 'unusual_pattern',
      };
    })
    .sort(compareCandidates);

  const seen = new Set<string>();
  return candidates.filter((point) => {
    const identity = anomalyPointIdentity(point);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
