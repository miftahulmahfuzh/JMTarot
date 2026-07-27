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
import { and, between, count, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../types';
import { readingCards } from '../schema';

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
 * Served as an index-only scan by `reading_cards_user_date_card_idx`, then a
 * hash aggregate over at most 22 groups. The window is the ONLY thing that
 * varies between W5's eight cases, which is the point of M1.
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
