/**
 * The metric catalogue. **Handle first, every function, and every aggregate typed
 * `unknown` and converted by hand.**
 *
 * A3, v0.5.0. The read layer between A2's fact table and A4's charts. It renders
 * nothing and owns no route; it is the layer A4 and A5 call, always through
 * `withAdminRead`.
 *
 * ── `sql<T>` IS AN ASSERTION THE DRIVER IS NOT OBLIGED TO HONOUR ─────────────
 *
 * Drizzle maps a value to a JS type when it knows the COLUMN. Inside a raw `sql`
 * template there is no mapper, so postgres.js hands back what the wire gave it -- and
 * `count()` is `bigint`, `sum()` is `numeric`, `min(date)` is text-ish, all of which
 * arrive as **strings**. V8's `answersUpdatedAt` asserted `sql<Date>` over a
 * `max(timestamptz)`, `personaStaleness` compared that string to a real `Date` with
 * `>`, `ToPrimitive` coerced, and **every answer edit was judged wrongly with a green
 * typecheck and a green unit suite.** Only an integration test calling `.getTime()`
 * saw it.
 *
 * So: **every aggregate here is `sql<unknown>` and every one is `Number()`d or
 * `String()`d at the boundary**, and `metrics.integration.test.ts` asserts
 * `typeof === 'number'` on every returned field. `'12' > '9'` is `false` and
 * `'100' + 1` is `'1001'`; a summed token count would be wrong in a direction nobody
 * questions.
 *
 * **THE SHARPEST CASE IS `peakWindow5h`**, whose value is compared with `>=` against
 * 280: `'300' >= 280` is `true` by coercion and `'30' >= 280` is `false`, so a string
 * there would be *right most of the time*, which is worse than always wrong.
 *
 * ── TWO BUCKET KEYS, TWO NAMES, AND THE AMBIGUITY CANNOT SURVIVE A CALL SITE ─
 *
 * `callsByUtcDay` is bucketed by `created_at` in UTC and is the ONE series that may be
 * related to `LLM_WINDOW_CALL_CEILING`. `callsByLocalDate` is bucketed by the
 * querent's own calendar day and is for narratives about people. **A provider quota is
 * not the querent's Tuesday** -- `meter.ts` says it in capitals and there is
 * deliberately no date in the Redis key -- so bucketing the ceiling series by
 * `local_date` would answer a question nobody asked. Both ship, each named for its
 * bucket.
 *
 * ── AND `local_date` IS NOT HOMOGENEOUS ACROSS THE FLEET ────────────────────
 *
 * A call with no querent behind it -- a cron-driven repair pass, or one of the three
 * W3 onboarding routes R49 left unattributed -- stores the **UTC** date. That is the
 * right choice, since there is no querent whose calendar it could be, but it means a
 * fleet-wide `group by local_date` **sums two calendar systems**. R25 requires that on
 * screen and not only here. Where the number must be homogeneous, pass
 * `onlyWithUser: true`.
 */
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db/types';
import type { LLMOp } from '@/lib/llm/types';
import { enumerateDays, isUsableRange, zeroFill } from '@/lib/analytics/series';

/**
 * An inclusive `'YYYY-MM-DD'` range. **Validated with an `isHistoryDate`-shaped check,
 * never with `parseLocalDate`**, whose ±1-day bound answers *"is this plausibly the
 * querent's today"* and would 400 every interesting range. Same column, same format,
 * opposite question -- the trap is already written down on `/api/history`.
 */
export type Range = { from: string; to: string };

/**
 * **NOT EXPORTED, AND NOT BECAUSE IT IS UNINTERESTING.** `contract.test.ts` requires
 * the handle as the first parameter of every *exported* function under `/queries/`,
 * and a range guard has no handle -- so the guard itself lives in
 * `@/lib/analytics/series` where a unit test can reach it, and this is the local
 * spelling.
 */
function usable(range: Range): boolean {
  return isUsableRange(range.from, range.to);
}

