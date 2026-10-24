/**
 * Australian stamp duty (transfer/land transfer/conveyance duty) rates.
 *
 * General/standard rate tiers per state plus simple first-home-buyer
 * price-threshold concessions. PPR/home concessions that phase with price
 * (e.g. QLD home concession, VIC PPR concession) are NOT modelled — the UI
 * tells users the estimate may be high and to confirm with the revenue office.
 *
 * Sources (2025–26 / 2026–27 where indexed):
 *  - NSW: Revenue NSW transfer duty table (2026/27 CPI-adjusted)
 *  - QLD: Queensland Revenue Office transfer duty rates
 *  - VIC: State Revenue Office land transfer duty
 *  - WA/SA/TAS/ACT/NT: respective revenue office published scales
 */

export type StateCode = 'NSW' | 'VIC' | 'QLD' | 'WA' | 'SA' | 'TAS' | 'ACT' | 'NT';

interface Tier {
  upTo: number; // upper bound of tier (Infinity for top)
  base: number; // duty payable at the bottom of the tier
  per100: number; // $ per $100 (or part) over the tier's lower bound
  floor: number; // tier lower bound
}

const T = (floor: number, upTo: number, base: number, per100: number): Tier => ({
  floor,
  upTo,
  base,
  per100,
});

const NSW: Tier[] = [
  T(0, 18_000, 0, 1.25),
  T(18_000, 38_000, 225, 1.5),
  T(38_000, 103_000, 525, 1.75),
  T(103_000, 387_000, 1_662, 3.5),
  T(387_000, 1_290_000, 11_602, 4.5),
  T(1_290_000, Infinity, 52_237, 5.5),
];

const VIC: Tier[] = [
  T(0, 25_000, 0, 1.4),
  T(25_000, 130_000, 350, 2.4),
  T(130_000, 960_000, 2_870, 6.0),
  // $960k–$2m is a flat 5.5% of total value; >$2m flat 6.5% — handled below.
];

const QLD: Tier[] = [
  T(0, 5_000, 0, 0),
  T(5_000, 75_000, 0, 1.5),
  T(75_000, 540_000, 1_050, 3.5),
  T(540_000, 1_000_000, 17_325, 4.5),
  T(1_000_000, Infinity, 38_025, 5.75),
];

const WA: Tier[] = [
  T(0, 120_000, 0, 1.9),
  T(120_000, 150_000, 2_280, 2.85),
  T(150_000, 360_000, 3_135, 3.8),
  T(360_000, 725_000, 11_115, 4.75),
  T(725_000, Infinity, 28_453, 5.15),
];

const SA: Tier[] = [
  T(0, 12_000, 0, 1.0),
  T(12_000, 30_000, 120, 2.0),
  T(30_000, 50_000, 480, 3.0),
  T(50_000, 100_000, 1_080, 3.5),
  T(100_000, 200_000, 2_830, 4.0),
  T(200_000, 250_000, 6_830, 4.25),
  T(250_000, 300_000, 8_955, 4.75),
  T(300_000, 500_000, 11_330, 5.0),
  T(500_000, Infinity, 21_330, 5.5),
];

const TAS: Tier[] = [
  T(0, 3_000, 0, 0), // flat $50 handled below
  T(3_000, 25_000, 50, 1.75),
  T(25_000, 75_000, 435, 2.25),
  T(75_000, 200_000, 1_560, 3.5),
  T(200_000, 375_000, 5_935, 4.0),
  T(375_000, 725_000, 12_935, 4.25),
  T(725_000, Infinity, 27_810, 4.5),
];

// ACT owner-occupier marginal scale.
const ACT: Tier[] = [
  T(0, 260_000, 0, 0.6),
  T(260_000, 300_000, 1_560, 2.2),
  T(300_000, 500_000, 2_440, 3.4),
  T(500_000, 750_000, 9_240, 4.32),
  T(750_000, 1_000_000, 20_040, 5.9),
  T(1_000_000, 1_455_000, 34_790, 6.4),
];

function tieredDuty(value: number, tiers: Tier[]): number {
  const tier = tiers.find((t) => value <= t.upTo) ?? tiers[tiers.length - 1];
  return tier.base + ((value - tier.floor) / 100) * tier.per100;
}

