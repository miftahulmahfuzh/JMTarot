import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { _reset, consume, peek } from '@/lib/ratelimit';
import { MODEL_WINDOW_KEY, MODEL_WINDOW_MS, _ceilings } from '@/lib/llm/meter';
import { CHAT_WINDOW_KEY, chatCeiling, reserveChatCall } from './budget';

/**
 * The chat's sub-budget, and the two properties that make it worth having.
 *
 *  1. **PEEK FIRST, CONSUME LAST** (`F1-D5`). Charging a window for a call that was
 *     never made walks the counter into the hard ceiling on work that was already
 *     being declined — `meter.ts`'s own argument for `peek()` existing, and worse
 *     here because a run makes two to five calls and the refusals compound per run.
 *  2. **A FLEET REFUSAL LEAVES THE CHAT WINDOW UNTOUCHED.** The chat must not be
 *     charged for a budget the whole app had already spent.
 */

const { tracked } = vi.hoisted(() => ({
  tracked: [] as Array<{ name: string; props: Record<string, unknown> }>,
}));

vi.mock('@/lib/analytics/track', () => ({
  track: (name: string, props: Record<string, unknown>) => {
    tracked.push({ name, props });
  },
}));

const T0 = 1_700_000_000_000;

/** Spend `n` slots on a key without going through either meter's tiering. */
async function burn(key: string, n: number, now = T0) {
  for (let i = 0; i < n; i++) await consume(key, 10_000, MODEL_WINDOW_MS, now);
}

/** What the chat window reports as used, without spending anything. */
async function chatUsed(now = T0): Promise<number> {
  const ceiling = chatCeiling();
  const r = await peek(CHAT_WINDOW_KEY, ceiling, MODEL_WINDOW_MS, now);
  return r.ok ? ceiling - r.remaining : ceiling;
}

beforeEach(() => {
  _reset();
  tracked.length = 0;
  vi.stubEnv('LLM_WINDOW_CALL_CEILING', '10');
  vi.stubEnv('LLM_WINDOW_CALL_SOFT', '7');
  vi.stubEnv('LLM_WINDOW_CHAT_CEILING', '4');
});

afterEach(() => vi.unstubAllEnvs());

describe('the ceiling', () => {
  it('defaults to HALF the hard ceiling, derived rather than written down', () => {
    /*
     * 140 of 280 in production (`[R16]`). Derived, so that when February 2027's
     * credit migration moves 280 this moves with it — a hardcoded 140 beside a
     * ceiling that had moved would be a sub-budget that is suddenly the whole
     * budget, or a tenth of it, with nothing saying which.
     */
    vi.stubEnv('LLM_WINDOW_CHAT_CEILING', undefined);
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '280');
    expect(chatCeiling()).toBe(140);

    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '400');
    expect(chatCeiling()).toBe(200);
  });

  it('falls back rather than becoming zero on garbage ([F1-18])', () => {
    // `Number('')` is 0, and a chat ceiling of 0 refuses every chat call in the app
    // — a typo taking a feature down with nothing reporting it.
    vi.stubEnv('LLM_WINDOW_CALL_CEILING', '280');
    for (const bad of ['', 'lots', '0', '-5', 'NaN']) {
      vi.stubEnv('LLM_WINDOW_CHAT_CEILING', bad);
      expect(chatCeiling(), `${JSON.stringify(bad)} must fall back`).toBe(140);
    }
  });

  it('is the same number meter.ts reports, because there is only one', () => {
    // F7's panel reads `_ceilings()`; `adminCopy.test.ts` bans it reading
    // `process.env` in that tree. Two resolutions would let the panel and the
    // enforcement disagree.
    expect(chatCeiling()).toBe(_ceilings().chat);
  });
});

