/**
 * The request-path half of the chained reading: read the history, run the gate,
 * hand `buildPrompt` a `MemoryContext` or null.
 *
 * Same split as `gist.generate.ts` against `prompt/memory.ts`, and same reason:
 * `chainRelevance`, `memoryBlock` and `memoryInstruction` are pure and tested
 * without a database, and this is the one function that needs one.
 *
 * IT NEVER THROWS. A reading without the block is a valid reading; a database
 * hiccup must not cost the querent theirs. Every failure path returns null,
 * which is the same value a user with no history gets, and which every caller
 * already handles.
 */
import type { MemoryContext } from '@/lib/prompt/memory';
import {
  MEMORY_CHAIN_COUNT,
  MEMORY_CHAIN_LOOKBACK_DAYS,
  chainRelevance,
} from '@/lib/prompt/memory';

/**
 * Recall the last readings and decide whether they earn a block.
 *
 * `localDate` is the QUERENT'S day, from the client, and the lookback is
 * subtracted from it rather than from the server's date (roadmap §7). Getting
 * that wrong would move the lookback window by a day for anyone whose local date
 * differs from UTC, which is most of the intended audience.
 *
 * THE READ IS ON THE REQUEST PATH, and roadmap §6 permits it on the same terms
 * as the Lotus block: per-user, indexed, and bounded -- `MEMORY_CHAIN_COUNT` is
 * 2, so it is one `limit 2` on `readings_user_created_idx` plus one `in` on at
 * most six card rows. It is NOT cached, unlike the Lotus block, because it
 * changes on every reading the user takes, which is exactly the event that would
 * invalidate the cache.
 */
export async function recallChain(args: {
  userId: string;
  currentCardIds: number[];
  currentHasQuestion: boolean;
  localDate: string;
  excludeReadingId?: string;
}): Promise<MemoryContext | null> {
  /*
   * THE KILL SWITCH, CHECKED BEFORE THE QUERY. `MEMORY_CHAIN_COUNT=0` has to
   * stop the database read as well as the block -- if it only suppressed the
   * rendering, turning chaining off in an emergency would still pay for the
   * lookup on every reading, and the knob exists to be pulled when something is
   * going wrong.
   */
  if (MEMORY_CHAIN_COUNT === 0) return null;

  try {
    const { db } = await import('@/lib/db/client');
    const { recallableReadings } = await import('@/lib/db/queries/history');

    const recalled = await recallableReadings(db, {
      userId: args.userId,
      excludeReadingId: args.excludeReadingId,
      limit: MEMORY_CHAIN_COUNT,
      sinceLocalDate: shiftDays(args.localDate, -MEMORY_CHAIN_LOOKBACK_DAYS),
    });

    const gate = chainRelevance({
      currentCardIds: args.currentCardIds,
      currentHasQuestion: args.currentHasQuestion,
      recalled,
    });

    if (!gate.include || gate.reason === null) return null;

    return { recalled, repeatCardIds: gate.repeatCardIds, reason: gate.reason };
  } catch (err) {
    logFailure(err);
    return null;
  }
}

/**
 * `'2026-07-26'` shifted by whole days, staying a `'YYYY-MM-DD'` string.
 *
 * UTC arithmetic, never `new Date(string)` rendered in the server's zone -- the
 * same rule `windows.ts` follows and for the same reason. A malformed date
 * yields the input unchanged, which makes the lookback a no-op rather than a
 * throw on the request path.
 */
function shiftDays(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + days * 86_400_000;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/**
 * NEVER LOG THE DRIVER ERROR IN PRODUCTION.
 *
 * CLAUDE.md's rule. A postgres error quotes the failing statement and its bound
 * parameters, and this query's parameters include the user id -- and the rows it
 * was fetching carry `readings.question`, which is the querent's own text.
 */
function logFailure(err: unknown): void {
  if (process.env.NODE_ENV === 'development') {
    console.error('[memory] chain recall failed', err);
  } else {
    console.error('[memory] chain recall failed', {
      name: err instanceof Error ? err.name : typeof err,
    });
  }
}
