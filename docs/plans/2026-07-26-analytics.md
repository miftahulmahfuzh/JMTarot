# W4 — Analytics & Reading History — Implementation Plan

> **RECONCILED 2026-07-26. `docs/plans/2026-07-26-RECONCILIATION.md` outranks
> this file.**
>
> Resolutions that change this plan:
> - **R3 — you own the whole `src/lib/llm/` interface change, and it lands
>   once.** Merge W7's needs into your D-E: `complete()` plus `AbortSignal` on
>   **both** methods and `model` on `complete`. Your open question 4 is settled
>   centrally — **the intersection type stays.** Carry W7's trap into the
>   interface's doc comment: `streamReading` is `async *`, so **calling it starts
>   nothing**; a caller wanting concurrency must pull `.next()` before awaiting.
>   Without that line, D8's concurrent classifier silently serializes.
> - **R1** — replace every `getSessionUser()` with W2's `currentUser()`; the
>   reading route uses `requireUser()`. `hit()` is keyed by `user.id`.
> - **R5** — `readings.prompt_version` is `<locale>-v1.<sha8>`, merging your hash
>   with W6's locale prefix. W6 implements it in `buildPrompt`.
> - **R8 — the reading route no longer always returns 200.** W7's buffer moved
>   before the response headers so a refusal can be a `403 application/json`
>   carrying a link. Your plan assumes the status is committed before generation.
> - **R9** — your per-table erasure contract is **adopted over the roadmap's
>   blanket cascade**, which was too blunt. The roadmap is amended.
> - **R7** — your open question 1 is answered: failed and aborted readings **do**
>   count toward the frequency verdict. No new column; `blocked` readings write
>   no `reading_cards` rows.
> - Your open questions 3 (`latency_ms` = TTFT) and 9 (`ANALYTICS_ENABLED=0` in
>   CI) are **confirmed**; W1's `withTestDb` sets it back to `1` explicitly.
>   Question 5 (`events` retention) is answered by **R19: 180 days**. Question 7
>   (`/api/events` ownership): **you build it, W7 reviews it.**
> - Your zero-token finding on z.ai is carried into the reconciliation so nobody
>   builds a cost dashboard on a column that will read `NULL`.

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers-extended-cc:executing-plans` to implement this plan task-by-task.

**Workstream:** W4 of seven. See `PUBLIC_RELEASE_ROADMAP.md` — that file is the
contract, this file is one party to it. Where the two disagree, the roadmap
wins and this file is wrong.

**Goal:** Persist every reading and every meaningful choice a user makes, and
do it in a way that cannot cost the querent a single millisecond of the thing
they are waiting for.

**Owns:** `src/lib/analytics/**`, `src/app/api/events/route.ts`, and the
`after()` write path wherever it appears.

**Depends on:** W1 (the Drizzle schema and client), W2 (a database user id and
one middleware exemption).

**Depended on by:** W5 — every memory feature in roadmap §5 is a query against
rows this workstream writes. If the write shape is wrong, W5 discovers it three
weeks later with a half-built feature.

---

## 1. The requirement, and what it actually forbids

Miftah, verbatim: *"design an architecture in such a way that db interactions do
not become a blocking that increase latency. user experience is everything to
me."*

Roadmap §6 restates it as an engineering rule: **the database must never be in
the way of a byte the user is waiting for.** That rule is easy to nod at and
easy to violate by accident, so here is what it concretely forbids in this
workstream:

- **No `await` on an analytics call in a handler.** Not `await track(...)`, not
  `await Promise.all([reading, analytics])`. The way to guarantee this is not
  discipline; it is a return type of `void`. A function that returns `void`
  cannot be usefully awaited, and nobody adds an `await` in front of one. If
  `track()` returned a `Promise`, someone would await it inside six weeks,
  probably while debugging something unrelated, and it would ship.
- **No DB round trip between the request arriving and the first token going
  out.** The reading route currently touches nothing but memory before it calls
  the provider. That property survives. The one read the roadmap permits — the
  Lotus block, W3's — is not mine and is explicitly cached.
- **No second consumer of the reading stream that can apply backpressure.**
  The prose is streaming to a person watching it appear. Anything that reads
  that stream in parallel must be incapable of slowing it down. This is why
  §7 does not use `ReadableStream.tee()`, which can.
- **No analytics failure that becomes a user-visible failure.** `track()` never
  throws. The collector route never returns anything but `204`. A dead database
  degrades the product's memory; it does not degrade the reading.

Everything below is a consequence of those four.

---

## 2. Decisions

Each was a real fork. Recorded so they are not relitigated, and so the next
person understands why the obvious thing was not done.

| # | Decision | Choice | Why |
|---|---|---|---|
| A1 | Event names | **Closed TypeScript union, mapped to a per-event prop shape** | An open `string` field is unqueryable within a month. Not hypothetically: you get `reader_chosen` and `reader.chosen` and `readerChosen` from three different files, you get names nobody removed after the feature died, and you get no way to know what props a given name carries without grepping every call site. A closed union makes a rename a compile error, makes the props checked where they are written, and makes `EVENT_NAMES` a literal data dictionary a human can read in one screen. |
| A2 | `track()` return type | **`void`, always, on both server and client** | See §1. The type is the enforcement. |
| A3 | One `track()` or two | **Two modules, one shared signature type** — `track.ts` (server) and `track.client.ts` (client) | An isomorphic `track.ts` that branches on `typeof window` still has to *import* the server implementation, which drags `node:async_hooks` and `next/server` into the client bundle and fails the build. Conditional exports would work and are a lot of machinery for two files. Instead both modules declare `export const track: TrackFn` against a single exported `TrackFn` type, so a drift in either signature is a compile error. Roadmap §6's "the interface boundary is `track.ts`" survives: the client path posts to a route that calls the *server* `track()`, so there is still exactly one writer and exactly one place a queue would go. |
| A4 | Server-side request scoping | **`AsyncLocalStorage`** | The alternative is React's `cache()`, which is request-scoped in Next but is not request-scoped in a bare Vitest process, so every buffering test would need a React server runtime to mean anything. ALS works identically in a route handler, a server component, and a unit test. The route is already `runtime = 'nodejs'`. |
| A5 | Client transport | **Batched. `fetch(keepalive)` normally, `sendBeacon` on the hide path** | One request per click is a request per click. Twenty card taps during a draw is twenty POSTs competing with the reading stream for the same connection — analytics actively degrading the thing it is measuring. Batching makes a whole draw one request. `sendBeacon` is used only where it is uniquely capable: it survives the page going away. `fetch(keepalive)` is used everywhere else because it reports failures, which lets the batcher re-queue. |
| A6 | Unload detection | **`visibilitychange` → `hidden`, and `pagehide`. Never `beforeunload`/`unload`** | iOS Safari does not reliably fire `unload`, and registering a `beforeunload` handler disqualifies the page from the back/forward cache. This app is a phone app. `visibilitychange` is the only event that fires when a user swipes to another app, which is the most common way a session ends here. |
| A7 | Browser session id | **`crypto.randomUUID()` in `sessionStorage`, sent on a header** | `sessionStorage` dies with the tab, which is what "browser session" means; `localStorage` would make it a device id, which is a different thing with different privacy weight. A header (`x-jm-session`) rather than a cookie: a cookie rides on every image request in the fan and survives the tab. |
| A8 | Reading stream capture | **Manual fan-out inside the existing `ReadableStream`, not `tee()`** | `tee()` gives two branches with independent queues; if one branch is drained slower than the other, the fast branch's chunks pile up in the slow branch's queue and backpressure eventually couples them. The "second consumer" here is `parts.push(chunk)` — a synchronous array append. A manual fan-out is both simpler and structurally incapable of delaying the client. |
| A9 | When `after()` runs relative to the stream | **Do not assume. Park the callback on a promise the stream settles.** | Next is documented as running `after()` once the response is finished, which for a streaming body ought to mean after the stream closes. "Ought to" is not a foundation for the one write the memory features depend on. The `after()` callback awaits a promise the stream's `finally`/`cancel` resolves, raced against a timeout. This is correct whether `after()` fires at header-flush or at stream-close, and it is the same code either way. |
| A10 | Failure policy | **Events fail silently and log. `readings` gets a bounded retry.** | Roadmap §6. A dropped event is invisible; a missing `readings` row breaks a user-facing feature. |
| A11 | Retry shape | **3 attempts, 0/250/1000ms + jitter, 5s total budget, transient errors only** | `after()` is not infinite and holding an invocation open costs money. Retrying a `not null` violation is pure waste — it will fail identically forever. Classify on the Postgres SQLSTATE and give up on anything deterministic. |
| A12 | `latency_ms` semantics | **Time to first token**, measured from request receipt to the first byte enqueued to the client. Total generation time goes in the `reading.completed` event props. | §3 has one column and two candidate meanings. TTFT is the number Miftah's requirement is about — it is the wait. Total duration correlates with cost, not with experience, and it costs nothing to put in a jsonb field. An ambiguous latency column is worse than no latency column, so this is written down rather than inferred. |
| A13 | Token usage | **The `LLMProvider` interface changes to expose it.** Absent usage is stored as `NULL`, never `0`. | It cannot be obtained any other way — the provider yields strings. z.ai reports `input_tokens: 0`, verified in the rewrite plan §4, so on the current provider these columns will be mostly empty. Storing `0` would make every average silently wrong. See §8 — this is a cross-workstream change. |
| A14 | `prompt_version` | **`v1.<sha256(static system layers).slice(0,8)>`, computed by `buildPrompt`** | §3 asks that "a prompt change is visible in the data". A hand-bumped constant requires discipline that nobody has at 11pm. A hash requires none and is exact. It hashes only the *static* layers (base + persona + service + locale) and excludes the Lotus block and the memory block, or it would vary per user and stop being a version. |
| A15 | Client-supplied `local_date` | **Trusted in shape, bounded in range, never rejected** | Roadmap §7. The server cannot know the querent's calendar day. It is untrusted input, so it is validated to a real date within ±1 day of the server's UTC date — the widest real offsets are UTC−12 to UTC+14, so a legitimate client is never further off than that. But an invalid date must **never** fail a reading: it falls back to the server's UTC date and emits an event, so the breakage is detectable instead of silent. |
| A16 | Free text in `events.props` | **Forbidden, and enforced at runtime** | `events` is the firehose. It is the table with the loosest access story, the longest retention, and the one that keeps rows after a user is deleted (`user_id` set to null). It must therefore contain nothing that can re-identify anyone. Props are scalars only, strings are truncated to 120 characters by the flusher, and the taxonomy has no free-text field. This is what makes "keep anonymised events after erasure" an honest claim rather than a fig leaf. |
| A17 | Blocked readings | **A `readings` row, no `reading_cards` rows** | A refused question is a reading attempt and belongs in history. But the whole reason `reading_cards` is denormalized is that the frequency query must be a single-table scan; adding a status column there, or a join to filter blocked draws out, gives that back. So cards are written only for readings that produced prose. |
| A18 | A queue | **Not now.** | Roadmap §6 says so explicitly and names the escape hatch. §10 gives the threshold at which the answer changes and the query that measures it. |

---

## 3. The event taxonomy

`src/lib/analytics/events.ts`. One file, no imports except the locale type, and
it is meant to be read top to bottom by a human who wants to know what the app
records.

### Naming

`domain.verb_object`, dot-separated namespace, `snake_case` within a segment.
This matches §3's column convention and it makes `where name like 'reading.%'`
a useful query, which a flat `reading_completed` namespace does not.

### Shape

```ts
export const EVENT_NAMES = [
  // — session and identity —
  'auth.signed_in',
  'auth.signed_out',
  'auth.session_expired',

  // — onboarding (W3 fires these) —
  'onboarding.started',
  'onboarding.question_answered',
  'onboarding.question_skipped',
  'onboarding.completed',
  'onboarding.abandoned',
  'onboarding.lotus_generated',

  // — navigation and choice —
  'reader.viewed',
  'reader.chosen',
  'service.chosen',

  // — the draw —
  'draw.started',
  'draw.card_picked',
  'draw.card_returned',
  'draw.card_detail_opened',
  'draw.reshuffled',
  'draw.completed',

  // — the question field —
  'question.typed',
  'question.skipped',

  // — the reading —
  'reading.requested',
  'reading.first_token',
  'reading.completed',
  'reading.failed',
  'reading.aborted',
  'reading.retried',
  'reading.rate_limited',

  // — memory features (W5 fires these) —
  'summary.shown',
  'frequency.shown',

  // — locale (W6) —
  'locale.changed',

  // — trust and safety (W7) —
  'terms.viewed',
  'terms.accepted',
  'privacy.viewed',
  'moderation.refused',

  // — the app shell —
  'app.launched',

  // — self-diagnostics —
  'analytics.local_date_fallback',
  'analytics.events_dropped',
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Props are flat scalars. See decision A16 and §11. */
export type EventPropValue = string | number | boolean | null;

