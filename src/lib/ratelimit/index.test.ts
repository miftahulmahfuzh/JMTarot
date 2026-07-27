import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _backendNameFor,
  _reset,
  _setBackend,
  consume,
  hit,
  hitGlobal,
  hitRefusal,
  peek,
  refusalsExhausted,
} from './index';
import { _resetRedis } from './redis';
import type { RateLimitBackend } from './types';

/*
 * `track()` is mocked for this whole file rather than observed through the ALS
 * buffer, which is not exported, and rather than being left real -- the unit
 * project runs with ANALYTICS_ENABLED=0 (reconciliation R20), so a real `track`
 * returns before buffering anything and every assertion below would pass
 * vacuously. `vi.hoisted` because a `vi.mock` factory is hoisted above the
 * declarations it closes over.
 */
const { tracked } = vi.hoisted(() => ({
  tracked: [] as Array<{ name: string; props: Record<string, unknown> }>,
}));

vi.mock('@/lib/analytics/track', () => ({
  track: (name: string, props: Record<string, unknown>) => {
    tracked.push({ name, props });
  },
}));

/** Clear the log and hand back a reader for it. */
function trackSpy() {
  tracked.length = 0;
  return () => tracked;
}

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

describe('THE FALLBACK -- the line this whole workstream turns on', () => {
  /*
   * §3's table, as tests:
   *
   *                  Redis reachable        Redis down
   *   fail closed    exact fleet limits     JMTarot IS 100% DOWN (free tier, no SLA)
   *   fail open      exact fleet limits     unlimited, when something is already wrong
   *   fall back      exact fleet limits     per-instance -- i.e. what v0.2.0 SHIPPED
   *
   * The third row is never worse than the status quo ante, at any moment, in any
   * state. There is no argument for either of the others once it is on the table.
   */
  const broken = (how: 'reject' | 'hang'): RateLimitBackend => ({
    name: 'redis',
    consume: () =>
      how === 'reject' ? Promise.reject(new Error('boom')) : new Promise(() => {}),
    peek: () => (how === 'reject' ? Promise.reject(new Error('boom')) : new Promise(() => {})),
  });

  beforeEach(() => {
    _reset();
    // Silence the degradation notice; the notice itself is asserted below.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    _setBackend(null);
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back to the in-memory limiter when Redis REJECTS', async () => {
    _setBackend(broken('reject'));
    const r = await hit('u', Date.now(), 2, 60_000);
    expect(r.ok).toBe(true); // NOT refused

    /*
     * **THIS SECOND HALF IS THE ASSERTION THAT MATTERS.** It is easy to write a
     * fallback that returns `{ ok: true, remaining: max }` and call it a day --
     * that passes the line above and is fail-open to unlimited wearing a disguise.
     */
    await hit('u', Date.now(), 2, 60_000);
    expect((await hit('u', Date.now(), 2, 60_000)).ok).toBe(false); // AND STILL LIMITED
  });

  it('falls back on a peek too, so a READ cannot become an unlimited pass', async () => {
    // refusalsExhausted() is a peek. If a failed peek answered `ok`, a prober
    // would get an unlimited oracle exactly when Upstash was down.
    _setBackend(broken('reject'));
    for (let i = 0; i < 5; i++) await hitRefusal('prober');
    expect(await refusalsExhausted('prober')).not.toBeNull();
  });

  it('falls back when Redis HANGS, inside RATELIMIT_TIMEOUT_MS', async () => {
    vi.useFakeTimers();
    _setBackend(broken('hang'));
    const p = hit('u');
    await vi.advanceTimersByTimeAsync(1001);
    expect((await p).ok).toBe(true);
  });

  it('does not answer BEFORE the deadline -- the race is not a no-op', async () => {
    // Negative control for the test above: if `withTimeout` resolved immediately
    // the assertion there would pass for the wrong reason.
    vi.useFakeTimers();
    _setBackend(broken('hang'));
    let settled = false;
    void hit('u').then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(900);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(200);
    expect(settled).toBe(true);
  });

  it('NEVER fails open to unlimited', async () => {
    /*
     * The line this whole workstream turns on. Fail-closed makes an Upstash
     * outage a JMTarot outage on a tier with no SLA; fail-open-to-nothing makes
     * the limiter decorative exactly when something is already wrong. The third
     * answer -- fall back to what v0.2.0 shipped -- is never worse than the
     * status quo ante at any moment. If this test is deleted, so is the argument.
     */
    _setBackend(broken('reject'));
    for (let i = 0; i < 30; i++) await hit('u');
    expect((await hit('u')).ok).toBe(false);
  });

  it('NEVER fails CLOSED -- an Upstash outage is not a JMTarot outage', async () => {
    // The other half, and the one a security review will try to "fix".
    _setBackend(broken('reject'));
    for (let i = 0; i < 29; i++) expect((await hit('u')).ok).toBe(true);
  });

  it('is LOUD, once a minute, and never quotes the key', async () => {
    /*
     * A silent fallback is how the fleet-wide limiter becomes per-instance memory
     * again for three weeks without anybody knowing. And NEVER the key: a fetch
     * error can quote its request and one of these keys is a `users.id`. Same rule
     * as flush.ts and the moderation path.
     */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    _setBackend(broken('reject'));
    for (let i = 0; i < 20; i++) await hit('user-abc-123');

    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain('[ratelimit]');
    expect(line).not.toContain('user-abc-123');
  });
});

