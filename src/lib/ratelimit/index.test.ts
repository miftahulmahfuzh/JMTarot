import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _backendNameFor,
  _reset,
  _setBackend,
  hit,
  hitGlobal,
  hitRefusal,
  peek,
  refusalsExhausted,
} from './index';
import { _resetRedis } from './redis';

/*
 * THE FACADE'S OWN TESTS. Everything about the sliding-window arithmetic is
 * `memory.test.ts`'s; what is asserted here is what the facade adds -- the
 * namespaces, `peek`'s read-only-ness through the public functions, and (Task 11)
 * the fallback.
 */
describe('the key namespaces (TRAP 1)', () => {
  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  it('a reading budget and a refusal budget do not share a counter', async () => {
    /*
     * **THE TRAP.** `hit(user.id)` and `hitRefusal(user.id)` are the SAME STRING.
     * Two Maps kept them apart; one Redis keyspace would not. Five refusals would
     * eat five of thirty readings and thirty readings would exhaust the refusal
     * budget six times over -- so a heavy legitimate user would be handled as
     * somebody mapping the blocklist.
     *
     * The prefixes are applied in `index.ts` and never at a call site, which is
     * what makes them unforgettable. Verified RED by deleting them.
     */
    for (let i = 0; i < 5; i++) await hitRefusal('u1');
    expect((await hitRefusal('u1')).ok).toBe(false);
    expect((await hit('u1')).ok).toBe(true); // budget untouched
    expect(await refusalsExhausted('u1')).not.toBeNull();
  });

  it('thirty readings do not exhaust the refusal budget', async () => {
    /*
     * **THIS IS THE ASSERTION WITH TEETH, AND THE ONE ABOVE IS NOT.** Measured by
     * deleting the prefixes and running both: the test above still PASSES, because
     * five refusals against a reading budget of thirty is comfortably under
     * budget, so a shared counter is invisible from that direction. The plan's §4
     * test is written that way round.
     *
     * From this direction a shared counter is loud: thirty readings blow a refusal
     * budget of five six times over, and `refusalsExhausted()` then reports a
     * heavy legitimate user as somebody mapping the blocklist. If you ever prune
     * these two, keep this one.
     */
    for (let i = 0; i < 30; i++) await hit('u1');
    expect((await hit('u1')).ok).toBe(false);
    expect(await refusalsExhausted('u1')).toBeNull();
    expect((await hitRefusal('u1')).ok).toBe(true);
  });

  it('the crowd ceiling is not any one user`s budget', async () => {
    // `global` is a bare key, so a user literally named `global` must not land in
    // it. `hit()` prefixes with `read:`, which is what guarantees that.
    await hitGlobal(Date.now(), 1);
    expect((await hit('global')).ok).toBe(true);
  });

  it('two users do not share a reading budget', async () => {
    for (let i = 0; i < 30; i++) await hit('u1');
    expect((await hit('u1')).ok).toBe(false);
    expect((await hit('u2')).ok).toBe(true);
  });
});

