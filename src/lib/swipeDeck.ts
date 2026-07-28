/**
 * The two decisions the swipe deck makes, as pure functions.
 *
 * WHY THEY ARE HERE AND NOT IN THE COMPONENT. This project has no jsdom, no
 * Testing Library and no Playwright, and it must not acquire any of them --
 * Chromium cannot launch in this WSL image. So the only part of a client
 * component `npm test` can reach is the part that does not touch React or the
 * DOM. `src/lib/draw.ts`'s `togglePick` is the precedent: the interesting
 * decision lives in a pure function beside the component, the component is the
 * thin part, and the harness under `public/cards/` covers the rest.
 *
 * The policy in `shouldAutoSlide` is the thing most likely to be quietly broken
 * by a later change -- every one of its five falsy branches is a rule somebody
 * would remove as redundant.
 */

/**
 * Which panel a scroll container has settled on.
 *
 * ROUNDS, because a snap container reports every intermediate position while
 * the momentum decays, and the answer wanted here is "which one will it land
 * on". CLAMPS, because iOS rubber-banding reports a negative `scrollLeft` at
 * the left edge and an over-scrolled one at the right, and `children[-1]` is
 * `undefined`.
 *
 * THIS ARITHMETIC ASSUMES NO GAP BETWEEN PANELS. `SwipeDeck.module.css` has no
 * `gap` on the track for exactly this reason, and says so.
 */
export function panelIndexAt(scrollLeft: number, panelWidth: number, count: number): number {
  if (panelWidth <= 0 || count <= 0) return 0;
  const i = Math.round(scrollLeft / panelWidth);
  return Math.min(count - 1, Math.max(0, i));
}

export type AutoSlideInput = {
  /** The key of a panel that has just appeared, or null. */
  arrived: string | null;
  panelKeys: readonly string[];
  /** Keys this deck has already auto-slid to, ever. */
  alreadySlidTo: ReadonlySet<string>;
  /** Has the querent touched this deck -- pointer, wheel, key or dot? */
  interacted: boolean;
  /** Is focus on something that is neither the body nor inside the deck? */
  focusIsElsewhere: boolean;
};

/**
 * May the deck move itself?
 *
 * FIVE WAYS TO SAY NO AND ONE TO SAY YES, and the asymmetry is the design. An
 * unrequested scroll is an interruption; the default is not to interrupt.
 *
 *   - nothing arrived, or the deck has one panel: there is no motion to make.
 *   - the arrival is panel 0: it is already on screen. This also catches a key
 *     that is not in the deck at all (`indexOf` -> -1), which is why the check
 *     is `< 1` and not `=== 0`.
 *   - ALREADY SLID. The summary streams, so `ReaderDeck` re-renders on every
 *     chunk and the effect that calls this runs again each time. Without this
 *     the deck would re-scroll on every token, pinning the querent to the
 *     summary panel and making it impossible to swipe back until the stream
 *     ended. This is the single most important line in the file.
 *   - INTERACTED. Stealing a scroll the querent started is strictly worse than
 *     not sliding: they have expressed an intention and the app has overruled
 *     it. Once true it is never reset.
 *   - FOCUS IS ELSEWHERE. A keyboard user who has tabbed to a service link has
 *     also expressed an intention, and scrolling a region they are not in
 *     moves the page under them for no reason they can see.
 */
export function shouldAutoSlide(i: AutoSlideInput): boolean {
  if (!i.arrived) return false;
  if (i.panelKeys.length < 2) return false;
  if (i.panelKeys.indexOf(i.arrived) < 1) return false;
  if (i.alreadySlidTo.has(i.arrived)) return false;
  if (i.interacted) return false;
  if (i.focusIsElsewhere) return false;
  return true;
}
