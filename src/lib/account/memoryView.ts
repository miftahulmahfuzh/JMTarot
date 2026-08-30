/**
 * What the querent sees on `/account` when they ask what the room has noted about
 * them, and the narrowing the delete route applies to an id off a URL path.
 *
 * **PURE, AND CLIENT-IMPORTABLE ON PURPOSE.** No `server-only`, no `process.env`,
 * no `next/*`, no `@/lib/db/**` — `clientBoundary.test.ts` forbids the last of
 * those in a client component and its regex does not know the `type` keyword, so
 * without this module the browser could not name the shape it renders.
 * `@/lib/account/grace.ts` moved out of `queries/profile.ts` under the same
 * constraint from the same side, and `@/lib/persona/lines.ts` is the other
 * precedent: one client-importable module beside server-only ones, kept honest by a
 * test asserting what it does not contain rather than by its filename.
 *
 * ── IT READS THE ROW STRUCTURALLY, AND THAT IS THE WHOLE DESIGN ──────────────
 *
 * Phase 3 owns `user_memory` and its payload is a LIST OF ADDRESSABLE ITEMS —
 * `user_memory.items`, one `UserMemoryItem` per remembered fact, each with a stable
 * content-derived `id`. One view row per item, keyed by that id.
 *
 * **THE READ IS STRUCTURAL, AND THAT IS LOAD-BEARING RATHER THAN DEFENSIVE.**
 * `$type<>` is an assertion the driver is not obliged to honour (`answersUpdatedAt`'s
 * lesson), and these rows are written from MODEL OUTPUT, so a row written before a
 * value set changed can hold anything. Narrowing per item is the only honest read.
 *
 * **DO NOT "TIDY" THIS INTO AN IMPORT OF `UserMemory` FROM `@/lib/db/schema`.**
 * That import is exactly what the client fence forbids, which is why phase 3's shape
 * lives in a zero-import leaf at `@/lib/memory/profile/types` and why
 * `isUserMemoryItem` may be imported here and nothing else from that tree.
 *
 * ── THE NARROWER IS PHASE 3's, AND THAT IS WHAT KEEPS THE SCREEN HONEST ──────
 *
 * `src/lib/chat/context.ts:280` filters the same column through `isUserMemoryItem`
 * before an item reaches `<ingatan>`. Using the same predicate here is not tidiness:
 * it makes **what the querent reads and what the readers were told the same set**,
 * which is the one property this whole surface exists to provide. A looser narrower
 * here would list a line the prompt never sees; a stricter one would hide a line the
 * prompt does see, and hide its delete button with it.
 *
 * ── EVERY CEILING HERE IS A DISPLAY CEILING, NEVER A VALIDATION ONE ──────────
 *
 * The row was written by our own extractor, so this is not a trust boundary; it is
 * a rendering boundary. A payload that somehow held four hundred items would make
 * `/account` unusable and the fetch large, so the list is capped and each line is
 * clipped. Both are silent, because a person cannot act on "the machine wrote too
 * much about you" and the honest control — delete it — is right there. Both sit
 * ABOVE what phase 3 already enforces (`USER_MEMORY_MAX_ITEMS` is 32 and
 * `USER_MEMORY_ITEM_MAX_CHARS` is 140), so in ordinary operation neither fires.
 * They are the belt to that brace, and they cost one comparison each.
 */

/* RECONCILED: `WHOLE_MEMORY_ID` and the prose-blob arm are cancelled — phase 3 chose the
 * item list, and a dead branch in an adapter is a branch somebody later "fixes" into
 * existence. */

import { isUserMemoryItem, USER_MEMORY_ITEM_ID_RE } from '@/lib/memory/profile/types';

/** One line on screen, and the id that deletes it. */
export type MemoryItemView = { id: string; text: string };

/**
 * What `getUserMemory` is expected to return, named STRUCTURALLY.
 *
 * The field is optional and `unknown`: this module is handed a row it did not
 * define, and narrowing is its job rather than the caller's.
 */
export type MemoryRowLike = { items?: unknown };

/**
 * `/account` is a phone screen and the payload is model output. Sixty lines is far
 * past anything the extractor should produce and still renders; four hundred
 * characters is roughly three lines at `--fs-hint`.
 */
const MAX_ITEMS = 60;
const MAX_TEXT = 400;

/**
 * Twelve lowercase hex characters — phase 3's `USER_MEMORY_ITEM_ID_RE`, **IMPORTED
 * RATHER THAN DUPLICATED**, which reverses this plan's own instruction on the
 * evidence that its reason is spent: the duplication was to keep this module at zero
 * imports, and `isUserMemoryItem` above already spends that budget on the same leaf.
 * With the budget spent, an imported regex is strictly better than a copied one —
 * the contract and the guard cannot drift at all, rather than drifting only in the
 * direction that happens to be safe.
 *
 * This is also what the DELETE route narrows a path segment with: an id it did not
 * recognise must never reach a query, which is `isOnboardingQuestionKey`'s rule on
 * `/api/onboarding/answer/[key]` — an unknown key that reaches the delete matches
 * nothing and returns a cheerful 404, which reads as "already deleted" and hides a
 * client bug.
 */
export function isMemoryItemId(value: string): boolean {
  return USER_MEMORY_ITEM_ID_RE.test(value);
}

/**
 * Every line the room has noted, in the order Phase 3 stored them.
 *
 * **NOT SORTED, NOT DEDUPED, NOT REWRITTEN.** The querent is being shown what is in
 * the row; anything this function improved would be a discrepancy between what they
 * read and what they can delete, on the one screen where those two must be the same
 * thing.
 *
 * **`kind` AND `lastSeen` ARE CHECKED AND NEITHER IS RENDERED.** They are checked
 * because `isUserMemoryItem` is what phase 5 filters with and the two sets must
 * match. They are not rendered because `C-D8`'s ban on saying how you know is what
 * separates *"nasi padang lagi kan?"* from *"you told me on the 9th"* — and a date
 * on this screen is the same material one surface over.
 */
export function memoryItems(row: MemoryRowLike | null | undefined): MemoryItemView[] {
  if (!row || !Array.isArray(row.items)) return [];
  const out: MemoryItemView[] = [];
  for (const raw of row.items) {
    if (!isUserMemoryItem(raw)) continue;
    const text = raw.text.trim();
    if (text.length === 0) continue;
    out.push({ id: raw.id, text: text.slice(0, MAX_TEXT) });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