/** `Number()` at the driver boundary. `null`/`undefined` become 0 deliberately --
 *  `coalesce` in SQL is the belt and this is the brace, because the two failures look
 *  identical on screen and different in a chart. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** For a `percentile_cont`, which is `double precision` and genuinely nullable when
 *  a group has no non-null rows. **`null` STAYS `null`: "no measurement" is not 0ms.** */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// M1 -- callsByUtcDay: the ceiling series
// ---------------------------------------------------------------------------

export type UtcDayRow = {
  /** `'YYYY-MM-DD'`, UTC. */
  bucket: string;
  calls: number;
  streamedCalls: number;
};

/**
 * **Fleet model calls per UTC day. The input to the trajectory, and the only daily
 * series that may be related to 280.**
 *
 * Zero-filled in TypeScript, not by a SQL `generate_series` -- a `generate_series` of
 * dates hands back `timestamptz`, straight into this file's header, and the zero-fill
 * is the one part of this a unit test can own.
 *
 * **`status <> 'refused'` IS DEFENSIVE, NOT LOAD-BEARING.** A2 struck `'refused'` from
 * the value set (R4) precisely because a `reserveModelCall()` refusal never reaches a
 * provider, so there is no call to record and the predicate matches everything today.
 * It stays because the counter reconstruction is what this series feeds: a refusal
 * charged the Redis window nothing, so a row for one would double-count the thing that
 * was declined. If the value ever comes back, this query is already right.
 */
export async function callsByUtcDay(db: DbOrTx, range: Range): Promise<UtcDayRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as bucket,
           count(*)                                             as calls,
           count(*) filter (where streamed)                     as streamed_calls
      from llm_calls
     where created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
       and status <> 'refused'
     group by 1
     order by 1
  `);

  const mapped = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket),
    calls: num(r.calls),
    streamedCalls: num(r.streamed_calls),
  }));

  return zeroFill(mapped, enumerateDays(range.from, range.to), (r) => r.bucket, (bucket) => ({
    bucket,
    calls: 0,
    streamedCalls: 0,
  }));
}

// ---------------------------------------------------------------------------
// M2 -- callsByLocalDate: the querent's day
// ---------------------------------------------------------------------------

export type LocalDateRow = {
  /** `'YYYY-MM-DD'`, **the querent's calendar day** -- and see the warning below. */
  bucket: string;
  calls: number;
  users: number;
};

/**
 * Fleet model calls per **querent day**, for narratives about people rather than about
 * quota.
 *
 * **THIS SERIES SUMS TWO CALENDAR SYSTEMS AND MUST SAY SO ON SCREEN** (R25). A call
 * with no querent stores the UTC date, so the fleet-wide version is *mostly*
 * querent-days with a UTC-day minority mixed in. `onlyWithUser: true` filters
 * `user_id is not null` and makes it homogeneous, at the cost of hiding the repair
 * passes. **Never use this series for the ceiling** -- that is M1.
 */
export async function callsByLocalDate(
  db: DbOrTx,
  range: Range,
  opts: { onlyWithUser?: boolean } = {},
): Promise<LocalDateRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select local_date::text                    as bucket,
           count(*)                            as calls,
           count(distinct user_id)             as users
      from llm_calls
     where local_date >= ${range.from}
       and local_date <= ${range.to}
       and status <> 'refused'
       ${opts.onlyWithUser ? sql`and user_id is not null` : sql``}
     group by 1
     order by 1
  `);

  const mapped = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket),
    calls: num(r.calls),
    users: num(r.users),
  }));

  return zeroFill(mapped, enumerateDays(range.from, range.to), (r) => r.bucket, (bucket) => ({
    bucket,
    calls: 0,
    users: 0,
  }));
}

// ---------------------------------------------------------------------------
// M3 -- tokensByBucketAndModel: the priceable shape
// ---------------------------------------------------------------------------

export type TokenRow = {
  bucket: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Calls whose `input_tokens` was NULL. **Not cosmetic** -- see below. */
  nullInputCalls: number;
  nullOutputCalls: number;
};

