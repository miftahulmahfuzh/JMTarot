/**
 * The "when do we hit the ceiling" chart: the actual daily series, a residual band, a
 * dashed projection, and a solid ceiling rule.
 *
 * ── A-D8 IS ENFORCED BY THE TYPE, NOT BY DISCIPLINE ──────────────────────────
 *
 * *A forecast is NEVER rendered without its band and its `n`.* So this component takes A3's
 * `Forecast` union whole and does the rendering decision itself -- there is no prop through
 * which a caller could hand over a bare point estimate. **`ChartFrame`'s `footnote` carries
 * `n`, R² and `k`, and the page always passes it**; the band is not a prop at all, it is
 * computed from the same fit as the line.
 *
 * ── A3's FORECAST HAS THREE VARIANTS AND THE PLAN PREDICTED TWO ──────────────
 *
 * §10 of A4's plan specified `{ kind: 'ok' } | { kind: 'insufficient' }`. A3 shipped
 * `insufficient | flat | trend`, and **`flat` is the one a two-variant renderer would have
 * crashed on** -- it is what `forecast()` returns when every y is identical, *including all
 * zeros, which is the honest reading of "nothing happened"* and the commonest series a
 * fresh deployment has. Handled explicitly below:
 *
 *   - `insufficient` -> the empty state, **no line at all**, saying how many more days.
 *   - `flat`         -> the actual series and NO projection. A flat series has no
 *                       trajectory, and drawing a horizontal dashed line to the horizon
 *                       would be a forecast of nothing wearing the costume of one.
 *   - `trend`        -> line, band, dashed projection.
 *
 * ── DEGENERATE INPUT MUST NOT THROW ─────────────────────────────────────────
 *
 * `tally.ts`'s rule: *a heuristic may fail a build; it may not fail a person.* A one-point
 * series, an all-zero series and a `ceiling` of 0 all render something rather than throwing,
 * and Task 12's acceptance step names them.
 */
import type { Forecast } from '@/lib/analytics/forecast';
import { VIEW, bandPath, linePath, xAt, yAt } from './geometry';
import type { Maybe } from './types';
import styles from './Trajectory.module.css';

export type TrajectoryProps = {
  /** The zero-filled daily actuals, oldest first. */
  actual: Maybe[];
  /** A3's fit over those actuals. Taken whole; see the header. */
  fit: Forecast;
  /**
   * The projected band, from A3's `horizon(fit, lastDay, days)`. Empty for `flat` and
   * `insufficient`, and this component does not recompute it -- one fit, one projection.
   */
  projection: { point: number; lower: number; upper: number }[];
  /** `LLM_WINDOW_CALL_CEILING`, read by A3 (I-15 forbids `process.env` here). */
  ceiling: number;
  /** The shared y-domain, from `niceTicks` over actual + projection + ceiling. */
  yMax: number;
  /** Pre-formatted (I-16). */
  ceilingLabel: string;
  /** The empty-state sentence, already carrying the number of days still needed. */
  insufficientText: string;
};

export function Trajectory({
  actual,
  fit,
  projection,
  ceiling,
  yMax,
  ceilingLabel,
  insufficientText,
}: TrajectoryProps) {
  if (fit.kind === 'insufficient') {
    // NO LINE. See the header: an axis with a ceiling and no projection looks broken.
    return <p className={styles.empty}>{insufficientText}</p>;
  }

  const n = actual.length + projection.length;
  const ceilingAt = ceiling > 0 && yMax > 0 ? 1 - Math.min(1, ceiling / yMax) : null;

  return (
    <>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* The band FIRST, so the lines sit on top of their own uncertainty. */}
        {projection.length > 0 ? (
          <path
            className={styles.band}
            d={bandPath(
              projection.map((p) => p.lower),
              projection.map((p) => p.upper),
              yMax,
              actual.length,
              n,
            )}
          />
        ) : null}

        <path className={styles.actual} d={linePath(padRight(actual, n), yMax)} />

        {projection.length > 0 ? (
          <path
            className={styles.projection}
            d={linePath(
              // The projection starts at the actual series' LAST point, so the dashes join
              // the solid line instead of floating a pixel away from it. Without the seam
              // the chart reads as two unrelated series.
              [
                ...blanks(actual.length - 1),
                lastPresent(actual),
                ...projection.map((p) => p.point),
              ],
              yMax,
            )}
          />
        ) : null}
      </svg>

      {ceilingAt !== null ? (
        <>
          <span className={styles.ceiling} style={{ top: `${ceilingAt * 100}%` }} aria-hidden="true" />
          <span className={styles.ceilingLabel} style={{ top: `${ceilingAt * 100}%` }}>
            {ceilingLabel}
          </span>
        </>
      ) : null}

      {/* The actual series' last point, marked, so "where we are now" is a mark and not
          the place two strokes happen to meet. */}
      {markLast(actual, n, yMax)}
    </>
  );
}

function padRight(values: Maybe[], total: number): Maybe[] {
  return [...values, ...blanks(total - values.length)];
}

function blanks(n: number): Maybe[] {
  return Array.from({ length: Math.max(0, n) }, () => null);
}

function lastPresent(values: Maybe[]): Maybe {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) return v;
  }
  return null;
}

function markLast(actual: Maybe[], n: number, yMax: number) {
  const v = lastPresent(actual);
  if (v === null) return null;
  const i = actual.length - 1;
  return (
    <span
      style={{
        position: 'absolute',
        left: `${(xAt(i, n) / VIEW) * 100}%`,
        top: `${(yAt(v, yMax) / VIEW) * 100}%`,
        width: 'var(--chart-mark)',
        height: 'var(--chart-mark)',
        marginLeft: 'calc(var(--chart-mark) / -2)',
        marginTop: 'calc(var(--chart-mark) / -2)',
        borderRadius: '50%',
        background: 'var(--chart-seq-5)',
        boxShadow: '0 0 0 var(--chart-ring) var(--chart-surface)',
      }}
      aria-hidden="true"
    />
  );
}
