/**
 * readings + reading_cards. Written by W4's after() path, read by W5's
 * chained readings. See profile.ts for the contract every file here follows.
 */
import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { Locale, ReaderId, ServiceId } from '@/data/types';
import type { HistoryCard, HistoryItem, ReadingDetail } from '@/lib/history/types';
import type { DbOrTx } from '../types';
import {
  readingCards,
  readings,
  type NewReading,
  type NewReadingCard,
  type Reading,
} from '../schema';

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

/** Most recent first. Served by `readings_user_created_idx`. */
export async function recentReadings(
  db: DbOrTx,
  userId: string,
  limit: number,
): Promise<Reading[]> {
  return db
    .select()
    .from(readings)
    .where(eq(readings.userId, userId))
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
    .where(and(eq(readings.userId, userId), eq(readings.localDate, localDate)))
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
 * FIVE FILTERS, each excluding a reading that would produce a bad callback:
 *
 *   - `id <> excludeReadingId`  the reading being written right now
 *   - `local_date >= since`     the lookback. A callback to something five
 *                               weeks old is not memory, it is surveillance.
 *   - `body is not null`        a stream that died said nothing to refer back to
 *   - `gist is not null`        the extraction failed, so there is no clause
 *   - `status <> 'blocked'`     W7 refused the question; the reader never spoke
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
 * They render with a "this reading did not finish" line and no retry (VD14).
 * `partial` is shown as normal: it has real prose, and the `[Bacaan terputus…]`
 * notice deliberately never reached `readings.body`.
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
    .where(and(eq(readings.userId, userId), ne(readings.status, 'blocked')))
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