export type EventMap = {
  'auth.signed_in':            { method: 'google' | 'dev_password'; returning: boolean };
  'auth.signed_out':           Record<string, never>;
  'auth.session_expired':      { at_path: string };

  'onboarding.started':        { version: number };
  'onboarding.question_answered': { question_key: string; length: number; index: number };
  'onboarding.question_skipped':  { question_key: string; index: number };
  'onboarding.completed':      { version: number; answered: number; skipped: number; elapsed_ms: number };
  'onboarding.abandoned':      { version: number; last_index: number };
  'onboarding.lotus_generated':{ model: string; source_version: number; latency_ms: number };

  'reader.viewed':             { reader_id: string; from: 'picker' | 'direct' | 'back' };
  'reader.chosen':             { reader_id: string };
  'service.chosen':            { reader_id: string; service_id: string };

  'draw.started':              { reader_id: string; service_id: string; card_count: number; reduced_motion: boolean };
  'draw.card_picked':          { reader_id: string; service_id: string; card_id: number; reversed: boolean; slot: number };
  'draw.card_returned':        { card_id: number; slot: number };
  'draw.card_detail_opened':   { card_id: number; reversed: boolean; slot: number; during_reading: boolean };
  'draw.reshuffled':           { reader_id: string; service_id: string; picks_discarded: number };
  'draw.completed':            { reader_id: string; service_id: string; elapsed_ms: number };

  'question.typed':            { reader_id: string; service_id: string; length: number };
  'question.skipped':          { reader_id: string; service_id: string };

  'reading.requested':         { reading_id: string; reader_id: string; service_id: string; card_count: number;
                                 has_question: boolean; question_length: number;
                                 lotus_present: boolean; memory_block_present: boolean; prompt_version: string };
  'reading.first_token':       { reading_id: string; latency_ms: number };
  'reading.completed':         { reading_id: string; reader_id: string; service_id: string;
                                 latency_ms: number; total_ms: number; chars: number;
                                 token_input: number | null; token_output: number | null;
                                 truncated: boolean; status: 'ok' | 'partial' };
  'reading.failed':            { reading_id: string; reader_id: string; service_id: string;
                                 stage: 'validation' | 'prompt' | 'connect' | 'stream';
                                 chars_before_failure: number; error_kind: string };
  'reading.aborted':           { reading_id: string; chars_before_abort: number; reason: 'user' | 'navigation' | 'timeout' };
  'reading.retried':           { reader_id: string; service_id: string; attempt: number };
  'reading.rate_limited':      { reader_id: string; service_id: string; retry_after_s: number };

  'summary.shown':             { reader_id: string; source_count: number; cached: boolean; chars: number };
  'frequency.shown':           { window: string; top_card_id: number; second_card_id: number | null; sample: number };

  'locale.changed':            { from: string; to: string; surface: 'settings' | 'onboarding' | 'auto' };

  'terms.viewed':              { version: string; from: string };
  'terms.accepted':            { version: string };
  'privacy.viewed':            { version: string; from: string };
  'moderation.refused':        { source: 'blocklist' | 'classifier'; category: string;
                                 confidence_bucket: 'low' | 'medium' | 'high' | null;
                                 reader_id: string; service_id: string };

  'app.launched':              { standalone: boolean; referrer_kind: 'direct' | 'internal' | 'external' };

  'analytics.local_date_fallback': { reason: 'absent' | 'malformed' | 'out_of_range'; received: string | null; surface: string };
  'analytics.events_dropped':  { count: number; reason: 'unknown_name' | 'queue_overflow' | 'oversize_batch' };
};

export type EventProps<N extends EventName> = EventMap[N];

/** The one signature both `track` implementations must satisfy. */
export type TrackFn = <N extends EventName>(name: N, props: EventProps<N>) => void;
```

Two compile-time guards keep the array and the map honest in both directions:

```ts
// Every name in EVENT_NAMES has a prop shape, or this line errors.
type _EveryNameHasProps = EventMap[EventName];
// EventMap declares no name that is not in EVENT_NAMES.
type _NoOrphans = Exclude<keyof EventMap, EventName>;
const _noOrphans: _NoOrphans extends never ? true : never = true;
void _noOrphans;
```

And one runtime guard, because the collector route receives names off the wire
and a type cannot check those:

```ts
const NAME_SET: ReadonlySet<string> = new Set(EVENT_NAMES);
export function isEventName(v: unknown): v is EventName {
  return typeof v === 'string' && NAME_SET.has(v);
}
```

### Rules for adding an event

Written here because the taxonomy will grow and the ways it goes wrong are
predictable.

1. **No free text in props, ever.** `question.typed` carries a `length`, not
   the question. `onboarding.question_answered` carries a `length`, not the
   answer. If you find yourself wanting the text, the text belongs in a real
   table with a real column and a real retention story. See A16 and §11.
2. **No unbounded cardinality.** `error_kind` is a short classifier
   (`'timeout'`, `'upstream_5xx'`, `'aborted'`), not `err.message`. A props key
   whose value space is unbounded makes every `group by` useless.
3. **Ids are ids.** `card_id` is the integer, not the name. `reader_id` is the
   slug. Names are display strings and they will be translated by W6; the data
   must not be.
4. **Prefer one event with props over five events.** `draw.card_picked` with a
   `slot` prop, not `draw.card_picked_slot_0`.
5. **A prop that is sometimes absent is `| null`, not optional.** jsonb with a
   missing key and jsonb with an explicit null behave differently in a `where`
   clause, and the second one is the one you want.

---

## 4. `track()` — the server side

`src/lib/analytics/track.ts`. Server only. Three exported functions and one
type; everything else in the workstream is plumbing behind them.

```ts
import { after } from 'next/server';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { EventName, EventProps, TrackFn } from './events';

export type AnalyticsContext = {
  /** The database uuid, from W2. Null before sign-in. */
  userId: string | null;
  /** The browser session id from the x-jm-session header. Null if absent or malformed. */
  sessionId: string | null;
  locale: 'id' | 'en';
  /** Already validated by parseLocalDate(). Always a real YYYY-MM-DD. */
  localDate: string;
};

/** Buffer one event onto the current request. Never throws. Never blocks. */
export const track: TrackFn;

/**
 * Register work to run inside this request's single after() callback, before
 * the event flush. Use it for anything that has to wait on something the
 * handler cannot await -- the reading stream, chiefly. Never throws; the
 * callback's own failures are caught and logged.
 */
export function defer(fn: () => Promise<void>): void;

/**
 * Install the request-scoped store and register exactly one after() callback.
 * Wrap a handler body in this and every track()/defer() inside it batches.
 */
export function withAnalytics<T>(ctx: AnalyticsContext, fn: () => Promise<T>): Promise<T>;

/** The current context, or null outside a withAnalytics scope. */
export function analyticsContext(): AnalyticsContext | null;
```

### How it behaves

```ts
type Store = {
  ctx: AnalyticsContext;
  buffer: PendingEvent[];
  deferred: Array<() => Promise<void>>;
  registered: boolean;
};

const als = new AsyncLocalStorage<Store>();
```

`withAnalytics(ctx, fn)` creates the store, runs `fn` inside `als.run`, and on
the **first** `track()` or `defer()` registers one `after()`:

```ts
after(async () => {
  // Re-enter the store so track() called from inside deferred work still
  // lands in the same buffer instead of taking the fallback path.
  await als.run(store, async () => {
    for (const job of store.deferred) {
      try { await job(); }
      catch (err) { logAnalyticsFailure('deferred', err); }
    }
    try { await flushEvents(store.ctx, store.buffer.splice(0)); }
    catch (err) { logAnalyticsFailure('flush', err); }
  });
});
```

Three properties of that shape are load-bearing:

- **Exactly one `after()` per request.** Registering one per `track()` call
  would give a request that fires nine events nine callbacks and nine inserts.
- **Deferred work runs before the flush**, so events emitted during it
  (`reading.completed`, which cannot exist until the stream closes) make it
  into the same batch.
- **The store is re-entered.** `after()` callbacks are not guaranteed to run
  inside the ALS context that registered them. Without `als.run` here, a
  `track()` from inside `defer()`'d work would silently take the fallback path
  and emit a second, one-row insert. It would still work; it would just quietly
  undo the batching. Wrapping is one line and removes the question.

### The fallback path

`track()` outside a `withAnalytics` scope — a server component, a script, a
test — still works. It registers its own `after(() => flushEvents(ctx, [ev]))`
using a context assembled from whatever it can find, and logs a `debug` line in
development saying it took the unbatched path. Falling back to *nothing* would
mean a whole surface silently records no data because someone forgot a wrapper,
which is exactly the failure you find out about a month later.

In practice `withAnalytics` is installed in two places initially:
`/api/reading` and `/api/events`. Everything else is client-fired.

Middleware is **not** one of them and cannot be: it runs on the edge runtime in
a separate invocation, ALS set there does not reach the route handler, and
`next/server`'s `after()` has no meaning there. Do not instrument middleware.

### `track()` never throws

The whole body is inside a `try/catch`. A malformed prop, an exhausted buffer,
a bug in `defer` — none of it is allowed to propagate into a card tap or a
reading request. The catch logs once and returns. There is a test for this
(§13, Task 2) that passes a deliberately hostile props object.

---

## 5. `track()` — the client side

`src/lib/analytics/track.client.ts`, `'use client'`.

```ts
export const track: TrackFn;          // same signature as the server's
export function getSessionId(): string;
export function flushNow(): void;     // exported for tests and the harness
```

### The batcher

Module-scope state: a `queue`, a monotonic `seq`, and a debounce `timer`.

```
track(name, props)
  -> queue.push({ name, props, seq: seq++, t: Date.now() })
  -> if (queue.length >= BATCH_MAX) flush('fetch')
     else timer ??= setTimeout(() => flush('fetch'), BATCH_DELAY_MS)
```

`BATCH_MAX = 20`, `BATCH_DELAY_MS = 2000`. Two seconds is chosen against the
actual interaction rhythm: a three-card draw is three taps inside a few
seconds, so the whole draw batches into one request that lands while the user
is reading their cards.

`seq` is why the batch needs no clock trust. The server stamps `created_at` at
receipt for the whole batch; within-batch ordering is recovered from
`props.seq`, which is a monotonic integer per browser session. Reconstructing
order from a client `Date.now()` would mean trusting a clock that is routinely
wrong by minutes and occasionally by years.

### The flush

```
flush(mode)
  batch = queue.splice(0)                     // take it all, clear immediately
  envelope = { session_id, local_date: todayKey(), tz_offset: -new Date().getTimezoneOffset(),
               sent_at: Date.now(), events: batch }
  body = JSON.stringify(envelope)

  if (mode === 'beacon' && navigator.sendBeacon)
      ok = navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
      if (!ok) requeue(batch)                 // beacon queue full -- rare, but it reports it
  else
      fetch('/api/events', { method: 'POST', keepalive: true,
                             headers: { 'content-type': 'application/json' },
                             body })
        .catch(() => requeue(batch))
