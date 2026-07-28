/**
 * Share links: the reads and writes behind the only public page in the app.
 *
 * HANDLE FIRST, no `server-only`, no `next/*`, no `react` — `contract.test.ts`
 * enforces all four and the transitive check enforces the third one hop out.
 * `@/lib/share/slug` and `@/lib/share/types` are safe imports: both are leaves
 * and neither carries the marker.
 *
 * ── TWO RULES THAT APPLY TO EVERY FUNCTION IN THIS FILE ─────────────────────
 *
 * **1. EVERY MUTATION TAKES `userId` AND PUTS IT IN THE `WHERE`.** Not as
 * defence in depth — as the actual authorization. `share_links.id` reaches the
 * BROWSER as an analytics prop (roadmap §6 requires the id and forbids the
 * slug), so a `revokeShareLink` keyed on `id` alone would be a revoke token for
 * anybody who read it out of a network tab. `bumpShareViewCount` is the one
 * exception and it is deliberate: the viewer is anonymous by construction, so
 * there is no user to key on, which is exactly why that write is bounded by the
 * per-IP limiter instead and why the column is documented as approximate.
 *
 * **2. NOTHING HERE DISTINGUISHES "DOES NOT EXIST" FROM "NOT YOURS" FROM
 * "REVOKED".** Every failure is a null or a zero. A caller that could tell them
 * apart would let a stranger holding one slug learn that the account behind it
 * still exists — the same reasoning `readingWithCards` records for a uuid guess,
 * one threat model further out because here the guesser has no account at all.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';

import type { ShareEntity } from '@/lib/share/slug';
import type { PublicPersona, PublicReading } from '@/lib/share/types';
import type { DbOrTx } from '../types';
import {
  profiles,
  readingCards,
  readings,
  shareLinks,
  type NewShareLink,
  type ShareLink,
} from '../schema';

/** Cheap enough to run before a query and it saves a round trip on garbage. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mint a link, or rotate the slug of the one that already exists.
 *
 * **THE `set` CLAUSE ASSIGNS A FRESH SLUG, AND `revoked_at = null` ALONE WOULD
 * BE A SECURITY BUG.** `unique (user_id, entity, entity_id)` means one row per
 * artifact forever, so "share this again after revoking" has exactly two
 * implementations:
 *
 *   ❌ `set revoked_at = null` on the existing row. One line, obvious, and it
 *      RESURRECTS A CAPABILITY THE USER DELIBERATELY KILLED. The old URL,
 *      sitting in the group chat they revoked it because of, starts working
 *      again — silently, for whoever still has it.
 *   ✅ a fresh slug as well, so revoke is permanent *for that address*.
 *
 * This is the single most likely one-line "simplification" in the workstream.
 *
 * `updatedAt` IS SET BY HAND. Drizzle's `$onUpdate()` applies to `db.update()`
 * and does NOT fire inside `onConflictDoUpdate`; drop the line and the column
 * silently freezes at the first insert, which is what `share.revoked`'s
 * `age_hours` is computed against.
 */
