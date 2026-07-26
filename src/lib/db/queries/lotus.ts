/**
 * `lotus_avatars`: the distilled persona block, read on every reading.
 *
 * WRITTEN BY W3 INTO W1's DIRECTORY, against the interface W3's plan names under
 * *Interfaces I need from W1*. No table and no column is redefined -- `schema.ts`
 * already carries W3's `updated_at` and `input_hash` deltas.
 *
 * THE READ PATH IS THE LATENCY-SENSITIVE ONE. Roadmap §6: the database must never
 * be in the way of a byte the user is waiting for. A reading needs this block, so
 * this is one of the two reads §6 permits on the request path -- and it says
 * explicitly that putting the block in the JWT is tempting and WRONG (too large,
 * and it goes stale). So it is cached, with the single indexed lookup below as
 * the miss path.
 *
 * THE CACHE IS NOT IN THIS FILE, and that is rule 3 of this directory's contract
 * rather than an accident: "caching is the caller's decision, made where the
 * caller knows the request context." Rule 1 says the same thing from the other
 * side -- every exported function here takes the handle first, and a cache
 * invalidator keyed by user id cannot. `contract.test.ts` failed on exactly that
 * when the cache lived here.
 *
 * So this file holds the three pure queries, and `@/lib/prompt/lotus.generate`
 * holds the cached wrapper, the invalidation and the cooldown -- all the stateful
 * machinery in one module, which is also the module that writes.
 */
import { eq } from 'drizzle-orm';
import type { Locale } from '@/data/types';
import { LOTUS_SOURCE_VERSION } from '@/lib/prompt/lotus';
import { lotusAvatars, profiles, type LotusAvatar, type NewLotusAvatar } from '../schema';
import type { DbOrTx } from '../types';

export async function getLotusAvatar(db: DbOrTx, userId: string): Promise<LotusAvatar | null> {
  const [row] = await db
    .select()
    .from(lotusAvatars)
    .where(eq(lotusAvatars.userId, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Insert or replace the whole row.
 *
 * `updatedAt` is set BY HAND in the conflict branch: Drizzle's `$onUpdate()`
 * fires on `db.update()` and NOT inside `onConflictDoUpdate`. Regeneration
 * upserts on the primary key, so without this the column would freeze at the
 * first insert -- and it is the only column that says when the CURRENT text was
 * produced, since `created_at` keeps the original.
 */
export async function upsertLotusAvatar(db: DbOrTx, row: NewLotusAvatar): Promise<void> {
  await db
    .insert(lotusAvatars)
    .values(row)
    .onConflictDoUpdate({
      target: lotusAvatars.userId,
      set: {
        summary: row.summary,
        traits: row.traits,
        sourceVersion: row.sourceVersion,
        inputHash: row.inputHash,
        model: row.model,
        updatedAt: new Date(),
      },
    });
}

// ---------------------------------------------------------------------------
// The block a reading prompt needs
// ---------------------------------------------------------------------------

export type LotusBlock = {
  nickname: string;
  summary: string;
  /**
   * The stored row was produced by an older contract, or there is no row at all.
   *
   * REPORTED, NOT ACTED ON. Scheduling the regeneration is the caller's job --
   * this module may not import the model, and an `after()` belongs at the route.
   */
  stale: boolean;
};

/**
 * The nickname and the summary in one round trip, or null.
 *
 * NULL IS A FIRST-CLASS VALUE AND NO CALLER MAY TREAT IT AS AN ERROR. Not yet
 * distilled, distillation failed, and "the user skipped everything" all arrive
 * here as null, and all three produce a perfectly good reading -- the one an
 * un-personalised user gets.
 *
 * ONE ROUND TRIP, NOT TWO. The nickname lives on `profiles` and the summary on
 * `lotus_avatars`, and a reading needs both. A LEFT join from profiles, because a
 * user always has a profile by the time they can request a reading -- onboarding
 * wrote it -- and may not yet have an avatar.
 *
 * WHY STALENESS IS ONLY `source_version` HERE, AND NOT `input_hash`. The plan has
 * `isLotusStale(row, input)` compare both, but `input_hash` is computed over the
 * ANSWERS -- so checking it here would mean reading and DECRYPTING six onboarding
 * answers on every reading, which is exactly the request-path database work
 * roadmap §6 exists to prevent. The two triggers are therefore split by where
 * each one is cheap:
 *
 *   - `source_version` ("we changed how we distil") is one integer already in
 *     this row, and is checked here.
 *   - `input_hash` ("the user changed an answer") is checked where the answers
 *     are already in hand: inside `generateLotus`, which reads them anyway, and
 *     the write paths that change an answer schedule that refresh directly.
 *
 * The delete button still reaches all the way through, which is the property
 * `input_hash` exists to guarantee -- it is just triggered by the delete rather
 * than discovered by a reading.
 */
export async function readLotusBlock(
  db: DbOrTx,
  userId: string,
  locale: Locale,
): Promise<LotusBlock | null> {
  const [row] = await db
    .select({
      nickname: profiles.nickname,
      summary: lotusAvatars.summary,
      sourceVersion: lotusAvatars.sourceVersion,
    })
    .from(profiles)
    .leftJoin(lotusAvatars, eq(lotusAvatars.userId, profiles.userId))
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!row) return null;

  const summary = row.summary?.[locale]?.trim();
  if (!summary) {
    /*
     * A profile with no avatar row, or a row with nothing for this locale.
     * Reported as a MISSING BLOCK that is stale rather than as null, so the
     * caller can still schedule the repair -- null would lose the fact that the
     * nickname exists and something ought to be generated for it.
     */
    return { nickname: row.nickname, summary: '', stale: true };
  }

  return {
    nickname: row.nickname,
    summary,
    stale: row.sourceVersion !== LOTUS_SOURCE_VERSION,
  };
}
