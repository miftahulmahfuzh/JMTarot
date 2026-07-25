/**
 * Pick a card, or return one already picked.
 *
 * `picks` holds indices into the shuffled deck, in the order they were chosen,
 * which is also the order they occupy the slots.
 *
 * Returning a card splices it out rather than blanking its slot, so everything
 * after it shifts left and the slots stay filled left to right with no hole.
 * That is the behaviour to check when you return the middle card of three: the
 * third card must slide into slot two, not sit alone in slot three.
 *
 * Picking beyond `cardCount` is a no-op rather than an error or a
 * replace-the-oldest, so a stray tap on a full spread does nothing visible.
 * Returning always works, which is the only way back out of a full spread.
 *
 * Returns the same array reference when nothing changes, so React can skip the
 * re-render.
 */
export function togglePick(picks: number[], index: number, cardCount: number): number[] {
  const at = picks.indexOf(index);
  if (at >= 0) return [...picks.slice(0, at), ...picks.slice(at + 1)];
  if (picks.length >= cardCount) return picks;
  return [...picks, index];
}
