/**
 * A multi-series line. **ONE y-domain, and one only** (I-7).
 *
 * ── THERE IS NO SECOND SCALE, AND THE TYPE IS WHY ────────────────────────────
 *
 * `yMax` is a single number. Token input against token output is two series on ONE axis
 * because they share a unit; tokens against cost, or calls against latency, is **two
 * charts**. `noDualAxis.test.ts` greps for the vocabulary (`y2`, `rightAxis`,
 * `secondaryAxis`, `axisRight`, `dualAxis`) and is honest about being a grep -- what
 * actually prevents a second scale is that no component here accepts one, and
 * `domainMax` is the one function that computes a shared domain.
 *
 * ── EVERY MARK WITH A PIXEL SIZE IS HTML (§3) ────────────────────────────────
 *
 * The SVG carries the path and nothing else -- no `<text>`, no `<circle>`. End-dots,
 * end-labels and the crosshair are HTML positioned by percent against the same box.
 * `Task 8`'s acceptance step greps this directory for `<text` and expects zero hits.
 *
 * ── A LONE POINT STILL RENDERS, AND THAT NEEDED CODE ─────────────────────────
 *
 * `linePath` emits `M x y` with no `L` for a single present value between two gaps, which
 * draws NOTHING. So a marker is rendered at every present point of a series short enough
 * to mark, and always at the last one. A day with one call, surrounded by days with none,
 * is exactly the series a fresh deployment has -- the case where an invisible chart would
 * be read as "no data" rather than "one call".
 */
import { slotColor } from '@/theme/chart';
import { VIEW, linePath, xAt, yAt } from './geometry';
import type { ChartSeries } from './types';
import styles from './Line.module.css';

export type LineProps = {
  series: ChartSeries[];
  /** THE single y-domain. See the header. */
  yMax: number;
  /**
   * Whether to mark and label every series' last point. On a two-series chart this is
   * how identity survives without colour (I-10); on a 90-point single series it is the
   * one number worth printing.
   */
  showEndLabels?: boolean;
  /** A series key to bring forward; the rest are drawn in `DEEMPH`. Used by nothing on
   *  the two shipped pages, and kept because the `emphasis` form is the honest answer to
   *  "one series matters and three are context" -- which is a chart A5 may want. */
  emphasis?: string;
};

export function Line({ series, yMax, showEndLabels = true, emphasis }: LineProps) {
  return (
    <>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {series.map((s) => (
          <path
            key={s.key}
            className={styles.path}
            d={linePath(s.values, yMax)}
            stroke={emphasis && s.key !== emphasis ? 'var(--chart-deemph)' : slotColor(s.slot)}
          />
        ))}
      </svg>

      {series.flatMap((s) => {
        const n = s.values.length;
        const colour =
          emphasis && s.key !== emphasis ? 'var(--chart-deemph)' : slotColor(s.slot);

        /*
         * Marks. On a short series every present point gets one -- which is what makes a
         * lone point between gaps visible at all (see the header). On a long one only the
         * last, because `marks-and-anatomy.md` forbids a number on every point and a dot
         * on every one of ninety is the same noise without the information.
         */
        const marked: number[] = [];
        if (n <= 14) {
          for (let i = 0; i < n; i += 1) if (isPresent(s.values[i])) marked.push(i);
        } else {
          for (let i = n - 1; i >= 0; i -= 1) {
            if (isPresent(s.values[i])) {
              marked.push(i);
              break;
            }
          }
        }

        const lastIdx = marked.length ? marked[marked.length - 1] : -1;

        return marked.map((i) => {
          const v = s.values[i] as number;
          const left = (xAt(i, n) / VIEW) * 100;
          const top = (yAt(v, yMax) / VIEW) * 100;
          const isLast = i === lastIdx;
          return (
            <span key={`${s.key}-${i}`}>
              <span
                className={styles.marker}
                style={{ left: `${left}%`, top: `${top}%`, background: colour }}
                aria-hidden="true"
              />
              {isLast && showEndLabels ? (
                <span
                  className={`${styles.endLabel} ${styles.endLabelInside}`}
                  style={{ top: `${top}%` }}
                >
                  {s.label}
                </span>
              ) : null}
            </span>
          );
        });
      })}
    </>
  );
}

function isPresent(v: number | null): v is number {
  return v !== null && Number.isFinite(v);
}
