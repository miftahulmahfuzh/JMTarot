> **RECONCILED 2026-07-30 — `docs/plans/2026-07-30-RECONCILIATION-v0.5.0.md` OUTRANKS THIS
> PLAN AND THE ROADMAP. Read it before implementing a single task.** The six plans returned
> **51 defects in the roadmap they were reconciling**; nineteen were verified against running
> code and **four would have shipped**.
>
> **Rulings binding on A3:** R15 (**`IS DISTINCT FROM`, never `<>`**), R19 (400 days; Neon's 0.5 GB is the binding input), R20, R22 (**split the pure folds out of `queries/`**), R24 (unbuilt index, declared), R25 (two calendar systems stated), R26 (**`peakWindow5h` + measured burstiness k**), R29 (**do NOT filter `deleted_at`**).
>
> Where this plan disagrees with a ruling above, **this plan is wrong.** Its unamended text is
> kept deliberately — the reconciliation is an amendment, not a rewrite (the v0.4.0 precedent).

# A3 — Aggregation, trajectory, and the query layer

**Plan for v0.5.0 workstream A3.** Roadmap: `PUBLIC_RELEASE_ROADMAP_v0.5.0.md` §7 (A3),
with the binding decisions at A-D7, A-D8, A-D11, A-D17 and the schema at §3.2. Depends on
**A2** for the `llm_calls` table, the closed `op` set and `prices.ts`.

**What A3 is.** The read layer between a fact table and a chart: bucketing, aggregates over
an arbitrary range, per-user rollups, a forecast, a retention policy, and the queries an
operator runs by hand. **A3 renders nothing and owns no route.** It is the layer A4 and A5
call.

**What A3 is not.** Not a cap, not an alert, not a cache, not a materialized view. Every
number is computed on read from the ledger, because the ledger is small and a stale
aggregate is worse than a slow one on a surface with one reader.

**The one sentence to carry out of this document.** `LLM_WINDOW_CALL_CEILING=280` is calls
per **rolling five hours, fleet-wide**, and **no daily bucket in this plan may be compared
to it directly** — §6 is the whole of how the two are related honestly, and the honest
answer turns out not to be a forecast at all.

**Four SQL constructs in this document were executed against the local Postgres 16 before it
was committed**, following `analytics-queries.md`'s rule that an unexecuted query is a
liability: the five-hour window frame and its return type, the Monday week bucket against real
`local_date` rows, `pg_total_relation_size`, and `null is distinct from 0`. **One of them
failed and the plan is corrected** — see §1.1's A2.

---

## 1. Invariants

Numbered so a reviewer can cite one. Each carries its reason, because a rule without one
gets deleted by the next person who finds it inconvenient.

### 1.1 The driver boundary

**A1. `sql<T>` is an assertion the driver is not obliged to honour, and every aggregate in
this workstream is behind one.** Drizzle maps a column to a JS type when it *knows the
column*. Inside a raw `sql` template there is no mapper, and postgres.js returns whatever
the wire protocol gave it — which for `bigint`, `numeric` and `timestamptz` is a **string**.
V8's `answersUpdatedAt` typed its `max()` as `sql<Date | null>`, the compiler believed it,
`personaStaleness` compared a string to a `Date` with `>`, `ToPrimitive` coerced, and **every
answer edit was judged wrongly with a green typecheck and a green unit suite.** Only an
integration test calling `.getTime()` saw it. The same rule was already written one file over
on `readingsForDay`'s `hasBody`.

**So, mechanically, for A3:**

- `count(*)`, `count(*) filter (...)`, `count(*) over (...)` → **bigint → string.** Wrap in
  `Number()` at the boundary. `allTime.ts` already does this and says why: *"a string count
  compares with >= and then sorts wrong."*
- `sum(x)` over an `integer` column → **bigint → string.** Same treatment. `sum()` of NULLs
  is **NULL**, not 0, so `Number(null)` is `0` by accident and `Number(undefined)` is `NaN`
  — coalesce in SQL (`coalesce(sum(x), 0)`) *and* `Number()` in TS. Belt and brace, because
  the two failures look identical on screen and different in a chart.
- `percentile_cont(...)` → `double precision` → a real JS `number`. **Assert it anyway**;
  the cost of the assertion is one line and the cost of being wrong is a percentile that
  sorts lexically.
- `avg(x)` → **`numeric` → string.** Prefer summing and dividing in TypeScript so the
  division is visible; if you must `avg()`, `Number()` it.
- **Nothing temporal crosses the boundary as anything but a `'YYYY-MM-DD'` string.** See A2.

**A2. Every bucket key is a `'YYYY-MM-DD'` (or `'YYYY-MM'`) string produced by string
operations, never by `date_trunc`.** `date_trunc('week', local_date)` returns a
`timestamptz`, which inside a raw `sql` template comes back as a string like
`'2026-07-27 00:00:00+00'` — so the type you write is wrong, the value you get is a
timestamp in the *server's* rendering, and you have reintroduced the exact class of bug
`local_date` exists to prevent. `local_date` **is already a string**. Bucket it as one:

| bucket | expression | returns |
|---|---|---|
| day | `local_date::text` (or `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`) | `text` |
| week | `to_char(local_date - ((extract(dow from local_date)::int + 6) % 7), 'YYYY-MM-DD')` | `text`, the Monday |
| month | `substring(local_date::text, 1, 7)` | `text`, `'YYYY-MM'` |

**`::text` IS REQUIRED AND ITS ABSENCE IS A HARD ERROR, NOT A SILENT ONE — and the reason is
worth knowing.** `dateCol` is `date(name, { mode: 'string' })`: **`mode: 'string'` is a
Drizzle-side mapping and the Postgres column is still `date`.** So `substring(local_date, 1,
7)` fails with *`function substring(date, integer, integer) does not exist`*. Measured against
the local database 2026-07-29, and the first draft of this plan had it wrong. It fails loudly,
which makes it the friendliest member of this family of bugs — every other one in §1.1 is
silent.

**Week starts Monday** (ISO), and `(dow + 6) % 7` is what turns Postgres's Sunday-is-0 into
Monday-is-0; the naive `extract(dow)` puts Sunday in the previous week and nobody notices for
a month. **Verified on real rows:** `2026-07-21` and `2026-07-22` (Tue, Wed) both bucket to
`2026-07-20`; `2026-07-28` buckets to `2026-07-27`.

**A3. Every aggregate ships with an integration test that asserts the RUNTIME TYPE of every
returned field, not only its value.** `expect(typeof row.calls).toBe('number')`,
`expect(typeof row.bucket).toBe('string')`, and for anything that claims to be a date,
`expect(row.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/)`. A unit test cannot see this class of
bug because a unit test constructs the value it then asserts on. This is not optional and it
is roadmap §10.1's word `**required**`.

### 1.2 The querent's day, and the one counter that is not it

**A4. `local_date` is the querent's calendar day, is a `string`, and is compared as stored.**
Never `created_at::date`, never `created_at at time zone <anything>` for a per-querent
bucket. A Jakarta reading between midnight and 07:00 lands on the previous UTC day, so a
`created_at::date` bucket is wrong for a third of every day for the app's primary audience.

**A5. `llm_calls.local_date` is NOT homogeneous across the fleet, and a fleet-wide
`group by local_date` therefore sums two calendar systems.** §3.2 says a call with no
querent behind it (a cron-driven repair pass) stores the **UTC** date. That is the right
choice — there is no querent whose calendar it could be — but it means the fleet-wide
`local_date` series is *mostly* querent-days with a UTC-day minority mixed in. **State it in
the function's doc comment and on the chart, and never use this series for the ceiling.**
Where the number must be homogeneous, filter `user_id is not null`.

**A6. The ceiling series is bucketed by `created_at` in UTC, and that is the deliberate
exception to A4.** `meter.ts` says it in capitals: *"There is no date in the key… A provider
quota is not a property of anybody's calendar."* `llm:window` is fleet-wide wall-clock. A
provider quota is not the querent's Tuesday, so bucketing it by the querent's Tuesday would
answer a question nobody asked. **Two series, two bucket keys, both shipped, each named for
its bucket** — `callsByUtcDay` and `callsByLocalDate` — so the ambiguity cannot survive a
call site.

### 1.3 The ledger's honesty

**A7. The ledger is a LOWER BOUND on the Redis counter, always.** Three reasons, and none of
them is fixable in A3:

1. The ledger write is inside `after()` / `defer()` (A-D6), and `after()` is not a
   guarantee — query 1 of `analytics-queries.md` exists because Vercel can end an
   invocation.
2. `reserveModelCall` charges the window **before** the call. A call that then throws still
   charged the counter; whether it writes a row is A2's business.
3. A refusal charges nothing. `memoryBackend.consume` returns `{ok:false}` *before* pushing
   the timestamp, so a hard-ceiling refusal never increments — which means **rows recording
   a refusal must be excluded from any counter reconstruction**, or you double-count the
   thing that was declined.

So: the reconstruction predicate is `status <> 'refused'`, and **every headroom figure this
plan produces is optimistic.** Label it. The same word `analytics-queries.md` query 9
already uses — *"it is a lower bound"* — is the right one and is deliberately reused.

**A8. A3 groups by `op` and never invents a tenth value or an alias** (roadmap §11 seam 3).
Nine, closed, from A2. Folding nine to `4 + Other` for a chart is a **pure** function
(`foldOps`) with a **fixed order**, because A-D11 says colour follows the entity and not its
rank: filtering to two ops must not repaint the survivors.

**A9. Tokens are returned per `(bucket, model)` and NEVER pre-summed across models.** A-D7
prices at read time from a table keyed by model **and** `effective_from`. A single
`sum(output_tokens)` for a day that spanned two models is unpriceable, and the number that
would be produced anyway is the one that silently understates the bill. This is a real
constraint on the return shape and the roadmap does not state it.

**A10. Every cost figure is returned with its unpriced-call COUNT beside it, in the same
object.** A-D7: *"the dashboard renders the unpriced call count beside every cost figure, so
a cost is never quoted over an incomplete denominator."* Making them two fields of one
returned record is what stops a caller rendering one without the other. An unknown model
prices `null`, never `0`.

### 1.4 The forecast

**A11. A point estimate is never returned without its band and its `n`.** The return type is
a discriminated union in which no variant carries `point` without `lower`, `upper` and `n`.
That is the enforcement — a caller cannot destructure a bare number, because there is no
variant that has one. A-D8, and the same move `ReadingView`'s rule 4 makes: *the component's
invariant, not the caller's discipline.*

**A12. Below `MIN_FORECAST_DAYS` there is no forecast at all**, and the returned value says
how many more days are needed. V5's M14 precedent verbatim: *a deck rendering two panels
with the second one blank IS the empty state the roadmap forbids.* A forecast rendered with a
band so wide it spans zero to infinity is the same thing wearing a band.

**A13. `forecast.ts` never throws.** `tally.ts`'s rule: *a heuristic may fail a build; it may
not fail a person.* Every entry point validates its input and returns
`{ kind: 'insufficient' }` on anything non-finite, empty, one-point, or degenerate. There is
no code path from a bad series to a 500 on `/admin`.

**A14. `forecast.ts` is PURE: no `server-only`, no `process.env`, no `@/lib/db/**`, no
imports outside `@/lib/analytics/series`.** `swipeDeck.ts`'s precedent — *the whole policy in
a pure module is the part `npm test` can reach.* The ceiling number (280) is **passed in**,
never read from the environment here, because a pure function that reads `process.env` is not
testable at two ceilings and somebody will need to be.

### 1.5 The route contract A3 hands to A4

**A15. Every admin query runs inside a `READ ONLY` transaction with an explicit
`statement_timeout`.** Two invariants for the price of one transaction block:

- **Read-only makes §9.2 mechanical.** *"No admin write to querent data"* is currently a
  promise; `set transaction read only` makes a stray `delete` in a dashboard query fail at
  the database rather than at review.
- **The timeout is the server half of §4.2's pairing.** A bigger `maxDuration` without a
  bound only makes the hang longer.

**A16. The three numbers are ordered `statement_timeout < maxDuration < client abort`, and
the ordering is the point.** `statement_timeout = 10_000`, `maxDuration = 30`, client
`AbortSignal.timeout(15_000)`. The statement dies first so the response is a *stated failure
state* rather than a platform 504; the client bound sits above it so the server's own error
message wins the race and the operator learns which query was slow. Getting this backwards
gives a blank page and no diagnosis. **A3 states these numbers; A4 wires them.**

**A17. Every admin request is a COLD request.** There is one admin and no warm instance, so
the first query of a session also wakes a suspended Neon compute. `POST /api/locale` is the
precedent — 22ms warm, killed at ten seconds cold — and it is roadmap §4.2's *"single most
likely live failure in v0.5.0."* The measurement is loop 6, not WSL.

### 1.6 Retention

**A18. `admin_access_log` is NEVER swept, and A3 ships a test asserting its absence from the
sweep.** §9.14: an audit trail with a delete path is the audit trail's absence. A retention
policy is a delete path with a timer on it. The negative-control test is named for the
outcome, not the mechanism.

**A19. `readings` stays off every retention clock**, unchanged. Every memory feature reads
it and the privacy policy says so in those words. A3 adds one delete and does not touch the
other four.

---

## 2. File map

```
NEW  src/lib/analytics/series.ts                  PURE. Bucket keys, day enumeration,
                                                  zero-fill. No imports at all.
NEW  src/lib/analytics/series.test.ts
NEW  src/lib/analytics/forecast.ts                PURE. OLS, prediction band, min-n,
                                                  ceiling crossing. Imports series.ts only.
NEW  src/lib/analytics/forecast.test.ts
NEW  src/lib/analytics/rollup.ts                  PURE. The folds: totals, period deltas,
                                                  foldOps, the pricing fold, burstiness k.
NEW  src/lib/analytics/rollup.test.ts

NEW  src/lib/db/queries/admin/timeout.ts          withAdminRead(db, fn) -- handle first.
NEW  src/lib/db/queries/admin/metrics.ts          Fleet series and aggregates. Handle first.
NEW  src/lib/db/queries/admin/users.ts            Per-user aggregates. Handle first.
NEW  src/lib/db/queries/admin/rollup.ts           The composite one-range query. Handle first.
NEW  src/lib/db/queries/admin/metrics.integration.test.ts
NEW  src/lib/db/queries/admin/users.integration.test.ts
NEW  src/lib/db/queries/admin/rollup.integration.test.ts
NEW  src/lib/db/queries/admin/sweep.retention.integration.test.ts

EDIT src/app/api/cron/sweep/route.ts              A fifth delete + a size probe. §7.
EDIT docs/analytics-queries.md                    Queries 13-18. §8.
```

### 2.1 Two placement rulings, both forced by rules already in the repo

**`rollup.ts` exists TWICE, and that is not duplication.** Roadmap §7 assigns
`src/lib/db/queries/admin/{metrics,users,rollup}.ts` to A3. But
`queries/contract.test.ts` asserts *"takes the handle as the first parameter of every
exported function"* over every file matching `/queries/` — which includes
`queries/admin/**` with no test change, and which a **pure fold cannot satisfy, because it
has no handle to take.** This is the same wall three workstreams have hit and it has the
same resolution, stated verbatim in `history/dates.ts`: *"Same wall W3 hit with the Lotus
cache and W5 with `windowBounds`; same resolution."*

So:

- `src/lib/db/queries/admin/rollup.ts` — **the composite query**: one range in, every fleet
  metric out, in as few round trips as a cold lambda can afford. Handle first.
- `src/lib/analytics/rollup.ts` — **the pure folds** over what that query returned. No
  handle, no database, unit-tested.

**`series.ts` is a new pure module and not part of `forecast.ts`,** because `queries/admin/
metrics.ts` needs the zero-fill too and a query module importing `forecast.ts` would make
the forecast a dependency of the data layer. Two pure leaves is cheaper than one
bidirectional edge.

---

## 3. The metric catalogue

Every entry: what it means, the SQL shape, the bucket, the index it relies on, and the
integration test that proves it. **`from`/`to` are `'YYYY-MM-DD'` strings throughout, `to`
inclusive**, validated by `isHistoryDate`-shaped checks — never by `parseLocalDate`, whose
±1-day bound answers *"is this plausibly today"* and would 400 every interesting range. That
trap is already written down on `/api/history`.

Every function's first parameter is `db: DbOrTx`. Every one is called through
`withAdminRead`.

### M1 — `callsByUtcDay` · the ceiling series

**Fleet model calls per UTC day.** The input to §6's trajectory and the ONE series that may
be related to 280. Bucketed by `created_at` in UTC (A6), not `local_date`.

```sql
select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as bucket,
       count(*)                                             as calls,
       count(*) filter (where streamed)                      as streamed_calls
  from llm_calls
 where created_at >= $1::date
   and created_at <  ($2::date + 1)
   and status <> 'refused'                    -- A7.3: a refusal charged nothing
 group by 1
 order by 1;
```

- **Bucket:** UTC day, `text`.
- **Index:** `llm_calls_created_idx` on `(created_at desc)` — a range scan.
- **Types:** `calls`, `streamed_calls` are bigint → `Number()`. `bucket` is `text`.
- **Zero-filled in TypeScript** by `zeroFill(rows, enumerateDays(from, to))`, not by a SQL
  `generate_series` — a `generate_series` of dates hands back `timestamptz`, straight into
  A2's trap, and the zero-fill is the one part of this that a unit test can own.
- **Test:** three calls on two UTC days plus a gap day; asserts three buckets, the middle
  one `calls: 0`, `typeof calls === 'number'`, and that a row with `status: 'refused'` is
  absent from the count.

### M2 — `callsByLocalDate` · the querent's day

Same shape, `group by local_date`, for narratives about *people* rather than about quota.
**Carries A5's warning in its doc comment**, and takes an `onlyWithUser: boolean` so the
homogeneous version is one argument away.

- **Index:** `llm_calls_local_date_idx` on `(local_date)`.
- **Test:** two users, one at UTC+7 and one at UTC-5, whose calls share a `created_at`
  instant and differ in `local_date`. **M1 puts them in one bucket and M2 puts them in two,
  and that pair of assertions in one test is the whole point.** (Roadmap §7's phrasing —
  *"a range spanning a DST-free but timezone-shifted day"* — does not describe a real
  scenario; this is the test it was reaching for.)

### M3 — `tokensByBucketAndModel` · the priceable shape

**The only token series, and it is per model** (A9).

```sql
select <bucket-expr>                                       as bucket,
       model,
       count(*)                                            as calls,
       coalesce(sum(input_tokens),  0)                      as input_tokens,
       coalesce(sum(output_tokens), 0)                      as output_tokens,
       count(*) filter (where input_tokens  is null)        as null_input_calls,
       count(*) filter (where output_tokens is null)        as null_output_calls
  from llm_calls
 where created_at >= $1::date and created_at < ($2::date + 1)
 group by 1, 2
 order by 1, 2;
```

- `null_input_calls` is **not** cosmetic: z.ai returns `input_tokens: 0`, stored NULL, so on
  `LLM_PROVIDER=zai` this column is ~every row and **`input_tokens` is structurally
  half-blind.** `analytics-queries.md` already opens with that fact; a token chart that does
  not carry the null count invites the reader to conclude the app has no prompt cost.
- **Types:** every `sum` is bigint → string. `coalesce(...,0)` *and* `Number()`.
- **Index:** `llm_calls_created_idx`.
- **Test:** two models in one day, one row with NULL `input_tokens`; asserts the two rows do
  not collapse, `input_tokens` is a `number` and not a string, and `null_input_calls` is 1
  while `input_tokens` is the sum of the non-null rows only (**not** 0).

### M4 — `callsByOp` · cost by purpose

`group by op` over the range, with total-latency percentiles.

```sql
select op,
       count(*)                                                        as calls,
       coalesce(sum(input_tokens), 0)                                   as input_tokens,
       coalesce(sum(output_tokens), 0)                                  as output_tokens,
       count(*) filter (where status = 'failed')                        as failed,
       count(*) filter (where status = 'aborted')                       as aborted,
       percentile_cont(0.5)  within group (order by total_ms)            as p50_ms,
       percentile_cont(0.95) within group (order by total_ms)            as p95_ms
  from llm_calls
 where created_at >= $1::date and created_at < ($2::date + 1)
 group by 1
 order by calls desc, op;
```

- **`op` ordering is `calls desc, op`** — the `op` tiebreak makes the order TOTAL, the same
  reason `topCardAllTime` adds `readingCards.cardId`. Without it, two ops with equal counts
  swap places between page loads and it reads as data changing.
- **Index:** `llm_calls_op_created_idx` on `(op, created_at desc)` — nine range scans, or a
  single scan plus a hash aggregate; either is fine and the plan is recorded in the test.
- **Types:** counts and sums are strings; `percentile_cont` is `double precision` → a real
  `number`, **asserted anyway** (A1).
- **`p95_ms` IS TOTAL TIME, NOT TTFT.** See M8; the field is named `p95_ms` on a column
  named `total_ms` and the doc comment says the word "total" twice.
- **Test:** nine ops seeded, asserts nine rows, no tenth key ever appears (A8), and that
  `percentile_cont` over a single row returns that row's value as a `number`.

### M5 — `peakWindow5h` · the fuel gauge, and the headline number

**The maximum number of model calls in any rolling five-hour window in the range.** This is
the only figure in the project directly comparable to `LLM_WINDOW_CALL_CEILING`, and §6
argues it should lead the tokens page rather than the forecast.

```sql
with w as (
  select created_at,
         count(*) over (order by created_at
                        range between interval '5 hours' preceding and current row) as in_window
    from llm_calls
   where created_at >= $1::date
     and created_at <  ($2::date + 1)
     and status <> 'refused'
)
select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSOF') as window_end,
       in_window
  from w
 order by in_window desc, created_at
 limit 1;
```

- **A window frame, not a bucket, and that is the design.** A five-hour window straddles
  midnight; any bucketing at all would hide the worst window in the range by splitting it.
- **`RANGE BETWEEN INTERVAL … PRECEDING`** over a `timestamptz` `ORDER BY` is plain
  Postgres 11+, so it works on both the Docker 16 and Neon 16 — the two are the same major
  **on purpose**.
- **`window_end` is returned as a `text` timestamp** (A2). A `timestamptz` here would come
  back as a driver-rendered string anyway; formatting it in SQL makes the type honest and
  the value stable.
- **Index:** `llm_calls_created_idx` — the window function needs the rows in `created_at`
  order and the index provides it, so no sort.
- **Types:** `in_window` is a windowed `count(*)` → bigint → string → `Number()`. **This is
  the single most likely place in A3 for the `sql<T>` trap to land**, because the value is
  then compared with `>=` against 280: a string `'300' >= 280` is `true` by coercion and
  `'30' >= 280` is `false` — so it would be *right most of the time*, which is worse.
  **Measured, not assumed:** `pg_typeof(count(*) over (…range between interval '5 hours'
  preceding…))` against the local database on 2026-07-29 returns **`bigint`**. Both the frame
  syntax and the type were executed before this plan was committed.
- **Test:** six calls inside one four-hour span and three more nine hours later; asserts
  `peak === 6`, `typeof peak === 'number'`, and — the negative control — that moving one
  call to six hours after the first drops the peak to 5. Plus an empty range returning
  `null` rather than `0`, because "no calls" and "no data" are different answers.

### M6 — `readingsByLocalDate` · readings and actives

From `readings`, not the ledger: a blocked reading makes no model call and still happened.

```sql
select local_date::text                                  as bucket,
       count(*)                                         as readings,
       count(distinct user_id)                           as users,
       count(*) filter (where status = 'ok')             as ok,
       count(*) filter (where status = 'partial')        as partial,
       count(*) filter (where status = 'failed')         as failed,
       count(*) filter (where status = 'aborted')        as aborted,
       count(*) filter (where status = 'blocked')        as blocked
  from readings
 where local_date >= $1 and local_date <= $2
 group by 1 order by 1;
```

- **Bucket:** the querent's day (A4), compared as a string against `date` columns —
  Postgres coerces the literal and the comparison is exact for zero-padded ISO.
- **Index: NONE, and that is a measured decision.** `readings_user_local_date_idx` is
  `(user_id, local_date)`, so a fleet-wide range on `local_date` cannot use it — the leading
  column is not in the predicate. **A3 must not add an index**: `schema.ts` has one owner and
  §6 assigns it to A1 for this release. The honest answer is that `readings` is small (a
  seq scan on a table with hundreds of rows is one page) and the plan is recorded in the
  test with `set local enable_seqscan = off` to prove the *shape* — V8's technique, and its
  lesson: *"An assertion that fails for a reason that is not a defect is an assertion people
  delete."* A candidate `readings_local_date_idx` is declared in §9 as a schema delta for
  reconciliation, unbuilt, with the trigger for building it stated.
- **A soft-deleted user's readings are INCLUDED**, unlabelled here and labelled by A5.
  `allTime.ts`'s ruling: the account is restorable for `ERASURE_GRACE_DAYS`, so filtering
  would make this page disagree with every other query in the app during the grace window.
- **Test:** five statuses on one day; asserts the five filters partition the total, and that
  `users` is a distinct count and not a row count.

### M7 — `activeUsers` · a distinct count over a range, never a sum

```sql
select count(distinct user_id) as users
  from readings
 where local_date >= $1 and local_date <= $2;
```

**Its own function precisely so nobody sums M6's `users` column.** WAU is not
`sum(DAU)`; a user who reads every day would be counted seven times. The failure produces a
number that is plausible, monotone and wrong, which is the kind that survives review.

- **Test:** one user reading on three days; asserts `1`, while M6 returns three rows each
  saying `users: 1`. **Both assertions in one test**, because the test's subject is the
  difference.

### M8 — `latencyPercentiles` · two metrics that must never merge

**`readings.latency_ms` is TIME TO FIRST TOKEN. `llm_calls.total_ms` is TOTAL TIME.** One
word, two meanings, one schema (roadmap §11 seam 2). A3 exposes them as **two functions with
two names**, and neither is called `latency`:

- `ttftByService(db, from, to)` — `percentile_cont` over `readings.latency_ms`, grouped by
  `service_id`, `where latency_ms is not null`. This is query 3 of
  `analytics-queries.md`, promoted to code.
- `totalMsByOp(db, from, to)` — the `p50_ms`/`p95_ms` already in M4.

**A single chart may not plot both**, and not only for the A-D11 dual-axis reason: they
share a unit and would look combinable. They measure different intervals of different
events.

- **Test:** the same reading contributing a TTFT of 400 and a total of 9000; asserts the two
  functions return 400 and 9000 respectively and that neither returns the other.

### M9 — `tokenLedgerDrift` · the A-D17 consistency check, which must return 0 rows

A-D17 keeps `readings.token_input`/`token_output` **and** writes an `llm_calls` row for the
same call. Two copies of one fact is how they drift, so the check lives beside the schema
with a stated expected answer — the `onboarding_answers` encryption-audit precedent.

```sql
select r.id                as reading_id,
       r.token_input,  c.input_tokens,
       r.token_output, c.output_tokens
  from readings r
  join llm_calls c on c.reading_id = r.id and c.op = 'reading'
 where r.token_input  is distinct from c.input_tokens
    or r.token_output is distinct from c.output_tokens;
```

**`IS DISTINCT FROM`, never `<>`, and this is the trap in the check itself.** Both columns
are nullable and z.ai makes NULLs the common case. `where r.token_input <> c.input_tokens`
is NULL-blind: it evaluates to NULL for every row where either side is NULL, NULL is not
true, the row is filtered out, and **the query returns 0 rows whether or not the ledger
agrees with anything.** A check that cannot fail is indistinguishable from a check that
passes, and the roadmap says only *"must return 0 rows."*

- **It lives in `metrics.ts` as a function AND in `analytics-queries.md` as SQL**, because
  the document's own opening rule is that *"a query in a document that has never been run is
  a liability rather than documentation"* — and the only way to keep a documented query
  honest across a release is to have the integration test run the same statement.
- **Test:** three cases. Agreement (0 rows); a real disagreement `5 vs 7` (1 row); and
  **`NULL vs 0`, which MUST be reported** — that is roadmap §12.6's open question
  (`anthropic.ts` not applying `nonZero()` on the buffered path) arriving as data. See §9.
- **Index:** `llm_calls_reading_idx`, which §3.2 requires for the FK anyway.

### M10 — `modelsSeen` · the unpriced denominator

```sql
select model, count(*) as calls, min(created_at)::text as first_seen
  from llm_calls
 where created_at >= $1::date and created_at < ($2::date + 1)
 group by 1 order by calls desc, model;
```

Returns models, not prices. **A3 does not import `prices.ts` into SQL**; the pricing fold is
pure (`priceRollup` in `src/lib/analytics/rollup.ts`) and takes A2's `priceFor` as an
argument, so the fold is testable at a price table the test invents. `min(created_at)::text`
because a bare `min()` on a timestamp inside a raw template is A2's trap again.

- **Test:** two models, one absent from a stub price table; asserts the fold returns
  `unpricedCalls > 0` and `costUsd` for the priced part only, and that a `null` price never
  becomes `0`.

### M11 — `userTotals` · one person, one range

```sql
select count(*)                                    as calls,
       coalesce(sum(input_tokens), 0)               as input_tokens,
       coalesce(sum(output_tokens), 0)              as output_tokens,
       min(local_date)::text                        as first_local_date,
       max(local_date)::text                        as last_local_date
  from llm_calls
 where user_id = $1 and created_at >= $2::date and created_at < ($3::date + 1);
```

- **`min`/`max` on `local_date` return `text`** — the column is `date` with
  `mode: 'string'`, but inside a raw aggregate there is no mapper, so it is a string either
  way and the type must say `string`. `topCardAllTime`'s `lastSeen: sql<string>` is the
  precedent and it is already correct.
- **Guard the uuid.** `queries/share.ts`'s and `allTime.ts`'s rule: postgres raises `22P02`
  on a malformed uuid literal, so a bad id must return zeroes rather than throw. The same
  `UUID_RE` check, and A3 copies it rather than importing across modules — five lines against
  a new coupling between two query files.
- **Index:** `llm_calls_user_created_idx` on `(user_id, created_at desc)`.
- **Test:** two users; asserts one user's totals exclude the other's, a malformed uuid
  returns zeroes without throwing, and `first_local_date` is a `'YYYY-MM-DD'` **string**.

### M12 — `userCostLeague` · the table, per (user, model)

Roadmap §5.3 renders this as a **table with an inline bar**, not a chart, because >7 classes
is a table. Per `(user_id, model)` for A9's reason.

```sql
select user_id, model,
       count(*)                                    as calls,
       coalesce(sum(output_tokens), 0)              as output_tokens,
       coalesce(sum(input_tokens),  0)              as input_tokens
  from llm_calls
 where created_at >= $1::date and created_at < ($2::date + 1)
 group by 1, 2
 order by output_tokens desc, user_id, model
 limit $3;
```

- **`user_id` may be NULL** (`on delete set null`), and those rows are **kept and labelled
  `'(deleted or system)'` by the caller**, never dropped: the tokens were spent. A hard
  delete moves a user's history from an attributed row to an unattributed one, so
  **cost-per-user denominators shift over time** — say so on the page, because a
  monotonically-falling "cost per user" with no explanation is a metric that gets trusted.
- **`limit` is a parameter with a hard cap of 200 applied in TS**, so a caller cannot ask
  for the whole fleet through a query shaped for a top-N.
- **Test:** three users; asserts the order, the cap, and that a NULL-`user_id` group appears
  as its own row rather than collapsing into another user's.

### M13 — `userCallsByLocalDate` · the per-user sparkline

M2 with a `user_id` predicate. Served by `llm_calls_user_created_idx`'s **leading column**
plus a filter on `local_date` — **there is no `(user_id, local_date)` index on `llm_calls`
and A3 does not add one.** Recorded because it is the obvious thing to reach for after
reading `reading_cards_user_date_card_idx`; the difference is that this query is one user's
page load, not a per-request feature. Measured plan goes in the function's header.

---

## 4. `series.ts` — the pure bucket layer

No imports. Every function total, every function timezone-free because a bare
`'YYYY-MM-DD'` has no timezone to be wrong about.

```ts
export function enumerateDays(from: string, to: string): string[];
export function weekStart(day: string): string;          // ISO Monday
export function monthOf(day: string): string;            // 'YYYY-MM'
export function zeroFill<T>(rows: T[], days: string[], key: (r: T) => string,
                            empty: (day: string) => T): T[];
export function dayCount(from: string, to: string): number;
```

**`enumerateDays` does UTC arithmetic on a bare calendar string and formats back with
`toISOString().slice(0, 10)`.** `new Date('2026-07-29T00:00:00Z')` plus `86_400_000` per
step, which is exact because UTC has no DST — and it must be `T00:00:00Z` and not
`new Date('2026-07-29')`, whose parsing is implementation-defined for the date-only form in
older engines and locale-dependent in some. `localdate.ts` already uses the explicit form
for the same reason and says so.

**Bounds:** a range longer than `MAX_RANGE_DAYS = 400` returns `[]` and the caller refuses.
400 is `HISTORY_DAY_LIMIT`'s number, reused deliberately — a second arbitrary limit is a
second thing to explain, and the honest note is `dates.ts`'s: *"ARBITRARY, AND KNOWN TO
BE."*

**Zero-fill is here and not in SQL** for A2's reason: `generate_series` over dates returns
timestamps. It also makes the gap the unit test's subject, and a gap is what a forecast is
most sensitive to — a missing day silently becomes a missing *observation* rather than a
zero, which tilts every slope upward.

**Tests:** a single-day range returns one day; a reversed range returns `[]`; a leap day
(`2024-02-28` → `2024-03-01` is three days); a month boundary; a year boundary; 400 days
returns 400 and 401 returns `[]`; `weekStart` on all seven days of one week returns the same
Monday, and on a Sunday returns the **previous** Monday (the `(dow + 6) % 7` case that the
naive version gets wrong).

---

## 5. `forecast.ts` — the maths, written out

### 5.1 The model, and what it assumes

**Ordinary least squares on a gapless, zero-filled daily series.** No ARIMA, no Prophet, no
seasonal decomposition, no dependency (A-D8, §9.7).

Given points `(x_i, y_i)` for `i = 1…n`, where `x_i` is the day index from the start of the
range and `y_i` is that day's total:

```
x̄  = Σx/n                     ȳ  = Σy/n
Sxx = Σ(x_i − x̄)²             Sxy = Σ(x_i − x̄)(y_i − ȳ)
b   = Sxy / Sxx               a   = ȳ − b·x̄
ŷ(x) = a + b·x
e_i = y_i − ŷ(x_i)            s² = Σe_i² / (n − 2)
R²  = 1 − Σe_i² / Σ(y_i − ȳ)²
```

**The prediction interval at a future `x₀`** — an interval for a *new observation*, which is
the question the operator is asking, not a confidence interval for the mean:

```
se(x₀) = s · sqrt( 1 + 1/n + (x₀ − x̄)² / Sxx )
band   = ŷ(x₀) ± t(0.975, n−2) · se(x₀)
```

**The `1 +` under the root is the whole difference between the two intervals** and it is the
term that makes the band honest: a confidence band would be roughly `s/√n` wide and would
look impressively tight on nine noisy days. The `(x₀ − x̄)²/Sxx` term is what makes the band
flare as you extrapolate, which is the visual the operator needs.

**`t(0.975, df)` is a committed lookup table, not a library.** `T95[df]` for `df = 1…30`,
`1.96` above 30. Using a flat `2.0` — the reflex — understates the band at `n = 14`
(`df = 12`, `t = 2.179`) by **8%**, and a band that is 8% too tight at the exact `n` where
the forecast first appears is a band that first appears wrong. A table of thirty floats is
not a dependency.

**Both bounds are clamped at 0**, because every series here is a count and a negative
forecast is not a wide band, it is a wrong one.

### 5.2 The minimum n, and what it is protecting against

```ts
export const MIN_FORECAST_DAYS = 14;
```

**14, for three reasons, in order of weight:**

1. **Weekly rhythm is real and unmodelled.** A tarot app is used differently on a Sunday
   evening than on a Tuesday morning. OLS with no seasonal term absorbs that into the
   residuals — which is *fine*, and is exactly why the band exists — but only if the series
   contains whole weeks. Seven points fit a line through one instance of the weekly shape
   and mistake it for a trend. Fourteen is two.
2. **`s²` divides by `n − 2`.** At `n = 3` one point moves the band by a factor of two.
3. **A-D8's own words:** *"Seven data points do not support a seasonal model and pretending
   otherwise is the failure mode."* The same sentence argues against seven points supporting
   a *trend*.

**14 is a judgement and is labelled as one.** It is not derived from this app's data, because
this app has no data. The instrument that would revise it is §7's nightly size probe plus a
month of real traffic; the constant carries that note, the way `PERSONA_MIN_AGE_SECONDS`
carries *"IS A GUESS."*

### 5.3 The return type — A11 as a type, not a convention

```ts
export type Forecast =
  | { kind: 'insufficient'; have: number; need: number; moreDaysNeeded: number }
  | { kind: 'flat';  n: number; mean: number }
  | { kind: 'trend';
      n: number;
      slopePerDay: number;
      intercept: number;
      r2: number;
      /** Never a bare number: point, lower and upper are one object. */
      at: (dayIndex: number) => { point: number; lower: number; upper: number };
      horizon: { dayIndex: number; day: string; point: number; lower: number; upper: number }[];
    };
```

**There is no variant carrying `point` without `lower` and `upper`.** A caller that wants to
render a number alone has to construct one, which is a visible act in a diff. That is the
enforcement A11 asks for and it is the same shape `ReadingView`'s rule 4 uses: the
invariant belongs to the producer.

**`r2` is REPORTED and is NEVER A GATE.** A straight line through pure noise has a huge band,
and the band is already the mechanism that stops it lying. Adding an R² threshold would
invent a second number nobody chose and would produce the empty state on data that is
genuinely flat — which `kind: 'flat'` already handles honestly.

### 5.4 Degeneracy, and A13

Every one of these returns, none throws:

| input | result | why |
|---|---|---|
| `[]`, or fewer than 14 points | `insufficient` | A12 |
| any non-finite `y` | `insufficient` | a `NaN` in one point poisons every sum silently |
| all `y` identical | `flat` | slope is 0 and `s` is 0; a band of width zero is true, and `flat` says it without pretending to a trend |
| `Sxx === 0` | `insufficient` | cannot happen with distinct day indices; guarded because "cannot happen" is how a division by zero ships |
| `Σ(y−ȳ)² === 0` in the R² denominator | `flat` before the division | same |
| all zeros | `flat` with `mean: 0` | the honest reading of "nothing happened" |
| a single spike in an otherwise flat series | `trend` with a wide band and low `r2` | **the band is the answer**; suppressing it would be the heuristic failing a person |

**Unit tests, each named for its row.** Plus: a perfectly linear series recovers its slope to
within `1e-9`; adding a constant to every `y` moves `intercept` and not `slopePerDay`;
reversing the input order does not change the fit (the maths is order-free and a caller
should not have to know).

---

## 6. The trajectory to the ceiling — how a daily series is related to a rolling 5-hour limit without lying

**This is the section the workstream exists for, and the honest answer is not the one the
roadmap's thesis assumes.**

### 6.1 Three ways to lie, all of them tempting

`LLM_WINDOW_CALL_CEILING=280` is **model calls per rolling five hours, fleet-wide**, from
`meter.ts`: the provider meters *prompts per rolling 5-hour cycle*, there is deliberately no
date in the Redis key, and the window slides.

1. **Compare calls/day to 280.** Wrong by a factor of 4.8 in the alarmist direction: 280 per
   5h is **1344 calls/day** if traffic were perfectly flat, so a day with 300 calls reads as
   "at the ceiling" while sitting at 22% of it. An operator who trusts this once and finds it
   false stops trusting the page.
2. **Compare calls/day ÷ 4.8 to 280.** This assumes traffic is *uniform*, which is the one
   thing it certainly is not — a consumer app has an evening. Wrong in the **dangerous**
   direction: the real 5-hour peak crosses 280 while this figure still reads comfortable.
3. **Report a crossing date without the burstiness factor.** The factor is the number that
   moves first and moves most, and a date computed from a hidden assumption is a date nobody
   can audit.

### 6.2 What A3 does instead

**Step 1 — the primary metric is not a forecast.** `peakWindow5h` (M5) is **directly
comparable to 280** and needs no assumption at all: it is the same quantity the Redis
counter holds, reconstructed from the ledger over any range. `max(rolling 5h count) / 280`
over the last 7 days is the fuel gauge, it is the number the tokens page should lead with,
and roadmap §5.3's **meter** is its form.

**Step 2 — measure the burstiness, do not assume it.**

```
k = peakWindow5h(range) / ( meanCallsPerDay(range) × 5/24 )
```

`k` is the observed ratio of the worst five hours to what five *average* hours would hold.
`k ≥ 1` by construction. `k = 1` is perfectly flat traffic; `k = 4.8` means the entire day's
calls land inside one five-hour window. It is computed by a **pure** function
(`burstiness()` in `src/lib/analytics/rollup.ts`) from two numbers M1 and M5 already return,
so it is unit-testable at every value.

**Step 3 — convert the ceiling into the daily series' own units.**

```
dailyEquivalentCeiling = 280 × (24/5) ÷ k  =  1344 / k
```

At `k = 1` the daily series may reach 1344 before the window ceiling binds. At `k = 3` it
binds at 448. **The conversion is one division and the whole honesty of the answer is in the
denominator.**

**Step 4 — forecast the daily series and cross it against that converted target.**
`forecast.ts` returns `crossing(target)`:

- `slopePerDay <= 0` → `{ kind: 'not-approaching' }`. No date, no arrow. A declining series
  has no crossing and inventing one from noise is the lie.
- Otherwise, **walk forward day by day up to `MAX_HORIZON_DAYS = 365`** and return the first
  day on which the **upper** bound reaches the target (`earliest`) and the first on which the
  **point** estimate does (`central`). The upper bound is not linear in `x₀` — the
  `(x₀ − x̄)²/Sxx` term is quadratic under a square root — so there is no closed form, and a
  365-step loop is cheaper than being clever.
- Beyond the horizon → `{ kind: 'beyond-horizon', days: 365 }`. Never a date in 2031.
- **The answer is a RANGE of dates, never one date**, and it is rendered with `n`, `k` and
  `r2` beside it or it is not rendered.

### 6.3 The four caveats that ship on the page, not in this file

Every one of these makes the projection **optimistic**, which is the direction that matters:

1. **`k` is assumed stationary and is the first thing to change.** One abusive script shifts
   `k` with no visible change in the daily series at all — so the ceiling arrives early and
   the trajectory chart looks unchanged. **`k` is a displayed number**, tracked over time
   like any other series, precisely so this is visible.
2. **The ledger is a lower bound on the counter** (A7). Lost `after()` writes are calls that
   charged the window and left no row.
3. **`peakWindow5h` is a lower bound on the peak** for the same reason, *and* because it can
   only see windows that ended inside the range.
4. **280 is not the provider's limit; it is 70% of it**, with the soft tier at 196.
   `meter.ts`: *"we could not observe what quota exhaustion looks like on the wire without
   causing it."* So crossing 280 is a *degradation* (deferred work shed) before it is an
   outage — which the meter should show as two marks on one track, not one.

### 6.4 What A3 deliberately does not build

- **No weekly-quota model.** `meter.ts` argues 280×5h holds the ~2000/week quota at the Pro
  tier and says *"re-derive it here before assuming the weekly limit is still covered"* if
  the plan changes. A3 does not re-derive it and does not model it; a second window would
  double the surface of the one control that has to be simple enough to trust at 4am.
- **No alert.** v0.5.0 *observes* (§1). The sweep's nightly line is the only thing that fires
  on a day nobody visits, and it is still only a log line.
- **No prediction of `k`.** Forecasting a ratio of two forecasts compounds two bands and
  produces a number with no interpretation.

---

## 7. `llm_calls` retention — resolving §12.4

**Roadmap §12.4:** *"A ledger is the one table that gets big. A3 proposes a policy; nobody
has chosen a number, and the honest input is the row rate after a week of real traffic —
which does not exist yet."*

### 7.1 The ruling

```
LLM_CALLS_RETENTION_DAYS, default 400.
Deleted by the existing sweep, as a FIFTH delete, running LAST.
Plus a nightly size probe, logged, so the missing input starts existing tonight.
```

### 7.2 Why 400 and not 180

**Not `events`' 180.** Those two tables answer different questions and the difference is the
argument: `events` is a behavioural firehose whose value decays in weeks, and the privacy
policy commits to deleting it. `llm_calls` is a **cost ledger**, it holds no querent text at
all, and the one question it exists to answer — *"what did this cost, and is that growing"* —
needs a year-over-year comparison to be answerable at all. 400 days is `HISTORY_DAY_LIMIT`'s
number and `series.ts`'s `MAX_RANGE_DAYS`: **the retention window and the maximum queryable
range are the same number on purpose**, so the dashboard can never offer a range whose data
has been swept. Three constants that must agree, agreeing.

### 7.3 The roadmap's stated input does not exist, and a better one does

**The row rate after a week of real traffic does not exist and will not before this ships.**
But the binding constraint is not the row rate — it is **Neon's free plan, 0.5 GB.** That
number exists today.

Arithmetic, stated so it can be checked:

- A row is 5 uuids-or-nulls, 6 short `text` values, 3 `integer`s, a `boolean`, a `date` and a
  `timestamptz`, plus the tuple header: **~200 bytes heap.** Five indexes on the table
  (§3.2's four plus `reading_id`) roughly double it: **~400–500 bytes all-in.**
- Nine call sites, so a **reading is ~3 rows** (reading, moderation, gist) and a browsing
  session adds a few more.
- At **1,000 calls/day** — far beyond anything this app has seen — 400 days is **400k rows ≈
  180 MB**, or **36% of the free-plan budget** shared with every other table.
- At a realistic early **50 calls/day**: 20k rows, **~9 MB**. Immaterial.

**So 400 days is affordable at plausible volumes and would become the largest object in the
database at implausible ones.** That is exactly the situation a *probe* resolves and a
*guess* does not.

### 7.4 The probe, which is the actual deliverable of this ruling

The sweep logs, nightly, beside the counts it already logs:

```sql
select count(*)                                                      as rows,
       pg_total_relation_size('llm_calls')                             as bytes,
       min(created_at)::text                                           as oldest
  from llm_calls;
```

`pg_total_relation_size` includes indexes, which is the number that matters — a heap-only
figure would understate this table by half. It is logged **every** night, unlike the ceiling
warning which fires only when there is something to say: a size series is only useful as a
series, and one line a night in a Vercel log is the cheapest time-series this project can
have. **Revisit trigger, stated now so it is not a judgement call later: at 100 MB, or at
25% of the plan's storage, whichever comes first.** The revision options in order are a
shorter window, then dropping `llm_calls_op_created_idx` (its query is monthly, not
per-request), then aggregating rows older than 90 days into a daily rollup table — which is
a v0.6.0 schema and is named here only so nobody invents it as an emergency.

### 7.5 Where it runs, and the two rules it must not break

- **A FIFTH delete in the ONE existing cron job, not a new job.** The file's header is
  emphatic: Vercel's free plan allows a small number of invocations. **The header's own
  count — "ONE CRON JOB, FOUR DELETES" — becomes FIVE and the sentence must be edited, not
  appended to.** A header that miscounts its own body is how the next person concludes the
  file is untrustworthy.
- **It runs LAST, after the orphaned-translation reap**, by the file's own extended argument:
  the user purge cascades `readings` away, and `llm_calls.reading_id` is `on delete set
  null` — so rows *become* partially-orphaned during this invocation. Reaping last catches
  the same night. (`llm_calls.user_id` is also `set null`, so a purged user's cost history
  survives as unattributed, which A9/M12 already state and is correct: the tokens were
  spent.)
- **Independently wrapped, `failures.push('llm_calls')` on error, and the error's CLASS
  only** — `err instanceof Error ? err.name : 'unknown'`. This table holds no querent text,
  but the rule is *never log a driver error from any path that runs a query*, and a `catch`
  that is an exception to the rule is a `catch` somebody copies.
- **`admin_access_log` IS NOT SWEPT** (A18), and `sweep.retention.integration.test.ts` grabs
  the route's source and asserts the string `admin_access_log` does not appear in it — the
  `callClass.test.ts` grep precedent. A negative control named for the outcome.

### 7.6 The env var, and a correction to §8

**§8 says "One new variable" and that is wrong: there are two.**
`LLM_CALLS_RETENTION_DAYS` follows `EVENTS_RETENTION_DAYS` and
`MODERATION_QUESTION_RETENTION_DAYS` exactly — same defensive parse (`Number.isFinite && > 0`
or fall back), same place, unset in every environment, and **A1 owns `.env.example`** so A1
writes the annotation. Flagged for reconciliation rather than quietly added.

---

## 8. `docs/analytics-queries.md` — the additions

Six queries, numbered 13–18, following the file's rules: **every one executed against the
local database before the commit**, each with a stated expected answer and a "how to read
it" note where the number is easy to misread.

| # | Question | Notes that must ship with it |
|---|---|---|
| 13 | **Calls, tokens and status by `op`, over 30 days** | The nine-value table. `input_tokens` is half-blind on z.ai — the file's own opening fact, repeated at the query |
| 14 | **The worst rolling 5-hour window, and how close it came to 280** | M5's SQL verbatim. Carries §6.3's four caveats in four lines. **This is the query that replaces "how close is the window running"** — query 9's existing version counts `events` rows as a proxy and says it is a lower bound; this one counts the calls |
| 15 | **Tokens by day and model, with the unpriced count** | Why it is per model (A9), and that a summed-across-models token figure is unpriceable |
| 16 | **The A-D17 consistency check** | **`IS DISTINCT FROM`, never `<>`**, with the one-paragraph explanation of why the `<>` version returns 0 rows unconditionally. Expected: **0 rows** |
| 17 | **Cost league: tokens per user per model** | NULL `user_id` is a real row, not a gap. The denominator-shift note |
| 18 | **Ledger size and age** (the §7.4 probe, by hand) | The revisit trigger, and that `pg_total_relation_size` includes indexes |

**And one edit to an existing section.** Query 9's *"How close the window is running"*
currently says *"There is no counter to read — the ceiling lives in Redis, not in Postgres —
so this is the closest thing to a fuel gauge."* **After A2 that sentence is false**: there is
now a ledger, and query 14 reconstructs the counter properly. The sentence is **corrected in
place with a pointer to 14**, not left standing — a document that contradicts a later section
of itself is worse than one that is merely incomplete, and the roadmap's §6 assigns this file
to A3.

---

## 9. Schema deltas

**A3 adds no table and no column.** §3 already forbids the second and A3 needs neither. Two
things are declared here for reconciliation:

### 9.1 A candidate index, NOT built

```
index('readings_local_date_idx').on(readings.localDate)
```

M6 and M7 filter `readings.local_date` fleet-wide, which
`readings_user_local_date_idx (user_id, local_date)` cannot serve. **A3 does not build it**:
`schema.ts` has one owner, §6 assigns it to A1 for this release, and `readings` is the second
hottest write table in the schema — write amplification for a page visited occasionally is
the trade `reading_cards_user_date_card_idx` already refused.

**The trigger for building it, stated now:** when `readings` exceeds ~100k rows, or when M6
at a 400-day range exceeds 500ms measured against Neon. Until then the seq scan is the honest
plan and the integration test records its *shape* with `set local enable_seqscan = off`
rather than asserting the planner's choice at forty rows — V8's finding, and its lesson.

### 9.2 `resetDb()`'s TRUNCATE list is stale after this release, and §6 assigns it to nobody

`src/lib/db/testing/harness.ts` names all thirteen tables explicitly, and its comment states
the reason: *"so that a table added to the schema and forgotten here shows up as leaked state
rather than as a silent survivor."* v0.5.0 adds **three** tables and §6's file table does not
list `harness.ts` at all. A3's own tests use `withRollback` and are unaffected, which is
exactly why nobody will notice. **Reconciliation should assign it** — the natural owner is
whoever adds each table (A2 for `llm_calls`, A1 for `admin_access_log`, A6 for the two blog
tables).

---

## 10. Tasks

`export PATH=~/tools/node-v24.18.0-linux-x64/bin:$PATH` for every npm call. `npm test` and
`npm run test:integration` are run **separately**; `npm run test:all`'s red means nothing.

**Tasks 1–3 have no dependency on A2 and should be built first**, so A3 is not blocked: they
are pure modules with unit tests. Tasks 4–8 need `llm_calls` to exist.

---

### Task 1 — `series.ts`

**Files:** create `src/lib/analytics/series.ts`, `series.test.ts`.

Build §4. Zero imports. Header comment carries A2's rule (string buckets, never `date_trunc`)
and the `T00:00:00Z` parsing note.

**Acceptance:**
- `npm test -- series` green.
- Every case in §4's test list, including the Sunday `weekStart` case and the 401-day
  refusal.
- **Negative control:** replace `(dow + 6) % 7` with `dow` and the Sunday test must fail. Do
  it, watch it fail, revert.

---

### Task 2 — `forecast.ts`

**Files:** create `src/lib/analytics/forecast.ts`, `forecast.test.ts`.

Build §5: OLS, the `T95` table, the prediction interval with the `1 +` term, the union return
type, `crossing(target)` with the 365-day walk, and every guard in §5.4. Imports `series.ts`
and nothing else.

**Acceptance:**
- `npm test -- forecast` green; every row of §5.4's table has a test named for it.
- A perfectly linear series recovers its slope to `1e-9`.
- **The band widens with `x₀`** — assert `upper(30) − lower(30) > upper(1) − lower(1)`. This
  is the assertion that proves the `(x₀−x̄)²/Sxx` term is present; without it the code
  compiles and produces a parallel band, which looks plausible on a chart.
- **No variant of the return type carries `point` without `lower` and `upper`** — a
  type-level assertion (`@ts-expect-error` on a destructure of a bare `point`), because A11
  is a type invariant and a runtime test cannot see it.
- `n = 13` returns `insufficient` with `moreDaysNeeded: 1`; `n = 14` returns a forecast.
- Fed `[NaN]`, `[]`, `[{t:0,y:Infinity}]`, and 400 identical points, it **returns** in every
  case. Assert with `expect(() => …).not.toThrow()` as well as on the value.

---

### Task 3 — `src/lib/analytics/rollup.ts` (the pure folds)

**Files:** create `src/lib/analytics/rollup.ts`, `rollup.test.ts`.

- `foldOps(rows, keep = 4)` — fixed order, `'Other'` last, A8/A-D11.
- `priceRollup(rows, priceFor)` — takes A2's pure `priceFor` as an **argument**; returns
  `{ costUsd: number | null; unpricedCalls: number; pricedCalls: number }`. **A null price
  contributes to `unpricedCalls` and never to `costUsd`** (A10); if *every* call is unpriced,
  `costUsd` is `null`, not `0`.
- `periodDelta(current, previous)` — returns `null` when `previous === 0`, never `Infinity`
  and never `100%`. A percentage against a zero denominator is the most common wrong number
  on a dashboard.
- `burstiness(peak5h, meanCallsPerDay)` — §6.2 step 2; returns `null` when the mean is 0.
- `dailyEquivalentCeiling(windowCeiling, k)` — §6.2 step 3, `1344/k` generalised.

**Acceptance:** `npm test -- rollup` green. `foldOps` with 3, 4, 5 and 9 ops; **filtering to
two ops does not change either survivor's slot** (the A-D11 assertion). `priceRollup` with a
price table missing one model. `periodDelta(5, 0)` is `null`. `burstiness` at `k = 1` and at
`k = 4.8`, and `dailyEquivalentCeiling(280, 1) === 1344`.

---

### Task 4 — `queries/admin/timeout.ts`

**Files:** create `src/lib/db/queries/admin/timeout.ts`.

```ts
export async function withAdminRead<T>(db: DbOrTx, fn: (tx: DbOrTx) => Promise<T>): Promise<T>
```

Opens a transaction, issues `set transaction read only` and
`set local statement_timeout = <ADMIN_STATEMENT_TIMEOUT_MS>`, then runs `fn`. Handle first,
so `contract.test.ts` is satisfied without an exception. **`set transaction read only` comes
before any other statement in the block** or it errors, and the header says so.

`ADMIN_STATEMENT_TIMEOUT_MS = 10_000`, exported, with §1.5's ordering (`10s < 30s < 15s`
client) written out in the header **including the reason the client bound is above the
statement timeout**, because it looks backwards and somebody will "fix" it.

**Acceptance:** an integration test proves `insert` inside `withAdminRead` **throws**
(`25006`, `cannot execute INSERT in a read-only transaction`) — the mechanical form of §9.2 —
and that a `pg_sleep(11)` is killed by the statement timeout with `57014` rather than hanging.
The second is the only test that proves the timeout is actually applied and not merely set.

---

### Task 5 — `metrics.ts`, part 1: the fleet series (M1, M2, M3)

**Files:** create `src/lib/db/queries/admin/metrics.ts`,
`metrics.integration.test.ts`.

Header carries A1–A6. Every return type spells `number` for a count only where the code
`Number()`s it, and `string` for every bucket.

**Acceptance:**
- `npm run test:integration -- admin/metrics` green.
- **M2's timezone test is the one that must exist**: two users whose calls share a
  `created_at` and differ in `local_date`; M1 gives one bucket, M2 gives two, asserted in the
  same test.
- **Runtime types asserted on every field of every row** (A3). Specifically
  `expect(typeof row.calls).toBe('number')` and
  `expect(row.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/)`.
- **A `sum()` over a column that is NULL in every row returns `0`, not `null` and not
  `NaN`** — the `coalesce` + `Number()` pair, tested together.
- Zero-fill: a gap day appears with `calls: 0`.
- `status: 'refused'` rows are excluded from M1 (A7.3).

---

### Task 6 — `metrics.ts`, part 2: ops, latency, and the peak window (M4, M5, M8)

**Acceptance:**
- M5's peak test with the negative control from §3 (`peak` drops from 6 to 5 when one call
  moves out of the window), and `typeof peak === 'number'` — **the most load-bearing type
  assertion in A3**, because the value is compared against 280.
