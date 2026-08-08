import { describe, expect, it } from 'vitest';

import { nextKeyboardInset } from '@/app/chat/keyboardInset';

/**
 * The arithmetic behind `--kb-inset` (2026-08-09).
 *
 * **THE HOOK IS UNTESTABLE HERE AND THE MATHS IS NOT**, which is why they are two
 * exports: `npm test` runs under `environment: 'node'`, there is no `visualViewport`
 * and there is no software keyboard in any browser this repo can drive. What a unit
 * test CAN hold is that the numbers a real iPhone reports turn into the right margin —
 * so the figures below are one, taken from a 390x844 phone with a 336px keyboard and a
 * 34px home indicator.
 *
 * Every case is in LAYOUT-viewport coordinates, the ones `getBoundingClientRect` and
 * `visualViewport.offsetTop` share.
 */

/** The room's bottom edge with the keyboard down: the shell's bottom, less the inset
 *  `<body>` pads for the home indicator. */
const ROOM_BOTTOM = 810;
/** `visualViewport.height` with nothing over it, and with a 336px keyboard up. */
const OPEN = 844;
const SHUT = 844 - 336;

describe('nextKeyboardInset', () => {
  it('is zero with the keyboard down, though the room ends above the fold', () => {
    /*
     * The overhang is NEGATIVE here — `<body>`'s `padding-bottom` for the home
     * indicator holds the room 34px clear of the bottom. A formula that took the
     * absolute distance would eat 34px of room on a screen with no keyboard on it.
     */
    expect(
      nextKeyboardInset({
        applied: 0,
        roomBottom: ROOM_BOTTOM,
        visibleBottom: OPEN,
        visible: OPEN,
        scale: 1,
      }),
    ).toBe(0);
  });

  it('gives back exactly what the keyboard covers, the first time it is asked', () => {
    expect(
      nextKeyboardInset({
        applied: 0,
        roomBottom: ROOM_BOTTOM,
        visibleBottom: SHUT,
        visible: SHUT,
        scale: 1,
      }),
    ).toBe(ROOM_BOTTOM - SHUT);
  });

  it('holds still once the room ends on the fold, because the gain is exactly 1', () => {
    /*
     * The step above moved the room's bottom up by precisely the overhang, so the
     * NEXT reading has none. This is the property that makes a feedback loop safe to
     * run off a `scroll` handler: it converges in one step and then reports nothing.
     */
    const applied = ROOM_BOTTOM - SHUT;
    expect(
      nextKeyboardInset({ applied, roomBottom: SHUT, visibleBottom: SHUT, visible: SHUT, scale: 1 }),
    ).toBe(applied);
  });

  it('counts a pan against the overhang rather than on top of it', () => {
    /*
     * Safari reveals a focused field by panning the visual viewport DOWN inside the
     * layout viewport, which is `offsetTop` — so part of the occlusion has already
     * been paid for by the time this runs. Reading `visibleBottom` as
     * `offsetTop + height` is what stops the room being shortened twice for one
     * keyboard.
     */
    const offsetTop = 100;
    expect(
      nextKeyboardInset({
        applied: 0,
        roomBottom: ROOM_BOTTOM,
        visibleBottom: offsetTop + SHUT,
        visible: SHUT,
        scale: 1,
      }),
    ).toBe(ROOM_BOTTOM - SHUT - offsetTop);
  });

  it('gives the margin back when the keyboard closes', () => {
    /* The same arithmetic, run on a negative overhang. There is no separate branch
       for putting the room back, and there must not be one. */
    expect(
      nextKeyboardInset({
        applied: ROOM_BOTTOM - SHUT,
        roomBottom: SHUT,
        visibleBottom: OPEN,
        visible: OPEN,
        scale: 1,
      }),
    ).toBe(0);
  });

  it('surrenders under pinch-zoom rather than holding its last value', () => {
    /*
     * `layout.tsx` refused `maximumScale: 1` on WCAG 1.4.4 grounds, so a zoomed room
     * is reachable. Under zoom the two rects are in different scales and the
     * subtraction means nothing — zero is the pre-fix layout, which is wrong about
     * the keyboard and right about everything else.
     */
    expect(
      nextKeyboardInset({
        applied: 300,
        roomBottom: ROOM_BOTTOM,
        visibleBottom: SHUT,
        visible: SHUT,
        scale: 1.8,
      }),
    ).toBe(0);
  });

  it('can never eat more than the visible band, whatever the rect says', () => {
    expect(
      nextKeyboardInset({
        applied: 0,
        roomBottom: 99_999,
        visibleBottom: SHUT,
        visible: SHUT,
        scale: 1,
      }),
    ).toBe(SHUT);
  });

  it('ignores sub-pixel drift and takes a whole pixel', () => {
    /* A `scroll` handler fires many times as one flick settles; without this each of
       them would write a style and schedule a re-measure of its own effect. */
    expect(
      nextKeyboardInset({
        applied: 302,
        roomBottom: 458.4,
        visibleBottom: 458,
        visible: SHUT,
        scale: 1,
      }),
    ).toBe(302);
    expect(
      nextKeyboardInset({
        applied: 302,
        roomBottom: 459,
        visibleBottom: 458,
        visible: SHUT,
        scale: 1,
      }),
    ).toBe(303);
  });

  it('keeps what it has when a reading is not a number', () => {
    expect(
      nextKeyboardInset({
        applied: 302,
        roomBottom: Number.NaN,
        visibleBottom: SHUT,
        visible: SHUT,
        scale: 1,
      }),
    ).toBe(302);
  });
});
