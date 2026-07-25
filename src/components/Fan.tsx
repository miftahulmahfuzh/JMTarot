'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { usePrefersReducedMotion } from '@/lib/usePrefersReducedMotion';
import type { Draw } from '@/data/types';
import { CardBack } from './CardBack';
import { CardFace } from './CardFace';
import { FanGrid } from './FanGrid';
import styles from './Fan.module.css';

/**
 * Arc span in degrees, and the distance from a card's own top edge down to the
 * rotation centre. See the header of Fan.module.css for how these were
 * derived -- in short, the span is an aesthetic choice and the pivot is what
 * makes 22 cards fit a 375px screen.
 */
const SPAN = 64;
const PIVOT = 272;

/** The fan's design width. Every length scales off this; see the stylesheet. */
const DESIGN_W = 363;

/** Card box within that design, and its offset from the fan's top edge. */
const CARD_W = 88;
const CARD_H = 132;
const CARD_TOP = 3;

/*
 * A dragged card follows the finger upward only, never below its resting
 * place. Downward drag would slide it out of the arc's bottom edge and read as
 * the card falling out of the deck.
 */
const LIFT_CEILING = 0;

type Props = {
  deck: Draw[];
  /** Indices into `deck`, in the order they were picked. */
  picks: number[];
  /** How many cards this service draws. */
  cardCount: number;
  onToggle: (index: number) => void;
  /** Slot boxes to fly picked cards into. See Slots.tsx. */
  slotRefs: RefObject<(HTMLDivElement | null)[]>;
};

type Flight = { dx: number; dy: number; scale: number };

/**
 * The fan: 22 face-down cards on a shallow arc, tap or drag one upward to lift
 * it into the next open slot, tap it again to send it back.
 *
 * All 22 render. No windowing at this count -- the arc is cheaper than the
 * bookkeeping, and every card has to be reachable anyway.
 */
