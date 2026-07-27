/**
 * The read-through cache behind the per-day reader summary (roadmap §5). W5
 * owns when to generate and what to say; W1 owns the get and the put.
 *
 * See profile.ts for the contract every file here follows.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Locale, ReaderId, ServiceId } from '@/data/types';
import type { DbOrTx } from '../types';
import {
  dailySummaries,
  readingCards,
  readings,
  type DailySummary,
  type NewDailySummary,
} from '../schema';

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

/**
 * Every reading the querent had on one of THEIR calendar days, with its cards.
 *
 * ALL READERS, NOT JUST THE ONE ASKING (M12). Miftah's requirement was "every
 * reading the user has had that day"; the `daily_summaries` row is keyed by
 * reader because the VOICE differs, not because the source set does. That is
 * what makes switching readers give three different tellings of one day, which
 * is the best demonstration in the product that the readers are not
 * interchangeable.
 *
 * `localDate` is compared as stored and never derived from `created_at`, which
 * rolls over at 07:00 in Jakarta and would split a single evening across two
 * days. Served by `readings_user_local_date_idx`.
 *
 * Ordered by `created_at` ascending -- the day in the order it happened, which
 * is the order a summary of it should read. The `id` tiebreak is there for the
 * same reason as in `recallableReadings`: `now()` is transaction-start time, so
 * rows written in one transaction share a timestamp and the order would
 * otherwise be arbitrary.
 */
export async function readingsOnDay(
  db: DbOrTx,
  userId: string,
  localDate: string,
): Promise<DayReadingRow[]> {
  const rows = await db
    .select({
      id: readings.id,
      readerId: readings.readerId,
      serviceId: readings.serviceId,
      gist: readings.gist,
      verdict: readings.verdict,
    })
    .from(readings)
    .where(and(eq(readings.userId, userId), eq(readings.localDate, localDate)))
    .orderBy(readings.createdAt, readings.id);

  if (rows.length === 0) return [];

  const cards = await db
    .select({
      readingId: readingCards.readingId,
      cardId: readingCards.cardId,
      reversed: readingCards.reversed,
    })
    .from(readingCards)
    .where(
      inArray(
        readingCards.readingId,
        rows.map((r) => r.id),
      ),
    )
    .orderBy(readingCards.position);

  const byReading = new Map<string, { cardId: number; reversed: boolean }[]>();
  for (const c of cards) {
    const list = byReading.get(c.readingId);
    if (list) list.push({ cardId: c.cardId, reversed: c.reversed });
    else byReading.set(c.readingId, [{ cardId: c.cardId, reversed: c.reversed }]);
  }

  return rows.map((r) => ({
    id: r.id,
    readerId: r.readerId as ReaderId,
    serviceId: r.serviceId as ServiceId,
    cards: byReading.get(r.id) ?? [],
    gist: r.gist,
    verdict: r.verdict,
  }));
}

/**
 * NO FILTERS, unlike `recallableReadings`, and the difference is the point.
 *
 * Recall feeds a CALLBACK -- "as your last reading said" -- so a reading whose
 * stream died has nothing to be quoted. A day summary is a COUNT and a shape of
 * the day: "you drew three times today, twice it was The Moon" is true whether
 * or not the third reading finished, and dropping it would make the summary
 * disagree with what the querent remembers doing. A null gist simply renders no
 * `inti:` clause for that line.
 */
export type DayReadingRow = {
  id: string;
  readerId: ReaderId;
  serviceId: ServiceId;
  cards: { cardId: number; reversed: boolean }[];
  gist: string | null;
  verdict: string | null;
};
