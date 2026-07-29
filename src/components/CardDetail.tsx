'use client';

import { useT } from '@/lib/i18n/LocaleProvider';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cardMeaning } from '@/data/deck';
import type { Draw } from '@/data/types';
import { CardFace } from './CardFace';
import styles from './CardDetail.module.css';

type Props = {
  draw: Draw;
  /** The slot this card landed in, in the reader's own framing. */
  position: string;
  onClose: () => void;
  /**
   * Send the card back to the fan. Omitted once a reading is under way: the
   * draw is settled by then, and changing it would leave the cards disagreeing
   * with the text below them.
   */
  onReturn?: () => void;
  /**
   * Show BOTH glosses, each labelled, instead of the one matching `draw.reversed`.
   *
   * FOR A CATALOGUE, NEVER FOR A DRAW. `/gallery` shows 22 upright artworks that
   * nobody dealt, so both lines are true things to say about the card and neither
   * is asserted as *the* meaning of the card on screen. Every other caller shows a
   * card that came out of a deck one specific way up, where the other line is NOT
   * true of the artwork above it -- which is the contradiction `cardMeaning()`
   * exists to prevent and this flag must never be used to reopen.
   *
   * The LABELS are what make it legal. An unlabelled pair, or a reversed line
   * under upright art with no label, is the same contradiction wearing two
   * sentences.
   *
   * BOTH LINES STILL GO THROUGH `cardMeaning()`. Reading
   * `card.meaning[locale].upright` by hand can get the locale wrong as well as
   * the orientation; see `deck.ts`.
   */
  bothMeanings?: boolean;
  /**
   * The control that opened this sheet, so focus can go back to it.
   *
   * **SAFARI DOES NOT FOCUS A `<button>` WHEN IT IS CLICKED OR TAPPED**, so the
   * `document.activeElement` read in the effect below captures `<body>` on the one
   * platform this app is built for. `AccountMenu` has taken the opener as a prop
   * since v0.3.0 for exactly this; CLAUDE.md records that THIS file still had the
   * latent version, and that its consequence was "smaller, because its opener is
   * a card in a long list".
   *
   * **ON `/gallery` IT IS NOT SMALLER.** The opener is one of 22 tiles in a grid
   * three to three-and-a-half thousand pixels tall, so restoring focus to
   * `<body>` moves a keyboard or VoiceOver user from row nine to the top of the
   * document, with no way back but re-traversing every row they had passed.
   *
   * The caller passes a ref it fills from the click event's `currentTarget`,
   * which IS the button whether or not the platform focused it. Reading
   * `document.activeElement` asks the platform a question it answers differently
   * on the platform we ship to; reading the event asks nothing.
   * `document.activeElement` REMAINS THE FALLBACK, so the three callers that do
   * not pass this -- `Draw`, `ReadingView`, `AccountCard` -- behave exactly as
   * they did. Fixing theirs is not S3's; leaving the fallback is what makes this
   * edit additive.
   */
  returnFocusTo?: RefObject<HTMLElement | null>;
  /**
   * Extra content, between the gloss and the buttons.
   *
   * `/gallery` puts the keywords and the lore link here, so everything
   * gallery-specific lives in the gallery's own files and the draw screen's
   * overlay does not acquire a link to a public page by being the same component.
   */
  children?: ReactNode;
};

/**
 * The full-size look at a card the querent has already drawn.
 *
 * Tapping a picked card opens this rather than returning it to the deck --
 * returning is the second button here. At 88x132 the ART is unreadable however
 * it is labelled, so "what did I just draw?" needs somewhere to be asked.
 *
 * WHAT CHANGED, AND WHY THE NAME BELOW IS NOT REDUNDANT ANY MORE. This used to
 * read "with the title rendered into the art at maybe 6px, so which card is that
 * is not answerable from the fan". The regenerated deck carries no text, and
 * `CardFace` draws the name over small cards instead -- so the name IS
 * answerable at slot size now, and this overlay exists for the artwork and the
 * meaning line rather than for the name. `CardFace` is passed `size="full"`
 * here, which is exactly what suppresses its caption: the heading below is the
 * only place the name and the numeral appear.
 */