export async function insertOrRotateShareLink(
  db: DbOrTx,
  values: NewShareLink,
): Promise<ShareLink> {
  const [row] = await db
    .insert(shareLinks)
    .values(values)
    .onConflictDoUpdate({
      target: [shareLinks.userId, shareLinks.entity, shareLinks.entityId],
      set: {
        // A FRESH ADDRESS. See the header above -- not `revokedAt: null` alone.
        slug: values.slug,
        // TRUE, matching the column default -- see `schema.ts` for the ruling.
        includeQuestion: values.includeQuestion ?? true,
        includeNickname: values.includeNickname ?? true,
        /*
         * **RE-PINNED, NOT PRESERVED.** Re-sharing is how a querent fixes a link
         * they minted in the wrong language: switch language, share again, get a
         * new address showing the new language. Omitting this line rotates the
         * slug and keeps the stale pin, so the control appears to work and
         * changes nothing -- the shape of the language-switch bug of 2026-07-28.
         *
         * `?? null` rather than a bare `values.locale`: `NewShareLink.locale` is
         * optional, and `undefined` in a drizzle `set` clause is dropped from the
         * statement, which would silently mean "keep the old pin" for exactly the
         * caller that had decided not to pin one.
         */
        locale: values.locale ?? null,
        revokedAt: null,
        // BY HAND. $onUpdate() does not fire inside onConflictDoUpdate.
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

/**
 * The public read path: a LIVE link, by slug.
 *
 * **LIVE ONLY.** A revoked row is still in the table -- it has to be, so its
 * slug can never be re-issued -- and this function must not see it. That is the
 * `revoked_at is null` predicate, and it is the same predicate the partial index
 * carries, so the planner uses `share_links_live_slug_idx` rather than the plain
 * unique.
 *
 * The slug is passed in ALREADY NORMALIZED by `resolveShare`; this function does
 * no folding of its own, because a fold in two places is a fold that will
 * disagree with itself.
 */
export async function shareLinkBySlug(db: DbOrTx, slug: string): Promise<ShareLink | null> {
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.slug, slug), isNull(shareLinks.revokedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * One of the caller's own links, by id. For the revoke path, which needs
 * `created_at` and `view_count` BEFORE the update turns the row off.
 */
export async function shareLinkById(
  db: DbOrTx,
  id: string,
  userId: string,
): Promise<ShareLink | null> {
  if (!UUID_RE.test(id)) return null;
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.id, id), eq(shareLinks.userId, userId)))
    .limit(1);
  return row ?? null;
}

/**
 * Has this artifact EVER had a link, live or revoked?
 *
 * Separate from `liveShareLinkFor` because the two answer different questions and
 * `share.created`'s `rotated` prop needs this one: a re-share after a revoke is a
 * rotation, and `liveShareLinkFor` cannot see it, because the row it would have to
 * see is the revoked one.
 */
export async function anyShareLinkFor(
  db: DbOrTx,
  userId: string,
  entity: string,
  entityId: string,
): Promise<ShareLink | null> {
  if (!UUID_RE.test(entityId)) return null;
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.userId, userId),
        eq(shareLinks.entity, entity),
        eq(shareLinks.entityId, entityId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Is there a live link for this artifact already? The share sheet asks, so it
 * can open on `live` rather than offering to mint a second one.
 */
export async function liveShareLinkFor(
  db: DbOrTx,
  userId: string,
  entity: string,
  entityId: string,
): Promise<ShareLink | null> {
  if (!UUID_RE.test(entityId)) return null;
  const [row] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.userId, userId),
        eq(shareLinks.entity, entity),
        eq(shareLinks.entityId, entityId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Turn a link off. Returns the number of rows changed, which is 0 for "not
 * yours", 0 for "does not exist" and 0 for "already revoked" — see rule 2.
 *
 * The row is KEPT. Deleting it would free the slug for re-issue and free the
 * `unique (user_id, entity, entity_id)` slot, and both of those are the point.
 */
export async function revokeShareLink(
  db: DbOrTx,
  id: string,
  userId: string,
): Promise<number> {
  if (!UUID_RE.test(id)) return 0;
  const rows = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.id, id),
        eq(shareLinks.userId, userId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning({ id: shareLinks.id });
  return rows.length;
}

/**
 * Every live link this user holds, off, in one statement.
 *
 * **V8's DELETION TRANSACTION CALLS THIS, IN THE SAME TRANSACTION THAT SETS
 * `deleted_at`** (reconciliation §5.6). `share_links` is `on delete cascade`
 * from `users`, but that cascade fires at the HARD delete — thirty days after
 * the erasure request — so without this call a shared URL serves the public
 * internet for a month after somebody asked to be forgotten. That is the whole
 * reason this function exists and it has no other caller.
 *
 * Handle first because V8 must be able to pass its own transaction in.
 */
export async function revokeAllForUser(db: DbOrTx, userId: string): Promise<number> {
  const rows = await db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(and(eq(shareLinks.userId, userId), isNull(shareLinks.revokedAt)))
    .returning({ id: shareLinks.id });
  return rows.length;
}

/**
 * One more view. **APPROXIMATE, AND `updated_at` MUST NOT MOVE.**
 *
 * `updatedAt` is what `share.revoked`'s `age_hours` and any future staleness
 * question read, and a view is not an edit — letting a crawler touch it would
 * make "when did the sharer last change this link" unanswerable. `db.update()`
 * DOES fire `$onUpdate()`, unlike the upsert above, so the column is written
 * back to its own value explicitly rather than left to the trigger.
 */
export async function bumpShareViewCount(db: DbOrTx, id: string): Promise<void> {
  if (!UUID_RE.test(id)) return;
  await db
    .update(shareLinks)
    .set({
      viewCount: sql`${shareLinks.viewCount} + 1`,
      // Pinned to itself, because $onUpdate() would otherwise bump it.
      updatedAt: sql`${shareLinks.updatedAt}`,
    })
    .where(eq(shareLinks.id, id));
}

/**
 * Record that this reading has been public, once.
 *
 * `where shared_at is null` makes it FIRST-MINT-ONLY without a read first, and
 * the column is NEVER CLEARED on revoke: it records "this has left the app
 * before", which is the honest thing for V6's history badge to show, because
 * revoking does not un-send a screenshot. "Is there a live link right now" is a
 * different question and is a join.
 */
export async function markReadingShared(
  db: DbOrTx,
  readingId: string,
  userId: string,
): Promise<void> {
  if (!UUID_RE.test(readingId)) return;
  await db
    .update(readings)
    .set({ sharedAt: new Date() })
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.userId, userId),
        isNull(readings.sharedAt),
      ),
    );
}

/**
 * Is this reading the caller's, and is it shareable?
 *
 * **THE ONLY OWNERSHIP CHECK IN THE LIFETIME OF A LINK, because mint time is the
 * only moment a session exists.** After that the slug is the authorization (VD9)
 * and the public resolver has no user to compare against.
 *
 * It selects `id` and nothing else — not the question, not the body, not the
 * nickname. A yes/no question has no business reading a column that carries the
 * querent's own words, and the smallest projection is also the one that cannot
 * put that text into a driver error's bound parameters.
 *
 * `status = 'ok'` AND a non-null body, which is the FIRST of the two shareability
 * checks; `publicReadingQuery`'s `where` is the second. `partial` is refused here
 * too — see `createShareLink`'s header for why VD9's list is extended by one.
 */
export async function ownsShareableReading(
  db: DbOrTx,
  readingId: string,
  userId: string,
): Promise<boolean> {
  if (!UUID_RE.test(readingId)) return false;
  const rows = await db
    .select({ id: readings.id })
    .from(readings)
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.userId, userId),
        eq(readings.status, 'ok'),
        sql`${readings.body} is not null`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * THE QUERY BUILDER, EXPORTED SO A TEST CAN READ THE STATEMENT (§5.2).
 *
 * **THE PROJECTION IS BUILT CONDITIONALLY, AND THAT IS MECHANISM 1 OF FOUR.**
 * When `includeQuestion` is false, `readings.question` is NOT IN THE SELECT LIST
 * — so the value never enters this process, never enters the RSC flight payload
 * the browser downloads, and never enters a driver error's bound-parameter list.
 * The same is true of `profiles.nickname` under `includeNickname`.
 *
 * `expect(row.question).toBeNull()` PASSES FOR THE BUG. A query that selected the
 * column and then dropped it has already put the querent's typed text through
 * the driver and into the payload, which is the leak. The only assertion that
 * covers the requirement is one that reads the emitted SQL, and that is why this
 * builder is exported alongside the function that runs it.
 *
 * The `where` requires `status = 'ok'` and a non-null body (§3.5). That is the
 * SECOND enforcement of shareability — `createShareLink` refuses first — and it
 * is not redundant: it is what protects a link minted by some future code path
 * that forgot the first check.
 */
export function publicReadingQuery(
  db: DbOrTx,
  readingId: string,
  includeQuestion: boolean,
  includeNickname = false,
) {
  return db
    .select({
      id: readings.id,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      localDate: readings.localDate,
      createdAt: readings.createdAt,
      locale: readings.locale,
      verdict: readings.verdict,
      body: readings.body,
      ...(includeQuestion ? { question: readings.question } : {}),
      ...(includeNickname ? { nickname: profiles.nickname } : {}),
    })
    .from(readings)
    /*
     * LEFT JOIN, not inner. A reading whose profile row has gone -- reachable
     * during a deletion, since `profiles` cascades from `users` while a
     * `share_links` row is only revoked -- must still resolve to the same 404 as
     * everything else rather than to a page that renders half.
     */
    .leftJoin(profiles, eq(profiles.userId, readings.userId))
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.status, 'ok'),
        sql`${readings.body} is not null`,
      ),
    )
    .limit(1);
}

