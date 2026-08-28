/**
 * readings + reading_cards. Written by W4's after() path, read by W5's
 * chained readings. See profile.ts for the contract every file here follows.
 */
import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { Locale, ReaderId, ReadingStatus, ServiceId, YesNo } from '@/data/types';
import type { HistoryCard, HistoryItem, ReadingDetail } from '@/lib/history/types';
import type { DbOrTx } from '../types';
import {
  readingCards,
  readings,
  type NewReading,
  type NewReadingCard,
  type Reading,
} from '../schema';
/*
 * **THE FIRST TIME A QUERY MODULE IMPORTS TWO OTHERS, AND IT IS DELIBERATE.**
 * `softDeleteReading` at the foot of this file has to revoke the reading's share
 * links and clear the day summaries written about it INSIDE ONE TRANSACTION, so
 * that a failure in either aborts the delete rather than leaving a reading marked
 * deleted with a live public URL. `src/lib/account/delete.ts` is the precedent in
 * full -- it imports `revokeAllForUser` from `queries/share.ts` for exactly this
 * shape of reason and calls it in exactly this position.
 *
 * Both are safe imports: neither carries `server-only`, `react` or `next/*`, and
 * `contract.test.ts`'s transitive walk now follows this file into both of them, so
 * a future edit that dirties either one fails here as well as there.
 */
import { revokeArtifactLinks } from './share';
import { clearDaySummaries } from './summary';

/**
 * What a caller supplies per card.
 *
 * `readingId`, `userId` and `localDate` are all omitted because all three are
 * copied from the parent reading below rather than taken from the caller. Two
 * of them are denormalized on purpose and one source of truth is what stops
 * the denormalization drifting; `localDate` in particular is the querent's own
 * calendar day (roadmap §7) and a caller passing a different one for the cards
 * than for the reading would split a single draw across two days in the
 * frequency window.
 */
export type ReadingCardInput = Omit<NewReadingCard, 'readingId' | 'userId' | 'localDate'>;

/**
 * Write a reading and its cards in ONE transaction.
 *
 * A `readings` row with no `reading_cards` is not a partial success -- it is a
 * silent hole in the frequency feature that nothing will ever surface, because
 * every query still returns a plausible answer.
 *
 * `db.transaction` exists on `Tx` as well as on `Db`, so a caller who already
 * holds a transaction gets a savepoint rather than an error. That is what
 * makes this callable from inside the test harness's rollback.
 *
 * An empty `cards` array is legitimate and not a bug: reconciliation R7 says a
 * `blocked` reading writes no card rows at all, which is what keeps the
 * frequency query a single-table scan with no extra column to filter on.
 */
export async function insertReading(
  db: DbOrTx,
  reading: NewReading,
  cards: ReadingCardInput[],
): Promise<Reading> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(readings).values(reading).returning();
    if (cards.length > 0) {
      await tx.insert(readingCards).values(
        cards.map((c) => ({
          ...c,
          readingId: row.id,
          userId: row.userId,
          localDate: row.localDate,
        })),
      );
    }
    return row;
  });
}

/**
 * Most recent first. Served by `readings_user_created_idx`.
 *
 * NO CALLER TODAY, AND IT CARRIES `deleted_at is null` ANYWAY. A read with no
 * surface is a read that will one day acquire one, and the person who wires it up
 * will be thinking about the surface rather than about this predicate.
 */
export async function recentReadings(
  db: DbOrTx,
  userId: string,
  limit: number,
): Promise<Reading[]> {
  return db
    .select()
    .from(readings)
    .where(and(eq(readings.userId, userId), isNull(readings.deletedAt)))
    .orderBy(desc(readings.createdAt))
    .limit(limit);
}

/**
 * Every reading the querent had on one of THEIR calendar days.
 *
 * `localDate` is a `'YYYY-MM-DD'` string and is compared as stored -- never
 * derived from `created_at`, which rolls over at 07:00 in Jakarta and would
 * split a single evening across two rows. Served by
 * `readings_user_local_date_idx`.
 */
