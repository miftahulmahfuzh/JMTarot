'use client';

/*
 * `'use client'` IS NEW WITH W6 AND IS A DECLARATION, NOT A CHANGE. Every
 * importer -- Fan, FanGrid, CardDetail, Slots -- is already a client component, so
 * this file has always been client-only; it simply never said so. It says so now
 * because it calls `useT()` for its alt text, and a hook in a file that a server
 * component could legally import is a crash waiting for the first person to try.
 */
import { cardImage, cardThumb } from '@/data/deck';
import { useT } from '@/lib/i18n/LocaleProvider';
import type { Card } from '@/data/types';
import styles from './CardFace.module.css';

type Props = {
  card: Card;
  reversed?: boolean;
  /**
   * `thumb` is 240x360 and is what the fan and the slots want -- 22 full-size
   * cards would be 4.1MB. `full` is 800x1200, for the result panel.
   *
   * It also decides whether the card's NAME is drawn over the art; see the
   * caption at the bottom of the render.
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
  const t = useT();
  const src = size === 'thumb' ? cardThumb(card.slug) : cardImage(card.slug);

  return (
    <div className={styles.face}>
      <img
        className={`${styles.art}${reversed ? ` ${styles.reversed}` : ''}`}
        src={src}
        alt={
          reversed
            ? t('card.alt.reversed', { name: card.name })
            : t('card.alt.upright', { name: card.name })
        }
        draggable={false}
        decoding="async"
      />
      {/*
        THE NAME IS DRAWN HERE, NOT BAKED INTO THE ARTWORK.

        Small sizes only. The detail overlay prints the name and the numeral
        under the card, and two copies of it a centimetre apart is exactly the
        redundancy this exists to remove.

        A SIBLING of the <img> rather than a child, and that is what keeps it
        UPRIGHT on a reversed card: `.reversed` rotates the image alone, so the
        artwork turns over and the name stays readable. The old baked-in titles
        went upside down with the art, which is authentic for a physical deck and
        useless on a phone.

        `aria-hidden` because the alt text above already names the card, in the
        querent's own locale. Without it a screen reader announces it twice.

        Card names stay English in both locales -- the deliberate rule in
        CLAUDE.md's `## Localization` -- so there is nothing to translate here
        and `card.name` is a plain string, never a `Localized<>`.
      */}
      {size === 'thumb' ? (
        <div className={styles.name} aria-hidden="true">
          {card.name}
        </div>
      ) : null}
    </div>
  );
}
