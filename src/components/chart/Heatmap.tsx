/**
 * A two-dimensional heat grid and its required `ScaleLegend`. Generic over what the two axes
 * are; `/admin/tokens` uses it for **weekday x ISO week**.
 *
 * ── WHY NOT WEEKDAY x HOUR, WHICH IS WHAT §5.3 ASKED FOR ────────────────────
 *
 * §1.7 / R12: `llm_calls.local_date` is a date with **no time** and `created_at` is UTC, so
 * **the querent's local hour is not derivable from the ledger.** R12 ruled the hour version
 * ships Jakarta-pinned and labelled `Jam (WIB)` -- *an unlabelled local-hour axis derived from
 * UTC is a chart that lies* -- or not at all, and §10 asked A3 for the query behind it.
 *
 * **A3 shipped no hour query, and `queries/admin/**` is A3's by §7.** So the hour axis is a
 * stated gap and the page folds the axis §1.7 itself calls exact -- *"weekday comes from
 * `local_date`, correct, no zone involved"* -- against the week. No pinning, no approximation
 * and no label narrowing a claim. `src/app/admin/copy.ts` says so on the card.
 *
 * ── A CELL'S VALUE OF 0 IS EMPTY, NOT "LOWEST" ──────────────────────────────
 *
 * `bucketFor(0) === null` and a null bucket renders as the outlined surface. On a calendar the
 * range's first and last weeks are always part-empty -- a 30-day range starts mid-week -- so a
 * painted cell there would claim data on days outside the range entirely.
 */
import { SEQUENTIAL } from '@/theme/chart';
import { bucketFor } from './geometry';
import styles from './Heatmap.module.css';

export type HeatCell = {
  /** The row index, `0..rowLabels.length - 1`. The CALLER decides what a row is and labels
   *  it; nothing here assumes a weekday, a Monday or a count. */
  row: number;
  /** The column index, `0..colLabels.length - 1`. */
  col: number;
  value: number;
  /** What the cell's readout and its accessible name say. Pre-formatted (I-16). */
  readout: string;
};

export type HeatmapProps = {
  cells: HeatCell[];
  /**
   * The labels printed ACROSS THE TOP, in `row` order -- the weekdays.
   *
   * The grid is `rowLabels.length` columns wide, so this array's length and the template must
   * agree: `Heatmap.module.css` hardcodes seven tracks, which is what a weekday axis is. A
   * caller passing eight would get a wrapped grid, and the module's header records that
   * failure happening once already for a different reason.
   */
  rowLabels: string[];
  /** One entry per column-group -- the ISO weeks. Not printed; it sets the cell count and
   *  feeds each cell's readout. */
  colLabels: string[];
  /** The largest value in the range, for the shared bucket scale. */
  max: number;
  /** `ScaleLegend`'s bounds and its "more" word. Required -- see `ScaleLegend`. */
  scale: ScaleLegendProps;
};

/**
 * The grid.
 *
 * **THE DOM ORDER IS WEEK-MAJOR** -- all seven weekdays of the first week, then the second --
 * and the grid is seven columns wide at every width, so each row IS one week and each column
 * IS one weekday. One markup, no orientation, and the labels can only ever name the dimension
 * they sit over.
 *
 * The first version flipped to 24 columns above 520px, inherited from §5.3's weekday x HOUR
 * design. The 1440px screenshot showed both consequences at once: seven weekday labels over
 * twenty-four columns, and 98 cells wrapping into rows of 24 so the calendar stopped being a
 * calendar. `Heatmap.module.css`'s header has the full account.
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
