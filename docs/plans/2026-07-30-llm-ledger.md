> **RECONCILED 2026-07-30 — `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` OUTRANKS THIS
> PLAN AND THE ROADMAP. Read it before implementing a single task.** The six plans returned
> **51 defects in the roadmap they were reconciling**; nineteen were verified against running
> code and **four would have shipped**.
>
> **Rulings binding on A2:** R2 (**`tee.ts` gets zero lines**), R4 (**four statuses — `'refused'` struck**), R5 (`total_ms`, timed at the call not the request), R16 (**FIX `nonZero()`**), R17 (**own `store.calls` buffer — `drain()` orphans a nested `defer()`**; §6 gains `track.ts`/`flush.ts`), R18, R47, R48, R49, R50, R51.
>
> Where this plan disagrees with a ruling above, **this plan is wrong.** Its unamended text is
> kept deliberately — the reconciliation is an amendment, not a rewrite (the v0.4.0 precedent).

# A2 — The LLM Call Ledger Implementation Plan

**Goal:** this application makes nine distinct LLM calls and records the token cost of
exactly one of them. After A2 it records all nine, in one fact table, with the model, the
purpose, the user, the outcome and the wall time — and **nothing about the provider layer
changes**, because the provider layer is already correct.

**Architecture:** one new table, `llm_calls`; one required call-site identity, `op`, on the
one method that reaches a model non-streaming; **one chokepoint** (`metered()` in
`src/lib/llm/index.ts`) covering all six buffered sites with no caller edit beyond passing
`op`; **three hand-threaded** streaming sites; one **request-scoped row buffer** flushed by
W4's existing single `after()`; and a **PURE, zero-import price table** read at query time,
because a `cost_usd` column would be a lie the day a price changes.

**Tech Stack:** unchanged. Drizzle + postgres.js, `LLMProvider` from `@/lib/llm`, Vitest
(unit + integration). **No new dependency of any kind** (§9.7).

---

**Governing documents, highest first:**
`docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` (not written yet) →
`PUBLIC_RELEASE_ROADMAP_v0.5.0.md` → this file. Everything in `CLAUDE.md`,
`docs/workstream-notes.md`, `docs/plans/2026-07-26-RECONCILIATION.md` and the earlier
roadmaps still binds. **A-D4, A-D5, A-D6, A-D7, A-D17 and A-D18 are fixed decisions** —
this plan implements them and does not relitigate them. Where it *amends* one, the
amendment is labelled and the reason is stated, so reconciliation can refuse it in one
place.

**Owns:** the `llm_calls` table and migration `0010_v12-llm-calls.sql`; the `op` identity
(`LLMOp`, `CompleteOpts`) in `src/lib/llm/types.ts`; the ledger write in `metered()`;
`src/lib/llm/ledger.ts`; `src/lib/llm/prices.ts`; `src/lib/db/queries/admin/calls.ts`; the
`op` assertions in `src/lib/llm/callClass.test.ts`; and the one-line reads at the nine call
sites.

**Depends on:** A1 for **nothing at runtime**. §0.1 says A2 depends on A1 for `events.ts` —
**it does not** (see `## Event deltas`: A-D18 dropped `llm.call_recorded`, so A2 declares no
event and touches no taxonomy). The only real ordering constraint is migration numbering:
`0010` follows A1's `0009`, and drizzle's `meta/_journal.json` is the file that will
conflict (`migrations/README.md` rule 6).

**Consumed by:** A3 (every aggregate), A5 (the per-user cost page), A4 (the headline
figure). `## Interfaces I export` is written for them.

---

## 1. What is missing, and what is emphatically not

`types.ts` already defines the whole contract:

```ts
export type ReadingUsage = { inputTokens: number | null; outputTokens: number | null };
export type LLMStream = AsyncIterable<string> & { usage: Promise<ReadingUsage> };
```

Both adapters resolve `usage` in a `finally` on **every** exit path — normal end, thrown
error, and the early return a consumer causes by breaking out of its `for await`:

```ts
        } finally {
          /*
           * RESOLVE ON EVERY EXIT PATH -- normal end, thrown error, and the
           * early return a consumer causes by breaking out of its `for await`,
           * which runs this `finally` when the iterator is closed.
           */
          resolveUsage({ inputTokens, outputTokens });
        }
```

And `complete()` returns `{ text, usage }`. **Eight of the nine call sites destructure
`usage` away.** `const { text } = await getProvider().complete(...)` appears six times;
`/api/memory/summary` and `translate.ts` take `[Symbol.asyncIterator]()` off the stream and
never touch `.usage`. Only `/api/reading` threads it, through `teeReading` into
`readings.token_input` / `token_output`.

So A2 is **a table plus eight reads**. Three things it is not:

1. **Not a provider change.** `anthropic.ts` and `openai.ts` gain nothing except the
   `nonZero()` fix in Task 2, which is one line and is §12.6.
2. **Not a change to `usage`'s contract.** A-D6 and `types.ts:133-138`. Nothing awaits it
   on a hot path; nothing may make it reject; nothing may make it hang.
3. **Not a second reservation.** See A2-D1.

---

## 2. Decisions

### A2-D1 — `streamReading` stays unwrapped, and the reservation count per reading stays at ONE

`src/lib/llm/index.ts` already says why, in capitals, and it is quoted here because the
temptation to "finish the job" is the single most expensive mistake available in this
workstream:

```
 * **SO THE READING RESERVES EXPLICITLY IN `/api/reading`** … **If you "finish the job" by
 * wrapping the stream as well, there will be two reservations per reading and a ceiling
 * that is half what it says.**
```

A ledger is not a reason to revisit that. The decorator's `streamReading` line stays
`streamReading: provider.streamReading` — a bare passthrough — and the three streaming
sites keep the `reserveModelCall()` calls `callClass.test.ts` already enumerates. **The
proof is a test, not an argument:** Task 6's `metered.test.ts` case reserves against a
ceiling of 10, makes one `complete()` call that writes a ledger row, and asserts the window
shows **nine** remaining, not eight.

### A2-D2 — The ledger row is written by the request's existing `after()`, through a buffer, and NEVER by `defer()`

This is the one non-obvious mechanical decision in the workstream, and getting it wrong
loses a third of the rows silently.

`track.ts`'s `drain()` is:

```ts
async function drain(store: Store): Promise<void> {
  for (const job of store.deferred.splice(0)) {
    try { await job(); } catch (err) { logAnalyticsFailure('deferred', err); }
  }

  const rows = store.buffer.splice(0);
  if (rows.length === 0) return;
  …
}
```

`splice(0)` empties the live array and returns a **copy**, which is what the loop iterates.
So a `defer()` called *from inside a deferred job* pushes onto an array nothing will drain
again — and `ensureRegistered` returns early, so no second `after()` is registered either.
**The job is orphaned, silently, with a green suite.**

