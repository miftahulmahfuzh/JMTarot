/**
 * Fleet-wide sliding windows, with the per-instance ones underneath as the
 * failure mode.
 *
 * ── WHAT CHANGED, AND WHY THE OLD HEADER'S PRIMARY CONTROL IS GONE ──────────
 *
 * v0.2.0's version of this file said the primary control was "a hard spend cap
 * set in the z.ai dashboard". **THAT SENTENCE IS FALSE AND WAS NEVER ACTED ON.**
 * `LLM_API_KEY` is a FIXED ANNUAL SUBSCRIPTION sold for coding, not a wallet.
 * Verified 2026-07-27 against z.ai's own FAQ: when the quota is spent you wait
 * for the next cycle and *"the system will not deduct from your account
 * balance"*. There is no bill to cap and no overflow to cap either.
 *
 * So the risk is not an invoice. **The risk is quota exhaustion, which is a
 * denial of service against the querent** -- and it is strictly worse than a
 * bill, because a bill announces itself and an empty quota just makes every
 * reading fail at 4pm on a Tuesday with nothing in any dashboard. There is one
 * provider configured, and readings, moderation, gists, day summaries,
 * frequency verdicts, translations and the persona all draw on the one key.
 *
 * The primary control is now three things, all of them code:
 *   1. THIS FILE, fleet-wide rather than per-instance -- it is load-bearing now
 *      rather than best-effort, which is what the fail-open rule below is about.
 *   2. `src/lib/llm/meter.ts`, a ceiling on model calls over a rolling window
 *      that mirrors the provider's own, in two tiers so deferred work is shed
 *      before a querent notices anything.
 *   3. `ratelimit.backend_degraded` and `llm.ceiling_reached`, because a control
 *      nobody can see firing is a control nobody tunes. Query 9 in
 *      `docs/analytics-queries.md`.
 *
 * ── THE FAIL-OPEN RULE. READ IT BEFORE CHANGING ANYTHING BELOW. ─────────────
 *
 * **WHEN REDIS IS UNREACHABLE, EVERY LIMITER FALLS BACK TO `memory.ts`. NEVER
 * TO UNLIMITED, AND NEVER TO A REFUSAL.**
 *
 * Fail-closed makes an Upstash outage a JMTarot outage, on a free tier with no
 * SLA. Fail-open-to-nothing makes the limiter decorative at the exact moment
 * something is already wrong. Falling back to the per-instance windows is never
 * worse than what v0.2.0 shipped -- which was considered acceptable then -- so
 * the degraded state has a floor rather than being a hole.
 *
 * **DO NOT USE `@upstash/ratelimit`'s BUILT-IN `timeout` OPTION.** It looks like
 * exactly this and is not: on expiry it returns `success: true`, i.e. fail-open
 * to unlimited. We race it ourselves. `index.test.ts` has a test named for this.
 *
 * ── THE KEY NAMESPACES ARE APPLIED HERE, NOT BY CALLERS ─────────────────────
 *
 * `hit(user.id)` and `hitRefusal(user.id)` are the SAME STRING. Under two Maps
 * that was fine; under one keyspace it is one counter, and a heavy reader would
 * be treated as somebody probing the blocklist. Prefixing in the facade is what
 * makes that unforgettable.
 */
import { track } from '@/lib/analytics/track';
import { memoryBackend, _memorySizes, _resetMemory } from './memory';
import { redisBackend, redisConfigured } from './redis';
import type { RateLimitBackend, RateLimitResult } from './types';

export type { RateLimitResult } from './types';

const HOUR_MS = 60 * 60 * 1000;

/** Unchanged from v0.2.0. The number, not the enforcement, is what was weak. */
const MAX_PER_WINDOW = 30;

/** Unchanged (W7-D13). Deliberately NOT a ban; T&C clause 8. */
const MAX_REFUSALS_PER_WINDOW = 5;

/**
 * The crowd ceiling. **RAISED FROM 400, AND THE RAISE IS NOT A LOOSENING.**
 *
 * 400 was 400 *per instance*, so the real fleet ceiling was 400 x however many
 * instances Vercel had warm -- unknowable, and larger under exactly the load it
 * was meant to catch. Making it fleet-wide at 400 would be a large, silent,
 * untested tightening on launch day. 1200/h is roughly the old number against
 * three warm instances, and the ceiling in `llm/meter.ts` -- which 1200/h cannot
 * reach without also tripping -- is now the real bound. This one is a BURST
 * guard.
 */
