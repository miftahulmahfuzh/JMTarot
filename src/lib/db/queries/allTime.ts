/**
 * The two all-time tallies `/account` needs, and NOTHING ELSE.
 *
 * A NEW FILE RATHER THAN AN EXTENSION OF `frequency.ts`, and roadmap §6 said
 * otherwise -- it assigned "all-time top card" to V3. Reconciliation §5.7
 * resolved it here, on V8's two arguments. V8 is the only consumer, and every
 * function in `frequency.ts` is organised around `windowBounds`: the defining
 * property of these three is that they have NO WINDOW, which is rule 5 of this
 * directory's contract ("a function that fits none of the concerns is a sign the
 * concern is new").
 *
 * NO NEW INDEX (A12), and `schema.ts` already argues it.
 * `reading_cards_user_date_card_idx` is `(user_id, local_date, card_id)` and its
 * own comment says a leading-column-only prefix serves anything
 * `(user_id, card_id)` would have. This IS the leading-column-only case, asserted
 * by an `explain` in the integration test rather than believed. Measured plan:
 *
 *   GroupAggregate
 *     -> Index Scan using reading_cards_user_date_card_idx on reading_cards
 *          Index Cond: (user_id = $1)
 *
 * An index SCAN and not index-only, for the same `filter (where reversed)` reason
 * `cardCounts` documents. **Do not add a second index without measuring**: write
 * amplification on the hottest write table in the schema, for one page visited
 * occasionally, is not a trade.
 *
 * A SOFT-DELETED USER'S ROWS ARE NOT EXCLUDED. The account is restorable for
 * `ERASURE_GRACE_DAYS`, so filtering here would make this page lie during the
 * grace window while every other query in the app still returned the rows.
 *
 * **A SOFT-DELETED READING IS EXCLUDED, AND THAT IS THE OPPOSITE CALL ON A
 * DIFFERENT COLUMN. THE TWO ARE NOT RELATED AND MUST NOT BE "MADE CONSISTENT".**
 * `users.deleted_at` is restorable and belongs to an account that is on its way
 * out; `readings.deleted_at` is FINAL and belongs to a reading a querent asked to
 * be rid of, on this very page's neighbour screen. All four reads below carry
 * `deleted_at is null`. `recentReadingIds` filtering is what moves
 * `personaInputHash` after a delete, so the persona regenerates on the next visit
 * instead of staying prose about a draw that is gone -- the ordinary mechanism, no
 * new code.
 *
 * `ALL_TIME_GATE` AND THE TWO PREDICATES ARE NOT HERE. They are pure product
 * judgement with no handle to take, so `contract.test.ts` puts them in
 * `@/lib/persona/lines.ts` -- the same wall W3 hit with the Lotus cache and W5
 * hit with `windowBounds`.
 */
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { ReaderId } from '@/data/types';
import { readingCards, readings } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/** `queries/share.ts`'s guard: postgres raises 22P02 on a malformed uuid literal. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TopCard = {
  cardId: number;
  count: number;
  /**
   * How many of those were reversed. `cardMeaning` is a PAIR and the reversed
   * line is a different statement rather than a negation, so a card that keeps
   * arriving upside down needs the reversed gloss -- showing the upright one
   * would contradict the artwork the querent remembers.
   */
  reversedCount: number;
  /** `'YYYY-MM-DD'`, the querent's own calendar day. Never a Date. */
  lastSeen: string;
};

export type TopReader = {
  readerId: ReaderId;
  count: number;
  /**
   * The SECOND reader's count, or 0 when there has only ever been one.
   *
   * Returned rather than a boolean, because the "must lead" rule is product
   * judgement that belongs in `lines.ts` with the rest of `ALL_TIME_GATE`. A
   * query that decided it here would put a threshold in the data layer where
   * nobody tuning the page would think to look.
   */
  runnerUpCount: number;
};

