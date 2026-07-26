/**
 * The read-through cache behind the per-day reader summary (roadmap §5). W5
 * owns when to generate and what to say; W1 owns the get and the put.
 *
 * See profile.ts for the contract every file here follows.
 */
import { and, eq, sql } from 'drizzle-orm';
import type { Locale, ReaderId } from '@/data/types';
import type { DbOrTx } from '../types';
import { dailySummaries, type DailySummary, type NewDailySummary } from '../schema';

/**
 * The cache hit. Served by the unique key
 * `(user_id, reader_id, local_date, locale)`.
 *
 * A miss is `null` and is not an error: roadmap §6 says the reader picker
 * renders WITHOUT the summary and streams it in rather than waiting, and
 * roadmap §5 says nothing to summarize means nothing is shown -- an empty
 * state that says "you haven't read today" destroys the effect.
 */
export async function getDailySummary(
  db: DbOrTx,
  userId: string,
  readerId: ReaderId,
  localDate: string,
  locale: Locale,
): Promise<DailySummary | null> {
  const [row] = await db
    .select()
    .from(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, userId),
        eq(dailySummaries.readerId, readerId),
        eq(dailySummaries.localDate, localDate),
        eq(dailySummaries.locale, locale),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert, or regenerate in place.
 *
 * `generationCount` increments rather than being taken from the caller, so it
 * counts what actually happened rather than what a caller believed. It is how
 * "is the regeneration throttle set right?" becomes one query instead of an
 * events aggregation.
 *
 * `updatedAt` is set explicitly for the same reason as in `upsertProfile`:
 * Drizzle's `$onUpdate()` fires on `db.update()` and NOT inside
 * `onConflictDoUpdate`, so without this line the column stays frozen at the
 * first insert -- and it is precisely the column W5's throttle compares
 * against.
 */
export async function putDailySummary(
  db: DbOrTx,
  input: NewDailySummary,
): Promise<DailySummary> {
  const [row] = await db
    .insert(dailySummaries)
    .values(input)
    .onConflictDoUpdate({
      target: [
        dailySummaries.userId,
        dailySummaries.readerId,
        dailySummaries.localDate,
        dailySummaries.locale,
      ],
      set: {
        body: input.body,
        sourceReadingIds: input.sourceReadingIds,
        promptVersion: input.promptVersion,
        generationCount: sql`${dailySummaries.generationCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
