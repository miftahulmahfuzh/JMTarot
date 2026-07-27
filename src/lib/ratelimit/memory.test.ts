import { beforeEach, describe, expect, it } from 'vitest';
import { _memorySizes, _resetMemory, memoryBackend } from './memory';

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

/*
 * v0.2.0's suite, moved with `git mv` and adapted to the backend's call shape --
 * `memoryBackend.consume(key, max, windowMs, now)` where it used to be
 * `hit(key, now, max, windowMs)`. Every assertion is the one it was.
 *
 * **THE KEYS ARE PREFIXED BY HAND HERE** (`read:`, `refuse:`, `global`) because
 * the facade is what applies them in production and these tests are below the
 * facade. That the two budgets do not collide *when a caller passes one bare
 * `users.id` to both* is `index.test.ts`'s assertion, not this file's: it is a
 * property of the prefixing, and prefixing is `index.ts`'s job.
 *
 * `now` IS AUTHORITATIVE HERE AND ONLY HERE. The Redis backend uses the server's
 * clock, so a test that pins time is a test of this file. See `types.ts`.
 */
const consume = (key: string, max: number, now: number, windowMs = HOUR) =>
  memoryBackend.consume(key, max, windowMs, now);

describe('rate limit', () => {
  beforeEach(_resetMemory);

  it('allows up to the limit then rejects', async () => {
    for (let i = 0; i < 3; i++) expect((await consume('read:a', 3, T0)).ok).toBe(true);
    expect((await consume('read:a', 3, T0)).ok).toBe(false);
  });

  it('keeps users separate', async () => {
    for (let i = 0; i < 3; i++) await consume('read:a', 3, T0);
    expect((await consume('read:b', 3, T0)).ok).toBe(true);
  });

  it('slides: an old hit stops counting once it leaves the window', async () => {
    for (let i = 0; i < 3; i++) await consume('read:a', 3, T0, 1000);
    expect((await consume('read:a', 3, T0 + 500, 1000)).ok).toBe(false);
    expect((await consume('read:a', 3, T0 + 1001, 1000)).ok).toBe(true);
  });

  it('reports when to retry, based on the oldest hit in the window', async () => {
    for (let i = 0; i < 3; i++) await consume('read:a', 3, T0, 60_000);
    const result = await consume('read:a', 3, T0 + 10_000, 60_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSeconds).toBe(50);
  });

  it('never reports a retry-after of zero', async () => {
    // A zero would tell the client to retry immediately, into another 429.
    for (let i = 0; i < 2; i++) await consume('read:a', 2, T0, 1000);
    const result = await consume('read:a', 2, T0 + 999, 1000);
    if (!result.ok) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('the global ceiling (W7 §6.7, failure mode 2)', () => {
  beforeEach(_resetMemory);

  it('bounds the fleet regardless of how many users there are', async () => {
    /*
     * The failure the per-user limiter cannot see: fifty throwaway Google
     * accounts get fifty independent budgets. v0.2.0 converted that into one
     * ceiling per INSTANCE; V9 makes the same key fleet-wide when Redis is
     * reachable, and this is what it degrades to when it is not.
     */
    for (let i = 0; i < 5; i++) {
      expect((await consume('global', 5, T0)).ok).toBe(true);
    }
    expect((await consume('global', 5, T0)).ok).toBe(false);
  });

  it('slides like the per-user window', async () => {
    for (let i = 0; i < 3; i++) await consume('global', 3, T0, 1000);
    expect((await consume('global', 3, T0 + 500, 1000)).ok).toBe(false);
    expect((await consume('global', 3, T0 + 1001, 1000)).ok).toBe(true);
  });

  it('is independent of the per-user budget', async () => {
    // Both must be checked; neither substitutes for the other.
    await consume('global', 1, T0);
    expect((await consume('read:someone', 3, T0)).ok).toBe(true);
  });
});

describe('the refusal sub-limit (W7-D13)', () => {
  beforeEach(_resetMemory);

  it('cuts a user off after five refusals in a window', async () => {
    /*
     * **THE ANTI-ORACLE CONTROL.** A Tier-A deny costs the attacker nothing and
     * answers in ~24ms, so without this the refusal endpoint is a free way to
     * map the blocklist one phrase at a time.
     */
    for (let i = 0; i < 5; i++) expect((await consume('refuse:prober', 5, T0)).ok).toBe(true);
    expect((await consume('refuse:prober', 5, T0)).ok).toBe(false);
  });

  it('is tighter than the ordinary budget, and separate from it', async () => {
    for (let i = 0; i < 5; i++) await consume('refuse:prober', 5, T0);
    expect((await consume('refuse:prober', 5, T0)).ok).toBe(false);
    // The ordinary budget is untouched: six refusals is nowhere near 30 readings.
    expect((await consume('read:prober', 30, T0)).ok).toBe(true);
  });

  it('keeps users separate', async () => {
    for (let i = 0; i < 5; i++) await consume('refuse:prober', 5, T0);
    expect((await consume('refuse:someone-else', 5, T0)).ok).toBe(true);
  });
});

describe('peek -- a budget consulted without being spent', () => {
  beforeEach(_resetMemory);

  it('does not consume', async () => {
    const a = await memoryBackend.peek('read:a', 3, HOUR, T0);
    const b = await memoryBackend.peek('read:a', 3, HOUR, T0);
    expect(a).toEqual({ ok: true, remaining: 3 });
    expect(b).toEqual({ ok: true, remaining: 3 });
  });

  it('moves once something else consumes', async () => {
    await consume('read:a', 3, T0);
    expect(await memoryBackend.peek('read:a', 3, HOUR, T0)).toEqual({ ok: true, remaining: 2 });
  });

  it('reports the same retry-after as a rejected consume would', async () => {
    for (let i = 0; i < 2; i++) await consume('read:a', 2, T0, 60_000);
    const seen = await memoryBackend.peek('read:a', 2, 60_000, T0 + 10_000);
    expect(seen.ok).toBe(false);
    if (!seen.ok) expect(seen.retryAfterSeconds).toBe(50);
  });
});

describe('the eviction sweep', () => {
  beforeEach(_resetMemory);

  it('drops expired keys', async () => {
    for (let i = 0; i < 50; i++) await consume(`read:user-${i}`, 30, T0, 1000);
    expect(_memorySizes().keys).toBe(50);

    // One hit past both the window and the sweep interval.
    await consume('read:fresh', 30, T0 + 120_000, 1000);
    expect(_memorySizes().keys).toBe(1);
  });

  it('runs at most once a minute, not on every insert', async () => {
    /*
     * **THE REGRESSION THIS REPLACES.** The old guard was `if (hits.size >
     * 1000)`, so an instance that ever crossed a thousand ACTIVE keys swept on
     * every single request thereafter and freed nothing, because active keys are
     * not expired. Time-guarding makes the cost O(1) amortised.
     */
    await consume('read:a', 30, T0, 1000);
    for (let i = 0; i < 50; i++) await consume(`read:user-${i}`, 30, T0 + 2000, 1000);

    // `read:a` expired 1000ms in, but the sweep is on cooldown, so it is here.
    expect(_memorySizes().keys).toBe(51);

    await consume('read:later', 30, T0 + 120_000, 1000);
    expect(_memorySizes().keys).toBe(1);
  });

  it('does not sweep on a peek -- a read must not change the map', async () => {
    /*
     * Not a v0.2.0 assertion, because v0.2.0's read (`refusalsExhausted`) had no
     * sweep to accidentally acquire. It is here because `peek` is on the
     * interface now and the ceiling calls it on the deferred path: a read that
     * silently evicts is a read that changes the next consume's answer.
     */
    await consume('read:a', 30, T0, 1000);
    await memoryBackend.peek('read:a', 30, 1000, T0 + 120_000);
    expect(_memorySizes().keys).toBe(1);
  });
});