/**
 * **The only token series, and it is PER MODEL.**
 *
 * A-D7 prices at read time from a table keyed by model **and** `effective_from`, so a
 * single `sum(output_tokens)` for a day that spanned two models is **unpriceable** --
 * and the number that would be produced anyway is the one that silently understates
 * the bill. The roadmap does not state this; it is a real constraint on the shape.
 *
 * **`null_input_calls` IS THE HALF-BLINDNESS MADE VISIBLE.** z.ai returns
 * `input_tokens: 0`, which both adapters now store as NULL, so on `LLM_PROVIDER=zai`
 * this column is very nearly every row and `input_tokens` is structurally half-blind.
 * `analytics-queries.md` opens with that fact. A token chart that does not carry the
 * null count invites the reader to conclude the app has no prompt cost.
 *
 * Bucketed by `local_date`, so M2's two-calendar warning applies here too.
 */
export async function tokensByBucketAndModel(
  db: DbOrTx,
  range: Range,
): Promise<TokenRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select local_date::text                                as bucket,
           model,
           count(*)                                        as calls,
           coalesce(sum(input_tokens),  0)                  as input_tokens,
           coalesce(sum(output_tokens), 0)                  as output_tokens,
           count(*) filter (where input_tokens  is null)    as null_input_calls,
           count(*) filter (where output_tokens is null)    as null_output_calls
      from llm_calls
     where local_date >= ${range.from}
       and local_date <= ${range.to}
     group by 1, 2
     order by 1, 2
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket),
    model: String(r.model),
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    nullInputCalls: num(r.null_input_calls),
    nullOutputCalls: num(r.null_output_calls),
  }));
}

// ---------------------------------------------------------------------------
// M4 -- callsByOp: cost by purpose
// ---------------------------------------------------------------------------

export type OpTotals = {
  op: LLMOp;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  failed: number;
  aborted: number;
  /** **TOTAL time, not TTFT.** See M8; the column is `total_ms` and so is this. */
  p50Ms: number | null;
  p95Ms: number | null;
};

/**
 * Every `op` over the range, with total-latency percentiles. **Nine values, closed**
 * (roadmap seam 3): A3 groups by this column and must not invent a tenth or an alias.
 *
 * **THE `op` TIEBREAK MAKES THE ORDER TOTAL, AND THAT IS NOT PEDANTRY.** Without it,
 * two ops with equal counts swap places between page loads and it reads as the data
 * changing -- the same reason `topCardAllTime` breaks its tie on `card_id`.
 *
 * **`p95Ms` IS TOTAL TIME, NOT TIME TO FIRST TOKEN**, and the word appears twice on
 * purpose: `readings.latency_ms` is TTFT, `llm_calls.total_ms` is the whole call, and
 * one word meaning two things in one schema is roadmap seam 2. They are never plotted
 * on one chart -- not for the dual-axis reason, since they share a unit, but because
 * they measure different intervals of different events. See `ttftByService`.
 *
 * `percentile_cont` is `double precision` and comes back as a real JS number rather
 * than a string -- **asserted anyway**, because the cost of the assertion is one line
 * and the cost of being wrong is a percentile that sorts lexically.
 */
export async function callsByOp(db: DbOrTx, range: Range): Promise<OpTotals[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select op,
           count(*)                                                as calls,
           coalesce(sum(input_tokens),  0)                          as input_tokens,
           coalesce(sum(output_tokens), 0)                          as output_tokens,
           count(*) filter (where status = 'failed')                as failed,
           count(*) filter (where status = 'aborted')               as aborted,
           percentile_cont(0.5)  within group (order by total_ms)   as p50_ms,
           percentile_cont(0.95) within group (order by total_ms)   as p95_ms
      from llm_calls
     where created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1
     order by calls desc, op
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    // Bare `text` in the schema by W1's narrowing rule; A2 owns the set and
    // `callClass.test.ts` plus `OP_ORDER`'s compile-time guard keep a tenth out.
    op: String(r.op) as LLMOp,
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    failed: num(r.failed),
    aborted: num(r.aborted),
    p50Ms: numOrNull(r.p50_ms),
    p95Ms: numOrNull(r.p95_ms),
  }));
}

// ---------------------------------------------------------------------------
// M5 -- peakWindow5h: the fuel gauge, and the headline number
// ---------------------------------------------------------------------------

