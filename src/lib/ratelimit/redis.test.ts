import { afterEach, describe, expect, it, vi } from 'vitest';
import { _limiterFor, _resetRedis, _toResult, redisConfigured } from './redis';

afterEach(() => {
  _resetRedis();
  vi.unstubAllEnvs();
});

const configured = () => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
};

describe('configuration', () => {
  it('constructs nothing at module scope', async () => {
    /*
     * A `new Redis(...)` at module scope throws when the env vars are absent --
     * which is `npm test`, `npm run dev` without an account, and every script. It
     * would also make `redisConfigured()` unreachable, since the throw happens on
     * import. Same discipline as `src/lib/db/client.ts`'s lazy singleton.
     *
     * That this file imported at all, with the env blank, IS the assertion.
     */
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    const mod = await import('./redis');
    expect(mod.redisConfigured()).toBe(false);
  });

  it('needs both variables, not either', () => {
    // Half-configured is a misconfiguration, and the honest response is to run on
    // memory rather than to construct a client that will fail every call.
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(redisConfigured()).toBe(false);
  });

  it('is configured when both are set', () => {
    configured();
    expect(redisConfigured()).toBe(true);
  });
});

describe('the limiter instance', () => {
  it('SETS timeout TO 0, because unset means fail-open to UNLIMITED', () => {
    /*
     * **THE MOST IMPORTANT ASSERTION IN THIS FILE.** The plan said to leave
     * `timeout` unset. Read out of the installed package:
     *
     *     this.timeout = config.timeout ?? 5e3;
     *     if (this.timeout > 0) { ... resolve({ success: true, reason: "timeout" }) }
     *
     * Unset is therefore ON, at five seconds, returning a PASS that was never
     * checked against Redis. `index.ts` races at 1000ms and would normally win --
     * but only while RATELIMIT_TIMEOUT_MS stays under five seconds, and raising it
     * would silently hand every slow request an unlimited pass.
     */
    configured();
    /*
     * The cast reaches a `protected` field, deliberately. It is the value the
     * package actually stored from our config, which is the fact worth asserting;
     * a source-level grep for the string `timeout: 0` would pass on a commented-out
     * line. There is no public accessor.
     */
    const stored = _limiterFor(30, 60 * 60 * 1000) as unknown as { timeout: number };
    expect(stored.timeout).toBe(0);
  });

  it('reuses one instance per (max, window) pair', () => {
    configured();
    expect(_limiterFor(30, 3_600_000)).toBe(_limiterFor(30, 3_600_000));
  });

  it('does NOT share an instance between different budgets', () => {
    /*
     * The prefix carries max and window, so `hit(k, now, 30, HOUR)` and
     * `hit(k, now, 5, HOUR)` cannot land in one counter. Same class of bug as the
     * namespace collision in `index.ts`, one layer down.
     */
    configured();
    expect(_limiterFor(30, 3_600_000)).not.toBe(_limiterFor(5, 3_600_000));
    expect(_limiterFor(30, 3_600_000)).not.toBe(_limiterFor(30, 60_000));
  });
});

describe('_toResult', () => {
  it('maps a pass to ok + remaining', () => {
    expect(_toResult({ success: true, remaining: 7, reset: 0 })).toEqual({ ok: true, remaining: 7 });
  });

  it('maps a refusal to a retry-after that is never zero', () => {
    // A zero would tell the client to retry immediately, into another 429.
    const r = _toResult({ success: false, remaining: 0, reset: Date.now() - 5000 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSeconds).toBe(1);
  });

  it('rounds a real reset up to whole seconds', () => {
    const r = _toResult({ success: false, remaining: 0, reset: Date.now() + 30_400 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSeconds).toBe(31);
  });

  it('THROWS on reason: timeout, rather than honouring its success: true', () => {
    /*
     * The second, independent guard on the same invariant as the `timeout: 0`
     * test above. That response is `{ success: true, limit: 0, remaining: 0,
     * reset: 0 }` -- a pass that never reached Redis. Throwing hands it to
     * `guarded()`'s catch, which answers from the in-memory limiter and fires
     * `ratelimit.backend_degraded`: the same treatment as any other failure,
     * which is what it is.
     *
     * Two guards because if either one is deleted the other still holds the line,
     * and the failure this prevents is invisible in every other test.
     */
    expect(() => _toResult({ success: true, remaining: 0, reset: 0, reason: 'timeout' })).toThrow();
  });

  it('does not throw on the other reasons, which are real answers', () => {
    // `cacheBlock` is the ephemeralCache rejecting a known-blocked identifier
    // without a round trip -- that is the flood absorber working, not a failure.
    const r = _toResult({
      success: false,
      remaining: 0,
      reset: Date.now() + 1000,
      reason: 'cacheBlock',
    });
    expect(r.ok).toBe(false);
  });
});
