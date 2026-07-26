/**
 * The batcher, in the `environment: 'node'` config the project already has.
 *
 * No jsdom. The transport is behind a module-level indirection with a
 * `_setTransport()` seam -- the same pattern `src/lib/ratelimit.ts` uses -- so
 * what is under test is a queue, and a queue does not need a DOM. The lifecycle
 * listeners are the one part that does, and they are three lines guarded by
 * `typeof document`; they are checked on a real iPhone (plan §14), because
 * `visibilitychange` on an app switch is the thing that cannot be faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _pending,
  _reset,
  _setTransport,
  flushNow,
  getSessionId,
  track,
} from './track.client';

type Sent = { body: string; mode: string };

function collector(): { sent: Sent[]; send: (body: string, mode: string) => Promise<void> } {
  const sent: Sent[] = [];
  return {
    sent,
    send: async (body, mode) => {
      sent.push({ body, mode });
    },
  };
}

function eventsIn(sent: Sent): Array<{ name: string; seq: number }> {
  return JSON.parse(sent.body).events;
}

/** Let the send promise and its .catch settle without advancing any clock. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

beforeEach(() => _reset());
afterEach(() => {
  _reset();
  vi.useRealTimers();
});

describe('batching', () => {
  it('coalesces three taps inside the debounce window into ONE request', async () => {
    vi.useFakeTimers();
    const { sent, send } = collector();
    _setTransport(send);

    track('draw.card_picked', { reader_id: 'thessaly', service_id: 'spread3', card_id: 18, reversed: true, slot: 0 });
    track('draw.card_picked', { reader_id: 'thessaly', service_id: 'spread3', card_id: 7, reversed: false, slot: 1 });
    track('draw.card_picked', { reader_id: 'thessaly', service_id: 'spread3', card_id: 13, reversed: true, slot: 2 });

    // Nothing has gone out yet -- that is the point of the debounce.
    expect(sent).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(2000);

    expect(sent).toHaveLength(1);
    const events = eventsIn(sent[0]);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(events.map((e) => (e as unknown as { props: { card_id: number } }).props.card_id)).toEqual([18, 7, 13]);
  });

  it('flushes on the 20th event without waiting for the timer', async () => {
    vi.useFakeTimers();
    const { sent, send } = collector();
    _setTransport(send);

    for (let i = 0; i < 20; i++) track('reader.chosen', { reader_id: 'adrian' });
    await vi.advanceTimersByTimeAsync(0);

    expect(sent).toHaveLength(1);
    expect(eventsIn(sent[0])).toHaveLength(20);
  });

  it('sends the envelope the collector route expects', async () => {
    const { sent, send } = collector();
    _setTransport(send);

    track('app.launched', { standalone: true, referrer_kind: 'direct' });
    flushNow();
    await settle();

    const envelope = JSON.parse(sent[0].body);
    expect(envelope.session_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(envelope.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(typeof envelope.tz_offset).toBe('number');
    expect(typeof envelope.sent_at).toBe('number');
    expect(envelope.events[0]).toMatchObject({ name: 'app.launched', seq: 0 });
    expect(sent[0].mode).toBe('fetch');
  });
});

describe('failure and the bounded queue', () => {
  it('re-queues a failed batch at the FRONT, ahead of anything tracked meanwhile', async () => {
    _setTransport(async () => {
      throw new Error('offline');
    });

    track('reader.chosen', { reader_id: 'thessaly' });
    flushNow();
    await settle();

    // Failed batch is back, and it is older than what comes next.
    track('reader.chosen', { reader_id: 'adrian' });

    const { sent, send } = collector();
    _setTransport(send);
    flushNow();
    await settle();

    const props = eventsIn(sent[0]).map((e) => (e as unknown as { props: { reader_id: string } }).props.reader_id);
    expect(props).toEqual(['thessaly', 'adrian']);
  });

  it('caps the queue at 200 and accounts for every dropped event exactly once', async () => {
    // A phone that has been in a tunnel for twenty minutes. An unbounded retry
    // queue here is a memory leak with a marketing name.
    _setTransport(async () => {
      throw new Error('offline');
    });

    const TOTAL = 250;
    for (let i = 0; i < TOTAL; i++) track('reader.chosen', { reader_id: 'adrian' });
    await settle();

    const queued = _pending();
    expect(queued).toHaveLength(200);

    const markers = queued.filter((e) => e.name === 'analytics.events_dropped');
    expect(markers, 'one confession, not one per overflow').toHaveLength(1);
    expect(markers[0].props.reason).toBe('queue_overflow');

    /*
     * THE ACCOUNTING CLOSES. Every event that was tracked is either still in
     * the queue or counted in the marker -- the marker itself occupies one of
     * the 200 slots, hence the -1. A cap that silently loses events it did not
     * count is worse than no cap, because "we dropped 51" is a fixable signal
     * and a shrinking funnel is not.
     */
    expect(markers[0].props.count).toBe(TOTAL - (queued.length - 1));
  });

  it('drops a batch that cannot be serialized rather than poisoning every future flush', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sent, send } = collector();
    _setTransport(send);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    track('reader.chosen', circular as unknown as { reader_id: string });
    flushNow();
    await settle();

    expect(sent).toHaveLength(0);
    expect(_pending()).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('the session id', () => {
  it('is a stable uuid across calls', () => {
    const first = getSessionId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(getSessionId()).toBe(first);
  });

  it('survives a sessionStorage that throws on read and on write', () => {
    // Safari private mode. An in-memory id is still correct for this page's
    // lifetime, which is most of what a browser session means.
    const store = {
      getItem() {
        throw new Error('private mode');
      },
      setItem() {
        throw new Error('private mode');
      },
    };
    vi.stubGlobal('sessionStorage', store);
    try {
      const id = getSessionId();
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(getSessionId()).toBe(id);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('track never throws', () => {
  it('survives a hostile props object and a transport that throws synchronously', async () => {
    _setTransport(() => {
      throw new Error('transport exploded');
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const hostile = { big: BigInt(1), fn: () => {}, nope: undefined };
    expect(() =>
      track('reader.chosen', hostile as unknown as { reader_id: string }),
    ).not.toThrow();
    expect(() => flushNow()).not.toThrow();
    await settle();

    warn.mockRestore();
  });
});
