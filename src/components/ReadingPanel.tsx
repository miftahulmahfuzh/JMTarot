'use client';

import { useT } from '@/lib/i18n/LocaleProvider';
import { useEffect, useRef } from 'react';
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

  /*
   * Scroll the panel into view ONCE, when the first content appears -- not on
   * every chunk. Following the stream would drag the page out from under a
   * thumb that is trying to read what already arrived.
   */
  useEffect(() => {
    if (scrolledOnce.current) return;
    if (state.status === 'idle') return;
    scrolledOnce.current = true;
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [state.status]);

  // Allow a fresh scroll for the next reading.
  useEffect(() => {
    if (state.status === 'idle') scrolledOnce.current = false;
  }, [state.status]);

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