- An empty range returns `null` for the peak, not `0`.
- M8: one reading contributing TTFT 400 and total 9000; the two functions return the two
  numbers and neither returns the other.
- M4 returns nine ops and never a tenth; `percentile_cont` over one row is a `number`.

---

### Task 7 — `metrics.ts`, part 3: readings, actives, drift, models (M6, M7, M9, M10)

**Acceptance:**
- M9 (**A-D17**) with all three cases: agreement → 0 rows; `5 vs 7` → 1 row; **`NULL vs 0` →
  1 row.** The third is the one that matters and it is the one a `<>` implementation gets
  wrong.
- **Negative control for M9:** rewrite the predicate with `<>`, confirm all three cases
  return 0 rows, revert. A check that cannot fail must be *seen* to be unable to fail.
- M7 vs M6 in one test: one user, three days → M7 is `1`, M6 is three rows of `users: 1`.
- M6's five status filters partition the total.
- M6's plan recorded with `set local enable_seqscan = off`, asserting the index is
  *usable* — and the header records that at forty rows the planner correctly prefers a seq
  scan, so nobody "fixes" a failing plan assertion.
- A soft-deleted user's readings are included (the `allTime.ts` ruling, asserted).

---

### Task 8 — `queries/admin/users.ts` and `queries/admin/rollup.ts`