Three of the nine ops run inside that loop:

| op | runs inside | via |
|---|---|---|
| `gist` | `/api/reading`'s `defer()` | `extractGist` → `complete()` |
| `translation_repair` | `settle()`'s `defer()` | `generate(args, violations)` → `complete()` |
| `frequency` (regeneration arm) | `after(() => generate(…))` | `complete()` |

`track()` from inside a deferred job **works**, because the *event* buffer is spliced after
the deferred loop. So the ledger takes exactly that shape: `store.calls`, spliced and
flushed **after** the deferred loop and beside `flushEvents`. Same file, same `after()`,
same failure policy, and by construction it catches rows produced by deferred work.

**This is an unlisted edit to `src/lib/analytics/track.ts` and `flush.ts`** — see
`## Roadmap defects and asks`. The alternative designs and why they lose:

- **`defer()` per row** — orphans `gist`, `translation_repair` and half of `frequency`.
- **A bare `after()` per row** — throws inside `pull()` (V2 measured it: `` `after` was
  called outside a request scope ``) and probably inside another `after()`.
- **Await the insert in `metered()`** — a database round trip on the moderation classifier's
  path, which is the one call whose p95 budget is the reason `MODERATION_MODEL` exists.
  Forbidden by A-D6 in words.

### A2-D3 — Attribution comes from `AnalyticsContext`, not from a new parameter

`user_id`, `locale` and `local_date` are the four fields `flushEvents` already reads off
`ctx`:

```ts
      userId: ctx.userId, sessionId: ctx.sessionId, … locale: ctx.locale, localDate: ctx.localDate,
```

The ledger takes them from the same place, at flush time. **Consequence: no call site
passes a user id, which is what makes A-D5's "no caller edits beyond passing `op`" literally
true.** It also means `local_date` is the querent's own calendar day, sent by the client,
**never recomputed from `created_at`** — the Jakarta trap, and the reason `dateCol` is a
string.

Outside a scope (`utcDateString()`, `user_id` null) is the roadmap's stated answer for a
call with no querent. **It also currently swallows three real querents** — the Lotus paths —
which Task 12 fixes or records. See `## Roadmap defects and asks`, ask 3.

### A2-D4 — `total_ms`, not `latency_ms`, and the column measures THE CALL

Resolving §12.2: **A2 proposes `total_ms` and reconciliation should adopt it.**

- `readings.latency_ms` is **time to first token** — `tee.ts`'s `ReadingOutcome.firstTokenMs`,
  and its comment says so: *"-> `readings.latency_ms`. Time to FIRST TOKEN (plan A12), not
  total."* Two columns named `latency_ms` meaning two different measurements, in one schema,
  is a trap that costs an operator one wrong conclusion and no error.
- `reading.completed` **already** carries both words with the right meanings (`latency_ms` =
  TTFT, `total_ms` = total). The ledger should speak the vocabulary the taxonomy already
  established, not a third one.
- **Six of the nine ops have no TTFT at all.** A buffered `complete()` has one arrival. A
  column called `latency_ms` would mean TTFT for three rows and total for six, which is
  worse than either.

**And the ledger's `total_ms` measures the MODEL CALL, not the request.** For `op: 'reading'`
that is deliberately **not** `outcome.totalMs`, which `teeReading` measures from
`opts.startedAt` — the top of the handler — and therefore includes four rate-limit round
trips, the Lotus read, the chain read and the classifier. Task 7 adds one timestamp
immediately above `gateReading`. **Expect `llm_calls.total_ms` to be smaller than
`reading.completed.total_ms` for the same reading; that is the two columns being honest
about two different subjects,** and A3 must not reconcile them.

### A2-D5 — `nonZero()` goes on `anthropic.ts`'s buffered path. Resolving §12.6 by FIXING it

Today, one provider fact is recorded two different ways by one adapter:

```ts
        // streamReading -- nonZero applied
            if (event.type === 'message_start') {
              inputTokens = nonZero(event.message.usage?.input_tokens);
            }
```
```ts
      // complete -- NOT applied  (anthropic.ts:149-152)
      const usage: ReadingUsage = {
        inputTokens: message.usage?.input_tokens ?? null,
        outputTokens: message.usage?.output_tokens ?? null,
      };
```

z.ai reports `input_tokens: 0`. So a streamed call stores NULL and a buffered call stores
`0`, from the same provider, for the same absence. **Fix it.** Three reasons:

1. **The roadmap's own worry is empty.** §12.6 hesitates because "fixing it changes existing
   behaviour on a path nothing currently reads" — and *nothing currently reads it* is the
   whole argument for fixing it now. After A2 six ops read it, and then it is a data
   migration.
2. `0` is indistinguishable from a real zero in a dump and makes every average silently
   wrong, which is the reason `nonZero` exists at all.
3. It is the same rule A-D7 states for prices: **absence is NULL, never 0.**

**`openai.ts` is NOT changed.** Its header says why, and the reason is a fact about that
provider rather than a style: *"**`input_tokens` is REAL here**, unlike z.ai's `0`. So
`nonZero()` is deliberately NOT copied over: a genuine zero-token prompt is impossible and
a zero from OpenAI would be a fact worth seeing, not noise worth hiding."* Preserve that
asymmetry and its comment.

### A2-D6 — A ceiling refusal writes NO row, and `'refused'` leaves the status set

§3.2 lists `status` as `'ok' | 'partial' | 'failed' | 'aborted' | 'refused'`. **A2 proposes
four values — the `tee.ts` vocabulary exactly** — and drops `'refused'`.

- A refusal by `reserveModelCall` is **a call that never reached a provider.** A row for it
  makes `count(*)` from the ledger stop meaning "model calls made", which is precisely the
  number the release exists to compare against `LLM_WINDOW_CALL_CEILING=280`. Every A3
  query would need `where status <> 'refused'` and the first one to forget it under-reports
  headroom.
- **The refusal is already recorded**, with a user id, a tier and the ceiling:
  `track('llm.ceiling_reached', { tier, call_class, used, ceiling })`, and
  `docs/analytics-queries.md` query 9 already reads it. A-D18's own rule applies: *"A fact
  table and an event stream recording the same fact is how they drift."*
