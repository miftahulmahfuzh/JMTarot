/**
 * The ONLY file in this repository that names Upstash.
 *
 * Lazy, like `src/lib/db/client.ts`, and for the same reason: a client built at
 * module scope throws on import when the env is absent, which is `npm test`,
 * `npm run dev` without an account, and every script under `scripts/`. It would
 * also make `redisConfigured()` unreachable, since the throw happens on import.
 *
 * **ONE `Ratelimit` PER (max, window) PAIR, AND THE PREFIX CARRIES BOTH.**
 * `hit()` takes max and window per call, and `@upstash/ratelimit` binds them at
 * construction. Without the numbers in the prefix, `hit(k, now, 30, HOUR)` and
 * `hit(k, now, 5, HOUR)` would share a counter -- which is the same class of bug
 * the namespacing in `index.ts` fixes, one layer down.
 *
 * `analytics: false`: Upstash's own analytics writes a second sorted set per
 * call. We have `events` and query 9; paying twice for the same fact out of a
 * command budget we are already reasoning carefully about is not worth it. It
 * also keeps `RatelimitResponse.pending` a resolved promise, so there is nothing
 * to hand to `waitUntil` -- if analytics is ever turned on, that changes.
 *
 * `ephemeralCache` IS THE FLOOD ABSORBER AND IS NOT AN OPTIMISATION. Once an
 * identifier is blocked it is rejected from this Map with ZERO Redis commands
 * until its reset. Without it, an attack scales the limiter's own command
 * consumption linearly with the attack -- "a limiter that runs out of its own
 * quota is worse than no limiter", exactly. It is created at module scope
 * deliberately: the package's own docs note the automatic one only works if it
 * outlives the handler.
 *
 * ── `timeout: 0`. DO NOT DELETE THIS LINE. ──────────────────────────────────
 *
 * **THE PLAN SAID TO LEAVE `timeout` UNSET AND THAT WOULD HAVE BEEN WRONG.**
 * Read out of the installed package (`dist/index.mjs`):
 *
 *     this.timeout = config.timeout ?? 5e3;
 *     ...
 *     if (this.timeout > 0) { ... resolve({ success: true, ..., reason: "timeout" }) }
 *
 * So the option is **on by default at five seconds**, and what it does on expiry
 * is return `success: true` -- FAIL-OPEN TO UNLIMITED, which is the one outcome
 * §3 of the plan rules out. "Unset" is not neutral here; it is the bad setting.
 *
 * `index.ts` races the call itself at `RATELIMIT_TIMEOUT_MS` (1000ms) and falls
 * back to the in-memory limiter, so ours would normally win the race anyway --
 * but only while that value stays under five seconds. Raising it to 6000 one
 * afternoon would silently hand every slow request an unlimited pass. Setting
 * `timeout: 0` removes the trapdoor rather than out-running it.
 *
 * **AND `toResult` REFUSES A `reason: 'timeout'` RESPONSE ANYWAY**, as a second
 * independent guard: if a future edit reinstates the option, the response is
 * treated as a failure and lands on the memory backend instead of passing. Two
 * places, because the invariant is worth more than the line count.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import type { RateLimitBackend, RateLimitResult } from './types';

export function redisConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

let client: Redis | null = null;
const ephemeralCache = new Map<string, number>();
const limiters = new Map<string, Ratelimit>();

function redis(): Redis {
  client ??= new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
  return client;
}

function limiterFor(max: number, windowMs: number): Ratelimit {
  const seconds = Math.max(1, Math.ceil(windowMs / 1000));
  const id = `${max}:${seconds}`;
  let l = limiters.get(id);
  if (!l) {
    l = new Ratelimit({
      redis: redis(),
      // `Duration` is `${number} ${Unit}` with Unit in ms|s|m|h|d -- verified
      // against the installed .d.mts, so seconds is the portable choice.
      limiter: Ratelimit.slidingWindow(max, `${seconds} s`),
      prefix: `jmt:rl:${id}`,
      analytics: false,
      ephemeralCache,
      // Read this file's header before touching it. 0 disables; unset is 5000.
      timeout: 0,
    });
    limiters.set(id, l);
  }
  return l;
}

/**
 * `reset` is a unix ms timestamp. Never zero seconds -- that is a retry loop.
 *
 * **THROWS ON `reason: 'timeout'`.** That response carries `success: true` with
 * `limit: 0, remaining: 0, reset: 0`, i.e. a pass that was never checked against
 * Redis. Throwing hands it to `guarded()`'s catch, which answers from the
 * in-memory limiter and fires `ratelimit.backend_degraded` -- the same treatment
 * as any other failure, which is what it is.
 */
export function _toResult(r: {
  success: boolean;
  remaining: number;
  reset: number;
  reason?: string;
}): RateLimitResult {
  if (r.reason === 'timeout') throw new Error('timeout');
  if (r.success) return { ok: true, remaining: r.remaining };
  return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
}

export function redisBackend(): RateLimitBackend {
  return {
    name: 'redis',
    async consume(key, max, windowMs) {
      // `now` is IGNORED: Redis uses its own clock, deliberately. See types.ts.
      return _toResult(await limiterFor(max, windowMs).limit(key));
    },
    async peek(key, max, windowMs) {
      /*
       * `getRemaining` runs the sliding window's OWN Lua script, and that script
       * is `GET currentKey` + `GET previousKey` and nothing else -- read out of
       * the package, not assumed. So this genuinely does not consume, which is
       * what lets `refusalsExhausted()` and the model-call ceiling ask their
       * question for free.
       *
       * Its `reset` is documented as the START OF THE NEXT WINDOW rather than an
       * exact expiry. That is fine for a `retryAfterSeconds` floored at 1, and it
       * is why this is not used to compute anything finer.
       */
      const r = await limiterFor(max, windowMs).getRemaining(key);
      return r.remaining > 0
        ? { ok: true, remaining: r.remaining }
        : { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((r.reset - Date.now()) / 1000)) };
    },
  };
}

/** Test seam: drop the memoised client and limiters between env stubs. */
export function _resetRedis() {
  client = null;
  limiters.clear();
  ephemeralCache.clear();
}

/** Test seam: the constructed limiter, so its `timeout` can be asserted. */
export function _limiterFor(max: number, windowMs: number): Ratelimit {
  return limiterFor(max, windowMs);
}
