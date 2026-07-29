/**
 * An area chart: `Line`'s path plus a polygon closed to the baseline.
 *
 * ── EXACTLY ONE SERIES, ENFORCED BY THE TYPE ─────────────────────────────────
 *
 * `series` is a one-tuple, not an array. **Stacked area is deliberately absent** and the
 * type is what keeps it out: four hues at 10% opacity over one another is mud, and
 * part-to-whole is `StackedBar`'s job. A single-element tuple makes "just add a second
 * series" a compile error rather than a judgement call at 11pm.
 *
 * The fill is the series hue at 10% -- a wash that says *this line and the space under it
 * are one thing*, with the 2px line still carrying the shape. `areaPath` emits one polygon
 * per run of present values, so **a gap is a gap in the fill too**: a single polygon
 * spanning a gap would shade days on which nothing was measured, which is interpolation
 * wearing a wash.
 */
import { slotColor } from '@/theme/chart';
import { VIEW, areaPath } from './geometry';
import { Line } from './Line';
import type { ChartSeries } from './types';
import styles from './Line.module.css';

export type AreaProps = {
  /** A ONE-TUPLE. See the header -- this is how stacked area stays out. */
  series: [ChartSeries];
  yMax: number;
  showEndLabels?: boolean;
};

export function Area({ series, yMax, showEndLabels = false }: AreaProps) {
  const [s] = series;
  return (
    <>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          className={styles.areaFill}
          d={areaPath(s.values, yMax)}
          fill={slotColor(s.slot)}
          fillOpacity={0.1}
        />
      </svg>
      {/* The line and its marks, unchanged. `Area` adds a wash; it does not reimplement
          a path, so the two can never disagree about where the data is. */}
      <Line series={[s]} yMax={yMax} showEndLabels={showEndLabels} />
    </>
  );
}