- `'partial'` is kept and is real: a mid-stream failure on the reading (`tee.ts`), on the
  streamed translation (`break` in `iterate`'s loop) and on the day summary
  (`controller.close()` in `pull`).

### A2-D7 — Tokens are stored; cost is computed at read time; an unknown model is `null`

A-D7, implemented. `src/lib/llm/prices.ts` is **PURE with zero imports** — the `origin.ts`
and `resources.ts` precedent — keyed by model with an `effective_from` date, so a price
change is additive and a historical range is priced with the prices of its own period.

**Two figures, and they are different numbers:**

- **`costUsd()` — the real marginal cost.** z.ai is a fixed annual subscription, so its
  marginal cost per token is genuinely **zero**, priced at zero *explicitly and with a
  comment*.
- **`notionalUsd()` — what these tokens would cost at the fallback provider's rate.** That
  is the number worth watching, because a key revocation lands on the fallback. It is
  computed from the same token counts against `NOTIONAL_MODEL`'s row.

**Nothing unverified enters the table** (`resources.ts`'s rule, and a price is the other
number where being out of date is a real failure). Each row carries `verifiedOn` and a
`source`, and `prices.test.ts` **fails** on a row older than 365 days — the same
deliberately time-bombed check `resources.ts` carries, for the same reason. **A2 ships the
z.ai rows at zero (verified: it is a subscription) and leaves the fallback rows for a human
who has read a price page.** Until one is filled, `notionalUsd()` returns `null` and A4's
headline must be a call count. That is an honest empty state and it is stated in
`## Open questions` so A4 is not surprised.

### A2-D8 — `op` is required where the ledger is written and optional in the shared bag

`LLMCallOpts` is shared by `streamReading` and `complete()`. Making `op` required on it
would break `getProvider().streamReading(prompt, { signal })`. So:

```ts
export type LLMOp = 'reading' | 'moderation' | 'gist' | 'day_summary' | 'frequency'
                  | 'lotus' | 'persona' | 'translation' | 'translation_repair';

export type LLMCallOpts = { …; op?: LLMOp };
/** `complete()` REQUIRES it: this is the method the decorator writes a ledger row for. */
export type CompleteOpts = LLMCallOpts & { op: LLMOp };
```

and `LLMProvider.complete(prompt: CompletionPrompt, opts: CompleteOpts)`. The parameter
becomes **required at the interface**, which turns "a new buffered call site forgot to
declare itself" into a compile error rather than a row with no purpose. Adapters keep
`opts?: LLMCallOpts` and need no edit (parameter bivariance).

Nine ops for nine sites, and **`translation_repair` is separate from `translation` because a
repair pass is a second call the querent never waited for** — folding them hides the cost of
V2's repair architecture, which is the one thing V2's own header asks to be able to measure.

### A2-D9 — `reading_id` is set for `op: 'reading'` only, and the duplication with `readings.token_*` is deliberate

A-D17. `readings.token_input` / `token_output` **stay**: they are read by
`docs/analytics-queries.md` and by `reading.completed`, and removing them is a destructive
migration for no gain. The precedent for the duplication is `reading_cards.user_id` and
`readings.shared_at`. The consistency check is a query with a stated expected answer of zero
rows, handed to A3 (`## Interfaces I need`).

---

## 3. The invariants

Numbered, each with its reason, because a reason is what survives a refactor.

1. **`usage` always settles and never rejects, and A2 does not touch that.** Nothing awaits
   it on a hot path, so a rejection is an unhandled rejection — a process warning today and
   a crash under some configurations — and a promise that never settles parks the `after()`
   callback on its timeout for every failed reading.
2. **Every `await` on `usage` is bounded, and the bound is `tee.ts`'s 2000ms.** *A ledger row
   with null tokens is a fact; a request held open for a token count is a bug.* The two new
   awaits (the streamed translation, the day summary) use `usageOrNulls()` with the same
   constant, exported from `ledger.ts` so there is one number.
3. **Snapshot mutable state BEFORE awaiting `usage`.** `tee.ts`'s `finish()` read its fields
   *after* `await source.usage`, by which time a client cancel had made the next `enqueue`
   throw and the catch had overwritten `errorKind` with `'unknown'` — so **every abandoned
   reading was recorded as failing for an unknown reason**. Any new code that awaits `usage`
   and then reads state has the same bug. The two new sites build their row object first and
   fill `input_tokens`/`output_tokens` last.
4. **A `ReadableStream`'s `pull()` is not in a request scope.** The streamed translation's
   ledger write goes inside `inScope(…)`, `bindAnalyticsScope()`'s wrapper, for the reason V2
   paid for: outside it, `track()` and `defer()` fall through to a bare `after()` which
   throws there, and **every streamed translation silently lost its event and its repair
   pass for as long as V2 had shipped.** *If you write another route that hands Next a
   `ReadableStream` whose producer records anything, it needs this too.*
5. **No ledger write is on the path of a byte the user is waiting for.** Buffered into the
   request's one `after()` (A2-D2). The single branch that performs I/O in its caller's
   `await` is the one reached only when there is neither a store nor an `after()` — provably
   inside another `after()` callback or a script, i.e. never a request path. See A2-D2 and
   Task 5.
6. **A failed ledger write is logged and swallowed, and never retried.** W4's two failure
   policies: the `readings` row gets a bounded retry because a missing row breaks a
   user-facing memory feature; a ledger row breaks a dashboard. `flushCalls` follows
   `flushEvents`.
7. **Never log a driver error from a path that runs a query.** A postgres error quotes the
   failing statement *and its bound parameters*, and `readings.question` is one of them.
   `flushCalls` uses `flush.ts`'s existing `logFailure`, which prints ids, SQLSTATE and the
   error's class in production and everything in development.
8. **`error_kind` is a short classifier, never a message.** `classifyStreamError()` from
   `tee.ts` — already pure, already exported, already the vocabulary §3.2 names. An
   `error_kind` with unbounded cardinality makes every `group by` useless, and a message can
   carry a URL, a prompt fragment or a key.
9. **NULL, never 0, when the provider reports nothing** — on the buffered path too (A2-D5).
10. **`local_date` is the querent's calendar day, a `'YYYY-MM-DD'` string, never recomputed
    from `created_at`.** A `Date` renders in the server's zone and is a day out for anyone in
    Jakarta between midnight and 07:00. For a call with no querent it is `utcDateString()`
    and `user_id` is NULL.
11. **`model` is the resolved model string, never an env var name.** `metered()` resolves it
    exactly as the adapter does — `opts?.model ?? process.env.LLM_MODEL ?? 'unknown'` — so
    `MODERATION_MODEL`, `LOTUS_MODEL`, `PERSONA_MODEL` and `TRANSLATION_MODEL` land as the
    values they resolved to. `'fallback'` is **not** used here: a template written by no
    model makes no call and therefore has no row.
12. **The reservation count per reading is unchanged: one.** A2-D1, asserted.
13. **`src/lib/db/queries/admin/calls.ts` takes the handle first and imports no
    `server-only`.** `queries/contract.test.ts` globs `src/lib/db/**` and enforces both,
    transitively. It therefore may **not** import `@/lib/llm/index` (server-only); the row
    type comes from `schema.ts` and `LLMOp` from the import-free `llm/types.ts`.
14. **The ledger obeys `ANALYTICS_ENABLED`.** `'0'` makes every write a no-op, which is what
    lets `npm test` and `npm run smoke` run with no database (R20) — and Task 14 makes that
    sentence true of `npm run smoke`, which does not currently set it.

---

## 4. The two mechanisms, and the sink

### 4.1 Buffered: one chokepoint

`metered()` becomes:

```ts
    async complete(prompt: CompletionPrompt, opts: CompleteOpts) {
      const reservation = await reserveModelCall(opts.callClass ?? 'interactive');
      // A2-D6: a refusal reached no provider, so it is NOT a ledger row.
      // `llm.ceiling_reached` already records it, with a user id.
      if (!reservation.ok) throw new ModelCeilingError(reservation.tier);

      const startedAt = performance.now();
      try {
        const result = await provider.complete(prompt, opts);
        void recordCall({
          op: opts.op,
          model: resolvedModel(opts),
          callClass: opts.callClass ?? 'interactive',
          streamed: false,
          status: 'ok',
          errorKind: null,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalMs: Math.round(performance.now() - startedAt),
        });
        return result;
      } catch (err) {
        void recordCall({ …, status: 'failed', errorKind: classifyStreamError(err),
                          inputTokens: null, outputTokens: null, … });
        throw err;   // EVERY caller depends on complete() throwing. Rethrow, always.
      }
    },
```

That is the whole of the six buffered sites. `streamReading` above it stays a bare
passthrough with its comment intact.

### 4.2 Streaming: three sites, by hand

Each already owns a place where the work is over and the response has flushed:

| site | where the row is written | why there |
|---|---|---|
| `/api/reading` | inside the existing `defer(async () => …)`, beside `persistReading` | `outcome` already carries status, `errorKind`, `totalMs` and `usage`; the scope is re-entered by `drain` |
| `/api/memory/summary` | inside the existing `after(async () => …)`, beside `putDailySummary` | `body` and `startedAt` are already closed over there |
| `translate.ts` | inside `inScope(…)` at the end of `iterate()` | invariant 4 — outside it the write would do I/O inside `pull()` |

`tee.ts` is **not edited**. `ReadingOutcome` already carries every field the row needs, and
`teeReading` is a pure function over an async iterable with no request scope and no database
handle; putting a write in it would be wrong. See `## Roadmap defects and asks`, defect 2.

### 4.3 The sink

`src/lib/llm/ledger.ts` (server-side; not `server-only`-marked, because `index.ts` above it
already is):

```ts
export type LlmCallRecord = {
  op: LLMOp; model: string; callClass: CallClass; streamed: boolean;
  status: 'ok' | 'partial' | 'failed' | 'aborted';
  errorKind: string | null;
  inputTokens: number | null; outputTokens: number | null;
  totalMs: number | null;
  /** `op: 'reading'` only. */ readingId?: string | null;
};

/**
 * Never throws. Resolves immediately on both scheduled paths; the ONLY branch that
 * performs I/O in the caller's await is the one with no store and no `after()`, which
 * is reachable only from inside another `after()` callback or from a script.
 */
export function recordCall(row: LlmCallRecord): Promise<void>;

/** The bounded wait for a stream's `usage`. One constant, shared with tee.ts's 2000ms. */
export function usageOrNulls(usage: Promise<ReadingUsage>, ms?: number): Promise<ReadingUsage>;
```

and in `track.ts`, `Store` gains `calls: LlmCallRow[]`, `drain()` gains one block **after**
the deferred loop:

```ts
  const calls = store.calls.splice(0);
  if (calls.length > 0) {
    try { await flushCalls(store.ctx, calls); }
    catch (err) { logAnalyticsFailure('calls', err); }
  }
```

`flushCalls` lives in `flush.ts` beside `flushEvents`, takes the same optional trailing
handle, and delegates the statement to `insertCalls(db, rows)` in
`queries/admin/calls.ts` — one multi-row insert for the request.

---

## 5. The nine call sites

`file:line` are as of `4673e50`. `op` is required at every `complete()` site by A2-D8, so
each of the six is a **one-key addition to an options object that already exists** — except
`gist.generate.ts`, whose options object is `{ callClass: 'deferred' }` on its own line.

| # | site | current code | the edit | `op` | `call_class` | `streamed` | row written where |
|---|---|---|---|---|---|---|---|
| 1 | `src/app/api/reading/route.ts:440` | `start: (signal) => getProvider().streamReading(prompt, { signal })` | add `const modelStartedAt = performance.now()` immediately above `gateReading`; add `recordCall({ op: 'reading', readingId, … })` inside the existing `defer`, **after** `persistReading` | `reading` | `interactive` (reserved at :247) | `true` | the existing `defer()` at :586 |
| 2 | `src/lib/moderation/classify.ts:304` | `await getProvider().complete(prompt, { callClass: 'interactive', signal, model: classifierModel(), temperature: 0 })` | `op: 'moderation',` | `moderation` | `interactive` | `false` | `metered()` |
| 3 | `src/lib/memory/gist.generate.ts:67` | `await getProvider().complete({ system, user: gistUserTurn(body), maxTokens }, { callClass: 'deferred' })` | `{ op: 'gist', callClass: 'deferred' }` | `gist` | `deferred` | `false` | `metered()`, buffered from **inside** `drain` — A2-D2 |
| 4 | `src/app/api/memory/summary/route.ts:176` | `iterator = getProvider().streamReading(prompt)[Symbol.asyncIterator]()` | keep the stream object (`const stream = …`); `const inScope = bindAnalyticsScope()` in `generate()`; `recordCall` inside the existing `after()` using `usageOrNulls(stream.usage)` | `day_summary` | `deferred` (reserved at :170) | `true` | the existing `after()` at :229 |
| 5 | `src/app/api/memory/frequency/route.ts:238` | `await getProvider().complete(prompt, { callClass: 'deferred' })` | `op: 'frequency',` | `frequency` | `deferred` | `false` | `metered()`; the `after(() => generate(…))` arm at :174 buffers from inside `drain` |
| 6 | `src/lib/prompt/lotus.generate.ts:159` | `await getProvider().complete(prompt, { model, callClass })` | `{ op: 'lotus', model, callClass }` | `lotus` | threaded, default `interactive` | `false` | `metered()`; **three of four callers have no analytics scope** — Task 12 |
| 7 | `src/lib/persona/generate.ts:339` | `await getProvider().complete(prompt, { model, callClass })` | `{ op: 'persona', model, callClass }` | `persona` | threaded, default `interactive` | `false` | `metered()` |
| 8 | `src/lib/translate/translate.ts:352` | `const stream = getProvider().streamReading({ …prompt, promptVersion: TRANSLATION_PROMPT_VERSION })` | `openStream` returns `{ iterator, first, usage, startedAt }`; `recordCall` inside `inScope(…)` at the end of `iterate()` | `translation` | `interactive` (reserved at :327) | `true` | `inScope(…)` — invariant 4 |
| 9 | `src/lib/translate/translate.ts:423` | `await getProvider().complete(prompt, { callClass: repairing \|\| !spec.stream ? 'deferred' : 'interactive' })` | `op: repairing ? 'translation_repair' : 'translation',` | `translation_repair` \| `translation` | as written | `false` | `metered()`; the repair arm buffers from inside `drain` |

**Site 9 is the one whose `op` is an expression, and it is the same shape its `callClass`
already is.** `generate()` serves three logical calls: a streamed body's non-stream siblings
(`reading.gist`, `persona.body` when `spec.stream` is false) → `translation`; and the
`defer()`ed repair pass → `translation_repair`. `callClass.test.ts`'s existing table already
models a call site whose class is an expression rather than a literal; the `op` marker is
the same trick and Task 11 uses the expression as the marker string.

**The `<pertanyaan>`-shaped hazard at site 1 is unchanged.** The reading's ledger row carries
no prose, no question and no gist: nine scalars, a model name and two ids.

---

## 6. Schema deltas

### 6.1 `llm_calls` — owner A2, migration `0010_v12-llm-calls.sql`

§3.2 verbatim, with the two amendments A2-D4 (`total_ms`) and A2-D6 (four statuses). No
column is added to any existing table. Thirteen tables → fourteen (A1 and A6 add the other
two).

| column | type | null | default | notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `defaultRandom()` | PK |
| `user_id` | uuid | NULL | — | FK→`users.id` **on delete set null**. NULL for a call with no querent |
| `reading_id` | uuid | NULL | — | FK→`readings.id` **on delete set null**. `op: 'reading'` only |
| `op` | text | NOT NULL | — | **bare `text`**, set in the comment. A2 owns the value set, so narrowing it in `schema.ts` would make `schema.ts` depend on a workstream that depends on it — the `events.name` / `frequency_verdicts.window_key` rule |
| `model` | text | NOT NULL | — | the resolved model string, never the env var name |
| `call_class` | text | NOT NULL | — | `'interactive' \| 'deferred'`, mirroring `CallClass`. Bare, same rule |
| `streamed` | boolean | NOT NULL | — | **no default; the caller knows** |
| `input_tokens` | integer | NULL | — | **NULL, never 0** |
| `output_tokens` | integer | NULL | — | same |
| `total_ms` | integer | NULL | — | **the CALL's wall time.** `readings.latency_ms` is TTFT and this is not it (A2-D4) |
| `status` | text | NOT NULL | — | `'ok' \| 'partial' \| 'failed' \| 'aborted'` — the `tee.ts` vocabulary (A2-D6) |
| `error_kind` | text | NULL | — | `classifyStreamError()`'s output. Never a message, never a driver error |
| `locale` | text `$type<Locale>` | NULL | — | narrowed: W1 owns `Locale` |
| `local_date` | date (string) | NOT NULL | — | `dateCol`. **The querent's calendar day** |
| `created_at` | timestamptz | NOT NULL | `defaultNow()` | |

**No `updated_at`.** A ledger row is a fact about a moment; the column would invite an
update, and `$onUpdate()` not firing inside `onConflictDoUpdate` is a trap this table has no
reason to be near.

Indexes:

```ts
  index('llm_calls_created_idx').on(t.createdAt.desc()),         // the fleet time series
  index('llm_calls_user_created_idx').on(t.userId, t.createdAt.desc()),
  index('llm_calls_op_created_idx').on(t.op, t.createdAt.desc()),// cost by purpose
  index('llm_calls_local_date_idx').on(t.localDate),             // the day bucket
  index('llm_calls_reading_idx').on(t.readingId),                // see below
```

**`reading_id` needs its own index and Postgres will not make one for you.** The
`reading_cards_reading_idx` lesson: without it a cascade performs one sequential scan **per
deleted parent row**. Here the action is `set null` rather than cascade, which scans the same
way.

Row types: `export type LlmCall = typeof llmCalls.$inferSelect;` and `NewLlmCall`.

### 6.2 What does not change

No column on `readings` (A-D17), on `users`, on `events`. No `pgEnum`. No retention here —
`llm_calls` retention is A3's, in `src/app/api/cron/sweep/route.ts`, and §12.4 records that
nobody has chosen a number because the honest input is a week of real row rate. **A2's
estimate, for A3 to plan against: 3–6 rows per reading** (reading + ≤1 moderation + gist,
plus a day summary, a frequency verdict, a translation or a persona depending on the visit).

---

## 7. `prices.ts` and the cost model

```ts
/** PURE. ZERO IMPORTS. Hand-maintained. Read the header before adding a row. */
export type ModelPrice = {
  model: string;
  /** 'YYYY-MM-DD'. A price change is a NEW ROW, never an edit. */
  effectiveFrom: string;
  /** USD per 1,000,000 tokens. `null` is not a price — omit the row instead. */
  inputPerMTok: number;
  outputPerMTok: number;
  /** When a human last read this off the provider's page, and where. */
  verifiedOn: string;
  source: string;
  note?: string;
};

export const PRICES: readonly ModelPrice[] = [ /* … */ ];

/** The latest row for `model` whose `effectiveFrom <= on`. `null` for an unknown model. */
export function priceFor(model: string, on: string): ModelPrice | null;

/** `null` — never 0 — for an unknown model or for null tokens. */
export function costUsd(model: string, on: string, input: number | null, output: number | null): number | null;

/** What these tokens would cost at the FALLBACK provider's rate. The watchable number. */
export const NOTIONAL_MODEL: string;
export function notionalUsd(on: string, input: number | null, output: number | null): number | null;
```

Rules, each with its reason:

- **An unknown model prices as `null`, never as zero.** A zero silently understates the bill;
  a null shows up on screen as "unpriced" and gets fixed. **Every cost figure A3 or A4
  renders must be accompanied by the unpriced call *count*,** so a cost is never quoted over
  an incomplete denominator. `callTotals` returns that count.
- **Priced per period, per model, over SUMS — never per row.** A range is grouped by
  `(model, local_date)` first and priced afterwards, so 100k rows cost 100k additions and a
  few dozen price lookups.
- **z.ai is priced at zero explicitly, with the comment.** It is a fixed annual subscription
  sold for coding; the marginal cost of a token really is zero, and the risk it carries is
  quota exhaustion and key revocation, not a bill. Any figure derived from it is **notional**
  and A4 must label it so.
- **`prices.test.ts` fails on a row whose `verifiedOn` is more than 365 days old.** The
  `resources.ts` precedent, deliberately time-bombed: a price nobody has re-read is a number
  the dashboard is quietly asserting.

---

## 8. `src/lib/db/queries/admin/calls.ts`

Handle first on every exported function (invariant 13). No `server-only`, directly or
transitively — so `LLMOp` is imported from `@/lib/llm/types`, which has **zero imports** and
must keep none.

```ts
export async function insertCalls(db: DbOrTx, rows: NewLlmCall[]): Promise<void>;

/** One row per (model, local_date, op). The shape A3's rollups and A4's charts group. */
export async function callTotals(db: DbOrTx, range: { from: string; to: string }): Promise<{
  model: string; localDate: string; op: LLMOp;
  calls: number; inputTokens: number; outputTokens: number;
  /** Rows whose tokens were NULL. The denominator warning A-D7 requires. */
  untokenized: number;
}[]>;

/** A5's per-user page. Same shape, one user. */
export async function callTotalsForUser(db: DbOrTx, userId: string, range: …): Promise<…>;

/** A5's detail list. NO prose of any kind is selectable from this table. */
export async function callsForReading(db: DbOrTx, readingId: string): Promise<LlmCall[]>;
```

**`sql<T>` is an assertion the driver is not obliged to honour.** `answersUpdatedAt` typed
its aggregate `unknown` and converted by hand *because Drizzle maps a timestamp to a `Date`
only when it knows the COLUMN* — inside a raw `sql` template there is no mapper and
postgres.js returns a **string**. That bug survived a green typecheck and a green unit suite
and was only caught by an integration test calling `.getTime()`. **Every `sum()` and
`count()` here comes back as a string too.** So: type the aggregates `unknown`, convert with
`Number(...)` by hand, and Task 4's integration test asserts `typeof … === 'number'` on each.

---

## 9. Verification — the six loops

- **Loop 1 (vitest, `npm test`, no database).** `prices.ts` (period selection, unknown model
  → null, the 365-day rule); `usageOrNulls` (settles, times out, never rejects);
  `classifyStreamError` reuse; `metered()`'s four cases (row on success, row + rethrow on
  failure, **no row on a ceiling refusal**, **reservation count unchanged**);
  `recordCall`'s three sink branches with the ALS store mocked the way V2's mock models it —
  **a mock that only records calls cannot see this class of bug**, so the mock must model the
  scope with a depth counter and the deferred-job case must push and be drained;
  `callClass.test.ts`'s extended grep. **The unit project runs with `ANALYTICS_ENABLED=0`, so
  a test that asserts a row must flip it, as `track.test.ts` does.**