describe('peek -- a budget consulted without being spent', () => {
  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  it('does not move the budget, however many times it is asked', async () => {
    const first = await peek('read:u1', 3);
    for (let i = 0; i < 10; i++) await peek('read:u1', 3);
    const last = await peek('read:u1', 3);
    expect(first).toEqual({ ok: true, remaining: 3 });
    expect(last).toEqual({ ok: true, remaining: 3 });
  });

  it('moves when something else consumes', async () => {
    await hit('u1');
    expect(await peek('read:u1', 30)).toEqual({ ok: true, remaining: 29 });
  });

  it('reports a retry-after, never zero, once the budget is gone', async () => {
    for (let i = 0; i < 5; i++) await hitRefusal('u1');
    const seen = await peek('refuse:u1', 5);
    expect(seen.ok).toBe(false);
    if (!seen.ok) expect(seen.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('refusalsExhausted -- W7`s read, now written over peek()', () => {
  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  it('DOES NOT CONSUME THE BUDGET IT IS ASKING ABOUT', async () => {
    /*
     * W7's own words, and the reason the function exists at all: *"calling
     * `hitRefusal()` to ask the question would consume the budget it is asking
     * about"* -- so every request would count as a refusal and five ordinary
     * questions would lock somebody out for an hour.
     *
     * Verified RED by pointing `peek` at `consume`: this test fails on the sixth
     * iteration, the `hitRefusal` below it fails too, and nothing else in the
     * suite notices. That asymmetry is why the read is on the BACKEND interface
     * rather than faked in the facade with a consume-and-refund.
     */
    for (let i = 0; i < 20; i++) expect(await refusalsExhausted('u1')).toBeNull();
    expect((await hitRefusal('u1')).ok).toBe(true);
  });

  it('reports exhaustion once five refusals are recorded', async () => {
    for (let i = 0; i < 5; i++) await hitRefusal('u1');
    const seen = await refusalsExhausted('u1');
    expect(seen).not.toBeNull();
    expect(seen?.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('is keyed per user', async () => {
    for (let i = 0; i < 5; i++) await hitRefusal('prober');
    expect(await refusalsExhausted('prober')).not.toBeNull();
    expect(await refusalsExhausted('someone-else')).toBeNull();
  });
});

describe('backend selection', () => {
  const configured = () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://example.upstash.io');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token');
  };

  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  afterEach(() => {
    _resetRedis();
    vi.unstubAllEnvs();
  });

  it('uses memory when the Upstash variables are absent', () => {
    /*
     * v0.2.0's behaviour, and what `npm test` and a local `npm run dev` get. It is
     * NOT what production should be: the failure is silent and the app looks
     * perfectly healthy while every stated limit is quietly multiplied by the
     * number of warm instances. `DEPLOY-VERCEL.md` §2b says so in caps.
     */
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    expect(_backendNameFor('read:u1')).toBe('memory');
  });

  it('uses redis for a reading budget once configured', () => {
    configured();
    expect(_backendNameFor('read:u1')).toBe('redis');
    expect(_backendNameFor('refuse:u1')).toBe('redis');
    expect(_backendNameFor('global')).toBe('redis');
  });

  it('KEEPS THE EVENTS BUDGET ON MEMORY, even fully configured', () => {
    /*
     * **AND THE KEY IS `read:events:<ip>`, NOT `events:<ip>`.** `hit()` applies
     * its own prefix before selection sees the key, so the plan's §4 test of
     * `startsWith('events:')` alone is FALSE here -- it would have put the app's
     * highest-volume endpoint on Redis, which is the exact opposite of what §2.1
     * argues for over two paragraphs. This test is the one that catches that.
     *
     * The reason it stays on memory is not only cost: /api/events always answers
     * 204, writes only names from a closed taxonomy, and never reads a user id
     * from the body, so the cost of abusing it is bounded rows. Letting one
     * browser tab dominate the limiter's OWN command budget is the failure the
     * limiter exists to prevent.
     */
    configured();
    expect(_backendNameFor('read:events:203.0.113.7')).toBe('memory');
    expect(_backendNameFor('events:203.0.113.7')).toBe('memory');
  });

  it('moves the events budget to redis on one env var', () => {
    configured();
    vi.stubEnv('RATELIMIT_EVENTS_BACKEND', 'redis');
    expect(_backendNameFor('read:events:203.0.113.7')).toBe('redis');
  });

  it('RATELIMIT_BACKEND=memory forces everything local -- the 2am kill switch', () => {
    configured();
    vi.stubEnv('RATELIMIT_BACKEND', 'memory');
    expect(_backendNameFor('read:u1')).toBe('memory');
    expect(_backendNameFor('global')).toBe('memory');
    expect(_backendNameFor('llm:window')).toBe('memory');
  });

  it('ONLY the exact string `memory` disables it -- a typo must not', () => {
    /*
     * The OPPOSITE defaulting rule to ANALYTICS_ENABLED's, on purpose. There a
     * typo must over-collect; here a typo must not silently disable enforcement,
     * because the app would look identical and nothing would say so.
     */
    configured();
    vi.stubEnv('RATELIMIT_BACKEND', 'memroy');
    expect(_backendNameFor('read:u1')).toBe('redis');
  });
});