export type PeakWindow = {
  /** The end of the worst window, as a `text` timestamp. Never a `Date`. */
  windowEnd: string;
  /** Calls inside it. **Comparable to `LLM_WINDOW_CALL_CEILING` directly.** */
  calls: number;
};

/**
 * **The maximum number of model calls in any rolling five-hour window in the range.**
 *
 * The only figure in this project directly comparable to `LLM_WINDOW_CALL_CEILING=280`
 * -- it reconstructs exactly the quantity Redis holds, over any range, with no
 * assumption at all. R14 makes it the dashboard's hero, over notional spend, because
 * the release's stated risk is quota exhaustion and key revocation and that is metered
 * in calls per rolling five hours, not in dollars.
 *
 * **A WINDOW FRAME, NOT A BUCKET, AND THAT IS THE DESIGN.** A five-hour window
 * straddles midnight; any bucketing at all would hide the worst window in the range by
 * splitting it. `RANGE BETWEEN INTERVAL ... PRECEDING` over a `timestamptz` `ORDER BY`
 * is plain Postgres 11+, so it runs identically on the Docker 16 and on Neon 16 -- the
 * two are the same major **on purpose**.
 *
 * **`null` FOR AN EMPTY RANGE, NEVER 0.** "No calls" and "no data" are different
 * answers, and a fuel gauge reading empty because nothing was measured is the worst
 * available failure for a surface whose whole job is early warning.
 *
 * **AND IT IS A LOWER BOUND ON THE COUNTER.** The ledger write is inside `after()`,
 * which is not a guarantee; `reserveModelCall` charges the window *before* the call,
 * so a call that then throws charged the counter; and this can only see windows that
 * ended inside the range. Every headroom figure derived from it is optimistic, and
 * that word has to reach the page -- it is the same word `analytics-queries.md` query
 * 9 already uses.
 */
export async function peakWindow5h(db: DbOrTx, range: Range): Promise<PeakWindow | null> {
  if (!usable(range)) return null;
  const rows = await db.execute(sql`
    with w as (
      select created_at,
             count(*) over (order by created_at
                            range between interval '5 hours' preceding and current row)
               as in_window
        from llm_calls
       where created_at >= ${range.from}::date
         and created_at <  (${range.to}::date + 1)
         and status <> 'refused'
    )
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as window_end,
           in_window
      from w
     order by in_window desc, created_at
     limit 1
  `);

  const first = (rows as unknown as Array<Record<string, unknown>>)[0];
  if (!first) return null;
  /*
   * `Number()` HERE IS THE MOST LOAD-BEARING CONVERSION IN A3. `pg_typeof` on this
   * windowed `count(*)` is **bigint** -- executed against the local database on
   * 2026-07-29 -- so it arrives as a string, and the value is then compared with `>=`
   * against 280. `'300' >= 280` is `true` by coercion and `'30' >= 280` is `false`:
   * the string version would be RIGHT MOST OF THE TIME, which is worse than a bug
   * that always fires.
   */
  return { windowEnd: String(first.window_end), calls: num(first.in_window) };
}

// ---------------------------------------------------------------------------
// M8 -- two latency metrics that must never merge
// ---------------------------------------------------------------------------