export async function readingsOnLocalDate(
  db: DbOrTx,
  userId: string,
  localDate: string,
): Promise<Reading[]> {
  return db
    .select()
    .from(readings)
    .where(
      and(
        eq(readings.userId, userId),
        eq(readings.localDate, localDate),
        /*
         * NO CALLER TODAY EITHER -- `summary.ts`'s `readingsOnDay` is what the day
         * summary route actually uses -- but the two ask the SAME question of the
         * same table, and two day-shaped reads that disagree about a deleted
         * reading is a bug waiting for its first caller. Both filter.
         */
        isNull(readings.deletedAt),
      ),
    )
    .orderBy(readings.createdAt);
}

/**
 * Write the one-clause gist onto a reading that has already been stored.
 *
 * A SEPARATE UPDATE, NOT PART OF `insertReading`, because the gist does not
 * exist yet when the row is written. Both happen inside the same `after()`, in
 * this order: the row first, because it is what every memory feature depends
 * on, and the model call second, because a model call ahead of the write would
 * delay it and -- if the platform ends the invocation early -- lose it.
 *
 * Null is a legitimate value and is written as one: the extraction can fail, and
 * `recallableReadings` excludes a null gist from recall. The feature degrades;
 * it never blocks.
 */
export async function setReadingGist(
  db: DbOrTx,
  readingId: string,
  gist: string | null,
): Promise<void> {
  await db.update(readings).set({ gist }).where(eq(readings.id, readingId));
}

/**
 * One recalled reading, with its cards, for W5's `<riwayat>` block.
 *
 * `gist` IS NON-NULL HERE although the column is nullable: the query filters
 * null gists out, so a caller destructuring this type never has to decide what
 * an unrecallable reading means. The FILTER is the contract, and the type says
 * so.
 *
 * NO `question` FIELD, and its absence is deliberate (M11). The recalled
 * question never enters a prompt -- the gist is model output distilled under
 * the format rules, and the raw question is not. Dropping it removes injection
 * surface and tokens in the same move, and the way to keep it dropped is for the
 * shape that crosses into the prompt layer not to carry it. `hadQuestion` is the
 * boolean the relevance gate needs, and it is all the gate needs.
 */
export type RecalledReading = {
  id: string;
  localDate: string;
  readerId: ReaderId;
  serviceId: ServiceId;
  cards: { cardId: number; reversed: boolean }[];
  gist: string;
  hadQuestion: boolean;
  /**
   * The language the gist is in, which is the language its READING was generated
   * in -- `readings.gist` has no locale of its own and does not need one, because
   * `extractGist` is called with the reading's locale and `gistPrompt` is
   * locale-forked (see `schema.ts`).
   *
   * ADDED BY V2 so `recallChain` can prefer a cached TRANSLATION of the gist when
   * the current reading is in the other language. Without it the caller cannot tell
   * which recalled gists need one, and `translateOrCached` cannot short-circuit the
   * ones that do not.
   */
  locale: Locale;
};

/**
 * The last `limit` readings that can legitimately be recalled (§4.3).
 *
 * SIX FILTERS, each excluding a reading that would produce a bad callback:
 *
 *   - `id <> excludeReadingId`  the reading being written right now
 *   - `local_date >= since`     the lookback. A callback to something five
 *                               weeks old is not memory, it is surveillance.
 *   - `body is not null`        a stream that died said nothing to refer back to
 *   - `gist is not null`        the extraction failed, so there is no clause
 *   - `status <> 'blocked'`     W7 refused the question; the reader never spoke
 *   - `deleted_at is null`      **THE SHARPEST OF THE SIX.** The querent deleted
 *                               this reading, and the whole point of the control
 *                               is that they were embarrassed by it. Recall is
 *                               the one path that would quote it back at them
 *                               inside a LATER reading's prompt -- in a reader's
 *                               voice, as if it had been said aloud again. The
 *                               `gist` is model output rather than the raw
 *                               question, which makes this LESS obvious and not
 *                               less bad.
 *
 * CROSS-READER BY DEFAULT (M12), with `readerId` returned so the block can name
 * whose reading it was and the prompt can tell the model to attribute rather
 * than claim it.
 *
 * Ordered `created_at desc` -- the most recent first -- and served by
 * `readings_user_created_idx`. The cards come back in one second query rather
 * than a join, because a join would multiply each reading by its card count and
 * the regrouping in JavaScript is the same work with a worse query plan.
 */