**Files:** create both, plus their integration tests.

`users.ts`: M11, M12, M13, each with the `UUID_RE` guard. `rollup.ts`: the composite
"one range, every fleet metric" function, so a cold `/admin` page is a bounded number of
round trips rather than one per tile. **It composes the M-functions rather than re-writing
their SQL** — one definition per metric, or the dashboard and the documented query drift.

**Acceptance:**
- A malformed uuid returns zeroes/empties from every `users.ts` function and **throws
  nothing** (`22P02` never surfaces).
- `min(local_date)`/`max(local_date)` come back as `'YYYY-MM-DD'` **strings**, asserted with
  a regex — the direct descendant of the `answersUpdatedAt` bug.
- A NULL-`user_id` group appears in M12 as its own row.
- M12's limit is capped at 200 in TypeScript even when asked for 10,000.
- The composite issues a bounded number of queries — assert with a counting wrapper, so a
  later "just add one more metric" is visible as a regression.

---

### Task 9 — the sweep

**Files:** edit `src/app/api/cron/sweep/route.ts`; create
`sweep.retention.integration.test.ts`.

Per §7.5: a fifth delete running last, `llmCallsRetentionDays()` beside the two existing
parsers, the nightly size probe, `failures.push('llm_calls')`, error class only. **Edit the
header's "FOUR DELETES" to five and add the fifth to the numbered list.**