```

`requeue` puts the batch back at the **front** of the queue (they are older
than anything that arrived meanwhile) and enforces `QUEUE_MAX = 200` by
dropping the oldest overflow and emitting one `analytics.events_dropped`. An
unbounded retry queue on a phone that has been offline in a tunnel for twenty
minutes is a memory leak with a marketing name.

Why both transports rather than beacon everywhere: `sendBeacon` returns only a
boolean "queued", never a status, so a 500 from the collector is invisible and
nothing can be re-queued. `fetch(keepalive)` reports failures. Beacon is used
only on the hide path, where it is uniquely capable — a `fetch` issued as the
page is being torn down may be cancelled, and `keepalive` on iOS Safari is not
something to bet the last batch of a session on.

Note the `keepalive` cap: the spec limits the *total* body size of all
in-flight keepalive requests to 64KB. A twenty-event batch is a couple of KB.
`BATCH_MAX` and `QUEUE_MAX` keep this comfortably true; if either grows, this
is the constraint that bites.

### Lifecycle listeners

Registered once, lazily, on the first `track()` call — not at module load, so
importing the module in a server component's dependency graph does nothing.

```ts
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush('beacon');
});
window.addEventListener('pagehide', () => flush('beacon'));
```

No `beforeunload`, no `unload`. See A6.

### The session id

```ts
const SID_KEY = 'jm.sid';
let memo: string | null = null;

export function getSessionId(): string {
  if (memo) return memo;
  try {
    const existing = sessionStorage.getItem(SID_KEY);
    if (existing && UUID_RE.test(existing)) return (memo = existing);
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(SID_KEY, fresh);
    return (memo = fresh);
  } catch {
    // Safari private mode throws on sessionStorage access. An in-memory id is
    // still correct for this page's lifetime, which is most of what we want.
    return (memo ??= crypto.randomUUID());
  }
}
```

`sessionStorage`, not `localStorage`: a browser session is a tab, and a value
that outlives the tab is a device identifier, which is a materially different
thing to hold about a person. The `try/catch` mirrors the existing one in
`src/lib/storage.ts` and for the same reason.

The reading request carries it explicitly, because that request goes to a
different route than `/api/events`:

```ts
headers: {
  'content-type': 'application/json',
  'x-jm-session': getSessionId(),
  'x-jm-local-date': todayKey(),
}
```

### `track()` never throws, here too

Same rule, same reason, one more edge: `crypto.randomUUID` is unavailable on
insecure origins in some browsers. The whole client module degrades to a
no-op-with-a-console-warning rather than taking a card tap down with it.

---

## 6. The collector route

`src/app/api/events/route.ts`. Mine. Not in the roadmap's module map; adding it
here is the delta.

```ts
export const runtime = 'nodejs';   // ALS
```

### Request shape

```jsonc
{
  "session_id": "0f2c...-...",       // uuid
  "local_date": "2026-07-26",        // todayKey()
  "tz_offset": 420,                  // minutes east of UTC, informational
  "sent_at": 1785000000000,
  "events": [
    { "name": "draw.card_picked", "seq": 12, "t": 1784999998000, "props": { "card_id": 7, "reversed": false, "slot": 0 } }
  ]
}
```

### Validation, and why it is lenient

Zod, with three deliberate softnesses:

- **An unknown `name` drops that event and keeps the rest.** A client one
  deploy behind will send a name the server has since renamed. Rejecting the
  whole batch for it would throw away nineteen good events. Drops are counted
  and re-emitted as one `analytics.events_dropped`.
- **A malformed props object is replaced with `{}`, not rejected.** Same
  reasoning. The name and the timestamp are the load-bearing parts.
- **The response is `204 No Content`, always.** `sendBeacon` cannot read a
  response, so a `400` on the hide path is a message to nobody. Failures are
  logged server-side, where someone can actually see them.

The hard limits are the ones that protect the server, not the schema:
`events` array ≤ 50, request body ≤ 32KB (checked from `content-length` and
again after read), props ≤ 24 keys, each string value ≤ 120 chars (truncated,
not rejected — see §11).

### Authentication and abuse

This route must be reachable **without a session**, because `terms.viewed` and
a failed sign-in happen before there is one, and §3 explicitly allows
`events.user_id` to be null. That means one line in W2's `middleware.ts`
`isPublic()` — see §9.

An unauthenticated public POST that writes to a database is an abuse surface,
so:

- Rate limit on IP with the existing `hit()` from `src/lib/ratelimit.ts`,
  keyed `events:${ip}`, 60 batches per hour. On exceed, return `204` anyway and
  drop the batch. Returning `429` to a beacon tells nobody anything and tells a
  scraper exactly where the limit is.
- The body cap above.
- Only names in the closed taxonomy are ever written, so the table cannot be
  used as free storage.
- `user_id` comes from the session, never from the body. There is no way to
  attribute an event to someone else.

Note honestly, in a comment, that `hit()` is per-instance and best-effort — the
same caveat its own header already carries. The real protection here is that
there is nothing worth doing with the endpoint.

### The handler

```ts
export async function POST(request: Request) {
  const user = await getSessionUser();            // W2; may be null
  const raw  = await safeJson(request);
  const env  = Envelope.safeParse(raw);
  if (!env.success) { log('bad events envelope'); return new Response(null, { status: 204 }); }

  const localDate = parseLocalDate(env.data.local_date);
  const ctx: AnalyticsContext = {
    userId: user?.id ?? null,
    sessionId: validSessionId(env.data.session_id),
    locale: user?.locale ?? resolveLocale(request),   // W6
    localDate: localDate.date,
  };

  await withAnalytics(ctx, async () => {
    if (localDate.source === 'fallback') {
      track('analytics.local_date_fallback',
            { reason: localDate.reason!, received: localDate.received, surface: 'events' });
    }
    let dropped = 0;
    for (const e of env.data.events) {
      if (!isEventName(e.name)) { dropped++; continue; }
      trackRaw(e.name, { ...sanitizeProps(e.props), seq: e.seq });
    }
    if (dropped) track('analytics.events_dropped', { count: dropped, reason: 'unknown_name' });
  });

  return new Response(null, { status: 204 });
}
```

`trackRaw` is the internal, non-generic sibling of `track` — the same buffer,
without the compile-time prop typing, because the values came off the wire and
have already been checked at runtime. It is not exported outside the module.

The whole batch therefore goes through the **same** `after()` + `flushEvents`
path as a server-fired event. One writer, one insert, one place to put a queue.

---

## 7. Capturing the reading body

This is the interesting part, and it is where the roadmap's requirement and the
existing route's invariants meet.

`readings.body` needs the generated prose. The prose leaves the server as a
stream the user is watching arrive. The naive options are all wrong:

- **Buffer the whole reading, write it, then send it.** Turns a 1.5-second
  time-to-first-token into a 15-second blank screen. This is the thing Miftah
  is explicitly asking not to happen.
- **`ReadableStream.tee()`.** Two branches, two queues; the analytics branch's
  queue grows if it is drained more slowly, and the two branches' backpressure
  is coupled. Correct in principle, capable of being wrong in practice, and
  strictly more machinery than needed for a consumer that is an array append.
- **Write the body from the client, after the stream finishes.** Then the
  server's record of what it generated is whatever the client says it
  generated, which is exactly the class of trust the reading route was
  carefully built to avoid.

### The design

Extract the stream construction out of the route into
`src/lib/analytics/tee.ts`, as a pure function over an `LLMStream`. Two reasons:
the route is the most sensitive file in the app and should gain as little inline
logic as possible, and a pure function over an async iterable is testable with a
fake stream and no server (§13, Task 7).

```ts
export type ReadingOutcome = {
  body: string;                                   // '' if nothing arrived
  status: 'ok' | 'partial' | 'failed' | 'aborted';
  truncated: boolean;                             // hit MAX_BODY_CHARS
  firstTokenMs: number | null;                    // -> readings.latency_ms
  totalMs: number;
  chars: number;                                  // pre-truncation length
  usage: ReadingUsage;                            // nulls if the provider gave none
  errorKind: string | null;
};

export function teeReading(
  source: LLMStream,
  opts: { startedAt: number; failureNotice: string; maxBodyChars?: number },
): { stream: ReadableStream<Uint8Array>; done: Promise<ReadingOutcome> };
```

The body:

```ts
const encoder = new TextEncoder();
const parts: string[] = [];
let chars = 0, truncated = false, firstTokenMs: number | null = null;
let status: ReadingOutcome['status'] = 'ok';
let errorKind: string | null = null;
let settle!: (o: ReadingOutcome) => void;
let settled = false;

const done = new Promise<ReadingOutcome>((res) => { settle = res; });
const finish = async () => {
  if (settled) return;                      // exactly once, from three call sites
  settled = true;
  settle({
    body: parts.join(''), status, truncated, chars,
    firstTokenMs, totalMs: Math.round(performance.now() - opts.startedAt),
    usage: await source.usage,              // never rejects; see §8
    errorKind,
  });
};

const stream = new ReadableStream<Uint8Array>({
  async start(controller) {
    try {
      for await (const chunk of source) {
        // THE CLIENT GOES FIRST. Always. The accumulate below is a synchronous
        // array append and costs nanoseconds, but writing it in this order
        // makes the guarantee visible rather than incidental.
        controller.enqueue(encoder.encode(chunk));

        if (firstTokenMs === null) firstTokenMs = Math.round(performance.now() - opts.startedAt);
        chars += chunk.length;
        if (!truncated) {
          const room = (opts.maxBodyChars ?? MAX_BODY_CHARS) - joinedLength(parts);
          if (chunk.length <= room) parts.push(chunk);
          else { if (room > 0) parts.push(chunk.slice(0, room)); truncated = true; }
        }
      }
    } catch (err) {
      /*
       * Unchanged in effect from the original route: the status code went out
       * with the first byte, so a mid-stream failure CANNOT become a 500.
       * The notice goes to the reader's screen and NOT into `parts` -- it is a
       * system message, not the reader's prose, and storing it would put a
       * bracketed Indonesian apology into readings.body where W5's chained
       * reading will happily quote it back at the user next time.
       */
      console.error('reading stream failed', err);
      status = parts.length > 0 ? 'partial' : 'failed';
      errorKind = classifyStreamError(err);
      try { controller.enqueue(encoder.encode(opts.failureNotice)); }
      catch { /* the consumer is already gone; nothing left to tell them */ }
    } finally {
      try { controller.close(); } catch { /* already closed by a cancel */ }
      void finish();
    }
  },

  /*
   * The client went away -- Draw.tsx aborts on reset, on unmount, and on a
   * fresh request. The user saw whatever had arrived, so it is still worth
   * storing, marked as such. Without this handler `start()` can stay suspended
   * on an enqueue to a dead controller and `done` never settles, which is
   * precisely the case the timeout in §8 exists to catch -- but catching it
   * here is cheaper and more accurate.
   */
  cancel() {
    status = parts.length > 0 ? 'aborted' : 'failed';
    errorKind ??= 'client_disconnected';
    void finish();
  },
});
```

`MAX_BODY_CHARS = 20_000`. The model cannot exceed `maxTokens` (650 for
`spread3`), so in normal operation this never fires. It exists because an
unbounded array fed by a remote server is a memory risk in a serverless
function, and because a provider bug that streams forever should cost a
truncated row rather than an OOM. The client still receives every byte; only
the stored copy is capped, and `truncated` says so.

`joinedLength(parts)` is a running counter, not a `join().length` per chunk —
the naive version is quadratic and would be a real cost at 650 tokens of small
deltas.

### The four paths, and what each stores

| Path | Client sees | `readings.body` | `status` |
|---|---|---|---|
| Normal completion | the full prose | the full prose | `ok` |
| Provider fails after some text | prose + `[Bacaan terputus...]` | the prose, **without** the notice | `partial` |
| Provider fails before any text | just `[Bacaan terputus...]` | `''`, stored as `NULL` | `failed` |
| Client aborts mid-stream | whatever arrived | whatever the server had sent | `aborted` |

Note the third row: an empty body is written to the column as `NULL`, not `''`.
§3's comment says `body` is "NULL if the stream died" and W5's chain query will
be filtering on `status`, but `body IS NOT NULL` should mean the same thing and
an empty string that is not null is the kind of discrepancy that produces a
reading which references a previous reading that said nothing.

---

## 8. Latency, tokens, and the LLM-layer change

### Where the numbers come from

- **`latency_ms`** — computed here, in `teeReading`, as
  `firstTokenMs`: `performance.now()` at the first `controller.enqueue` minus
  `startedAt`, where `startedAt` is captured at the top of the route handler.
  It therefore includes validation, prompt assembly, connection setup and the
  model's think time — everything the querent actually waits through. That is
  the point. See A12. Total generation time is in `reading.completed.total_ms`.

- **`token_input` / `token_output`** — cannot be derived. They exist only in the
  provider's own stream events, and the current interface
  (`streamReading(prompt): AsyncIterable<string>`) throws them away by
  construction. **The interface has to change.**

### The interface change — a cross-workstream delta

`src/lib/llm/types.ts` and `src/lib/llm/anthropic.ts`. **W5, W6 and W7 all
touch this layer**, so this is flagged as loudly as a schema delta and belongs
in reconciliation, not in whoever gets there first.

```ts
export type ReadingUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
  stopReason: string | null;
};

