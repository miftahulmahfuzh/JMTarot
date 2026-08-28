/**
 * The read-through cache behind the per-day reader summary (roadmap §5). W5
 * owns when to generate and what to say; W1 owns the get and the put.
 *
 * See profile.ts for the contract every file here follows.
 */
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
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
    .where(
      and(
        eq(readings.userId, userId),
        eq(readings.localDate, localDate),
        /*
         * **THE ONE FILTER, AND IT DOES NOT CONTRADICT THE "NO FILTERS" HEADER
         * BELOW -- IT IS A DIFFERENT QUESTION.** That paragraph is about `failed`
         * and `aborted`: "you drew three times today" is true whether or not the
         * third one finished, and dropping it would make the summary disagree with
         * what the querent remembers doing. This is the opposite case. A deleted
         * reading is one the querent has asked not to remember, and this row is
         * PROSE A READER WRITES ABOUT THEIR DAY -- the only generated artifact that
         * would keep describing it. `softDeleteReading` additionally DELETES any
         * stored summary that named this reading, because `isStale` detects a new
         * id and not a removed one, so the filter alone would leave yesterday's
         * paragraph standing.
         */
        isNull(readings.deletedAt),
      ),
    )
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

/**
 * Delete every cached day summary that was written ABOUT this reading.
 *
 * **BECAUSE `isStale` CANNOT SEE A REMOVAL.** `src/lib/memory/summary.ts:63`
 * fires on a prompt-version bump or on an id it has not seen; a source reading
 * that has GONE leaves `hasNew` false and the stored paragraph is served
 * unchanged, for ever. So filtering `readingsOnDay` is necessary and not
 * sufficient: without this, a querent deletes an embarrassing reading and the
 * reader keeps recounting their day with it in.
 *
 * **KEYED ON THE SOURCE LIST, NOT ON THE DAY.** `$1 = any(source_reading_ids)`
 * clears only the rows that actually named this reading -- a summary generated
 * before the reading was taken never mentioned it and is still true. All readers
 * and all locales, because the row is keyed by reader for the VOICE and by locale
 * for the language, and neither changes what happened.
 *
 * **A DELETE, NOT A FLAG.** This is a read-through cache; the next visit
 * regenerates it from what is left, which is `putDailySummary`'s ordinary
 * first-write path. The one cost is that `generation_count` restarts at 0 for
 * that day, so the "is the throttle set right?" query undercounts by however many
 * regenerations preceded a delete. Recorded rather than worked around: a
 * counter's accuracy is not worth carrying a tombstone for.
 *
 * `${readingId}::uuid` IS CAST EXPLICITLY, `queries/admin/users.ts`'s pattern. A
 * bare parameter is sent untyped by postgres.js and `unknown = any(uuid[])` is
 * one planner decision away from an error nobody expected.
 */
export async function clearDaySummaries(
  db: DbOrTx,
  userId: string,
  localDate: string,
  readingId: string,
): Promise<number> {
  const rows = await db
    .delete(dailySummaries)
    .where(
      and(
        eq(dailySummaries.userId, userId),
        eq(dailySummaries.localDate, localDate),
        sql`${readingId}::uuid = any(${dailySummaries.sourceReadingIds})`,
      ),
    )
    .returning({ id: dailySummaries.id });
  return rows.length;
}
