/**
 * The group-by behind the card-frequency verdict (roadmap §5). W5 owns the
 * windows, the ranking rules and the generated prose; W1 owns this scan.
 *
 * See profile.ts for the contract every file here follows.
 *
 * THE WINDOW MATHS IS NOT HERE, and W5's §3.1, which puts it here, is overruled
 * by `contract.test.ts`: every exported function in this directory takes the
 * handle as its first parameter, and `windowBounds` is pure -- it has no handle
 * to take. It lives in `src/lib/memory/windows.ts`, with the ranking, the
 * fingerprint and the gate in `src/lib/memory/frequency.ts`. This file is the
 * two scans and nothing else.
 */
import { and, between, count, eq, inArray, sql } from 'drizzle-orm';
import type { Locale } from '@/data/types';
import type { DbOrTx } from '../types';
import { frequencyVerdicts, readingCards, type FrequencyVerdict } from '../schema';

export type CardCount = {
  cardId: number;
  count: number;
  /**
   * How many of those appearances were reversed.
   *
   * CARRIED, NOT RANKED ON (W5 §3.2). The ranking is about the card recurring;
   * this is grounding the prose generator gets for free -- "muncul lima kali,
   * empat di antaranya terbalik" is a sharper line than "muncul lima kali", and
   * it costs one aggregate in a scan that is already touching the rows.
   */
  reversedCount: number;
  /**
   * `'YYYY-MM-DD'` of the most recent appearance. W5's second ranking key.
   *
   * A LOCAL DATE, not a timestamp: recency here means "which card did the deck
   * give them more recently in their own days", and `created_at` rolls over at
   * 07:00 in Jakarta.
   */
  lastSeen: string;
};

/**
 * How many times each card came up for a user inside a window.
 *
 * `since` and `until` are INCLUSIVE `'YYYY-MM-DD'` strings compared against
 * `reading_cards.local_date`, not timestamps: roadmap §5's windows are the
 * querent's days, not the server's hours, and the whole reason `local_date` is
 * denormalized onto this table is so this stays a single-table scan.
 *
 * Served by `reading_cards_user_date_card_idx`, then a hash aggregate over at
 * most 22 groups. The window is the ONLY thing that varies between W5's eight
 * cases, which is the point of M1.
 *
 * AN INDEX SCAN, NOT AN INDEX ONLY SCAN, and W5's §3.2 claim of "one index-only
 * scan" is wrong: the `filter (where reversed)` aggregate references a column
 * the index does not carry, so matching rows still need a heap fetch. Measured
 * on 45,000 card rows across 300 users, the 666-day window plans as a bitmap
 * index scan with both date bounds in the `Index Cond` and executes in 0.12ms,
 * so this is a note rather than a problem. Making it genuinely index-only means
 * `include (reversed)` on the index -- W1's table, W1's migration, and not
 * worth writing until the table is big enough to measure.
 *
 * Reconciliation R7: failed and aborted readings DO count -- the querent drew
 * those cards, and the verdict is about what the deck keeps giving them, not
 * about whether the model finished a sentence. No filter is needed for that,
 * because `blocked` readings write no card rows at all.
 *
 * NO PER-CARD `count(distinct reading_id)`, which W5's §3.2 SQL carries.
 * Nothing consumes it: the ranking uses count and lastSeen, and the prompt is
 * handed count and reversedCount. The number the gate actually needs is the
 * window's total distinct readings, which is `readingsInWindow` below and
 * cannot be derived from these rows at all -- a three-card spread contributes
 * three of them, so summing counts would triple it.
 *
 * Ordered by count descending then card id so the rows arrive in a stable
 * order; W5 re-ranks with its own tiebreakers on top, in TypeScript, so the
 * comparator sits next to the test that pins it.
 */
