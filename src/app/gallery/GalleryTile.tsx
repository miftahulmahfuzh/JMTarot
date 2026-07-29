'use client';

/**
 * One tile: the card, a full-bleed zoom button over it, and the lore link.
 *
 * PRESENTATIONAL. It holds no state and fires no event -- `GalleryGrid` owns the
 * open card, the opener ref and every `track()` call, so there is exactly one place
 * that knows whether a sheet is open and exactly one `CardDetail` mounted at a
 * time.
 *
 * THE CARD IS ALWAYS UPRIGHT, and `reversed` is not a prop for that reason. This is
 * a catalogue, not a draw: `reversed` in this app means "this card came out of the
 * deck this way", and there is no deck here. `/account` passes an orientation the
 * card EARNED across a querent's history; a stranger has earned nothing, and a grid
 * of 22 artworks with six of them upside down reads as a rendering bug. What the
 * catalogue owes the reader instead is BOTH glosses, labelled, in the zoom sheet.
 */
import Link from 'next/link';

import { CardFace } from '@/components/CardFace';
import type { Card } from '@/data/types';
import { useT } from '@/lib/i18n/LocaleProvider';
import { galleryAlt } from './alt';
import styles from './GalleryGrid.module.css';

export function GalleryTile({
  card,
  loreHref,
  onZoom,
  onLore,
}: {
  card: Card;
  /**
   * Already locale-prefixed, built on the SERVER by `page.tsx` with S2's
   * `localePath`. NEVER built here: a client component would have to know the
   * locale, and `LocaleProvider`'s header says no locale prop is drilled anywhere.
   */
  loreHref: string;
  /**
   * Hands the grid BOTH the card and the element that was tapped.
   *
   * The element is `event.currentTarget`, which IS this button whether or not the
   * platform focused it -- the whole of the Safari focus fix. See `returnFocusTo`
   * in `CardDetail`.
   */
  onZoom: (card: Card, opener: HTMLButtonElement) => void;
  onLore: (card: Card) => void;
}) {
  const t = useT();

  return (
    <li className={styles.tile}>
      <div className={styles.card}>
        {/*
          `alt` is the derived sentence, not `card.alt.upright`'s bare name: this
          is the one surface in the app where `alt` is indexed content. See alt.ts.
        */}
        <CardFace card={card} size="thumb" alt={galleryAlt(card, t)} />
        {/*
          `aria-label` is not optional -- the button's only content is an image
          whose `alt` belongs to `CardFace`, and a control whose accessible name is
          the card's name alone would not say what tapping it does. `AccountCard`
          records the same rule.
        */}
        <button
          type="button"
          className={styles.tap}
          aria-label={t('gallery.card.zoomAria', { name: card.name })}
          onClick={(e) => onZoom(card, e.currentTarget)}
        />
      </div>

      {/*
        `prefetch={false}`, and on this page it is the load-bearing kind of
        default-override: twenty-two `<Link>`s in one viewport-adjacent grid would
        have Next prefetch twenty-two RSC payloads for lore pages nobody has asked
        for, on the page whose Core Web Vitals a crawler measures. The lore pages
        are `ƒ`, so each prefetch is a lambda invocation. The `<a href>` in the
        HTML -- which is the whole point of these links -- is unaffected.
      */}
      <Link className={styles.lore} href={loreHref} prefetch={false} onClick={() => onLore(card)}>
        {t('gallery.card.lore')}
        {/* See `.srOnly`: this is what makes 22 links distinguishable without
            breaking Label in Name. The leading space is deliberate -- accessible
            name concatenation does not reliably insert one. */}
        <span className={styles.srOnly}>{` ${card.name}`}</span>
      </Link>
    </li>
  );
}
