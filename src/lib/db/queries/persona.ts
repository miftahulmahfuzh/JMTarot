/**
 * `personas`, read and written. ONE ROW PER USER (VD15).
 *
 * The four rules of this directory, applied:
 *
 *  1. The handle comes FIRST, so `deleteAccount`'s transaction and the
 *     integration suite's rolled-back one can both be passed in.
 *  2. Nothing here imports `../client`, `react`, `next/*` or `server-only` --
 *     not even transitively. That is why `PERSONA_SOURCE_VERSION` is NOT
 *     imported from `@/lib/persona/prompt`: that module carries the marker, and
 *     `queries/lotus.ts` is already the one name-excluded exception in
 *     `contract.test.ts` for doing exactly that. The version is the caller's to
 *     supply, which it has in hand anyway because it just computed the hash.
 *  3. No caching. The one reader is `/account`, visited occasionally, and
 *     `getLotusBlock`'s cache exists because a READING needs its block on the
 *     request path. A cache that served a just-regenerated persona from a stale
 *     entry would be a worse bug than a second indexed lookup.
 *  4. One file per read concern. The all-time tallies `/account` also needs are
 *     `allTime.ts`, because "no window" is a different concern from this one.
 *
 * `upsertPersona` SETS `updatedAt` BY HAND, and for this table that column is
 * load-bearing twice over -- see `schema.ts`. Drop the line and the throttle
 * never releases and V2 serves a stale translation forever.
 */
import { eq } from 'drizzle-orm';
import { personas, type NewPersona, type Persona } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/**
 * `queries/share.ts`'s guard, for its reason: `user_id` is a uuid column, and
 * postgres raises `22P02` on a malformed literal rather than returning nothing.
 * A read that 500s on a bad id turns a caller's bug into an outage.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** NULL IS NORMAL. Nobody has a persona until `/account` is first opened. */
export async function getPersona(db: DbOrTx, userId: string): Promise<Persona | null> {
  if (!UUID_RE.test(userId)) return null;
  const [row] = await db.select().from(personas).where(eq(personas.userId, userId)).limit(1);
  return row ?? null;
}

export async function upsertPersona(db: DbOrTx, row: NewPersona): Promise<void> {
  await db
    .insert(personas)
    .values(row)
    .onConflictDoUpdate({
      target: personas.userId,
      set: {
        body: row.body,
        locale: row.locale,
        facts: row.facts,
        inputHash: row.inputHash,
        sourceVersion: row.sourceVersion,
        model: row.model,
        promptVersion: row.promptVersion,
        /*
         * BY HAND. `$onUpdate()` applies to `db.update()` only, so without this
         * line the column freezes at the first insert -- silently, because every
         * other assertion about the row still passes. `createdAt` is deliberately
         * NOT in this set: "when did this person first get a persona" must survive
         * every regeneration.
         */
        updatedAt: new Date(),
      },
    });
}

/**
 * Move `updated_at` and nothing else. **THE ONE LINE THAT MAKES THE DEFERRED
 * ANSWER-EDIT REGENERATION TERMINATE (2026-07-29).**
 *
 * Since the answer routes stopped calling `generatePersona`, `/account`'s read path
 * decides a regeneration is user-caused by comparing
 * `max(onboarding_answers.updated_at)` against `personas.updated_at`. That
 * comparison is self-clearing in every case but one: **a querent who edits an
 * answer back to the value it already had leaves `input_hash` byte-identical**, so
 * `generatePersona` returns `unchanged` and never writes — leaving the answer row
 * permanently ahead of the persona row and a dirty flag that is re-evaluated on
 * every single page view, forever. Cheap (two indexed reads, no model call) and
 * still wrong: a flag that cannot clear is a bug somebody finds in six months and
 * misdiagnoses as a caching problem.
 *
 * So the route calls this when the outcome was `unchanged` and the run was
 * user-caused. **IT DOES NOT TOUCH `body`, `input_hash`, `model` OR
 * `prompt_version`** — nothing about the persona changed, and rewriting the body
 * with itself would make `model` and `updated_at` claim a generation that did not
 * happen.
 *
 * **IT IS NOT AN UPSERT.** No row means no flag to clear, and inserting one here
 * would create a persona with no body. The `where` simply matches nothing, which is
 * the correct no-op.
 */
export async function touchPersona(db: DbOrTx, userId: string): Promise<void> {
  if (!UUID_RE.test(userId)) return;
  await db.update(personas).set({ updatedAt: new Date() }).where(eq(personas.userId, userId));
}
