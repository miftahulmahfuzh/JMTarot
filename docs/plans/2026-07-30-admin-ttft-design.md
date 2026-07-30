# Separating the reading's TTFT from every other duration on `/admin`

2026-07-30. Miftah's ask: *"for llm generation duration, we can separate the card reading
duration. Because card reading uses streaming, we can show their TTFT in the admin dashboard.
Admin can infer user experience by seeing the TTFT data — the smaller the TTFT, the better."*

## 1. What was already true, and what was actually broken

**The data layer already separates the two metrics and always did.** A3 shipped both halves of
roadmap seam 2 and named them so they could not be confused:

| Function | Column | Grain | Percentiles |
| --- | --- | --- | --- |
| `ttftByService` | `readings.latency_ms` — **TTFT**, the wait a querent watched | per service | p50, p95 |
| `callsByOp` | `llm_calls.total_ms` — the whole call | per op | p50, p95 |

Neither is called `latency`; `noDualAxis.test.ts:103` forbids an admin page plotting both into
one chart's `series`. None of that needed changing.

**What was broken was entirely in the rendering, in four ways:**

1. **A live mislabel.** `ServiceShare`'s table (`page.tsx:419`) rendered `rollup.ttft`'s p95 —
   a TTFT value — under the copy key `OVERVIEW.kpi.p95`, whose text reads *"p95 panggilan
   bacaan / Total waktu panggilan, bukan waktu ke token pertama."* **The single place TTFT
   reached the overview declared itself to be the thing it explicitly is not.** This is the
   merge M8 and R5 exist to prevent, shipped, with a green suite — because no test can read a
   label against the provenance of the number under it.
2. **`ttft[].p50Ms` was computed on every admin request and rendered nowhere.**
3. Nine ops' `p50Ms`/`p95Ms` are computed; exactly one value reached the screen — the
   `reading` op's p95, in the one KPI tile.
4. **There was no fleet-wide TTFT figure**, and none can be folded from what shipped:
   averaging three per-service p95s is not a p95.

So the fix is one query change, two pure folds, one new card, one new tile, and the deletion of
a borrowed copy key.

## 2. The query: a total row, not a sibling query

`ttftByService` gains `group by rollup (service_id)`.

```sql
select service_id,
       grouping(service_id) as is_total,
       count(*)                                                 as readings,
       percentile_cont(0.5)  within group (order by latency_ms)  as p50_ms,
       percentile_cont(0.95) within group (order by latency_ms)  as p95_ms
  from readings
 where local_date >= $from and local_date <= $to
   and latency_ms is not null
 group by rollup (service_id)
 order by is_total, readings desc, service_id
```

**Why a rollup rather than a second query.** The fleet percentile and the three service
percentiles then come from **one predicate**, so they cannot drift the way a dashboard and a
documented query drift — `rollup.ts`'s own opening rule. It also keeps
`FLEET_ROLLUP_QUERIES = 8`, which matters more here than it looks: every `/admin` request is a
cold one (there is one admin, so there is never a warm instance) and the first query of a
session also wakes a suspended Neon compute, which roadmap §4.2 calls the single most likely
live failure in v0.5.0.

### 2a. Three things that would each ship a wrong number silently

- **`grouping(service_id)`, never `service_id is null`.** `readings.service_id` is `notNull()`
  today, so a NULL *is* unambiguously the rollup total — but the moment anyone relaxes that
  column, a nullability test starts reporting one service's percentile as the whole fleet's.
  `grouping()` cannot be wrong about which row it is. Relatedly, the pre-existing
  `String(r.service_id)` would have rendered the total row's id as the literal string
  `'null'`, so an explicit mapping is not optional.
- **`order by is_total` first.** The total sorts last, so the existing `readings desc,
  service_id` tiebreak keeps its total order — the same reason `callsByOp` has an `op`
  tiebreak at all: without it two equal-count groups swap places between page loads and it
  reads as the data changing.
- **`TtftRow.serviceId` becomes `string | null`.** `ServiceShare` already filters to
  `SERVICES`, so it excludes the total row and was correct before this change — but it was
  correct *by accident*, and the type change is what makes it deliberate.

### 2b. THE MEASURED TRAP: `rollup()` OVER AN EMPTY INPUT RETURNS ONE ROW, NOT ZERO

Measured against the local Postgres 16 on 2026-07-30, per CLAUDE.md's rule that framework
behaviour is measured here and never recalled:

```
-- empty input, group by rollup(svc):
 svc    | is_total | n | p50
 <null> |        1 | 0 | (null)
(1 row)
```

