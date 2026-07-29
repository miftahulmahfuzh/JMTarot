/**
 * The chart maths. **PURE: no React, no DOM, no `process.env`, no import of anything
 * that touches the world.** This is the part `npm test` can reach, and it is where
 * every claim a chart makes about a number actually lives -- the `swipeDeck.ts`
 * precedent, where *the whole policy in a pure module is the part a unit test can
 * own*.
 *
 * ── THE COORDINATE SYSTEM, AND WHY IT IS 0..1000 AND NOT PIXELS ──────────────
 *
 * §3 of A4's plan is the derivation and it is the most load-bearing decision here:
 * **SVG holds only the marks that have no intrinsic pixel size** -- a line path, an
 * area polygon, a band, a dashed projection. Everything with a specified pixel count
 * (all text, markers and their rings, bars, heat cells, the meter) is HTML/CSS, because
 * everything inside a uniformly-scaled `viewBox` scales, including things whose
 * specification IS a pixel count: an 11px tick renders at 14-23px on a desktop
 * container, a 20px bar becomes 31-50px, and a 4px data-end radius has no
 * `vector-effect` to rescue it.
 *
 * So each chart's SVG uses `preserveAspectRatio="none"` over a clean data-space
 * viewBox with a CSS-fixed rendered height, plus `vector-effect="non-scaling-stroke"`.
 * Under those two, a 2px stroke is drawn 2px wide perpendicular to the sheared path --
 * exactly right -- and a sheared filled polygon IS the plot transform.
 *
 * `VIEW` is 1000x1000 so a path's numbers read as tenths of a percent, which is also
 * what lets HTML be positioned over the plot with no `ResizeObserver` and no
 * measurement: a point at index `i` sits at `left: (i/(n-1))*100%`, `top: (1 -
 * v/yMax)*100%` of the SAME box.
 */

/** The data-space square every chart path is expressed in. */
export const VIEW = 1000;

/** How many points a sparkline shows. Twelve: enough to read a shape, few enough that
 *  each segment is wide enough to see at 240x48 rendered 24px tall. */
export const SPARK_POINTS = 12;

/** A value that was never measured. **Never 0** -- `numOrNull` in A3's metrics keeps
 *  the two apart for the same reason, and a chart must not draw through a gap. */
export type Gap = null;

/**
 * The x of index `i` in view units. `n === 1` sits at the left edge rather than
 * dividing by zero -- a one-point series is a dot, and A3's `readingsByLocalDate` can
 * legitimately return one row.
 */
export function xAt(i: number, n: number): number {
  if (n <= 1) return 0;
  return (i / (n - 1)) * VIEW;
}

/**
 * The y of `v` in view units, **inverted, because SVG y grows downward**.
 *
 * `yMax <= 0` maps everything to the baseline instead of dividing by zero: an all-zero
 * day is a flat line on the floor, which is the honest picture, and a `NaN` path
 * renders as nothing at all with no error anywhere.
 */
export function yAt(v: number, yMax: number): number {
  if (!Number.isFinite(v) || !Number.isFinite(yMax) || yMax <= 0) return VIEW;
  const clamped = Math.max(0, Math.min(v, yMax));
  return VIEW - (clamped / yMax) * VIEW;
}

/**
 * An SVG path for one series.
 *
 * **A `null` STARTS A NEW SUBPATH -- A GAP, NEVER AN INTERPOLATION.** Bridging a
 * missing day invents a measurement, and the invented one always looks smoother than
 * the truth. `Line`'s own rule and `forecast()`'s agree: *a missing day is not a
 * missing observation.* So `[1, null, 3]` emits two `M` commands and no line between
 * them, and `geometry.test.ts` asserts exactly that.
 *
 * A lone point between two gaps still emits `M x y` with no `L`, which renders as
 * nothing -- so `Line` draws an HTML marker at every point of a single-point subpath.
 * That is the one place the SVG cannot carry the whole answer, and it is handled in
 * the component rather than by thickening the path here.
 */
export function linePath(values: readonly (number | Gap)[], yMax: number): string {
  const n = values.length;
  const out: string[] = [];
  let open = false;
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      open = false;
      continue;
    }
    const cmd = open ? 'L' : 'M';
    out.push(`${cmd}${r(xAt(i, n))} ${r(yAt(v, yMax))}`);
    open = true;
  }
  return out.join(' ');
}

/**
 * The closing polygon for an area: the line, then down to the baseline and back.
 *
 * **ONE SUBPATH PER RUN OF PRESENT VALUES**, so a gap is a gap in the fill too. A
 * single polygon spanning a gap would shade days on which nothing was measured, which
 * is the same lie as interpolating, wearing a wash.
 */