const globalMax = () => num('RATELIMIT_GLOBAL_HOURLY', 1200);

/**
 * The fleet-wide ceiling on views of ONE public share page, per hour.
 *
 * **HERE, RATHER THAN IN V7, SO V7 READS IT INSTEAD OF REINVENTING 3000.** V7's
 * own plan sized 3000 *per instance*; fleet-wide 3000 would 429 a genuinely
 * popular link, which reads to a stranger as "your friend sent me a broken
 * link". It is a DATABASE-READ guard and not a quota guard -- `/s/[slug]` makes
 * no model call at all -- so 10,000/h is the right order of magnitude: it still
 * bounds a scraper and it does not punish something going right.
 */
export const SHARE_VIEW_GLOBAL_MAX = 10_000;

/**
 * How long a limiter may take before we stop waiting and use memory.
 *
 * NOT a target, and **the derivation below is dead -- the NUMBER is kept because
 * it never depended on it.**
 *
 * This said: *"There is no Upstash Singapore region -- verified 2026-07-27, the
 * nearest is `ap-northeast-1` (Tokyo) -- so a warm round trip from a Vercel
 * Singapore function is ~80-120ms rather than the ~10-30ms a same-region one
 * would be. 1000ms is still ~8x that."* Both premises were false. Upstash HAS an
 * `ap-southeast-1` region (console, 2026-07-29), and the functions were not in
 * Singapore at all until 2026-08-19 -- they were in `iad1`, so the real round
 * trip was transpacific and the ~80-120ms figure was optimistic rather than
 * conservative.
 *
 * **1000ms survives all of that because it is a hung-fetch bound, not a
 * budget.** A ceiling set at ~8x a warm hop is set at ~30x an intra-region one,
 * and both are far below the point where waiting is worse than falling back to
 * memory. **Do not tighten it toward a measured hop**: the failure this bounds is
 * a limiter that does not answer, and the cost of guessing low is
 * `ratelimit.backend_degraded` on a healthy Redis -- every stated limit silently
 * multiplied by the number of warm instances. Guessing high costs one second on
 * a request that was already broken.
 */
const timeoutMs = () => num('RATELIMIT_TIMEOUT_MS', 1000);