/**
 * A shared reading, or null.
 *
 * **NO `userId` PARAMETER, AND THAT IS NOT AN OVERSIGHT.** The caller has
 * already resolved a live `share_links` row, and the slug IS the authorization
 * (VD9). Adding an ownership predicate here would be asking "is this the
 * sharer's reading" of a request made by somebody who is not the sharer. What
 * the link's own row guarantees is that its `entity_id` was minted by its
 * `user_id`, which is checked at mint time where a session exists.
 */
export async function publicReadingForShare(
  db: DbOrTx,
  readingId: string,
  includeQuestion: boolean,
  includeNickname = false,
): Promise<PublicReading | null> {
  if (!UUID_RE.test(readingId)) return null;

  const [row] = await publicReadingQuery(db, readingId, includeQuestion, includeNickname);
  if (!row || row.body === null) return null;

  const cards = await db
    .select({
      cardId: readingCards.cardId,
      reversed: readingCards.reversed,
      position: readingCards.position,
    })
    .from(readingCards)
    .where(eq(readingCards.readingId, row.id))
    .orderBy(readingCards.position);

  return {
    id: row.id,
    readerId: row.readerId,
    serviceId: row.serviceId,
    localDate: row.localDate,
    createdAtIso: row.createdAt.toISOString(),
    locale: row.locale,
    verdict: row.verdict,
    body: row.body,
    cards,
    /*
     * SPREAD, SO AN EXCLUDED FIELD IS AN ABSENT KEY rather than an explicit
     * `undefined`. `'question' in result` is then false, which is what the
     * integration test asserts on the returned object and what makes the type
     * union in `@/lib/share/types` honest.
     */
    ...('question' in row ? { question: row.question } : {}),
    ...('nickname' in row ? { nickname: row.nickname } : {}),
  };
}

