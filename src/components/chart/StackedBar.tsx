/**
 * A horizontal stacked bar. **CSS flex rows, no SVG** (§3): a bar's thickness is a pixel
 * count, and inside a scaled viewBox 20px becomes 31-50px.
 *
 * ── THE PER-SEGMENT READOUT IS A `title`, AND THAT IS A DELIBERATE FLOOR ─────
 *
 * `interaction.md` gives bar/dot/cell marks a per-mark tooltip. A styled one needs either
 * a client component (I-17 caps this directory at one, and it is spent on the crosshair)
 * or a CSS `:hover` box on a 4px-wide segment, which cannot be reached by a thumb at all.
 * So the native `title` is the readout: it works on hover, it works with a keyboard on a
 * focusable element, it is announced, and **every number in it is also in the table view**,
 * which is what makes a modest tooltip legal (I-19).
 *
 * The segment is a `<span>` and not a `<button>` precisely because it does nothing when
 * activated -- a button that is not a control is worse for a screen reader than a labelled
 * span, and `Heatmap`'s cells are buttons only because they carry a CSS readout that needs
 * `:focus-visible`.
 *
 * ── EVERY STRING IS A PROP (I-16) ───────────────────────────────────────────
 *
 * Including the `title`'s shape: the caller passes a `readout` per segment, already
 * formatted with `Intl.NumberFormat('id-ID')`. A component that formatted a number itself
 * would be a component with an opinion about a locale.
 */
import { slotColor } from '@/theme/chart';
import { stackSegments } from './geometry';
import styles from './StackedBar.module.css';

export type StackRow = {
  key: string;
  label: string;
  /** The row's own total, printed at the end. Pre-formatted (I-16). */
  valueLabel: string;
  segments: {
    key: string;
    /** Resolved by the caller from a slot map, never from an index (I-5). */
    slot: number;
    value: number;
    /** What the segment's `title` says. Pre-formatted. */
    readout: string;
  }[];
};

export function StackedBar({ rows }: { rows: StackRow[] }) {
  return (
    <div className={styles.rows}>
      {rows.map((row) => {
        const { segments } = stackSegments(
          row.segments.map((s) => ({ datum: s, value: s.value })),
        );
        return (
          <div key={row.key} className={styles.row}>
            <span className={styles.label}>{row.label}</span>
            {segments.length === 0 ? (
              // The row stays, visibly empty. Dropping it would make a reader think the
              // category does not exist -- see the CSS header.
              <span className={styles.empty} aria-hidden="true" />
            ) : (
              <span className={styles.bar}>
                {segments.map((seg) => (
                  <span
                    key={seg.datum.key}
                    className={styles.segment}
                    style={{
                      // `flex-basis` and not `width`: the 2px gaps are part of the row's
                      // layout, so a percentage width would overflow by (n-1)*2px. Basis
                      // with `flex-grow: 0` lets flex subtract the gaps for us.
                      flex: `0 0 ${seg.pct}%`,
                      background: slotColor(seg.datum.slot),
                    }}
                    title={seg.datum.readout}
                  />
                ))}
              </span>
            )}
            <span className={styles.value}>{row.valueLabel}</span>
          </div>
        );
      })}
    </div>
  );
}
