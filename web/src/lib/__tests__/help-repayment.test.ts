import {
  compulsoryHelpRepayment,
  helpBandDescription,
  helpMidBandBase,
  HELP_SCHEDULES,
} from '../help-repayment';

describe('compulsoryHelpRepayment', () => {
  it('matches the published 2025–26 schedule', () => {
    expect(compulsoryHelpRepayment(67_000, '2025-26')).toBe(0);
    // 15c x $18,000
    expect(compulsoryHelpRepayment(85_000, '2025-26')).toBeCloseTo(2_700, 2);
    expect(helpMidBandBase(HELP_SCHEDULES['2025-26'])).toBeCloseTo(8_700, 2);
    // $8,700 + 17c x $25,000
    expect(compulsoryHelpRepayment(150_000, '2025-26')).toBeCloseTo(12_950, 2);
    expect(compulsoryHelpRepayment(200_000, '2025-26')).toBeCloseTo(20_000, 2);
  });

  it('matches the indexed 2026–27 schedule', () => {
    expect(compulsoryHelpRepayment(69_528, '2026-27')).toBe(0);
    // 15c x $10,472
    expect(compulsoryHelpRepayment(80_000, '2026-27')).toBeCloseTo(1_570.8, 1);
    expect(Math.round(helpMidBandBase(HELP_SCHEDULES['2026-27']))).toBe(9_028);
    expect(compulsoryHelpRepayment(250_000, '2026-27')).toBeCloseTo(25_000, 2);
  });

  it.each(['2025-26', '2026-27'] as const)('is continuous at each %s band edge', (year) => {
    const s = HELP_SCHEDULES[year];
    for (const edge of [s.midThreshold, s.topThreshold]) {
      const below = compulsoryHelpRepayment(edge, year);
      const above = compulsoryHelpRepayment(edge + 1, year);
      expect(Math.abs(above - below)).toBeLessThan(2);
    }
  });

  it('never returns NaN for bad input', () => {
    expect(compulsoryHelpRepayment(Number.NaN)).toBe(0);
    expect(compulsoryHelpRepayment(-5_000)).toBe(0);
  });

  it('describes the band an income falls in', () => {
    expect(helpBandDescription(60_000, '2026-27')).toContain('nothing is repaid');
    expect(helpBandDescription(80_000, '2026-27')).toBe('15c per $1 over $69,528');
    expect(helpBandDescription(150_000, '2026-27')).toContain('17c per $1 over $129,717');
  });
});
