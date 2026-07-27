'use client';

import type { Draw } from '@/data/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import { CardBack } from './CardBack';
import { CardFace } from './CardFace';
import styles from './FanGrid.module.css';

type Props = {
  deck: Draw[];
  picks: number[];
  cardCount: number;
  /** A tap on the card at `index`; see the note on the same prop in Fan.tsx. */
  onCardTap: (index: number) => void;
};

/**
 * What the fan becomes under `prefers-reduced-motion: reduce`.
 *
 * The draw is identical -- same shuffled deck, same taps, same cap -- but
 * nothing animates and nothing overlaps, so there is no sliver to
 * aim at and no card travelling across the screen.
 */
export function FanGrid({ deck, picks, cardCount, onCardTap }: Props) {
  const t = useT();
  const complete = picks.length >= cardCount;

  return (
    <div className={styles.grid}>
      {deck.map((draw, i) => {
        const slot = picks.indexOf(i);
        const chosen = slot >= 0;
        const className = [
          styles.cell,
          chosen ? styles.chosen : '',
          complete && !chosen ? styles.dimmed : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <button
            key={draw.card.id}
            type="button"
            className={className}
            disabled={complete && !chosen}
            aria-label={
              chosen
                ? t('draw.card.aria.picked', { slot: slot + 1, name: draw.card.name })
                : t('draw.card.aria.take')
            }
            aria-pressed={chosen}
            onClick={() => onCardTap(i)}
          >
            {chosen ? (
              <CardFace card={draw.card} reversed={draw.reversed} size="thumb" />
            ) : (
              <CardBack />
            )}
          </button>
        );
      })}
    </div>
  );
}