describe('the key', () => {
  it('has no date in it, matching llm:window', () => {
    // A provider quota is not a property of anybody's calendar.
    expect(CHAT_WINDOW_KEY).toBe('llm:chat:window');
    expect(CHAT_WINDOW_KEY).not.toMatch(/\d/);
  });

  it('is reached through consume/peek and NEVER hit ([F1-D5])', () => {
    /*
     * **THE ONE BUG THAT MAKES BOTH HALVES WORK PERFECTLY ON TWO DIFFERENT
     * COUNTERS.** `hit()` applies a `read:` namespace before the backend sees the
     * key, so `hit('llm:chat:window')` records into `read:llm:chat:window` while the
     * peek reads the bare key — the peek then reports zero used forever and the
     * sub-budget never fires. `ratelimit/index.ts` documents this by name and it
     * killed `meter.ts`'s soft tier in draft.
     *
     * Asserted on the source rather than on behaviour, because the behaviour of the
     * broken version is "everything passes".
     */
    const code = readFileSync('src/lib/chat/budget.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    expect(code).toContain('peek(CHAT_WINDOW_KEY');
    expect(code).toContain('consume(CHAT_WINDOW_KEY');
    expect(code).not.toMatch(/\bhit\(/);
    expect(code).not.toMatch(/\bhitGlobal\(/);
  });

  it('shares ONE counter between its peek and its consume', async () => {
    // The property the assertion above protects, measured rather than grepped.
    expect(await chatUsed()).toBe(0);
    await reserveChatCall(T0);
    expect(await chatUsed()).toBe(1);
  });
});

describe('reserveChatCall', () => {
  it('passes and charges both windows when there is room', async () => {
    expect(await reserveChatCall(T0)).toEqual({ ok: true });
    expect(await chatUsed()).toBe(1);

    const fleet = await peek(MODEL_WINDOW_KEY, 10, MODEL_WINDOW_MS, T0);
    expect(fleet.ok && 10 - fleet.remaining).toBe(1);
  });

  it('sheds on its OWN ceiling before the fleet window is touched at all', async () => {
    /*
     * The whole point of the sub-budget: an enthusiastic afternoon stops costing the
     * app's other deferred features long before it reaches the soft line.
     */
    await burn(CHAT_WINDOW_KEY, 4);

    expect(await reserveChatCall(T0)).toEqual({ ok: false, reason: 'chat_window' });

    const fleet = await peek(MODEL_WINDOW_KEY, 10, MODEL_WINDOW_MS, T0);
    expect(fleet.ok && 10 - fleet.remaining, 'the fleet window must be untouched').toBe(0);
  });

  it('PEEKS its window first, so a shed call is never charged for', async () => {
    /*
     * `meter.ts`'s argument, applied one level down: *"Consuming and then deciding to
     * refuse would charge the window for a call that was never made — which,
     * sustained across an afternoon at the soft line, walks the counter into the hard
     * ceiling on work that was already being declined."*
     *
     * Ten refusals in a row must leave the counter exactly where the four real calls
     * left it.
     */
    await burn(CHAT_WINDOW_KEY, 4);
    for (let i = 0; i < 10; i++) await reserveChatCall(T0);
    expect(await chatUsed()).toBe(4);
  });

  it('leaves the chat window UNTOUCHED when the FLEET refuses', async () => {
    /*
     * The consume is step 3 and runs only when both gates passed. Charged here, the
     * chat would pay twice for one outage: once in the fleet window it did not cause,
     * and again in its own — so the chat would still be silent for hours after the
     * fleet recovered.
     */
    await burn(MODEL_WINDOW_KEY, 7); // at the soft line, which sheds `deferred`

    expect(await reserveChatCall(T0)).toEqual({ ok: false, reason: 'soft' });
    expect(await chatUsed()).toBe(0);
  });

  it('reports the fleet tier it was refused by, and it is SOFT long before hard', async () => {
    /*
     * A `deferred` caller reads the soft line first, so past the hard ceiling it is
     * still `'soft'` that answers — the hard tier is unreachable from here unless
     * `LLM_WINDOW_CALL_SOFT` has been set at or above the hard ceiling, which is a
     * misconfiguration rather than a state. **The union keeps `'hard'` anyway**,
     * because it mirrors `Reservation['tier']` and a reason the caller cannot name is
     * a reason an event cannot report.
     */
    await burn(MODEL_WINDOW_KEY, 10);
    expect(await reserveChatCall(T0)).toEqual({ ok: false, reason: 'soft' });

    // `Number('10_000')` is NaN and would fall back to 70% — the same `positive()`
    // rule the ceiling test above exercises deliberately.
    vi.stubEnv('LLM_WINDOW_CALL_SOFT', '10000');
    expect(await reserveChatCall(T0)).toEqual({ ok: false, reason: 'hard' });
  });

  it('is DEFERRED against the fleet, which is the promise to the reading (C-D6)', async () => {
    /*
     * A chat run is 2–5 calls and sixty runs exhaust the app's whole five-hour quota.
     * The rule in `types.ts` says a call somebody is watching a spinner for is
     * `interactive`, and by that rule a chat turn is — **the exception is deliberate
     * and arithmetic**: when the chat and a reading compete, the reading wins.
     *
     * Measured, not grepped: at the soft line an `interactive` reservation still
     * passes and a chat one does not.
     */
    await burn(MODEL_WINDOW_KEY, 7);
    const { reserveModelCall } = await import('@/lib/llm/meter');

    expect(await reserveChatCall(T0)).toEqual({ ok: false, reason: 'soft' });
    expect((await reserveModelCall('interactive', T0)).ok).toBe(true);
  });

  it('slides with the window, so a shed afternoon recovers on its own', async () => {
    await burn(CHAT_WINDOW_KEY, 4);
    expect(await reserveChatCall(T0)).toEqual({ ok: false, reason: 'chat_window' });
    expect(await reserveChatCall(T0 + MODEL_WINDOW_MS + 1)).toEqual({ ok: true });
  });
});
