/**
 * `user_memory`, read and written. ONE ROW PER USER (R2).
 *
 * The four rules of this directory, applied:
 *
 *  1. The handle comes FIRST, so `deleteAccount`'s transaction and the
 *     integration suite's rolled-back one can both be passed in. That is what
 *     makes the erasure duty testable at all.
 *  2. Nothing here imports `../client`, `react`, `next/*` or `server-only` --
 *     not even transitively. **`USER_MEMORY_SOURCE_VERSION` is deliberately NOT
 *     imported**, even though it lives in a zero-import leaf and could be: the
 *     version is the caller's to supply, exactly as `PERSONA_SOURCE_VERSION` is
 *     in `persona.ts`, because the caller has just computed the hash and holds
 *     it anyway. `queries/lotus.ts` is the one name-excluded exception in
 *     `contract.test.ts` for doing otherwise, and it is recorded there as a
 *     defect rather than a pattern.
 *  3. No caching. The readers are `/account` (occasional) and phase 5's
 *     assembler (once per run, alongside five other reads under one
 *     `Promise.all`). A cache that served a just-deleted item back into a prompt
 *     would be the delete button lying through a second door.
 *  4. One file per read concern. Per-item dismissal lives here rather than in
 *     phase 6's route because it is a WRITE to this table, and a second module
 *     writing these two columns is how `items` and `dismissed_ids` end up
 *     disagreeing.
 *
 * **NOTHING HERE VALIDATES.** `isUserMemoryItem` exists in
 * `@/lib/memory/profile/types` and is the consumer's to call. A reader that
 * silently dropped malformed rows would hide a real corruption from the only
 * layer that could report it -- and rule 2 is easier to keep when this file
 * imports nothing it does not need.
 */
import { and, eq, sql } from 'drizzle-orm';
import { userMemory, type NewUserMemory, type UserMemory } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/**
 * `queries/share.ts`'s guard, for its reason: `user_id` is a uuid column, and
 * postgres raises `22P02` on a malformed literal rather than returning nothing.
 * A read that 500s on a bad id turns a caller's bug into an outage.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The ids `dismissUserMemoryItems` will act on. **DUPLICATED HERE RATHER THAN
 * IMPORTED**, because rule 2 above is worth more than four characters of reuse
 * and because this is a WHERE-clause guard rather than the contract: the
 * contract's copy is `USER_MEMORY_ITEM_ID_RE`, and the two cannot drift in a way
 * that matters -- a narrower guard here refuses a delete, which is visible, and
 * `memory.integration.test.ts` pins the shape.
 */
const ITEM_ID_RE = /^[0-9a-f]{12}$/;

