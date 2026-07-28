'use client';

/**
 * The card on `/account`, drawn the way every other card in this app is drawn and
 * openable the way every other card in this app is openable.
 *
 * **WHAT THIS REPLACED, AND WHY THE OLD FILE'S REASONING WAS SOUND BUT WRONG.**
 * `/account`'s card block used to be a bare `<img src={cardThumb(...)}>` with a long
 * comment explaining that `CardFace` was *"deliberately NOT reused: it draws the
 * card's name over the art at small sizes, and the sentence beside this image already
 * names it"*. That is a real argument — it is the same de-duplication argument
 * `CardDetail`'s header makes for suppressing the caption at `size="full"` — and it
 * lost to how the page actually reads. **The sentence beside the card names the card
 * in prose, in the middle of a clause**, so the querent gets `Your Inner Lotus takes
 * the form of The Star` rather than a label on an object; and every OTHER 88x132 card
 * in the product — the fan, the slot row, `ReadingView` — wears its name. One card
 * that does not reads as the one card that failed to load its label.
 *
 * **AND `next/image` STILL CANNOT BE USED HERE.** The old comment's hard constraint
 * survives its soft one: `cardThumb` appends `ART_VERSION` as a query string, and
 * `next/image` REFUSES a local `src` carrying one unless `images.localPatterns` allows
 * it — `next.config.ts` configures no `images` block at all, so an `<Image>` here
 * threw `Image with src "/cards/thumb/08_strength.webp?v=3" is using a query string
 * which is not configured` and took the whole page to a 500 with a green build.
 * `CardFace` uses a plain `<img>` for its own reasons (the WebP is already generated
 * at exactly the two sizes we draw), so routing through it satisfies the constraint
 * rather than dodging it.
 *
 * ── WHY THIS IS A COMPONENT AND NOT SIX LINES IN `page.tsx` ──────────────────
 *
 * `/account/page.tsx` is a SERVER component and `CardDetail` is a client one holding
 * open/closed state. The overlay needs a `useState` and `CardFace`/`CardDetail` both
 * call `useT()`, so the boundary has to be crossed somewhere; here it is crossed once,
 * around the two of them, with the server page passing plain data across.
 *
 * **THE OVERLAY IS LOOK-ONLY, AND THAT IS ONE OMITTED PROP.** No `onReturn`, exactly
 * as `ReadingView` omits it (VD14): there is no deck on this page to return anything
 * to. `CardDetail` renders no button when it is absent, so nothing here has to
 * suppress one.
 */
import { useState } from 'react';

import { useT } from '@/lib/i18n/LocaleProvider';
import type { Card } from '@/data/types';
import { CardDetail } from './CardDetail';
import { CardFace } from './CardFace';
import styles from './AccountCard.module.css';

type Props = {
  card: Card;
  /**
   * The orientation the card has EARNED, not one it was dealt.
   *
   * `/account` has no draw behind it — this is an aggregate over every reading the
   * querent has ever taken, and `topCardReversedDominant` is "strictly more than half
   * of its appearances were reversed". The page already computes it for
   * `topCardLine`'s gloss, and passing the same boolean here is what keeps the
   * artwork agreeing with the sentence underneath it: a card described by its
   * reversed meaning while sitting upright contradicts itself in two places at once.
   */
  reversed: boolean;
  /**
   * The label across the top of the overlay. `/account` passes its own section
   * heading, because the slot framings a reading uses ("What has passed") are facts
   * about a spread and there is no spread here.
   */
  position: string;
};

export function AccountCard({ card, reversed, position }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/*
        THE BUTTON IS `inset: 0` INSIDE THE BOX, WHICH IS `Slots.module.css`'s `.tap`
        IDIOM AND IS COPIED FOR ITS ONE PROPERTY: the box is already
        `position: relative` for `CardFace`, so the tap target coincides with the card
        BY CONSTRUCTION. There is no second copy of 88x132 to drift from the first.

        `aria-label` is not optional -- the button's only content is an image whose own
        `alt` comes from `CardFace`, and a control whose accessible name is the card's
        name alone would not say what tapping it does.
      */}
      <div className={styles.box}>
        <CardFace card={card} reversed={reversed} size="thumb" />
        <button
          type="button"
          className={styles.tap}
          aria-label={t('account.card.zoomAria', { name: card.name })}
          onClick={() => setOpen(true)}
        />
      </div>

      {/*
        `draw` IS BUILT INLINE AND THAT IS SAFE HERE, unlike most inline objects
        handed to a component with effects. `CardDetail`'s one effect depends on the
        empty array and reads `onClose` through a ref -- deliberately, because the draw
        screen re-renders it on every streamed token. A fresh `{ card, reversed }` each
        render therefore costs nothing, and hoisting it into a `useMemo` would be
        cargo-culting a fix for a problem that file already solved.
      */}
      {open ? (
        <CardDetail
          draw={{ card, reversed }}
          position={position}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
