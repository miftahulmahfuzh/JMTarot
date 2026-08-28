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

import type { Locale } from '@/data/types';
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
 * `locale = $1` for a language, `locale is null` for as-written.
 *
 * **`eq(col, null)` COMPILES AND IS ALWAYS FALSE**, because SQL `= NULL` is
 * `unknown` — so a lookup written that way would report "no link for the
 * as-written pin" for every legacy row, and the caller would mint a second one it
 * could not see. Postgres's `nulls not distinct` makes NULL a single value for
 * UNIQUENESS; it does not change what `=` means in a `where`. Those are separate
 * mechanisms and this helper is the second one.
 */
function localeMatches(locale: Locale | null) {
  return locale === null ? isNull(shareLinks.locale) : eq(shareLinks.locale, locale);
}

/**
 * Mint a link, or rotate the slug of the one that already exists **for this
 * language**.
 *
 * **THE `set` CLAUSE ASSIGNS A FRESH SLUG, AND `revoked_at = null` ALONE WOULD
 * BE A SECURITY BUG.** `unique nulls not distinct (user_id, entity, entity_id,
 * locale)` means one row per artifact PER LANGUAGE forever, so "share this again
 * after revoking" has exactly two implementations:
 *
 *   ❌ `set revoked_at = null` on the existing row. One line, obvious, and it
 *      RESURRECTS A CAPABILITY THE USER DELIBERATELY KILLED. The old URL,
 *      sitting in the group chat they revoked it because of, starts working
 *      again — silently, for whoever still has it.
 *   ✅ a fresh slug as well, so revoke is permanent *for that address*.
 *
 * This is the single most likely one-line "simplification" in the workstream.
 *
 * ── `locale` IS IN THE TARGET AND NOT IN THE `set` (CHANGED 2026-07-28) ──────
 *
 * **This file used to re-pin `locale` here, and the comment on that line argued
 * at length that omitting it was the bug. The argument inverted.** Under the old
 * three-column key a language was an attribute of the one row a reading had, so
 * re-sharing in a second language rotated the slug and re-pinned — which is
 * precisely the reported bug: the querent's English link, already sent to
 * somebody, stopped resolving the moment they shared in Bahasa.
 *
 * `locale` is now part of the row's identity, so:
 *
 *   - a conflict means **same artifact AND same language**, where writing
 *     `locale` back would be a no-op; and
 *   - a *different* language takes the insert branch and gets its own permanent
 *     address, leaving the first one alive.
 *
 * The comment is inverted rather than deleted because the failure mode here is
 * somebody restoring a `locale:` line to the `set` clause — which under the new
 * key would move a pin onto a row whose identity says otherwise, i.e. write a
 * value the unique constraint has already used to place the row.
 *
 * **THE TARGET REACHES LEGACY `NULL` ROWS ONLY BECAUSE OF `NULLS NOT DISTINCT`.**
 * Without that clause on the constraint, `on conflict (…, locale)` would not
 * match a row whose `locale` is NULL, and every re-share of a pre-2026-07-28
 * link would INSERT instead of rotating — leaving the old slug live. Two
 * integration tests fence it. See `schema.ts` on the constraint.
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
      target: [shareLinks.userId, shareLinks.entity, shareLinks.entityId, shareLinks.locale],
      set: {
        // A FRESH ADDRESS. See the header above -- not `revokedAt: null` alone.
        slug: values.slug,
        // TRUE, matching the column default -- see `schema.ts` for the ruling.
        includeQuestion: values.includeQuestion ?? true,
        includeNickname: values.includeNickname ?? true,
        // NO `locale` HERE, DELIBERATELY. It is in the target above; see the
        // header. A conflict already means the locale matches.
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
 * Has this artifact EVER had a link **in this language**, live or revoked?
 *
 * Separate from `liveShareLinksForArtifact` because the two answer different
 * questions, and `share.created`'s `rotated` prop needs this one: a re-share after a
 * revoke IS a rotation, and a live-only lookup cannot see it, because the row it
 * would have to see is the revoked one. **This is the ONLY reader of a revoked row.**
 *
 * **`locale` IS REQUIRED AND THAT IS WHAT KEEPS `rotated` HONEST** (2026-07-28).
 * Without it this reports "yes" for a reading shared in the *other* language, so
 * the first-ever English mint of a reading already shared in Bahasa would be
 * counted as a rotation — and `rotated` is the only prop distinguishing "a new
 * address was minted" from "an address was replaced", which is the funnel the
 * per-locale change exists to fix.
 */
