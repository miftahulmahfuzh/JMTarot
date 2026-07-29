/**
 * A twelve-point sparkline for a stat tile. No axis, no label, no tooltip.
 *
 * **IT GATES NOTHING, WHICH IS WHAT MAKES IT LEGITIMATE.** A series drawn with no scale
 * cannot be read as a measurement -- so its twelve values ride in the parent tile's table
 * row, and this is a sentence about direction rather than a number. `interaction.md` says
 * a bare stat tile gets no tooltip, and this is why: there is nothing a tooltip could add
 * that the table does not already carry.
 *
 * The body is `DEEMPH` and only the **last segment plus its end-dot** wear the series
 * colour, because the tile's question is "where is this now, and which way". Colouring the
 * whole path would put five competing marks in a KPI row with nothing to distinguish them.
 *
 * ── A DEPARTURE FROM §5.2's `viewBox="0 0 240 48"`, AND ITS REASON ───────────
 *
 * The plan specifies a 240x48 view box. This uses the same 1000x1000 space every other
 * chart uses, and **the rendered result is identical**: with `preserveAspectRatio="none"`
 * the box is sheared to fit its CSS size regardless of its numbers, and
 * `non-scaling-stroke` keeps the 2px stroke 2px. What the plan's numbers would have cost
 * is a second coordinate system -- the first draft scaled `linePath`'s output with a
 * regex, which is a second place a gap could be got wrong. **One path builder, one gap
 * rule.** The 24px rendered height, which is the part a reader sees, is unchanged.
 *
 * `values` is trimmed to the last twelve by the caller (`metrics.ts`), not here: a
 * component that silently reshaped its input would make a tile and its table row disagree
 * about which days they describe.
 */
import { slotColor } from '@/theme/chart';
import { VIEW, linePath } from './geometry';
import type { Maybe } from './types';
import styles from './Sparkline.module.css';

export function Sparkline({ values, slot }: { values: Maybe[]; slot: number }) {
  // Its own domain, from its own values: a sparkline is never compared to another one, so
  // a shared scale would only flatten every tile except the biggest.
  const max = values.reduce<number>((a, v) => (v !== null && v > a ? v : a), 0);

  return (
    <svg
      className={styles.spark}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className={styles.body} d={linePath(values, max)} />
      <path className={styles.tail} d={linePath(tailOnly(values), max)} stroke={slotColor(slot)} />
    </svg>
  );
}

/**
 * The series with everything but its last two present values blanked out.
 *
 * Blanked rather than sliced, so the tail is drawn in the **full series' coordinate
 * space** and lands exactly on top of the body's last segment -- a sliced array would be
 * re-spread across the whole width and the accent would float somewhere in the middle.
 *
 * Two points, not three: on twelve, a three-point tail is a quarter of the chart and stops
 * reading as "the recent end". Fewer than two present values yields an empty path, which
 * renders nothing -- correct, because there is no segment to accent.
 */
function tailOnly(values: Maybe[]): Maybe[] {
  const present: number[] = [];
  for (let i = values.length - 1; i >= 0 && present.length < 2; i -= 1) {
    if (values[i] !== null && Number.isFinite(values[i] as number)) present.unshift(i);
  }
  if (present.length < 2) return values.map(() => null);
  return values.map((v, i) => (i >= present[0] ? v : null));
}
