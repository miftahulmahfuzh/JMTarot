/**
 * readings + reading_cards. Written by W4's after() path, read by W5's
 * chained readings. See profile.ts for the contract every file here follows.
 */
import { and, desc, eq } from 'drizzle-orm';
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
