/**
 * Every chart's table view. **Required, not optional** (I-13).
 *
 * It discharges three separate obligations at once, which is why it is one component and
 * not three affordances:
 *
 *   1. The `--pairs all` CVD WARN's *"mandatory secondary encoding"*.
 *   2. Axis ticks at 11px in `--muted`, which clear 4.5:1 but are small.
 *   3. A screen reader, for which an SVG path is nothing at all.
 *
 * `<details>` is the toggle and there is no JavaScript here.
 *
 * **A `null` CELL PRINTS `emptyCell`, NEVER `0`.** A3 is careful to keep the two apart --
 * `numOrNull` exists so that *"no measurement" is not 0ms* -- and a table that renders a
 * null as zero throws that distinction away at the last step. The string is a prop
 * because I-16 forbids a literal, and `copy.ts` spells it `—`.
 */
import type { TableSpec } from './types';
import styles from './TableView.module.css';

export function TableView({ caption, toggleLabel, columns, rows, emptyCell = '' }: TableSpec) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>{toggleLabel}</summary>
      <div className={styles.scroller}>
        <table className={styles.table}>
          <caption className={styles.caption}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`${styles.th}${c.numeric ? ` ${styles.numeric}` : ''}`}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              // The row's first cell is its identity, so it keys the row. Two rows with
              // the same first cell would be a defect in the caller's fold, not here.
              <tr key={`${String(r.cells[0])}-${i}`}>
                {r.cells.map((cell, j) => {
                  const numeric = columns[j]?.numeric ?? false;
                  return (
                    <td key={j} className={`${styles.td}${numeric ? ` ${styles.numeric}` : ''}`}>
                      {j === 0 && r.swatch ? (
                        <span
                          className={styles.swatch}
                          style={{ background: r.swatch }}
                          aria-hidden="true"
                        />
                      ) : null}
                      {cell === null ? emptyCell : cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
