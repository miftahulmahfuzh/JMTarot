/**
 * `forecast.ts`. A3, v0.5.0.
 *
 * Every row of the plan's degeneracy table has a test named for it, and each asserts
 * `not.toThrow()` as well as the value -- A13 is a promise a return type cannot make.
 *
 * The load-bearing assertion in this file is the BAND FLARE. Without the
 * `(x0 - xbar)^2 / Sxx` term the code compiles and produces a parallel band, which
 * looks entirely plausible on a chart and is the failure nobody would report.
 */
import { describe, expect, it } from 'vitest';
import { MIN_FORECAST_DAYS, crossing, forecast, horizon } from './forecast';

/** `n` points on the line `y = a + b*t`, optionally with per-point noise. */
function line(n: number, a: number, b: number, noise: (i: number) => number = () => 0) {
  return Array.from({ length: n }, (_, i) => ({ t: i, y: a + b * i + noise(i) }));
}

describe('the module contract', () => {
  it('imports only series.ts -- no db, no env, no server-only', () => {
    const src = require('node:fs').readFileSync('src/lib/analytics/forecast.ts', 'utf8');
    const specs = [...src.matchAll(/^\s*import\s+(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/gm)].map(
      (m: RegExpMatchArray) => m[1],
    );
    expect(specs).toEqual(['./series']);
    /*
     * A pure function that reads the environment is not testable at two ceilings, and
     * the ceiling has two tiers (280 hard, 196 soft) so somebody will need to be.
     *
     * **COMMENTS ARE STRIPPED FIRST**, and that is not a convenience: the file's own
     * header says the words "no `process.env`", so a bare grep fires on the prose
     * describing the rule. `queries/contract.test.ts` has the same note for the same
     * reason -- *"a rule that fires on prose describing the rule is a rule people
     * delete."*
     */
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('process.env');
  });
});

describe('the fit', () => {
  it('recovers a perfectly linear slope to 1e-9', () => {
    const fit = forecast(line(20, 10, 3));
    expect(fit.kind).toBe('trend');
    if (fit.kind !== 'trend') return;
    expect(fit.slopePerDay).toBeCloseTo(3, 9);
    expect(fit.intercept).toBeCloseTo(10, 9);
    expect(fit.r2).toBeCloseTo(1, 9);
  });

  it('moves the intercept and NOT the slope when every y shifts by a constant', () => {
    const base = forecast(line(20, 10, 3, (i) => (i % 3) - 1));
    const lifted = forecast(line(20, 60, 3, (i) => (i % 3) - 1));
    expect(base.kind).toBe('trend');
    expect(lifted.kind).toBe('trend');
    if (base.kind !== 'trend' || lifted.kind !== 'trend') return;
    expect(lifted.slopePerDay).toBeCloseTo(base.slopePerDay, 12);
    expect(lifted.intercept - base.intercept).toBeCloseTo(50, 9);
  });

  it('is order-free: reversing the input does not change the fit', () => {
    // The maths is order-free and a caller should not have to know that.
    const points = line(20, 4, 1.5, (i) => Math.sin(i));
    const a = forecast(points);
    const b = forecast([...points].reverse());
    if (a.kind !== 'trend' || b.kind !== 'trend') throw new Error('expected trends');
    expect(b.slopePerDay).toBeCloseTo(a.slopePerDay, 12);
    expect(b.intercept).toBeCloseTo(a.intercept, 12);
    expect(b.at(30).upper).toBeCloseTo(a.at(30).upper, 9);
  });
});

describe('the band', () => {
  it('WIDENS with distance -- the (x0-xbar)^2/Sxx term is present', () => {
    /*
     * THE ASSERTION THIS FILE EXISTS FOR. Drop the quadratic term and this is the
     * only test that fails; the band becomes parallel, which reads as a confident
     * forecast rather than as a broken one.
     */
    const fit = forecast(line(20, 10, 2, (i) => (i % 5) - 2));
    if (fit.kind !== 'trend') throw new Error('expected a trend');
    const near = fit.at(20);
    const far = fit.at(60);
    expect(far.upper - far.lower).toBeGreaterThan(near.upper - near.lower);
  });

  it('is a PREDICTION interval, not a confidence interval', () => {
    /*
     * The `1 +` under the root. A confidence band for the mean at xbar is
     * `t * s / sqrt(n)`; a prediction band is `t * s * sqrt(1 + 1/n)`, which is
     * strictly wider by roughly sqrt(n+1) at the centre. Asserting the ratio is what
     * makes the distinction mechanical rather than a comment.
     */
    const n = 20;
    const fit = forecast(line(n, 0, 1, (i) => (i % 2 === 0 ? 5 : -5)));
    if (fit.kind !== 'trend') throw new Error('expected a trend');
    const centre = fit.at((n - 1) / 2);
    const halfWidth = (centre.upper - centre.lower) / 2;
    // s is ~5 here; a confidence band would be ~t*5/sqrt(20) ~= 2.4, a prediction
    // band ~t*5*sqrt(1.05) ~= 10.9. Anything above 5 can only be the prediction form.
    expect(halfWidth).toBeGreaterThan(5);
  });

  it('never returns a negative bound, because every series here is a count', () => {
    const fit = forecast(line(20, 5, -0.3, (i) => (i % 4) - 1.5));
    if (fit.kind !== 'trend') throw new Error('expected a trend');
    const far = fit.at(300);
    expect(far.point).toBeGreaterThanOrEqual(0);
    expect(far.lower).toBeGreaterThanOrEqual(0);
    expect(far.upper).toBeGreaterThanOrEqual(0);
  });

  it('has no variant carrying a point without a band', () => {
    const fit = forecast(line(20, 10, 3));
    if (fit.kind !== 'trend') throw new Error('expected a trend');
    const band = fit.at(25);
    // A11 as a type: the object always has all three, so a caller cannot destructure
    // a bare number out of the producer. Constructing one is a visible act in a diff.
    expect(Object.keys(band).sort()).toEqual(['lower', 'point', 'upper']);
    // @ts-expect-error -- `insufficient` carries no `at`, so a caller cannot reach a
    // point estimate without first narrowing on `kind`.
    void forecast([]).at;
  });
});

describe('the minimum n', () => {
  it('n = 13 is insufficient and says how many more days it needs', () => {
    const fit = forecast(line(13, 1, 1));
    expect(fit).toEqual({
      kind: 'insufficient',
      have: 13,
      need: MIN_FORECAST_DAYS,
      moreDaysNeeded: 1,
    });
  });

  it('n = 14 forecasts', () => {
    expect(forecast(line(14, 1, 1)).kind).toBe('trend');
  });
});

describe('degeneracy -- every row returns, none throws', () => {
  it('[] is insufficient', () => {
    expect(() => forecast([])).not.toThrow();
    expect(forecast([])).toMatchObject({ kind: 'insufficient', have: 0, moreDaysNeeded: 14 });
  });

  it('a non-finite y is insufficient, not a NaN line', () => {
    const bad = line(20, 1, 1);
    bad[7].y = Number.NaN;
    expect(() => forecast(bad)).not.toThrow();
    expect(forecast(bad).kind).toBe('insufficient');

    const inf = line(20, 1, 1);
    inf[3].y = Number.POSITIVE_INFINITY;
    expect(forecast(inf).kind).toBe('insufficient');
  });

  it('[{t:0,y:Infinity}] returns rather than throwing', () => {
    expect(() => forecast([{ t: 0, y: Number.POSITIVE_INFINITY }])).not.toThrow();
    expect(forecast([{ t: 0, y: Number.POSITIVE_INFINITY }]).kind).toBe('insufficient');
  });

  it('400 identical points are flat, not a trend with a zero-width band', () => {
    const flat = Array.from({ length: 400 }, (_, i) => ({ t: i, y: 7 }));
    expect(() => forecast(flat)).not.toThrow();
    expect(forecast(flat)).toEqual({ kind: 'flat', n: 400, mean: 7 });
  });

  it('all zeros is flat with mean 0 -- the honest reading of "nothing happened"', () => {
    expect(forecast(line(20, 0, 0))).toEqual({ kind: 'flat', n: 20, mean: 0 });
  });

  it('a single spike is a TREND with a wide band and low r2, not a suppression', () => {
    // The band IS the answer. Suppressing this would be the heuristic failing a
    // person, which is tally.ts's rule.
    const spiky = line(20, 5, 0);
    spiky[10].y = 500;
    const fit = forecast(spiky);
    expect(fit.kind).toBe('trend');
    if (fit.kind !== 'trend') return;
    expect(fit.r2).toBeLessThan(0.2);
    const band = fit.at(25);
    expect(band.upper - band.lower).toBeGreaterThan(100);
  });

  it('a non-array input returns insufficient', () => {
    // @ts-expect-error -- deliberately wrong, because A13 is about what reaches this
    // function at runtime and a route handler is one JSON.parse away from anything.
    expect(() => forecast(null)).not.toThrow();
    // @ts-expect-error -- same.
    expect(forecast(null).kind).toBe('insufficient');
  });
});

describe('crossing', () => {
  const rising = forecast(line(20, 10, 5, (i) => (i % 3) - 1));

  it('a declining series is not-approaching -- no date invented from noise', () => {
    const falling = forecast(line(20, 500, -5));
    expect(crossing(falling, 280, '2026-07-29')).toEqual({ kind: 'not-approaching' });
  });

  it('a flat or insufficient fit is not-approaching', () => {
    expect(crossing(forecast(line(20, 3, 0)), 280, '2026-07-29').kind).toBe('not-approaching');
    expect(crossing(forecast([]), 280, '2026-07-29').kind).toBe('not-approaching');
  });

  it('returns a RANGE: earliest from the upper bound, central from the point', () => {
    const out = crossing(rising, 280, '2026-07-29');
    expect(out.kind).toBe('crossing');
    if (out.kind !== 'crossing') return;
    // The upper bound can never reach the target after the point estimate does.
    expect(out.central).not.toBeNull();
    expect(out.earliest.dayIndex).toBeLessThanOrEqual(out.central!.dayIndex);
    expect(out.earliest.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.central!.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('separates the two dates by MORE the noisier the series is', () => {
    /*
     * On a clean series the band is narrower than one day of slope, so `earliest` and
     * `central` land on the same day and the range is one day wide -- which is
     * honest, and is why the assertion above is `<=`. **The range only means something
     * when the data is noisy**, and this is the case that proves the two dates are
     * computed from different bounds rather than from the same one twice.
     */
    const noisy = forecast(line(20, 10, 5, (i) => (i % 2 === 0 ? 60 : -60)));
    const out = crossing(noisy, 280, '2026-07-29');
    if (out.kind !== 'crossing') throw new Error('expected a crossing');
    expect(out.central).not.toBeNull();
    expect(out.central!.dayIndex - out.earliest.dayIndex).toBeGreaterThan(5);
  });

  it('counts days forward from the last day of the fitted range', () => {
    const out = crossing(rising, 280, '2026-07-29');
    if (out.kind !== 'crossing') throw new Error('expected a crossing');
    const steps = out.earliest.dayIndex - (rising.kind === 'trend' ? rising.n - 1 : 0);
    const expected = new Date(Date.UTC(2026, 6, 29) + steps * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(out.earliest.day).toBe(expected);
  });

  it('reports already-above rather than a crossing in the past', () => {
    const out = crossing(rising, 5, '2026-07-29');
    expect(out).toEqual({ kind: 'already-above', on: 'today' });
  });

  it('is beyond-horizon rather than a date in 2031', () => {
    const creeping = forecast(line(20, 1, 0.001, (i) => (i % 2) * 0.0005));
    const out = crossing(creeping, 280, '2026-07-29');
    expect(out).toEqual({ kind: 'beyond-horizon', days: 365 });
  });

  it('refuses a nonsensical target rather than answering', () => {
    expect(crossing(rising, 0, '2026-07-29').kind).toBe('not-approaching');
    expect(crossing(rising, Number.NaN, '2026-07-29').kind).toBe('not-approaching');
  });

  it('never throws on a malformed lastDay', () => {
    expect(() => crossing(rising, 280, 'not-a-day')).not.toThrow();
    const out = crossing(rising, 280, 'not-a-day');
    if (out.kind !== 'crossing') throw new Error('expected a crossing');
    // The index is still true; only the calendar rendering is unavailable.
    expect(out.earliest.day).toBe('');
    expect(out.earliest.dayIndex).toBeGreaterThan(0);
  });
});

describe('horizon', () => {
  it('returns one banded row per day ahead, with calendar days', () => {
    const fit = forecast(line(20, 10, 2));
    const rows = horizon(fit, '2026-07-29', 7);
    expect(rows).toHaveLength(7);
    expect(rows[0].day).toBe('2026-07-30');
    expect(rows[6].day).toBe('2026-08-05');
    for (const r of rows) {
      expect(r.lower).toBeLessThanOrEqual(r.point);
      expect(r.upper).toBeGreaterThanOrEqual(r.point);
    }
  });

  it('is empty for a fit that is not a trend', () => {
    expect(horizon(forecast([]), '2026-07-29', 7)).toEqual([]);
    expect(horizon(forecast(line(20, 3, 0)), '2026-07-29', 7)).toEqual([]);
  });

  it('caps at MAX_HORIZON_DAYS', () => {
    expect(horizon(forecast(line(20, 10, 2)), '2026-07-29', 10_000)).toHaveLength(365);
  });
});