function num(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/**
 * Budgets that are NOT worth a network round trip.
 *
 * **`events:` IS HERE ON PURPOSE AND IT IS NOT ONLY A COST DECISION.**
 * `/api/events` is the highest-volume caller in the app by an order of magnitude
 * -- `track.client.ts` flushes on a 2s debounce, at 20 buffered events, and on
 * the hide path -- and it is the lowest-value budget: the route always answers
 * 204, writes only names from a closed taxonomy, and never reads a user id from
 * the body. W4's route header says it plainly: there is nothing worth doing with
 * that endpoint. Putting it on Redis would let one browser tab dominate the
 * limiter's own command budget, which is the "a limiter that runs out of quota
 * is worse than no limiter" failure in its purest form.
 *
 * Set RATELIMIT_EVENTS_BACKEND=redis to move it, the day that stops being true.
 *
 * **READ LAZILY, LIKE `RATELIMIT_BACKEND` BELOW.** A module-scope const would
 * freeze the answer at import, which is fine in production -- the env does not
 * change under a running function -- and makes it untestable without
 * `vi.resetModules()` around every case.
 *
 * **IT MATCHES `read:events:` AS WELL AS `events:`, AND THAT IS NOT BELT AND
 * BRACES.** `hit()` applies its own `read:` prefix before `backendFor()` sees the
 * key, so the string arriving here is `read:events:<ip>`. The plan's §4 code
 * tests `startsWith('events:')` alone, which is FALSE against that -- it would
 * have put the app's highest-volume endpoint on Redis, the exact opposite of what
 * the paragraph above argues for. The bare form is kept in case a caller ever
 * reaches `peek('events:...')`, which takes no prefix.
 */
/**
 * ── `session-update:` JOINS `events:` ON MEMORY, AND IT IS A LATENCY FIX ─────
 *
 * `auth.ts`'s jwt `trigger === 'update'` branch spends one `hit()` before it
 * re-reads the row. Every caller of `refreshSession()` pays it, and one of them
 * is `POST /api/locale` -- **on the request path of a language switch**, so it
 * is a Redis round trip inserted between a database write and a database read,
 * both of which are already sequential and one of which may be waking a
 * suspended Neon compute.
 *
 * **THE DISTANCE HALF OF THIS ARGUMENT IS DEAD TWICE OVER, AND BOTH CORRECTIONS
 * ARE WORTH MORE THAN THE ORIGINAL CLAIM WAS.** This comment said the hop ran
 * `sin1` -> **TOKYO** because *"there is no Singapore region (verified
 * 2026-07-27)"*. Two things were wrong with that:
 *
 *   1. Upstash HAS an `ap-southeast-1` Singapore region -- console, 2026-07-29,
 *      and `CLAUDE.md` tells you to use it. **Do not reinstate Tokyo here**; the
 *      URL lives only in Vercel, so the console is the only instrument.
 *   2. The functions were not in `sin1` at all. They ran in `iad1` until
 *      2026-08-19 (`x-vercel-id: sin1::iad1::…`), so the hop was transpacific
 *      the whole time -- the exact cost this paragraph worried about, arrived at
 *      from the other direction.
 *
 * With both fixed the hop is intra-region and small. **The argument for memory
 * therefore rests entirely on the paragraph below, which never mentioned a
 * distance**; if you are tempted to move this budget, MEASURE it rather than
 * re-deriving a geography.
 *
 * The measured symptom this was written for: the switch appears to do nothing on
 * iPhone Safari. The client abandons at `SWITCH_DEADLINE_MS` (6s) and
 * deliberately does not refresh, so a slow round trip is indistinguishable from
 * a dead control. Warm from WSL the whole POST measured 1348ms -- **on the
 * `iad1` stack, so that number belongs to the old geography too.**
 *
 * **THE BUDGET LOSES NOTHING THAT MATTERS BY BEING PER-INSTANCE.** It exists so
 * an authenticated user cannot spin database reads by spamming
 * `POST /api/auth/session`; that is one user against one budget, and one user's
 * requests land mostly on one warm instance. Compare the fleet-wide budgets it
 * is NOT joining: `global` bounds a crowd of throwaway accounts and `llm:window`
 * mirrors a provider quota, and both are meaningless per-instance. This one is
 * not.
 *
 * It is also strictly better than the status quo under failure: when Upstash is
 * unreachable this key already falls back to `memory.ts`, so choosing memory
 * deliberately picks the path an outage picks anyway -- minus the second spent
 * discovering it.
 *
 * ── EACH BUDGET GETS ITS OWN SWITCH, WHICH THE OLD SHAPE COULD NOT DO ────────
 *
 * The previous body tested `RATELIMIT_EVENTS_BACKEND` FIRST and returned early,
 * so that one variable governed every memory-only budget. Adding a second key
 * under it would have meant `RATELIMIT_EVENTS_BACKEND=redis` silently moving the
 * session budget too -- one variable named after `events` deciding something
 * else. Dispatch on the key first, then consult that key's own variable.
 *
 * Only the exact string `redis` moves either, the same rule as
 * `RATELIMIT_BACKEND=memory`: a typo must not silently relocate a budget.
 *
 * Both key forms are matched for the reason the `events:` comment gives -- `hit()`
 * applies `read:` before `backendFor()` sees the key, so the string arriving here
 * is `read:session-update:<uid>`; the bare form is kept in case a caller ever
 * reaches `peek()`, which takes no prefix.
 */
function memoryOnly(key: string): boolean {
  if (key.startsWith('events:') || key.startsWith('read:events:')) {
    return process.env.RATELIMIT_EVENTS_BACKEND !== 'redis';
  }
  if (key.startsWith('session-update:') || key.startsWith('read:session-update:')) {
    return process.env.RATELIMIT_SESSION_BACKEND !== 'redis';
  }
  return false;
}

/**
 * Which backend a key uses.
 *
 * `RATELIMIT_BACKEND=memory` forces everything local -- for `npm run dev`
 * without an Upstash account, and as the 2am kill switch if the limiter itself
 * is the problem. Same shape as `MODERATION_CLASSIFIER_ENABLED`, and note the
 * defaulting rule is the OPPOSITE of `ANALYTICS_ENABLED`'s on purpose: there a
 * typo must over-collect, here a typo must not silently disable enforcement, so
 * only the exact string `memory` does anything.
 *
 * **WITH THE UPSTASH VARIABLES ABSENT, EVERY BUDGET IS PER-INSTANCE MEMORY.**
 * That is v0.2.0's behaviour, it is what `npm test` and a local `npm run dev`
 * get, and it is NOT what production should be -- `docs/DEPLOY-VERCEL.md` §2b
 * says so, because the failure is silent and the app looks perfectly healthy.
 */
let override: RateLimitBackend | null = null;

function backendFor(key: string): RateLimitBackend {
  if (override) return override;
  if (process.env.RATELIMIT_BACKEND === 'memory') return memoryBackend;
  if (!redisConfigured()) return memoryBackend;
  if (memoryOnly(key)) return memoryBackend;
  return redisBackend();
}

/**
 * Run one backend operation, and fall back to memory on ANY failure.
 *
 * Note what is NOT here: no retry. A limiter that retries turns one slow round
 * trip into two before answering, on the request path, during an incident. One
 * attempt, a short deadline, then the local answer.
 */
async function guarded(
  op: 'consume' | 'peek',
  key: string,
  max: number,
  windowMs: number,
  now: number,
): Promise<RateLimitResult> {
  const backend = backendFor(key);
  if (backend.name === 'memory') return memoryBackend[op](key, max, windowMs, now);

  try {
    return await withTimeout(backend[op](key, max, windowMs, now), timeoutMs());
  } catch (err) {
    degraded(key, err);
    return memoryBackend[op](key, max, windowMs, now);
  }
}

const TIMED_OUT = Symbol('ratelimit-timeout');

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const race = await Promise.race([
    p,
    new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), ms);
    }),
  ]);
  clearTimeout(timer);
  if (race === TIMED_OUT) throw new Error('timeout');
  return race as T;
}

