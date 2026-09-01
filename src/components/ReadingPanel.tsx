'use client';

import { useT } from '@/lib/i18n/LocaleProvider';
import { shouldFollowStream } from '@/lib/readingScroll';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { RefusalNotice } from './RefusalNotice';
import type { RefusalPayload } from '@/lib/moderation/types';
import styles from './ReadingPanel.module.css';

export type ReadingState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string; text?: string }
  /**
   * The moderation gate refused the question (W7).
   *
   * A STATE OF ITS OWN, not `error` with different copy. `error` renders a
   * Retry button, and offering "try again" to somebody whose question was
   * refused is both useless -- the same question refuses the same way -- and
   * insulting. The right affordance is already on screen: the draw is NOT
   * reset, so the picked cards stay and the querent can pull a card back,
   * rewrite the question and ask something else.
   */
  | { status: 'blocked'; payload: RefusalPayload };

type Props = {
  state: ReadingState;
  onRetry: () => void;
};

export function ReadingPanel({ state, onRetry }: Props) {
  const t = useT();
  const ref = useRef<HTMLDivElement | null>(null);
  const scrolledOnce = useRef(false);
  /** `scrollHeight` at the previous observation, so the next one knows the growth. */
  const lastHeight = useRef<number | null>(null);
  /* Hoisted out of the dependency array: a conditional expression in there is a lint
     error, and naming it says what the effect actually watches -- the prose, not the
     state object, which is a new identity on every chunk. */
  const streamedText = state.status === 'streaming' ? state.text : null;

  /*
   * Bring the panel into view ONCE, when the first content appears. This is the
   * ACQUISITION; the follow below carries on from wherever it lands.
   *
   * It stays `smooth` and it stays `block: 'start'` because it is one discrete jump
   * from the fan down to the panel, which is what `smooth` is for. It does not race
   * the follow: it fires on `waiting`, and time-to-first-token on this provider was
   * measured at 2.7s, 5.4s and 11.6s, so the glide is long over before a chunk lands.
   */
  useEffect(() => {
    if (scrolledOnce.current) return;
    if (state.status === 'idle') return;
    scrolledOnce.current = true;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state.status]);

  // Allow a fresh scroll for the next reading.
  useEffect(() => {
    if (state.status === 'idle') {
      scrolledOnce.current = false;
      lastHeight.current = null;
    }
  }, [state.status]);

  /*
   * ── FOLLOW THE STREAM, AND LET GO THE MOMENT THE QUERENT SCROLLS ──────────
   *
   * **THIS REVERSES A DELIBERATE RULING AND ANSWERS ITS ARGUMENT RATHER THAN
   * DISMISSING IT** (card #32, 2026-09-01). What stood here said the panel scrolls
   * into view once and never again, because *"following the stream would drag the page
   * out from under a thumb that is trying to read what already arrived"*. That harm is
   * real. It is also conditional: it only happens to somebody who has scrolled AWAY,
   * and the querent who has not is left reading two lines and thumbing the other
   * thirty-eight down by hand -- which was the report.
   *
   * So the page follows only while nobody has moved it, and stops the instant they do.
   * `shouldFollowStream` is the whole policy and it carries the argument for measuring
   * after the commit instead of before it; read that header before changing either
   * number here.
   *
   * **`'auto'`, ALWAYS, AND THAT IS STRONGER THAN READING THE TWO GLOBALS.** A JS
   * `scrollTo({ behavior })` OVERRIDES CSS `scroll-behavior` rather than defaulting
   * from it, so the habit elsewhere in this repo is `reduce || isStill() ? 'auto' :
   * 'smooth'` (`ChatRoom.tsx`, `SwipeDeck.tsx`, `admin/ScrollTop.tsx`). There is
   * nothing to read here, for a reason that is not about motion preference at all: a
   * `smooth` scroll fired per chunk RESTARTS ITS ANIMATION every few tens of
   * milliseconds and never lands, so the viewport permanently trails the text and
   * jitters. `smooth` is for one discrete jump; this is a continuous crawl of a few
   * words at a time, which an instant scroll renders as smooth. `'auto'` is also
   * exactly what `prefers-reduced-motion` and `html[data-still]` would have asked for,
   * so hardcoding it cannot drift out of step with them the way a condition can.
   *
   * **`streaming` ONLY, AND `done` IS EXCLUDED ON PURPOSE.** The completion commit is
   * not just the last few words: it mounts `AttachReadingLink`, `ReadingActions` and
   * the disclaimer. Following the document's bottom through it would scroll the
   * querent past the paragraph they are mid-sentence in and land them on a row of
   * buttons -- the exact harm the old comment named, at the one moment it would be
   * least welcome. What is given up is the flush delta after the stream loop, which is
   * empty whenever the decoder has no pending bytes.
   *
   * The bottom of the DOCUMENT, not of the panel: `.shell` already carries
   * `padding-bottom: calc(96px + env(safe-area-inset-bottom))` to clear the FIXED
   * `.footer`, so the document's bottom puts the newest line just above that footer
   * with room to breathe -- for free, and with no element measuring.
   */
  useLayoutEffect(() => {
    const height = document.documentElement.scrollHeight;
    const grewBy = lastHeight.current === null ? 0 : height - lastHeight.current;
    lastHeight.current = height;

    if (state.status !== 'streaming') return;

    const distanceFromBottom = height - window.scrollY - window.innerHeight;
    if (!shouldFollowStream({ distanceFromBottom, grewBy })) return;

    window.scrollTo({ top: height, behavior: 'auto' });
  }, [state.status, streamedText]);

  if (state.status === 'idle') return null;

  /*
   * The refusal replaces the panel rather than sitting inside it. It brings its
   * own container, and -- deliberately -- NO entertainment disclaimer: "for
   * entertainment only" under a message about suicide would be obscene, and
   * under a generic refusal it is merely noise.
   */
  if (state.status === 'blocked') {
    return (
      <div ref={ref}>
        <RefusalNotice payload={state.payload} />
      </div>
    );
  }

  const text = 'text' in state ? state.text : undefined;

  return (
    <section className={styles.panel} ref={ref} aria-live="polite">
      {state.status === 'waiting' ? (
        <div className={styles.waiting}>{t('reading.waiting')}</div>
      ) : null}

      {text ? <p className={styles.text}>{text}</p> : null}

      {state.status === 'error' ? (
        <>
          <p className={styles.error}>{state.message}</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            {t('common.retry')}
          </button>
        </>
      ) : null}

      {state.status === 'done' || state.status === 'error' ? (
        <p className={styles.disclaimer}>{t('common.disclaimer.long')}</p>
      ) : null}
    </section>
  );
}
