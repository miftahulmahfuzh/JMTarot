'use client';

import type { RefObject } from 'react';
import type { Draw } from '@/data/types';
import { CardFace } from './CardFace';
import styles from './Slots.module.css';

type Props = {
  /** One caption per slot, in the reader's own framing for a three-card spread. */
  labels: string[];
  /** Drawn cards in slot order. Shorter than `labels` until the draw completes. */
  picks: Draw[];
  /**
   * Populated with each slot's box element. The Fan measures these to work out
   * where a picked card should fly to, so the two components never have to
   * agree on a hardcoded position.
   *
   * OPTIONAL SINCE V6: `ReadingView` reconstructs a past draw and has no fan, so
   * there is nothing to measure and nothing to fly.
   */
  boxRefs?: RefObject<(HTMLDivElement | null)[]>;
  /**
   * Render the card face inside the slot rather than leaving it empty.
   *
   * Off in the normal path: the card that flies up from the fan IS the card,
   * and drawing a second copy underneath would show through during the
   * transition. On in the reduced-motion path, where nothing flies and the
   * slot has to show the result itself.
   */
  showFaces?: boolean;
  /**
   * Make each FILLED slot tappable. V6's history detail opens the card overlay
   * from here; the draw screen leaves it undefined, because there the fan owns
   * the interaction and a second tap target over the slot would compete with it.
   *
   * ── WHY THE BUTTON IS IN HERE AND NOT IN THE CALLER ─────────────────────────
   *
   * V6's plan put a separate absolutely-positioned flex row over the slot row,
   * mirroring `Slots.module.css`'s geometry -- 90x135, 12px gap, 78x117 below
   * 359px -- and lifting it with a negative margin. Its own §8 then listed that
   * duplication as a trap with NO possible automated guard, because catching a
   * drift needs a browser and Chromium cannot launch in this image.
   *
   * A full-bleed `inset: 0` button INSIDE `.box` -- which is already
   * `position: relative` for `CardFace` -- coincides with the box BY
   * CONSTRUCTION. There is no second copy of the numbers, so there is nothing to
   * drift, and the trap does not need a guard because it no longer exists. It is
   * also less code than the overlay it replaces.
   */
  onCardTap?: (index: number) => void;
  /** `aria-label` per slot. Required in practice whenever `onCardTap` is set:
   *  the button has no text content, so without this it is an unnamed control. */
  tapLabel?: (index: number) => string;
};

export function Slots({ labels, picks, boxRefs, showFaces = false, onCardTap, tapLabel }: Props) {
  return (
    <div className={styles.row}>
      {labels.map((label, i) => {
        const drawn = picks[i];
        return (
          <div key={i} className={styles.slot}>
            <div
              ref={(el) => {
                if (boxRefs) boxRefs.current[i] = el;
              }}
              className={`${styles.box}${drawn ? ` ${styles.filled}` : ''}`}
              data-slotbox
            >
              {showFaces && drawn ? (
                <CardFace card={drawn.card} reversed={drawn.reversed} size="thumb" />
              ) : null}
              {onCardTap && drawn ? (
                <button
                  type="button"
                  className={styles.tap}
                  aria-label={tapLabel?.(i)}
                  onClick={() => onCardTap(i)}
                  data-slottap
                />
              ) : null}
            </div>
            <div className={styles.label}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}
