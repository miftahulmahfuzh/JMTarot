/**
 * The batching claim, tested.
 *
 * `after()` and `flushEvents` are both mocked: Vitest runs outside a request
 * scope, where the real `after()` throws, and the real `flushEvents` would want
 * a database that `npm test` is not allowed to need. What is under test is the
 * ordering and the batching, both of which are pure control flow.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const registered: Array<() => Promise<void> | void> = [];
/** Simulates `after()` called outside a request scope, where the real one throws. */
let afterThrows = false;

vi.mock('next/server', () => ({
  after: (fn: () => Promise<void> | void) => {
    if (afterThrows) throw new Error('after() outside a request scope');
    registered.push(fn);
  },
}));

const flushEvents = vi.fn(async () => {});
const flushCalls = vi.fn(async () => {});
vi.mock('./flush', () => ({
  flushEvents: (...args: unknown[]) => flushEvents(...(args as [])),
  flushCalls: (...args: unknown[]) => flushCalls(...(args as [])),
}));

const { analyticsContext, bindAnalyticsScope, bufferCall, defer, track, withAnalytics } =
  await import('./track');
const { recordCall } = await import('@/lib/llm/ledger');
type CallRow = Parameters<typeof bufferCall>[0];
type Ctx = Parameters<typeof withAnalytics>[0];

const CTX: Ctx = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  locale: 'id',
  localDate: '2026-07-26',
};

/** Run every after() callback the way Next eventually would. */
async function runAfter(): Promise<void> {
  const callbacks = registered.splice(0);
  for (const cb of callbacks) await cb();
}


beforeEach(() => {
  registered.length = 0;
  flushEvents.mockClear();
  flushCalls.mockClear();
  // The unit project runs with ANALYTICS_ENABLED=0 (reconciliation R20), so
  // every test that wants the real path says so explicitly.
  process.env.ANALYTICS_ENABLED = '1';
});

afterEach(() => {
  process.env.ANALYTICS_ENABLED = '0';
  delete process.env.ANALYTICS_DEBUG;
});

describe('withAnalytics batching', () => {
  it('registers ONE after() for five events and flushes them in one call', async () => {
    // The most important test in the file. One per track() would give a
    // request that fires nine events nine callbacks and nine inserts.
    await withAnalytics(CTX, async () => {
      for (let i = 0; i < 5; i++) track('reader.chosen', { reader_id: 'adrian' });
    });

    expect(registered).toHaveLength(1);
    await runAfter();

    expect(flushEvents).toHaveBeenCalledTimes(1);
    const [ctx, rows] = flushEvents.mock.calls[0] as unknown as [Ctx, unknown[]];
    expect(ctx).toEqual(CTX);
    expect(rows).toHaveLength(5);
  });

  it('does not flush at all when nothing was tracked', async () => {
    await withAnalytics(CTX, async () => {});
    await runAfter();
    expect(flushEvents).not.toHaveBeenCalled();
  });

  it('exposes the context inside the scope and null outside it', async () => {
    expect(analyticsContext()).toBe(null);
    await withAnalytics(CTX, async () => {
      expect(analyticsContext()).toEqual(CTX);
    });
    expect(analyticsContext()).toBe(null);
  });

  it('is invisible to the handler: value and rejection pass through unchanged', async () => {
    await expect(withAnalytics(CTX, async () => 'the response')).resolves.toBe('the response');
    const boom = new Error('handler exploded');
    await expect(withAnalytics(CTX, async () => Promise.reject(boom))).rejects.toBe(boom);
  });
});