export async function recallableReadings(
  db: DbOrTx,
  args: {
    userId: string;
    excludeReadingId?: string;
    limit: number;
    sinceLocalDate: string;
  },
): Promise<RecalledReading[]> {
  if (args.limit <= 0) return [];

  const rows = await db
    .select({
      id: readings.id,
      localDate: readings.localDate,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      gist: readings.gist,
      question: readings.question,
      locale: readings.locale,
    })
    .from(readings)
    .where(
      and(
        eq(readings.userId, args.userId),
        gte(readings.localDate, args.sinceLocalDate),
        isNotNull(readings.body),
        isNotNull(readings.gist),
        ne(readings.status, 'blocked'),
        isNull(readings.deletedAt),
        args.excludeReadingId ? ne(readings.id, args.excludeReadingId) : undefined,
      ),
    )
    /*
     * `id` IS A TIEBREAK, NOT DECORATION. `created_at` defaults to `now()`,
     * which in Postgres is TRANSACTION-START time -- so two readings written in
     * one transaction share a timestamp exactly, and `created_at desc` alone is
     * not a total order. Production never hits it (two readings are two
     * requests and two transactions), but a tie would make two identical
     * requests render different blocks, and the integration suite hits it on
     * every run because `withRollback` wraps the whole test in one transaction.
     * Same argument as the `cardId asc` tiebreak in the frequency comparator.
     */
    .orderBy(desc(readings.createdAt), desc(readings.id))
    .limit(args.limit);

  if (rows.length === 0) return [];

  const cards = await db
    .select({
      readingId: readingCards.readingId,
      cardId: readingCards.cardId,
      reversed: readingCards.reversed,
    })
    .from(readingCards)
    .where(inArray(readingCards.readingId, rows.map((r) => r.id)))
    .orderBy(readingCards.position);

  const byReading = new Map<string, { cardId: number; reversed: boolean }[]>();
  for (const c of cards) {
    const list = byReading.get(c.readingId);
    if (list) list.push({ cardId: c.cardId, reversed: c.reversed });
    else byReading.set(c.readingId, [{ cardId: c.cardId, reversed: c.reversed }]);
  }

  return rows.map((r) => ({
    id: r.id,
    localDate: r.localDate,
    readerId: r.readerId as ReaderId,
    serviceId: r.serviceId as ServiceId,
    cards: byReading.get(r.id) ?? [],
    locale: r.locale,
    // Non-null asserted because `isNotNull` is in the where clause above.
    gist: r.gist!,
    /*
     * A BOOLEAN, NOT THE TEXT. This is the only thing the relevance gate needs
     * from the recalled question, and it is the last point at which the text
     * could have escaped into the prompt layer. It does not leave this function.
     */
    hadQuestion: r.question !== null && r.question.trim() !== '',
  }));
}

// ---------------------------------------------------------------------------
// V6 — the history screens.
//
// Three reads: one day's list, the days that have anything, and one reading in
// full. `HistoryItem` and `ReadingDetail` are declared in `@/lib/history/types`
// and imported here rather than declared here, because both are named by client
// components and `clientBoundary.test.ts` forbids `@/lib/db/` in one -- its
// regex matches `import type` too. This module is the only place either shape is
// CONSTRUCTED, which is the part that matters.
// ---------------------------------------------------------------------------

export type { HistoryItem, ReadingDetail };

/**
 * Version 1-8, variant 8/9/a/b.
 *
 * Mirrors `validSessionId`'s pattern in `src/lib/analytics/localdate.ts`, for the
 * same reason: keep junk out of an indexed comparison and, more importantly, out
 * of the driver's error path. `where id = 'banana'` raises SQLSTATE `22P02` and
 * an unhandled one 500s a page that should 404 -- and puts the failing statement
 * in the platform log.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Group card rows by their reading, preserving the query's `position` order. */
function groupCards<T extends { readingId: string } & HistoryCard>(
  rows: T[],
): Map<string, HistoryCard[]> {
  const byReading = new Map<string, HistoryCard[]>();
  for (const c of rows) {
    const entry: HistoryCard = { cardId: c.cardId, reversed: c.reversed, position: c.position };
    const list = byReading.get(c.readingId);
    if (list) list.push(entry);
    else byReading.set(c.readingId, [entry]);
  }
  return byReading;
}

