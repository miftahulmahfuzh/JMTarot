/**
 * The one thing everything calls. SERVER ONLY.
 *
 * `import { track } from '@/lib/analytics/track'` in a route handler, a server
 * component or a server action. A CLIENT COMPONENT MUST IMPORT
 * `./track.client` INSTEAD -- this module pulls `node:async_hooks` and
 * `next/server` and would fail the build in a browser bundle. Both declare the
 * same `TrackFn` type, so the call sites are identical and only the import line
 * differs.
 *
 * NEVER `await track(...)`. It returns `void` (plan A2) and that is the
 * enforcement rather than a convention: analytics must never be on the path of
 * a byte the user is waiting for, and a rule that lives only in a review
 * comment gets broken inside six weeks by somebody debugging something else.
 *
 * TRACK() NEVER THROWS. The whole body is inside a try/catch. A malformed prop,
 * an exhausted buffer, a bug in `defer` -- none of it may propagate into a card
 * tap or a reading request. There is a test that passes it a deliberately
 * hostile props object.
 *
 * WHY AsyncLocalStorage AND NOT React's `cache()` (plan A4). `cache()` is
 * request-scoped in Next and NOT request-scoped in a bare Vitest process, so
 * every buffering test would need a React server runtime to mean anything. ALS
 * behaves identically in a route handler, a server component and a unit test.
 *
 * DO NOT INSTRUMENT MIDDLEWARE. It runs on the edge in a separate invocation:
 * ALS set there does not reach the route handler, and `after()` has no meaning
 * on that runtime.
 */
import { after } from 'next/server';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Locale } from '@/data/types';
import type { LlmCallRecord } from '@/lib/llm/ledger';
import type { EventName, EventProps, EventPropValue, PendingEvent, TrackFn } from './events';
import { flushCalls, flushEvents } from './flush';
import { utcDateString } from './localdate';

export type AnalyticsContext = {
  /** `users.id`, from W2's `currentUser()`. Null before sign-in. */
  userId: string | null;
  /** The browser session id from the `x-jm-session` header. Null if absent or malformed. */
  sessionId: string | null;
  locale: Locale;
  /** Already through `parseLocalDate()`. Always a real `YYYY-MM-DD`. */
  localDate: string;
};

type Store = {
  ctx: AnalyticsContext;
  buffer: PendingEvent[];
  deferred: Array<() => Promise<void>>;
  /**
   * A2's ledger rows. **ITS OWN BUFFER, AND THE REASON IS `drain()`'s ORDERING**
   * (reconciliation R17) -- see the comment on the flush block in `drain`. It is not
   * folded into `buffer`, because these are rows in a different table with a
   * different shape and a different statement.
   */
  calls: LlmCallRecord[];
  registered: boolean;
};

const als = new AsyncLocalStorage<Store>();

/**
 * `'0'` makes every write a no-op, which is what lets `npm test` and
 * `npm run smoke` run with no database (reconciliation R20). Read per call
 * rather than at module scope so a test can flip it; this is not a hot path
 * relative to a model call.
 */
function enabled(): boolean {
  return process.env.ANALYTICS_ENABLED !== '0';
}

/** `ANALYTICS_DEBUG=1`: the "is this even firing?" loop, minus a psql round trip. */
function debugEnabled(): boolean {
  return process.env.ANALYTICS_DEBUG === '1';
}

/**
 * Ids, counts and the error's class. Never its message, and never props.
 *
 * Same obligation as `flush.ts`'s: a driver error quotes the statement it
 * failed on, and one of those statements binds `readings.question`. The full
 * error is printed in development only.
 */
export function logAnalyticsFailure(where: string, err: unknown, extra?: object): void {
  try {
    const kind = err instanceof Error ? err.name : typeof err;
    const detail = JSON.stringify({ ...extra, kind });
    if (process.env.NODE_ENV === 'production') {
      console.error(`[analytics] ${where} failed`, detail);
    } else {
      console.error(`[analytics] ${where} failed`, detail, err);
    }
  } catch {
    // A logger that throws must not take a reading down with it.
  }
}

