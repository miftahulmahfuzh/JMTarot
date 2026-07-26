'use client';

/**
 * The browser half. Same `TrackFn` signature as the server's, batched transport.
 *
 * `import { track } from '@/lib/analytics/track.client'` in a client component.
 * NEVER import `./track` there: it pulls `node:async_hooks` and `next/server`
 * into the browser bundle and the build fails. The two modules deliberately
 * share the `TrackFn` type, so the call sites are identical and only the import
 * line differs, and a drift in either signature is a compile error.
 *
 * WHY TWO MODULES AND NOT ONE THAT BRANCHES ON `typeof window` (plan A3). An
 * isomorphic `track.ts` still has to *import* the server implementation, which
 * drags the same two modules into the client graph. Conditional exports would
 * work and are a lot of machinery for two files. There is still exactly one
 * writer: this module posts to `/api/events`, which calls the SERVER `track()`.
 *
 * WHY BATCHED (plan A5). One request per click is a request per click. Twenty
 * card taps during a draw would be twenty POSTs competing with the reading
 * stream for the same connection -- analytics actively degrading the thing it
 * is measuring. A whole three-card draw is one request, and it lands while the
 * querent is reading their cards.
 *
 * TRACK() NEVER THROWS HERE EITHER, with one extra edge: `crypto.randomUUID` is
 * unavailable on insecure origins in some browsers, so the whole module
 * degrades to a no-op with a warning rather than taking a card tap down.
 */
import { todayKey } from '@/lib/storage';
import type { EventName, EventProps, EventPropValue, TrackFn } from './events';

const ENDPOINT = '/api/events';

/** Twenty events is a couple of KB, comfortably inside the 64KB total that the
 *  spec allows for all in-flight `keepalive` bodies. If this grows, that is the
 *  constraint that bites. */
const BATCH_MAX = 20;

/** Two seconds, chosen against the actual interaction rhythm: a three-card draw
 *  is three taps inside a few seconds, so the whole draw batches into one
 *  request. */
const BATCH_DELAY_MS = 2000;

/** An unbounded retry queue on a phone that has been in a tunnel for twenty
 *  minutes is a memory leak with a marketing name. */
const QUEUE_MAX = 200;

const SID_KEY = 'jm.sid';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type QueuedEvent = {
  name: EventName;
  props: Record<string, EventPropValue>;
  /** Monotonic per browser session. See the envelope comment below. */
  seq: number;
  t: number;
};

export type SendMode = 'fetch' | 'beacon';
export type Transport = (body: string, mode: SendMode) => Promise<void>;

let queue: QueuedEvent[] = [];
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;
let memoSid: string | null = null;
/** The single coalescing marker for dropped events, if one is in the queue. */
let dropMarker: QueuedEvent | null = null;

// ---------------------------------------------------------------------------
// The session id
// ---------------------------------------------------------------------------

/**
 * `sessionStorage`, NOT `localStorage` (plan A7).
 *
 * A browser session is a tab. A value that outlives the tab is a device
 * identifier, which is a materially different thing to hold about a person and
 * carries different privacy weight.
 */
export function getSessionId(): string {
  if (memoSid) return memoSid;
  try {
    const existing = sessionStorage.getItem(SID_KEY);
    if (existing && UUID_RE.test(existing)) return (memoSid = existing);
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SID_KEY, fresh);
    return (memoSid = fresh);
  } catch {
    // Safari private mode throws on sessionStorage access, and crypto.randomUUID
    // is missing on insecure origins. An in-memory id is still correct for this
    // page's lifetime, which is most of what it is for. Mirrors the try/catch
    // in src/lib/storage.ts, for the same reason.
    return (memoSid ??= fallbackId());
  }
}