export function Fan({ deck, picks, cardCount, onToggle, slotRefs }: Props) {
  const fanRef = useRef<HTMLDivElement | null>(null);
  const [flights, setFlights] = useState<(Flight | null)[]>([]);
  const [drag, setDrag] = useState<{ index: number; dy: number } | null>(null);
  /* Mirrors `drag` so pointer handlers can read it without a state updater;
     see the note on onPointerUp. */
  const dragRef = useRef<{ index: number; dy: number } | null>(null);
  const reduceMotion = usePrefersReducedMotion();

  const n = deck.length;
  const step = n > 1 ? SPAN / (n - 1) : 0;
  const complete = picks.length >= cardCount;

  /*
   * Work out where each slot is, relative to the fan, and how far a card has
   * to travel to land in it.
   *
   * Measured rather than hardcoded because the two components are siblings in
   * normal flow with arbitrary content between them -- Task 13 puts a question
   * field in that gap. Anything hardcoded here would silently drift the moment
   * that layout changed.
   *
   * The maths has to account for the rotation origin, which is NOT the card's
   * centre: it sits 272 design-units below the card's top edge, far outside
   * the card. Under `transform: translate(d) scale(s)` about origin O, a point
   * C maps to O + s*(C - O) + d. Solving for the translate that lands the card
   * centre C on the slot centre S gives d = S - O - s*(C - O). With C - O
   * purely vertical at -(PIVOT - CARD_H/2) units, that reduces to the two
   * lines below.
   */
  const measure = useCallback(() => {
    const fan = fanRef.current;
    if (!fan) return;
    const fanRect = fan.getBoundingClientRect();
    if (fanRect.width === 0) return;

    const u = fanRect.width / DESIGN_W;
    const originY = (CARD_TOP + PIVOT) * u;
    const centreOffset = (PIVOT - CARD_H / 2) * u; // how far the centre sits above the origin

    const next: (Flight | null)[] = new Array(n).fill(null);
    picks.forEach((deckIndex, slot) => {
      const box = slotRefs.current?.[slot];
      if (!box) return;
      const r = box.getBoundingClientRect();
      const scale = r.width / (CARD_W * u);
      next[deckIndex] = {
        dx: r.left + r.width / 2 - (fanRect.left + fanRect.width / 2),
        dy: r.top + r.height / 2 - fanRect.top - originY + centreOffset * scale,
        scale,
      };
    });
    setFlights(next);
  }, [n, picks, slotRefs]);

  useLayoutEffect(measure, [measure]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    if (fanRef.current) ro.observe(fanRef.current);
    // The slots move when the content above them reflows, which resizing the
    // fan does not always imply -- watch the document too.
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [measure]);

  if (reduceMotion) {
    return (
      <FanGrid deck={deck} picks={picks} cardCount={cardCount} onToggle={onToggle} />
    );
  }

  const onPointerDown = (index: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    // Capture so a drag survives the pointer leaving this card -- with only a
    // ~13px sliver exposed, it leaves almost immediately.
    //
    // Guarded: setPointerCapture throws NotFoundError if the pointer is no
    // longer active by the time we ask, which can happen on a very fast tap.
    // Capture is an enhancement to dragging; losing it must not take the tap
    // down with it.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable; tap still works */
    }
    dragRef.current = { index, dy: 0 };
    setDrag({ index, dy: 0 });
  };

  const onPointerMove = (index: number) => (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.index !== index) return;
    d.dy += e.movementY;
    setDrag({ index, dy: d.dy });
  };

  /*
   * The drag is tracked in a ref as well as in state, and onToggle is called
   * from here rather than from inside a setState updater.
   *
   * That is not a style preference. The first version read the drag by calling
   * onToggle INSIDE a setDrag updater, and React StrictMode double-invokes
   * updaters to surface exactly this kind of impurity -- so every tap picked a
   * card and then immediately un-picked it. The fan was completely dead in
   * development and would have worked in production, which is the worst
   * possible way for a bug to behave. Updaters must stay pure.
   */
  const onPointerUp = (index: number) => () => {
    const d = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (d && d.index === index) onToggle(index);
  };

  return (
    <div className={styles.stage}>
      <div className={styles.fan} ref={fanRef} data-fan>
        {deck.map((draw, i) => {
          const slot = picks.indexOf(i);
          const chosen = slot >= 0;
          const flight = flights[i];
          const dragging = drag?.index === i;

          const lift = dragging ? Math.min(LIFT_CEILING, drag.dy) : 0;
          const angle = (i - (n - 1) / 2) * step;

          const transform =
            chosen && flight
              ? `translate(${flight.dx.toFixed(1)}px, ${flight.dy.toFixed(1)}px) rotate(0deg) scale(${flight.scale.toFixed(3)})`
              : `rotate(${angle.toFixed(3)}deg) translateY(${lift.toFixed(1)}px)`;

          const style = {
            transform,
            // Slotted cards sit above everything, in slot order. A card being
            // dragged floats above the rest of the fan but below the slots.
            // Everything else stacks left to right, so each card overlaps the
            // one before it.
            zIndex: chosen ? 300 + slot : dragging ? 200 : i,
            // Once the draw is complete the rest of the deck recedes, so the
            // chosen cards are unambiguous.
            filter: complete && !chosen ? 'brightness(.55) saturate(.7)' : undefined,
            transition: dragging ? 'filter .3s ease' : undefined,
          } as CSSProperties;

          return (
            <div
              key={draw.card.id}
              className={styles.card}
              style={style}
              data-card
              role="button"
              tabIndex={complete && !chosen ? -1 : 0}
              aria-label={chosen ? `Kartu ${slot + 1}, ketuk untuk kembalikan` : 'Ambil kartu'}
              aria-pressed={chosen}
              onPointerDown={onPointerDown(i)}
              onPointerMove={onPointerMove(i)}
              onPointerUp={onPointerUp(i)}
              onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(i);
                }
              }}
            >
              {/*
                One rotation on a shared preserve-3d parent, with both faces
                backface-hidden. This is the part the React Native build could
                not do -- RN has no preserve-3d, so it had to rotate each face
                separately 180deg apart. On the web that workaround is not
                needed and would be wrong.
              */}
              <div className={`${styles.inner}${chosen ? ` ${styles.flipped}` : ''}`}>
                <div className={styles.faceBack}>
                  <CardBack />
                </div>
                <div className={styles.faceFront}>
                  <CardFace card={draw.card} reversed={draw.reversed} size="thumb" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