export type TtftRow = {
  /** The service, or **`null` for the fleet total** -- see `ttftByService`'s rollup. */
  serviceId: string | null;
  readings: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

/**
 * **TIME TO FIRST TOKEN, from `readings.latency_ms`, by service AND for the fleet.**
 * Query 3 of `analytics-queries.md`, promoted to code.
 *
 * **NEITHER THIS NOR `callsByOp` IS CALLED `latency`, AND A SINGLE CHART MAY NOT PLOT
 * BOTH.** They share a unit and would look combinable; they measure different
 * intervals of different events. `readings.latency_ms` is the wait a querent watched;
 * `llm_calls.total_ms` is how long a call took, timed from above `gateReading` rather
 * than from the top of the handler -- so **expect `llm_calls.total_ms <
 * reading.completed.total_ms` and do not reconcile them** (R5).
 *
 * ── THE FLEET ROW IS A `rollup()`, NOT A SECOND QUERY ───────────────────────
 *
 * `/admin`'s TTFT tile needs one figure for the whole fleet, and **a fleet p95 is not the
 * mean of three service p95s** -- no fold over the rows below produces it. A rollup keeps
 * both answers on ONE predicate, so the tile and the table cannot drift the way a
 * dashboard and a documented query drift, and it keeps `FLEET_ROLLUP_QUERIES` at 8 on a
 * page where every request is cold and the first query wakes a suspended Neon compute.
 *
 * Three things that would each ship a wrong number silently:
 *
 *   1. **`grouping(service_id)`, NEVER `service_id is null`.** `readings.service_id` is
 *      `notNull()` today, so a NULL *is* unambiguously the rollup's total -- but the
 *      moment anyone relaxes that column, a nullability test starts reporting one
 *      service's percentile as the whole fleet's. `grouping()` cannot be wrong about
 *      which row it is. (And the pre-rollup `String(r.service_id)` would have rendered
 *      the total's id as the literal string `'null'`.)
 *   2. **`order by is_total` FIRST**, so the total sorts LAST and the `readings desc,
 *      service_id` tiebreak keeps its total order -- the same reason `callsByOp` has an
 *      `op` tiebreak. The total has the most readings of all, so without this it would
 *      lead, and every caller destructuring `rows[0]` would silently change meaning.
 *   3. **A TOTAL ROW WITH NO READINGS IS DROPPED, AND THAT IS NOT A REDUNDANT NULL
 *      CHECK.** Measured on the local Postgres 16, 2026-07-30: `group by rollup(x)` over
 *      an **empty** input returns ONE row -- the grand total, `n = 0`, percentiles NULL --
 *      where a plain `group by` returns none. Without the guard a range with no readings
 *      grows a phantom fleet row and "no data" acquires a second representation. This is
 *      deliberately NOT `peakWindow5h`'s ruling (*"`null` for an empty range, never 0"*):
 *      that distinction protects a fuel GAUGE, where empty is a claim about safety, and
 *      here `readings = 0` for the fleet and "no rows" are the same fact.
 */
export async function ttftByService(db: DbOrTx, range: Range): Promise<TtftRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select service_id                                               as service_id,
           grouping(service_id)                                     as is_total,
           count(*)                                                 as readings,
           percentile_cont(0.5)  within group (order by latency_ms) as p50_ms,
           percentile_cont(0.95) within group (order by latency_ms) as p95_ms
      from readings
     where local_date >= ${range.from}
       and local_date <= ${range.to}
       and latency_ms is not null
     group by rollup (service_id)
     order by is_total, readings desc, service_id
  `);

  return (rows as unknown as Array<Record<string, unknown>>)
    .map((r) => {
      const isTotal = num(r.is_total) === 1;
      return {
        serviceId: isTotal ? null : String(r.service_id),
        readings: num(r.readings),
        p50Ms: numOrNull(r.p50_ms),
        p95Ms: numOrNull(r.p95_ms),
      };
    })
    // See rule 3 above: the rollup emits a zero-reading total over an empty input.
    .filter((r) => r.serviceId !== null || r.readings > 0);
}

// ---------------------------------------------------------------------------
// M6 -- readingsByLocalDate: readings and actives
// ---------------------------------------------------------------------------

export type ReadingDayRow = {
  bucket: string;
  readings: number;
  /** **DISTINCT users on that day.** Never sum this column -- see `activeUsers`. */
  users: number;
  ok: number;
  partial: number;
  failed: number;
  aborted: number;
  blocked: number;
};

/**
 * Readings per querent day, with the status breakdown.
 *
 * **FROM `readings`, NOT FROM THE LEDGER, AND THAT IS THE POINT.** A blocked reading
 * makes no model call and still happened: W7's classifier refused it, the querent saw
 * a refusal, and the ledger has nothing to say about any of it. A "readings per day"
 * series built from `llm_calls` would silently exclude exactly the population the
 * moderation gate exists for.
 *
 * ── NO INDEX *SEEKS* THIS, AND THE PLAN SAYS SOMETHING MORE PRECISE THAN A3's ─
 *
 * A3's §9.1 says `readings_user_local_date_idx (user_id, local_date)` *"cannot use"* a
 * fleet-wide `local_date` range because the leading column is absent. **Measured on the
 * local Postgres 16, 2026-07-30, that is not quite right and the difference matters:**
 *
 *     set enable_seqscan = off;
 *     explain select count(*) from readings
 *      where local_date >= '2026-07-20' and local_date <= '2026-07-25';
 *
 *     Aggregate
 *       ->  Index Only Scan using readings_user_local_date_idx on readings
 *             Index Cond: ((local_date >= ...) AND (local_date <= ...))
 *
 * The planner **can** use it -- as a FULL index-only scan with the range applied as a
 * filter on the second column, never as a seek. So the honest statement is *"no index
 * seeks this"*: the work is proportional to the whole index rather than to the range,
 * which is exactly the same complexity as the seq scan the planner actually prefers at
 * this size, minus the heap.
 *
 * **A3 STILL DOES NOT ADD ONE**: `schema.ts` has one owner and §6 assigns it to A1 for
 * this release, and `readings` is the second hottest write table in the schema. The
 * candidate `readings_local_date_idx` is declared unbuilt in A3's §9.1 with its trigger
 * stated -- `readings` past ~100k rows, or M6 at a 400-day range past 500ms against
 * Neon. `reading_cards_user_date_card_idx` already refused the same trade.
 *
 * **A SOFT-DELETED USER'S READINGS ARE INCLUDED**, unlabelled here and labelled by A5.
 * `allTime.ts`'s ruling: the account is restorable for `ERASURE_GRACE_DAYS`, so
 * filtering would make this page disagree with every other query in the app during the
 * grace window.
 */
export async function readingsByLocalDate(
  db: DbOrTx,
  range: Range,
): Promise<ReadingDayRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select local_date::text                              as bucket,
           count(*)                                      as readings,
           count(distinct user_id)                       as users,
           count(*) filter (where status = 'ok')         as ok,
           count(*) filter (where status = 'partial')    as partial,
           count(*) filter (where status = 'failed')     as failed,
           count(*) filter (where status = 'aborted')    as aborted,
           count(*) filter (where status = 'blocked')    as blocked
      from readings
     where local_date >= ${range.from}
       and local_date <= ${range.to}
     group by 1
     order by 1
  `);

  const mapped = (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    bucket: String(r.bucket),
    readings: num(r.readings),
    users: num(r.users),
    ok: num(r.ok),
    partial: num(r.partial),
    failed: num(r.failed),
    aborted: num(r.aborted),
    blocked: num(r.blocked),
  }));

  return zeroFill(mapped, enumerateDays(range.from, range.to), (r) => r.bucket, (bucket) => ({
    bucket,
    readings: 0,
    users: 0,
    ok: 0,
    partial: 0,
    failed: 0,
    aborted: 0,
    blocked: 0,
  }));
}