- **Loop 2 (integration, `npm run test:integration`, needs `db:up`).** `insertCalls` +
  `callTotals` inside `withRollback`, with the `Number()` conversion asserted; the FK actions
  (delete a user → `user_id` null, row survives; delete a reading → `reading_id` null); the
  A-D17 consistency query returning zero rows; **the full ledger for one simulated reading**,
  driven through `persistReading`'s harness handle. File named
  `calls.integration.test.ts` or the unit project picks it up and fails with no database.
- **Loop 3 (`tools/shot.sh`).** Nothing. A2 renders no UI.
- **Loop 4 (`getBoundingClientRect`).** Nothing. A2 renders no UI.
- **Loop 5 (CDP, `tools/e2e/run.sh`, `E2E_BASE=http://localhost:3001`).** The acceptance test
  that cannot be unit-tested: sign in, take a real reading, and then read the rows.
  Expected after **one** reading with a question: `op: 'reading'` (streamed, `ok`),
  `op: 'moderation'` (buffered), `op: 'gist'` (buffered, **the A2-D2 proof — if this row is
  missing, the drain-ordering fix is wrong**), and `op: 'lotus'` only if a refresh was due.
- **Loop 6 (a real iPhone against a preview).** Not required by A2 and A2 must not claim it.
  The one thing it would answer — whether a cold lambda plus a suspended Neon compute can
  finish the flush inside `maxDuration` — is worth a note to A3, whose `/api/admin/**`
  routes carry the real cold-path risk (§4.2).

