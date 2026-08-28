import { describe, expect, it } from 'vitest';

import {
  advanceDrag,
  beginDrag,
  clampOffset,
  DIRECTION_SLOP,
  endDrag,
  FLICK_PX_PER_MS,
  MAX_OVERDRAG,
  OPEN_AT,
  REVEAL_WIDTH,
  type SwipeDrag,
} from './swipe';

/** A whole gesture, as a list of (x, y, t) samples after the pointer-down. */
function gesture(
  from: { x: number; y: number; at: number; open: boolean },
  moves: ReadonlyArray<[number, number, number]>,
): SwipeDrag {
  let drag = beginDrag(from.x, from.y, from.at, from.open);
  for (const [x, y, at] of moves) drag = advanceDrag(drag, x, y, at);
  return drag;
}

describe('clampOffset', () => {
  it('refuses to move right of closed, with no rubber band', () => {
    expect(clampOffset(0)).toBe(0);
    expect(clampOffset(-40)).toBe(0);
  });

  it('is the identity inside the tray', () => {
    expect(clampOffset(1)).toBe(1);
    expect(clampOffset(REVEAL_WIDTH)).toBe(REVEAL_WIDTH);
  });

  it('rubber-bands past the tray and caps the overdrag', () => {
    expect(clampOffset(REVEAL_WIDTH + 20)).toBeCloseTo(REVEAL_WIDTH + 7, 5);
    expect(clampOffset(REVEAL_WIDTH + 4000)).toBe(REVEAL_WIDTH + MAX_OVERDRAG);
  });
});

describe('the direction lock', () => {
  it('calls a gesture under the slop a tap, wobble and all', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [197, 302, 16],
      [201, 299, 32],
      [200, 300, 48],
    ]);
    expect(drag.axis).toBe('none');
    expect(drag.offset).toBe(0);
    expect(endDrag(drag)).toEqual({ kind: 'tap' });
  });

  it('locks to y on a vertical drag and never moves the tray', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [200, 320, 16],
      [200, 380, 32],
    ]);
    expect(drag.axis).toBe('y');
    expect(drag.offset).toBe(0);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  /*
   * THE STICKY RULE. Without it, a flick down a long list that drifts sideways
   * halfway through leaves a trail of half-open rows behind it -- which looks
   * like the page is broken rather than like one gesture was ambiguous.
   */
  it('stays locked to y even when the pointer later travels far in x', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [200, 320, 16],
      [80, 340, 32],
      [40, 360, 48],
    ]);
    expect(drag.axis).toBe('y');
    expect(drag.offset).toBe(0);
  });

  it('locks to x when the horizontal component wins at the slop', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [200 - DIRECTION_SLOP - 1, 302, 16],
    ]);
    expect(drag.axis).toBe('x');
    expect(drag.offset).toBe(DIRECTION_SLOP + 1);
  });
});

describe('where a release settles', () => {
  it('settles closed short of halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [180, 300, 100],
      [200 - (OPEN_AT - 14), 300, 400],
    ]);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  it('settles open past halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [180, 300, 100],
      [200 - (OPEN_AT + 16), 300, 400],
    ]);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: true });
  });

  it('opens on a short fast flick that never reached halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [188, 300, 12],
      [176, 300, 24],
    ]);
    expect(drag.offset).toBeLessThan(OPEN_AT);
    expect(drag.velocity).toBeGreaterThanOrEqual(FLICK_PX_PER_MS);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: true });
  });

  it('closes on a rightward flick even from a mostly-open row', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: true }, [
      [212, 300, 12],
      [224, 300, 24],
    ]);
    expect(drag.offset).toBeGreaterThan(OPEN_AT);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  it('closes when an open row is dragged back past halfway', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: true }, [
      [230, 300, 120],
      [260, 300, 420],
    ]);
    expect(drag.offset).toBe(REVEAL_WIDTH - 60);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: false });
  });

  it('reports a tap on an open row, so the caller can swallow it', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: true }, [[202, 301, 20]]);
    expect(endDrag(drag)).toEqual({ kind: 'tap' });
  });

  /*
   * THE VELOCITY CARRY. Browsers emit a final `pointermove` at the previous x
   * routinely; recomputing from it reports 0 px/ms at the end of a fast flick
   * and settles the row closed under the querent's finger.
   */
  it('keeps the flick velocity through a duplicate final sample', () => {
    const drag = gesture({ x: 200, y: 300, at: 0, open: false }, [
      [188, 300, 12],
      [176, 300, 24],
      [176, 300, 40],
    ]);
    expect(drag.velocity).toBeGreaterThanOrEqual(FLICK_PX_PER_MS);
    expect(endDrag(drag)).toEqual({ kind: 'settle', open: true });
  });
});
