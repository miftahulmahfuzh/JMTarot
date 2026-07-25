'use client';

import { useRef } from 'react';
import { Fan } from '@/components/Fan';
import { CARDS } from '@/data/deck';
import type { Draw } from '@/data/types';
import styles from './page.module.css';

/*
 * Fixed-width containers standing in for the three phone widths.
 *
 * This is an exact emulation for the fan rather than an approximation: the
 * fan's only input is its container's inline size, so a 375px container
 * renders precisely what a 375px viewport would. It exists because Windows
 * clamps a Chrome window to ~500px, which makes narrow screenshots a lie --
 * see the header of tools/shot.sh.
 *
 * Stacked vertically. Side by side they wrapped unpredictably, and the widest
 * one forced the document wider, which silently rescaled the others and cost
 * an hour of chasing a measurement that was never real.
 */
const DECK: Draw[] = CARDS.map((card) => ({ card, reversed: false }));
const WIDTHS = [375, 390, 430];

export function Frames() {
  const noSlots = useRef<(HTMLDivElement | null)[]>([]);

  return (
    <>
      {WIDTHS.map((w) => (
        <div key={w} className={styles.frame} style={{ width: w }}>
          <div className={styles.frameLabel}>{w}px</div>
          <div className={styles.framePad}>
            <Fan
              deck={DECK}
              picks={[]}
              cardCount={3}
              onToggle={() => {}}
              slotRefs={noSlots}
            />
          </div>
        </div>
      ))}
    </>
  );
}