### The acceptance test, verbatim from W4

**Stop the database and take a reading.** It must stream and complete exactly as normal,
with nothing on the screen changed and nothing in the log but `[analytics]` lines. Run it
with `npm run db:down` and then again with `ANALYTICS_ENABLED=0`. A ledger that can fail a
reading is worse than no ledger.

---

## Tasks

### Task 1 — `LLMOp`, `CompleteOpts`, and `op` at fourteen call sites

`src/lib/llm/types.ts` gains `LLMOp` and `CompleteOpts` (A2-D8); `LLMProvider.complete`'s
`opts` becomes required. Then pass `op` at the six app sites in the §5 table **and** at the
eight script/test sites the compiler will name: `scripts/smoke-llm.ts:529,1476,1590,1605,1797`
and `scripts/probe-moderation.ts:111,152,238`. No ledger yet, no behaviour change.

**Accepts when:** `npm run typecheck` is green, `npm run build` is green (run it — a green
typecheck is not enough), `npm test` is green, and `git diff` shows no change to
`anthropic.ts` or `openai.ts`.

### Task 2 — `nonZero()` on `anthropic.ts`'s buffered path

A2-D5, §12.6. Two lines in `complete()`, plus a `usage.test.ts` case driving the existing
`create` mock with `usage: { input_tokens: 0, output_tokens: 40 }` and asserting
`{ inputTokens: null, outputTokens: 40 }`. **`openai.ts` is not touched, and its comment
explaining why stays.**

