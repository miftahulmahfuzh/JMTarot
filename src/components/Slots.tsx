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
   */
  boxRefs: RefObject<(HTMLDivElement | null)[]>;
  /**
   * Render the card face inside the slot rather than leaving it empty.
   *
   * Off in the normal path: the card that flies up from the fan IS the card,
   * and drawing a second copy underneath would show through during the
   * transition. On in the reduced-motion path, where nothing flies and the
   * slot has to show the result itself.
   */
  showFaces?: boolean;
};

export function Slots({ labels, picks, boxRefs, showFaces = false }: Props) {
  return (
    <div className={styles.row}>
      {labels.map((label, i) => {
        const drawn = picks[i];
        return (
          <div key={i} className={styles.slot}>
            <div
              ref={(el) => {
                boxRefs.current[i] = el;
              }}
              className={`${styles.box}${drawn ? ` ${styles.filled}` : ''}`}
              data-slotbox
            >
              {showFaces && drawn ? (
                <CardFace card={drawn.card} reversed={drawn.reversed} size="thumb" />
              ) : null}
            </div>
            <div className={styles.label}>{label}</div>
          </div>
        );
      })}
    </div>
  );
}
