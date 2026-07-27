import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reset, peek } from '@/lib/ratelimit';
import {
  MODEL_WINDOW_KEY,
  MODEL_WINDOW_MS,
  ModelCeilingError,
  reserveModelCall,
} from './meter';

const { tracked } = vi.hoisted(() => ({
  tracked: [] as Array<{ name: string; props: Record<string, unknown> }>,
}));

vi.mock('@/lib/analytics/track', () => ({
  track: (name: string, props: Record<string, unknown>) => {
    tracked.push({ name, props });
  },
}));

const T0 = 1_700_000_000_000;

/** Spend `n` slots without going through the meter's own tiering. */
async function burn(n: number, now = T0) {
  const { consume } = await import('@/lib/ratelimit');
  for (let i = 0; i < n; i++) await consume(MODEL_WINDOW_KEY, 10_000, MODEL_WINDOW_MS, now);
}

beforeEach(() => {
  _reset();
  tracked.length = 0;
  vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
  vi.stubEnv('LLM_WINDOW_CALL_SOFT', '7');
});

afterEach(() => vi.unstubAllEnvs());

describe('the window is ROLLING, and there is no calendar in it', () => {
  it('has no date in the key at all', () => {
    /*
     * **THIS IS THE GUARD AGAINST SOMEBODY REINSTATING A CALENDAR BUCKET**, and
     * the reason is not aesthetic. z.ai's quota is a rolling 5-hour window
     * (verified 2026-07-27, and it is why the plan's UTC-day design was replaced):
     * a script can burn the whole 5-hour quota in five minutes while a daily
     * counter still reads 400/4000, so a daily ceiling would never fire before the
     * provider's own limit did -- which is the outage it exists to prevent.
     *
     * With no date in the key there is also no UTC-versus-`local_date` question to
     * get wrong, which is the trap the plan's §5 spent a paragraph defusing.
     */
    expect(MODEL_WINDOW_KEY).toBe('llm:window');
    expect(MODEL_WINDOW_KEY).not.toMatch(/\d/);
    expect(MODEL_WINDOW_MS).toBe(5 * 60 * 60 * 1000);
  });

  it('slides: a call five hours old stops counting, and nothing resets on a boundary', async () => {
    /*
     * Replaces the plan's "the key is still 2026-07-27 at 18:00 UTC" assertion,
     * which was a test of the calendar bucket. What matters now is that the window
     * SLIDES -- no midnight, no cliff, no six-hour band in which two people in two
     * zones disagree about which bucket to increment.
     */
    await burn(10);
    expect((await reserveModelCall('interactive', T0)).ok).toBe(false);

    // One millisecond past five hours, the oldest call leaves the window.
    expect((await reserveModelCall('interactive', T0 + MODEL_WINDOW_MS + 1)).ok).toBe(true);
  });

  it('is unaffected by the querent`s timezone, because it never asks', async () => {
    // 18:00 UTC is 01:00 the next day in Jakarta -- the case CLAUDE.md's
    // `local_date` trap is about. Here it is simply 18:00, and that is the point.
    const evening = Date.UTC(2026, 6, 27, 18, 0, 0);
    await burn(10, evening);
    expect((await reserveModelCall('interactive', evening)).ok).toBe(false);
    expect((await reserveModelCall('interactive', evening + 60_000)).ok).toBe(false);
  });
});

