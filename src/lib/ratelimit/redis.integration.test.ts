import { config } from 'dotenv';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

config({ path: '.env.local', quiet: true });

/**
 * The Redis backend, against a REAL REST-protocol server.
 *
 * `serverless-redis-http` in `docker-compose.yml` speaks Upstash's REST protocol
 * against a real Redis, so this exercises **the actual Lua sliding window** and
 * not a mock of it. That matters because the only property worth testing here is
 * atomicity across two callers, and a mock cannot have it or fail to have it.
 *
 * VERIFIED 2026-07-27 that SRH implements `EVAL` well enough: five `limit()`
 * calls against a limit of 3 returned true/true/true/false/false with a real
 * `reset` timestamp, the fifth carrying `reason: 'cacheBlock'` from the
 * in-process cache, and `getRemaining` returned `{remaining, reset, limit}`. So
 * the plan's fallback -- gate this on a real Upstash development database
 * instead -- is not needed.
 *
 * **SKIPPED WHEN THE VARIABLE IS ABSENT**, so `npm run test:integration` still
 * passes for somebody who only ran `db:up` on an older compose file. A skipped
 * suite is visible in the output; a failing one for a missing optional service
 * teaches people to ignore red.
 *
 * NO TRANSACTION TO ROLL BACK -- the one place this suite differs from the
 * Postgres one. Isolation comes from a unique key per test instead.
 */
const url = process.env.TEST_UPSTASH_REDIS_REST_URL;
const token = process.env.TEST_UPSTASH_REDIS_REST_TOKEN;

const HOUR = 60 * 60 * 1000;

/** A key nothing else will touch, in this run or the last one. */
let n = 0;
const uniqueKey = () => `it:${process.pid}:${Date.now()}:${n++}`;

describe.skipIf(!url)('the redis backend, against a real REST server', () => {
  beforeEach(() => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', url!);
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', token!);
  });

  afterEach(async () => {
    const { _resetRedis } = await import('./redis');
    _resetRedis();
    vi.unstubAllEnvs();
  });

  it('allows up to the limit and then rejects', async () => {
    const { redisBackend } = await import('./redis');
    const backend = redisBackend();
    const key = uniqueKey();

    for (let i = 0; i < 3; i++) {
      expect((await backend.consume(key, 3, HOUR, Date.now())).ok).toBe(true);
    }
    expect((await backend.consume(key, 3, HOUR, Date.now())).ok).toBe(false);
  });

  it('TWO "INSTANCES" SHARE ONE COUNTER -- THE WHOLE POINT OF V9', async () => {
    /*
     * **THIS IS THE ASSERTION THE WORKSTREAM EXISTS FOR.** Under v0.2.0's
     * per-instance memory the same two calls would each see an empty window, so a
     * limit of 2 was really "2 times however many instances Vercel had warm" --
     * unknowable, and largest under exactly the load it was meant to catch.
     *
     * `_resetRedis()` between the two halves is what makes them two instances:
     * it drops the memoised client, the per-(max,window) limiters AND the
     * `ephemeralCache`, which is precisely the process-local state a cold
     * serverless instance would not have. The Redis behind them is the same.
     */
    const key = uniqueKey();

    const first = (await import('./redis')).redisBackend();
    expect((await first.consume(key, 2, HOUR, Date.now())).ok).toBe(true);
    expect((await first.consume(key, 2, HOUR, Date.now())).ok).toBe(true);

    const { _resetRedis, redisBackend } = await import('./redis');
    _resetRedis();

    const second = redisBackend();
    expect((await second.consume(key, 2, HOUR, Date.now())).ok).toBe(false);
  });

  it('peek does not consume', async () => {
    const { redisBackend } = await import('./redis');
    const backend = redisBackend();
    const key = uniqueKey();

    await backend.consume(key, 5, HOUR, Date.now());
    for (let i = 0; i < 5; i++) {
      expect(await backend.peek(key, 5, HOUR, Date.now())).toEqual({ ok: true, remaining: 4 });
    }
    // And the budget really is untouched: four more consumes must all pass.
    for (let i = 0; i < 4; i++) {
      expect((await backend.consume(key, 5, HOUR, Date.now())).ok).toBe(true);
    }
  });

  it('reports a retry-after that is never zero', async () => {
    // A zero would tell the client to retry immediately, into another 429. The
    // sliding window's `reset` is the start of the NEXT window, so this also
    // covers the case where that timestamp has already passed.
    const { redisBackend } = await import('./redis');
    const backend = redisBackend();
    const key = uniqueKey();

    await backend.consume(key, 1, HOUR, Date.now());
    const refused = await backend.consume(key, 1, HOUR, Date.now());
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('keeps different (max, window) budgets apart', async () => {
    /*
     * `@upstash/ratelimit` binds max and window at construction, so without both
     * in the prefix a 30/hour budget and a 5/hour budget on the same identifier
     * would share one counter -- the namespace collision from `index.ts`, one
     * layer down and invisible from the facade's own tests.
     */
    const { redisBackend } = await import('./redis');
    const backend = redisBackend();
    const key = uniqueKey();

    await backend.consume(key, 1, HOUR, Date.now());
    expect((await backend.consume(key, 1, HOUR, Date.now())).ok).toBe(false);
    // A different budget, same identifier: untouched.
    expect((await backend.consume(key, 10, HOUR, Date.now())).ok).toBe(true);
  });

  it('the facade routes a real key to redis and still falls back on nonsense', async () => {
    /*
     * End to end through `index.ts`, because everything above tests the backend in
     * isolation and the thing that actually ships is the facade's choice of it.
     * Then the same key with the URL pointed at a closed port must NOT refuse --
     * it must answer from memory. That is §3's rule, against a real socket error
     * rather than a rejected fake.
     */
    const { _reset, _setBackend, hit } = await import('./index');
    _setBackend(null);
    _reset();

    const key = uniqueKey();
    expect((await hit(key, Date.now(), 2, HOUR)).ok).toBe(true);

    const { _resetRedis } = await import('./redis');
    _resetRedis();
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'http://127.0.0.1:1');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const degraded = await hit(key, Date.now(), 2, HOUR);
    expect(degraded.ok).toBe(true); // fell back, did not refuse
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
