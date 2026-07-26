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
vi.mock('./flush', () => ({ flushEvents: (...args: unknown[]) => flushEvents(...(args as [])) }));

const { analyticsContext, defer, track, withAnalytics } = await import('./track');
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