export function areaPath(values: readonly (number | Gap)[], yMax: number): string {
  const n = values.length;
  const runs: number[][] = [];
  let run: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    run.push(i);
  }
  if (run.length) runs.push(run);

  const out: string[] = [];
  for (const idx of runs) {
    const first = idx[0];
    const last = idx[idx.length - 1];
    const head = idx
      .map((i, k) => `${k === 0 ? 'M' : 'L'}${r(xAt(i, n))} ${r(yAt(values[i] as number, yMax))}`)
      .join(' ');
    out.push(`${head} L${r(xAt(last, n))} ${VIEW} L${r(xAt(first, n))} ${VIEW} Z`);
  }
  return out.join(' ');
}

/**
 * A band polygon between an upper and a lower series -- the forecast's residual band.
 *
 * Up the lower edge and back along the upper, so the winding is consistent and a fill
 * rule can never punch a hole in it. Indices are taken from `lower`, which must be the
 * same length as `upper`; a mismatch returns `''` rather than drawing half a band,
 * because half a band reads as a narrower one.
 */
export function bandPath(
  lower: readonly number[],
  upper: readonly number[],
  yMax: number,
  xOffset = 0,
  xTotal?: number,
): string {
  if (lower.length !== upper.length || lower.length === 0) return '';
  const n = xTotal ?? lower.length;
  const fwd = lower.map(
    (v, k) => `${k === 0 ? 'M' : 'L'}${r(xAt(k + xOffset, n))} ${r(yAt(v, yMax))}`,
  );
  const back = [...upper]
    .map((v, k) => ({ v, k }))
    .reverse()
    .map(({ v, k }) => `L${r(xAt(k + xOffset, n))} ${r(yAt(v, yMax))}`);
  return [...fwd, ...back, 'Z'].join(' ');
}

/** Four decimals. Enough for a 1000-unit view space at any rendered width, and short
 *  enough that a path is readable in `view-source` -- which is how the first
 *  chunk-boundary bug in this project was found. */
function r(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Stacks
// ---------------------------------------------------------------------------

export type Segment<T> = { datum: T; value: number; pct: number };

/**
 * Turn values into percentages that **always close at exactly 100**.
 *
 * **THE LAST SEGMENT TAKES THE REMAINDER, AND THAT IS THE WHOLE FUNCTION.** A naive
 * `round(v/total*100, 4)` per segment leaves a sub-pixel sliver of surface at the end
 * of the bar, and at 20px tall on a dark panel that sliver **reads as a fifth
 * category**. Giving the last segment `100 - sum(the rest)` is arithmetically the same
 * claim and cannot leave a gap.
 *
 * Zero-valued segments are DROPPED, not rendered at 0% -- a zero-width flex child still
 * takes its 2px gap, so four zero segments would draw 8px of nothing at the end of a
 * bar. `[0, 0, 100]` is one segment at 100%, which is what it means.
 *
 * A non-finite value is dropped for the same reason `foldOps` drops one: one `NaN`
 * poisons the total and the whole bar renders empty with nothing on screen to say why.
 */
export function stackSegments<T>(
  rows: readonly { datum: T; value: number }[],
): { segments: Segment<T>[]; total: number } {
  const clean = rows.filter((s) => Number.isFinite(s.value) && s.value > 0);
  const total = clean.reduce((a, s) => a + s.value, 0);
  if (total <= 0) return { segments: [], total: 0 };

  const segments: Segment<T>[] = [];
  let used = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const isLast = i === clean.length - 1;
    const pct = isLast
      ? round4(100 - used)
      : round4((clean[i].value / total) * 100);
    used = round4(used + pct);
    segments.push({ datum: clean[i].datum, value: clean[i].value, pct });
  }
  return { segments, total };
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

// ---------------------------------------------------------------------------
// Sequential buckets
// ---------------------------------------------------------------------------

/**
 * Which of five sequential steps a value belongs in, or **`null` for empty**.
 *
 * **`value === 0` RETURNS `null` AND THAT IS NOT AN EDGE CASE.** A heat cell painted
 * the lowest bucket **claims data** -- and on a weekday x hour grid most cells are
 * genuinely empty, so the difference between "quiet" and "nothing" is the whole
 * information content of the chart. `Heatmap` renders a `null` bucket as the surface
 * with a 1px outline, so an empty cell is visibly a cell and visibly empty.
 *
 * Buckets are equal-width over `[1, max]`, not quantiles: a quantile scale over mostly
 * empty data puts a cell with one call in the top bucket, which is the same lie in the
 * other direction. `max <= 0` (nothing measured at all) is `null` throughout.
 */
export function bucketFor(value: number, max: number, buckets = 5): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (!Number.isFinite(max) || max <= 0) return null;
  if (value >= max) return buckets - 1;
  const width = max / buckets;
  return Math.min(buckets - 1, Math.floor(value / width));
}

