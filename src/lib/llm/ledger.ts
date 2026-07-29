/**
 * The ledger's sink. One function every call site reaches, and it never throws.
 *
 * A2, v0.5.0. `llm_calls` is the fact table this release exists for; this file is the
 * only way a row gets into it, and the whole design question was **where the write
 * runs**, not what it writes.
 *
 * ── NOT `server-only`, AND THAT IS DELIBERATE ────────────────────────────────
 *
 * `index.ts` above it already carries the marker, and every path that reaches this
 * file goes through `getProvider()`. Adding it here would make the unit tests for
 * `usageOrNulls` and the three sink branches impossible, and those three branches are
 * exactly what needs a test -- `flush.ts` makes the same trade for the same reason.
 *
 * ── NO LEDGER WRITE IS ON THE PATH OF A BYTE THE USER IS WAITING FOR ─────────
 *
 * A-D6, in the roadmap's words, and the acceptance test is W4's verbatim: **stop the
 * database and take a reading** -- it must stream and complete exactly as normal with
 * nothing in the log but `[analytics]` lines. So `recordCall` resolves immediately on
 * both scheduled paths and buffers the row onto the request's existing single
 * `after()`. The moderation classifier is the sharpest case: it is the one call whose
 * p95 budget is the reason `MODERATION_MODEL` exists at all, and awaiting an insert
 * there would put a database round trip in front of every reading.
 *
 * ── THE ONE BRANCH THAT DOES I/O IN ITS CALLER'S `await`, AND WHY IT IS SAFE ──
 *
 * Three branches, in order:
 *
 *   1. **Inside a `withAnalytics` scope** -> push onto `store.calls`, return. The
 *      request's one `after()` flushes it. This is every route in the app.
 *   2. **Outside a scope, but `after()` is available** -> a bare `after()` with an
 *      assembled context. A server component or a route with no wrapper.
 *   3. **Outside a scope AND `after()` throws** -> await the insert.
 *
 * Branch 3 is reachable only from inside another `after()` callback or from a script
 * -- `after()` throws `` `after` was called outside a request scope `` exactly where
 * there is no request left to delay. So the one branch that performs I/O in its
 * caller's `await` is provably not on a request path. It exists because the
 * alternative is losing the row, and a script that makes real model calls is where
 * `probe-moderation` lives.
 *
 * ── AND IT IS NEVER `defer()`. THIS IS THE PART THAT LOSES A THIRD OF THE ROWS ─
 *
 * `track.ts`'s `drain()` does `store.deferred.splice(0)` and iterates the removed
 * copy, so **a `defer()` called from inside a deferred job pushes onto an array
 * nothing drains again** -- and `ensureRegistered` returns early, so no second
 * `after()` is registered either. The job is orphaned, silently, with a green suite.
 *
 * `gist`, `translation_repair` and the `frequency` regeneration all run inside that
 * loop. **Three of nine ops would have recorded nothing** -- the same shape as V2's
 * lost translation events, which went unnoticed for as long as V2 had shipped.
 * Reconciliation R17 verified it and ruled: the ledger rides its own `store.calls`
 * buffer, spliced and flushed **after** the deferred loop, exactly as `track()`'s own
 * event buffer already is. **A2 does not make `defer()` re-entrant** -- that is a W4
 * change with its own blast radius, and `docs/workstream-notes.md` records the
 * orphaning under W4 as a live trap for the next person to hit it.
 */
import { bufferCall } from '@/lib/analytics/track';
import type { CallClass, LLMOp, ReadingUsage } from './types';

/**
 * How long anything here will wait for a stream's `usage` before recording nulls.
 *
 * **THE SAME NUMBER AS `tee.ts`'s `USAGE_TIMEOUT_MS`, and it is exported so there is
 * ONE of it.** `tee.ts` keeps its own copy private and A2 may not edit that file
 * (reconciliation R2), so the two are equal by intent rather than by import; if one
 * moves, move both.
 *
 * The interface guarantees `usage` always settles and both adapters honour it. This is
 * the belt: **a ledger row with null tokens is a fact; a request held open for a token
 * count is a bug.**
 */
export const USAGE_TIMEOUT_MS = 2000;

/**
 * What a ledger row looks like before the request's context is folded in.
 *
 * `user_id`, `locale` and `local_date` are deliberately absent: they come from
 * `AnalyticsContext` at flush time (A2-D3), which is what makes A-D5's *"no caller
 * edits beyond passing `op`"* literally true, and what keeps `local_date` the
 * querent's own calendar day rather than something recomputed from `created_at`.
 */
export type LlmCallRecord = {
  op: LLMOp;
  /** The RESOLVED model string, never an env var name. */
  model: string;
  callClass: CallClass;
  streamed: boolean;
  status: 'ok' | 'partial' | 'failed' | 'aborted';
  /** `classifyStreamError()`'s output. Never a message, never a driver error. */
  errorKind: string | null;
  /** NULL, never 0, when the provider reported nothing. */
  inputTokens: number | null;
  outputTokens: number | null;
  /** The CALL's wall time, not the request's. */
  totalMs: number | null;
  /** `op: 'reading'` and `op: 'gist'` only. */
  readingId?: string | null;
};