describe('ratelimit.backend_degraded', () => {
  const broken = (): RateLimitBackend => ({
    name: 'redis',
    consume: () => Promise.reject(new Error('boom')),
    peek: () => Promise.reject(new Error('boom')),
  });

  const hang = (): RateLimitBackend => ({
    name: 'redis',
    consume: () => new Promise(() => {}),
    peek: () => new Promise(() => {}),
  });

  beforeEach(() => {
    _reset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    _setBackend(null);
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires once for one degraded call', async () => {
    const seen = trackSpy();
    _setBackend(broken());
    await hit('u1');
    expect(seen()).toHaveLength(1);
    expect(seen()[0].name).toBe('ratelimit.backend_degraded');
    expect(seen()[0].props).toMatchObject({ backend: 'redis', reason: 'error' });
  });

  it('fires ONCE for a hundred degraded calls in the same minute', async () => {
    /*
     * **THE THROTTLE IS NOT POLITENESS.** An Upstash outage degrades every single
     * request, and one row per request would push the analytics path into exactly
     * the load W4 built `after()` to keep off it -- so the outage would become a
     * second outage. A count in query 9 is therefore a count of MINUTES.
     */
    const seen = trackSpy();
    _setBackend(broken());
    for (let i = 0; i < 100; i++) await hit(`u${i}`);
    expect(seen()).toHaveLength(1);
  });

  it('distinguishes a timeout from an error, because they need different fixes', async () => {
    vi.useFakeTimers();
    const seen = trackSpy();
    _setBackend(hang());
    const p = hit('u1');
    await vi.advanceTimersByTimeAsync(1001);
    await p;
    expect(seen()[0].props).toMatchObject({ reason: 'timeout' });
  });

  it('never puts the key in the event -- it is a users.id or an IP', async () => {
    /*
     * Same rule as `flush.ts` and the moderation path. `events` rows survive
     * account erasure with `user_id` nulled, so a raw key here would undo that:
     * the row would carry the identifier of an account that had been deleted.
     */
    const seen = trackSpy();
    _setBackend(broken());
    await hit('9f8e7d6c-user-uuid');
    expect(seen()[0].props.surface).toBe('read');
    expect(JSON.stringify(seen()[0].props)).not.toContain('9f8e7d6c');
  });

  it('reports the surface of a peek too, not only a consume', async () => {
    const seen = trackSpy();
    _setBackend(broken());
    await refusalsExhausted('u1');
    expect(seen()[0].props.surface).toBe('refuse');
  });
});