/**
 * Still an AsyncIterable<string>, so every existing `for await` consumer --
 * the reading route, scripts/smoke-llm.ts, W7's moderation gate -- compiles
 * and behaves unchanged. The usage promise is an added property, not a new
 * shape, precisely because four workstreams are editing around this file.
 */
export type LLMStream = AsyncIterable<string> & { usage: Promise<ReadingUsage> };

export interface LLMProvider {
  streamReading(prompt: ReadingPrompt): LLMStream;
}
```

Note it is no longer `async *streamReading` — it returns the stream object
rather than being a generator itself, so the property can be attached:

```ts
streamReading(prompt) {
  const upstream = client.messages.stream({ /* unchanged */ });

  let resolveUsage!: (u: ReadingUsage) => void;
  const usage = new Promise<ReadingUsage>((r) => { resolveUsage = r; });

  async function* iterate() {
    let input: number | null = null, output: number | null = null, stop: string | null = null;
    try {
      for await (const event of upstream) {
        if (event.type === 'message_start')  input  = nonZero(event.message.usage?.input_tokens);
        if (event.type === 'message_delta') { output = nonZero(event.usage?.output_tokens);
                                              stop   = event.delta?.stop_reason ?? stop; }
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    } finally {
      // Resolve on EVERY exit path -- normal end, thrown error, and the
      // early-return the consumer causes by breaking out of its for-await.
      // A `usage` promise that never settles parks the after() callback until
      // its timeout on every failed reading.
      resolveUsage({ inputTokens: input, outputTokens: output, model, stopReason: stop });
    }
  }

  return Object.assign(iterate(), { usage });
}
```

Three details that are easy to get wrong:

1. **`usage` must never reject.** Nothing awaits it on the hot path, so a
   rejection is an unhandled promise rejection — which in Node is a process
   warning today and a crash under some configurations. Resolve with nulls
   instead; failure is already recorded as `status: 'failed'`.
2. **`usage` must always settle.** Hence the `finally`. A generator abandoned
   mid-iteration (client disconnect) still runs its `finally` when the iterator
   is closed, which is what makes this safe.
3. **`nonZero()`.** z.ai reports `input_tokens: 0` — verified in the rewrite
   plan §4 and still true. A literal `0` in the column would make every average
   input-token count wrong, and would be indistinguishable from a real zero.
   `nonZero(0) === null`, and the column is nullable in §3 for exactly this
   reason. **Expect the token columns to be empty for as long as
   `LLM_PROVIDER=zai`.** That is a provider fact, not a bug, and any dashboard
   built on them must handle it.

### `prompt_version`

§3 wants a prompt change to be visible in the data. `buildPrompt()` gains one
returned field:

```ts
export type ReadingPrompt = {
  system: string;
  user: string;
  maxTokens: number;
  promptVersion: string;   // NEW
};
```

Computed as `` `v1.${sha256(staticLayers).slice(0, 8)}` `` where `staticLayers`
is `[locale, BASE_CONTRACT, READER_PROMPTS[r.id], servicePrompt(s.id, verdict)].join('\0')`
— explicitly **not** including the Lotus block, the memory block or the
question, all of which vary per user and per request and would turn a version
into a per-row nonce. `v1` is a readable epoch a human bumps when the *scheme*
changes; the hash does the actual work and requires no discipline.

`buildPrompt` lives in `src/lib/prompt/`, which W6 owns for the i18n fork. I
specify the contract; W6 writes it. See §10.

---

## 9. The reading route, end to end

`src/app/api/reading/route.ts`. **The invariants survive unchanged and are
restated here because this is the file that will be edited by four
workstreams:**

- the client sends card ids and orientation and nothing else;
- every word of card text is looked up server-side from `cards.json`;
- the yes/no verdict is derived by `effectiveYesNo()`, never by the model;
- a mid-stream failure cannot become a 500.

Nothing below touches any of them. The analytics additions are: two headers
read, one uuid generated, one `withAnalytics` wrapper, `teeReading` in place of
the inline `ReadableStream`, and one `defer()`.

```ts
export const runtime = 'nodejs';
export const maxDuration = 60;   // NEW -- headroom for after(); see §10

export async function POST(request: Request) {
  const startedAt = performance.now();

  const user = await getSessionUser();                      // W2 -> { id, locale } | null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = validSessionId(request.headers.get(SESSION_HEADER));
  const localDate = parseLocalDate(request.headers.get(LOCAL_DATE_HEADER));
  const ctx: AnalyticsContext = {
    userId: user.id, sessionId, locale: user.locale, localDate: localDate.date,
  };

  return withAnalytics(ctx, async () => {
    if (localDate.source === 'fallback') {
      track('analytics.local_date_fallback',
            { reason: localDate.reason!, received: localDate.received, surface: 'reading' });
    }

    const gate = hit(user.id);                              // keyed on the uuid now, not a username
    if (!gate.ok) {
      track('reading.rate_limited', { reader_id: '?', service_id: '?', retry_after_s: gate.retryAfterSeconds });
      return NextResponse.json(/* unchanged 429 */);
    }

    /* ...body parse, Zod, card-count check, duplicate check: ALL UNCHANGED.
       Each early return gets one track('reading.failed', { stage: 'validation', ... })
       and nothing else. Note the ordering: the response object is constructed
       and returned; the event is buffered, not written, so no early return
       gains a database round trip. */

    const readingId = crypto.randomUUID();                  // known BEFORE the stream starts
    const prompt = buildPrompt({ reader, service, picks, question, locale: user.locale });

    track('reading.requested', {
      reading_id: readingId, reader_id: reader, service_id: service,
      card_count: picks.length, has_question: Boolean(question),
      question_length: question?.length ?? 0,
      lotus_present: lotusBlock !== null,                   // W3
      memory_block_present: memoryBlock !== null,           // W5
      prompt_version: prompt.promptVersion,
    });

    const { stream, done } = teeReading(getProvider().streamReading(prompt), {
      startedAt,
      failureNotice: t('reading.interrupted'),              // W6; today's literal string
    });

    /*
     * Everything below runs after the response has flushed. It does not delay
     * a byte and it cannot fail the request.
     */
    defer(async () => {
      const outcome = await Promise.race([done, streamTimeout(ANALYTICS_STREAM_TIMEOUT_MS)]);

      if (outcome.firstTokenMs !== null) {
        track('reading.first_token', { reading_id: readingId, latency_ms: outcome.firstTokenMs });
      }
      if (outcome.status === 'ok' || outcome.status === 'partial') {
        track('reading.completed', { reading_id: readingId, reader_id: reader, service_id: service,
          latency_ms: outcome.firstTokenMs ?? -1, total_ms: outcome.totalMs, chars: outcome.chars,
          token_input: outcome.usage.inputTokens, token_output: outcome.usage.outputTokens,
          truncated: outcome.truncated, status: outcome.status });
      } else if (outcome.status === 'aborted') {
        track('reading.aborted', { reading_id: readingId, chars_before_abort: outcome.chars, reason: 'user' });
      } else {
        track('reading.failed', { reading_id: readingId, reader_id: reader, service_id: service,
          stage: 'stream', chars_before_failure: outcome.chars, error_kind: outcome.errorKind ?? 'unknown' });
      }

      await persistReading({
        id: readingId, userId: user.id, sessionId, readerId: reader, serviceId: service,
        locale: user.locale, question: sanitizedQuestion, questionBlocked: false,
        verdict, body: outcome.body || null, status: outcome.status,
        model: process.env.LLM_MODEL ?? 'unknown', promptVersion: prompt.promptVersion,
        latencyMs: outcome.firstTokenMs, tokenInput: outcome.usage.inputTokens,
        tokenOutput: outcome.usage.outputTokens, localDate: localDate.date,
      }, picks.map((p, i) => ({ cardId: p.id, reversed: p.reversed, position: i })));

      void touchLastSeen(user.id);      // fire and log; never retried
    });

    return new Response(stream, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-accel-buffering': 'no',
        'x-reading-id': readingId,      // NEW -- see §10, this is the loss detector
      },
    });
  });
}
```

### `persistReading` and the retry

`src/lib/analytics/flush.ts`.

```ts
export async function persistReading(row: ReadingRow, cards: ReadingCardRow[]): Promise<void>
```

- **One transaction.** `readings` and `reading_cards` go in together or not at
  all. A `readings` row with no cards is invisible in the frequency query and
  visible in the chain query, which is the worst of both — W5 would show a user
  a reading that drew no cards.
- **`on conflict (id) do nothing`** on the `readings` insert. Redundant with the
  transaction in the normal case; it covers the real one, where the commit
  succeeded and the acknowledgement was lost to a connection reset, and the
  retry would otherwise duplicate.
- **Cards only when there is prose.** A17: `status === 'blocked'` writes the
  `readings` row alone.
- **The retry** (A11):

```ts
const DELAYS = [0, 250, 1000];              // ms, plus +/- 50ms jitter
const budgetMs = Number(process.env.ANALYTICS_RETRY_BUDGET_MS ?? 5000);
const deadline = Date.now() + budgetMs;

for (let attempt = 0; attempt < DELAYS.length; attempt++) {
  if (attempt > 0) {
    const wait = DELAYS[attempt] + Math.floor(Math.random() * 100) - 50;
    if (Date.now() + wait > deadline) break;   // do not start what we cannot finish
    await sleep(wait);
  }
  try { return await writeOnce(); }
  catch (err) {
    if (!isTransient(err)) { logAnalyticsFailure('readings.permanent', err, { readingId: row.id, attempt }); return; }
    if (attempt === DELAYS.length - 1) logAnalyticsFailure('readings.exhausted', err, { readingId: row.id });
  }
}
```

`isTransient(err)` keys off the Postgres SQLSTATE, not the message:

| Class | Meaning | Retry |
|---|---|---|
| `08*` | connection exception | yes |
| `40001`, `40P01` | serialization failure, deadlock | yes |
| `53*` | insufficient resources (too many connections) | yes |
| `57P01`, `57P03` | admin shutdown, cannot connect now | yes |
| `23*` | integrity violation | **no** — deterministic, will fail identically |
| `22*` | data exception | **no** — the row is malformed, fix the code |
| `42*` | syntax / undefined column | **no** — a migration is missing |
| everything else | unknown | **no** — do not spend the invocation guessing |

Node-level errors (`ECONNRESET`, `ETIMEDOUT`, the driver's own pool-timeout)
map to transient. Everything else defaults to permanent, deliberately: the cost
of not retrying a transient error is one lost reading; the cost of retrying a
permanent one three times is three seconds of a paid invocation and a log line
that hides the real error twice over.

**Logging never contains user text.** Vercel logs are not a place to put
`readings.question`. The failure line is
`console.error('[analytics] readings write failed', { readingId, userId, attempts, sqlstate })`
and nothing else. This is a §11 obligation, not a style preference.

### `flushEvents`

```ts
export async function flushEvents(ctx: AnalyticsContext, rows: PendingEvent[]): Promise<void>
```

One `insert into events (...) values (...), (...), ...` for the whole buffer —
Drizzle's `db.insert(events).values(array)` compiles to exactly that. Not
retried. Wrapped; failures log and return. `sanitizeProps` (§11) runs here, at
the last possible moment, so it also covers events that arrived from the
collector route.

---

## 10. What `after()` cannot promise

Stated plainly, because the risk table in the roadmap names it and nobody has
written down the consequences.

**Vercel can end an invocation.** `after()` extends the function's lifetime, but
only up to the function's `maxDuration`, and a platform-level termination — a
deploy rolling, an instance being reclaimed, a hard timeout — kills the callback
mid-flight with no notice and no error anywhere. `export const maxDuration = 60`
on the reading route buys headroom: a `spread3` stream is well under 30 seconds,
the retry budget is 5, so the callback has room. It is headroom, not a
guarantee.

**What is lost when it happens:** the `readings` row, its `reading_cards`, and
that request's whole event batch. The user got their reading and enjoyed it. The
history has no record of it. The downstream symptoms are all in W5 and all
confusing: a chained reading that skips one, a frequency count that is one low,
a daily summary that omits a reading the user distinctly remembers having.

**How to detect it.** You cannot count what was never written, so count the
*intent* instead, on a different transport, in a different request. This is why
the route returns `x-reading-id` and why the client fires `reading.completed`
from its own batcher: those two facts arrive by independent paths, and a
disagreement between them is exactly the signal.

```sql
-- Readings the client says completed, that the server never stored.
-- Should be zero. A sustained non-zero rate is the trigger for A18.
select
  e.props->>'reading_id' as reading_id,
  e.created_at,
  e.user_id
