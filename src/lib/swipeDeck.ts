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
