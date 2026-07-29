/**
 * The view shapes every chart component takes. **Props, never queries.**
 *
 * ── NO `@/lib/db/**` IMPORT, NOT EVEN AS `import type` (I-15) ────────────────
 *
 * `clientBoundary`-style regexes do not know the `type` keyword -- which is exactly why
 * `ReadingStatus` had to move to `@/data/types` when V6 shipped. So these shapes are
 * declared here structurally rather than derived from A3's row types, and the adapter
 * that maps one to the other is `src/app/admin/metrics.ts`. That indirection is not
 * ceremony: it is the reason an A3 shape change touches ONE file instead of eleven
 * components, and the reason `npm test` can render a chart with no database at all.
 *
 * ── A `slot` IS RESOLVED BY THE CALLER, ALWAYS (I-5) ─────────────────────────
 *
 * Every series carries a `slot` that the CALLER resolved from `READER_SLOT`,
 * `SERVICE_SLOT`, `DIRECTION_SLOT` or `OTHER_SLOT`. No component here maps a series to a
 * colour by its position in the array, and `slotColor` is the only indexer. That is what
 * makes *"colour follows the entity, never its rank"* structural: filtering to
 * `['margaret', 'adrian']` yields teal and violet, never gold and teal.
 *
 * ── EVERY USER-VISIBLE STRING IS A REQUIRED PROP (I-16) ─────────────────────
 *
 * No label, unit, empty-state sentence or `<summary>` word is hardcoded under
 * `src/components/chart/**`. Admin copy lives in `src/app/admin/copy.ts`, hardcoded
 * Indonesian, never the i18n catalog (A-D12) -- and a primitive that spelled one itself
 * would be the crack that lets the catalog in.
 */

/** A value that was never measured. **Never 0**; see `geometry.ts`. */
export type Maybe = number | null;

/** One series on a chart. `label` is what a legend and a direct label print. */
export type ChartSeries = {
  /** Stable identity -- the reader slug, the service id, `'input'` / `'output'`. */
  key: string;
  /** Resolved by the caller from a slot map. Never the array index. */
  slot: number;
  label: string;
  values: Maybe[];
};

/**
 * A table view, **required on every chart** (I-13).
 *
 * This is the relief the `--pairs all` CVD WARN and the sub-4.5:1 tick contrast both
 * oblige, and it is how a screen reader reads a chart. It costs zero JavaScript --
 * `<details>` is the toggle -- so there is no reason to make it optional and one very
 * good reason not to: an optional accessibility affordance is an absent one.
 */
export type TableSpec = {
  /** Printed in `<caption>`. The chart's own title, so the two cannot disagree. */
  caption: string;
  /** The `<summary>` word. A prop because I-16 forbids a literal here. */
  toggleLabel: string;
  columns: TableColumn[];
  rows: TableRow[];
  /**
   * What a `null` cell prints -- `copy.ts` supplies an em dash.
   *
   * **A NULL CELL MUST NOT PRINT `0`.** A3 keeps the two apart deliberately (`numOrNull`
   * exists so that *"no measurement" is not 0ms*), and a table that renders a null as
   * zero throws that distinction away at the last step, on the surface whose whole job
   * is to be trusted. A prop rather than a literal because of I-16.
   */
  emptyCell?: string;
};

export type TableColumn = {
  label: string;
  /** Right-aligned and `tabular-nums`. **The only place tabular figures are legal**
   *  outside an axis tick -- a stat tile's value is proportional (§1.10). */
  numeric?: boolean;
};

export type TableRow = {
  /** One cell per column. `null` prints the `emptyCell` string, never `0`. */
  cells: (string | number | null)[];
  /** A mark colour for the row's first cell, when the row IS a series. Optional
   *  because most tables are not keyed by colour at all. */
  swatch?: string;
};

/** What a tooltip or a per-mark readout prints. Values lead, labels follow -- the
 *  legend's hierarchy inverted, because here the reader already has the series and
 *  wants the number. */
export type Readout = {
  heading: string;
  rows: { label: string; value: string; swatch?: string }[];
};

/** A point on an axis. `at` is a fraction from the axis's origin, so a component writes
 *  `bottom: at*100%` or `left: at*100%` and never does an inversion of its own. */
export type AxisTick = { at: number; label: string };