from events e
left join readings r on r.id = (e.props->>'reading_id')::uuid
where e.name = 'reading.completed'
  and e.created_at > now() - interval '7 days'
  and r.id is null
order by e.created_at desc;
```

This works because the client's `reading.completed` reaches the server through
`/api/events`, whose own `after()` is a small, fast insert with none of the
stream's exposure. Both can be lost; both being lost for the same reading is
much rarer than either.

Note the client event must therefore exist as well as the server one. They are
the same name with overlapping props, distinguished by `props.source`
(`'server'` | `'client'`) — add that prop to `reading.completed` in §3's
taxonomy when implementing. Two rows per reading is a rounding error in the
firehose and it is the entire reconciliation mechanism.

**Why no queue now.** Roadmap §6 says do not build it, and it is right: a queue
adds a service, a delivery guarantee to reason about, a dead-letter story, and
a second place writes can be stuck — in exchange for closing a gap that has not
yet been shown to exist. The threshold at which that trade flips: the query
above showing sustained loss above roughly 1%, or a write appearing that
genuinely cannot finish inside an invocation (a backfill, a fan-out). Neither is
true of a two-statement transaction. When it does flip, the change is confined
to `flushEvents` and `persistReading` in `flush.ts` — `track()`, `defer()` and
the entire taxonomy are unaffected, which is what roadmap §6 means by "the
interface boundary is `track.ts`".

---

## 11. Privacy

### What is being retained

`readings.question` is user-typed free text, stored in full, linked to an
account, indefinitely. `readings.body` is a generated reading about that
question, also in full. Both are new: **the current app promises the opposite.**
`CLAUDE.md` says "a reading is not persisted at all" and the rewrite plan's
decision table says "Reading history: Not stored". D12 reverses that, and the
reversal is user-visible behaviour, not an implementation detail.

### What W7's privacy policy has to disclose

1. **That the questions are stored**, in full, associated with the account, and
   for how long. "As long as the account exists" is the honest current answer.
   If that is not acceptable, the mechanism is a retention job, and it should be
   decided before launch rather than after (see §14).
2. **That the readings are stored**, and why — the memory features in roadmap §5
   read them back. A user who is told "your reader remembers your last reading"
   has been told this implicitly; the policy should say it explicitly.
3. **That analytics records behaviour but not content.** Which reader, which
   service, which cards, when, how long it took. Never the question text, never
   the answer text, never the reading text. This is a guarantee the code makes,
   not a promise the policy makes alone — see below.
4. **That the erasure right exists and what it does.** `users.deleted_at` is the
   trigger; the next section is the contract.
5. That `moderation_flags.question` (W7's table) retains the text of *refused*
   questions specifically — which is a category a user will care about more,
   not less, than the ordinary ones.

### The guarantee, in code

A16 says no free text in `events.props`. That is enforced three ways, because a
rule that lives only in a review comment is not a guarantee:

- The taxonomy has no free-text prop. Every string-valued prop is an enum, an
  id, or a slug.
- `sanitizeProps()` in `flush.ts` runs on every event on the way to the
  database and: drops non-scalar values, truncates every string to 120
  characters, caps the object at 24 keys, and drops keys not matching
  `/^[a-z][a-z0-9_]{0,31}$/`. There is a test.
- Failure logs carry ids, never content (§9).

This is what makes the erasure design below honest: `events` rows survive a
user deletion with `user_id` nulled, and they can survive it because there is
provably nothing in them that identifies anybody.

### What `users.deleted_at` has to cascade

**A soft delete does not cascade.** §3 declares `on delete cascade` on the FKs,
but that fires on a `DELETE`, not on setting a timestamp. Every one of these
tables would otherwise sit there full of data belonging to a user who has
exercised their erasure right. The erasure routine — W1 builds it, this is the
requirement — must run in **one transaction**:

| Table | Action | Why |
|---|---|---|
| `users` | set `deleted_at`, null `email`, `display_name`, `avatar_url`; keep `id` and `google_sub` hashed or nulled | The row is the tombstone that stops a re-signup silently resurrecting the account |
| `readings` | **hard delete** (cascades `reading_cards`) | Contains free text. Anonymising is not available: a stored question is often self-identifying, and keeping it under a null user id would be worse than keeping it under a real one |
| `reading_cards` | via cascade | — |
| `onboarding_answers` | **hard delete** | Roadmap §8. This is the highest-liability data in the product |
| `lotus_avatars` | **hard delete** | Derived from the above and still descriptive of a person |
| `daily_summaries` | **hard delete** | Contains generated prose about the user's day |
| `moderation_flags` | **hard delete**, or null `user_id` and keep `category` only | W7's call; the `question` column must go either way |
| `events` | `set user_id = null` | Retained. Scalar props only (A16), so the rows are genuinely anonymous and the aggregate behaviour data survives |

The asymmetry in the last row is the whole point of A16, and it should be
stated in the privacy policy in those terms: *"We keep anonymous usage counts —
which reader, which service, when — after your account is deleted. They contain
no text you wrote."*

---

## 12. What W5 needs, checked against what I write

W5's three features are queries against my tables. Walked one at a time, because
discovering a missing column in week three is the expensive version of this
conversation.

**Card-frequency verdict** (roadmap §5). `select card_id, count(*) from
reading_cards where user_id = $1 and <window> group by card_id order by 2 desc
limit 2`. `user_id` is denormalized onto `reading_cards` in §3 precisely so this
is a single-table scan.

> **Gap found.** The windows Miftah named — this week, last 3 days, last 13
> days, last 666 days, this month, quarter, year, since your last birthday —
> are all *the querent's* calendar windows. `reading_cards` has only
> `created_at`, which is UTC. Computing the window against UTC reintroduces
> exactly the 07:00-in-Jakarta bug roadmap §7 exists to prevent, and joining to
> `readings.local_date` per row gives back the whole reason `user_id` was
> denormalized. **`reading_cards` needs `local_date`.** It is in §14.

Blocked readings write no `reading_cards` rows (A17), so refused questions
cannot skew the count. Failed and aborted readings *do* write cards, because
the querent did draw those cards; whether they should count is W5's call and is
in §15.

**Chained readings** (roadmap §5). `select id, reader_id, service_id, verdict,
body, local_date from readings where user_id = $1 and status = 'ok' order by
created_at desc limit 2`, plus their cards. Everything present, with one
addition: `status`, which is in §14. Without it the only "was this reading
complete" signal is `body is not null`, which is true of a reading that died
after one sentence — and chaining off a truncated reading means the reader
confidently references a conclusion that was never reached.

W5 also wants a "one-clause gist" rather than the full prose in the prompt.
Producing that needs a model call and is W5's, not mine; whether it wants to
*store* it is §15.

**Per-day reader summary** (roadmap §5). `select ... from readings where
user_id = $1 and reader_id = $2 and local_date = $3 and locale = $4`. All four
columns present and §3's `readings (user_id, local_date)` index covers it.
`daily_summaries.source_reading_ids` is populated from the `id`s that query
returns, and staleness is detectable by re-running it and comparing sets. No
gap.

**"Did the callback appear?"** (roadmap §10 risk). The server can know whether
it *injected* a memory block — that is `reading.requested.memory_block_present`,
already in the taxonomy. Whether the model *used* it is a property of the
generated text and can only be determined after the fact; the natural place is
inside my `defer()`, where the completed body is in hand. I provide the hook
(the body is available to any deferred job registered by the route) and leave
the detection to W5, since it owns what "used" means.

---

## Schema deltas

Beyond §3's `readings`, `reading_cards` and `events`, which are **not**
redefined here. Three columns, one index, and one non-schema interface change
called out at the same volume because it has the same blast radius.

### D-A: `readings.status text not null default 'ok'`

Values: `'ok' | 'partial' | 'failed' | 'aborted' | 'blocked'`.

§3 says `body` is "NULL if the stream died", which conflates four different
things: the model produced nothing, the model produced half a reading, the user
navigated away, and the moderation gate refused before generation started. W5's
chain query must include the first two categories differently — a `partial`
reading has real prose and a fake ending — and an analytics question as basic
as "what is our stream failure rate" becomes a jsonb dig without it. A
`text not null default 'ok'` costs nothing and makes four questions single-column
filters. Consider a check constraint or a Postgres enum; Drizzle supports
`pgEnum` and it documents the value set in the schema file, which is worth more
than the microscopic storage saving.

### D-B: `readings.session_id text`

Nullable. The browser session id (A7), not the auth session. Without it, joining
a reading to the event trail that produced it — the taps, the returns, the
detail opens — means a timestamp-proximity join, which is guesswork. With it,
`events.session_id = readings.session_id` reconstructs the whole interaction.
Nullable because a reading can legitimately arrive without the header (an old
client, a `curl`), and a missing analytics field must never fail a reading.

### D-C: `reading_cards.local_date date not null`

Copied from the parent reading at insert time. Denormalized on purpose, exactly
as `user_id` already is in §3, and for exactly the same reason: the
card-frequency query must be a single-table scan and its window is the
querent's calendar, not UTC. See §12 for the derivation. Without it the
"this week" verdict is computed against a day boundary that is seven hours
wrong in Jakarta, which is the specific bug roadmap §7 is about.

### D-D: index `events (session_id, created_at)`

§3's index list covers `(user_id, created_at desc)` and `(name, created_at desc)`.
Session reconstruction — the query you actually run when someone reports "the
app did something weird" — filters on `session_id` and would table-scan.

### D-E (not a schema change, same blast radius): the `LLMProvider` interface

`src/lib/llm/types.ts` changes shape so token usage is reachable. Full detail in
§8. Summarised: `streamReading` returns
`AsyncIterable<string> & { usage: Promise<ReadingUsage> }` instead of a bare
`AsyncIterable<string>`. Existing `for await` consumers are unaffected by
construction — that intersection type was chosen over a cleaner
`{ chunks, usage }` object precisely because **W5, W6 and W7 all edit around
this layer** and a breaking change here is four merge conflicts. If
reconciliation prefers the object form, that is fine, but it must be decided
once and centrally, not discovered.

Related, same file: `ReadingPrompt` gains `promptVersion: string` (§8). §3's
`readings.prompt_version` is otherwise unfillable.

---

## Interfaces I export

Exact paths and signatures. `track()` is imported by every other workstream.

```ts
// ── src/lib/analytics/events.ts ────────────────────────────────────────────
export const EVENT_NAMES: readonly string[];
export type EventName = (typeof EVENT_NAMES)[number];
export type EventPropValue = string | number | boolean | null;
export type EventMap = { /* §3 */ };
export type EventProps<N extends EventName> = EventMap[N];
export type TrackFn = <N extends EventName>(name: N, props: EventProps<N>) => void;
export function isEventName(v: unknown): v is EventName;

// ── src/lib/analytics/track.ts  ── SERVER ONLY ─────────────────────────────
export type AnalyticsContext = {
  userId: string | null;
  sessionId: string | null;
  locale: 'id' | 'en';
  localDate: string;            // YYYY-MM-DD, already validated
};
export const track: TrackFn;                                        // void. Never await it.
export function defer(fn: () => Promise<void>): void;               // runs inside after(), before the flush
export function withAnalytics<T>(ctx: AnalyticsContext, fn: () => Promise<T>): Promise<T>;
export function analyticsContext(): AnalyticsContext | null;