// ---------------------------------------------------------------------------
// M7 -- activeUsers: a distinct count over a range, never a sum
// ---------------------------------------------------------------------------

/**
 * Distinct querents who took a reading in the range.
 *
 * **ITS OWN FUNCTION PRECISELY SO NOBODY SUMS M6's `users` COLUMN.** WAU is not
 * `sum(DAU)`: a user who reads every day would be counted seven times. The failure
 * produces a number that is plausible, monotone and wrong, which is the kind that
 * survives review -- so the two live side by side and `metrics.integration.test.ts`
 * asserts the difference in one test.
 */
export async function activeUsers(db: DbOrTx, range: Range): Promise<number> {
  if (!usable(range)) return 0;
  const rows = await db.execute(sql`
    select count(distinct user_id) as users
      from readings
     where local_date >= ${range.from}
       and local_date <= ${range.to}
  `);
  return num((rows as unknown as Array<Record<string, unknown>>)[0]?.users);
}

// ---------------------------------------------------------------------------
// M9 -- tokenLedgerDrift: the A-D17 consistency check, which must return 0 rows
// ---------------------------------------------------------------------------

export type DriftRow = {
  readingId: string;
  readingInput: number | null;
  callInput: number | null;
  readingOutput: number | null;
  callOutput: number | null;
};