**Accepts when:** the new case fails before the fix and passes after; `openai.test.ts` is
untouched and green.

### Task 3 — the table and migration `0010`

`llmCalls` in `schema.ts` per §6.1, then
`npm run db:generate -- --name v12-llm-calls`, then `npm run db:migrate`. Commit
`schema.ts`, the `.sql` **and** `meta/` in one commit. **Do not hand-resolve
`meta/_journal.json`** — delete your generated files, take theirs, regenerate.

**Accepts when:** `npm run db:migrate` is idempotent (run it twice), `npm run db:studio`
shows the five indexes, and the migration inserts no row.

### Task 4 — `queries/admin/calls.ts` and its integration test

§8. Handle first; aggregates typed `unknown` and converted by hand.

**Accepts when:** `queries/contract.test.ts` is green (it will fail if the new file reaches
`server-only` transitively or names its first parameter anything but `db`), and
`calls.integration.test.ts` asserts `typeof row.calls === 'number'` for every aggregate.

### Task 5 — the sink: `recordCall`, `store.calls`, `flushCalls`

`src/lib/llm/ledger.ts`, the `Store` field and the `drain()` block in `track.ts`,
`flushCalls` in `flush.ts`. **The ordering is the feature:** deferred jobs, then the call
buffer, then the event buffer.