/** Every reading ever, whatever its status -- except the ones they deleted. */
export async function readingCountAllTime(db: DbOrTx, userId: string): Promise<number> {
  if (!UUID_RE.test(userId)) return 0;
  const [row] = await db
    .select({ n: count() })
    .from(readings)
    .where(and(eq(readings.userId, userId), isNull(readings.deletedAt)));
  // Number() for `cardCounts`'s reason: postgres.js hands bigint aggregates back
  // as strings, and a string count compares with >= and then sorts wrong.
  return Number(row?.n ?? 0);
}

/**
 * The card the universe keeps handing them.
 *
 * Reads `reading_cards`, not `readings`, so a three-card spread contributes
 * three cards -- which is right here, unlike W5's M4 gate, because the question
 * is "which card recurs" and not "has this person read enough to have a
 * pattern". The gate answers the second, from `readingCountAllTime`.
 */
export async function topCardAllTime(db: DbOrTx, userId: string): Promise<TopCard | null> {
  if (!UUID_RE.test(userId)) return null;
  const rows = await db
    .select({
      cardId: readingCards.cardId,
      count: count(),
      reversedCount: sql<number>`count(*) filter (where ${readingCards.reversed})`,
      lastSeen: sql<string>`max(${readingCards.localDate})`,
    })
    .from(readingCards)
    /* The denormalized column, for `cardCounts`'s reason: this is the
       leading-column-only case of `reading_cards_user_date_card_idx` and joining
       `readings` to find the parent's state would give up that plan. */
    .where(and(eq(readingCards.userId, userId), isNull(readingCards.deletedAt)))
    .groupBy(readingCards.cardId)
    /* Card id ascending as the tiebreak, so the order is TOTAL. Without it the
       winner of a tie depends on the plan, and `personas.input_hash` covers the
       facts -- so an unstable winner would regenerate the persona at random. */
    .orderBy(sql`count(*) desc`, readingCards.cardId)
    .limit(1);

  const top = rows[0];
  if (!top) return null;
  return {
    cardId: top.cardId,
    count: Number(top.count),
    reversedCount: Number(top.reversedCount),
    lastSeen: top.lastSeen,
  };
}

/** The reader whose path opened for them, and how far ahead they are. */
export async function topReaderAllTime(db: DbOrTx, userId: string): Promise<TopReader | null> {
  if (!UUID_RE.test(userId)) return null;
  const rows = await db
    .select({ readerId: readings.readerId, count: count() })
    .from(readings)
    .where(and(eq(readings.userId, userId), isNull(readings.deletedAt)))
    .groupBy(readings.readerId)
    .orderBy(sql`count(*) desc`, readings.readerId)
    /* TWO rows, not one. The runner-up count is what `readerMustLead` needs, and
       fetching it here costs nothing on a group of at most three. */
    .limit(2);

  const top = rows[0];
  if (!top) return null;
  return {
    readerId: top.readerId,
    count: Number(top.count),
    runnerUpCount: Number(rows[1]?.count ?? 0),
  };
}

/**
 * The ids of the querent's last ten readings, newest first.
 *
 * **THIS IS WHAT MAKES THE PERSONA MOVE** (roadmap §4's note on
 * `personas.input_hash`): the ids go into the hash, so reading changes the
 * persona and it regenerates naturally instead of needing a cron. It also means
 * the hash changes after EVERY draw, which is why the staleness check needs a
 * time floor on the read path -- see `isPersonaStale`.
 *
 * Ordered by `created_at` and then `id`, so the sequence is stable for two
 * readings written in the same transaction. An unstable order would rehash
 * identical state and regenerate for nothing.
 */
export async function recentReadingIds(
  db: DbOrTx,
  userId: string,
  limit = 10,
): Promise<string[]> {
  if (!UUID_RE.test(userId)) return [];
  const rows = await db
    .select({ id: readings.id })
    .from(readings)
    /* The redundant-looking `and()` was already here; the second argument is what
       makes a delete move the hash, which is what regenerates the persona. */
    .where(and(eq(readings.userId, userId), isNull(readings.deletedAt)))
    .orderBy(sql`${readings.createdAt} desc`, sql`${readings.id} desc`)
    .limit(limit);
  return rows.map((r) => r.id);
}
