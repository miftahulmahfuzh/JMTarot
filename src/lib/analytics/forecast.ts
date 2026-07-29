/**
 * When does the current trajectory hit the ceiling. **PURE: no `server-only`, no
 * `process.env`, no `@/lib/db/**`, and `series.ts` is the only import.**
 *
 * A3, v0.5.0, decision A-D8. `swipeDeck.ts`'s precedent -- *the whole policy in a pure
 * module is the part `npm test` can reach* -- and here the policy is the entire value:
 * the SQL is four aggregates and the judgement is all in this file.
 *
 * ── ORDINARY LEAST SQUARES, AND NOTHING ELSE ────────────────────────────────
 *
 * No ARIMA, no Prophet, no seasonal decomposition, no dependency (§9.7 forbids the
 * last outright). A-D8's own words: *"Seven data points do not support a seasonal model
 * and pretending otherwise is the failure mode."* The same sentence argues against
 * seven points supporting a *trend*, which is where `MIN_FORECAST_DAYS` comes from.
 *
 * ── THE BAND IS A PREDICTION INTERVAL, NOT A CONFIDENCE INTERVAL ────────────
 *
 *   se(x0) = s * sqrt( 1 + 1/n + (x0 - xbar)^2 / Sxx )
 *
 * **The `1 +` under the root is the whole difference between the two**, and it is what
 * makes the band honest: a confidence band for the *mean* is roughly `s/sqrt(n)` wide
 * and looks impressively tight on nine noisy days, while the operator is asking about
 * a *new observation*. The `(x0 - xbar)^2 / Sxx` term is what makes the band flare as
 * you extrapolate, which is the visual that stops a projection reading as a promise --
 * `forecast.test.ts` asserts the flare directly, because without that term the code
 * compiles and produces a parallel band that looks perfectly plausible on a chart.
 *
 * ── THE CEILING IS PASSED IN, NEVER READ FROM THE ENVIRONMENT ───────────────
 *
 * A pure function that reads `process.env` is not testable at two ceilings, and
 * somebody will need to be -- 280 is 70% of the provider's limit with a soft tier at
 * 196, so the page has two marks on one track and both go through `crossing()`.
 *
 * ── A HEURISTIC MAY FAIL A BUILD; IT MAY NOT FAIL A PERSON ──────────────────
 *
 * `tally.ts`'s rule. **Nothing here throws.** Every entry point validates and returns
 * `{ kind: 'insufficient' }` on anything empty, short, non-finite or degenerate. There
 * is no path from a bad series to a 500 on `/admin`, and the tests assert
 * `not.toThrow()` as well as the value, because a return type cannot promise that.
 */
import { enumerateDays } from './series';

/**
 * How many daily observations before a trend is reported at all. **A JUDGEMENT, AND
 * LABELLED AS ONE** -- `PERSONA_MIN_AGE_SECONDS`'s *"IS A GUESS"* precedent.
 *
 * 14, for three reasons in order of weight:
 *
 *   1. **Weekly rhythm is real and unmodelled.** A tarot app is used differently on a
 *      Sunday evening than a Tuesday morning, and OLS with no seasonal term absorbs
 *      that into the residuals -- which is fine, and is why the band exists, but only
 *      if the series contains whole weeks. Seven points fit a line through ONE
 *      instance of the weekly shape and mistake it for a trend. Fourteen is two.
 *   2. **`s^2` divides by `n - 2`.** At `n = 3` one point moves the band by a factor
 *      of two.
 *   3. A-D8 on seven points, above.
 *
 * It is not derived from this app's data, because this app has no data. The instrument
 * that would revise it is the sweep's nightly size probe plus a month of real traffic.
 */
export const MIN_FORECAST_DAYS = 14;

/** How far `crossing()` will walk. **Never a date in 2031.** */
export const MAX_HORIZON_DAYS = 365;

/**
 * Two-sided 95% Student's t by degrees of freedom, `df = 1..30`; `1.96` above.
 *
 * **A TABLE OF THIRTY FLOATS IS NOT A DEPENDENCY, AND A FLAT `2.0` IS NOT A
 * SIMPLIFICATION.** The reflex value understates the band at `n = 14` (`df = 12`,
 * `t = 2.179`) by 8% -- so a band that is 8% too tight at the exact `n` where the
 * forecast first appears is a band that first appears wrong.
 */