// ── src/lib/analytics/track.client.ts  ── 'use client' ─────────────────────
export const track: TrackFn;                                        // identical signature, batched transport
export function getSessionId(): string;
export function flushNow(): void;                                   // tests and the iframe harness

// ── src/lib/analytics/localdate.ts  ── isomorphic, no deps ─────────────────
export const SESSION_HEADER    = 'x-jm-session';
export const LOCAL_DATE_HEADER = 'x-jm-local-date';
export type LocalDateResult =
  | { date: string; source: 'client'; received: string }
  | { date: string; source: 'fallback'; reason: 'absent' | 'malformed' | 'out_of_range'; received: string | null };
export function parseLocalDate(raw: unknown, now?: Date): LocalDateResult;
export function validSessionId(raw: unknown): string | null;

// ── src/lib/analytics/tee.ts ───────────────────────────────────────────────
export type ReadingOutcome = {
  body: string; status: 'ok' | 'partial' | 'failed' | 'aborted';
  truncated: boolean; firstTokenMs: number | null; totalMs: number; chars: number;
  usage: ReadingUsage; errorKind: string | null;
};
export function teeReading(
  source: LLMStream,
  opts: { startedAt: number; failureNotice: string; maxBodyChars?: number },
): { stream: ReadableStream<Uint8Array>; done: Promise<ReadingOutcome> };

// ── src/lib/analytics/flush.ts  ── SERVER ONLY ─────────────────────────────
export type ReadingRow     = { /* mirrors readings, camelCase */ };
export type ReadingCardRow = { cardId: number; reversed: boolean; position: number };
export function persistReading(row: ReadingRow, cards: ReadingCardRow[]): Promise<void>;   // RETRIED
export function flushEvents(ctx: AnalyticsContext, rows: PendingEvent[]): Promise<void>;   // not retried
export function sanitizeProps(raw: unknown): Record<string, EventPropValue>;
export function withRetry<T>(fn: () => Promise<T>, opts?: { budgetMs?: number }): Promise<T | undefined>;
export function isTransient(err: unknown): boolean;

// ── src/app/api/events/route.ts ────────────────────────────────────────────
// POST only. Always 204. Public (no session required). runtime = 'nodejs'.
```

**Import rules for other workstreams:**

- Server code (route handlers, server components, server actions):
  `import { track } from '@/lib/analytics/track'`.
- Client components: `import { track } from '@/lib/analytics/track.client'`.
- Never import `track.ts` from a client component — it pulls `node:async_hooks`
  and `next/server` into the browser bundle and the build fails. The two
  modules deliberately share the `TrackFn` type so the call sites are identical
  and only the import line differs.
- **Never `await track(...)`.** It returns `void`. If your editor lets you, your
  types are wrong.

---

## Interfaces I need

| From | What | Shape | Why |
|---|---|---|---|
| **W1** | The Drizzle client and tables | `import { db } from '@/lib/db/client'`; `readings`, `readingCards`, `events`, `users` from `@/lib/db/schema` | Every write |
| **W1** | Transactions | `db.transaction(async (tx) => ...)` | `readings` + `reading_cards` atomically (§9) |
| **W1** | The three schema deltas | D-A, D-B, D-C above | Folded into `schema.ts` and a migration |
| **W1** | The integration harness | something like `withTestDb(async (db) => ...)` — a test schema, migrated, truncated or dropped per run | Everything in §13 marked *(integration)* |
| **W1** | The erasure routine honouring `users.deleted_at` | the table in §11 | A soft delete that does not cascade is a privacy failure with a green checkmark |
| **W2** | The session user, server-side | `getSessionUser(): Promise<{ id: string; locale: 'id' \| 'en' } \| null>` where `id` is the **`users.id` uuid**, not the Google `sub` and not a username | `readings.user_id` and `events.user_id` are uuid FKs. The current route resolves a username and it is not a key into anything |
| **W2** | Rate-limit key change | `hit(user.id)` instead of `hit(username)` | Follows from the above. W2 owns the auth swap; flagging it so the change is made once |
| **W2** | One middleware exemption | `/api/events` added to `isPublic()` in `src/middleware.ts` | Pre-login events (`terms.viewed`, `app.launched`, a failed sign-in) have no session. §3 explicitly allows `events.user_id` to be null. Abuse controls are in §6 |
| **W3** | Lotus block presence | whatever returns the block returns `null` when there is none | `reading.requested.lotus_present`. I log presence, never content |
| **W3** | Onboarding events | W3 calls my `track()` for the six `onboarding.*` names | Shapes are fixed in §3; if a prop is missing, ask and I will add it rather than passing extras |
| **W5** | Memory block presence | same contract as W3's | `reading.requested.memory_block_present` |
| **W5** | `summary.shown`, `frequency.shown` | W5 calls `track()` | Shapes fixed in §3 |
| **W6** | Locale resolution, server-side | `resolveLocale(request): 'id' \| 'en'` for the unauthenticated collector route | `events.locale`, which is nullable but should not be |
| **W6** | `locale.changed` | W6 calls `track()` | — |
| **W6** | `buildPrompt` returns `promptVersion` | `v1.<sha256(static layers incl. locale).slice(0,8)>`, excluding Lotus/memory/question — §8 | §3's `readings.prompt_version` is otherwise unfillable, and the hash makes it correct with no discipline |
| **W6** | The interruption notice, translated | the `[Bacaan terputus...]` string, per locale | Passed into `teeReading` as `failureNotice`. **It must not enter `readings.body`** and `teeReading` guarantees that |
| **W7** | `moderation.refused` | W7 calls `track()` with the category only | The question text goes in **their** `moderation_flags.question`. It must never reach `events.props` — A16 and §11 |
| **W7** | A blocked reading | W7 calls `persistReading()` with `status: 'blocked'`, `questionBlocked: true`, `body: null`, and an **empty** cards array | A17. Keeps the frequency query a clean single-table scan |
| **W7** | Secrets audit sign-off | that `track.client.ts` and the `/api/events` envelope ship nothing sensitive | The client bundle is theirs to audit; the transport is mine to keep boring |

---

## New environment variables

Four. All optional with sane defaults, because a missing analytics variable
must never be the reason the app does not boot.

```
ANALYTICS_ENABLED=1              # '0' disables every write. flushEvents and
                                 # persistReading become no-ops that log at debug.
                                 # This is what lets `npm test` and `npm run smoke`
                                 # run without a database.
ANALYTICS_DEBUG=                 # '1' logs every event to the console as it is
                                 # buffered, with its props. The dev loop for
                                 # "is this firing at all?" -- much faster than
                                 # a psql round trip.
ANALYTICS_STREAM_TIMEOUT_MS=45000  # how long the after() callback waits for the
                                 # reading stream to settle before persisting
                                 # whatever arrived as 'partial'
ANALYTICS_RETRY_BUDGET_MS=5000   # total wall-clock ceiling for the readings retry
```

All four go in `.env.example` with the `\$`-escaping warning that already bit
this project once — none of these values contain `$`, but the file's convention
is the file's convention.

Not an environment variable, but set at the same time: `export const
maxDuration = 60` in `src/app/api/reading/route.ts`, giving `after()` headroom
past the stream (§10).

---

## 13. Tasks

Node 24 on PATH for every npm/npx call:
`export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH`.

---

### Task 1: The event taxonomy

**Files:**
- Create: `src/lib/analytics/events.ts`, `src/lib/analytics/events.test.ts`

**Step 1: Write the taxonomy**

§3, verbatim: `EVENT_NAMES`, `EventName`, `EventMap`, `EventProps`, `TrackFn`,
`isEventName`, and the two compile-time exhaustiveness guards. Include the
five "rules for adding an event" as a comment block at the top of the file —
they are the part a future contributor will read and the part they will
otherwise violate.

**Step 2: Test**

- `isEventName` accepts every member of `EVENT_NAMES` and rejects
  `'reader_chosen'`, `''`, `null`, `'__proto__'`, and an object.
- `EVENT_NAMES` has no duplicates (`new Set(EVENT_NAMES).size === EVENT_NAMES.length`)
  — a duplicated string literal compiles fine and quietly makes the union
  narrower than the array.
- Every name matches `/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/` — one dot, snake
  segments. This is the test that stops the taxonomy drifting into three
  naming conventions.

**Step 3: Verify**

```sh
npm run typecheck && npm test -- events
```

Then deliberately break it both ways to prove the guards work: add a name to
`EVENT_NAMES` without a shape (must fail), and add a shape whose key is not in
`EVENT_NAMES` (must fail). Revert both.

**Step 4: Commit**

---

### Task 2: `track()`, `defer()`, `withAnalytics()`

**Files:**
- Create: `src/lib/analytics/track.ts`, `src/lib/analytics/track.test.ts`

**Step 1: Build it**

Per §4. The ALS store, the single lazily-registered `after()`, the store
re-entry inside the callback, the deferred-before-flush ordering, the
unbatched fallback outside a scope, and the blanket `try/catch`.

`after` is imported from `next/server`. For the test, stub it — Vitest runs
outside a request scope and the real `after()` throws there. A module mock is
the cheapest seam:

```ts
vi.mock('next/server', () => ({ after: (fn) => { registered.push(fn); } }));
```

Collect the callbacks, run them by hand, and assert on what `flushEvents`
received (also mocked).

**Step 2: Test**

- Five `track()` calls inside one `withAnalytics` produce **one** registered
  `after()` and **one** `flushEvents` call with five rows. This is the batching
  claim and it is the most important test in the file.
- `defer()`'d work runs before `flushEvents`, and an event tracked *inside* it
  lands in the same batch — the store re-entry (§4). Without the `als.run`
  wrapper this test fails with two flush calls, which is exactly what it is for.
- A `defer()`'d job that throws is caught, logged, and does not prevent the
  flush or the other deferred jobs.
- `track()` outside `withAnalytics` still registers an `after()` and still
  flushes, unbatched.
- `track()` never throws: pass props containing a circular reference, a
  `BigInt`, a `Symbol` key, and `undefined`, and assert it returns normally.
- `withAnalytics` returns the handler's value unchanged and propagates its
  rejection unchanged — the wrapper must be invisible to the route's own
  control flow.
- `ANALYTICS_ENABLED=0` makes the whole thing a no-op with no `after()`
  registration at all.

**Step 3: Verify**

```sh
npm run typecheck && npm test -- track
```

**Step 4: Commit**

---

### Task 3: Local-date validation

**Files:**
- Create: `src/lib/analytics/localdate.ts`, `src/lib/analytics/localdate.test.ts`

**Step 1: Build it**

```ts
export function parseLocalDate(raw: unknown, now = new Date()): LocalDateResult
```

Order of checks, and each one matters:

1. Not a string, or empty → `fallback / 'absent'`.
2. Fails `/^\d{4}-\d{2}-\d{2}$/` → `fallback / 'malformed'`.
3. Not a real date — the round-trip check, `new Date(`${s}T00:00:00Z`)` and
   re-format, so `2026-02-30` and `2026-13-01` are caught rather than silently
   normalised → `fallback / 'malformed'`.
4. More than one day either side of the server's UTC date → `fallback /
   'out_of_range'`. **One day, not two.** Real UTC offsets run from −12 to +14,
   so a legitimate client's local date is the UTC date, the day before, or the
   day after, and nothing else. Anything further is a broken clock or a tampered
   client, and admitting it would put a reading in 1970 into the "this week"
   window forever.
5. Otherwise → `client`.

The fallback date is the **server's UTC date**, because `readings.local_date`
is `not null` and there is no third option. It is wrong for roughly a third of
a day for a Jakarta user, which is why every fallback emits
`analytics.local_date_fallback` — the point is that it is *countable*. If that
event has volume, the client is broken and someone can see it.

Also here: `validSessionId(raw)` — a UUID-shaped string or `null`. Untrusted
input; do not store an arbitrary 4KB string in `events.session_id`.

**Step 2: Test**

Table-driven. `'2026-07-26'` on a server at `2026-07-26T00:00:00Z` → client.
`'2026-07-27'` and `'2026-07-25'` → client (the legitimate offsets). `'2026-07-28'`
and `'2026-07-24'` → out_of_range. `'2026-02-30'`, `'2026-13-01'`, `'26-07-26'`,
`'2026-7-6'`, `'2026-07-26T00:00:00Z'` → malformed. `undefined`, `null`, `''`,
`42`, `{}` → absent. And the Jakarta case explicitly, as a named test: server at
`2026-07-25T18:00:00Z`, client sends `'2026-07-26'` (it is 01:00 on the 26th in
Jakarta) → **client, accepted**, because getting this wrong is the entire
subject of roadmap §7.

**Step 3: Verify**

```sh
npm test -- localdate
```

**Step 4: Commit**

---

### Task 4: The client batcher

**Files:**
- Create: `src/lib/analytics/track.client.ts`, `src/lib/analytics/track.client.test.ts`

**Step 1: Build it**

Per §5. Queue, `seq`, debounce, size trigger, the two transports, requeue on
`fetch` failure, `QUEUE_MAX` overflow, lazy listener registration, `getSessionId`.

Testability shapes the design a little: put the transport behind a module-level
indirection (`let send = defaultSend`) with a `_setTransport()` test seam, and
export `_reset()` — the same pattern `src/lib/ratelimit.ts` already uses. This
keeps the tests in the `environment: 'node'` Vitest config the project already
has, rather than dragging in jsdom for a queue.

**Step 2: Test**

- Three `track()` calls inside the debounce window produce **one** send with
  three events, in `seq` order.
- The 20th call flushes immediately without waiting for the timer.
- A rejected send re-queues at the front; the next flush contains the failed
  batch *before* anything tracked meanwhile.
- 250 queued events with a permanently failing transport leaves the queue at
  200 and emits exactly one `analytics.events_dropped` with `count: 50`.
- `getSessionId()` is stable across calls, is a UUID, and survives a
  `sessionStorage` that throws on both read and write.
- `track()` never throws with a hostile props object.
- The envelope carries `session_id`, `local_date` (from the real `todayKey()`),
  `tz_offset` and `sent_at`.

**Step 3: Verify**

```sh
npm run typecheck && npm test -- track.client
```

**Step 4: Commit**

---

### Task 5: The collector route

**Files:**
- Create: `src/app/api/events/route.ts`
- Modify: `src/middleware.ts` — **coordinate with W2, who owns this file.** One
  line: `/api/events` into `isPublic()`.

**Step 1: Build it**

Per §6. Zod envelope, lenient per-event validation, the caps, the IP rate
limit, `withAnalytics`, always `204`.

**Step 2: Verify by hand**

```sh
curl -i -X POST localhost:3000/api/events \
  -H 'content-type: application/json' \
  -d '{"session_id":"11111111-1111-4111-8111-111111111111","local_date":"2026-07-26","tz_offset":420,"sent_at":1785000000000,"events":[{"name":"reader.viewed","seq":0,"t":1785000000000,"props":{"reader_id":"adrian","from":"picker"}}]}'