export function CardDetail({
  draw,
  position,
  onClose,
  onReturn,
  bothMeanings = false,
  returnFocusTo,
  children,
}: Props) {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  /*
   * Read through a ref so the effect below can depend on nothing at all.
   *
   * The draw screen re-renders on every streamed chunk of the reading, and it
   * passes `onClose` as an inline arrow -- a new function each time. An effect
   * keyed on that identity would tear down and set up hundreds of times while
   * the overlay is open, and each setup calls focus(). The querent would watch
   * focus jump on every token.
   */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  /* Same trick as `onCloseRef`, and `AccountMenu` does it for the same reason:
     the effect below must depend on nothing, and the cleanup must read the
     CURRENT value rather than the one that was passed on mount. */
  const returnFocusRef = useRef(returnFocusTo);
  returnFocusRef.current = returnFocusTo;

  /*
   * Escape closes, and focus moves into the dialog and back out again when it
   * goes. Restoring focus matters more than usual here: the thing that opened
   * this is one card in a fan of 22, and losing the position drops a keyboard
   * user back at the top of the document.
   */
  useEffect(() => {
    /* THE FALLBACK, NOT THE ANSWER -- see `returnFocusTo`. Safari does not focus
       a tapped button, so on the platform this app ships to this is `<body>`. */
    const fallbackOpener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);

    // The page behind is a tall scrolling draw screen; letting it scroll under
    // the overlay loses the fan position the querent tapped from.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      (returnFocusRef.current?.current ?? fallbackOpener)?.focus?.();
    };
  }, []);

  const titleId = `card-detail-${draw.card.id}`;

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // The scrim closes on tap; the sheet is the part that must not.
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.position}>{position}</div>

        <div className={styles.frame}>
          <CardFace card={draw.card} reversed={draw.reversed} size="full" />
        </div>

        <div className={styles.heading}>
          <h2 className={styles.name} id={titleId}>
            {draw.card.name}
            {draw.reversed ? (
              <span className={styles.reversed}> &middot; {t('card.reversed')}</span>
            ) : null}
          </h2>
          <div className={styles.numeral}>{draw.card.numeral}</div>
        </div>

        {/*
          One line, and which line depends on the orientation -- see
          cardMeaning(). A reversed card showing its upright gloss would be
          contradicted by the artwork sitting directly above it.

          `bothMeanings` is the CATALOGUE branch and does not weaken that rule:
          it labels each line, and it is only legal where no orientation was
          dealt at all. See the prop.
        */}
        {bothMeanings ? (
          <div className={styles.meanings}>
            <p className={styles.meaning}>
              <span className={styles.orientation}>{t('card.upright')}</span>
              {cardMeaning({ card: draw.card, reversed: false }, t.locale)}
            </p>
            <p className={styles.meaning}>
              <span className={styles.orientation}>{t('card.reversed')}</span>
              {cardMeaning({ card: draw.card, reversed: true }, t.locale)}
            </p>
          </div>
        ) : (
          <p className={styles.meaning}>{cardMeaning(draw, t.locale)}</p>
        )}

        {/* BETWEEN THE GLOSS AND `.actions`, NEVER AFTER THEM. `.actions` holds
            Close, which is the last thing in the sheet and the thing a thumb
            reaches for; content below it is content nobody scrolls to on a
            375x667 screen. */}
        {children}

        <div className={styles.actions}>
          <button type="button" className={styles.close} onClick={onClose} ref={closeRef}>
            {t('common.close')}
          </button>
          {onReturn ? (
            <button type="button" className={styles.return} onClick={onReturn}>
              {t('card.return')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
