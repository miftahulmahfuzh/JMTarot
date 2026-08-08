/**
 * SEAM `S5`. **F5 OWNS THE SUPPRESSION RULE; F6's ATTACH CALLS THIS.**
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 *
 * **If the querent attaches reading X into the chat themselves, the
 * `reading_completed` run for X does not fire** (`[F5-14]`).
 *
 * *Reason.* The querent bringing the reading into the room **is** the conversational
 * move. A reader saying *"eh, aku lihat bacaanmu barusan"* three seconds after the
 * querent said *"nih bacaanku barusan"* is two people talking over each other about the
 * same object, and it reads as a machine that did not notice.
 *
 * ── ONE CHECK IS NOT ENOUGH, AND THE COMMON CASE IS THE SECOND ONE (§9.2) ─
 *
 * | Order | Caught by |
 * |---|---|
 * | attached days later from `/history`; no run for X was ever minted | nothing to suppress |
 * | attached BEFORE the mint (rare — the mint runs seconds after the stream ends) | **Mechanism A**, `detect.ts`'s `not exists` on `attached_reading_id` |
 * | attached AFTER the mint, run still `pending` — **the common case**, because F6's draw-screen control only appears once the reading is FINISHED, which is after the `after()` has already fired | **Mechanism B**, this file |
 * | attached after the run has started speaking | **neither, deliberately** — §9.5 |
 *
 * ── AND IT IS WHY THE ATTACH GETS ANSWERED AT ALL ─────────────────────────
 *
 * `mintRun` refuses when a live run already exists — *one room, one conversation at a
 * time*. So without this, attaching a reading while its `reading_completed` run sits
 * `pending` would store the querent's bubble and mint **nothing**: they would post a
 * reading into the room and three readers would say nothing about it. That is the
 * failure this function prevents, and it is bigger than the duplicate it was written
 * for.
 */
import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { chatRuns } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { logChatFailure } from '../log';

/**
 * Kill a not-yet-started `reading_completed` run for this reading.
 *
 * Returns the number of runs abandoned (0 or 1). **Never throws** (`[F5-18]`): it runs
 * inside the attach's own transaction, and an attach that failed because a bookkeeping
 * update failed would cost the querent their message.
 *
 * **ONE CONDITIONAL STATEMENT, AND THE ROW COUNT IS THE ANSWER**, so there is no
 * check-then-act window — the same shape as the lease and as the day counter.
 *
 * Three predicates that are each load-bearing:
 *
 *   - **`status = 'pending'` only.** A `planning` run is mid-`chat_plan`; killing it
 *     leaves a model call in flight whose result writes to an abandoned row. A `running`
 *     run has already spoken, and §9.5 leaves it alone: `chat_messages` is append-only,
 *     a bubble that has been stored cannot be un-said, and deleting one would be the
 *     first delete path into that table.
 *   - **The lease predicate**, `C-R3`'s, reused rather than reinvented: a run somebody
 *     is holding is not ours to abandon.
 *   - **`user_id` in the `WHERE`**, though `trigger_reading_id` is already unique
 *     enough. It is the security shape of this query, and `supersede.integration.test.ts`
 *     names its negative control after it.
 */
export async function supersedeReadingRun(
  db: DbOrTx,
  userId: string,
  readingId: string,
): Promise<number> {
  try {
    const now = new Date();
    const rows = await db
      .update(chatRuns)
      .set({ status: 'abandoned', errorKind: 'superseded', updatedAt: now })
      .where(
        and(
          eq(chatRuns.userId, userId),
          eq(chatRuns.trigger, 'reading_completed'),
          eq(chatRuns.triggerReadingId, readingId),
          eq(chatRuns.status, 'pending'),
          sql`(${chatRuns.leaseUntil} is null or ${chatRuns.leaseUntil} < ${now.toISOString()}::timestamptz)`,
        ),
      )
      .returning({ id: chatRuns.id });
    return rows.length;
  } catch (err) {
    logChatFailure('proactive.supersede', err, { user: userId, reading: readingId });
    return 0;
  }
}
