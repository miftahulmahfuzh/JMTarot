'use client';

import type { CSSProperties } from 'react';
import type { Draw } from '@/data/types';
import { CardBack } from './CardBack';
import styles from './Fan.module.css';

/**
 * Arc span in degrees, and the distance from a card's own top edge down to the
 * rotation centre. See the header of Fan.module.css for how these were
 * derived -- in short, the span is an aesthetic choice and the pivot is what
 * makes 22 cards fit a 375px screen.
 */
const SPAN = 64;
const PIVOT = 272;

type Props = {
  deck: Draw[];
};

/**
 * The face-down fan: 22 cards on a shallow arc.
 *
 * All 22 render. No windowing, no virtualization -- at this count the arc is
 * cheaper than the bookkeeping would be, and every card has to be reachable
 * anyway.
 *
 * Picking, flipping and the reduced-motion fallback arrive in Task 6. This is
 * the geometry alone.
 */
export function Fan({ deck }: Props) {
  const n = deck.length;
  const step = n > 1 ? SPAN / (n - 1) : 0;

  return (
    <div className={styles.stage}>
      <div className={styles.fan} data-fan>
        {deck.map((draw, i) => {
          const angle = (i - (n - 1) / 2) * step;
          const style = {
            '--angle': `${angle.toFixed(3)}deg`,
            zIndex: i,
          } as CSSProperties;

          return (
            <div key={draw.card.id} className={styles.card} style={style} data-card>
              <CardBack />
            </div>
          );
        })}
      </div>
    </div>
  );
}