**Acceptance:**
- Rows older than the window are deleted and rows inside it are not, at a boundary of
  exactly `n` days (the off-by-one that a `<` vs `<=` gets wrong).
- The probe logs even when nothing was deleted (**it must**, §7.4 — it is a series).
- **`admin_access_log` does not appear anywhere in the route's source** (A18), asserted by
  reading the file.
- One failing delete does not stop the others and the response is 500.
- `LLM_CALLS_RETENTION_DAYS=abc` falls back to 400 rather than becoming 0 — the
  `auth/ttl.ts` defensiveness, where a 0 would delete the whole table.

---

### Task 10 — `docs/analytics-queries.md`

Per §8: queries 13–18, **each actually executed** against the local database with real rows
in it (`npm run db:up`, `npm run db:seed`, then drive a few readings), the output pasted
where it is illustrative, and query 9's now-false sentence corrected in place.

**Acceptance:** every query runs and returns something; query 16 returns **0 rows** against a
consistent database and is shown returning 1 row against a deliberately-inconsistent one, the
way query 10 is shown returning its own signal. **A pasted result that was never produced is
the liability this file's opening paragraph is about.**

---

### Task 11 — verification and the write-up

**Acceptance:**
- `npm run typecheck`, then **`npm run build`** — a green typecheck is not evidence
  (TypeScript must stay on 5.x). Retry the build once on a `@vercel/turbopack-next` font
  resolution error; that is the AAAA trap, not a code failure.