export async function anyShareLinkFor(
  db: DbOrTx,
  userId: string,
  entity: string,
  entityId: string,
  locale: Locale | null,
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
        localeMatches(locale),
      ),
    )
    .limit(1);
  return row ?? null;
}

/*
 * ── `liveShareLinkFor` IS DELETED, AND ITS ABSENCE IS THE POINT ──────────────
 *
 * It existed from V7 to 2026-07-28 with **zero production callers** and a docstring
 * that said *"the share sheet asks, so it can open on `live` rather than offering to
 * mint a second one."* The sheet did not ask. It had no read path at all, which is
 * why the reported bug — a second language replacing the first link's address —
 * reached the querent with no warning on screen.
 *
 * **A QUERY WITH NO CALLERS IS NOT DEAD CODE, IT IS A MISSING FEATURE WEARING A
 * DOCSTRING**, and this one cost a release: reading the file suggested the sheet
 * already knew about existing links, so nobody checked whether it did.
 * `liveShareLinksForArtifact` is what the sheet actually calls, and it answers the
 * question the sheet actually has — *which* languages, not *whether* one exists.
 *
 * Do not reinstate a single-row variant without a caller in the same change.
 */

/**
 * Every LIVE link this querent holds for one artifact, in every language.
 *
 * **THE SHARE SHEET HAD NO READ PATH AT ALL BEFORE THIS**, which is why the
 * reported bug arrived with no warning: `ShareFooter`'s state started empty and
 * only ever held a link minted in that mount, so opening the sheet on a reading
 * shared yesterday showed the *create* phase and nothing said the existing
 * address was about to be replaced. `liveShareLinkFor` looked like it served that
 * purpose and had zero production callers.
 *
 * Ordered by `created_at` so the list is stable across renders — an unordered
 * list of two links reshuffling between fetches reads as a bug in the sheet.
 *
 * `entity` is a plain string rather than `ShareEntity` for the reason the rest of
 * this file uses one: the column is text and the union is validated at the route
 * boundary, so narrowing here would only move the cast.
 */
export async function liveShareLinksForArtifact(
  db: DbOrTx,
  userId: string,
  entity: string,
  entityId: string,
): Promise<ShareLink[]> {
  if (!UUID_RE.test(entityId)) return [];
  return db
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
    .orderBy(shareLinks.createdAt);
}

/**
 * Turn off EVERY live link for one artifact, in every language, in one statement.
 *
 * **REVOKE IS PER-ARTIFACT AND NOT PER-LINK** (Miftah's ruling, 2026-07-28). Once
 * a reading can hold an English address and a Bahasa address, "stop sharing this"
 * has to mean both or the control is a trap: a querent taps it, believes the
 * reading is private, and one URL is still serving the public internet. A
 * per-locale kill was offered and refused on exactly that ground.
 *
 * **THE FULL ROWS COME BACK, NOT A COUNT**, because `share.revoked` carries
 * `age_hours` and `view_count` and those are facts about an ADDRESS rather than
 * about the artifact — so the route fires one event per row. `createdAt` and
 * `viewCount` are untouched by this update, so reading them off the returned rows
 * is correct even though `revokedAt` is not.
 *
 * `revokeShareLink` is kept: it is still the right shape for revoking one known
 * row, and `revokeAllForUser` (V8's deletion transaction) is untouched.
 */
