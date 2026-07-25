import { cardImage, cardThumb } from '@/data/deck';
import type { Card } from '@/data/types';
import styles from './CardFace.module.css';

type Props = {
  card: Card;
  reversed?: boolean;
  /**
   * `thumb` is 240x360 and is what the fan and the slots want -- 22 full-size
   * cards would be 4.1MB. `full` is 800x1200, for the result panel.
   */
  size?: 'thumb' | 'full';
};

/**
 * The face-up card.
 *
 * A plain `<img>` rather than `next/image` on purpose: these are already
 * optimized WebP generated at exactly the two sizes we draw them at, so the
 * optimizer has nothing to improve. It would only add a serverless invocation
 * and a re-encode per card, 22 of them on the first draw.
 */
export function CardFace({ card, reversed = false, size = 'thumb' }: Props) {
  const src = size === 'thumb' ? cardThumb(card.slug) : cardImage(card.slug);

  return (
    <div className={styles.face}>
      <img
        className={`${styles.art}${reversed ? ` ${styles.reversed}` : ''}`}
        src={src}
        alt={reversed ? `${card.name}, terbalik` : card.name}
        draggable={false}
        decoding="async"
      />
    </div>
  );
}