**So a range with no readings at all would have produced a phantom fleet row** — `readings: 0`,
`p50Ms: null` — where the function had always returned `[]`. That breaks
`metrics.integration.test.ts:506` (*"skips readings with no TTFT rather than counting them as
0"*), and it would have given the empty state two representations instead of one.

**The mapper therefore drops the total row when it carries no readings**, and the existing test
passes unchanged. A new test pins the behaviour by name, because the guard looks like a
redundant nullability check and is the only thing between a future session and a phantom row.

This is deliberately *not* `peakWindow5h`'s ruling (*"`null` for an empty range, never 0,
because no calls and no data are different answers"*). That distinction protects a **fuel
gauge**, where a reading of empty is a claim about safety. Here `readings = 0` for the fleet and
"no rows" are the same fact, and `ms(null)` renders the same empty cell either way.

## 3. The folds

Two pure functions in `src/app/admin/metrics.ts` — the file whose whole job is that an A3 shape
change is a compile error in one place:

- `ttftServices(rows)` — the per-service rows, total row excluded, in `SERVICES` order.
- `ttftOverall(rows)` — the total row, or `null`.

**The "which row is the total" knowledge lives in exactly one place.** `npm test` exercises both
with no database.

## 4. The surface

### 4a. A sixth KPI tile, beside the fifth rather than replacing it

The grid is `repeat(auto-fit, minmax(150px, 1fr))`, so six tiles need no media query and still
resolve to one column at 320px.

```
[ p95 TTFT bacaan ]          [ p95 panggilan bacaan ]
  5,1 s                        8,4 s
  Waktu ke token pertama —     Total waktu panggilan,
  yang ditunggu penanya.       bukan waktu ke token pertama.
  Makin kecil makin baik.
```

**TTFT is placed first, because it is the number about a person and the other is about a call.**
The existing tile's note already said *"not TTFT"*; now that sentence points at a tile on the
same screen, which is what makes the seam legible rather than merely asserted.

The total-duration tile is **kept, not replaced**. R5 forbids reconciling the two, and
`llm_calls.total_ms` for the `reading` op is still the quota- and cost-shaped number.

### 4b. A new card, and it is a TABLE

`TtftCard`: `ChartFrame` with `series: []`, a `KpiRow` of the fleet p50 and p95 as the visible
summary, and the per-service breakdown in the table view. `StatusCard` is the precedent —
*"a table, and §1.6 is the reason"*.

| Layanan | Bacaan | p50 | p95 |
| --- | --- | --- | --- |
| daily | 214 | 3,9 s | 6,2 s |
| spread3 | 180 | 4,6 s | 7,1 s |
| yesno | 96 | 3,1 s | 5,0 s |
| **Semua** | **490** | **4,1 s** | **6,4 s** |

**Two primitives could have drawn this and both would lie:**

- **`StackedBar` runs through `stackSegments`, which normalises each row to 100% of its own
  total.** Three bars of duration would all fill the width and be mutually uncomparable — the
  exact opposite of the card's job. This is a property of the shipped fold, not a guess:
  `geometry.ts:196` computes `(value / total) * 100` per row.
- **`Meter` needs a `ceiling`**, i.e. a declared TTFT target, and its fill runs a
  good→warning→critical severity ramp. **Nobody has set that target.** Inventing one to get a
  colour is `NOTIONAL_MODEL` rendering `US$0,00` under the word "notional": a judgement wearing
  a measurement's clothes. Same discipline, same answer — don't.

### 4c. The mislabel, fixed

`ServiceShare`'s third column stops borrowing `OVERVIEW.kpi.p95`. New `OVERVIEW.ttft.*` keys in
`copy.ts`, Indonesian, where A-D12 puts every admin string.

## 5. Deliberate non-goals, recorded rather than half-built

- **No TTFT trend series.** That needs a `ttftByLocalDate` query and answers *"is the experience
  degrading"*, which is a different question from *"what is it"*. The right shape is a
  sparkline on the new tile; it needs a ninth round trip and its own ruling on the
  querent-day/UTC mixture R25 describes.
- **No target, threshold or colour on TTFT until a human states one.** See 4b.
- **No per-reader dimension.** `readings.reader_id` exists and nothing groups by it; that is
  §6.1 row 5's standing gap and `queries/admin/**` ownership is unchanged by this note.
- **The nine ops' total durations stay unrendered.** Considered and declined for scope: the
  `reading` op's p95 is the one an operator watches, and the other eight would need their own
  card to be worth the room.

## 6. Verification

- `npm test` — the folds, the copy fences, `adminCopy`, `adminSurface`, `noDualAxis`.
- `npm run test:integration` — the rollup's shape against a real Postgres, including the
  measured empty-input case and the `readings desc` order with the total last.
- `npm run typecheck` and `npm run build` — the `string | null` widening is meant to be a
  compile error at every existing call site that assumed otherwise.
- Loop 4 (`tools/seo/fit.sh`-style) for the six-tile KPI row at 320px, since that grid claims
  to need no media query.