/**
 * ONE DAY'S READINGS, FOR THE HISTORY LIST (V6).
 *
 * ONE FILTER, `status <> 'blocked'`, and it is deliberately neither
 * `readingsOnLocalDate`'s none nor `recallableReadings`'s five. Each of the three
 * asks a different question of the same table:
 *
 *   - a day SUMMARY is a count and a shape of the day, so it filters nothing:
 *     "you drew three times today" is true whether or not the third finished.
 *   - a CALLBACK needs something quotable, so it needs five.
 *   - this needs something DRAWABLE, so it needs one.
 *
 * A blocked reading has NO CARD ROWS (reconciliation R7), so there is no draw to
 * reconstruct and the feature's whole premise fails on that row. It is also the
 * one row whose `question` column holds text W7's classifier flagged as harmful
 * -- W7 redacts the same words from `moderation_flags` at 30 days, and a
 * permanently browsable copy under another column name would quietly undo that.
 * **THE FILTER IS SECURITY-ADJACENT, NOT COSMETIC.** Somebody proposing to show
 * blocked readings "for completeness" is proposing to undo a retention promise.
 *
 * `failed` and `aborted` STAY. The querent drew those cards, R7 already counts
 * them toward the frequency verdict, and a History that hides a draw the
 * frequency feature counted makes two features disagree about the same past --
 * which is precisely the class of failure the memory workstream exists to avoid.
 * They render with a "this reading did not finish" line that, since 2026-08-28,
 * also offers a REFILL -- `/history/[id]`'s `Coba ulang`, which regenerates prose
 * in place over the stored hand. **THAT IS A NARROW AMENDMENT TO VD14 AND NOT A
 * REVERSAL:** VD14's argument is that a regeneration would make the querent's
 * memory of the reading and the app's disagree, and a row with `body IS NULL` has
 * no remembered text for anything to disagree with. Retryability is `body IS NULL`
 * and NEVER a status list -- see `src/lib/reading/retryable.ts`.
 * `partial` is shown as normal: it has real prose, and the `[Bacaan terputus…]`
 * notice deliberately never reached `readings.body` -- so it is also never
 * retryable.
 *
 * NO `body` AND NO `gist` IN THE SELECT -- `hasBody` is computed in SQL. See
 * `HistoryItem`'s header.
 *
 * Served by `readings_user_local_date_idx`. Ordered `created_at desc, id desc`:
 * `created_at` defaults to `now()`, which is TRANSACTION-START time, so two rows
 * written in one transaction share a timestamp exactly and `created_at desc`
 * alone is not a total order. Production never hits it; `withRollback` hits it on
 * every integration run. Same tiebreak, same reason, as `recallableReadings`.
 */
