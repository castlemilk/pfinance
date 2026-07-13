import {
  fittedTrendEndpoints,
  forecastDomain,
} from '../analyticsChartMath';

describe('fittedTrendEndpoints', () => {
  it('reconstructs the least-squares intercept instead of anchoring to the first observation', () => {
    const values = [12, 4, 14];
    const original = [...values];

    const fitted = fittedTrendEndpoints(values, 1);

    expect(fitted).toEqual({ intercept: 9, start: 9, end: 11 });
    expect(fitted?.start).not.toBe(values[0]);
    expect(values).toEqual(original);
  });

  it('returns unclamped negative fitted values', () => {
    expect(fittedTrendEndpoints([-12, -8, -4], 4)).toEqual({
      intercept: -12,
      start: -12,
      end: -4,
    });
  });

  it('defines empty and single-point behavior', () => {
    expect(fittedTrendEndpoints([], 2)).toBeNull();
    expect(fittedTrendEndpoints([7], 2)).toEqual({
      intercept: 7,
      start: 7,
      end: 7,
    });
  });

  it('rejects non-finite values and slopes without producing a poisoned domain', () => {
    expect(fittedTrendEndpoints([1, Number.NaN, 3], 1)).toBeNull();
    expect(fittedTrendEndpoints([1, 2, 3], Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('forecastDomain', () => {
  const day = (date: string) => new Date(`${date}T00:00:00.000Z`);

  it('spans history, Today and the latest future date without sorting its inputs', () => {
    const history = [day('2026-07-10'), day('2026-07-01')];
    const future = [day('2026-08-01'), day('2026-07-20')];
    const historyOrder = history.map((date) => date.getTime());
    const futureOrder = future.map((date) => date.getTime());

    const domain = forecastDomain(history, future, day('2026-07-13'));

    expect(domain.map((date) => date.toISOString())).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
    ]);
    expect(history.map((date) => date.getTime())).toEqual(historyOrder);
    expect(future.map((date) => date.getTime())).toEqual(futureOrder);
    expect(Object.isFrozen(domain)).toBe(true);
    expect(domain[0]).not.toBe(history[1]);
    expect(domain[1]).not.toBe(future[0]);
  });

  it('includes Today when it lies outside otherwise overlapping history and future', () => {
    const domain = forecastDomain(
      [day('2026-07-10')],
      [day('2026-07-11')],
      day('2026-07-13')
    );

    expect(domain[1].toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('uses the valid side when the other side is empty or invalid', () => {
    const historyOnly = forecastDomain(
      [day('2026-07-01'), day('2026-07-04')],
      [],
      day('2026-07-13')
    );
    const futureOnly = forecastDomain(
      [new Date(Number.NaN)],
      [day('2026-07-20'), day('2026-07-24')],
      day('2026-07-13')
    );

    expect(historyOnly.map((date) => date.toISOString())).toEqual([
      '2026-07-01T00:00:00.000Z',
      '2026-07-04T00:00:00.000Z',
    ]);
    expect(futureOnly.map((date) => date.toISOString())).toEqual([
      '2026-07-20T00:00:00.000Z',
      '2026-07-24T00:00:00.000Z',
    ]);
  });

  it('expands empty and single-date inputs to a valid non-collapsed domain', () => {
    const today = day('2026-07-13');
    const empty = forecastDomain([], [], today);
    const single = forecastDomain([day('2026-07-01')], [], today);

    expect(empty[0].getTime()).toBeLessThan(today.getTime());
    expect(empty[1].getTime()).toBeGreaterThan(today.getTime());
    expect(single[0].getTime()).toBeLessThan(day('2026-07-01').getTime());
    expect(single[1].getTime()).toBeGreaterThan(day('2026-07-01').getTime());
  });
});