describe('consume + peek are the SAME budget, and hit() is not', () => {
  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  it('a consume moves what the matching peek reports', async () => {
    /*
     * **THE TRAP THIS PAIR EXISTS FOR.** The plan's §5 meter peeks `llm:window`
     * and consumes through `hit()`, which prefixes to `read:llm:window`. Both
     * functions work perfectly, on two different counters -- so the peek reports
     * zero used forever, the soft tier never fires, and the two-tier ceiling is
     * dead with every test of either function alone still green.
     */
    await consume('llm:window', 10, 60_000);
    await consume('llm:window', 10, 60_000);
    expect(await peek('llm:window', 10, 60_000)).toEqual({ ok: true, remaining: 8 });
  });

  it('hit() does NOT join that counter, because it namespaces', async () => {
    // Which is correct, and is exactly why a caller needing both halves must not
    // reach for hit(). Asserted so the asymmetry is documented rather than found.
    await hit('llm:window', Date.now(), 10, 60_000);
    expect(await peek('llm:window', 10, 60_000)).toEqual({ ok: true, remaining: 10 });
  });

  it('refuses once the named budget is spent, with a retry-after', async () => {
    for (let i = 0; i < 3; i++) expect((await consume('llm:window', 3, 60_000)).ok).toBe(true);
    const r = await consume('llm:window', 3, 60_000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe('the fleet-wide numbers', () => {
  beforeEach(() => {
    _setBackend(null);
    _reset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it('the crowd ceiling defaults to 1200/h, and the RAISE FROM 400 IS NOT A LOOSENING', async () => {
    /*
     * **400 WAS 400 PER INSTANCE**, so the real fleet ceiling was 400 x however
     * many instances Vercel had warm -- unknowable, and largest under exactly the
     * load it was meant to catch. Making it fleet-wide AT 400 would have been a
     * large, silent, untested TIGHTENING on launch day. 1200 is roughly the old
     * number against three warm instances, and `llm/meter.ts` is the real bound
     * now, so this one is a burst guard.
     *
     * Asserted by consuming 1200 and requiring the 1201st to be refused, rather
     * than by reading the constant: the number that matters is the one enforced.
     */
    for (let i = 0; i < 1200; i++) expect((await hitGlobal()).ok).toBe(true);
    expect((await hitGlobal()).ok).toBe(false);
  });

  it('RATELIMIT_GLOBAL_HOURLY retunes it without a deploy', async () => {
    vi.stubEnv('RATELIMIT_GLOBAL_HOURLY', '3');
    for (let i = 0; i < 3; i++) expect((await hitGlobal()).ok).toBe(true);
    expect((await hitGlobal()).ok).toBe(false);
  });

  it('a nonsense value falls back rather than becoming zero', async () => {
    // Zero would refuse every reading in the app. Same defensiveness as ttl.ts.
    vi.stubEnv('RATELIMIT_GLOBAL_HOURLY', 'twelve hundred');
    expect((await hitGlobal()).ok).toBe(true);
  });

  it('exports V7`s share-view ceiling as 10000, so V7 does not reinvent 3000', async () => {
    /*
     * V7's own plan sized 3000 PER INSTANCE. Fleet-wide 3000 would 429 a genuinely
     * popular link, which reads to a stranger as "your friend sent me a broken
     * link" -- and it is a DATABASE-READ guard, not a quota guard, because
     * `/s/[slug]` makes no model call at all. It lives here rather than in V7 so
     * that V7 reads a number with an argument attached instead of inventing one.
     *
     * V7's per-IP 120 is deliberately NOT moved: V9 is what makes that number mean
     * 120 rather than "120 times however many instances are warm", which is what
     * its 55-year enumeration arithmetic already assumed.
     */
    const { SHARE_VIEW_GLOBAL_MAX } = await import('./index');
    expect(SHARE_VIEW_GLOBAL_MAX).toBe(10_000);
  });
});
