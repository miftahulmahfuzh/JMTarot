/**
 * Sliding windows held in module scope.
 *
 * **BE CLEAR ABOUT WHAT THIS IS.** Serverless instances do not share memory and
 * cold starts reset the map, so a caller spread across instances gets more than
 * the limit. Best effort, not a guarantee.
 *
 * ---
 *
 * **THE OLD HEADER SAID THE REAL PROTECTION WAS THE LOGIN GATE, AND THAT
 * SENTENCE IS NOW FALSE.** It was written when JMTarot had two users who both
 * knew Miftah, and it read as reassuring. Google sign-in makes the gate a free
 * Gmail address. Three failure modes, and this file addresses one and a half of
 * them (W7 §6.7):
 *
 *   1. **One person holding the button down.** Handled. Per-instance memory
 *      means the true ceiling is `30 x instances`, and generating instances
 *      requires generating concurrency, so this is fine.
 *
 *   2. **The key space is unbounded.** Anyone with a Google account is a user.
 *      Fifty throwaway accounts get fifty independent budgets and the per-user
 *      limiter does nothing at all. `hitGlobal()` below converts "unbounded bill
 *      from N accounts" into "bounded per instance" -- a different shape of
 *      problem, not a solved one.
 *
 *   3. **The eviction loop degraded.** `if (hits.size > 1000)` triggered an O(n)
 *      walk that only deleted fully-expired keys. With two users it never fired.
 *      With more than a thousand ACTIVE users in one instance's lifetime it
 *      would fire on every single insert and free nothing. Now time-guarded.
 *
 * **AND EACH READING IS NOW TWO MODEL CALLS, NOT ONE** -- the classifier runs
 * alongside the reading (W7 D8) -- so the cost of an unbounded key space roughly
 * doubled at the same moment the key space became unbounded.
 *
 * **THE PRIMARY CONTROL IS NOT IN THIS FILE AND IS NOT CODE: a hard spend cap
 * set in the z.ai dashboard.** Nothing in this repo can bound the bill; a
 * provider-side cap can, absolutely. `docs/DEPLOY-VERCEL.md` lists it as a
 * required deployment step.
 *
 * **THE UPGRADE TRIGGER IS AN EVENT, NOT A NUMBER.** Swap `hit()`'s body for
 * `@upstash/ratelimit` on Redis **the day a link to the app is posted anywhere
 * public** -- not at a user count, not at a bill threshold. The moment the URL
 * is outside Miftah's control, per-instance memory stops being a defensible
 * answer. The interface is two functions precisely so that swap stays local.
 */

const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;

/**
 * The whole instance, across every user.
 *
 * Sized well above what one person can produce and well below what fifty
 * throwaway accounts would: 30 readings an hour is a heavy user, and 400 is
 * roughly thirteen of them at once on a single instance.
 */
const GLOBAL_MAX_PER_WINDOW = 400;

/**
 * The refusal sub-limit (W7-D13).
 *
 * **REFUSALS CONSUME BUDGET, AND GET A TIGHTER ONE OF THEIR OWN.** Without it
 * the refusal endpoint is a free oracle for mapping the blocklist: a Tier-A deny
 * costs the attacker nothing, answers in 24ms, and tells them whether a phrase
 * is on the list. Five in a window and the rest of the window is a 429.
 *
 * Deliberately NOT a ban. The gate is new and its false-positive rate is
 * unmeasured, so somebody who trips it five times by accident waits an hour
 * rather than losing an account (T&C clause 8: no automatic suspension).
 */
const MAX_REFUSALS_PER_WINDOW = 5;

const hits = new Map<string, number[]>();
const refusals = new Map<string, number[]>();
const globalHits: number[] = [];

/**
 * The eviction sweep runs at most this often, rather than on every insert past a
 * size threshold. Four lines, and it removes an O(n)-per-request regression that
 * arrives the week the app gets a thousand users.
 */
