import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `ReadingPanel`'s half of card #32's follow-the-stream, held at the SOURCE LEVEL.
 *
 * `readingRhythm.test.ts`'s idiom and its caveat verbatim: **this test cannot see the
 * screen.** `npm test` is logic only -- no jsdom, no Testing Library, no browser -- so
 * what it can do is fail when one of the decisions written into this component is
 * quietly undone. The decisions themselves are argued in the component's header and in
 * `src/lib/readingScroll.ts`; the real instruments are loop 5 (`tools/e2e/run.sh`) for
 * the mechanics and a real iPhone for the judgement.
 *
 * Every assertion below is a thing that would still compile, still pass every other
 * test, and be wrong on a phone.
 */

const SRC = readFileSync(join(process.cwd(), 'src', 'components', 'ReadingPanel.tsx'), 'utf8');

describe('ReadingPanel follows the stream', () => {
  it('takes the policy from the pure module instead of inlining a threshold', () => {
    expect(SRC).toContain("from '@/lib/readingScroll'");
    expect(SRC).toContain('shouldFollowStream({ distanceFromBottom, grewBy })');
    // A bare 48 here would be the number living in two places, which is how one moves.
    expect(SRC).not.toMatch(/\b48\b/);
  });

  it('scrolls before paint, so a grown page is never shown un-followed for a frame', () => {
    expect(SRC).toContain('useLayoutEffect(');
  });

  it("passes 'auto' for the follow, and keeps the single 'smooth' on the acquisition", () => {
    /*
     * A JS `scrollTo({ behavior })` OVERRIDES CSS `scroll-behavior` rather than
     * defaulting from it, so the behaviour is always explicit here. The follow is
     * `'auto'` unconditionally -- a per-chunk `smooth` restarts its animation every
     * few tens of milliseconds and never lands. See the component's header.
     */
    expect(SRC).toContain("window.scrollTo({ top: height, behavior: 'auto' })");
    /* `behavior:`, not a bare `'smooth'` -- the component's header QUOTES the
       `reduce || isStill() ? 'auto' : 'smooth'` idiom it is explaining a departure
       from, and a grep that counts prose fails on a correct file. */
    expect(SRC.match(/behavior: 'smooth'/g) ?? []).toHaveLength(1);
    expect(SRC).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
  });

  it('follows only while streaming, so the completion commit cannot yank the page', () => {
    /*
     * `done` mounts `AttachReadingLink`, `ReadingActions` and the disclaimer. Following
     * the document bottom through that commit lands the querent on a row of buttons,
     * past the paragraph they are reading.
     */
    expect(SRC).toContain("if (state.status !== 'streaming') return;");
  });

  it('adds no scroll listener: the growth correction is what detects a scroll', () => {
    /*
     * A listener cannot tell this component's own programmatic scroll from the
     * querent's, so it would need a suppression flag that is only correct if scroll
     * events coalesce -- which nothing promises.
     */
    expect(SRC).not.toContain('addEventListener');
  });

  it('measures the DOCUMENT, not the panel', () => {
    // `.shell`'s `padding-bottom: calc(96px + env(safe-area-inset-bottom))` already
    // clears the fixed `.footer`, so the document's bottom is the right anchor.
    expect(SRC).toContain('document.documentElement.scrollHeight');
    expect(SRC).not.toContain('getBoundingClientRect');
  });

  it('forgets the height when the reading resets, or the next one starts mid-follow', () => {
    expect(SRC).toMatch(/if \(state\.status === 'idle'\) \{[^}]*lastHeight\.current = null;/s);
  });

  it('still keeps the one-shot acquisition, which is what brings the panel into view', () => {
    expect(SRC).toContain('if (scrolledOnce.current) return;');
  });
});