export function standardDuty(state: StateCode, value: number): number {
  if (value <= 0) return 0;
  switch (state) {
    case 'NSW':
      return Math.max(20, tieredDuty(value, NSW));
    case 'VIC':
      // Flat-rate tiers at the top.
      if (value > 2_000_000) return 110_000 + (value - 2_000_000) * 0.065;
      if (value > 960_000) return value * 0.055;
      return tieredDuty(value, VIC);
    case 'QLD':
      return tieredDuty(value, QLD);
    case 'WA':
      return tieredDuty(value, WA);
    case 'SA':
      return tieredDuty(value, SA);
    case 'TAS':
      return value <= 3_000 ? 50 : tieredDuty(value, TAS);
    case 'ACT':
      if (value > 1_455_000) return value * 0.0454;
      return tieredDuty(value, ACT);
    case 'NT':
      // NT formula: for $525k–$3m, duty = 0.06571441·V² + 15V (V = value/1000).
      if (value >= 525_000 && value < 3_000_000) {
        const v = value / 1000;
        return 0.06571441 * v * v + 15 * v;
      }
      if (value >= 3_000_000) return value * 0.0595;
      return tieredDutyNtLow(value);
  }
}

function tieredDutyNtLow(value: number): number {
  // NT published scale under $525k: percentage of value rising with price.
  if (value <= 500_000) return value * 0.02397213; // ~2.4% effective below $500k
  return tieredDuty(value, [T(500_000, 525_000, 11_986, 5.37)]);
}

export const STATE_NAMES: Record<StateCode, string> = {
  NSW: 'New South Wales',
  VIC: 'Victoria',
  QLD: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  TAS: 'Tasmania',
  ACT: 'Australian Capital Territory',
  NT: 'Northern Territory',
};

export interface FhbResult {
  duty: number;
  note: string;
  exempt: boolean;
}

/**
 * First-home-buyer concession on top of standard duty.
 * Only simple price-threshold schemes are modelled; income-tested or
 * property-type-conditional schemes are flagged in the note instead.
 */
export function firstHomeDuty(state: StateCode, value: number, newHome: boolean): FhbResult {
  const std = standardDuty(state, value);
  switch (state) {
    case 'NSW': {
      if (value <= 800_000) return { duty: 0, note: 'Full exemption under the First Home Buyers Assistance Scheme.', exempt: true };
      if (value < 1_000_000) {
        const scaled = std * ((value - 800_000) / 200_000);
        return { duty: scaled, note: 'Concession phases out between $800k and $1m.', exempt: false };
      }
      return { duty: std, note: 'Above the $1m concession cap — full duty applies.', exempt: false };
    }
    case 'VIC': {
      if (value <= 600_000) return { duty: 0, note: 'Full first-home exemption up to $600k.', exempt: true };
      if (value < 750_000) {
        const scaled = std * ((value - 600_000) / 150_000);
        return { duty: scaled, note: 'Concession tapers to zero at $750k.', exempt: false };
      }
      return { duty: std, note: 'Above $750k — full duty applies.', exempt: false };
    }
    case 'QLD': {
      if (value <= 700_000) return { duty: 0, note: 'Full first-home concession up to $700k.', exempt: true };
      if (value < 800_000) {
        const scaled = std * ((value - 700_000) / 100_000);
        return { duty: scaled, note: 'Concession phases out between $700k and $800k.', exempt: false };
      }
      return { duty: std, note: 'Above $800k — full duty applies.', exempt: false };
    }
    case 'WA': {
      if (value <= 500_000) return { duty: 0, note: 'Full exemption up to $500k (metro/Peel).', exempt: true };
      if (value < 600_000) {
        const scaled = std * ((value - 500_000) / 100_000);
        return { duty: scaled, note: 'Concession tapers toward $600k.', exempt: false };
      }
      return { duty: std, note: 'Above the concession cap — full duty applies.', exempt: false };
    }
    case 'SA': {
      if (newHome) return { duty: 0, note: 'Full exemption on a new home (no value cap from June 2024).', exempt: true };
      return { duty: std, note: 'SA exempts new homes only — established homes pay full duty.', exempt: false };
    }
    case 'TAS': {
      if (value <= 750_000) return { duty: 0, note: 'Established-home exemption to $750k (measure to 30 Jun 2026 — check it still applies).', exempt: true };
      return { duty: std, note: 'Above $750k — full duty applies.', exempt: false };
    }
    case 'ACT': {
      if (value <= 1_020_000) {
        return { duty: 0, note: 'Home Buyer Concession Scheme can reduce duty to nil to ~$1.02m — but it is income-tested. Confirm eligibility.', exempt: true };
      }
      return { duty: std, note: 'Above the scheme cap — full duty applies.', exempt: false };
    }
    case 'NT':
      return { duty: std, note: 'NT has no general first-home stamp duty exemption.', exempt: false };
  }
}

// Flat foreign-purchaser surcharge rates (added on top of duty).
const FOREIGN_SURCHARGE: Record<StateCode, number> = {
  NSW: 0.09, VIC: 0.08, QLD: 0.08, WA: 0.07, SA: 0.07, TAS: 0.08, ACT: 0, NT: 0,
};

export function foreignSurcharge(state: StateCode, value: number): number {
  return value * FOREIGN_SURCHARGE[state];
}