- `npm test` and `npm run test:integration`, **separately**, both green.
- `queries/contract.test.ts` passes with **no new exception and no edit** — it globs
  `src/lib/db/**` and filters on `/queries/`, so `queries/admin/**` is covered
  automatically. If it needs an exception, the file is in the wrong directory (§2.1).
- `clientBoundary.test.ts` passes: nothing under `src/lib/analytics/{series,forecast,rollup}`
  imports `@/lib/db/**`, and nothing in `queries/admin/**` acquires `server-only` even
  transitively.
- The A3 section of `docs/workstream-notes.md` written **from the code, not from this plan**,
  with the measured plans, the numbers that moved and anything this document got wrong.
  Nothing goes into `CLAUDE.md` (§9.12).

---

## 11. Verification — the loops, mapped

| Loop | What it covers here |
|---|---|
| **1 — Vitest, unit** | `series.ts`, `forecast.ts`, `analytics/rollup.ts` in full: bucket boundaries, the OLS fit, the band's flare, every degenerate input, `foldOps`' fixed order, the pricing fold's null, `periodDelta`'s zero denominator, `burstiness`. **This is where the whole forecast policy lives** — the `swipeDeck.ts` precedent. |
| **2 — Vitest, integration** | **Every aggregate, required** (§10.1), with a runtime-type assertion per field (A3). Plus the read-only transaction, the statement timeout, the retention boundary, the `admin_access_log` absence, and M9 in all three cases with its `<>` negative control. |
| **3 — `tools/shot.sh` at 1440px** | Not A3's. A4's acceptance step. |
| **4 — `getBoundingClientRect`** | Not A3's. A3 renders nothing. |
| **5 — CDP** | Not A3's, with one exception worth stating: once A4's route exists, loop 5 against a **preview** is the only way to see a real query's wall time through a real lambda. A3 supplies the numbers; nobody can check them from WSL. |
| **6 — a real iPhone / a real cold request** | **The only instrument for A17.** `maxDuration` against a suspended Neon compute is the `POST /api/locale` failure class, and 1348ms warm from WSL told us nothing then either. A3's §1.5 numbers are unverified until this runs. |

