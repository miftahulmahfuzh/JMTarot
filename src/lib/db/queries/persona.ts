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
