/**
 * MAY THIS READING BE RETRIED? One pure answer, for two callers that must never
 * disagree: the endpoint that regenerates the prose, and the control that offers
 * the button.
 *
 * PURE, NO `server-only`, NO `process.env`, NO `@/lib/db`. `choice.ts`'s shape,
 * for `choice.ts`'s reason. One TYPE-ONLY import of `@/data/types`, which has no
 * imports of its own, so this module runs in the BROWSER — where the retry
 * control decides whether to render — and on the server, inside the route. **Two
 * callers, one function, is the only reason a button the querent can see and an
 * endpoint that refuses them cannot say different things.**
 *
 * ── THE RULE IS `body IS NULL`. IT IS NOT A STATUS LIST ──────────────────────
 *
 * A reading is retryable when it has no prose. That is the whole rule, and the
 * two ways of writing it are not equivalent:
 *
 *   - `failed` and `aborted` are BOTH retryable. `/history` renders ONE line for
 *     both (`history.item.unfinished`), so a status list containing only `failed`
 *     would make the button mean something the screen does not say.
 *   - `partial` HAS PROSE and is never retryable (VD14, unamended). The
 *     `[Bacaan terputus...]` notice deliberately never reached `readings.body`,
 *     so a partial row holds real text the querent has already read. Retrying it
 *     would overwrite what they came back for.
 *
 * ── THE THREE EXTRA CHECKS ARE NOT WIDENINGS OF THAT RULE ────────────────────
 *
 * Each one is a fact the body-null rule cannot see by itself:
 *
 *   `deletedAt`  Belt only -- the route filters it through `readingWithCards` and
 *                `refillReading`'s WHERE filters it again. This is the copy the
 *                CLIENT can check, and the client has no WHERE.
 *   `blocked`    A blocked reading has `body IS NULL` AND NO `reading_cards` ROWS
 *                AT ALL, so the body-null rule alone calls it retryable. Its
 *                `question` is text W7's classifier flagged and redacts from
 *                `moderation_flags` at 30 days; regenerating over it is the one
 *                outcome that must not be reachable from a button.
 *   `cardCount`  Asserted rather than assumed, because the alternative is
 *                `buildPrompt` throwing on `picks[0]` inside a route that has
 *                already spent all four budgets.
 *
 * ── THE REASON IS FOR LOGS AND CODE PATHS, NEVER FOR THE WIRE ────────────────
 *
 * `retryable()` returns WHY rather than a bare `false`, because the route picks a
 * status code from it. **It must never be rendered or sent.** `deleted` and
 * `blocked` are answered with the same 404 an absent reading gets: a reading id
 * is a value that reaches the browser, and a distinguishable "you deleted this"
 * turns a uuid guess into an existence oracle. `readingWithCards`'s rule, in the
 * one place somebody would reasonably be tempted to be helpful.
 */
import type { ReadingStatus } from '@/data/types';

export type RetryCandidate = {
  status: ReadingStatus;
  /** `readings.body is not null`. THE RULE. */
  hasBody: boolean;
  /** `reading_cards` rows for this reading. Zero means there is no draw. */
  cardCount: number;
  /** Phase 1's column. Absent means "the caller cannot see it", not "it is null". */
  deletedAt?: Date | string | null;
};

/** Never rendered, never sent. For a log line and for choosing a status code. */
export type RetryRefusal = 'deleted' | 'blocked' | 'has_body' | 'no_cards';

export type RetryVerdict = { ok: true } | { ok: false; reason: RetryRefusal };

/**
 * THE ORDER IS DELIBERATE: most-fundamental fact first, so the reason names the
 * strongest thing true about the row rather than whichever clause somebody
 * happened to write first. A deleted, blocked row with prose reads as `deleted`.
 */
export function retryable(r: RetryCandidate): RetryVerdict {
  if (r.deletedAt != null) return { ok: false, reason: 'deleted' };
  if (r.status === 'blocked') return { ok: false, reason: 'blocked' };
  if (r.hasBody) return { ok: false, reason: 'has_body' };
  if (r.cardCount <= 0) return { ok: false, reason: 'no_cards' };
  return { ok: true };
}

/** For a caller that only decides whether to render a control. */
export function isRetryable(r: RetryCandidate): boolean {
  return retryable(r).ok;
}
