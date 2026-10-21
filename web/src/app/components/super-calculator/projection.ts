export interface SuperAssumptions {
  startingBalance: number;
  annualContribution: number;
  annualReturnPercent: number;
  years: number;
}

export interface SuperProjectionYear {
  year: number;
  openingBalance: number;
  contribution: number;
  investmentReturn: number;
  balance: number;
  totalContributions: number;
  totalGrowth: number;
  contributedCapital: number;
}

export type SuperInputErrors = Partial<Record<keyof SuperAssumptions, string>>;

export function validateSuperAssumptions(input: SuperAssumptions): SuperInputErrors {
  const errors: SuperInputErrors = {};
  for (const field of ['startingBalance', 'annualContribution'] as const) {
    if (!Number.isFinite(input[field]) || input[field] < 0 || input[field] > 1_000_000_000) {
      errors[field] = 'Enter an amount from $0 to $1 billion.';
    }
  }
  if (!Number.isFinite(input.annualReturnPercent) || input.annualReturnPercent < -100 || input.annualReturnPercent > 100) {
    errors.annualReturnPercent = 'Enter a return from −100% to 100%.';
  }
  if (!Number.isInteger(input.years) || input.years < 0 || input.years > 80) {
    errors.years = 'Enter a whole number of years from 0 to 80.';
  }
  return errors;
}

/**
 * Illustrative nominal AUD projection, not a tax or retirement-income model.
 * Returns compound annually; the same net contribution is added at each year end.
 * Round to cents at each annual step; reject unsafe numeric ranges, never show Infinity.
 */
export function projectSuper(input: SuperAssumptions): SuperProjectionYear[] {
  if (Object.keys(validateSuperAssumptions(input)).length) {
    throw new RangeError('Check the projection assumptions.');
  }
  const startingCents = Math.round(input.startingBalance * 100);
  const contributionCents = Math.round(input.annualContribution * 100);
  let balanceCents = startingCents;
  let contributedCents = 0;
  const rows: SuperProjectionYear[] = [{
    year: 0, openingBalance: balanceCents / 100, contribution: 0,
    investmentReturn: 0, balance: balanceCents / 100,
    totalContributions: 0, totalGrowth: 0, contributedCapital: balanceCents / 100,
  }];
  for (let year = 1; year <= input.years; year += 1) {
    const openingCents = balanceCents;
    const returnCents = Math.round(openingCents * input.annualReturnPercent / 100);
    balanceCents = openingCents + returnCents + contributionCents;
    contributedCents += contributionCents;
    if (!Number.isSafeInteger(balanceCents) || !Number.isSafeInteger(returnCents)) {
      throw new RangeError('This combination exceeds the supported range. Reduce the balance, return or projection period.');
    }
    rows.push({
      year, openingBalance: openingCents / 100, contribution: contributionCents / 100,
      investmentReturn: returnCents / 100, balance: balanceCents / 100,
      totalContributions: contributedCents / 100,
      totalGrowth: (balanceCents - startingCents - contributedCents) / 100,
      contributedCapital: (startingCents + contributedCents) / 100,
    });
  }
  return rows;
}