/**
 * **A-D17's consistency check. IT MUST RETURN AN EMPTY ARRAY.**
 *
 * `readings.token_input`/`token_output` stay, and `llm_calls` records the same call.
 * Two copies of one fact is how they drift, so the check lives beside the schema with
 * a stated expected answer -- the `onboarding_answers` encryption-audit precedent,
 * where the query is in `schema.ts` and must return 0.
 *
 * ── `IS DISTINCT FROM`, NEVER `<>`, AND THE TRAP IS IN THE CHECK ITSELF ──────
 *
 * Both columns are nullable and z.ai makes NULL the common case for `input_tokens`.
 * `where r.token_input <> c.input_tokens` is **NULL-blind**: it evaluates to NULL
 * wherever either side is NULL, NULL is not true, the row is filtered out, and **the
 * query returns 0 rows whether or not the ledger agrees with anything.** A check that
 * cannot fail is indistinguishable from a check that passes, and the roadmap said only
 * *"must return 0 rows"* (R15). The integration test rewrites the predicate with `<>`
 * and confirms all three cases go quiet -- a check that cannot fail must be *seen* to
 * be unable to fail.
 *
 * **THE `NULL vs 0` CASE IS THE ONE THAT MATTERS**, and it is roadmap §12.6 arriving
 * as data: `anthropic.ts`'s buffered path used to store `0` where the streamed path
 * stored NULL, so a buffered z.ai call and its streamed twin disagreed by construction.
 * A2 fixed it (R16). This is the check that would catch it coming back.
 */
export async function tokenLedgerDrift(db: DbOrTx, range: Range): Promise<DriftRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select r.id::text     as reading_id,
           r.token_input  as reading_input,
           c.input_tokens as call_input,
           r.token_output as reading_output,
           c.output_tokens as call_output
      from readings r
      join llm_calls c on c.reading_id = r.id and c.op = 'reading'
     where r.local_date >= ${range.from}
       and r.local_date <= ${range.to}
       and (r.token_input  is distinct from c.input_tokens
         or r.token_output is distinct from c.output_tokens)
     order by r.created_at
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    readingId: String(r.reading_id),
    readingInput: numOrNull(r.reading_input),
    callInput: numOrNull(r.call_input),
    readingOutput: numOrNull(r.reading_output),
    callOutput: numOrNull(r.call_output),
  }));
}

// ---------------------------------------------------------------------------
// M10 -- modelsSeen: the unpriced denominator
// ---------------------------------------------------------------------------

export type ModelRow = { model: string; calls: number; firstSeen: string };

/**
 * Which models actually ran in the range. **Returns models, NOT prices.**
 *
 * A3 does not import `prices.ts` into SQL: the pricing fold is pure
 * (`priceRollup` in `@/lib/analytics/rollup`) and takes A2's `priceFor` as an
 * argument, so it is testable at a price table the test invents -- `PRICES` ships one
 * row per model, and a test against the shipped table could never reach the
 * missing-model branch at all.
 *
 * This is the list that answers *"what could we not price, and since when"* in one
 * look, so the fix is five minutes on a pricing page rather than an investigation.
 *
 * `min(created_at)::text` because a bare `min()` on a timestamp inside a raw template
 * is the `sql<T>` trap again -- there is no mapper, so it arrives as a driver-rendered
 * string wearing whatever type you asserted.
 */
export async function modelsSeen(db: DbOrTx, range: Range): Promise<ModelRow[]> {
  if (!usable(range)) return [];
  const rows = await db.execute(sql`
    select model,
           count(*)            as calls,
           min(created_at)::text as first_seen
      from llm_calls
     where created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1
     order by calls desc, model
  `);

  return (rows as unknown as Array<Record<string, unknown>>).map((r) => ({
    model: String(r.model),
    calls: num(r.calls),
    firstSeen: String(r.first_seen),
  }));
}
