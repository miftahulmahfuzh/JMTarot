'use client';

import { useEffect, type RefObject } from 'react';

/**
 * **THE SOFTWARE KEYBOARD, MEASURED — because `dvh` cannot see it.**
 *
 * `page.module.css` sizes the shell at `100dvh` minus both safe-area insets, and that
 * comment is right about everything it names: Safari's collapsing toolbar, the notch,
 * the home indicator. What it cannot account for is the one piece of chrome that is
 * not chrome. **`dvh` tracks the browser's own UI and NOT the software keyboard**: on
 * iOS the keyboard shrinks the VISUAL viewport and leaves the layout viewport exactly
 * where it was, so with the keyboard up the bottom of the shell — which is the
 * composer, and therefore `Kirim` — is underneath it.
 *
 * The room got away with that because Safari scrolls a focused field into view by
 * itself. That reveal is a heuristic aimed at the CARET, it fires on focus, and it is
 * never re-run for a layout change while focus stays put — and per this repo's own
 * Safari trap a tap on a `<button>` does not move focus. So tapping `Balas` inserts
 * ~60px of reply stub into a composer whose position the browser has already decided
 * about and will not revisit: **reported from a real iPhone, 2026-08-09, the field
 * cropped and the send button under the keyboard.** `StagedAttachment` is the same
 * shape and would have arrived at the same place.
 *
 * ── WHY THIS MEASURES A RECT AND DERIVES NOTHING ───────────────────────────
 *
 * The obvious formula is `innerHeight - visualViewport.height - offsetTop`, and it
 * rests on a recalled claim about which viewport `window.innerHeight` reports on iOS
 * when the toolbar is half-collapsed. This file makes no such claim. It reads the
 * room's own `getBoundingClientRect().bottom` and the bottom of the visible band, both
 * in layout-viewport coordinates, and subtracts — so the toolbar, the insets, the pan
 * and `dvh` itself all cancel because they move both numbers together. *Framework
 * behaviour is measured here, never recalled.*
 *
 * ── IT IS A MARGIN, NOT A HEIGHT ────────────────────────────────────────────
 *
 * `.room` stretches into the shell's second grid row, and a stretched grid item is
 * sized to its area MINUS its margins. So a bottom margin can only ever make the room
 * shorter, the grid re-flows exactly as it already does when the composer grows, and
 * an unset variable is byte-identical to the old behaviour. A computed `height` would
 * have to know the natural one to avoid GROWING the room past the shell, and would be
 * clipped by `overflow: hidden` on the day it got it wrong.
 *
 * **ONLY LOOP 6 CAN CONFIRM THIS**, for the reason `page.module.css` already gives:
 * loop 5's Chrome has no software keyboard, so `visualViewport.height` there always
 * equals the layout viewport and every number below is zero.
 */

/** The custom property `.room` reads. Set inline on the room element, never globally. */
export const KEYBOARD_INSET_VAR = '--kb-inset';

/**
 * Below this, a new reading is noise rather than news. Without a deadband the
 * sub-pixel drift Safari reports while a scroll settles would write a style, move the
 * rect, and schedule another measurement of the thing it just moved.
 *
 * Against an integer `applied` and a rounded target this is the rounding said out
 * loud, and it stays anyway: the property that matters is *do not write a style for a
 * reading that has not changed*, which has to survive somebody deleting the `round`.
 */
export const INSET_DEADBAND_PX = 1;

export type KeyboardInsetInput = {
  /** What is applied right now, in CSS px. */
  applied: number;
  /** `room.getBoundingClientRect().bottom` — layout-viewport coordinates. */
  roomBottom: number;
  /** `visualViewport.offsetTop + visualViewport.height` — the same coordinates. */
  visibleBottom: number;
  /** `visualViewport.height`. The cap: nothing may eat more than the visible band. */
  visible: number;
  /** `visualViewport.scale`. Anything but 1 means the querent has pinched. */
  scale: number;
};

/**
 * The next inset to apply, or `applied` when the reading is not worth acting on.
 *
 * **THE GAIN IS EXACTLY 1 AND THAT IS WHY THIS CONVERGES IN ONE STEP.** Adding the
 * overhang to the margin moves the room's bottom up by precisely the overhang, so the
 * following measurement confirms rather than corrects. It is still a loop rather than
 * a one-shot, because the keyboard closing produces a NEGATIVE overhang and the same
 * arithmetic has to give the margin back.
 *
 * **A PINCHED PAGE RETURNS TO ZERO RATHER THAN HOLDING ITS VALUE.** Under zoom the two
 * rects are in different scales and the subtraction is meaningless; `layout.tsx`
 * refused `maximumScale: 1` on WCAG 1.4.4 grounds, so a zoomed room shrinking to
 * nothing is a reachable state and not a theoretical one. Zero is the old behaviour,
 * which is wrong about the keyboard and right about everything else.
 */
export function nextKeyboardInset({
  applied,
  roomBottom,
  visibleBottom,
  visible,
  scale,
}: KeyboardInsetInput): number {
  if (!Number.isFinite(scale) || Math.abs(scale - 1) > 0.01) return 0;
  if (![applied, roomBottom, visibleBottom, visible].every(Number.isFinite)) return applied;

  const overhang = roomBottom - visibleBottom;
  const target = Math.round(Math.max(0, Math.min(applied + overhang, visible)));
  return Math.abs(target - applied) < INSET_DEADBAND_PX ? applied : target;
}

/**
 * Keeps `--kb-inset` on the room equal to however much of it is under the keyboard.
 *
 * No `visualViewport` — every iOS Safari this app runs on has one, but a browser
 * without it gets the pre-2026-08-09 layout rather than an exception.
 */
export function useKeyboardInset(room: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    const el = room.current;
    if (!viewport || !el) return;

    let applied = 0;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const next = nextKeyboardInset({
        applied,
        roomBottom: el.getBoundingClientRect().bottom,
        visibleBottom: viewport.offsetTop + viewport.height,
        visible: viewport.height,
        scale: viewport.scale,
      });
      if (next === applied) return;
      applied = next;
      el.style.setProperty(KEYBOARD_INSET_VAR, `${applied}px`);
      /* The room has just moved, so the rect that produced this number is stale by
         construction. One re-measure after layout closes the loop. */
      frame = requestAnimationFrame(measure);
    };

    measure();
    /* `scroll` as well as `resize`: iOS pans the visual viewport to reveal the caret
       WITHOUT resizing it, and that pan is the other half of `visibleBottom`. */
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
      el.style.removeProperty(KEYBOARD_INSET_VAR);
    };
  }, [room]);
}