// ---------------------------------------------------------------------------
// The one after() per request
// ---------------------------------------------------------------------------

function ensureRegistered(store: Store): void {
  /*
   * EXACTLY ONE `after()` PER REQUEST. Registering one per track() call would
   * give a request that fires nine events nine callbacks and nine inserts,
   * which is the whole batching claim gone by accident.
   */
  if (store.registered) return;
  store.registered = true;

  after(async () => {
    /*
     * RE-ENTER THE STORE. `after()` callbacks are not guaranteed to run inside
     * the ALS context that registered them, and without this a track() from
     * inside deferred work would silently take the fallback path and emit a
     * second one-row insert. It would still work; it would just quietly undo
     * the batching, which is the kind of regression nobody notices for months.
     */
    await als.run(store, () => drain(store));
  });
}

async function drain(store: Store): Promise<void> {
  /*
   * DEFERRED WORK RUNS BEFORE THE FLUSH, so events it emits -- `reading.completed`,
   * which cannot exist until the stream closes -- make it into the same batch.
   */
  for (const job of store.deferred.splice(0)) {
    try {
      await job();
    } catch (err) {
      logAnalyticsFailure('deferred', err);
    }
  }

  /*
   * ── A2's LEDGER, AND THIS BLOCK'S POSITION IS THE FEATURE ────────────────────
   *
   * **AFTER THE DEFERRED LOOP, FOR THE SAME REASON THE EVENT BUFFER IS** (roadmap
   * §6, reconciliation R17). The loop above iterates a SPLICED COPY, so anything a
   * deferred job pushes onto a live array lands after the iteration has already been
   * fixed -- which is why `track()` from inside a deferred job works and `defer()`
   * from inside one is silently orphaned. `gist`, `translation_repair` and the
   * `frequency` regeneration all record their ledger rows from in there, so **moving
   * this block above the loop loses three of the nine ops with a green suite.**
   * `track.test.ts` has a case that fails if it moves.
   *
   * BEFORE the event flush rather than after it, so the two failure modes stay
   * independent: a busy `events` insert must not cost a cost row, and vice versa.
   */
  const calls = store.calls.splice(0);
  if (calls.length > 0) {
    try {
      await flushCalls(store.ctx, calls);
    } catch (err) {
      // Same policy as the events flush: a missing ledger row breaks a dashboard,
      // and a 500 because the ledger was busy breaks a reading.
      logAnalyticsFailure('calls', err);
    }
  }

  const rows = store.buffer.splice(0);
  if (rows.length === 0) return;

  try {
    await flushEvents(store.ctx, rows);
  } catch (err) {
    // Events fail silently and log (roadmap §6). A dropped event is invisible;
    // a 500 because the event table was busy is not.
    logAnalyticsFailure('flush', err);
  }
}

// ---------------------------------------------------------------------------
// The public surface
// ---------------------------------------------------------------------------

/**
 * Install the request-scoped store and register exactly one `after()`.
 *
 * Wrap a handler body in this and every `track()` and `defer()` inside it
 * batches. Installed in `/api/reading` and `/api/events`; everything else is
 * client-fired.
 *
 * INVISIBLE TO THE HANDLER'S OWN CONTROL FLOW: it returns the handler's value
 * unchanged and propagates its rejection unchanged.
 */
export function withAnalytics<T>(ctx: AnalyticsContext, fn: () => Promise<T>): Promise<T> {
  if (!enabled()) return fn();
  const store: Store = { ctx, buffer: [], deferred: [], calls: [], registered: false };
  return als.run(store, fn);
}

/** The current context, or null outside a `withAnalytics` scope. */
export function analyticsContext(): AnalyticsContext | null {
  return als.getStore()?.ctx ?? null;
}

/**
 * Buffer one event onto the current request. Never throws. Never blocks.
 */
