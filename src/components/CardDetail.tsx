'use client';

import { useEffect, useRef } from 'react';
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
};

/**
 * The full-size look at a card the querent has already drawn.
 *
 * Tapping a picked card opens this rather than returning it to the deck --
 * returning is the second button here. At fan size a card is 88x132 with the
 * title rendered into the art at maybe 6px, so "which card is that?" is not
 * answerable from the fan, and the querent has to be able to ask it.
 */
export function CardDetail({ draw, position, onClose, onReturn }: Props) {
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

  /*
   * Escape closes, and focus moves into the dialog and back out again when it
   * goes. Restoring focus matters more than usual here: the thing that opened
   * this is one card in a fan of 22, and losing the position drops a keyboard
   * user back at the top of the document.
   */
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
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
      opener?.focus?.();
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
            {draw.reversed ? <span className={styles.reversed}> &middot; Terbalik</span> : null}
          </h2>
          <div className={styles.numeral}>{draw.card.numeral}</div>
        </div>

        {/*
          One line, and which line depends on the orientation -- see
          cardMeaning(). A reversed card showing its upright gloss would be
          contradicted by the artwork sitting directly above it.
        */}
        <p className={styles.meaning}>{cardMeaning(draw)}</p>

        <div className={styles.actions}>
          <button type="button" className={styles.close} onClick={onClose} ref={closeRef}>
            Tutup
          </button>
          {onReturn ? (
            <button type="button" className={styles.return} onClick={onReturn}>
              Kembalikan ke dek
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