/**
 * V8's artifact. **RETURNS `null` UNTIL `personas` EXISTS.**
 *
 * There is no `personas` table on this branch: V8 owns it (VD15) and V7 ships
 * first in everything but the build order. `'persona'` is nevertheless in
 * `SHARE_ENTITIES` and in `share_links.entity`'s documented union, inert, for the
 * reason V2 recorded when it put `'persona'` in the translation registry a
 * workstream early — the alternative is a second edit to the union, the route's
 * schema, the resolver and the sheet on the day V8 lands.
 *
 * **AND IT CANNOT BE WRITTEN SPECULATIVELY**, which is the part worth knowing:
 * `to_regclass` cannot guard a relation from inside the statement, because
 * Postgres resolves every relation at PARSE time — so a query naming `personas`
 * raises `relation does not exist` no matter what its `where` clause says. V2's
 * plan §8 got this wrong and V2's header records it. The guard has to decide
 * whether the statement is ISSUED, and the cheapest correct guard is this
 * function not naming the table at all.
 *
 * **WHAT V8 REPLACES THIS WITH:** one `select` on `personas` by `user_id`
 * (a PRIMARY KEY read), left-joining `profiles` for the nickname under the same
 * conditional-projection rule `publicReadingQuery` uses, returning
 * `PublicPersona`. The signature does not change.
 */
export async function publicPersonaForShare(
  db: DbOrTx,
  userId: string,
  includeNickname = false,
): Promise<PublicPersona | null> {
  /*
   * THE PARAMETERS ARE NAMED RATHER THAN UNDERSCORED because
   * `queries/contract.test.ts` requires the first one to be literally `db` -- it
   * reads the signature off the source, so an unused-parameter convention here is
   * a red test. Which is the right outcome: the signature IS the interface V8
   * fills in, and it should not change shape when the body does.
   */
  void db;
  void userId;
  void includeNickname;
  return null;
}

/** Re-exported so a caller does not need two import paths for one concept. */
export type { ShareEntity };