function fallbackId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    const hex = (n: number) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
    return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(8)}${hex(4)}`;
  }
}

// ---------------------------------------------------------------------------
// The transport
// ---------------------------------------------------------------------------

async function defaultSend(body: string, mode: SendMode): Promise<void> {
  /*
   * BEACON ONLY ON THE HIDE PATH, where it is uniquely capable: a fetch issued
   * as the page is torn down may be cancelled, and `keepalive` on iOS Safari is
   * not something to bet the last batch of a session on. Everywhere else uses
   * fetch, because sendBeacon returns only a boolean "queued" -- never a status
   * -- so a 500 from the collector would be invisible and nothing could be
   * re-queued.
   */
  if (mode === 'beacon' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    if (!ok) throw new Error('sendBeacon refused the batch');
    return;
  }

  await fetch(ENDPOINT, {
    method: 'POST',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body,
  });
}

let send: Transport = defaultSend;

// ---------------------------------------------------------------------------
// The batcher
// ---------------------------------------------------------------------------

export const track: TrackFn = <N extends EventName>(name: N, props: EventProps<N>): void => {
  try {
    listen();
    enqueue({ name, props: props as unknown as Record<string, EventPropValue>, seq: seq++, t: Date.now() });
  } catch (err) {
    // A card tap must not die because analytics did.
    console.warn('[analytics] track failed', err);
  }
};

function enqueue(event: QueuedEvent): void {
  queue.push(event);
  if (event.name !== 'analytics.events_dropped') cap();

  if (queue.length >= BATCH_MAX) {
    flush('fetch');
    return;
  }
  timer ??= setTimeout(() => flush('fetch'), BATCH_DELAY_MS);
}

/**
 * Enforce QUEUE_MAX by dropping the OLDEST, and account for every drop.
 *
 * Oldest first because the newest events are the ones describing whatever the
 * user is doing right now, which is what anyone debugging a report will look
 * for. The marker lives at the tail so it cannot drop itself, and there is only
 * ever one of it: a queue that has overflowed six times should say "we lost 120
 * events", not carry six separate confessions of twenty.
 */
function cap(): void {
  if (queue.length <= QUEUE_MAX) return;

  let dropped = queue.length - QUEUE_MAX;
  queue.splice(0, dropped);

  if (dropMarker && queue.includes(dropMarker)) {
    (dropMarker.props.count as number) += dropped;
    return;
  }

  // The marker itself takes a slot, so one more has to go.
  if (queue.length >= QUEUE_MAX) {
    queue.splice(0, 1);
    dropped += 1;
  }
  dropMarker = {
    name: 'analytics.events_dropped',
    props: { count: dropped, reason: 'queue_overflow' },
    seq: seq++,
    t: Date.now(),
  };
  queue.push(dropMarker);
}

/** Send whatever is queued right now. Exported for tests and the iframe harness. */
export function flushNow(): void {
  flush('fetch');
}

function flush(mode: SendMode): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;

  // Take it all and clear immediately: anything tracked while the request is in
  // flight belongs to the next batch, not this one.
  const batch = queue;
  queue = [];
  dropMarker = null;

  /*
   * `seq` is why the batch needs no clock trust. The server stamps `created_at`
   * at receipt for the whole batch and within-batch ordering is recovered from
   * `seq`, a monotonic integer per browser session. Reconstructing order from a
   * client `Date.now()` would mean trusting a clock that is routinely wrong by
   * minutes and occasionally by years -- `t` is sent for diagnosis only.
   */
  const envelope = {
    session_id: getSessionId(),
    local_date: todayKey(),
    tz_offset: -new Date().getTimezoneOffset(),
    sent_at: Date.now(),
    events: batch,
  };

  let body: string;
  try {
    body = JSON.stringify(envelope);
  } catch (err) {
    // A prop that cannot be serialized would poison every future flush if the
    // batch went back on the queue. Drop it and say so.
    console.warn('[analytics] batch could not be serialized; dropped', err);
    return;
  }

  void Promise.resolve()
    .then(() => send(body, mode))
    .catch(() => requeue(batch));
}

/** Failed batches go to the FRONT: they are older than anything that arrived
 *  while the request was in flight. */
function requeue(batch: QueuedEvent[]): void {
  queue.unshift(...batch);
  // Re-adopt a marker that came back with the batch, so the counts keep
  // coalescing instead of accumulating one confession per overflow.
  dropMarker = queue.find((e) => e.name === 'analytics.events_dropped') ?? null;
  cap();
  timer ??= setTimeout(() => flush('fetch'), BATCH_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Registered lazily on the first `track()`, not at module load, so importing
 * this module in a server component's dependency graph does nothing.
 *
 * NO `beforeunload` AND NO `unload` (plan A6). iOS Safari does not fire `unload`
 * reliably, and registering a `beforeunload` handler disqualifies the page from
 * the back/forward cache. This is a phone app: `visibilitychange` is the only
 * event that fires when the user swipes to another app, which is the most
 * common way a session here actually ends.
 */
function listen(): void {
  if (listening) return;
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  listening = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush('beacon');
  });
  window.addEventListener('pagehide', () => flush('beacon'));
}

// ---------------------------------------------------------------------------
// Test seams -- the same pattern src/lib/ratelimit.ts already uses
// ---------------------------------------------------------------------------

export function _setTransport(next: Transport | null): void {
  send = next ?? defaultSend;
}

export function _pending(): ReadonlyArray<QueuedEvent> {
  return queue.slice();
}

export function _reset(): void {
  queue = [];
  seq = 0;
  dropMarker = null;
  if (timer !== null) clearTimeout(timer);
  timer = null;
  memoSid = null;
  send = defaultSend;
}
