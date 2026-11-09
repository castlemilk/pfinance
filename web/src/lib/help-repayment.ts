/**
 * Compulsory HELP/VSL/SFSS/SSL/AASL repayments under the marginal system that
 * replaced the percentage-of-total-income table from the 2025–26 income year.
 *
 * Each year the three thresholds are indexed together:
 * - nothing is repaid up to the minimum threshold;
 * - 15c per $1 between the minimum and middle thresholds;
 * - the 15% band amount plus 17c per $1 between the middle and top thresholds;
 * - above the top threshold, 10% of total repayment income.
 *
 * Source: https://www.ato.gov.au/tax-rates-and-codes/study-and-training-support-loans-rates-and-repayment-thresholds
 */

export type HelpScheduleYear = '2025-26' | '2026-27';

export interface HelpSchedule {
  year: HelpScheduleYear;
  label: string;
  minThreshold: number;
  midThreshold: number;
  topThreshold: number;
}

export const HELP_SCHEDULES: Record<HelpScheduleYear, HelpSchedule> = {
  '2025-26': {
    year: '2025-26',
    label: '2025–26',
    minThreshold: 67_000,
    midThreshold: 125_000,
    topThreshold: 179_285,
  },
  '2026-27': {
    year: '2026-27',
    label: '2026–27',
    minThreshold: 69_528,
    midThreshold: 129_717,
    topThreshold: 186_051,
  },
};

/** The most recent published schedule. */
export const LATEST_HELP_SCHEDULE_YEAR: HelpScheduleYear = '2026-27';

/** Repayment owed at the middle threshold: 15% of the first marginal band. */
export function helpMidBandBase(schedule: HelpSchedule): number {
  return 0.15 * (schedule.midThreshold - schedule.minThreshold);
}

export function compulsoryHelpRepayment(
  repaymentIncome: number,
  year: HelpScheduleYear = LATEST_HELP_SCHEDULE_YEAR
): number {
  const schedule = HELP_SCHEDULES[year];
  if (!Number.isFinite(repaymentIncome) || repaymentIncome <= schedule.minThreshold) return 0;
  if (repaymentIncome <= schedule.midThreshold) {
    return 0.15 * (repaymentIncome - schedule.minThreshold);
  }
  if (repaymentIncome <= schedule.topThreshold) {
    return helpMidBandBase(schedule) + 0.17 * (repaymentIncome - schedule.midThreshold);
  }
  return 0.1 * repaymentIncome;
}

/** Which marginal band an income falls in, for explanatory copy. */
export function helpBandDescription(
  repaymentIncome: number,
  year: HelpScheduleYear = LATEST_HELP_SCHEDULE_YEAR
): string {
  const s = HELP_SCHEDULES[year];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-AU')}`;
  if (repaymentIncome <= s.minThreshold) {
    return `Below the ${fmt(s.minThreshold)} threshold, so nothing is repaid`;
  }
  if (repaymentIncome <= s.midThreshold) {
    return `15c per $1 over ${fmt(s.minThreshold)}`;
  }
  if (repaymentIncome <= s.topThreshold) {
    return `${fmt(helpMidBandBase(s))} plus 17c per $1 over ${fmt(s.midThreshold)}`;
  }
  return `10% of total repayment income above ${fmt(s.topThreshold)}`;
}
