'use client';

/**
 * The crosshair and its readout. **THE ONLY `'use client'` FILE UNDER
 * `src/components/chart/**` (I-17)**, and `chart.contract.test.ts` names it, so a second
 * one fails loudly.
 *
 * A-D10's third reason is the whole argument: *server-rendered SVG needs no hydration at
 * all*, which is why this dashboard can be fast on a cold lambda -- and **that property is
 * lost one component at a time.** Every other interaction in A4 is CSS: the table view is
 * `<details>`, a heat cell's readout is `:hover`/`:focus-visible`, a bar segment's is a
 * native `title`. This is the one thing none of those can do, because a crosshair has to
 * know where the pointer is.
 *
 * ── IT COMPUTES NO SCALE OF ITS OWN, AND THAT IS THE INVARIANT ───────────────
 *
 * It takes **already-computed percentage geometry as props**: `xs[i]` is where index `i`
 * sits, as a fraction of the plot's width, exactly as `Line` positioned its marks. So the
 * hairline can never disagree with the marks -- there is no second copy of the maths to
 * drift. If it took values and a domain, a `yMax` computed twice would be two scales, which
 * is I-7 arriving through the back door.
 *
 * ── THE CROSSHAIR FINDS AN X INDEX, NOT A POINT (I-19) ──────────────────────
 *
 * A reader aims at a date, never at a 2px line. So `nearestIndex` snaps to the nearest x
 * and **one readout lists EVERY series at that x** -- which is also what makes it a
 * crosshair rather than a hit test, and why a two-series chart needs no per-series hover.
 *
 * ── KEYBOARD PARITY IS BYTE-IDENTICAL, BY CONSTRUCTION ──────────────────────
 *
 * `ArrowLeft`/`ArrowRight` set the SAME `index` state that `pointermove` sets, and the
 * readout is rendered from that one number. There is no separate keyboard path to fall out
 * of step -- Task 14's acceptance ("ArrowRight and pointermove produce byte-identical
 * readout DOM") is true because there is only one renderer.
 *
 * `Escape` clears, `blur` and `pointerleave` clear. A crosshair that persists after the
 * pointer has gone is a chart asserting that somebody is still reading it.
 *
 * NO `dangerouslySetInnerHTML` (I-18): `interaction.md`'s *labels are untrusted data*, and a
 * model string or an `op` value reaching a tooltip through string concatenation is the
 * failure. Everything below is `{value}`, which React renders as `textContent`.
 */
import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { nearestIndex } from './geometry';
import type { Readout } from './types';
import styles from './ChartHover.module.css';

export type ChartHoverProps = {
  /** How many x positions there are. The readout's index is bounded by this. */
  count: number;
  /** `readoutFor(i)` -- computed by the SERVER page and passed as a plain array, so this
   *  component holds no formatter, no locale and no data shape. */
  readouts: Readout[];
  /** An accessible name for the listening surface, from `copy.ts` (I-16). */
  label: string;
};

export function ChartHover({ count, readouts, label }: ChartHoverProps) {
  const [index, setIndex] = useState<number | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  const onMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const box = surface.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      setIndex(nearestIndex((e.clientX - box.left) / box.width, count));
    },
    [count],
  );

  const onKey = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        setIndex(null);
        return;
      }
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step === 0) return;
      // A keyboard reader with no crosshair yet starts at the END of the series, because
      // the most recent day is the one this dashboard is about.
      e.preventDefault();
      setIndex((prev) => {
        const from = prev === null ? count - 1 : prev;
        return Math.max(0, Math.min(count - 1, from + step));
      });
    },
    [count],
  );

  const readout = index === null ? null : readouts[index];
  const at = index === null || count <= 1 ? 0 : index / (count - 1);
  // Flip the box before it would leave the card. See the CSS: at 320px the plot is ~250px
  // and the readout is 120px minimum, so without this the right third is unreadable.
  const flip = at > 0.55;

  return (
    <div
      ref={surface}
      className={styles.surface}
      // A focusable, labelled region rather than a `role="application"`: the numbers it
      // reveals are all in the table view, so this enhances and never gates (I-19).
      tabIndex={0}
      role="group"
      aria-label={label}
      onPointerMove={onMove}
      onPointerLeave={() => setIndex(null)}
      onBlur={() => setIndex(null)}
      onKeyDown={onKey}
    >
      {index !== null && readout ? (
        <>
          <span className={styles.hairline} style={{ left: `${at * 100}%` }} aria-hidden="true" />
          <div
            className={`${styles.readout} ${flip ? styles.readoutLeft : styles.readoutRight}`}
            style={{ left: `${at * 100}%` }}
            // Announced as it changes, so a keyboard reader hears the same thing a
            // pointer reader sees.
            role="status"
            aria-live="polite"
          >
            <span className={styles.heading}>{readout.heading}</span>
            {readout.rows.map((r) => (
              <span key={r.label} className={styles.row}>
                {r.swatch ? (
                  <span
                    className={styles.stroke}
                    style={{ background: r.swatch }}
                    aria-hidden="true"
                  />
                ) : null}
                <span className={styles.value}>{r.value}</span>
                <span className={styles.label}>{r.label}</span>
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