/** NULL IS NORMAL. Nobody has a memory until they have talked in the room. */
export async function getUserMemory(db: DbOrTx, userId: string): Promise<UserMemory | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db.select().from(userMemory).where(eq(userMemory.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * The extractor's one writer.
 *
 * **IT DOES NOT NAME `dismissed_ids`, AND THAT IS THE POINT.** The querent owns
 * that column and the model owns `items`; a `set` that mentioned both would let
 * one extraction quietly undo every deletion the querent had made. The insert
 * arm leaves it to the column default, and the conflict arm leaves it alone.
 *
 * `createdAt` is deliberately NOT in the conflict `set`: "when did this person
 * first get a memory" must survive every regeneration. `updatedAt` IS, BY HAND
 * -- `$onUpdate()` applies to `db.update()` only, so without that line the
 * column freezes at the first insert, silently, while every other assertion
 * about the row still passes.
 */
export async function upsertUserMemory(db: DbOrTx, row: NewUserMemory): Promise<void> {
  await db
    .insert(userMemory)
    .values(row)
    .onConflictDoUpdate({
      target: userMemory.userId,
      set: {
        items: row.items,
        inputHash: row.inputHash,
        sourceVersion: row.sourceVersion,
        model: row.model,
        promptVersion: row.promptVersion,
        updatedAt: new Date(),
      },
    });
}

/**
 * Move `updated_at` and nothing else. `touchPersona`'s function, for
 * `touchPersona`'s reason, written down here because the bug it prevents costs
 * a model call on every page view and gets misdiagnosed as caching.
 *
 * If phase 4's staleness compares a source timestamp -- the newest chat message,
 * say -- against `user_memory.updated_at`, the comparison is self-clearing in
 * every case but one: **an extraction that finds nothing new leaves
 * `input_hash` byte-identical**, so the generator returns `unchanged` and never
 * writes, leaving the source permanently ahead of the memory and a dirty flag
 * that is re-evaluated forever.
 *
 * **IT TOUCHES NOTHING ELSE.** Rewriting `items` with itself would make `model`
 * and `updated_at` claim a generation that did not happen. **IT IS NOT AN
 * UPSERT**: no row means no flag to clear, and inserting one here would create a
 * memory with no provenance. The `where` simply matches nothing, which is the
 * correct no-op.
 */
export async function touchUserMemory(db: DbOrTx, userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) return;
  await db.update(userMemory).set({ updatedAt: new Date() }).where(eq(userMemory.userId, userId));
}

/**
 * **THE QUERENT'S DELETE, AND IT IS ONE STATEMENT ON PURPOSE.**
 *
 * A read-modify-write would race the extractor's `after()` and lose: two tabs,
 * or one tab and one background run, and the item comes back with nothing
 * logged. So the filter and the append both happen in SQL, correlated against
 * the row being updated.
 *
 * **BOTH HALVES ARE REQUIRED AND NEITHER IS SUFFICIENT.** Removing from `items`
 * alone means the next extraction re-adds the fact from a transcript that still
 * contains the evidence -- `lotus_avatars.input_hash`'s "the delete button is a
 * lie". Appending to `dismissed_ids` alone leaves the line on screen.
 *
 * `jsonb_exists(a, b)` IS THE FUNCTION FORM OF THE `?` OPERATOR and is used
 * deliberately: a bare `?` in a SQL string is a placeholder character in several
 * drivers, and a statement that works today because of how one driver tokenises
 * is not a statement to leave in a delete path.
 *
 * Returns the row as it now stands so a route can render the new state without
 * a second read, or `null` when there was no row -- which is the ordinary
 * outcome for a querent who has never talked in the room, and not an error.
 */
export async function dismissUserMemoryItems(
  db: DbOrTx,
  userId: string,
  ids: string[],
): Promise<UserMemory | null> {
  if (!UUID_RE.test(userId)) return null;

  /*
   * MALFORMED IDS ARE DROPPED, NOT REFUSED. They cannot match anything in
   * `items` and putting one in `dismissed_ids` would tombstone nothing forever.
   * An empty set after filtering is a read, so a route that posts junk gets the
   * current state back rather than a 500.
   */
  const wanted = [...new Set(ids.filter((id) => ITEM_ID_RE.test(id)))];
  if (wanted.length === 0) return getUserMemory(db, userId);

  const json = JSON.stringify(wanted);

  const [row] = await db
    .update(userMemory)
    .set({
      items: sql`(
        select coalesce(jsonb_agg(e), '[]'::jsonb)
        from jsonb_array_elements(${userMemory.items}) as e
        where not jsonb_exists(${json}::jsonb, e ->> 'id')
      )`,
      dismissedIds: sql`(
        select coalesce(jsonb_agg(distinct d), '[]'::jsonb)
        from jsonb_array_elements_text(${userMemory.dismissedIds} || ${json}::jsonb) as d
      )`,
      /* BY HAND. See `upsertUserMemory`. */
      updatedAt: new Date(),
    })
    .where(eq(userMemory.userId, userId))
    .returning();

  return row ?? null;
}

/**
 * **THE ERASURE DUTY. `deleteAccount()` CALLS THIS INSIDE THE TRANSACTION THAT
 * SETS `deleted_at`**, and `delete.ts`'s header carries the ruling and the
 * amendment it makes to that file's own foreign-key rule. Summarised here
 * because this is the function somebody will read first:
 *
 *  - `user_id` CASCADES, so the row is gone at the hard delete thirty days
 *    later anyway. It is emptied NOW because it is the one row in this database
 *    that is a model's dossier about a person rather than something they typed,
 *    and it is what a person means when they press the button.
 *  - **A REDACTION AND NOT A DELETE.** `dismissed_ids` is KEPT. Dropping the row
 *    would take the tombstones with it, so a querent who erased their account
 *    and signed back in on day three would find the facts they had individually
 *    deleted coming back. The tombstones are opaque hashes carrying no text and
 *    can only ever prevent a write.
 *  - **`input_hash` IS BLANKED IN THE SAME STATEMENT AND FORGETTING IT WOULD
 *    SILENTLY KILL THE FEATURE.** An empty `items` beside a matching hash means
 *    the extractor reports `unchanged` and never writes again. `''` is the
 *    reserved never-matches value; phase 4's staleness must treat it as stale.
 *  - It costs the thirty-day restore NOTHING, which is why it is cheap enough to
 *    do at all: every input is `chat_messages` and `readings`, both of which
 *    cascade and therefore survive the soft delete, so a restored account has
 *    its memory rebuilt on the next run. `clearFreeTextAnswers()` stays out of
 *    that transaction because `onboarding_answers` is the only copy of text a
 *    person typed. **Derived-and-regenerable is a third category and it is what
 *    decides this case, not the foreign key.**
 *
 * The `where` makes it idempotent and makes the count mean something --
 * `redactForUser`'s `question is not null`, in a new shape. A replayed erasure
 * reports 0, which is how the route tells "we just erased you" from "you were
 * already gone" without a second read.
 */
export async function redactUserMemory(db: DbOrTx, userId: string): Promise<number> {
  if (!UUID_RE.test(userId)) return 0;
  const rows = await db
    .update(userMemory)
    .set({ items: [], inputHash: '', updatedAt: new Date() })
    .where(
      and(
        eq(userMemory.userId, userId),
        sql`(jsonb_array_length(${userMemory.items}) > 0 or ${userMemory.inputHash} <> '')`,
      ),
    )
    .returning({ userId: userMemory.userId });
  return rows.length;
}
