/** Hard cap. Rejected above this, never silently truncated. */
export const MAX_QUESTION_LENGTH = 200;

/*
 * Matches <pertanyaan> and </pertanyaan> in any casing, with whitespace
 * anywhere inside the tag. The querent's text is delimited by those tags in
 * the user turn, so a literal one in the question could close the block early
 * and put the rest of their text where instructions live.
 */
const DELIMITER = /<\s*\/?\s*pertanyaan\s*>/gi;

/*
 * C0 and C1 control characters, minus the whitespace handled separately below.
 * These can carry no meaning in a typed question.
 */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

/*
 * Unicode format characters: bidi overrides (U+202A-U+202E), zero-width
 * joiners and spaces, and friends.
 *
 * CONTROL used to claim it covered "direction overrides". It did not -- they
 * are outside both C0 and C1, so they passed straight through. Two reasons
 * they must not: a bidi override reorders rendered text against its logical
 * content, so what a reviewer reads and what the model receives can differ;
 * and a zero-width space inside `<pertanyaan>` defeats DELIMITER, which is why
 * this runs BEFORE the delimiter pass rather than after.
 */
const FORMAT = /\p{Cf}/gu;

/**
 * Remove delimiters until removing them stops changing the string.
 *
 * One pass is not enough, and the reason is not obvious: deleting a tag closes
 * the gap between whatever sat on either side of it, and those two halves can
 * spell a fresh tag.
 *
 *   '</pert</pertanyaan>anyaan>halo'  --one pass-->  '</pertanyaan>halo'
 *
 * buildPrompt sanitizes exactly once before wrapping the result in
 * <pertanyaan>...</pertanyaan>, so a survivor closes the block immediately and
 * strands the rest of the querent's text outside the delimited region -- the
 * one region the base contract's KEAMANAN rule is scoped to.
 *
 * Terminates because every iteration that continues has strictly shortened the
 * string.
 */
function stripDelimiters(input: string): string {
  let out = input;
  for (;;) {
    const next = out.replace(DELIMITER, '');
    if (next === out) return out;
    out = next;
  }
}

/**
 * Clean a typed question, or return null if there is effectively none.
 *
 * This used to say the auth gate was the real mitigation, because only two
 * people could reach it, and that everything here was defence in depth. That
 * was true and it is the reason the delimiter pass went eight months without
 * anyone noticing it ran exactly once. Google sign-in removes the gate: this
 * function is now reachable by anyone with a Gmail address, so it is the
 * defence, not a layer behind one. Treat a bug here as a live vulnerability.
 *
 * Order matters, in two ways. Control and format characters are stripped
 * BEFORE the delimiters, because either can be hidden inside a tag to smuggle
 * it past DELIMITER. And delimiters are removed before length is checked, so
 * padding a question with tags cannot push a short one over the cap; the
 * result is re-checked for emptiness afterwards, so a question made entirely
 * of tags becomes "no question" rather than an empty delimited block.
 */
export function sanitizeQuestion(raw: string | undefined | null): string | null {
  if (!raw) return null;

  const cleaned = stripDelimiters(raw.replace(CONTROL, '').replace(FORMAT, ''))
    // Newlines and tabs collapse to a space rather than vanishing: dropping
    // them would run two words together, and keeping them would let the
    // querent fake structure inside the delimited block.
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim();

  if (cleaned.length === 0) return null;
  if (cleaned.length > MAX_QUESTION_LENGTH) return null;
  return cleaned;
}
