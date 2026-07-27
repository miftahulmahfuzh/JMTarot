/**
 * The per-instance sliding windows. **THIS IS NOT DEAD CODE AND IT IS NOT
 * LEGACY.** It is the fallback the whole design rests on: when Upstash is
 * unreachable, `index.ts` answers from here rather than failing open to
 * unlimited or closed to an outage. See `index.ts`'s header for the argument.
 *
 * Everything below is v0.2.0's implementation with the namespacing lifted out
 * and `peek` added. The eviction sweep is still TIME-guarded and not
 * SIZE-guarded, and the reason is still that the old `if (hits.size > 1000)`
 * form swept on every request forever once an instance crossed the line, and
 * freed nothing, because active keys are not expired.
 *
 * ── WHAT THE OLD HEADER SAID, AND WHICH HALF SURVIVES ────────────────────────
 *
 * The three-failure-modes analysis is kept below, because it is still exactly
 * right and is the best statement of the problem in this repository. **What is
 * deleted is its claim that the primary control is a hard spend cap at z.ai.**
 * There is no such setting on the plan `LLM_API_KEY` is actually on -- verified
 * 2026-07-27 -- and `index.ts`'s header carries the replacement.
 *
 * Its second claim, that the upgrade trigger is *"the day a link to the app is
 * posted anywhere public"*, **fired and was acted on**: V7 is that day by
 * construction and V9 did the swap before it shipped. Recorded rather than
 * deleted, because a future session finding no trace of the trigger would wonder
 * whether it was ever taken seriously.
 *
 * ── THE THREE FAILURE MODES (W7 §6.7) ───────────────────────────────────────
 *
 * The oldest version of this header said the real protection was the login gate,
 * and that sentence was already false: Google sign-in makes the gate a free
 * Gmail address.
 *
 *   1. **One person holding the button down.** Handled -- and as of V9 handled
 *      exactly rather than approximately, because the ceiling is no longer
 *      `30 x instances`.
 *
 *   2. **The key space is unbounded.** Anyone with a Google account is a user.
 *      Fifty throwaway accounts get fifty independent budgets and the per-user
 *      limiter does nothing at all. `hitGlobal()` converted "unbounded from N
 *      accounts" into "bounded per instance" -- a different shape of problem,
 *      not a solved one. `llm/meter.ts` is what finally bounds it, by counting
 *      model calls rather than requests.
 *
 *   3. **The eviction loop degraded.** `if (hits.size > 1000)` triggered an O(n)
 *      walk that only deleted fully-expired keys. With two users it never fired.
 *      With more than a thousand ACTIVE users in one instance's lifetime it
 *      would fire on every single insert and free nothing. Now time-guarded, and
 *      `memory.test.ts` has a test named for the regression.
 *
 * **AND EACH READING IS NOW TWO MODEL CALLS, NOT ONE** -- the classifier runs
 * alongside the reading (W7 D8). By v0.3.0 one visit can be six, which is why
 * the ceiling in `meter.ts` counts calls and not readings.
 *
 * ── ONE MAP, NOT THREE ──────────────────────────────────────────────────────
 *
 * v0.2.0 held `hits`, `refusals` and `globalHits` separately, and that WAS the
 * namespacing: two budgets could pass the same `users.id` and not collide
 * because they landed in different maps. Under one shared Redis keyspace that
 * accident stops working, so the prefixes became explicit and live in
 * `index.ts`. This file therefore keeps ONE map, keyed by the already-prefixed
 * key -- which is what makes the two backends interchangeable rather than
 * merely similar.
 */
import type { RateLimitBackend } from './types';

const windows = new Map<string, number[]>();

/**
 * The eviction sweep runs at most this often, rather than on every insert past a
 * size threshold. Four lines, and it removes an O(n)-per-request regression that
 * arrives the week the app gets a thousand users.
 */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

/** Seconds until the oldest hit in the window falls out of it. Never zero. */
function retryAfter(recent: number[], now: number, windowMs: number): number {
  return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
}

/**
 * Drop keys whose every timestamp has expired.
 *
 * **TIME-GUARDED, NOT SIZE-GUARDED.** The old form swept whenever the map
 * exceeded 1000 entries, which means that once a busy instance is ABOVE that
 * line it sweeps on every request forever -- and frees nothing, because the keys
 * are active. Once a minute is enough for a map whose entries expire after an
 * hour.
 */
function sweep(now: number, windowMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;

  const cutoff = now - windowMs;
  for (const [k, times] of windows) {
    if (times.every((t) => t <= cutoff)) windows.delete(k);
  }
}

/** The timestamps still inside the window, oldest first. Does not mutate. */
function recentFor(key: string, now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  return (windows.get(key) ?? []).filter((t) => t > cutoff);
}

/**
 * The backend. `consume` is v0.2.0's `record`; `peek` is `consume` without the
 * `push`, which is the entire difference and is why W7's `refusalsExhausted()`
 * can be rewritten in terms of it rather than reimplementing the arithmetic.
 *
 * Both are `async` only to satisfy `RateLimitBackend`. Nothing here awaits
 * anything, and that is the point: this is the answer that is available when the
 * network one is not.
 */
export const memoryBackend: RateLimitBackend = {
  name: 'memory',

  async consume(key, max, windowMs, now) {
    sweep(now, windowMs);
    const recent = recentFor(key, now, windowMs);

    if (recent.length >= max) {
      // Store the pruned list even on rejection, so the window keeps sliding.
      windows.set(key, recent);
      return { ok: false, retryAfterSeconds: retryAfter(recent, now, windowMs) };
    }

    recent.push(now);
    windows.set(key, recent);
    return { ok: true, remaining: max - recent.length };
  },

  async peek(key, max, windowMs, now) {
    /*
     * **A READ THAT WRITES NOTHING -- INCLUDING NOT WRITING BACK THE PRUNED
     * LIST.** Storing it would be harmless here and is deliberately not done
     * anyway: the Redis backend's `getRemaining()` genuinely cannot mutate, and
     * two backends behind one interface have to mean the same thing or the
     * fallback in `index.ts` changes behaviour as well as latency.
     */
    const recent = recentFor(key, now, windowMs);
    if (recent.length < max) return { ok: true, remaining: max - recent.length };
    return { ok: false, retryAfterSeconds: retryAfter(recent, now, windowMs) };
  },
};

/** Test seam. */
export function _resetMemory() {
  windows.clear();
  lastSweep = 0;
}

/**
 * Test seam: the map size, for the eviction tests.
 *
 * One number where v0.2.0 returned three (`users`, `refusals`, `global`),
 * because there is now one map. The eviction tests assert the same 50-then-1 they
 * always did.
 */
export function _memorySizes() {
  return { keys: windows.size };
}