**The check that is not automatable and takes ten seconds:** *stop the database and open
`/admin`.* W4's rule, and here the acceptance is different from a reading's — an admin page
with no database has nothing to show and **must say so**, not render zeroes. A dashboard of
zeroes is indistinguishable from a quiet day, which is the worst available failure for a
surface whose whole job is early warning.

---

## 12. Interfaces A3 needs

From **A2**, and A3 cannot start tasks 5–9 without them:

1. `llmCalls` — the Drizzle table export from `schema.ts`, with §3.2's columns and indexes.
2. **`LLM_OPS: readonly string[]` and `type LlmOp`** — the nine values as a **value**, not
   only a type, so A3 can iterate, zero-fill and assert nine without writing a tenth (A8).
3. **The `total_ms` vs `latency_ms` decision** (§12.2). A3 assumes **`total_ms`** and M4/M8
   are written against that name; a reconciliation that keeps `latency_ms` costs A3 a rename
   and costs the schema two columns with one name and two meanings.
4. **`priceFor(model: string, on: string): { inputUsdPerMTok: number; outputUsdPerMTok: number } | null`** —
   PURE, from `prices.ts`, taking a `'YYYY-MM-DD'` string so `effective_from` is resolved
   without a `Date` crossing a boundary.
5. **Does a ceiling refusal write a row?** A7.3 excludes `status = 'refused'` from the
   counter reconstruction because a refusal never charged the Redis window. If A2 does *not*
   write a row for a ceiling refusal, the predicate is harmless; if it writes one with a
   different `status`, M1 and M5 overcount and the fuel gauge reads high.
