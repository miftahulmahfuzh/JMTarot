/**
 * The chart card: an opaque panel, a title, the plot, a legend if the chart has one, and
 * the table view. **A server component**, like everything here except `ChartHover`.
 *
 * ── IT IS THE ONLY FILE THAT RENDERS A LEGEND (I-9) ──────────────────────────
 *
 * `Legend` is imported here and nowhere else, and `chart.contract.test.ts` asserts that
 * import count. The gate is `series.length >= 2`, in one place, so the rule *"a legend
 * renders iff there are ≥2 series"* cannot be half-applied: a single series needs none
 * because the title names it, and a one-swatch box restates the title.
 *
 * ── `table` IS REQUIRED AND THAT IS THE ACCESSIBILITY DECISION (I-13) ────────
 *
 * Not optional, not defaulted -- **a chart cannot be constructed without one.** It is the
 * relief the `--pairs all` CVD WARN obliges and the sub-4.5:1 tick contrast obliges, and
 * it is how a screen reader reads a chart. An optional accessibility affordance is an
 * absent one; a required prop is a compile error.
 *
 * ── AND IT HARDCODES NO STRING (I-16) ───────────────────────────────────────
 *
 * Title, subtitle, footnote, the table's caption and even its `<summary>` word all
 * arrive as props from `src/app/admin/copy.ts`. A primitive that spelled one itself
 * would be the crack through which the i18n catalog arrives (A-D12, R33 -- the grep is
 * the whole enforcement).
 */
import type { ReactNode } from 'react';
import { Legend } from './Legend';
import { TableView } from './TableView';
import type { ChartSeries, TableSpec } from './types';
import styles from './ChartFrame.module.css';

export type ChartFrameProps = {
  title: string;
  /** Where a caveat rides with the chart: R25's two calendar systems, R12's `Jam (WIB)`,
   *  M5's "a lower bound on the counter". */
  subtitle?: string;
  /** The series the plot draws. **Drives the legend gate and nothing else here.** */
  series: ChartSeries[];
  /** Required (I-13). */
  table: TableSpec;
  /** `n`, R², `k` -- the numbers A-D8 requires travel with a forecast. */
  footnote?: string;
  /** Which swatch shape the legend uses; it must MIRROR the mark. */
  legendMark?: 'rect' | 'line';
  children: ReactNode;
};

export function ChartFrame({
  title,
  subtitle,
  series,
  table,
  footnote,
  legendMark = 'rect',
  children,
}: ChartFrameProps) {
  return (
    <figure className={styles.figure}>
      <div className={styles.head}>
        <figcaption className={styles.title}>{title}</figcaption>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>

      <div className={styles.body}>{children}</div>

      {/* THE ONE LEGEND GATE IN THE REPO. See the header. */}
      {series.length >= 2 ? <Legend series={series} mark={legendMark} /> : null}

      {footnote ? <p className={styles.footnote}>{footnote}</p> : null}

      <TableView {...table} />
    </figure>
  );
}
