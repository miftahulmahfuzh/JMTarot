/**
 * The weekday x hour heatmap, and its required `ScaleLegend`.
 *
 * ── THE HOUR AXIS IS AN APPROXIMATION AND THE LABEL IS THE WHOLE DIFFERENCE ──
 *
 * §1.7 / R12. `llm_calls.local_date` is a date with **no time**, and `created_at` is UTC, so
 * **the querent's local hour is not derivable from the ledger.** Weekday comes from
 * `local_date` (correct, no zone involved); hour comes from `created_at AT TIME ZONE
 * 'Asia/Jakarta'`.
 *
 * Indonesia has no DST, so the offset is fixed and the mapping is exact for the population
 * that matters -- and the operator asking "when is the app busy" is in Jakarta. **An
 * unlabelled local-hour axis derived from UTC is a chart that lies**, so `Jam (WIB)` is not
 * decoration: it is the claim being narrowed to the one that is true. The label arrives as a
 * required prop (I-16) and the page passes it from `copy.ts`.
 *
 * ── A CELL'S VALUE OF 0 IS EMPTY, NOT "LOWEST" ──────────────────────────────
 *
 * `bucketFor(0) === null` and a null bucket renders as the outlined surface. On this grid
 * most cells are genuinely empty and a painted one claims data.
 */
import { SEQUENTIAL } from '@/theme/chart';
import { bucketFor } from './geometry';
import styles from './Heatmap.module.css';

export type HeatCell = {
  /** 0..6. The caller decides which day 0 is and labels it; nothing here assumes Monday. */
  row: number;
  /** 0..23, Jakarta. See the header. */
  col: number;
  value: number;
  /** What the cell's readout and its accessible name say. Pre-formatted (I-16). */
  readout: string;
};

export type HeatmapProps = {
  cells: HeatCell[];
  /** Weekday labels, in `row` order. Length is the grid's row count. */
  rowLabels: string[];
  /** Hour labels, in `col` order. */
  colLabels: string[];
  /** The largest value in the range, for the shared bucket scale. */
  max: number;
  /** `ScaleLegend`'s bounds and its "more" word. Required -- see `ScaleLegend`. */
  scale: ScaleLegendProps;
};

/**
 * The grid.
 *
 * **The DOM order is hour-major** (24 groups of 7), which is what makes ONE grid work in
 * both orientations: on the phone the container is 7 columns wide so each group of seven
 * becomes a row of weekdays; above 520px it is 24 wide, so the same cells lay out as 7 rows
 * of hours. One markup, one container query, no duplicated cells -- and a screen reader
 * reads it in a consistent order either way, because the order never changes.
 */
export function Heatmap({ cells, rowLabels, colLabels, max, scale }: HeatmapProps) {
  const byKey = new Map(cells.map((c) => [`${c.row}:${c.col}`, c]));

  return (
    <div className={styles.wrap}>
      <div className={styles.axisRow} aria-hidden="true">
        {rowLabels.map((l) => (
          <span key={l} className={styles.axisLabel}>
            {l}
          </span>
        ))}
      </div>

      <div className={styles.grid} role="grid" aria-label={scale.caption}>
        {colLabels.flatMap((colLabel, col) =>
          rowLabels.map((rowLabel, row) => {
            const cell = byKey.get(`${row}:${col}`);
            const value = cell?.value ?? 0;
            const bucket = bucketFor(value, max);
            return (
              <button
                key={`${row}:${col}`}
                type="button"
                className={`${styles.cell}${bucket === null ? ` ${styles.empty}` : ''}`}
                style={bucket === null ? undefined : { background: SEQUENTIAL[bucket] }}
                // The accessible name and the readout are the SAME string, so a screen
                // reader and a sighted reader get the same sentence.
                aria-label={cell?.readout ?? `${rowLabel} ${colLabel}`}
              >
                <span className={styles.readout}>{cell?.readout ?? `${rowLabel} ${colLabel}`}</span>
              </button>
            );
          }),
        )}
      </div>

      <ScaleLegend {...scale} />
    </div>
  );
}

export type ScaleLegendProps = {
  /** The grid's own description, used as its accessible name too. */
  caption: string;
  /** Pre-formatted bounds -- `1` and the max. */
  minLabel: string;
  maxLabel: string;
};

/**
 * The sequential scale's legend. **Required beside a heatmap, never optional.**
 *
 * A sequential ramp with no legend is colour-only encoding on a continuous scale -- the one
 * case where the table view alone is not enough relief, because without it a reader cannot
 * even tell which end means more. It is exported separately only so the type can be a
 * required prop on `Heatmap`; there is no code path that renders the grid without it.
 */
export function ScaleLegend({ caption, minLabel, maxLabel }: ScaleLegendProps) {
  return (
    <div className={styles.scale}>
      <span>{minLabel}</span>
      <span className={styles.swatches} aria-hidden="true">
        {SEQUENTIAL.map((hex) => (
          <span key={hex} className={styles.swatch} style={{ background: hex }} />
        ))}
      </span>
      <span>{maxLabel}</span>
    </div>
  );
}