/**
 * Announce the degradation -- at most once a minute, per instance.
 *
 * **THE THROTTLE IS NOT POLITENESS.** An Upstash outage means every request
 * degrades, and an unthrottled event here would push one analytics row per
 * request into the very `after()` batch that W4 built to keep analytics off the
 * request path. One a minute is enough to see it in query 9 and cheap enough
 * that the outage does not become a second outage.
 *
 * NEVER LOG THE ERROR OBJECT. Same rule as `flush.ts` and the moderation path:
 * a driver or fetch error can quote its request, and one of these keys is a
 * `users.id`. The KIND, and nothing else.
 *
 * **`track()` IS NOT AWAITED AND CANNOT BE.** It returns `void`, which is W4's
 * enforcement rather than a convention, and this is on the request path.
 */
let lastDegradedAt = 0;
const DEGRADE_NOTICE_MS = 60_000;

function degraded(key: string, err: unknown) {
  const now = Date.now();
  if (now - lastDegradedAt < DEGRADE_NOTICE_MS) return;
  lastDegradedAt = now;

  const reason = err instanceof Error && err.message === 'timeout' ? 'timeout' : 'error';
  // The PREFIX only. The rest of the key is a users.id or an IP, and this line
  // goes to a platform log.
  const surface = surfaceOf(key);
  console.warn(`[ratelimit] redis ${reason} on ${surface}; falling back to per-instance memory`);
  track('ratelimit.backend_degraded', { backend: 'redis', reason, surface });
}

/** The key's namespace, for an event prop. Never the key. */
function surfaceOf(key: string): string {
  const colon = key.indexOf(':');
  return colon === -1 ? key : key.slice(0, colon);
}

/**
 * One reading attempt by one user.
 *
 * **THE KEY IS `users.id`.** Not the Google sub, and not an IP: a household
 * behind one NAT is one address and three people, and a phone hopping cell
 * towers is one person and three addresses. Unchanged from v0.2.0.
 */