const T95: readonly number[] = [
  // index 0 unused; df starts at 1
  NaN, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201,
  2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064,
  2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
];

function tCritical(df: number): number {
  if (df < 1) return NaN;
  return df <= 30 ? T95[df] : 1.96;
}

/** One day of a zero-filled series. `t` is the day index from the range's start. */
export type Point = { t: number; y: number };

/** A point estimate and its band. **Never destructurable down to a bare number.** */
export type Banded = { point: number; lower: number; upper: number };

export type Forecast =
  | { kind: 'insufficient'; have: number; need: number; moreDaysNeeded: number }
  | { kind: 'flat'; n: number; mean: number }
  | {
      kind: 'trend';
      n: number;
      slopePerDay: number;
      intercept: number;
      /**
       * **REPORTED, NEVER A GATE.** A straight line through pure noise has a huge
       * band, and the band is already the mechanism that stops it lying. An R²
       * threshold would invent a second number nobody chose and would produce the
       * empty state on data that is genuinely flat -- which `kind: 'flat'` already
       * handles honestly.
       */
      r2: number;
      /** The band at any future day index. There is no variant that returns a bare
       *  point, which is invariant A11 expressed as a type rather than a convention. */
      at: (dayIndex: number) => Banded;
    };

/**
 * When a rising series is projected to reach `target`.
 *
 * **THE ANSWER IS A RANGE OF DATES, NEVER ONE DATE** -- `earliest` is where the UPPER
 * bound reaches the target and `central` is where the point estimate does. Rendering
 * `central` alone is the chart lying with a straight face, which is why `n` and `r2`
 * travel with it and why A4 must show `k` beside it.
 */
export type Crossing =
  | { kind: 'not-approaching' }
  | { kind: 'already-above'; on: 'today' }
  | { kind: 'beyond-horizon'; days: number }
  | {
      kind: 'crossing';
      /** Day index and calendar day where the UPPER bound first reaches `target`. */
      earliest: { dayIndex: number; day: string };
      /** Where the POINT estimate does, or `null` if that is beyond the horizon. */
      central: { dayIndex: number; day: string } | null;
    };

function insufficient(have: number): Forecast {
  return {
    kind: 'insufficient',
    have,
    need: MIN_FORECAST_DAYS,
    moreDaysNeeded: Math.max(0, MIN_FORECAST_DAYS - have),
  };
}

/**
 * Fit a line to a zero-filled daily series.
 *
 * **THE SERIES MUST BE ZERO-FILLED BEFORE IT GETS HERE** (`series.zeroFill`). A missing
 * day is not a missing observation -- it is a day on which nothing happened -- and
 * treating it as absent tilts every slope upward. This function cannot tell the
 * difference and does not try to.
 */
export function forecast(points: readonly Point[]): Forecast {
  if (!Array.isArray(points)) return insufficient(0);
  const n = points.length;
  if (n < MIN_FORECAST_DAYS) return insufficient(n);

  // A single NaN poisons every sum silently, and the result is a line with NaN
  // endpoints that renders as nothing at all rather than as an error.
  for (const p of points) {
    if (!Number.isFinite(p?.t) || !Number.isFinite(p?.y)) return insufficient(n);
  }

  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.t;
    sumY += p.y;
  }
  const xbar = sumX / n;
  const ybar = sumY / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.t - xbar;
    const dy = p.y - ybar;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }

  // Cannot happen with distinct day indices. Guarded because "cannot happen" is how a
  // division by zero ships.
  if (sxx === 0) return insufficient(n);

  // Every y identical -- including all zeros, which is the honest reading of "nothing
  // happened". Checked BEFORE the R² division, whose denominator is this.
  if (syy === 0) return { kind: 'flat', n, mean: ybar };

  const slope = sxy / sxx;
  const intercept = ybar - slope * xbar;

  let sse = 0;
  for (const p of points) {
    const e = p.y - (intercept + slope * p.t);
    sse += e * e;
  }

  const s = Math.sqrt(Math.max(0, sse) / (n - 2));
  const r2 = 1 - sse / syy;
  const t = tCritical(n - 2);

  const at = (dayIndex: number): Banded => {
    const point = intercept + slope * dayIndex;
    const dx = dayIndex - xbar;
    const se = s * Math.sqrt(1 + 1 / n + (dx * dx) / sxx);
    const half = t * se;
    // BOTH BOUNDS CLAMPED AT 0: every series here is a count, and a negative forecast
    // is not a wide band, it is a wrong one.
    return {
      point: Math.max(0, point),
      lower: Math.max(0, point - half),
      upper: Math.max(0, point + half),
    };
  };

  return { kind: 'trend', n, slopePerDay: slope, intercept, r2, at };
}