const SWEEP_INTERVAL_MS = 60_000;
let lastSweep = 0;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/** Seconds until the oldest hit in the window falls out of it. Never zero. */
function retryAfter(recent: number[], now: number, windowMs: number): number {
  return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
}

function record(
  map: Map<string, number[]>,
  key: string,
  now: number,
  max: number,
  windowMs: number,
): RateLimitResult {
  const cutoff = now - windowMs;
  const recent = (map.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= max) {
    // Store the pruned list even on rejection, so the window keeps sliding.
    map.set(key, recent);
    return { ok: false, retryAfterSeconds: retryAfter(recent, now, windowMs) };
  }

  recent.push(now);
  map.set(key, recent);
  return { ok: true, remaining: max - recent.length };
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
  for (const map of [hits, refusals]) {
    for (const [k, times] of map) {
      if (times.every((t) => t <= cutoff)) map.delete(k);
    }
  }
}

/**
 * One reading attempt by one user.
 *
 * **THE KEY IS `users.id`.** Not the Google sub, and no longer a username --
 * everything else in this system joins on `users.id`, and a second identity for
 * one purpose is a bug waiting to be written. Not an IP either: a household
 * behind one NAT is one address and three people, and a phone hopping cell
 * towers is one person and three addresses.
 */
export function hit(
  key: string,
  now = Date.now(),
  max = MAX_PER_WINDOW,
  windowMs = WINDOW_MS,
): RateLimitResult {
  sweep(now, windowMs);
  return record(hits, key, now, max, windowMs);
}

/**
 * The whole instance, ignoring who.
 *
 * Still per-instance and still best-effort. What it buys is that N throwaway
 * accounts on one instance share one ceiling instead of getting N of them, which
 * is the difference between an unbounded bill and a bounded one.
 *
 * **CALL IT ALONGSIDE `hit()`, NOT INSTEAD OF IT**, and check both: the
 * per-user limit is what stops one person, and this is what stops a crowd.
 */
export function hitGlobal(
  now = Date.now(),
  max = GLOBAL_MAX_PER_WINDOW,
  windowMs = WINDOW_MS,
): RateLimitResult {
  const cutoff = now - windowMs;
  while (globalHits.length > 0 && globalHits[0] <= cutoff) globalHits.shift();

  if (globalHits.length >= max) {
    return { ok: false, retryAfterSeconds: retryAfter(globalHits, now, windowMs) };
  }

  globalHits.push(now);
  return { ok: true, remaining: max - globalHits.length };
}

/**
 * One refusal by one user (W7-D13).
 *
 * Recorded AFTER the verdict, so a refused request consumes both this and the
 * ordinary `hit()` budget. Returning `ok: false` means the user has been refused
 * enough times this hour that further questions are declined outright -- which
 * also means a user probing the blocklist stops being able to probe.
 */
export function hitRefusal(
  key: string,
  now = Date.now(),
  max = MAX_REFUSALS_PER_WINDOW,
  windowMs = WINDOW_MS,
): RateLimitResult {
  return record(refusals, key, now, max, windowMs);
}

/**
 * Has this user used up their refusal budget? A READ, recording nothing.
 *
 * The entry gate needs to know before the request runs, and `hitRefusal()`
 * records -- calling it to ask the question would consume the budget it is
 * asking about, so every request would count as a refusal.
 */
export function refusalsExhausted(
  key: string,
  now = Date.now(),
  max = MAX_REFUSALS_PER_WINDOW,
  windowMs = WINDOW_MS,
): { ok: false; retryAfterSeconds: number } | null {
  const cutoff = now - windowMs;
  const recent = (refusals.get(key) ?? []).filter((t) => t > cutoff);
  if (recent.length < max) return null;
  return { ok: false, retryAfterSeconds: retryAfter(recent, now, windowMs) };
}

/** Test seam. */
export function _reset() {
  hits.clear();
  refusals.clear();
  globalHits.length = 0;
  lastSweep = 0;
}

/** Test seam: the map sizes, for the eviction tests. */
export function _sizes() {
  return { users: hits.size, refusals: refusals.size, global: globalHits.length };
}
