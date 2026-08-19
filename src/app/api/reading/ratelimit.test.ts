import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The four 429s, and which `limit` each reports.
 *
 * **THE ROUTE IS EXERCISED FOR REAL**, not asserted against its source, because
 * the failure worth catching is two call sites passing the same label -- which a
 * grep for the four literals would happily accept. All four gates sit above
 * `request.json()`, so a POST with no body reaches every one of them; nothing
 * below is mocked and nothing below runs.
 *
 * What IS mocked is the four things the route needs before the budgets: who the
 * user is, the locale, the limiter, and the ceiling. The moderation gate, the
 * prompt layer, the provider and the database are all downstream of the returns
 * under test and are never reached.
 */
const { calls, gate } = vi.hoisted(() => ({
  calls: [] as Array<{ name: string; props: Record<string, unknown> }>,
  gate: {
    perUser: { ok: true, remaining: 29 } as unknown,
    probing: null as unknown,
    global: { ok: true, remaining: 1199 } as unknown,
    quota: { ok: true } as unknown,
  },
}));

/*
 * The route transitively imports `lotus.generate.ts`, which builds the postgres
 * client AT MODULE SCOPE -- so importing the route at all needs a DATABASE_URL.
 * Mocking the client says what is true instead: no gate under test touches the
 * database, and none of them gets far enough to try.
 */
vi.mock('@/lib/db/client', () => ({
  db: {},
  getDb: () => {
    throw new Error('the rate-limit gates must not reach the database');
  },
}));

vi.mock('@/lib/analytics/track', () => ({
  track: (name: string, props: Record<string, unknown>) => calls.push({ name, props }),
  defer: () => {},
  withAnalytics: <T>(_ctx: unknown, fn: () => Promise<T>) => fn(),
}));

vi.mock('@/lib/auth/server', () => ({
  requireUser: async () => ({
    ok: true,
    user: { id: 'user-1', locale: 'id', onboardingComplete: true },
  }),
}));

vi.mock('@/lib/i18n/t', () => ({ getLocale: async () => 'id' }));

vi.mock('@/lib/ratelimit', () => ({
  hit: async () => gate.perUser,
  hitGlobal: async () => gate.global,
  hitRefusal: async () => ({ ok: true, remaining: 4 }),
  refusalsExhausted: async () => gate.probing,
}));

vi.mock('@/lib/llm/meter', () => ({ reserveModelCall: async () => gate.quota }));

const post = async () => {
  const { POST } = await import('./route');
  return POST(new Request('https://www.jmtarot.site/api/reading', { method: 'POST' }));
};

const limitProp = () =>
  calls.find((c) => c.name === 'reading.rate_limited')?.props.limit ?? '(not fired)';

beforeEach(() => {
  calls.length = 0;
  gate.perUser = { ok: true, remaining: 29 };
  gate.probing = null;
  gate.global = { ok: true, remaining: 1199 };
  gate.quota = { ok: true };
});

afterEach(() => vi.restoreAllMocks());

/**
 * ── THE FIRST CASE PAID FOR THE WHOLE MODULE GRAPH, AND FLAKED ON IT ─────────
 *
 * `post()` does `await import('./route')`, and the route's transitive graph is
 * one of the largest in the app -- the prompt layer, `lotus.generate.ts`, the
 * provider adapters. The module cache means only the FIRST `it` in this file pays
 * that, and it paid it inside vitest's 5000ms default `testTimeout`. Alone the
 * file passes every time; under a full `npm test` the same case failed roughly
 * one run in three, on transform and import contention with 192 other files.
 *
 * **A flaky red in `npm test` is expensive out of all proportion to this test.**
 * `CLAUDE.md` names `test:all` as the one command whose red means nothing; a
 * second such command teaches the next session to disbelieve the suite, and it
 * would have cost them an hour before they found the timeout rather than a bug.
 *
 * Warming the import in a hook is the fix rather than a bigger `testTimeout`,
 * because it removes the cost from the measurement instead of tolerating it:
 * hooks get their own (10s) budget, this one runs once, and every `it` below then
 * times nothing but the route call. **Do not inline this back into `post()`.**
 */
beforeAll(async () => {
  await import('./route');
});

describe('the four budgets, each with its own `limit` prop', () => {
  it('the per-user budget reports `user`', async () => {
    gate.perUser = { ok: false, retryAfterSeconds: 120 };
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('120');
    expect(limitProp()).toBe('user');
  });

  it('the refusal budget reports `refusal`', async () => {
    gate.probing = { ok: false, retryAfterSeconds: 300 };
    const res = await post();
    expect(res.status).toBe(429);
    expect(limitProp()).toBe('refusal');
  });

  it('the crowd ceiling reports `global`', async () => {
    gate.global = { ok: false, retryAfterSeconds: 45 };
    const res = await post();
    expect(res.status).toBe(429);
    expect(limitProp()).toBe('global');
  });

  it('THE WINDOW`S QUOTA reports `daily`, and passes the limiter`s retry-after through', async () => {
    /*
     * The one that replaces the z.ai spend cap. The route does not INVENT the
     * retry-after -- it forwards whatever the limiter said, which under Upstash's
     * sliding window is the start of the next sub-window and can be anything in
     * (0, window]. Measured live at 291 seconds on a tripped ceiling, not the five
     * hours the plan assumed. What matters is that it is never zero and never
     * fabricated.
     */
    gate.quota = { ok: false, tier: 'hard', retryAfterSeconds: 14_400 };
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('14400');
    expect(limitProp()).toBe('daily');
  });

  it('all four answer with IDENTICAL copy, so a prober learns nothing', async () => {
    /*
     * W7's decision, and V9 does not weaken it: telling the querent which ceiling
     * they hit tells a prober which one to work around. The EVENT distinguishes
     * them, because that is server-side.
     */
    const bodies: string[] = [];
    for (const setup of [
      () => (gate.perUser = { ok: false, retryAfterSeconds: 1 }),
      () => (gate.probing = { ok: false, retryAfterSeconds: 1 }),
      () => (gate.global = { ok: false, retryAfterSeconds: 1 }),
      () => (gate.quota = { ok: false, tier: 'hard', retryAfterSeconds: 1 }),
    ]) {
      calls.length = 0;
      gate.perUser = { ok: true, remaining: 29 };
      gate.probing = null;
      gate.global = { ok: true, remaining: 1199 };
      gate.quota = { ok: true };
      setup();
      bodies.push(await (await post()).text());
    }
    expect(new Set(bodies).size).toBe(1);
  });

  it('a SOFT refusal of the reading is impossible, and does not 429', async () => {
    /*
     * The reading reserves as `interactive`, so the soft tier cannot refuse it --
     * by the time a querent is turned away, deferred work has been shed for hours.
     * If a future edit passes 'deferred' here, this test is what notices: the
     * route would start 429ing at 70% of the window instead of 100%.
     */
    gate.quota = { ok: false, tier: 'soft' };
    const res = await post();
    expect(res.status).not.toBe(429);
    expect(limitProp()).toBe('(not fired)');
  });

  it('lets a request through when every budget has headroom', async () => {
    // The negative control: all four green must NOT 429, or the tests above pass
    // for the wrong reason. It fails later, on the absent JSON body -- a 400.
    const res = await post();
    expect(res.status).toBe(400);
  });
});
