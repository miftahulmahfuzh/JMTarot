/**
 * readings + reading_cards. Written by W4's after() path, read by W5's
 * chained readings. See profile.ts for the contract every file here follows.
 */
import { and, desc, eq, gte, inArray, isNotNull, ne } from 'drizzle-orm';
import type { Locale, ReaderId, ServiceId } from '@/data/types';
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
