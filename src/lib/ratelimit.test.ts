import { beforeEach, describe, expect, it } from 'vitest';
import { _reset, _sizes, hit, hitGlobal, hitRefusal } from './ratelimit';

const T0 = 1_700_000_000_000;

describe('rate limit', () => {
  beforeEach(_reset);

  it('allows up to the limit then rejects', () => {
    for (let i = 0; i < 3; i++) expect(hit('a', T0, 3).ok).toBe(true);
    expect(hit('a', T0, 3).ok).toBe(false);
  });

  it('keeps users separate', () => {
    for (let i = 0; i < 3; i++) hit('a', T0, 3);
    expect(hit('b', T0, 3).ok).toBe(true);
  });

  it('slides: an old hit stops counting once it leaves the window', () => {
    for (let i = 0; i < 3; i++) hit('a', T0, 3, 1000);
    expect(hit('a', T0 + 500, 3, 1000).ok).toBe(false);
    expect(hit('a', T0 + 1001, 3, 1000).ok).toBe(true);
  });

  it('reports when to retry, based on the oldest hit in the window', () => {
    for (let i = 0; i < 3; i++) hit('a', T0, 3, 60_000);
    const result = hit('a', T0 + 10_000, 3, 60_000);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.retryAfterSeconds).toBe(50);
  });

  it('never reports a retry-after of zero', () => {
    // A zero would tell the client to retry immediately, into another 429.
    for (let i = 0; i < 2; i++) hit('a', T0, 2, 1000);
    const result = hit('a', T0 + 999, 2, 1000);
    if (!result.ok) expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });
});


describe('the global per-instance ceiling (W7 §6.7, failure mode 2)', () => {
  beforeEach(_reset);

  it('bounds the instance regardless of how many users there are', () => {
    /*
     * The failure the per-user limiter cannot see: fifty throwaway Google
     * accounts get fifty independent budgets. This converts that into one
     * ceiling per instance -- a bounded bill rather than an unbounded one.
     */
    for (let i = 0; i < 5; i++) {
      expect(hitGlobal(T0, 5).ok).toBe(true);
    }
    expect(hitGlobal(T0, 5).ok).toBe(false);
  });

  it('slides like the per-user window', () => {
    for (let i = 0; i < 3; i++) hitGlobal(T0, 3, 1000);
    expect(hitGlobal(T0 + 500, 3, 1000).ok).toBe(false);
    expect(hitGlobal(T0 + 1001, 3, 1000).ok).toBe(true);
  });

  it('is independent of the per-user budget', () => {
    // Both must be checked; neither substitutes for the other.
    hitGlobal(T0, 1);
    expect(hit('someone', T0, 3).ok).toBe(true);
  });
});

describe('the refusal sub-limit (W7-D13)', () => {
  beforeEach(_reset);

  it('cuts a user off after five refusals in a window', () => {
    /*
     * **THE ANTI-ORACLE CONTROL.** A Tier-A deny costs the attacker nothing and
     * answers in ~24ms, so without this the refusal endpoint is a free way to
     * map the blocklist one phrase at a time.
     */
    for (let i = 0; i < 5; i++) expect(hitRefusal('prober', T0).ok).toBe(true);
    expect(hitRefusal('prober', T0).ok).toBe(false);
  });

  it('is tighter than the ordinary budget, and separate from it', () => {
    for (let i = 0; i < 5; i++) hitRefusal('prober', T0);
    expect(hitRefusal('prober', T0).ok).toBe(false);
    // The ordinary budget is untouched: six refusals is nowhere near 30 readings.
    expect(hit('prober', T0).ok).toBe(true);
  });

  it('keeps users separate', () => {
    for (let i = 0; i < 5; i++) hitRefusal('prober', T0);
    expect(hitRefusal('someone-else', T0).ok).toBe(true);
  });
});

describe('the eviction sweep', () => {
  beforeEach(_reset);

  it('drops expired keys', () => {
    for (let i = 0; i < 50; i++) hit(`user-${i}`, T0, 30, 1000);
    expect(_sizes().users).toBe(50);

    // One hit past both the window and the sweep interval.
    hit('fresh', T0 + 120_000, 30, 1000);
    expect(_sizes().users).toBe(1);
  });

  it('runs at most once a minute, not on every insert', () => {
    /*
     * **THE REGRESSION THIS REPLACES.** The old guard was `if (hits.size >
     * 1000)`, so an instance that ever crossed a thousand ACTIVE keys swept on
     * every single request thereafter and freed nothing, because active keys are
     * not expired. Time-guarding makes the cost O(1) amortised.
     */
    hit('a', T0, 30, 1000);
    for (let i = 0; i < 50; i++) hit(`user-${i}`, T0 + 2000, 30, 1000);

    // `a` expired 1000ms in, but the sweep is still on cooldown, so it is here.
    expect(_sizes().users).toBe(51);

    hit('later', T0 + 120_000, 30, 1000);
    expect(_sizes().users).toBe(1);
  });
});