**Accepts when:** a unit test registers `defer(async () => recordCall(row))`, drains, and
finds the row **flushed** — and the same test fails if the flush block is moved above the
deferred loop. Plus: `recordCall` never throws given a hostile row; outside any scope with
`after()` unavailable it awaits the insert and swallows a failure; with
`ANALYTICS_ENABLED=0` it writes nothing and does not throw.

### Task 6 — `metered()` writes the six

§4.1. Extend `metered.test.ts`:

- a successful `complete()` records one row with `op`, the resolved model, `streamed: false`,
  `status: 'ok'` and the provider's tokens;
- a throwing `complete()` records `status: 'failed'` with a classified `error_kind` **and
  rethrows**;
- a ceiling refusal records **nothing** (A2-D6);
- **with a ceiling of 10, one `complete()` leaves nine remaining** (A2-D1, invariant 12);
- `src/lib/llm/index.ts` still contains `streamReading: provider.streamReading` and
  `reserveModelCall` exactly once.

**Accepts when:** all five pass and the "do not wrap the stream" comment is byte-identical.

### Task 7 — `/api/reading`

`const modelStartedAt = performance.now()` immediately above `gateReading`; `recordCall`
inside the existing `defer`, **after** `persistReading` (registration order is execution
order, and the row every memory feature depends on goes first — the same argument the file
already makes for `extractGist`). Fields from `outcome`: `status`, `errorKind`,
`usage.inputTokens/outputTokens`; `totalMs` from `modelStartedAt`; `readingId`.

**Accepts when:** loop 5 shows one `op: 'reading'` row per reading with the right status; a
cancelled reading (abort mid-stream from the harness) records `status: 'aborted'` and
`error_kind: 'client_disconnected'`; and `llm_calls.total_ms < reading.completed.total_ms`
for the same reading, which is A2-D4 being true rather than asserted.

### Task 8 — `/api/memory/summary`

Keep the stream object; `const inScope = bindAnalyticsScope()` synchronously in `generate()`;
`recordCall` inside the existing `after()`, wrapped in `inScope`, with
`usageOrNulls(stream.usage)`. **Snapshot `status` before awaiting usage** (invariant 3).

**Note, and do not fix it here:** that same `after()` already calls
`track('memory.summary_generated', …)`, and if it runs outside the ALS context that
registered it, that event is being lost today exactly as V2's was. **A2 does not touch W5's
`track()` call** (§6 file ownership, the `PublicShare` precedent) and reports it instead.

**Accepts when:** a real day summary produces one `op: 'day_summary'` row with
`streamed: true`, and `grep "outside a request scope" dev.log` is empty.

### Task 9 — `translate.ts`

`openStream` returns `{ iterator, first, usage, startedAt }`; `recordCall` at the end of
`iterate()` **inside `inScope(…)`** (invariant 4); `op` on the buffered path becomes
`repairing ? 'translation_repair' : 'translation'`.

**Accepts when:** `npm run smoke -- --translate` produces six translations and six rows with
the right `op` split; a deliberately invalid translation produces a `translation` row **and**
a `translation_repair` row; and removing the `inScope` wrapper makes one test fail with a log
line naming `Object.pull` — the negative control V2's notes insist on running rather than
reasoning about.

### Task 10 — `prices.ts` and the cost model

§7, with `prices.test.ts`. z.ai rows at zero with the subscription comment; the fallback rows
left for a human with a price page, so `notionalUsd()` returns `null` until then.

**Accepts when:** an unknown model returns `null` (not 0) from both functions; a range
spanning an `effectiveFrom` boundary prices each side with its own row; a row dated more than
365 days ago fails the suite.

### Task 11 — `callClass.test.ts` asserts the `op` at all nine sites

Add an `op` marker to each entry of `COMPLETE_CALLS` and `STREAM_CALLS` — **the exact source
text**, not a value derived from the expectation, exactly as the `callClass` marker already
is, because site 9's is an expression. Plus: the nine `op` values used across `src/**` are
exactly `LLMOp`'s nine, so a tenth value is a test failure rather than a `group by` with a
stranger in it (seam 3).

**Accepts when:** deleting `op` from any one call site turns the suite red, and adding a
tenth `LLMOp` value with no call site does too.

### Task 12 — attribution for the Lotus, or the recorded gap

Three of the four `generateLotus` callers have no `withAnalytics` scope, so their rows land
with `user_id` NULL, `locale` NULL and a UTC `local_date`:

```
src/app/api/onboarding/answer/route.ts:103        after(() => generateLotus(gate.user.id));
src/app/api/onboarding/answer/[key]/route.ts:208  await generateLotus(gate.user.id).catch(…);
src/app/api/onboarding/complete/route.ts:190      after(() => generateLotus(gate.user.id));
```

**Ask reconciliation to let A2 wrap those three handlers in `withAnalytics`** — W3's files,
unlisted in §6. If refused, the gap is recorded here and in the notes, with the consistency
query that names it (`select count(*) from llm_calls where op = 'lotus' and user_id is
null`), and A5's per-user cost page must say that Lotus distillations are unattributed.

**Accepts when:** either the three routes carry a scope and a real Lotus regeneration
produces a row with the querent's id, **or** the gap is written down in both places with the
query.

### Task 13 — `ANALYTICS_ENABLED=0` on the two live-call scripts

`npm run smoke` and `npm run probe:moderation` do not set it, so after Task 6 they would each
attempt a database insert per model call — eighteen swallowed failures and eighteen log lines
on a run whose whole purpose is that its output is read. One environment variable per script
line in `package.json`, which makes R20's sentence (*"what lets `npm test` and `npm run
smoke` run with no database"*) true of `npm run smoke` for the first time.

**Accepts when:** `npm run db:down && npm run smoke` prints no `[analytics]` line.

### Task 14 — the acceptance loop

`npm run db:down`, then a reading end to end through loop 5. Then `db:up` and repeat.
Then `npm test` and `npm run test:integration`, **separately** (`test:all`'s red means
nothing — it is V9's known harness race).

**Accepts when:** the reading streams identically in both runs; the only difference is the
rows.

### Task 15 — `docs/workstream-notes.md`

A `## The LLM call ledger (A2), v0.5.0` section: the file map, the numbered invariants, the
A2-D2 drain-ordering finding (which is a fact about W4's `drain` that nothing had written
down), the measured row counts per reading, and the two rulings. **Nothing new goes into
`CLAUDE.md`** — §9.12, and reconciliation owns that file.