// ---------------------------------------------------------------------------
// Axes
// ---------------------------------------------------------------------------

export type Tick = { at: number; value: number };

/**
 * Round numbers for a y-axis, and **the domain always includes 0** (I-8).
 *
 * Every metric in this release is a count or a sum of counts, and a truncated baseline
 * on a count exaggerates a change with nothing on screen to say so. There is no option
 * to switch it off -- that is the whole point of it being here rather than a prop.
 *
 * `at` is a fraction of the plot height from the BOTTOM, so a caller writes
 * `bottom: at*100%` and never does the inversion itself. A `max` of 0 yields a single
 * tick at 0, because an axis of one line is more honest than an invented scale.
 *
 * ── THE STEP IS AN INTEGER, AND A TEST FOUND THAT IT WAS NOT ─────────────────
 *
 * The textbook 1-2-5 progression scales by `10^floor(log10(raw))`, which goes BELOW 1
 * for a small max: with `max = 1` over four ticks, `raw = 0.25` and the step comes out
 * at **0.5**, so the axis reads `0 · 0,5 · 1`. Half a model call does not exist, and
 * this is the commonest series a fresh deployment has -- one call on one day. The floor
 * of 1 is what keeps the axis literally readable, and it is the same argument that
 * keeps 2.5 out of the progression entirely (see `geometry.test.ts`).
 *
 * The cost is that `max = 1` gives ticks `0 · 1` rather than five even ones, which is
 * exactly right: there is one thing to say about that data.
 */
export function niceTicks(max: number, count = 4): { ticks: Tick[]; yMax: number } {
  if (!Number.isFinite(max) || max <= 0) return { ticks: [{ at: 0, value: 0 }], yMax: 1 };

  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = Math.max(1, (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag);
  const yMax = Math.ceil(max / step) * step;

  const ticks: Tick[] = [];
  for (let v = 0; v <= yMax + step / 2; v += step) {
    ticks.push({ at: yMax > 0 ? v / yMax : 0, value: round4(v) });
  }
  return { ticks, yMax };
}

/**
 * Which x labels to print so they do not collide.
 *
 * Returns the INDICES to label. A number on every point is what
 * `marks-and-anatomy.md` forbids -- *selective direct labels, never a number on every
 * point* -- and on a 90-day range at 320px there is room for about four. Always
 * includes the first and last index, because the ends of a range are the two a reader
 * actually looks for.
 */
export function tickIndices(n: number, max: number): number[] {
  if (n <= 0) return [];
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const out = new Set<number>([0, n - 1]);
  const stride = (n - 1) / (max - 1);
  for (let k = 1; k < max - 1; k += 1) out.add(Math.round(k * stride));
  return [...out].sort((a, b) => a - b);
}

/**
 * The index nearest a fraction across the plot, for the crosshair.
 *
 * **THE CROSSHAIR FINDS AN X INDEX, NOT A POINT** (I-19): a reader aims at a date,
 * never at a 2px line, so snapping to the nearest index is what makes the readout land
 * where the pointer went. Clamped, so a pointer in the axis band still reads the end
 * of the series rather than returning nothing.
 */
export function nearestIndex(fraction: number, n: number): number {
  if (n <= 0) return -1;
  if (!Number.isFinite(fraction)) return 0;
  const i = Math.round(fraction * (n - 1));
  return Math.max(0, Math.min(n - 1, i));
}

/**
 * The largest value across several series, for a SHARED y-domain.
 *
 * **THIS IS THE FUNCTION THAT MAKES I-7 STRUCTURAL.** Two series on one chart get ONE
 * `yMax` from this, so there is no code path that produces a second scale -- token
 * input against token output share a unit and share an axis, and tokens against cost
 * is two charts. `noDualAxis.test.ts` greps for the vocabulary; this is why the
 * vocabulary never becomes necessary.
 */
export function domainMax(series: readonly { values: readonly (number | Gap)[] }[]): number {
  let max = 0;
  for (const s of series) {
    for (const v of s.values) {
      if (v !== null && v !== undefined && Number.isFinite(v) && v > max) max = v;
    }
  }
  return max;
}