export async function cardCounts(
  db: DbOrTx,
  userId: string,
  since: string,
  until: string,
): Promise<CardCount[]> {
  const rows = await db
    .select({
      cardId: readingCards.cardId,
      count: count(),
      reversedCount: sql<number>`count(*) filter (where ${readingCards.reversed})`,
      lastSeen: sql<string>`max(${readingCards.localDate})`,
    })
    .from(readingCards)
    .where(
      and(eq(readingCards.userId, userId), between(readingCards.localDate, since, until)),
    )
    .groupBy(readingCards.cardId)
    .orderBy(sql`count(*) desc`, readingCards.cardId);

  /*
   * Number() on both aggregates, and not for tidiness. postgres.js hands back
   * bigint-shaped aggregates as STRINGS, so `count` would arrive as `'5'` --
   * which compares fine with `>=` against a number and then sorts as a string,
   * putting '10' below '3' in the ranking with nothing throwing anywhere.
   */
  return rows.map((r) => ({
    cardId: r.cardId,
    count: Number(r.count),
    reversedCount: Number(r.reversedCount),
    lastSeen: r.lastSeen,
  }));
}

/**
 * How many DISTINCT readings the user had inside the window.
 *
 * The gate counts READINGS, NOT CARDS (W5's M4): one three-card spread would
 * otherwise look like a pattern all by itself. Same predicate as `cardCounts`,
 * so the same index serves it.
 */
export async function readingsInWindow(
  db: DbOrTx,
  userId: string,
  since: string,
  until: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(distinct ${readingCards.readingId})` })
    .from(readingCards)
    .where(
      and(eq(readingCards.userId, userId), between(readingCards.localDate, since, until)),
    );
  return Number(row?.n ?? 0);
}

// ---------------------------------------------------------------------------
// The verdict cache (§3.4)
//
// `frequency_verdicts` and not `daily_summaries`: that table is keyed by day
// and reader, and this is keyed by window and neither.
// ---------------------------------------------------------------------------

/** A cache miss is `null` and is not an error -- it is the first page load. */
export async function getVerdict(
  db: DbOrTx,
  userId: string,
  windowKey: string,
  locale: Locale,
): Promise<FrequencyVerdict | null> {
  const [row] = await db
    .select()
    .from(frequencyVerdicts)
    .where(
      and(
        eq(frequencyVerdicts.userId, userId),
        eq(frequencyVerdicts.windowKey, windowKey),
        eq(frequencyVerdicts.locale, locale),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Insert, or replace the line in place.
 *
 * `updatedAt` IS SET BY HAND. Drizzle's `$onUpdate()` fires on `db.update()`
 * and NOT inside `onConflictDoUpdate` -- the trap CLAUDE.md records and the
 * same one `putDailySummary` and `upsertProfile` each pay for. Drop the line
 * and the column freezes at the first insert.
 */
export async function upsertVerdict(
  db: DbOrTx,
  input: {
    userId: string;
    windowKey: string;
    locale: Locale;
    fingerprint: string;
    topCardId: number;
    secondCardId: number;
    body: string;
    model: string;
    promptVersion: string;
  },
): Promise<void> {
  await db
    .insert(frequencyVerdicts)
    .values(input)
    .onConflictDoUpdate({
      target: [frequencyVerdicts.userId, frequencyVerdicts.windowKey, frequencyVerdicts.locale],
      set: {
        fingerprint: input.fingerprint,
        topCardId: input.topCardId,
        secondCardId: input.secondCardId,
        body: input.body,
        model: input.model,
        promptVersion: input.promptVersion,
        updatedAt: new Date(),
      },
    });
}

/**
 * Drop cached verdicts for one or more windows.
 *
 * Called when a window that USED to qualify no longer does (§3.4's last row): a
 * rolling window slides past the readings that qualified it, and a stale row
 * would keep asserting a pattern that has stopped existing.
 *
 * TAKES A LIST because of how the ladder fails. When `firstPassingWindow`
 * returns null it has rejected all four ladder windows, and any of them could
 * be holding a row from the week it did qualify. One statement with an `in`
 * clause is one round trip on the "nothing to show" path -- which is also the
 * path with no model call and nothing to render, so it is the cheapest place in
 * the feature to spend a write.
 *
 * A no-op when nothing matches, which is the overwhelming majority of calls.
 */
export async function deleteVerdicts(
  db: DbOrTx,
  userId: string,
  windowKeys: readonly string[],
  locale: Locale,
): Promise<void> {
  if (windowKeys.length === 0) return;
  await db
    .delete(frequencyVerdicts)
    .where(
      and(
        eq(frequencyVerdicts.userId, userId),
        inArray(frequencyVerdicts.windowKey, [...windowKeys]),
        eq(frequencyVerdicts.locale, locale),
      ),
    );
}
