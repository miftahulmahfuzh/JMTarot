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
import type { Locale } from '@/data/types';
import { defer } from '@/lib/analytics/track';
import type { RecalledReading } from '@/lib/db/queries/history';
import type { DbOrTx } from '@/lib/db/types';
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
  /**
   * The language THIS reading is being written in (V2 / T12).
   *
   * A recalled gist may be in the other one, and the block quotes it verbatim. Where
   * a translation already exists it is preferred; where it does not, the original is
   * used and one is scheduled off the request path. See `withTranslatedGists`.
   */
  locale: Locale;
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

    /*
     * AFTER THE GATE, so nothing is looked up for a block that is not going to be
     * rendered. The gate rejects most recalls, and this is one more query.
     */
    const translated = await withTranslatedGists(db, recalled, args.locale);

    return { recalled: translated, repeatCardIds: gate.repeatCardIds, reason: gate.reason };
  } catch (err) {
    logFailure(err);
    return null;
  }
}

/**
 * Swap in a cached translation for any recalled gist that is in another language,
 * and schedule the ones that are missing (V2 / T12).
 *
 * ── IT NEVER WAITS ON A MODEL CALL, AND THAT IS THE WHOLE DESIGN ─────────────
 *
 * The gist is PROMPT INPUT, not screen output. Translating it inline would put a
 * model call in front of a byte the querent is waiting for, which roadmap §6 forbids
 * outright — so this reads the cache (one `in` over at most `MEMORY_CHAIN_COUNT`
 * ids, which is 2, served by `translations_entity_lookup_idx`) and `defer()`s the
 * generation into the reading's existing `after()`.
 *
 * WHERE NOTHING EXISTS THE ORIGINAL IS USED, and the base contract already covers
 * it: *"Write in ENGLISH even if the text you are reading is written in another
 * language."* That rule exists for exactly this, which is why the whole path is
 * opportunistic rather than blocking — and it is also why the plan's open question 4
 * asks whether it is worth keeping at all. `translation.generated` with
 * `field: 'gist'` is how that gets answered.
 *
 * NEVER THROWS, like everything else in this file. It is called inside `recallChain`'s
 * `try`, and a failure here loses the substitution rather than the reading.
 */
async function withTranslatedGists(
  db: DbOrTx,
  recalled: RecalledReading[],
  target: Locale,
): Promise<RecalledReading[]> {
  const foreign = recalled.filter((r) => r.locale !== target);
  if (foreign.length === 0) return recalled;

  const { gistTranslations } = await import('@/lib/db/queries/translations');
  const cached = await gistTranslations(
    db,
    foreign.map((r) => r.id),
    target,
  );

  for (const r of foreign) {
    if (cached.has(r.id)) continue;
    /*
     * `defer()` and never `await`. It runs in the reading's own `after()`, after the
     * last byte has reached the querent, and `translateOrCached` declares itself
     * `deferred` to the model-call ceiling for the gist field — so a quota running
     * low costs the NEXT chained reading a little specificity and costs this one
     * nothing.
     *
     * `sourceUpdatedAt` is the reading's own `created_at`, which the caller does not
     * have here — but `readings` is immutable (VD7), so a gist translation can never
     * go stale and the epoch is a correct and permanent comparand. Passing `new
     * Date()` instead would make every cached row look stale on the next read and
     * turn this into one model call per reading, forever.
     */
    defer(async () => {
      const { translateOrCached } = await import('@/lib/translate/translate');
      await translateOrCached({
        entity: 'reading',
        entityId: r.id,
        field: 'gist',
        source: r.gist,
        sourceLocale: r.locale,
        sourceUpdatedAt: new Date(0),
        target,
        readerId: null,
        serviceId: null,
      });
    });
  }

  return recalled.map((r) => {
    const swap = cached.get(r.id);
    return swap ? { ...r, gist: swap } : r;
  });
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