export async function readingsForDay(
  db: DbOrTx,
  userId: string,
  localDate: string,
): Promise<HistoryItem[]> {
  const rows = await db
    .select({
      id: readings.id,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      localDate: readings.localDate,
      createdAt: readings.createdAt,
      locale: readings.locale,
      status: readings.status,
      verdict: readings.verdict,
      question: readings.question,
      /* Selected, unlike `body`: it is at most 40 characters and it is what makes
         a choice reading legible in a list of otherwise identical spreads. VD8 is
         about the PROSE, not about every column. */
      choice: readings.choice,
      hasBody: sql<boolean>`${readings.body} is not null`,
      sharedAt: readings.sharedAt,
    })
    .from(readings)
    .where(
      and(
        eq(readings.userId, userId),
        eq(readings.localDate, localDate),
        ne(readings.status, 'blocked'),
        /*
         * TWO FILTERS NOW, AND THEY ARE NOT THE SAME KIND OF THING. `blocked` is
         * ours -- W7 refused the question and the reader never spoke. This one is
         * the querent's: they asked for this reading to go, and this list is the
         * screen they asked from. It is also the ONLY filter here whose omission
         * would be visible to them within seconds.
         */
        isNull(readings.deletedAt),
      ),
    )
    .orderBy(desc(readings.createdAt), desc(readings.id));

  if (rows.length === 0) return [];

  const cards = await db
    .select({
      readingId: readingCards.readingId,
      cardId: readingCards.cardId,
      reversed: readingCards.reversed,
      position: readingCards.position,
    })
    .from(readingCards)
    .where(
      inArray(
        readingCards.readingId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(readingCards.position);

  const byReading = groupCards(cards);

  return rows.map((r) => ({
    id: r.id,
    readerId: r.readerId,
    serviceId: r.serviceId,
    localDate: r.localDate,
    createdAtIso: r.createdAt.toISOString(),
    locale: r.locale,
    status: r.status,
    verdict: r.verdict,
    question: r.question,
    choice: r.choice,
    /*
     * `Boolean(...)` and not a bare cast. postgres.js returns a real boolean for
     * `is not null`, but the `sql<boolean>` above is an assertion the driver is
     * not obliged to honour, and `hasBody` decides whether a row says "this
     * reading did not finish". A truthy string would silently reverse it.
     */
    hasBody: Boolean(r.hasBody),
    sharedAt: r.sharedAt ? r.sharedAt.toISOString() : null,
    cards: byReading.get(r.id) ?? [],
  }));
}

/**
 * THE DAYS THAT HAVE READINGS, newest first. The filter strip is built from this.
 *
 * WHY THIS QUERY EXISTS RATHER THAN A MONTH GRID: a calendar offering 365 days of
 * which four have anything is a control that mostly wastes taps. Every chip this
 * returns is guaranteed non-empty, and the same array answers the empty-day
 * screen's "your nearest reading was…" with no second request — which is where it
 * earns its keep a second time.
 *
 * ── WHAT THIS ACTUALLY PLANS AS, BECAUSE THE PLAN SAID SOMETHING ELSE ────────
 *
 * V6's plan claimed this "walks `readings_user_local_date_idx` in reverse and
 * stops at the limit, so a querent with five thousand readings pays for `limit`
 * distinct values and not for five thousand rows." **THAT IS NOT WHAT POSTGRES
 * DOES AND IT CANNOT BE: there is no loose (skip) index scan in Postgres 16.**
 * `distinct` on an indexed column reads every index entry in range and uniques
 * on top; the `limit` prunes the sort, never the scan.
 *
 * MEASURED on Postgres 16 against 200k readings across 200 users, 2000 of them
 * this user's:
 *
 *     Limit -> Sort -> HashAggregate
 *       -> Bitmap Heap Scan on readings   (rows=2000, heap blocks 2000)
 *            -> Bitmap Index Scan on readings_user_created_idx
 *     Execution Time: 2.243 ms
 *
 * So it picks the OTHER `user_id`-leading index, and it reads all of the
 * querent's rows. That is fine and is why no index is added for it (§6.4): the
 * work is bounded by one person's own reading count -- which the rate limiter and
 * human patience bound in turn -- and 2.2ms at two thousand readings is far past
 * anything real. An index-only scan would need `status` in the index, which is
 * write amplification on the app's hottest insert path to save two milliseconds
 * on a page nobody opens in a loop.
 *
 * `readingsForDay` above is the one that plans as advertised: Index Scan using
 * `readings_user_local_date_idx`, 0.038 ms.
 *
 * SAME `status <> 'blocked'` FILTER AS THE LIST, or the strip would offer a day
 * whose only reading the list then refuses to show — a chip that leads to the
 * empty state is worse than no chip.
 */
export async function historyDays(
  db: DbOrTx,
  userId: string,
  limit: number,
): Promise<string[]> {
  // Not defensive padding: `.limit(0)` is a valid statement that returns nothing,
  // so this saves a round trip rather than preventing an error.
  if (limit <= 0) return [];

  const rows = await db
    .selectDistinct({ localDate: readings.localDate })
    .from(readings)
    /*
     * THE SAME PAIR OF FILTERS AS `readingsForDay`, AND THE PAIR MUST STAY
     * IDENTICAL. The header already says so for `blocked`: a chip that leads to
     * the empty state is worse than no chip. Deleting the last reading of a day
     * has to take the day's chip with it.
     */
    .where(
      and(
        eq(readings.userId, userId),
        ne(readings.status, 'blocked'),
        isNull(readings.deletedAt),
      ),
    )
    .orderBy(desc(readings.localDate))
    .limit(limit);

  return rows.map((r) => r.localDate);
}

/**
 * ONE READING, WITH ITS CARDS AND ITS PROSE. The detail screen's whole payload.
 *
 * `userId` IS A PREDICATE, NOT AN ASSERTION MADE AFTERWARDS. Fetching by id and
 * then comparing owners in JavaScript is one forgotten `if` away from serving a
 * stranger's reading, and the forgotten `if` is invisible in review. Making
 * ownership part of the `where` means the only failure mode is a null.
 *
 * NULL COVERS THREE THINGS AT ONCE -- "does not exist", "belongs to someone
 * else", "was blocked" -- and the caller 404s all three identically. That is
 * deliberate, and it is the same rule V7 needs for share slugs: a distinguishable
 * "exists but is not yours" turns a uuid guess into an existence oracle.
 *
 * A MALFORMED UUID IS A NULL, NOT A DRIVER ERROR. See `UUID_RE`.
 */
export async function readingWithCards(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<ReadingDetail | null> {
  if (!UUID_RE.test(readingId)) return null;

  const [row] = await db
    .select()
    .from(readings)
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.userId, userId),
        ne(readings.status, 'blocked'),
        /*
         * **NULL NOW COVERS FOUR THINGS, NOT THREE** -- "does not exist", "belongs
         * to someone else", "was blocked", "was deleted" -- and every caller must
         * keep collapsing all four into the same 404. A distinguishable "you
         * deleted this" is the existence oracle this function's header refuses,
         * wearing a friendlier label.
         *
         * ONE PREDICATE, FOUR SURFACES. Besides `/history/[id]`, this function is
         * what `GET /api/chat/messages`, `/chat?attach=` and `chat/context.ts`'s
         * prompt block all go through, so a deleted reading stops being quotable
         * in the room by the same line. `chat_messages.attached_reading_id` is
         * `on delete set null` and F6 already renders a missing attachment; a
         * deleted one presents identically.
         */
        isNull(readings.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

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
    status: row.status,
    verdict: row.verdict,
    question: row.question,
    choice: row.choice,
    body: row.body,
    sharedAt: row.sharedAt ? row.sharedAt.toISOString() : null,
    cards,
  };
}

// ---------------------------------------------------------------------------
// The delete
// ---------------------------------------------------------------------------

/**
 * What the transaction actually did. Returned for the tests and for a caller that
 * wants to log; **the route deliberately puts none of it on the wire.**
 */
export type SoftDeleteOutcome = {
  /**
   * False when there was no LIVE row to flag -- already deleted, not theirs, or
   * never existed. The route answers 204 either way, and the three are
   * indistinguishable to the caller by design.
   */
  deleted: boolean;
  cardsMarked: number;
  linksRevoked: number;
  summariesCleared: number;
};

/**
 * SOFT-DELETE ONE READING, AND EVERYTHING THAT WOULD STILL SPEAK ABOUT IT.
 *
 * **THE FEATURE IS ABOUT EMBARRASSMENT, NOT DISK** (Miftah's request, verbatim:
 * *"sometimes user asked some embarrassing questions in the past"*). That is the
 * whole reason this is a transaction and not an `update`. Three things would
 * otherwise keep the reading speaking after the querent believed it was gone:
 *
 *   1. **A live `/s/<slug>`** -- a public URL, with the question on it by default
 *      since 2026-07-28, very possibly in the group chat they are embarrassed
 *      about. `revokeArtifactLinks` kills every language of it.
 *   2. **A stored day summary** -- prose in a reader's voice describing the day,
 *      which `isStale` cannot invalidate on a REMOVED source id. See
 *      `clearDaySummaries`.
 *   3. **The frequency verdict and W5 recall** -- both handled by the read filters
 *      instead, because both are derived on demand and self-heal.
 *
 * **ORDER MATTERS AND IT IS NOT ALPHABETICAL -- `src/lib/account/delete.ts` IS THE
 * PRECEDENT AND ITS ARGUMENT TRANSFERS EXACTLY.** The revoke and the summary clear
 * run BEFORE the flag, so a failure in a statement that actually removes something
 * aborts the whole thing rather than leaving a reading marked deleted with a live
 * public URL. The reverse order fails silently in precisely the case that matters.
 *
 * **THE READ COMES FIRST AND IS INSIDE THE TRANSACTION.** `clearDaySummaries`
 * needs the reading's `local_date`, which is the querent's own calendar day and
 * cannot be derived from `created_at` (it rolls over at 07:00 in Jakarta). The
 * same read is what makes this a no-op for "not yours", "does not exist" and
 * "already deleted" -- one branch, no oracle, nothing written.
 *
 * **CONCURRENCY.** Two simultaneous deletes both find the live row; the final
 * `where deleted_at is null` means exactly one reports `deleted: true` and the
 * other's statements are all no-ops. The timestamp therefore cannot be moved by a
 * replay, so "when did they delete this" stays answerable -- `deleteAccount`'s
 * idempotence argument, one table over.
 *
 * **`userId` IS IN EVERY `WHERE`, INCLUDING THE CARDS'.** `queries/share.ts`'s
 * rule 1: not defence in depth, the actual authorization. A reading id reaches the
 * browser (it is in `HistoryItem` and in the `x-reading-id` header), so a
 * statement keyed on it alone would be a delete token for anybody who read one.
 *
 * **NOTHING IS HARD-DELETED AND THERE IS NO RESTORE.** The row survives for the
 * operator; from the querent's side the deletion is final and the copy must not
 * imply otherwise. `reading_cards`, `llm_calls`, `translations` and
 * `chat_messages.attached_reading_id` all keep pointing at a row that still
 * exists, which is why none of them needed a migration.
 *
 * **A MALFORMED UUID IS A NO-OP, NOT A DRIVER ERROR.** `readingWithCards`'s rule,
 * and here it also keeps the querent's own id out of a 22P02 error's bound
 * parameters.
 */
export async function softDeleteReading(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<SoftDeleteOutcome> {
  const nothing: SoftDeleteOutcome = {
    deleted: false,
    cardsMarked: 0,
    linksRevoked: 0,
    summariesCleared: 0,
  };
  if (!UUID_RE.test(readingId)) return nothing;

  return db.transaction(async (tx) => {
    /*
     * `local_date` AND NOTHING ELSE. Not the question, not the body: the smallest
     * projection is the one that cannot put the querent's own words into a driver
     * error's bound-parameter list, which is the rule `ownsShareableReading`'s
     * header states and `api/history/log.ts` exists to enforce downstream.
     */
    const [live] = await tx
      .select({ localDate: readings.localDate })
      .from(readings)
      .where(
        and(
          eq(readings.id, readingId),
          eq(readings.userId, userId),
          isNull(readings.deletedAt),
        ),
      )
      .limit(1);
    if (!live) return nothing;

    // 1. The public URLs, in every language. Per-artifact, never per-link.
    const links = await revokeArtifactLinks(tx, userId, 'reading', readingId);

    // 2. The generated prose that describes it.
    const summariesCleared = await clearDaySummaries(tx, userId, live.localDate, readingId);

    /*
     * ONE TIMESTAMP FOR BOTH TABLES, taken here rather than twice. Two `new Date()`
     * calls would differ by a millisecond and make "were these written together?"
     * unanswerable from the data, which is the only audit either column supports.
     */
    const deletedAt = new Date();

    // 3. The cards, so the frequency scan stops counting them without a join.
    const cards = await tx
      .update(readingCards)
      .set({ deletedAt })
      .where(
        and(
          eq(readingCards.readingId, readingId),
          eq(readingCards.userId, userId),
          isNull(readingCards.deletedAt),
        ),
      )
      .returning({ id: readingCards.id });

    // 4. The reading. LAST, for `delete.ts`'s reason.
    const flagged = await tx
      .update(readings)
      .set({ deletedAt })
      .where(
        and(
          eq(readings.id, readingId),
          eq(readings.userId, userId),
          isNull(readings.deletedAt),
        ),
      )
      .returning({ id: readings.id });

    return {
      deleted: flagged.length === 1,
      cardsMarked: cards.length,
      linksRevoked: links.length,
      summariesCleared,
    };
  });
}

// ---------------------------------------------------------------------------
// The retry
// ---------------------------------------------------------------------------

/**
 * What a retry is allowed to move. **WHAT IS ABSENT FROM THIS TYPE IS THE
 * SPECIFICATION**, and it is absent so that the column cannot be written by
 * mistake rather than because nobody thought of it:
 *
 *   `id`, `user_id`     The row is the same row. Every FK pointing at it stays
 *                       valid and keeps pointing at the thing the querent
 *                       retried -- `reading_cards`, `llm_calls`,
 *                       `chat_messages.attached_reading_id`,
 *                       `chat_runs.trigger_reading_id`, `translations.entity_id`
 *                       and `share_links.entity_id` all name this id.
 *   `reader_id`,        The draw is not re-taken. Same reader, same service,
 *   `service_id`,       same hand, same question, same day.
 *   `question`,
 *   `local_date`
 *   `locale`            **THE LANGUAGE THE PROSE CAME OUT IN, AND IT IS
 *                       IMMUTABLE.** A retry regenerates in that same language,
 *                       whatever the querent's interface says now. Moving it
 *                       leaves V2's translation of this reading stale against a
 *                       body that was never in the language the column claims --
 *                       permanently, because `ReadingView`'s rule 4 keys off
 *                       exactly this column and `translations` has no
 *                       `source_hash` to notice with. **`ReadingRefill` having no
 *                       `locale` field is what makes that unwritable.**
 *   `session_id`        The session that took the reading, not the one retrying.
 *   `created_at`        When the draw happened. A bumped one silently reorders
 *                       the querent's own history around a retry.
 *   `shared_at`         "Was this ever public" is unchanged by a regeneration.
 *   `gist`              Written separately, by `setReadingGist` from inside
 *                       `extractGist`, after this returns.
 *
 * `body: null` IS LEGITIMATE, not a caller bug: it is the retry-that-also-failed
 * case. The row keeps `body IS NULL` and so stays retryable, while the status,
 * timing and token columns still move to record the SECOND attempt. The first
 * attempt's token counts are overwritten and are NOT lost -- `llm_calls` keeps a
 * row per attempt, which is the ledger's whole job.
 */
export type ReadingRefill = {
  status: ReadingStatus;
  body: string | null;
  choice: string | null;
  verdict: YesNo | null;
  model: string;
  promptVersion: string;
  latencyMs: number | null;
  tokenInput: number | null;
  tokenOutput: number | null;
};

/**
 * REGENERATE THE PROSE OF ONE UNFINISHED READING, IN PLACE, OVER ITS OWN DRAW.
 *
 * **THE SAFETY IS IN THE `WHERE`, AND NONE OF IT MAY MOVE INTO JAVASCRIPT.**
 * That is the entire design of this function; a fetch-then-compare version looks
 * equivalent and is not:
 *
 *   `id = $`            the row.
 *   `user_id = $`       OWNERSHIP AS A PREDICATE, `readingWithCards`'s rule. A
 *                       read-then-compare is one forgotten `if` away from
 *                       overwriting a stranger's reading.
 *   `body is null`      **THE RULE** (invariant 6), and the one a read-then-write
 *                       provably cannot hold: two presses of the button, or one
 *                       press and one lost-ack retry, BOTH read `null`, both
 *                       generate, and the second overwrites prose the querent is
 *                       already reading on screen. Expressed here, the loser
 *                       updates zero rows and finds out.
 *   `deleted_at is null` covers the window between the route's read and this
 *                       write, which is exactly as long as a model call.
 *   `status <> 'blocked'` a blocked reading has `body IS NULL` and no cards, so
 *                       every other clause admits it.
 *
 * RETURNS A ROW COUNT, NOT A BOOLEAN AND NOT A ROW. **`0` IS A NORMAL OUTCOME**
 * -- the guard doing its job -- so nothing here throws for it and the caller
 * decides what it means.
 *
 * NO `updatedAt`: `readings` has no such column. Recorded because the reflex is
 * to check for Drizzle's `$onUpdate()` trap, and the answer here is that the
 * column is absent, not that the trap was handled.
 *
 * A MALFORMED UUID IS A ZERO, NOT A DRIVER ERROR. `where id = 'banana'` raises
 * SQLSTATE 22P02, and an unhandled one puts the failing statement -- with its
 * bound parameters -- into the platform log. `UUID_RE` is the same guard
 * `readingWithCards` and `softDeleteReading` use.
 *
 * `returning` RATHER THAN THE DRIVER'S ROW COUNT: the same round trip, and it
 * reads the same on every driver.
 */
export async function refillReading(
  db: DbOrTx,
  userId: string,
  readingId: string,
  row: ReadingRefill,
): Promise<number> {
  if (!UUID_RE.test(readingId)) return 0;

  const updated = await db
    .update(readings)
    .set({
      status: row.status,
      body: row.body,
      choice: row.choice,
      verdict: row.verdict,
      model: row.model,
      promptVersion: row.promptVersion,
      latencyMs: row.latencyMs,
      tokenInput: row.tokenInput,
      tokenOutput: row.tokenOutput,
    })
    .where(
      and(
        eq(readings.id, readingId),
        eq(readings.userId, userId),
        isNull(readings.body),
        isNull(readings.deletedAt),
        ne(readings.status, 'blocked'),
      ),
    )
    .returning({ id: readings.id });

  return updated.length;
}