```

Expected `204`, with no session cookie at all. Then in `psql`:

```sql
select name, props, user_id, session_id, local_date from events order by created_at desc limit 5;
```

Then the adversarial set, all of which must return `204` and write nothing
harmful: an unknown event name mixed with two good ones (two rows, plus one
`analytics.events_dropped`); a 100-event batch (rejected, `204`); a props object
with a 5KB string (truncated to 120 chars); `local_date: "1970-01-01"`
(fallback, plus the diagnostic event); a body that is not JSON (`204`, logged).

**Step 3: Verify the middleware change did not open anything else**

```sh
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/reading -X POST   # 401
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/                       # 307 -> /login
```

The `isPublic()` comment in `middleware.ts` already warns that the obvious
matcher gets `/api/auth` wrong. Add `/api/events` in the same explicit style,
not by widening a regex.

**Step 4: Commit**

---

### Task 6: LLM usage and `prompt_version`

**Files:**
- Modify: `src/lib/llm/types.ts`, `src/lib/llm/anthropic.ts`
- Modify: `src/lib/prompt/build.ts` — **W6 owns this directory.** If W6 has
  landed, ask; if not, implement and hand it over.
- Create: `src/lib/llm/usage.test.ts`

**Step 1: The interface**

Per §8. `ReadingUsage`, `LLMStream`, the `Object.assign(iterate(), { usage })`
shape, `nonZero()`, and the `finally` that guarantees the promise settles on
every exit path including an abandoned iterator.

**Step 2: `promptVersion`**

Per §8. `sha256` of the joined static layers, `node:crypto`, first 8 hex chars,
prefixed `v1.`.

**Step 3: Test**

- A fake `messages.stream` emitting `message_start` → deltas → `message_delta`
  → `message_stop` yields the right text and resolves `usage` with the right
  numbers.
- `input_tokens: 0` from the provider resolves to `inputTokens: null`. This is
  the z.ai case and it is the one that will actually happen.
- Breaking out of the `for await` early still settles `usage` (drive it with a
  `for await` and a `break`).
- A throwing stream settles `usage` and does **not** reject it. Assert with
  `await expect(stream.usage).resolves.toMatchObject({ inputTokens: null })`,
  and also register a global `unhandledRejection` listener in the test to prove
  none fires.
- `promptVersion` is stable across two identical `buildPrompt` calls, differs
  between readers, differs between services, differs between locales, and is
  **unchanged** by a different question or a different set of picks.

**Step 4: Verify against the live provider**

```sh
npm run smoke
```

The existing smoke script consumes `streamReading` with `for await`; it must
still work unmodified — that is the whole justification for the intersection
type. Then add one line to it printing `await stream.usage` and confirm z.ai
returns nulls, which documents the fact rather than leaving it folklore.

**Step 5: Commit**

---

### Task 7: The stream tee

**Files:**
- Create: `src/lib/analytics/tee.ts`, `src/lib/analytics/tee.test.ts`

This is the task with the most to get wrong and the best test story. It touches
no database and needs no server.

**Step 1: Build it**

Per §7, exactly. Pay attention to:
- client-enqueue before accumulate, in that order, with the comment saying why;
- the notice never entering `parts`;
- the running length counter, not `parts.join('').length` per chunk;
- `finish()` idempotent and reachable from `finally` and from `cancel`;
- `controller.close()` and the notice `enqueue` both wrapped, because a
  cancelled controller throws on both.

**Step 2: Build the fake stream**

```ts
function fakeStream(chunks: string[], opts?: {
  failAfter?: number;              // throw after N chunks
  usage?: Partial<ReadingUsage>;
  delayMs?: number;                // await between chunks, so cancellation has somewhere to land
}): LLMStream
```

An async generator plus an attached `usage` promise — the same shape the real
provider now returns, which means this fake is also the fixture W5/W6/W7 should
reuse. Put it in `src/lib/llm/fake.ts` rather than inside the test file, and say
so, so it does not get reinvented three times.

**Step 3: Test — the six paths**

1. **Happy path.** Drain `stream` with a reader; the concatenation equals the
   input. `await done` gives `status: 'ok'`, `body` equal to the same string,
   `truncated: false`, `firstTokenMs` a non-null number, `chars` correct.
2. **Mid-stream failure.** `failAfter: 2`. The reader receives
   `c0 + c1 + notice`. `done.body` is `c0 + c1` — **assert the notice is absent
   from the body**, explicitly, by substring. `status: 'partial'`.
3. **Immediate failure.** `failAfter: 0`. Reader receives only the notice.
   `done.body === ''`, `status: 'failed'`.
4. **Client cancel.** Read one chunk, then `reader.cancel()`. `done` settles
   with `status: 'aborted'` and the body holding what had been sent. Assert it
   settles **within a short timeout** — the failure mode this guards is a
   promise that never resolves, which manifests in production as an `after()`
   callback parked for 45 seconds on every abandoned reading.
5. **Truncation.** 30,000 characters with `maxBodyChars: 20_000`. The reader
   receives all 30,000; `done.body.length === 20_000`; `truncated: true`;
   `chars === 30_000`.
6. **`finish()` exactly once.** Wrap `settle` in a counting spy; assert 1 in
   every path above, especially the cancel-during-error case (cancel the reader
   while the source is mid-throw).

Plus one non-blocking assertion worth having: with `delayMs: 5` and 10 chunks,
the time between the source yielding a chunk and the reader receiving it stays
under a millisecond. It is a soft assertion and it is the only automated
statement of the property the whole design exists for.

**Step 4: Verify**

```sh
npm test -- tee
```

**Step 5: Commit**

---

### Task 8: `flush.ts` and the retry

**Files:**
- Create: `src/lib/analytics/flush.ts`, `src/lib/analytics/flush.test.ts`
- Requires: W1's schema and test harness

**Step 1: Build it**

`sanitizeProps`, `isTransient`, `withRetry`, `flushEvents`, `persistReading`.
Per §9 and §11.

**Step 2: Test — pure parts, no DB**

- `sanitizeProps` drops arrays, objects, functions and `undefined`; truncates a
  200-char string to 120; caps at 24 keys; drops `__proto__`, `constructor` and
  a key with a capital letter; passes numbers, booleans and `null` through
  untouched. **This is the privacy guarantee (§11) and it should be commented
  as such in the test file**, so nobody relaxes it for convenience later.
- `isTransient` against the table in §9: a fabricated error with `code: '08006'`
  is transient, `'23505'` is not, `'ECONNRESET'` is, an undecorated `Error` is
  not.
- `withRetry` attempts three times on a persistently transient error, once on a
  permanent one, and stops early when the next delay would exceed the budget.
  Fake timers, so the test is instant.

**Step 3: Test — integration** *(needs W1's harness)*

- `persistReading` writes one `readings` row and N `reading_cards`, with
  `local_date` propagated to both (delta D-C).
- A forced failure in the cards insert rolls back the `readings` row. Assert
  zero rows — an orphaned reading is the specific thing the transaction is for.
- Calling `persistReading` twice with the same id leaves exactly one row
  (`on conflict do nothing`).
- `status: 'blocked'` writes the reading and **zero** cards (A17).
- `flushEvents` with 12 rows issues **one** statement. Assert with a query
  counter or the driver's log, not by counting rows — the point is one insert,
  not twelve rows.
- `ANALYTICS_ENABLED=0` writes nothing and does not throw.

**Step 4: Commit**

---

### Task 9: Wire the reading route

**Files:**
- Modify: `src/app/api/reading/route.ts`

**Step 1: Read the file top to bottom before changing a character.** Its
comments record two bugs that cost real time. Nothing in this task touches the
four invariants restated in §9, and the diff should make that obvious to a
reviewer.

**Step 2: Apply §9's shape**

`maxDuration`, the two headers, `withAnalytics`, the reading uuid, the
validation-failure events, `teeReading`, the `defer()` block, `x-reading-id`.

Two ordering details that are easy to get backwards:
- The reading uuid is generated **before** the provider call, so it can be a
  header and so `reading.requested` can carry it.
- `track()` on an early return happens **before** the `return`, obviously, but
  note that the response is still constructed and returned synchronously — the
  buffered event costs nothing on that path.

**Step 3: Verify by hand, with the existing curl**

```sh
curl -N -X POST localhost:3000/api/reading \
  -H 'content-type: application/json' \
  -H 'x-jm-session: 11111111-1111-4111-8111-111111111111' \
  -H 'x-jm-local-date: 2026-07-26' \
  -b 'jmtarot_session=<from devtools>' \
  -d '{"reader":"adrian","service":"spread3","picks":[{"id":18,"reversed":true},{"id":7,"reversed":false},{"id":13,"reversed":true}],"question":"apakah dia serius"}' \
  -D -