export async function revokeArtifactLinks(
  db: DbOrTx,
  userId: string,
  entity: string,
  entityId: string,
): Promise<ShareLink[]> {
  if (!UUID_RE.test(entityId)) return [];
  return db
    .update(shareLinks)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(shareLinks.userId, userId),
        eq(shareLinks.entity, entity),
        eq(shareLinks.entityId, entityId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .returning();
}

/**
 * Turn a link off. Returns the number of rows changed, which is 0 for "not
 * yours", 0 for "does not exist" and 0 for "already revoked" — see rule 2.
 *
 * The row is KEPT. Deleting it would free the slug for re-issue and free the
 * `unique (user_id, entity, entity_id, locale)` slot, and both of those are the
 * point.
 *
 * **THIS REVOKES ONE ADDRESS. `revokeArtifactLinks` IS WHAT THE APP CALLS**, because
 * a reading holds one address per language and "stop sharing this" has to mean all of
 * them. This function survives as the primitive that one is built on and as the shape
 * for revoking a single known row; nothing in the UI reaches it directly.
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
        /* A deleted reading is not shareable. Minting one would hand out a fresh
           public URL for something the querent asked to be rid of -- the exact
           failure the delete transaction revokes links to prevent, arriving from
           the other direction. */
        isNull(readings.deletedAt),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * What `translateOrCached` needs to translate one of the querent's own readings,
 * for the mint-time pin (design §4.4).
 *
 * **THIS IS A SEPARATE QUERY RATHER THAN A WIDENED `ownsShareableReading`, AND
 * THAT IS DELIBERATE.** That function's header records why its projection is
 * `id` and nothing else: a yes/no question has no business selecting a column
 * carrying the querent's own words, and the smallest projection is also the one
 * that cannot put that text into a driver error's bound parameters. Widening it
 * would put `body` behind every existence check in the feature, including the
 * retry loop that runs three times on the draw screen.
 *
 * So the cost is paid once, on the one path that genuinely needs the prose, and
 * `ownsShareableReading` stays cheap and stays safe.
 *
 * `userId` IS IN THE `where` even though this is a read. The row's `body` is the
 * querent's, and mint time is the only moment a session exists to check against —
 * see `ownsShareableReading`'s header on that being the only ownership check in
 * the lifetime of a link.
 *
 * `createdAt` rather than an `updatedAt`: VD7 makes `readings.body` immutable, so
 * its creation time is the correct and permanent staleness comparand. That is
 * `TranslateArgs.sourceUpdatedAt`'s documented contract, not a shortcut.
 */
export async function shareableReadingSource(
  db: DbOrTx,
  readingId: string,
  userId: string,
): Promise<{
  body: string;
  locale: Locale;
  readerId: string;
  serviceId: string;
  createdAt: Date;
} | null> {
  if (!UUID_RE.test(readingId)) return null;
  const [row] = await db
    .select({
      body: readings.body,
      locale: readings.locale,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      createdAt: readings.createdAt,
    })
    .from(readings)
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.userId, userId),
        eq(readings.status, 'ok'),
        sql`${readings.body} is not null`,
        /* `ownsShareableReading`'s predicate, kept identical on purpose: these two
           answer the same eligibility question and a mint that passed one and
           failed the other would translate prose it then refused to publish. */
        isNull(readings.deletedAt),
      ),
    )
    .limit(1);
  if (!row || row.body === null) return null;
  return { ...row, body: row.body };
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
      /*
       * **`choice` RIDES ON `includeQuestion`, IN THE SAME TERNARY, ON PURPOSE.**
       * It is a word-bounded slice of `readings.question`, so excluding the
       * question and selecting this column would put a fragment of the excluded
       * string through the driver and into the flight payload -- defeating
       * mechanism 1 through the one field that does not look like user text.
       *
       * Two lines would let somebody "fix" a false positive by giving it its own
       * flag. One ternary makes that a deliberate edit rather than a plausible one.
       */
      ...(includeQuestion ? { question: readings.question, choice: readings.choice } : {}),
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
        /*
         * **THE THIRD ENFORCEMENT, AND THE ONE WITH NO SESSION BEHIND IT.**
         * `softDeleteReading` revokes every live link in the same transaction, so
         * a stranger's request should already fail at the slug. This is what
         * protects against the transaction having half-run in some future edit, or
         * against a link minted by a path that forgot 8a -- the same argument this
         * header already makes for `status = 'ok'` being checked twice.
         */
        isNull(readings.deletedAt),
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
    ...('question' in row ? { question: row.question, choice: row.choice } : {}),
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
