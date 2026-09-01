/**
 * Whether the draw screen should keep following the reading as it streams in.
 *
 * ── WHY IT IS HERE AND NOT IN THE COMPONENT ────────────────────────────────
 *
 * `src/lib/swipeDeck.ts`'s argument, and `src/lib/chatSurface.ts`'s after it: this
 * project has no jsdom, no Testing Library and no browser test runner, and it **must
 * not acquire any** -- so the only part of a client component `npm test` can reach is
 * the part that touches neither React nor the DOM. `ReadingPanel.tsx` reads two
 * numbers off the window and this file decides what they mean.
 *
 * A THIRD per-surface module rather than an import from `chatSurface.ts`: that file's
 * own header declares it *the chat surface's* decisions and it imports
 * `@/lib/chat/types`. One pure module per surface is already the pattern here.
 *
 * ── PURE. NO REACT, NO DOM, NO `next/*`, NO `server-only`. NO IMPORTS AT ALL ─
 */

/**
 * How far from the bottom of the document still counts as *at the bottom*.
 *
 * **48px is under one line of the reading face.** `--fs-reading` at `--lh-reading` is
 * taller than this, so a querent who has deliberately scrolled up by even one line of
 * prose is not treated as still following -- while the sub-pixel residue a browser
 * leaves after a snap, and the fractional `scrollY` an iPhone reports mid-glide, are.
 *
 * It is DERIVED FOR PROSE and only coincidentally equals `ANCHOR_THRESHOLD_PX`, which
 * is one chat bubble plus its padding. Do not fold the two together: they answer the
 * same question about different things on screen, and the day one of them moves is the
 * day the difference matters.
 */
export const FOLLOW_THRESHOLD_PX = 48;

export type FollowInput = {
  /**
   * `scrollHeight - scrollY - innerHeight` of the document, read AFTER the new chunk
   * has been laid out.
   */
  distanceFromBottom: number;
  /**
   * How much taller the document got in the commit that just happened --
   * `scrollHeight` now minus `scrollHeight` at the previous observation. `0` on the
   * first observation of a reading, and `0` is the honest answer there rather than a
   * fallback: nothing is known to have grown.
   */
  grewBy: number;
  threshold?: number;
};

/**
 * Follow the stream, or leave the page where the querent put it.
 *
 * ── THE MEASUREMENT IS TAKEN AFTER THE COMMIT AND CORRECTED BACKWARDS ──────
 *
 * `ChatRoom` states the trap this answers: **the decision has to be made on the
 * distance from the bottom BEFORE the DOM grows**, because afterwards `scrollHeight`
 * already contains the new content and a querent sitting at the bottom measures as
 * having scrolled away by exactly the height of what just arrived. It solves that by
 * reading the distance in the handler that appends, before React commits.
 *
 * **This surface can recover the same number afterwards, because it ONLY EVER
 * APPENDS.** Growth all lands below the viewport, so it cannot move `scrollY`, and the
 * pre-growth distance is just the post-growth one minus the growth. `ChatRoom` cannot
 * do this -- `loadOlder` PREPENDS history, which really does move `scrollTop` under
 * the querent, and is why that component also carries a manual compensation. The
 * reading has no history to prepend.
 *
 * That difference is the whole reason none of this has to live in `Draw.tsx`'s chunk
 * loop: two numbers off the window, after the fact, answer the same question.
 *
 * Two consequences worth stating, because both look like bugs and are neither:
 *
 *   - A negative result is normal and means *follow*. iOS collapsing its toolbar grows
 *     `innerHeight` without growing the document, so the distance shrinks with nobody
 *     scrolling. Erring toward following is the correct direction: the alternative is
 *     a stream that silently stops being followed because a browser moved its own
 *     chrome.
 *   - Prose that gets SHORTER pushes the result the other way. `splitChoiceMarker` can
 *     strip a trailing marker on the final chunk, so `grewBy` goes negative and the
 *     comparison becomes stricter for one frame. Harmless, and not worth a branch.
 */
export function shouldFollowStream({
  distanceFromBottom,
  grewBy,
  threshold = FOLLOW_THRESHOLD_PX,
}: FollowInput): boolean {
  return distanceFromBottom - grewBy <= threshold;
}
