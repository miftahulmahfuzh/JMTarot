/**
 * The group-by behind the card-frequency verdict (roadmap §5). W5 owns the
 * windows, the ranking rules and the generated prose; W1 owns this scan.
 *
 * See profile.ts for the contract every file here follows.
 */
import { and, between, count, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '../types';
import { readingCards } from '../schema';

export type CardCount = { cardId: number; count: number };

/**
 * How many times each card came up for a user inside a window.
 *
 * `since` and `until` are INCLUSIVE `'YYYY-MM-DD'` strings compared against
 * `reading_cards.local_date`, not timestamps: roadmap §5's windows are the
 * querent's days, not the server's hours, and the whole reason `local_date` is
 * denormalized onto this table is so this stays a single-table scan.
 *
 * Served as an index-only scan by `reading_cards_user_date_card_idx`.
 *
 * Reconciliation R7: failed and aborted readings DO count -- the querent drew
 * those cards, and the verdict is about what the deck keeps giving them, not
 * about whether the model finished a sentence. No filter is needed for that,
 * because `blocked` readings write no card rows at all.
 *
 * Ordered by count descending then card id, so the ranking is deterministic
 * when two cards tie. W5 re-ranks with its own tiebreakers on top.
 */
export async function cardCounts(
  db: DbOrTx,
  userId: string,
  since: string,
  until: string,
): Promise<CardCount[]> {
  const rows = await db
    .select({ cardId: readingCards.cardId, count: count() })
    .from(readingCards)
    .where(
      and(eq(readingCards.userId, userId), between(readingCards.localDate, since, until)),
    )
    .groupBy(readingCards.cardId)
    .orderBy(sql`count(*) desc`, readingCards.cardId);

  return rows.map((r) => ({ cardId: r.cardId, count: Number(r.count) }));
}
