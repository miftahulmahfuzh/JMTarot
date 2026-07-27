/**
 * The two shapes everything else in this directory is written against.
 *
 * LEAF MODULE. NO IMPORTS, DELIBERATELY, and not merely as tidiness: `index.ts`
 * imports both backends and `redis.ts` pulls in the vendor SDK, so a type
 * imported from either of those would drag `@upstash/redis` into anything that
 * wanted to name a `RateLimitResult` -- including, eventually, a client
 * component. Same reasoning as `src/lib/db/types.ts` and `src/data/types.ts`.
 * `types.test.ts` fences it.
 */

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

/**
 * One budget, consulted or consumed.
 *
 * `consume` records; `peek` does not. That asymmetry is the whole reason W7's
 * `refusalsExhausted()` exists as a separate function, and it is lifted into
 * the interface here so both backends have to implement it rather than one of
 * them faking it with a consume-and-refund.
 *
 * `now` IS HONOURED BY THE MEMORY BACKEND AND IGNORED BY REDIS, which uses the
 * server's clock. Do not "fix" that by sending `now` over the wire, which would
 * let a caller with a wrong clock -- or a caller choosing one -- move their own
 * window. The consequence for tests is that **a test which pins time is a test
 * of the memory backend only**; the Redis backend is covered by the integration
 * suite against a real server and by unit tests against a fake `Ratelimit`.
 */
export interface RateLimitBackend {
  readonly name: 'memory' | 'redis';
  consume(key: string, max: number, windowMs: number, now: number): Promise<RateLimitResult>;
  peek(key: string, max: number, windowMs: number, now: number): Promise<RateLimitResult>;
}