---

## Event deltas

**None.** A-D18 dropped `llm.call_recorded` with the argument A2 agrees with: *"That is a row
in `llm_calls`, not an event. A fact table and an event stream recording the same fact is how
they drift."* The taxonomy stays at 67 + A1's three. A2 does not import `events.ts`, does not
add a name, and does not read one.

The two existing events A2 relies on and must not change: `llm.ceiling_reached` (the refusal
record, A2-D6) and `reading.completed` (whose `token_input`/`token_output`/`total_ms` the
A-D17 consistency query joins against).

---

## Interfaces I export

For **A3**:

- `callTotals(db, { from, to })`, `callTotalsForUser(db, userId, range)`,
  `callsForReading(db, readingId)` — §8. Grouped by `(model, local_date, op)` because
  pricing is per model per period and bucketing is on the querent's day, never on
  `created_at` in the server's zone.
- `LLMOp` — **nine values, closed.** A3 groups by it and must not invent a tenth or an alias
  (seam 3). Task 11 makes that mechanical.
- `priceFor`, `costUsd`, `notionalUsd`, `NOTIONAL_MODEL` — and the rule that **every cost
  figure travels with its unpriced count**.
- `llm_calls` retention is A3's to choose, in the sweep. **Never `admin_access_log`.**

For **A5**: `callTotalsForUser` and `callsForReading`. The ledger holds **no prose of any
kind**, so a per-user page can render it without any of A5's reveal machinery — no audit row,
no one-key rule, nothing to redact.

For **A4**: `input_tokens` and `output_tokens` share a unit, so they are **two series on one
axis** (A-D11). `untokenized` is the count that must sit beside every spend figure.

## Interfaces I need

- **A1:** migration `0009` merged before `0010` is generated, so drizzle's journal is linear.
  Nothing else — not `events.ts`, not `requireAdmin()`.
- **A3:** `docs/analytics-queries.md` gains the A-D17 consistency check, transcribed rather
  than narrowed. A2's proposed text, expected answer **zero rows**:

  ```sql
  -- Every reading whose ledger row disagrees with its own denormalized token columns.
  select r.id, r.token_input, c.input_tokens, r.token_output, c.output_tokens
    from readings r
    join llm_calls c on c.reading_id = r.id and c.op = 'reading'
   where coalesce(r.token_input, -1)  <> coalesce(c.input_tokens, -1)
      or coalesce(r.token_output, -1) <> coalesce(c.output_tokens, -1);
  ```

  and the ledger-vs-ceiling query, which needs no `status` filter **because A2-D6 writes no
  row for a refusal**:

  ```sql
  select count(*) from llm_calls where created_at > now() - interval '5 hours';
  ```

---

## Open questions

1. **§12.2, `total_ms` vs `latency_ms`.** A2 rules `total_ms` (A2-D4) and additionally rules
   that it measures the **call**, not the request. Reconciliation confirms.
2. **§12.6, `nonZero()` on the buffered path.** A2 rules **fix it** (A2-D5). The behaviour
   change is on a path nothing reads today, which is the argument for doing it now rather
   than after six consumers exist.
3. **`'refused'` in the status set.** A2 rules it out (A2-D6), taking the set to four values
   — the `tee.ts` vocabulary. This is a narrowing of §3.2 and reconciliation should record
   it either way.
4. **§12.5, is notional spend the right headline?** Unchanged and still Miftah's. A2 makes
   both numbers available and neither mandatory. **New input for that decision: until a human
   fills the fallback provider's price row, `notionalUsd()` is `null` and A4's headline must
   be a call count.**
5. **The three unlisted file edits** (`track.ts`, `flush.ts`, and the three onboarding
   routes) — see below. Each has a stated fallback if refused.
6. **Is `after()` callable from inside an `after()` callback in this Next version?** Unknown,
   and **the design is correct under both answers**: if it is, `recordCall`'s scheduled branch
   is used; if it is not, the awaited branch runs, provably off any request path. Measured
   in Task 5 and recorded in the notes rather than guessed at.
7. **A suspected pre-existing loss in `/api/memory/summary`.** Its `after()` calls `track()`,
   which may be outside the ALS context that registered it — V2's bug shape exactly. A2
   observes it and does not fix it (W5's file, §6). Cheap for reconciliation to assign.

---

## Roadmap defects and asks

Recorded here because this feeds reconciliation, and blunt because that is what it is for.

**Defect 1 — §0.1 says A2 depends on A1 for `events.ts`. It does not.** A-D18, in the same
document, dropped `llm.call_recorded`. A2 declares no event. The only real dependency is
migration ordering.

**Defect 2 — §6 assigns `src/lib/analytics/tee.ts` to A2 for "Ledger row beside the existing
outcome". It needs no edit.** `teeReading` is a pure function over an async iterable, with no
request scope, no database handle and no analytics import, and `ReadingOutcome` already
carries every field the row needs. The row is written in `/api/reading`'s existing `defer()`.
Putting a write inside `tee.ts` would break the property its header opens with.

**Defect 3 — the thesis's arithmetic needs one qualification.** There are nine `op` values and
nine call *expressions*, but only **eight files**: `translate.ts` holds both a `streamReading`
and a `complete()` site, and its `complete()` serves two ops. So "nine call sites" is true of
expressions and false of files, and `callClass.test.ts`'s two tables already encode that.

**Defect 4 — §3.2's status set contains a value with no producer.** `'refused'` describes a
call that never happened; see A2-D6.

**Defect 5 — §3.2 does not say what `local_date` is for a call inside a request whose route
has no analytics scope.** It says "for a call with no querent (a cron-driven repair pass) use
the UTC date" — but the real case is three onboarding routes with a real querent and no
scope. Task 12.

**Ask 1 — let A2 edit `src/lib/analytics/track.ts` and `flush.ts`** (`Store.calls`, the
`drain()` block, `flushCalls`). Unlisted in §6 and load-bearing: without it three of nine ops
lose their rows silently (A2-D2). **Fallback if refused:** `recordCall` awaits its insert
whenever it is called from inside `drain`, which puts a round trip inside `after()` — correct
but slower, and it needs a flag in the store anyway, which is the same edit. There is no
design that does not touch that file.

**Ask 2 — let A2 add one line to two `package.json` script entries** (Task 13).

**Ask 3 — let A2 wrap three W3 onboarding handlers in `withAnalytics`** (Task 12), or accept
unattributed Lotus rows with the query that names them.

**Seam, named for the record:** A3 groups by `op` and prices by `model`. Both value sets are
A2's, both are closed, and both are asserted by a test. A tenth `op` or a price keyed on
anything but the resolved model string is a reconciliation question.
