'use client';

import { useEffect, useRef } from 'react';
import styles from './ReadingPanel.module.css';

export type ReadingState =
  | { status: 'idle' }
  | { status: 'waiting' }
  | { status: 'streaming'; text: string }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string; text?: string };

type Props = {
  state: ReadingState;
  onRetry: () => void;
};

export function ReadingPanel({ state, onRetry }: Props) {
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

  const text = 'text' in state ? state.text : undefined;

  return (
    <section className={styles.panel} ref={ref} aria-live="polite">
      {state.status === 'waiting' ? (
        <div className={styles.waiting}>Membaca kartu&hellip;</div>
      ) : null}

      {text ? <p className={styles.text}>{text}</p> : null}

      {state.status === 'error' ? (
        <>
          <p className={styles.error}>{state.message}</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Coba lagi
          </button>
        </>
      ) : null}

      {state.status === 'done' || state.status === 'error' ? (
        <p className={styles.disclaimer}>
          Bacaan ini untuk hiburan semata, bukan nasihat medis, hukum, atau
          keuangan.
        </p>
      ) : null}
    </section>
  );
}
