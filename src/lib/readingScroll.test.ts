import { describe, expect, it } from 'vitest';
import { FOLLOW_THRESHOLD_PX, shouldFollowStream } from './readingScroll';

/**
 * The predicate behind card #32's follow-the-stream.
 *
 * **THIS IS THE ONLY PART OF THE FEATURE `npm test` CAN REACH**, and that is by
 * design rather than by neglect: there is no jsdom and no browser here, so the DOM
 * reads live in `ReadingPanel.tsx` and every decision they feed lives in the module
 * under test. `readingScroll.test.ts` in `src/components/` holds the source-level
 * contract on the component's half; loop 5 and a real iPhone hold the rest.
 */

/** One chunk of prose, roughly: a few words wrapping to a line and a bit. */
const CHUNK = 30;

describe('shouldFollowStream', () => {
  it('follows a querent who has not moved, however big the chunk', () => {
    // Sitting exactly at the bottom means the distance IS the growth.
    for (const grewBy of [1, CHUNK, 200, 4000]) {
      expect(shouldFollowStream({ distanceFromBottom: grewBy, grewBy })).toBe(true);
    }
  });

  it('lets go of a querent who scrolled up to re-read', () => {
    expect(shouldFollowStream({ distanceFromBottom: 300 + CHUNK, grewBy: CHUNK })).toBe(false);
  });

  it('re-acquires when they scroll back down, even on the chunk that lands next', () => {
    /*
     * The correction is what makes this work. They are at the bottom of the page as
     * they left it, and then 200px of prose arrives in one commit -- so the RAW
     * distance is 200 and only the growth-corrected one is honest.
     */
    expect(shouldFollowStream({ distanceFromBottom: 200, grewBy: 200 })).toBe(true);
  });

  it('holds the threshold at exactly one line, and one pixel past it lets go', () => {
    const at = { distanceFromBottom: FOLLOW_THRESHOLD_PX, grewBy: 0 };
    expect(shouldFollowStream(at)).toBe(true);
    expect(shouldFollowStream({ ...at, distanceFromBottom: FOLLOW_THRESHOLD_PX + 1 })).toBe(false);
  });

  it('treats a negative result as follow, which is the iOS toolbar case', () => {
    /*
     * Safari collapsing its toolbar grows `innerHeight` without growing the document,
     * so the distance shrinks with nobody scrolling. Erring toward following is the
     * correct direction -- see the function's header.
     */
    expect(shouldFollowStream({ distanceFromBottom: -90, grewBy: 0 })).toBe(true);
  });

  it('is stricter for one frame when the prose gets SHORTER, and that is allowed', () => {
    // `splitChoiceMarker` can strip a trailing marker on the final chunk.
    expect(shouldFollowStream({ distanceFromBottom: 40, grewBy: -20 })).toBe(false);
  });

  it('judges the first observation on the raw distance, with nothing known to have grown', () => {
    expect(shouldFollowStream({ distanceFromBottom: 0, grewBy: 0 })).toBe(true);
    expect(shouldFollowStream({ distanceFromBottom: 900, grewBy: 0 })).toBe(false);
  });

  it('takes a threshold, so a caller is never tempted to inline the number', () => {
    expect(shouldFollowStream({ distanceFromBottom: 100, grewBy: 0, threshold: 120 })).toBe(true);
  });
});

describe('FOLLOW_THRESHOLD_PX', () => {
  it('is its own number and not imported from the chat surface', async () => {
    /*
     * It equals `ANCHOR_THRESHOLD_PX` today and answers the same question about a
     * different thing on screen -- one line of prose against one chat bubble. The
     * assertion is that this module owns it: `chatSurface.ts` pulls in
     * `@/lib/chat/types`, and the draw screen has no business importing those.
     */
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./readingScroll.ts', import.meta.url), 'utf8'),
    );
    expect(src).not.toMatch(/^import\b/m);
    expect(FOLLOW_THRESHOLD_PX).toBe(48);
  });
});