```

Check, in order:
1. Prose still arrives **progressively**. If it arrives in one lump, the tee is
   buffering and the whole workstream has failed at its one job. `curl -N` and
   watch it.
2. `x-reading-id` is in the response headers.
3. In `psql`, within a second or two of the stream ending:
   `select id, status, latency_ms, length(body), local_date, prompt_version from readings order by created_at desc limit 1;`
   — `status = 'ok'`, `local_date = '2026-07-26'`, `latency_ms` a plausible
   TTFT, `body` the full prose with **no** `[Bacaan terputus...]` in it.
4. `select card_id, reversed, position, local_date from reading_cards where reading_id = '<id>' order by position;`
   — three rows, matching the request.
5. `select name, props->>'reading_id' from events order by created_at desc limit 5;`
   — `reading.requested`, `reading.first_token`, `reading.completed`, all with
   the same `reading_id`, all with the same `created_at` (one batch, one
   insert).

**Step 4: Verify the failure paths**

- **Mid-stream failure.** Point `LLM_BASE_URL` at a local script that sends two
  chunks and then closes the socket. Expect: the notice on screen, a `partial`
  row, a body without the notice, and a `reading.failed` event.
- **Client abort.** Start the curl, `Ctrl-C` after a second. Expect an
  `aborted` row with a partial body and a `reading.aborted` event, arriving
  within a couple of seconds — not after `ANALYTICS_STREAM_TIMEOUT_MS`. If it
  takes 45 seconds, the `cancel()` handler is not firing.
- **Database down.** `sudo systemctl stop postgresql` (or stop the container).
  The reading must still stream, complete, and look completely normal. The only
  evidence should be `[analytics] readings write failed` in the server log,
  three times. **This is the single most important manual check in the plan** —
  it is the literal statement of Miftah's requirement.
- **Bad `local_date`.** Send `x-jm-local-date: banana`. The reading works, the
  row has today's UTC date, and there is an `analytics.local_date_fallback`
  event with `reason: 'malformed'`.
- **No headers at all.** The reading works. `session_id` is null,
  `local_date` falls back.

**Step 5: Commit**

---

### Task 10: Instrument the client surfaces

**Files:**
- Modify: `src/app/[reader]/[service]/Draw.tsx`, `src/app/page.tsx` (via a small
  client component — it is a server component today), `src/app/[reader]/page.tsx`
  (same), `src/app/login/page.tsx`, `src/components/CardDetail.tsx`

**Step 1: The draw screen**

`Draw.tsx` is where most of the taxonomy fires.

- `draw.started` in the mount effect, alongside the existing shuffle effect.
- `draw.card_picked` / `draw.card_returned` in `tapCard` and `returnCard`.
  **Read the card id from `deckRef.current`, not from `deck`.** The comment on
  `deckRef` records the exact bug this avoids: under StrictMode the closure's
  deck and the rendered deck can be two different shuffles, and an analytics
  event that logs the wrong card is a *silent* version of the bug that already
  cost this project a debugging session. Same ref, same reason.
- **Do not call `track()` from inside a `setState` updater.** CLAUDE.md's
  StrictMode trap applies verbatim: updaters are double-invoked, so the event
  would fire twice. `togglePick` is called inside an updater today; the
  `track()` goes in the callback body, before `setPicks`.
- `draw.card_detail_opened`, `draw.reshuffled`, `draw.completed`.
- `question.typed` on blur or on submit — **not** on `onChange`, which would be
  one event per keystroke. `question.skipped` when the request goes out with no
  question.
- `reading.requested` / `reading.completed` / `reading.failed` /
  `reading.aborted` from the client's own view of the fetch, with
  `props.source: 'client'` and `reading_id` read from the `x-reading-id`
  response header. §10 depends on this existing.
- `reading.retried` on the retry button; `reading.rate_limited` on the 429
  branch.
- Add the two headers to the existing `fetch` (§5).

**Step 2: The pickers and login**

`src/app/page.tsx` and `src/app/[reader]/page.tsx` are server components and
should stay that way. Add a tiny `'use client'` `<TrackView name=... props=.../>`
component that fires once in an effect and renders nothing. `reader.viewed`,
`reader.chosen` (on the Link's click), `service.chosen`.

`app.launched` fires once from the root layout's client shell, with
`standalone: window.matchMedia('(display-mode: standalone)').matches` — which is
also the first data anyone will have about whether Add to Home Screen is
actually being used.

**Step 3: Verify — the iframe harness**

This is exactly the question CLAUDE.md's harness technique was built for: *does
the UI agree with what it sends?* The card ids in `draw.card_picked` must match
the card ids in the `/api/reading` body, which must match the rendered `alt`
text. Three independent representations of the same draw, and the deckRef bug
proved two of them can disagree silently.

Create a scratch `public/cards/_dev-events.html` that:

1. plants the session cookie;
2. loads `/thessaly/spread3` in a same-origin iframe;
3. patches the iframe's `fetch` **and** `navigator.sendBeacon`, recording every
   `/api/events` and `/api/reading` body;
4. dispatches real `PointerEvent`s at three cards in the fan;
5. calls the iframe's `flushNow()` (exported from `track.client.ts` for exactly
   this);
6. renders a diff of: the `alt` text of the three picked cards, the `picks`
   array in the `/api/reading` body, and the `card_id` props of the three
   `draw.card_picked` events.

All three must agree. Also assert the batching claim visually: three taps must
produce **one** `/api/events` request, not three.

> **Trap.** `next.config.ts` serves `/cards/:path*` with
> `cache-control: public, max-age=31536000, immutable`, and `next dev` applies
> `headers()` too. Your scratch file will be cached for a year by the browser
> you are testing in. Load it with a changing `?v=` query string, or keep
> DevTools' "Disable cache" on. Losing twenty minutes to an edit that "did not
> take" is the predictable version of this.

Delete the scratch file before committing. `public/cards/` is otherwise
generated-and-committed and must not acquire hand-written residents.

**Step 4: Commit**

---

### Task 11: Loss detection and the operator's queries

**Files:**
- Create: `docs/analytics-queries.md`

**Step 1: Write the queries down**

Not code — a short file of SQL an operator runs. The one that matters is §10's
reconciliation query; the rest are the ones somebody will otherwise reinvent
badly at 2am:

- lost `after()` writes (§10) — the alarm;
- readings per user per day, and the `status` breakdown;
- p50/p95 `latency_ms` by `service_id` and by `prompt_version` — this is the
  query that makes A14's hash pay for itself, because a prompt change that
  slows the first token by 400ms is otherwise invisible;
- funnel: `reader.viewed` → `service.chosen` → `draw.started` →
  `reading.completed`, by day;
- `analytics.local_date_fallback` volume — should be ~zero; anything else means
  a broken client;
- `analytics.events_dropped` by reason;
- top cards by `reading_cards`, which is a dry run of W5's frequency query
  against real data.

**Step 2: Run every one of them** against the local database with a few real
readings in it. A query in a document that has never been executed is a
liability, not documentation.

**Step 3: Commit**

---

## 14. Verification summary

| Loop | Covers |
|---|---|
| Vitest, no DB | taxonomy, `track`/`defer`/`withAnalytics` batching, local-date validation, the client batcher, `sanitizeProps`, `isTransient`, `withRetry`, and all six stream-tee paths |
| Vitest + W1's harness | `persistReading` transactionality and idempotency, the one-insert `flushEvents`, `local_date` propagation |
| `curl -N` + `psql` | the real route: progressive streaming, the four outcome statuses, the four failure paths, and **the database-down check** |
| The `public/cards/` iframe harness | client transport — does the UI agree with what it sends, and is a three-tap draw really one request |
| `npm run smoke` | the `LLMProvider` change did not break the existing consumer; z.ai's usage really is null |
| Real iPhone, Vercel preview | `visibilitychange` on a real app-switch — this is the one that cannot be faked, because it is the mechanism by which most sessions on this app will actually end |

No Playwright. There is still none and there must still be none.

---

## Open questions for reconciliation

1. **Do failed and aborted readings count toward the frequency verdict?** They
   write `reading_cards` because the querent did draw those cards. W5 owns the
   answer. If the answer is no, `reading_cards` needs its own filterable
   column and delta D-C grows — decide before W5 starts, not after.
2. **Does W5 want `readings.gist text`?** A cached one-clause summary for the
   chained-reading block, instead of re-deriving it from `body` on every
   prompt build. It is a delta on a §3 table and it is W5's need, so W5 should
   propose it; flagged here so it is not discovered late.
3. **`latency_ms` = TTFT.** Decided in A12 and stated because §3 does not say.
   Confirm, or say so now — changing the meaning of a populated column later
   means every historic row is a different measurement.
4. **`LLMProvider` shape.** §D-E chose the intersection type
   (`AsyncIterable<string> & { usage }`) over the cleaner
   `{ chunks, usage }` object, to keep W5/W6/W7's existing `for await`
   consumers compiling. If reconciliation prefers the object form, decide it
   once, centrally, and update this plan — do not let two workstreams discover
   it in a merge.
5. **Retention on `events`.** Nothing here deletes anything. 180 days and a
   monthly delete is a reasonable default, but it is a policy question W7's
   privacy page has to state, so W7 should set the number.
6. **How long are questions kept?** §11 assumes "as long as the account
   exists". If the answer is shorter, it is a scheduled job and it is easier to
   build now than to retrofit onto a table with two years of rows.
7. **Who owns `src/app/api/events/route.ts`?** Claimed here; it is not in
   roadmap §4's module map. It is analytics-shaped, so W4 seems right, but it
   is also a public unauthenticated endpoint, which is W7-shaped. At minimum
   W7 should review it.
8. **Zero token data on z.ai.** `token_input`/`token_output` will be `NULL` for
   as long as `LLM_PROVIDER=zai` (§8). If anyone is planning a cost dashboard,
   they need to know now that the data will not be there.
9. **`ANALYTICS_ENABLED=0` in CI.** Assumed, so `npm test` and `npm run smoke`
   do not need a database. Confirm with W1 that its integration harness sets it
   back to `1` for its own tests.

---

## Summary of decisions, for the other six

- **`track(name, props)` returns `void` and is never awaited.** Import it from
  `@/lib/analytics/track` on the server, `@/lib/analytics/track.client` in a
  client component. Same signature both sides, enforced by a shared `TrackFn`
  type. Never import the server one into a client component.
- **Event names are a closed union** in `src/lib/analytics/events.ts`. Adding
  one means adding a name and a prop shape; the file will not compile with only
  one of the two. **Never put free text in props** — that rule is what lets us
  keep events after a user is erased, and it is enforced at runtime by
  `sanitizeProps`.
- **All writes go through one `after()` per request**, registered by
  `withAnalytics`. Deferred work runs first, then one batched insert into
  `events`. `readings`+`reading_cards` are one transaction with a bounded
  retry; everything else fails silently and logs.
- **The reading body is captured by a manual fan-out inside the existing
  `ReadableStream`**, in `src/lib/analytics/tee.ts`. The client is enqueued
  before anything is accumulated, the `[Bacaan terputus...]` notice never
  reaches `readings.body`, and the `after()` callback parks on a promise the
  stream settles rather than trusting Next's timing.
- **Three schema deltas:** `readings.status`, `readings.session_id`,
  `reading_cards.local_date`. Plus an index on `events (session_id, created_at)`.
  W5 in particular should read D-C — without it the "this week" frequency
  window is seven hours wrong in Jakarta.
- **One cross-workstream interface change:** `LLMProvider.streamReading` returns
  `AsyncIterable<string> & { usage: Promise<ReadingUsage> }`. Existing
  `for await` consumers are unaffected by design. `ReadingPrompt` also gains
  `promptVersion`, computed as a hash of the static prompt layers — **W6, this
  is yours to implement** and it is the only way §3's `prompt_version` column
  gets filled.
- **Everything client-supplied is untrusted:** `local_date` is bounded to ±1
  day of the server's UTC date and falls back with a diagnostic event rather
  than failing a reading; `session_id` must be UUID-shaped; the collector route
  never trusts a body-supplied user id and always answers `204`.
- **W2:** I need `getSessionUser()` returning the `users.id` **uuid**, and one
  line in `middleware.ts` making `/api/events` public.
- **W7:** the question text goes in your `moderation_flags.question`, never in
  `events.props`; and `users.deleted_at` does **not** cascade on its own — §11
  has the table of what the erasure routine must actually delete.
- **The reading route's four invariants are untouched.** Card ids and
  orientation only; every word of card text derived server-side; the yes/no
  verdict derived in code; a mid-stream failure cannot become a 500. If a diff
  in this workstream appears to change any of those, it is wrong.
