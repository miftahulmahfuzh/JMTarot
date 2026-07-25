'use client';

import { useCallback, useRef, useState } from 'react';
import { Fan } from '@/components/Fan';
import { Slots } from '@/components/Slots';
import { CARDS, shuffleDeck } from '@/data/deck';
import { togglePick } from '@/lib/draw';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import type { Draw } from '@/data/types';
import styles from './page.module.css';

/**
 * Drives the full pick cycle so it can be exercised in a browser before the
 * real draw screen exists. Task 13 replaces this with the actual route; the
 * state shape here is what that route will need.
 */
/*
 * A fixed deck and a fixed set of picks, so a screenshot of a mid-draw is
 * reproducible. Reached with /spike?demo=1. The three are spread across the
 * arc rather than adjacent, so the flight paths differ in length and the
 * transform maths gets exercised at both edges and the centre.
 */
const DEMO_DECK: Draw[] = CARDS.map((card, i) => ({ card, reversed: i % 7 === 3 }));
const DEMO_PICKS = [1, 11, 20];

export function DrawSpike({ labels, demo = false }: { labels: string[]; demo?: boolean }) {
  const cardCount = labels.length;

  /*
   * Shuffled once, lazily, on the client. `useState` with an initialiser
   * rather than a module constant: shuffleDeck() calls Math.random(), so
   * computing it during render on the server would produce a different deck
   * than the client and React would flag the mismatch.
   */
  const [deck, setDeck] = useState<Draw[]>(() => (demo ? DEMO_DECK : shuffleDeck()));
  const [picks, setPicks] = useState<number[]>(() => (demo ? DEMO_PICKS : []));
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  /* With reduced motion nothing flies into the slots, so the slots have to
     show the faces themselves -- otherwise the reader's position framing
     never gets attached to a card. */
  const reduceMotion = usePrefersReducedMotion();

  const toggle = useCallback(
    (index: number) => setPicks((prev) => togglePick(prev, index, cardCount)),
    [cardCount],
  );

  const reset = () => {
    setPicks([]);
    setDeck(demo ? DEMO_DECK : shuffleDeck());
  };

  return (
    <>
      <Slots
        labels={labels}
        picks={picks.map((i) => deck[i])}
        boxRefs={slotRefs}
        showFaces={reduceMotion}
      />

      <div className={styles.bleed}>
        <Fan
          deck={deck}
          picks={picks}
          cardCount={cardCount}
          onToggle={toggle}
          slotRefs={slotRefs}
        />
      </div>

      <div className={styles.footer}>
        <span className={styles.counter}>
          {picks.length} / {cardCount} terpilih
        </span>
        <button type="button" className={styles.reset} onClick={reset}>
          Kocok ulang
        </button>
      </div>

      <p className={styles.note}>
        {picks.length === 0
          ? 'Ketuk atau tarik kartu ke atas.'
          : picks
              .map((i, slot) => `${slot + 1}. ${deck[i].card.name}${deck[i].reversed ? ' (terbalik)' : ''}`)
              .join('  ·  ')}
      </p>
    </>
  );
}