export function hit(
  key: string,
  now = Date.now(),
  max = MAX_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<RateLimitResult> {
  return guarded('consume', `read:${key}`, max, windowMs, now);
}

/**
 * The whole FLEET, ignoring who. **Read the constant's comment before retuning.**
 *
 * CALL IT ALONGSIDE `hit()`, NOT INSTEAD OF IT, and check both: the per-user
 * limit is what stops one person, and this is what stops a crowd.
 */
export function hitGlobal(
  now = Date.now(),
  max = globalMax(),
  windowMs = HOUR_MS,
): Promise<RateLimitResult> {
  return guarded('consume', 'global', max, windowMs, now);
}

/** One refusal by one user (W7-D13). Recorded AFTER the verdict. */
export function hitRefusal(
  key: string,
  now = Date.now(),
  max = MAX_REFUSALS_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<RateLimitResult> {
  return guarded('consume', `refuse:${key}`, max, windowMs, now);
}

/**
 * A budget consulted without being spent. The generalisation of
 * `refusalsExhausted()`, which is now written in terms of it.
 *
 * The model-call ceiling needs exactly this: deferred work asks "are we past the
 * soft line?" and must not burn a slot on the asking.
 *
 * **THE KEY IS PASSED THROUGH UNPREFIXED**, unlike the three above, because the
 * caller is naming a budget rather than a person -- `refusalsExhausted()` passes
 * `refuse:<id>` and the meter passes `llm:window`. A prefix here would have to be
 * a fourth namespace that means "whatever the caller meant", which is not a
 * namespace.
 */
export function peek(
  key: string,
  max: number,
  windowMs = HOUR_MS,
  now = Date.now(),
): Promise<RateLimitResult> {
  return guarded('peek', key, max, windowMs, now);
}

/**
 * `peek()`'s SYMMETRIC PARTNER: record against a budget the caller names itself.
 *
 * **WITHOUT THIS, A CALLER THAT NEEDS BOTH HALVES OF ONE BUDGET SILENTLY
 * ADDRESSES TWO DIFFERENT COUNTERS**, and the plan's §5 code does exactly that:
 * it peeks `llm:window` and consumes through `hit()`, which prefixes to
 * `read:llm:window`. The peek then reports zero used forever, so the soft tier
 * NEVER FIRES and the whole two-tier design is dead in a way no test of either
 * function alone would notice -- both work perfectly, on different keys.
 *
 * So: `hit`/`hitGlobal`/`hitRefusal` name a *subject* and get a namespace applied
 * for them; `consume`/`peek` name a *budget* and are passed through untouched.
 * Anything needing to both read and record must use the second pair. There is a
 * test asserting the two halves share a counter and that `hit()` does not join it.
 */
export function consume(
  key: string,
  max: number,
  windowMs = HOUR_MS,
  now = Date.now(),
): Promise<RateLimitResult> {
  return guarded('consume', key, max, windowMs, now);
}

/** Has this user used up their refusal budget? A READ, recording nothing. */
export async function refusalsExhausted(
  key: string,
  now = Date.now(),
  max = MAX_REFUSALS_PER_WINDOW,
  windowMs = HOUR_MS,
): Promise<{ ok: false; retryAfterSeconds: number } | null> {
  const r = await peek(`refuse:${key}`, max, windowMs, now);
  return r.ok ? null : r;
}

/** Test seams. `_setBackend(null)` restores selection by env. */
export function _reset() {
  _resetMemory();
  lastDegradedAt = 0;
}
export function _setBackend(b: RateLimitBackend | null) {
  override = b;
}
/**
 * **WHICH BACKEND IS ACTUALLY IN USE, FOR DIAGNOSTICS.**
 *
 * Not a test seam -- `/api/cron/sweep` reports it once a day, and that is the
 * only passive way anybody learns that production is running on per-instance
 * memory. **An UNCONFIGURED limiter never fires `ratelimit.backend_degraded`**:
 * it is not degraded, it simply never tries, so the one event built to make this
 * visible is silent in exactly the case that matters most. A missing
 * `UPSTASH_REDIS_REST_URL` in the dashboard looks identical to a healthy app.
 *
 * Keyed on a representative READING budget rather than a made-up string, because
 * `events:` deliberately answers `memory` and would be misleading here.
 */
export function activeBackend(): 'memory' | 'redis' {
  return backendFor('read:diagnostic').name;
}

/**
 * Test seam: which backend a key WOULD use, without making a call.
 *
 * `_setBackend` cannot test selection, because it overrides it. This is the only
 * way to assert that `read:events:` goes to memory while `read:<uid>` goes to
 * Redis -- which is a decision with an argument behind it, not an accident.
 */
export function _backendNameFor(key: string): 'memory' | 'redis' {
  return backendFor(key).name;
}
export function _sizes() {
  return _memorySizes();
}