describe('defer', () => {
  it('runs deferred work BEFORE the flush, and its events join the same batch', async () => {
    // Without the als.run re-entry in the after() callback this test fails with
    // two flush calls -- which is exactly what it is for. `reading.completed`
    // cannot exist until the stream closes, and it has to be in this batch.
    const order: string[] = [];
    flushEvents.mockImplementation(async () => {
      order.push('flush');
    });

    await withAnalytics(CTX, async () => {
      track('reading.requested', {
        reading_id: 'r', reader_id: 'adrian', service_id: 'spread3', card_count: 3,
        has_question: false, question_length: 0, lotus_present: false,
        memory_block_present: false, prompt_version: 'id-v1.deadbeef',
      });
      defer(async () => {
        order.push('deferred');
        track('reading.first_token', { reading_id: 'r', latency_ms: 1200 });
      });
    });

    await runAfter();

    expect(order).toEqual(['deferred', 'flush']);
    expect(flushEvents).toHaveBeenCalledTimes(1);
    const [, rows] = flushEvents.mock.calls[0] as unknown as [Ctx, Array<{ name: string }>];
    expect(rows.map((r) => r.name)).toEqual(['reading.requested', 'reading.first_token']);
  });

  it('still registers exactly one after() when defer comes first', async () => {
    await withAnalytics(CTX, async () => {
      defer(async () => {});
      track('reader.chosen', { reader_id: 'adrian' });
    });
    expect(registered).toHaveLength(1);
  });

  it('catches a throwing deferred job without losing the flush or the others', async () => {
    const ran: string[] = [];
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});

    await withAnalytics(CTX, async () => {
      defer(async () => {
        throw new Error('the reading write blew up');
      });
      defer(async () => {
        ran.push('second');
      });
      track('reader.chosen', { reader_id: 'adrian' });
    });

    await expect(runAfter()).resolves.toBeUndefined();
    expect(ran).toEqual(['second']);
    expect(flushEvents).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('swallows a flushEvents failure', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushEvents.mockRejectedValueOnce(new Error('database is on fire'));

    await withAnalytics(CTX, async () => track('reader.chosen', { reader_id: 'adrian' }));
    await expect(runAfter()).resolves.toBeUndefined();

    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

/**
 * A2's ledger buffer, and the whole of reconciliation R17.
 *
 * `drain()` iterates a SPLICED COPY of `store.deferred`, so a `defer()` called from
 * inside a deferred job pushes onto an array nothing drains again -- and
 * `ensureRegistered` returns early, so no second `after()` is registered either. Three
 * of A2's nine ops (`gist`, `translation_repair`, the `frequency` regeneration) record
 * from inside that loop, so **the ledger rides its own buffer, spliced AFTER the loop.**
 *
 * **THE FIRST TEST BELOW IS THE ONE THAT FAILS IF THAT BLOCK MOVES ABOVE THE LOOP**,
 * which is the edit somebody makes while tidying `drain()` into "flush everything, then
 * run the deferred work". Verified by moving it: `flushCalls` is not called at all.
 */
describe('the ledger buffer (A2, R17)', () => {
  const ROW: CallRow = {
    op: 'gist',
    model: 'glm-4.6',
    callClass: 'deferred',
    streamed: false,
    status: 'ok',
    errorKind: null,
    inputTokens: 1200,
    outputTokens: 40,
    cacheReadTokens: 1000,
    totalMs: 900,
  };

  it('FLUSHES A ROW RECORDED FROM INSIDE A DEFERRED JOB -- the one `defer()` cannot do', async () => {
    const order: string[] = [];
    flushCalls.mockImplementation(async () => {
      order.push('calls');
    });
    flushEvents.mockImplementation(async () => {
      order.push('events');
    });

    await withAnalytics(CTX, async () => {
      track('reader.chosen', { reader_id: 'adrian' });
      defer(async () => {
        order.push('deferred');
        // This is `extractGist` -> `complete()` -> `metered()` -> `recordCall`,
        // three frames down and inside the loop that has already been spliced.
        await recordCall(ROW);
      });
    });

    await runAfter();

    expect(order).toEqual(['deferred', 'calls', 'events']);
    expect(flushCalls).toHaveBeenCalledTimes(1);
    const [ctx, rows] = flushCalls.mock.calls[0] as unknown as [Ctx, CallRow[]];
    expect(rows).toEqual([ROW]);
    // Attribution comes off the CONTEXT at flush time (A2-D3), never from the call
    // site -- which is what keeps `local_date` the querent's own calendar day.
    expect(ctx).toEqual(CTX);
  });

  it('batches every row of a request into ONE flush, beside the one event flush', async () => {
    await withAnalytics(CTX, async () => {
      await recordCall({ ...ROW, op: 'moderation' });
      await recordCall({ ...ROW, op: 'reading', streamed: true });
      defer(async () => {
        await recordCall({ ...ROW, op: 'gist' });
      });
      track('reader.chosen', { reader_id: 'adrian' });
    });

    await runAfter();

    expect(registered).toHaveLength(0);
    expect(flushCalls).toHaveBeenCalledTimes(1);
    const [, rows] = flushCalls.mock.calls[0] as unknown as [Ctx, CallRow[]];
    expect(rows.map((r) => r.op)).toEqual(['moderation', 'reading', 'gist']);
  });

  it('registers an after() for a request whose ONLY analytics is a ledger row', async () => {
    // A `/api/translate` request that hits no event but makes a model call. Without
    // `ensureRegistered` here the row would sit in the buffer and never be drained.
    await withAnalytics(CTX, async () => {
      await recordCall(ROW);
    });
    expect(registered).toHaveLength(1);
    await runAfter();
    expect(flushCalls).toHaveBeenCalledTimes(1);
    expect(flushEvents).not.toHaveBeenCalled();
  });

  it('swallows a flushCalls failure and still flushes the events', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    flushCalls.mockRejectedValueOnce(new Error('database is on fire'));

    await withAnalytics(CTX, async () => {
      await recordCall(ROW);
      track('reader.chosen', { reader_id: 'adrian' });
    });
    await expect(runAfter()).resolves.toBeUndefined();

    // THE TWO FAILURES ARE INDEPENDENT. A busy ledger insert must not cost an event.
    expect(flushEvents).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('outside a scope, schedules its own after() rather than losing the row', async () => {
    await recordCall(ROW);
    expect(registered).toHaveLength(1);
    await runAfter();
    expect(flushCalls).toHaveBeenCalledTimes(1);
    const [ctx] = flushCalls.mock.calls[0] as unknown as [Ctx, CallRow[]];
    // The R49 case: unattributed, UTC date. A row with no querent behind it, or one
    // of W3's three onboarding routes that has one and no scope.
    expect(ctx.userId).toBeNull();
    expect(ctx.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('BRANCH 3: awaits the insert when after() itself refuses', async () => {
    /*
     * Reachable only from inside another `after()` callback or from a script -- the
     * real `after()` throws exactly where there is no request left to delay. So the
     * one branch that performs I/O in its caller's `await` is provably off the request
     * path, and the alternative to it is losing the row.
     */
    afterThrows = true;
    try {
      await recordCall(ROW);
      expect(flushCalls).toHaveBeenCalledTimes(1);
      expect(registered).toHaveLength(0);
    } finally {
      afterThrows = false;
    }
  });

  it('never throws, on a hostile row or on a failing insert with no after()', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    afterThrows = true;
    flushCalls.mockRejectedValueOnce(new Error('nope'));
    try {
      // A ledger that can fail a reading is worse than no ledger.
      await expect(recordCall(ROW)).resolves.toBeUndefined();
      await expect(recordCall({} as CallRow)).resolves.toBeUndefined();
    } finally {
      afterThrows = false;
      err.mockRestore();
    }
  });

  it('INSERTS DIRECTLY WHEN THE STORE HAS ALREADY BEEN DRAINED, keeping attribution', async () => {
    /*
     * ── THE BUG THIS EXISTS FOR, MEASURED LIVE ──────────────────────────────────
     *
     * `bindAnalyticsScope()` registers the drain `after()` EAGERLY, so a route that
     * also registers its own `after()` afterwards -- `/api/memory/summary` does -- has
     * the drain run FIRST. A row recorded from inside the route's own callback then
     * pushed onto `store.calls` with nothing left to visit it, and was lost silently.
     *
     * **Observed on a real day summary before the fix: `daily_summaries` had its row,
     * `llm_calls` had none, and nothing was logged.** This is R17's trap in a shape
     * R17 did not cover -- not a `defer()` from inside a deferred job, but a write
     * from inside a SECOND `after()`.
     *
     * It is NOT covered by the `after()`-throws catch, because in this Next version
     * `after()` inside an `after()` does not throw -- it silently drops the work.
     */
    let inScope!: <T>(fn: () => T) => T;
    await withAnalytics(CTX, async () => {
      // Exactly what `/api/memory/summary` does: bind synchronously in the handler,
      // which registers the drain `after()` EAGERLY -- ahead of the route's own.
      inScope = bindAnalyticsScope();
      track('reader.chosen', { reader_id: 'adrian' });
    });

    await runAfter(); // the eagerly-registered drain runs and completes
    expect(flushCalls).not.toHaveBeenCalled();

    // Now the route's OWN after() fires, re-entering the store through the wrapper it
    // captured -- and records a row into a store that has already been drained.
    await inScope(() => recordCall(ROW));

    expect(flushCalls).toHaveBeenCalledTimes(1);
    const [ctx, rows] = flushCalls.mock.calls[0] as unknown as [Ctx, CallRow[]];
    expect(rows).toEqual([ROW]);
    /*
     * **ATTRIBUTED, and this is why the drained branch reads `store.ctx` rather than
     * falling through to the anonymous branch.** A row that lost the querent's id,
     * locale and calendar day would be a silently unattributed cost on a request that
     * had all three.
     */
    expect(ctx).toEqual(CTX);
  });

  it('ANALYTICS_ENABLED=0 writes nothing and does not throw', async () => {
    process.env.ANALYTICS_ENABLED = '0';
    await withAnalytics(CTX, async () => {
      await recordCall(ROW);
    });
    await runAfter();
    expect(flushCalls).not.toHaveBeenCalled();
    expect(registered).toHaveLength(0);
  });
});

describe('the fallback path', () => {
  it('still flushes, unbatched, outside a withAnalytics scope', async () => {
    // A server component or a script that forgot the wrapper records data
    // anyway. Falling back to nothing is how a whole surface goes quiet for a
    // month without anyone noticing.
    track('app.launched', { standalone: false, referrer_kind: 'direct' });
    track('app.launched', { standalone: true, referrer_kind: 'internal' });

    expect(registered).toHaveLength(2);
    await runAfter();
    expect(flushEvents).toHaveBeenCalledTimes(2);
  });
});

describe('track never throws', () => {
  it('survives a hostile props object', () => {
    const circular: Record<string, unknown> = { n: 1 };
    circular.self = circular;
    const hostile = {
      circular,
      big: BigInt(9),
      [Symbol('s')]: 'x',
      nope: undefined,
      fn: () => {},
    };

    expect(() =>
      // Deliberately lying to the type system: this is what arrives when
      // somebody builds props from an API response at 11pm.
      track('reader.chosen', hostile as unknown as { reader_id: string }),
    ).not.toThrow();
  });

  it('survives after() itself throwing', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    afterThrows = true;
    try {
      expect(() => track('reader.chosen', { reader_id: 'adrian' })).not.toThrow();
      expect(() => defer(async () => {})).not.toThrow();
    } finally {
      afterThrows = false;
      err.mockRestore();
    }
  });
});

describe('ANALYTICS_ENABLED=0', () => {
  it('registers no after() and flushes nothing', async () => {
    process.env.ANALYTICS_ENABLED = '0';

    await withAnalytics(CTX, async () => {
      track('reader.chosen', { reader_id: 'adrian' });
      defer(async () => {
        throw new Error('must never run');
      });
    });

    expect(registered).toHaveLength(0);
    expect(flushEvents).not.toHaveBeenCalled();
  });
});