export const track: TrackFn = <N extends EventName>(name: N, props: EventProps<N>): void => {
  buffer(name, props as unknown as Record<string, EventPropValue>);
};

/**
 * The non-generic sibling, for values that came off the wire.
 *
 * ITS ONLY CALLER IS `/api/events`. The compile-time prop typing is useless
 * there -- the name was checked by `isEventName()` and the props by
 * `sanitizeProps()`, both at runtime -- and pretending otherwise would mean a
 * cast at the call site that reads as if it had been verified.
 */
export function trackRaw(name: EventName, props: Record<string, EventPropValue>): void {
  buffer(name, props);
}

function buffer(name: EventName, props: Record<string, EventPropValue>): void {
  try {
    if (!enabled()) return;
    if (debugEnabled()) console.debug('[analytics]', name, props);

    const event: PendingEvent = { name, props };
    const store = als.getStore();

    if (store) {
      store.buffer.push(event);
      ensureRegistered(store);
      return;
    }

    /*
     * THE FALLBACK PATH. A server component, a script, a test -- track() still
     * works, unbatched, with a context assembled from what can be known
     * without a request.
     *
     * Falling back to NOTHING would mean a whole surface silently records no
     * data because somebody forgot a wrapper, which is exactly the failure you
     * discover a month later with a hole in the funnel.
     */
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[analytics] unbatched track() outside withAnalytics:', name);
    }
    const ctx: AnalyticsContext = {
      userId: null,
      sessionId: null,
      locale: 'id',
      localDate: utcDateString(),
    };
    after(async () => {
      try {
        await flushEvents(ctx, [event]);
      } catch (err) {
        logAnalyticsFailure('flush', err);
      }
    });
  } catch (err) {
    logAnalyticsFailure('track', err, { name });
  }
}

/**
 * Capture this request's analytics scope, for work that runs AFTER THE RESPONSE HAS
 * ALREADY STARTED.
 *
 * ── THE BUG THIS EXISTS FOR ─────────────────────────────────────────────────
 *
 * **A `ReadableStream`'s `pull()` DOES NOT RUN INSIDE THE ALS CONTEXT THAT BUILT
 * THE STREAM**, and it does not run inside a request scope at all. So `track()` and
 * `defer()` called from there both miss `als.getStore()`, take their fallback path,
 * and hit `after()` — which throws `` `after` was called outside a request scope ``.
 * Measured live on 2026-07-28: **every streamed translation lost its
 * `translation.generated` event AND its deferred repair pass**, both silently, for
 * as long as V2 had shipped.
 *
 * `ensureRegistered`'s own comment already records half of this — `after()` callbacks
 * are not guaranteed to run inside the context that registered them, which is why
 * `drain` re-enters the store. This is the same fact one step earlier: a stream's
 * `pull()` is the OTHER place work escapes the scope, and it escapes it harder,
 * because there is no `after()` to be inside of yet.
 *
 * ── HOW TO USE IT ───────────────────────────────────────────────────────────
 *
 * Call it **synchronously, while still in the handler**, and use the returned
 * function to wrap anything that will run later:
 *
 *     const inScope = bindAnalyticsScope();          // in the handler
 *     …
 *     inScope(() => track('…', {…}));                // later, inside pull()
 *
 * **IT REGISTERS THE `after()` EAGERLY, AND THAT IS THE LOAD-BEARING PART.**
 * `als.run(store, fn)` alone would let a later `track()` push onto the buffer — but
 * if that were the request's FIRST event, `ensureRegistered` would call `after()`
 * from inside `pull()` and throw exactly as before. Registering here, in the
 * handler, means the callback exists before anything needs it. The cost is one
 * `after()` on a request that turns out to emit nothing, and `drain` returns early on
 * an empty buffer.
 *
 * Outside a scope it is the identity, so a script or a test calling the wrapped work
 * behaves exactly as it does today.
 */