6. **Requested, and A3 works without it:** set `reading_id` on the **`gist`** call too.
   §3.2 says *"set for the reading call only"*, which makes per-reading total cost
   unanswerable — the gist is one of three calls a single reading causes. It costs nothing and
   it is the difference between "what does a reading cost" being a query and being a guess.

From **A1**: `LLM_CALLS_RETENTION_DAYS` in `.env.example` (§7.6), and the
`src/lib/db/queries/admin/` directory existing (A1 creates it for `audit.ts`).

## 13. Interfaces A3 exports

To **A4**: every M-function, `withAdminRead`, `ADMIN_STATEMENT_TIMEOUT_MS` and §1.5's
ordering, `forecast()` + `crossing()`, `foldOps`, `priceRollup`, `periodDelta`, `burstiness`,
`dailyEquivalentCeiling`, and `MIN_FORECAST_DAYS` so the empty state can name the number.

**Three things A4 must render or A3's invariants are broken outside A3's files:** the band and
`n` with every point estimate (A11); the unpriced call count beside every cost (A10); and
`k` beside every ceiling projection (§6.3.1).

To **A5**: `users.ts` in full. **A5 must not write its own per-user aggregates** — roadmap §7
gives A5 "per-user token series" and A3 `queries/admin/users.ts`, which is one metric with two
owners, and §11 does not list it as a seam.