/**
 * Record one model call. **NEVER THROWS, and never delays a byte.**
 *
 * `void recordCall(row)` at the call sites: like `track()`, there is nothing useful
 * to do with the promise, and the three branches above mean awaiting it is either a
 * no-op or the one case where the caller is already off the request path.
 *
 * ── NOT `async`, AND THE BUFFER PUSH IS SYNCHRONOUS. THIS IS LOAD-BEARING ──────
 *
 * The first version was `async` and reached `track.ts` through a **dynamic** import,
 * copying `flush.ts`'s pattern one level up. It worked and it was wrong, in a way the
 * first assertion of `metered.test.ts` caught immediately: with `void recordCall(row)`
 * at the call site, nothing awaits the returned promise, so the row was not in the
 * buffer until a microtask after the call returned.
 *
 * In a unit test that is a missing row. **In production it is a race against
 * `after()`**: `bufferCall` is what calls `ensureRegistered`, so on a request whose
 * only analytics is a ledger row, the `after()` that drains the buffer would be
 * registered from a continuation rather than from the handler -- which is precisely
 * the shape V2 paid for, where a late `after()` throws `` `after` was called outside a
 * request scope ``. A microtask would almost always win that race. Almost always is
 * not a contract.
 *
 * So the import is STATIC and the push is synchronous. The cost is that `ledger.ts`
 * now pulls `node:async_hooks` and `next/server` transitively -- acceptable, because
 * `index.ts` above it is already `server-only` and `ledger.test.ts` tests only the two
 * helpers below, which need none of it. There is no runtime cycle: `track.ts` ->
 * `flush.ts` -> `ledger.ts` is a **type-only** edge and is erased.
 */
export function recordCall(row: LlmCallRecord): Promise<void> {
  try {
    if (process.env.ANALYTICS_ENABLED === '0') return Promise.resolve();
    return bufferCall(row);
  } catch {
    /*
     * A LEDGER THAT CAN FAIL A READING IS WORSE THAN NO LEDGER. Deliberately not
     * logged here: every branch inside `bufferCall` already logs through
     * `logAnalyticsFailure`, and a second line would say the same thing twice on the
     * one path (branch 3's insert) where it says anything at all.
     */
    return Promise.resolve();
  }
}

/**
 * Wait for a stream's `usage`, bounded, and never reject.
 *
 * The two hand-threaded streaming sites use this -- the day summary and the streamed
 * translation. `tee.ts` has its own private copy of the same function, which A2 may
 * not touch (R2).
 *
 * **SNAPSHOT MUTABLE STATE BEFORE CALLING THIS.** `tee.ts`'s `finish()` read its
 * fields *after* `await source.usage`, by which time a client cancel had made the
 * next `enqueue` throw and the catch had overwritten `errorKind` with `'unknown'` --
 * so **every abandoned reading was recorded as failing for an unknown reason.** Any
 * new code that awaits `usage` and then reads state has that bug. Build the row
 * first; fill the two token fields last.
 */
export async function usageOrNulls(
  usage: Promise<ReadingUsage>,
  ms = USAGE_TIMEOUT_MS,
): Promise<ReadingUsage> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      usage,
      new Promise<ReadingUsage>((resolve) => {
        timer = setTimeout(() => resolve({ inputTokens: null, outputTokens: null }), ms);
      }),
    ]);
  } catch {
    // The interface says `usage` never rejects. If a provider breaks that, null
    // tokens are the right answer and an unhandled rejection is not.
    return { inputTokens: null, outputTokens: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The resolved model for a call, exactly as the adapters resolve it.
 *
 * **`'unknown'` RATHER THAN AN ENV VAR NAME, AND NEVER `'fallback'`.** A template
 * written by no model makes no call and therefore has no row, so `'fallback'` -- which
 * `readings.model` uses for the stub paths -- can never be correct here.
 *
 * **`||` AND NOT `??`, AND THAT IS MIRRORING `requireEnv` RATHER THAN BEING LOOSE.**
 * Both adapters resolve the model with `requireEnv('LLM_MODEL')`, whose test is
 * `!value` -- so an empty string is *absent* there and the call throws before a
 * provider is reached. `??` would let `LLM_MODEL=''` write `model: ''` into the
 * ledger, a row naming a model that cannot exist. In practice `'unknown'` is
 * unreachable for the same reason: a call with no model never happens. It is the
 * defensive answer, not an expected value, and if it ever shows up in the table it
 * means something reached this file without reaching a provider.
 */
export function resolvedModel(opts: { model?: string }): string {
  return opts.model || process.env.LLM_MODEL || 'unknown';
}