export function bindAnalyticsScope(): <T>(fn: () => T) => T {
  try {
    if (!enabled()) return (fn) => fn();
    const store = als.getStore();
    if (!store) return (fn) => fn();
    ensureRegistered(store);
    return (fn) => als.run(store, fn);
  } catch (err) {
    logAnalyticsFailure('bind', err);
    return (fn) => fn();
  }
}

/**
 * Register work to run inside this request's single `after()` callback, before
 * the event flush.
 *
 * For anything that has to wait on something the handler cannot await -- the
 * reading stream, chiefly. Never throws; the callback's own failures are caught
 * and logged.
 */
export function defer(fn: () => Promise<void>): void {
  try {
    if (!enabled()) return;

    const store = als.getStore();
    if (store) {
      store.deferred.push(fn);
      ensureRegistered(store);
      return;
    }

    // Outside a scope there is no batch to join, but the work still has to
    // happen -- this is the reading write, not a metric.
    after(async () => {
      try {
        await fn();
      } catch (err) {
        logAnalyticsFailure('deferred', err);
      }
    });
  } catch (err) {
    logAnalyticsFailure('defer', err);
  }
}

/**
 * Buffer one `llm_calls` row onto this request. A2, v0.5.0.
 *
 * **CALL IT THROUGH `recordCall()` IN `@/lib/llm/ledger`, NEVER DIRECTLY** -- that is
 * where the contract and the whole argument for the three branches below live, and
 * where `ANALYTICS_ENABLED` is checked. This function is the mechanism; that one is
 * the interface.
 *
 * ── WHY IT IS NOT `defer()` AND NOT A BARE `after()` ────────────────────────────
 *
 * Not `defer()`: `drain()` iterates a spliced copy of `store.deferred`, so a
 * `defer()` from inside a deferred job is orphaned -- and `gist`,
 * `translation_repair` and the `frequency` regeneration all record from in there.
 * `store.calls` is spliced *after* that loop, exactly as the event buffer is, so it
 * catches rows produced by deferred work by construction (reconciliation R17).
 *
 * Not a bare `after()` per row: it throws inside a `ReadableStream`'s `pull()` --
 * V2 measured `` `after` was called outside a request scope `` there -- and probably
 * inside another `after()` too, which is exactly branch 3 below.
 *
 * Not an `await` inside `metered()`: that is a database round trip on the moderation
 * classifier's path, which A-D6 forbids in words.
 *
 * **RETURNS A PROMISE THAT IS ALREADY RESOLVED ON BRANCHES 1 AND 2.** Only branch 3
 * awaits I/O, and it is reachable only where `after()` refuses -- i.e. where there is
 * no request left to delay.
 */
export async function bufferCall(row: LlmCallRecord): Promise<void> {
  const store = als.getStore();
  if (store) {
    store.calls.push(row);
    ensureRegistered(store);
    return;
  }

  /*
   * OUTSIDE ANY SCOPE. Three of W3's onboarding routes are here on purpose:
   * reconciliation R49 accepted unattributed Lotus rows rather than spending A2's
   * diff on three W3 handlers, so those rows get a null `user_id`, a null `locale`
   * and a UTC `local_date`. `docs/analytics-queries.md` carries the query that names
   * them, and A5's per-user cost page must say Lotus distillations are unattributed.
   */
  const ctx: AnalyticsContext = {
    userId: null,
    sessionId: null,
    locale: 'id',
    localDate: utcDateString(),
  };

  try {
    after(async () => {
      try {
        await flushCalls(ctx, [row]);
      } catch (err) {
        logAnalyticsFailure('calls', err);
      }
    });
  } catch {
    /*
     * BRANCH 3: `after()` REFUSED, so this is inside another `after()` callback or in
     * a script -- provably off any request path. Awaiting the insert here is the only
     * way the row survives at all, and the alternative is losing it silently.
     */
    try {
      await flushCalls(ctx, [row]);
    } catch (err) {
      logAnalyticsFailure('calls', err);
    }
  }
}