describe('the two tiers', () => {
  it('below the soft line, both classes reserve', async () => {
    await burn(6);
    expect((await reserveModelCall('deferred', T0)).ok).toBe(true);
    expect((await reserveModelCall('interactive', T0)).ok).toBe(true);
  });

  it('between soft and hard, INTERACTIVE reserves and DEFERRED does not', async () => {
    /*
     * The whole point of two tiers: shedding the deferred half buys hours of
     * headroom the querent cannot feel. A gist that does not run means a slightly
     * less specific next reading; `chain.ts` returns null and never throws, the
     * summary and verdict have cache-miss paths, and the Lotus has a template
     * fallback. Every one of them degrades by construction.
     */
    await burn(7);
    const deferred = await reserveModelCall('deferred', T0);
    expect(deferred.ok).toBe(false);
    if (!deferred.ok) expect(deferred.tier).toBe('soft');
    expect((await reserveModelCall('interactive', T0)).ok).toBe(true);
  });

  it('at the hard ceiling, neither reserves', async () => {
    await burn(10);
    expect((await reserveModelCall('deferred', T0)).ok).toBe(false);
    const interactive = await reserveModelCall('interactive', T0);
    expect(interactive.ok).toBe(false);
    if (!interactive.ok) expect(interactive.tier).toBe('hard');
  });

  it('A REFUSED DEFERRED RESERVATION DOES NOT CONSUME A SLOT', async () => {
    /*
     * **THIS IS WHY `peek()` EXISTS.** Consuming and then deciding to refuse would
     * charge the window for a call that was never made -- and sustained across an
     * afternoon at the soft line, that walks the counter into the HARD ceiling on
     * work that was already being declined. The refusals would cause the outage.
     */
    await burn(7);
    const before = await peek(MODEL_WINDOW_KEY, 10, MODEL_WINDOW_MS, T0);
    for (let i = 0; i < 20; i++) await reserveModelCall('deferred', T0);
    const after = await peek(MODEL_WINDOW_KEY, 10, MODEL_WINDOW_MS, T0);
    expect(after).toEqual(before);
  });

  it('an interactive reservation DOES consume one, and exactly one', async () => {
    await reserveModelCall('interactive', T0);
    expect(await peek(MODEL_WINDOW_KEY, 10, MODEL_WINDOW_MS, T0)).toEqual({
      ok: true,
      remaining: 9,
    });
  });

  it('reports a retry-after that is never zero', async () => {
    await burn(10);
    const r = await reserveModelCall('interactive', T0);
    expect(r.ok).toBe(false);
    if (!r.ok && r.tier === 'hard') expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('the retry-after comes from the window, so it is hours and not a guess', async () => {
    // The honest answer, and it is what /api/reading puts on the 429.
    await burn(10);
    const r = await reserveModelCall('interactive', T0 + 60_000);
    if (!r.ok && r.tier === 'hard') {
      expect(r.retryAfterSeconds).toBe(MODEL_WINDOW_MS / 1000 - 60);
    }
  });
});

describe('the ceiling numbers', () => {
  it('defaults to 280, derived from the Pro tier`s ~400 per 5 hours', async () => {
    /*
     * 400 x 70% = 280, with the soft tier at 70% of that (196). The headroom is the
     * price of z.ai fact (4): we could not observe what quota exhaustion looks like
     * on the wire without causing it, so the ceiling stays clear of the boundary
     * rather than sitting on it.
     *
     * 280 per 5h is 1344/week against a ~2000 weekly quota, so the 5-hour ceiling
     * already holds the weekly one -- which is why the weekly quota is not modelled
     * separately. That arithmetic is only true at the Pro tier.
     */
    vi.unstubAllEnvs();
    const { _ceilings } = await import('./meter');
    expect(_ceilings()).toEqual({ hard: 280, soft: 196 });
  });

  it('the soft tier defaults to 70% of whatever the hard ceiling is', async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '1000');
    const { _ceilings } = await import('./meter');
    expect(_ceilings()).toEqual({ hard: 1000, soft: 700 });
  });

  it('ignores a nonsense value rather than becoming zero', async () => {
    // A ceiling of 0 would refuse every model call in the app. Defensive in the
    // same shape as ttl.ts: a garbage env var falls back, it does not brick.
    vi.unstubAllEnvs();
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', 'lots');
    const { _ceilings } = await import('./meter');
    expect(_ceilings().hard).toBe(280);
  });
});

describe('llm.ceiling_reached', () => {
  it('fires with tier soft when deferred work is shed', async () => {
    await burn(7);
    await reserveModelCall('deferred', T0);
    const event = tracked.find((e) => e.name === 'llm.ceiling_reached');
    expect(event?.props).toMatchObject({ tier: 'soft', call_class: 'deferred', ceiling: 10 });
  });

  it('fires with tier hard when a reading is refused', async () => {
    await burn(10);
    await reserveModelCall('interactive', T0);
    const event = tracked.find((e) => e.name === 'llm.ceiling_reached');
    expect(event?.props).toMatchObject({ tier: 'hard', call_class: 'interactive' });
  });

  it('fires NOTHING while there is headroom -- it is a warning, not a heartbeat', async () => {
    await reserveModelCall('interactive', T0);
    await reserveModelCall('deferred', T0);
    expect(tracked).toHaveLength(0);
  });
});

describe('ModelCeilingError', () => {
  it('carries the tier, so a caller can tell a shed from an outage', () => {
    const err = new ModelCeilingError('soft');
    expect(err.tier).toBe('soft');
    expect(err.name).toBe('ModelCeilingError');
    expect(err).toBeInstanceOf(Error);
  });
});