/**
 * Walk forward from the end of the fitted range and find where `target` is reached.
 *
 * **A 365-STEP LOOP RATHER THAN A CLOSED FORM, DELIBERATELY.** The upper bound is not
 * linear in `x0` -- the `(x0 - xbar)^2 / Sxx` term is quadratic under a square root --
 * so there is no closed form, and being clever here would cost more than 365
 * multiplications.
 *
 * `lastDay` is the last calendar day of the fitted range, so day index `n - 1`;
 * `dayIndex` counts from the range's start, exactly as `Point.t` does.
 */
export function crossing(
  fit: Forecast,
  target: number,
  lastDay: string,
  horizonDays: number = MAX_HORIZON_DAYS,
): Crossing {
  if (fit.kind !== 'trend') return { kind: 'not-approaching' };
  if (!Number.isFinite(target) || target <= 0) return { kind: 'not-approaching' };

  // A DECLINING SERIES HAS NO CROSSING. Inventing a date out of noise is the lie
  // §6.1 lists third, and it is the one that survives review because it looks like
  // diligence.
  if (fit.slopePerDay <= 0) return { kind: 'not-approaching' };

  const lastIndex = fit.n - 1;
  if (fit.at(lastIndex).point >= target) return { kind: 'already-above', on: 'today' };

  const horizon = Math.max(0, Math.min(horizonDays, MAX_HORIZON_DAYS));
  // enumerateDays is inclusive, so `horizon` steps past `lastDay` needs horizon + 1
  // entries; a malformed `lastDay` yields [] and every `day` below falls back to ''.
  const days = enumerateDays(lastDay, addDays(lastDay, horizon));

  let earliest: { dayIndex: number; day: string } | null = null;
  let central: { dayIndex: number; day: string } | null = null;

  for (let step = 1; step <= horizon; step += 1) {
    const dayIndex = lastIndex + step;
    const band = fit.at(dayIndex);
    const day = days[step] ?? '';
    if (earliest === null && band.upper >= target) earliest = { dayIndex, day };
    if (central === null && band.point >= target) central = { dayIndex, day };
    if (earliest !== null && central !== null) break;
  }

  if (earliest === null) return { kind: 'beyond-horizon', days: horizon };
  return { kind: 'crossing', earliest, central };
}

/** `'YYYY-MM-DD'` plus `n` days, or `''` if the input is not a calendar day. */
function addDays(day: string, n: number): string {
  const t = new Date(`${day}T00:00:00Z`).getTime();
  if (Number.isNaN(t)) return '';
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The fitted line and its band over `days` ahead, for a dashed projection.
 *
 * Returned as a separate function rather than baked into `Forecast` so the fit itself
 * stays a small object -- and so a caller that only wants the crossing date does not
 * allocate 365 bands.
 */
export function horizon(
  fit: Forecast,
  lastDay: string,
  days: number,
): { dayIndex: number; day: string; point: number; lower: number; upper: number }[] {
  if (fit.kind !== 'trend') return [];
  const n = Math.max(0, Math.min(days, MAX_HORIZON_DAYS));
  const calendar = enumerateDays(lastDay, addDays(lastDay, n));
  const out = [];
  for (let step = 1; step <= n; step += 1) {
    const dayIndex = fit.n - 1 + step;
    out.push({ dayIndex, day: calendar[step] ?? '', ...fit.at(dayIndex) });
  }
  return out;
}
