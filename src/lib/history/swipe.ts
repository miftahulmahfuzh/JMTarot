/**
 * The swipe-to-reveal machine for one `/history` row. PURE — plain numbers in,
 * plain numbers out. No React, no DOM types, no `server-only`, no imports.
 *
 * WHY IT IS HERE AND NOT IN THE COMPONENT. `src/lib/swipeDeck.ts` carries the
 * long version: this project has no jsdom, no Testing Library and no
 * Playwright, so the only part of a client component `npm test` can reach is
 * the part that touches neither React nor the DOM. `swipeDeck.ts` is the SHAPE
 * this file copies and NOT a module it reuses — that one asks which panel a
 * scroll-snap container settled on, which is a different mechanic with
 * different failure modes.
 *
 * THE ONE THING A LATER CHANGE WILL BREAK is the direction lock. Every rule in
 * `advanceDrag` exists because the alternative is a row that either refuses to
 * open or eats the page's vertical scroll, and neither of those looks like a
 * bug in this file.
 */

/**
 * How far the row slides left, in px, when the tray is open.
 *
 * IT IS ALSO THE TRAY'S WIDTH, and `HistoryItemRow.module.css` derives its
 * `--tray` from this number rather than declaring 88 twice. 88 is not a taste
 * value: the trash control fills the tray, the row is at least 90px tall (three
 * 66px thumbs plus 12px of padding top and bottom), and 88x90 clears the 44px
 * iOS minimum on both axes with room to spare. `PublicShare`'s 36px button is
 * already a known defect in this repo and a second one must not ship.
 */
export const REVEAL_WIDTH = 88;

/**
 * How far a pointer must travel before the machine commits to an axis.
 *
 * BELOW THIS THE GESTURE IS STILL A TAP, and that is the only definition of a
 * tap this file has: `axis === 'none'` at release. A separate tap threshold was
 * drafted and dropped — two thresholds create a dead band where a gesture is
 * neither a tap nor a drag, and 7px of finger wobble during a tap is extremely
 * common on glass.
 */
export const DIRECTION_SLOP = 8;

/** Past halfway, a release settles open. */
export const OPEN_AT = REVEAL_WIDTH / 2;

/**
 * A flick this fast decides the settle regardless of where the row got to.
 *
 * Without it a short, fast leftward flick — the gesture people actually make —
 * settles closed because it never reached `OPEN_AT`, and the row reads as
 * broken. Sign convention: POSITIVE is leftward, i.e. opening.
 */
export const FLICK_PX_PER_MS = 0.5;

/** How much of an overdrag past `REVEAL_WIDTH` is shown. */
export const RUBBER_BAND = 0.35;

/** And the ceiling on it, so a 400px drag does not tear the row off the screen. */
export const MAX_OVERDRAG = 28;

export type SwipeAxis = 'none' | 'x' | 'y';

export type SwipeDrag = {
  /** Where the pointer went down. */
  readonly startX: number;
  readonly startY: number;
  /** Where the tray was at pointer-down: 0 closed, `REVEAL_WIDTH` open. */
  readonly baseOffset: number;
  readonly axis: SwipeAxis;
  /** The current slide, in px. `0 <= offset <= REVEAL_WIDTH + MAX_OVERDRAG`. */
  readonly offset: number;
  /** The RUNNING MAXIMUM distance in either axis. Never decreases. */
  readonly travel: number;
  readonly lastX: number;
  readonly lastAt: number;
  /** px per ms, positive leftward. */
  readonly velocity: number;
};

export type SwipeRelease =
  /** The pointer never committed to an axis. The caller decides what a tap means. */
  | { kind: 'tap' }
  | { kind: 'settle'; open: boolean };

/**
 * Clamp a raw slide into what may be painted.
 *
 * NO RUBBER BAND AT THE CLOSED END, DELIBERATELY. Dragging a closed row to the
 * RIGHT is either the start of a page gesture or a mis-swipe; giving it visual
 * feedback tells the querent there is something to find in that direction, and
 * there is not.
 */
export function clampOffset(raw: number): number {
  if (raw <= 0) return 0;
  if (raw <= REVEAL_WIDTH) return raw;
  return REVEAL_WIDTH + Math.min(MAX_OVERDRAG, (raw - REVEAL_WIDTH) * RUBBER_BAND);
}

/** Pointer down. `openNow` is the row's settled state, not a guess. */
export function beginDrag(x: number, y: number, at: number, openNow: boolean): SwipeDrag {
  const baseOffset = openNow ? REVEAL_WIDTH : 0;
  return {
    startX: x,
    startY: y,
    baseOffset,
    axis: 'none',
    offset: baseOffset,
    travel: 0,
    lastX: x,
    lastAt: at,
    velocity: 0,
  };
}

/**
 * Pointer move. Returns a NEW drag; it never mutates the one it is given.
 *
 * THE AXIS LOCK IS STICKY AND THAT IS THE POINT. Once the gesture has been
 * judged vertical the row stops responding for the rest of the sequence, so a
 * flick down a long list cannot leave a trail of half-open rows behind it. The
 * caller pairs this with `touch-action: pan-y`, which is what keeps the page's
 * own scroll native while we still receive the moves.
 *
 * VELOCITY IS CARRIED THROUGH A DUPLICATE SAMPLE. Browsers routinely emit a
 * final `pointermove` at the same x as the previous one; recomputing from it
 * would report 0 px/ms at the end of a fast flick and settle the row closed.
 */
export function advanceDrag(drag: SwipeDrag, x: number, y: number, at: number): SwipeDrag {
  const dx = x - drag.startX;
  const dy = y - drag.startY;
  const travel = Math.max(drag.travel, Math.abs(dx), Math.abs(dy));

  let axis = drag.axis;
  if (axis === 'none' && travel >= DIRECTION_SLOP) {
    axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }

  const elapsed = Math.max(1, at - drag.lastAt);
  const moved = x !== drag.lastX;
  const velocity = axis === 'x' && moved ? (drag.lastX - x) / elapsed : drag.velocity;

  // Leftward is dx < 0, and leftward opens -- hence the subtraction.
  const offset = axis === 'x' ? clampOffset(drag.baseOffset - dx) : drag.offset;

  return { ...drag, axis, offset, travel, lastX: x, lastAt: at, velocity };
}

/**
 * Pointer up. What did that sequence mean?
 *
 * `axis === 'none'` IS THE WHOLE DEFINITION OF A TAP. A vertical drag is never
 * a tap — the querent was scrolling the page — and it settles the row back to
 * wherever it started rather than to closed, because they did not touch it.
 */
export function endDrag(drag: SwipeDrag): SwipeRelease {
  if (drag.axis === 'none') return { kind: 'tap' };
  if (drag.axis === 'y') return { kind: 'settle', open: drag.baseOffset >= OPEN_AT };
  if (drag.velocity >= FLICK_PX_PER_MS) return { kind: 'settle', open: true };
  if (drag.velocity <= -FLICK_PX_PER_MS) return { kind: 'settle', open: false };
  return { kind: 'settle', open: drag.offset >= OPEN_AT };
}
