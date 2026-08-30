/**
 * What `/admin/chat` reads. **F7, v0.7.0 — the operator's view of the group chat.**
 *
 * `docs/plans/2026-08-07-chat-admin.md` §2. Handle first, every function; every
 * aggregate typed `sql<unknown>` and `Number()`d at the boundary.
 *
 * ── THIS TAB MEASURES; IT NEVER RESTRAINS (`[F7-1]`) ───────────────────────
 *
 * Miftah's requirement 9 is two sentences that only look contradictory — *"track the
 * tokens consumption in the admin system"* and *"DO NOT STINT ON BURNING TOKENS
 * DURING CHAT"*. There is no cap here, no kill switch and no budget control. The one
 * restraint in this release lives in `meter.ts` and `LLM_WINDOW_CHAT_CEILING`, and it
 * exists for `C-D6`'s reason (a chat run must never be why a reading fails), not for
 * money's.
 *
 * ── EVERY PANEL BUCKETS BY **UTC DAY**, ONE CALENDAR (`[F7-2]`) ────────────
 *
 * `chat_runs` and `chat_messages` carry `created_at` (`timestamptz`) and **no
 * `local_date`, deliberately** — so `/admin`'s two-bucket problem (R25's *"a
 * fleet-wide `group by local_date` sums two calendar systems"*) cannot arise here.
 * The one exception is `chatCallTotals`, which reads `llm_calls` and must use that
 * table's own `local_date` to stay `PriceableRow`-shaped; its panel says so.
 *
 * **Adding a `local_date` to `chat_runs` for symmetry would re-import a defect the
 * table does not have**, and the chat's quota panel has to be comparable to
 * `callsByUtcDay`, which is bucketed by `created_at`.
 *
 * ── NO DRIVER ERROR IS EVER LOGGED FROM A PATH THAT RUNS ONE OF THESE ──────
 *
 * Roadmap §9's non-negotiable 6, and it binds F7 hardest of anyone: a postgres error
 * quotes the failing statement **and its bound parameters**, and this file's queries
 * touch a table whose `body` column is a person's conversation. The page's one
 * `catch` returns `ChartError` and logs nothing.
 *
 * ── AND NOTHING HERE SELECTS `chat_messages.body` (`[F7-13]`) ──────────────
 *
 * Not a snippet, not a first line, not a length that could be joined back. `body` is
 * plaintext (`C-D20`) — it is not even behind `FIELD_ENCRYPTION_KEY` the way the six
 * onboarding answers are, which makes it easier to leak, not safer to show. The
 * protection is *nothing reads it*, which is a property of this file.
 */
import { sql } from 'drizzle-orm';
import type { DbOrTx } from '@/lib/db/types';
import type { LLMOp } from '@/lib/llm/types';
import type { BeatIntent, ChatAuthor, RunStatus, RunTrigger } from '@/lib/chat/types';
import { isUsableRange } from '@/lib/analytics/series';
import { callsByOp, peakWindow5h, type OpTotals, type PeakWindow, type Range } from './metrics';

/**
 * The two ops the chat spends. **A constant rather than a literal at each call site**,
 * because seven of the nine panels filter on it and a panel that quietly dropped one
 * would measure the director without the voices, or the reverse.
 */
export const CHAT_OPS = ['chat_plan', 'chat_turn'] as const satisfies readonly LLMOp[];

/** `metrics.ts`'s local spelling of the range guard, for its stated reason: the guard
 *  itself is in `@/lib/analytics/series` where a unit test can reach it, and
 *  `contract.test.ts` requires the handle first on every *exported* function. */
function usable(range: Range): boolean {
  return isUsableRange(range.from, range.to);
}

/** `Number()` at the driver boundary. `count()` is a bigint and `sum()` is a numeric;
 *  both arrive as strings and a `sql<number>` would make the compiler believe them. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** For a `percentile_cont`, which is `double precision` and genuinely nullable.
 *  **`null` STAYS `null`: "no measurement" is not 0ms.** */
function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  return result as unknown as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// P1 -- proactiveReplyRate: THE RELEASE'S OWN SCORECARD
// ---------------------------------------------------------------------------

export type ReplyRateRow = {
  trigger: RunTrigger;
  /** Proactive runs that produced a bubble AND whose 24-hour window has CLOSED. */
  delivered: number;
  /** Of those, the ones the querent answered inside the window. */
  replied: number;
  /** Delivered, but the window is still open. **In neither the numerator nor the
   *  denominator** (`[F7-3]`), and reported separately so the operator can see that a
   *  low rate is a young range rather than a quiet room. */
  pending: number;
};

/**
 * **`C-N2f`, verbatim: did the querent answer a message they did not ask for, within
 * 24 hours?**
 *
 * Roadmap §10.3 names this the only *continuous* measurement of the release once it
 * has shipped. `npm run smoke -- --chat --proactive` is read once by a person; this is
 * read every week by the person deciding whether the room is alive.
 *
 * ── THE DENOMINATOR IS RUNS WHOSE WINDOW HAS CLOSED (`[F7-3]`) ─────────────
 *
 * A proactive run that produced a bubble four hours before the range's right edge has
 * not failed to get a reply; **it has not finished being asked.** Including it makes
 * the rate fall every time the operator picks a range ending today — which is the
 * default filter — so the release's own scorecard would read as declining on every
 * page load. This is `periodDelta`'s rule (`null`, never `Infinity` or `100%`) applied
 * to a population instead of to a ratio.
 *
 * Three things about the SQL that are not incidental:
 *
 * - **The join to `chat_messages` is what makes the denominator `C-N2f`'s.** A run
 *   that planned zero beats (`C-R6`) or lost every beat (`C-R7`) produced no bubble
 *   and is not in `delivered` — correctly, because nothing was said for the querent to
 *   answer. From inside the room those two are indistinguishable from silence, and
 *   `runHealth` is the panel that tells them apart.
 * - **`author <> 'user'` and not `author in (…)`.** F1 owns the reader slugs; a fourth
 *   reader would be counted without an edit here, and a new non-reader author would be
 *   a schema change F1 would have to argue for anyway.
 * - **`u.user_id = d.user_id` and NOT a `run_id` join.** The querent's reply is the
 *   trigger message of a NEW `user_message` run; it has no relationship to the
 *   proactive run except in time. That is the whole measurement — a querent who came
 *   back and said something else entirely still came back.
 */
export async function proactiveReplyRate(db: DbOrTx, range: Range): Promise<ReplyRateRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    with delivered as (
      select r.id,
             r.trigger,
             r.user_id,
             max(m.created_at) as last_bubble_at
        from chat_runs r
        join chat_messages m on m.run_id = r.id and m.author <> 'user'
       where r.trigger <> 'user_message'
         and r.created_at >= ${range.from}::date
         and r.created_at <  (${range.to}::date + 1)
       group by r.id, r.trigger, r.user_id
    ),
    judged as (
      select d.trigger,
             -- THE WINDOW MUST HAVE CLOSED. [F7-3]
             (d.last_bubble_at + interval '24 hours') <= now() as settled,
             exists (
               select 1 from chat_messages u
                where u.user_id = d.user_id
                  and u.author  = 'user'
                  and u.created_at >  d.last_bubble_at
                  and u.created_at <= d.last_bubble_at + interval '24 hours'
             ) as replied
        from delivered d
    )
    select trigger,
           count(*) filter (where settled)             as delivered,
           count(*) filter (where settled and replied) as replied,
           count(*) filter (where not settled)         as pending
      from judged
     group by trigger
     order by trigger
  `);

  return rowsOf(result).map((r) => ({
    trigger: String(r.trigger) as RunTrigger,
    delivered: num(r.delivered),
    replied: num(r.replied),
    pending: num(r.pending),
  }));
}

// ---------------------------------------------------------------------------
// P2 -- runsByUtcDay
// ---------------------------------------------------------------------------

export type RunDayRow = {
  /** `'YYYY-MM-DD'`, UTC. */
  bucket: string;
  trigger: RunTrigger;
  runs: number;
};

/**
 * Runs per UTC day per trigger: how much the room is doing, and how much of it is
 * unprompted.
 *
 * ── NOT ZERO-FILLED, AND `tokensByBucketAndModel` IS THE PRECEDENT ─────────
 *
 * A3 zero-fills `callsByUtcDay` because it is one row per day. This is grouped by TWO
 * keys, exactly like `tokensByBucketAndModel` — which A3 deliberately leaves sparse,
 * with the dense series built by the fold in `src/app/admin/metrics.ts` from the RANGE
 * rather than from the rows. `src/app/admin/chat/series.ts` does the same here, and
 * that is where a unit test can reach it. **A filled gap is a measurement nobody made**
 * either way; the difference is only which module owns the enumeration.
 *
 * **ONE RUN IS ZERO TO FOUR MESSAGES.** This counts RUNS. `castByTarget` counts
 * bubbles, and the two must not be read as the same series scaled.
 */
export async function runsByUtcDay(db: DbOrTx, range: Range): Promise<RunDayRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as bucket,
           trigger,
           count(*)                                             as runs
      from chat_runs
     where created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1, 2
     order by 1, 2
  `);

  return rowsOf(result).map((r) => ({
    bucket: String(r.bucket),
    trigger: String(r.trigger) as RunTrigger,
    runs: num(r.runs),
  }));
}

// ---------------------------------------------------------------------------
// P3 -- beatHistogram: how long a run is, and how often nobody speaks
// ---------------------------------------------------------------------------

export type BeatBucketRow = {
  /**
   * `0` through `8`, where 8 means "8 or more".
   *
   * **EIGHT SINCE 2026-08-30, AND IT WAS FOUR THROUGH TWO CAP RAISES.** The comment
   * here read *"`CHAT_MAX_BEATS` is 4, so the top bucket is exact today"*; the cap went
   * to 6 on 2026-08-28 and to 8 with the naturalness rewrite, so for a whole release
   * this panel — the one `CLAUDE.md` calls the scorecard — folded every five-, six- and
   * seven-beat run into a bar labelled `4+` and under-reported the exact thing the
   * release changed.
   *
   * **A LITERAL, NOT AN IMPORT OF `CHAT_MAX_BEATS_DEFAULT`.** `queries/admin/**` takes
   * no config, and a histogram whose buckets moved with an environment variable would
   * make two date ranges incomparable with nothing on screen saying so. **Revisit it by
   * hand when the cap moves again** — and `BEAT_BUCKETS` in `series.ts` is the other
   * half of the same edit.
   */
  bucket: number;
  runs: number;
};

/**
 * The distribution of beats per terminal run — **a distribution, never a mean**
 * (roadmap §6.1's own wording; the mean rides beside it as a companion).
 *
 * `C-R6` is explicit: a zero-beat plan is valid and desirable, *"F2 must make it
 * reachable and F7 must measure how often it happens; a rate of zero means the
 * director is not really deciding."* **KESENYAPAN NOL BUKAN KABAR BAIK.**
 *
 * ── TERMINAL RUNS ONLY, AND THAT IS WHAT SEPARATES THE TWO ZEROS ───────────
 *
 * A `running` run's beat sheet is a PLAN, not an outcome. Counting it would put
 * in-flight runs in the `0` bucket beside deliberate silence — the two things this
 * panel exists to separate. `pending` and `planning` have no sheet at all
 * (`[F1-4]` makes `status = 'planning' AND beats IS NOT NULL` unrepresentable), so
 * they would land in `0` too, and every open tab would read as a director choosing
 * not to answer.
 */
export async function beatHistogram(db: DbOrTx, range: Range): Promise<BeatBucketRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select least(coalesce(jsonb_array_length(beats -> 'beats'), 0), 8) as bucket,
           count(*)                                                    as runs
      from chat_runs
     where status in ('done', 'abandoned')
       and created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1
     order by 1
  `);

  return rowsOf(result).map((r) => ({ bucket: num(r.bucket), runs: num(r.runs) }));
}

// ---------------------------------------------------------------------------
// P4 -- castByTarget: is this a group, or three prompt files taking turns?
// ---------------------------------------------------------------------------

/** Who a bubble was aimed at, derived from `reply_to_message_id`. `'none'` is an
 *  ordinary outcome — the first beat of a run replies to nothing. */
export type CastTarget = 'querent' | 'reader' | 'none';

export type CastRow = {
  /** A reader slug. `author <> 'user'` is the filter, so this is never `'user'`. */
  author: Exclude<ChatAuthor, 'user'>;
  target: CastTarget;
  messages: number;
};

/**
 * Who speaks, and to whom. `C-N1a` and `C-R5`: **reader-to-reader is what makes the
 * room a room**, and if that column is zero across a range this is three monologues.
 *
 * The self-join is on `reply_to_message_id`, which is `on delete set null` — so a
 * bubble whose quoted message was deleted counts as `'none'` rather than vanishing.
 * That is the honest answer: the reply happened, and what it replied to is gone.
 */
export async function castByTarget(db: DbOrTx, range: Range): Promise<CastRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select m.author,
           case
             when m.reply_to_message_id is null then 'none'
             when p.author = 'user'             then 'querent'
             else 'reader'
           end as target,
           count(*) as messages
      from chat_messages m
      left join chat_messages p on p.id = m.reply_to_message_id
     where m.author <> 'user'
       and m.created_at >= ${range.from}::date
       and m.created_at <  (${range.to}::date + 1)
     group by 1, 2
     order by 1, 2
  `);

  return rowsOf(result).map((r) => ({
    author: String(r.author) as Exclude<ChatAuthor, 'user'>,
    target: String(r.target) as CastTarget,
    messages: num(r.messages),
  }));
}

// ---------------------------------------------------------------------------
// P5 -- beatIntents: C-N1d's ask rate
// ---------------------------------------------------------------------------

export type IntentRow = {
  /** **`null` IS A REAL ANSWER AND NOT AN EMPTY ONE.** A beat whose sheet carried no
   *  `intent` key renders as `(tidak tercatat)`; an empty panel and a mis-keyed query
   *  must not look alike. */
  intent: BeatIntent | null;
  beats: number;
};

/**
 * What the director planned each beat FOR. `C-N1d` — *they ask questions* — and the
 * `ask` share is one of the two things this release is measured by.
 *
 * ── THIS READS THE PLAN, NOT THE PROSE ────────────────────────────────────
 *
 * `chat_runs.beats` is the director's sheet, so a beat that failed validation twice
 * and was dropped is still counted here. That is stated on the panel rather than
 * filtered out: the question *"does the director ever use `ask`"* is about the
 * director, and `runHealth` is where the dropped ones are visible.
 *
 * The key is `'intent'`, pinned by reconciliation `[R9]` (seam S1: F1 owns the beat
 * shape, F2 owns its contents, **F7 is the third consumer and reads it by string
 * key**). If it ever moved, every beat here would report `null` — visible, and
 * wrong-looking, which is the failure mode this comment exists to shorten.
 */
export async function beatIntents(db: DbOrTx, range: Range): Promise<IntentRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select b ->> 'intent' as intent,
           count(*)       as beats
      from chat_runs r
      cross join lateral jsonb_array_elements(coalesce(r.beats -> 'beats', '[]'::jsonb)) as b
     where r.status in ('done', 'abandoned')
       and r.created_at >= ${range.from}::date
       and r.created_at <  (${range.to}::date + 1)
     group by 1
     order by 1
  `);

  return rowsOf(result).map((r) => ({
    intent: r.intent === null || r.intent === undefined ? null : (String(r.intent) as BeatIntent),
    beats: num(r.beats),
  }));
}

// ---------------------------------------------------------------------------
// P6 -- the ledger, twice: a daily series and a priceable fold
// ---------------------------------------------------------------------------

export type ChatTokenRow = {
  /** `'YYYY-MM-DD'`, UTC — comparable to `callsByUtcDay`. */
  bucket: string;
  op: (typeof CHAT_OPS)[number];
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Calls whose provider reported nothing at all. **Rendered beside the totals, never
   *  hidden** (A-D7): a token total with no count of what it could not see reads as
   *  complete. */
  untokenized: number;
};

/**
 * Tokens and calls per UTC day, **split `chat_plan` vs `chat_turn` and never
 * averaged.**
 *
 * `C-D5`'s argument is this function's justification: *"the director is a large prompt
 * and a tiny JSON reply, a voice is a large prompt and a two-sentence reply — averaging
 * them makes both figures meaningless."* Two series on one axis is what un-averages
 * them, and it is why the release spent two `LLMOp` values rather than one.
 */
export async function chatTokensByUtcDay(db: DbOrTx, range: Range): Promise<ChatTokenRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as bucket,
           op,
           count(*)                                             as calls,
           coalesce(sum(input_tokens),  0)                      as input_tokens,
           coalesce(sum(output_tokens), 0)                      as output_tokens,
           count(*) filter (
             where input_tokens is null and output_tokens is null
           )                                                    as untokenized
      from llm_calls
     where op in ('chat_plan', 'chat_turn')
       and created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
       and status <> 'refused'
     group by 1, 2
     order by 1, 2
  `);

  return rowsOf(result).map((r) => ({
    bucket: String(r.bucket),
    op: String(r.op) as (typeof CHAT_OPS)[number],
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    untokenized: num(r.untokenized),
  }));
}

export type ChatCallTotals = {
  model: string;
  localDate: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  untokenized: number;
};

/**
 * The chat's ledger rows grouped per `(model, local_date)` — **structurally
 * assignable to `PriceableRow`**, so `priceRollup(rows, notionalLookup)` prices the
 * chat with **no edit to A3's or A2's code.**
 *
 * That is the whole reason this workstream needs no `op` field on `PriceableRow`, and
 * the whole reason `[F7-6]` holds: pushing `op` into that type would reach
 * `tokensByBucketAndModel`'s SQL and `userCostLeague`'s SQL — three edits to A3's
 * files, breaking six test files — to render a number nobody asked for.
 *
 * **`local_date` HERE AND `created_at` EVERYWHERE ELSE IN THIS FILE, DELIBERATELY.**
 * A-D7 prices per model per period and the period `prices.ts` takes is a date; the
 * ledger's own column is `local_date`, so pricing against a UTC bucket would ask the
 * price table a question it is not keyed for. The panel says which bucket each figure
 * uses, and the two differ by at most a day at the edges.
 */
export async function chatCallTotals(db: DbOrTx, range: Range): Promise<ChatCallTotals[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select model,
           local_date::text                as local_date,
           count(*)                        as calls,
           coalesce(sum(input_tokens),  0) as input_tokens,
           coalesce(sum(output_tokens), 0) as output_tokens,
           count(*) filter (
             where input_tokens is null and output_tokens is null
           )                               as untokenized
      from llm_calls
     where op in ('chat_plan', 'chat_turn')
       and local_date between ${range.from} and ${range.to}
     group by 1, 2
     order by 1, 2
  `);

  return rowsOf(result).map((r) => ({
    model: String(r.model),
    localDate: String(r.local_date),
    calls: num(r.calls),
    inputTokens: num(r.input_tokens),
    outputTokens: num(r.output_tokens),
    untokenized: num(r.untokenized),
  }));
}

// ---------------------------------------------------------------------------
// P7 -- chatLatency
// ---------------------------------------------------------------------------

export type ChatLatencyRow = {
  /** `'YYYY-MM-DD'`, UTC, or **`null` for the range-wide row.** `ttftByService`'s
   *  shape and its rule: **a range p95 is NEVER the mean of the daily p95s**, so
   *  Postgres computes it over the whole population and it arrives as its own row. */
  bucket: string | null;
  op: (typeof CHAT_OPS)[number];
  calls: number;
  p50Ms: number | null;
  p95Ms: number | null;
};

/**
 * How long the room takes to say something, per op, per day, **plus a range-wide row
 * per op that is not derived from the daily ones.**
 *
 * **THIS IS MODEL-CALL TIME, NOT WHAT THE QUERENT FELT.** The typing delay between
 * beats is computed by F3's `Pace`, returned by F1 in `AdvanceReply.next` and waited
 * out by F4 in the browser — it is recorded nowhere, and a run's wall-clock is the sum
 * of these plus those delays. The panel says so.
 *
 * `status = 'ok'` only: a failed call has a duration, but not a duration producing
 * anything.
 */
export async function chatLatency(db: DbOrTx, range: Range): Promise<ChatLatencyRow[]> {
  if (!usable(range)) return [];
  const result = await db.execute(sql`
    select to_char(created_at at time zone 'UTC', 'YYYY-MM-DD') as bucket,
           op,
           count(*)                                             as calls,
           percentile_cont(0.5)  within group (order by total_ms) as p50_ms,
           percentile_cont(0.95) within group (order by total_ms) as p95_ms
      from llm_calls
     where op in ('chat_plan', 'chat_turn')
       and status = 'ok'
       and created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1, 2
    union all
    select null as bucket,
           op,
           count(*)                                             as calls,
           percentile_cont(0.5)  within group (order by total_ms) as p50_ms,
           percentile_cont(0.95) within group (order by total_ms) as p95_ms
      from llm_calls
     where op in ('chat_plan', 'chat_turn')
       and status = 'ok'
       and created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by op
     order by 1 nulls first, 2
  `);

  return rowsOf(result).map((r) => ({
    bucket: r.bucket === null || r.bucket === undefined ? null : String(r.bucket),
    op: String(r.op) as (typeof CHAT_OPS)[number],
    calls: num(r.calls),
    p50Ms: numOrNull(r.p50_ms),
    p95Ms: numOrNull(r.p95_ms),
  }));
}

// ---------------------------------------------------------------------------
// P8 -- runHealth: the two silences that look identical from inside the room
// ---------------------------------------------------------------------------

export type RunStatusRow = {
  status: RunStatus;
  runs: number;
  /** Unfinished runs whose lease expired more than fifteen minutes ago. Some of these
   *  are ordinary — the querent closed the tab, and the run is reclaimed when they come
   *  back. What matters is whether the number accumulates day over day. */
  stuck: number;
};

export type RunHealth = {
  statuses: RunStatusRow[];
  /** Over `done` runs only. */
  terminalRuns: number;
  /** `plan_source = 'fallback'`: `validatePlan` refused the model's answer, or the call
   *  failed, and F2's deterministic fallback ran. */
  fallbackPlans: number;
  beatsPlanned: number;
  bubbles: number;
};

/**
 * **The only place a dropped beat and a deliberate silence can be told apart.**
 *
 * `C-R7`: there is no error bubble in this release — a failure is silence. So from
 * inside the room, a beat that failed validation twice and a director that decided
 * nobody should answer look **exactly the same**. This panel is the difference.
 *
 * ── `beats_planned - bubbles` OVER `done` RUNS IS EXACT, AND NEEDS NO COLUMN ──
 *
 * `C-D6` consequence 3 is what makes it exact: **a beat shed at the chat ceiling
 * leaves the run `running` with beats remaining**, so it is never in this population.
 * A `done` run with fewer bubbles than beats lost them to two failed validations.
 *
 * One caveat the arithmetic carries and the panel states: `[R19]` grants **one beat
 * two bubbles**, so a `done` run may have MORE bubbles than beats. The difference is
 * therefore a signed quantity and the page clamps at zero rather than reporting a
 * negative drop — the alternative is a "beats dropped: −3" that reads as a bug in the
 * dashboard rather than as a reader who had more to say.
 *
 * `plan_source` is the one column F7 asked F1 for (reconciliation §2.2) and it is the
 * only way to see `validatePlan`'s refusal rate: F2's fallback is never zero-beat and
 * is otherwise indistinguishable from a real plan.
 */
export async function runHealth(db: DbOrTx, range: Range): Promise<RunHealth> {
  if (!usable(range)) {
    return { statuses: [], terminalRuns: 0, fallbackPlans: 0, beatsPlanned: 0, bubbles: 0 };
  }

  const statusResult = await db.execute(sql`
    select status,
           count(*) as runs,
           count(*) filter (
             where status in ('pending', 'planning', 'running')
               and (lease_until is null or lease_until < now() - interval '15 minutes')
           ) as stuck
      from chat_runs
     where created_at >= ${range.from}::date
       and created_at <  (${range.to}::date + 1)
     group by 1
     order by 1
  `);

  const dropResult = await db.execute(sql`
    select count(*)                                                 as terminal_runs,
           count(*) filter (where r.plan_source = 'fallback')        as fallback_plans,
           coalesce(sum(coalesce(jsonb_array_length(r.beats -> 'beats'), 0)), 0) as beats_planned,
           coalesce(sum(m.bubbles), 0)                               as bubbles
      from chat_runs r
      left join lateral (
        select count(*) as bubbles
          from chat_messages x
         where x.run_id = r.id and x.author <> 'user'
      ) m on true
     where r.status = 'done'
       and r.created_at >= ${range.from}::date
       and r.created_at <  (${range.to}::date + 1)
  `);

  const drop = rowsOf(dropResult)[0] ?? {};
  return {
    statuses: rowsOf(statusResult).map((r) => ({
      status: String(r.status) as RunStatus,
      runs: num(r.runs),
      stuck: num(r.stuck),
    })),
    terminalRuns: num(drop.terminal_runs),
    fallbackPlans: num(drop.fallback_plans),
    beatsPlanned: num(drop.beats_planned),
    bubbles: num(drop.bubbles),
  };
}

// ---------------------------------------------------------------------------
// /admin/users/[id] -- counts and no text ([R15])
// ---------------------------------------------------------------------------

export type ChatSummaryForAdmin = {
  /** One row per author that has ever written in this room. **A count and two dates;
   *  no body, no snippet, no length.** */
  byAuthor: { author: ChatAuthor; messages: number; firstAt: string | null; lastAt: string | null }[];
  runsByTrigger: { trigger: RunTrigger; runs: number }[];
  runsByStatus: { status: RunStatus; runs: number }[];
  /** This person's own proactive reply rate, **from the same function P1 uses** — one
   *  definition, so the fleet panel and the per-user row cannot disagree. */
  reply: ReplyRateRow[];
  /** The throttle's own state. This group is the operationally useful half and it
   *  contains no text at all: it answers *"is the throttle set right for this
   *  person"*. `null` when the thread has never been opened. */
  thread: {
    lastReadAt: string | null;
    lastUserMessageAt: string | null;
    lastReaderMessageAt: string | null;
    lastProactiveAt: string | null;
    proactiveCountToday: number;
    /** **A `'YYYY-MM-DD'` STRING, NEVER A `Date`** — the querent's calendar day. */
    proactiveCountDate: string | null;
    utcOffsetMinutes: number | null;
  } | null;
};

/**
 * One person's room, **as counts and timestamps** (`[R15]`, roadmap Q4 answered
 * *counts and no text*).
 *
 * ── WHY NOT AN AUDITED REVEAL, WHICH IS WHAT `A-D16` BUILT FOR THE ANSWERS ──
 *
 * A chat log is *"the six onboarding answers plus everything the querent volunteered
 * afterwards"* — and by `C-D8` the readers actively solicit those answers back into
 * the conversation, so the transcript contains them **spoken aloud, in context, with
 * follow-up questions attached.** `A-D16`'s one-key-per-request reveal was designed
 * for *a thing you read ONE of*: six answers means at most six audit rows, while one
 * exchange in a conversation would be two hundred. An audit trail that records two
 * hundred reads for one act of reading is either noise the operator scrolls past or a
 * lie about intent.
 *
 * There is also an asymmetry that cuts the other way from the obvious one:
 * `onboarding_answers.answer_text` is AES-256-GCM encrypted at rest and one module
 * decrypts it. **`chat_messages.body` is plaintext.** The protection there is that
 * nothing reads it — a property of the code, not of the data — and a reveal component
 * is the code that changes it.
 *
 * **No `admin_access_log` row is written, because nothing is revealed.** That matches
 * the existing ruling that the user LIST page has no `resource` value.
 *
 * *Option B′ — one **run** per audited reveal — is recorded in the plan as the honest
 * unit if text is ever wanted, and is deliberately not built.*
 */
export async function chatSummaryForAdmin(
  db: DbOrTx,
  userId: string,
): Promise<ChatSummaryForAdmin> {
  const [authorResult, triggerResult, statusResult, threadResult] = await Promise.all([
    db.execute(sql`
      select author,
             count(*)                                                          as messages,
             to_char(min(created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as first_at,
             to_char(max(created_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_at
        from chat_messages
       where user_id = ${userId}::uuid
       group by 1
       order by 1
    `),
    db.execute(sql`
      select trigger, count(*) as runs
        from chat_runs
       where user_id = ${userId}::uuid
       group by 1
       order by 1
    `),
    db.execute(sql`
      select status, count(*) as runs
        from chat_runs
       where user_id = ${userId}::uuid
       group by 1
       order by 1
    `),
    db.execute(sql`
      select to_char(last_read_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')           as last_read_at,
             to_char(last_user_message_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')   as last_user_message_at,
             to_char(last_reader_message_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_reader_message_at,
             to_char(last_proactive_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')      as last_proactive_at,
             proactive_count_today,
             proactive_count_date::text as proactive_count_date,
             utc_offset_minutes
        from chat_threads
       where user_id = ${userId}::uuid
    `),
  ]);

  /*
   * The per-user reply rate reuses P1 over an all-time range, filtered to this person
   * in TypeScript rather than in a second SQL statement. **One definition of the
   * measurement**, which is the same trade `fleetRollup` makes: a hand-tuned per-user
   * variant is a second place for `[F7-3]`'s settled-window rule to be got wrong.
   */
  const text = (v: unknown) => (v === null || v === undefined ? null : String(v));
  const threadRow = rowsOf(threadResult)[0];

  return {
    byAuthor: rowsOf(authorResult).map((r) => ({
      author: String(r.author) as ChatAuthor,
      messages: num(r.messages),
      firstAt: text(r.first_at),
      lastAt: text(r.last_at),
    })),
    runsByTrigger: rowsOf(triggerResult).map((r) => ({
      trigger: String(r.trigger) as RunTrigger,
      runs: num(r.runs),
    })),
    runsByStatus: rowsOf(statusResult).map((r) => ({
      status: String(r.status) as RunStatus,
      runs: num(r.runs),
    })),
    reply: await proactiveReplyRateForUser(db, userId),
    thread: threadRow
      ? {
          lastReadAt: text(threadRow.last_read_at),
          lastUserMessageAt: text(threadRow.last_user_message_at),
          lastReaderMessageAt: text(threadRow.last_reader_message_at),
          lastProactiveAt: text(threadRow.last_proactive_at),
          proactiveCountToday: num(threadRow.proactive_count_today),
          proactiveCountDate: text(threadRow.proactive_count_date),
          utcOffsetMinutes:
            threadRow.utc_offset_minutes === null || threadRow.utc_offset_minutes === undefined
              ? null
              : num(threadRow.utc_offset_minutes),
        }
      : null,
  };
}

/**
 * P1's measurement for one person, over their whole history.
 *
 * **THE SAME PREDICATE, AND THE SETTLED-WINDOW RULE IS RESTATED RATHER THAN RELAXED**
 * (`[F7-3]`): a run whose 24 hours have not elapsed is in neither the numerator nor the
 * denominator here either. On one person's page the population is small enough that
 * counting an open window would swing the rate by tens of points.
 *
 * Not exported: `/admin/users/[id]` reaches it through `chatSummaryForAdmin`, which is
 * the one composite that page's `withAdminRead` calls.
 */
async function proactiveReplyRateForUser(db: DbOrTx, userId: string): Promise<ReplyRateRow[]> {
  const result = await db.execute(sql`
    with delivered as (
      select r.id, r.trigger, r.user_id, max(m.created_at) as last_bubble_at
        from chat_runs r
        join chat_messages m on m.run_id = r.id and m.author <> 'user'
       where r.trigger <> 'user_message'
         and r.user_id = ${userId}::uuid
       group by r.id, r.trigger, r.user_id
    ),
    judged as (
      select d.trigger,
             (d.last_bubble_at + interval '24 hours') <= now() as settled,
             exists (
               select 1 from chat_messages u
                where u.user_id = d.user_id
                  and u.author  = 'user'
                  and u.created_at >  d.last_bubble_at
                  and u.created_at <= d.last_bubble_at + interval '24 hours'
             ) as replied
        from delivered d
    )
    select trigger,
           count(*) filter (where settled)             as delivered,
           count(*) filter (where settled and replied) as replied,
           count(*) filter (where not settled)         as pending
      from judged
     group by trigger
     order by trigger
  `);

  return rowsOf(result).map((r) => ({
    trigger: String(r.trigger) as RunTrigger,
    delivered: num(r.delivered),
    replied: num(r.replied),
    pending: num(r.pending),
  }));
}

// ---------------------------------------------------------------------------
// The composite
// ---------------------------------------------------------------------------

export type ChatRollup = {
  range: Range;
  reply: ReplyRateRow[];
  runs: RunDayRow[];
  beats: BeatBucketRow[];
  cast: CastRow[];
  intents: IntentRow[];
  tokens: ChatTokenRow[];
  callTotals: ChatCallTotals[];
  latency: ChatLatencyRow[];
  health: RunHealth;
  /**
   * M4, **UNFILTERED**, and it is the denominator of the two fleet-share tiles.
   *
   * *"Porsi armada"* is the chat against **every** model call — moderation, the gist,
   * the Insight button on this very dashboard — and not against readings. That is
   * stated on the panel, because the number a reader assumes is *"share of readings"*
   * and it is not that. **`callsByOp` also buckets on `created_at`**, so its window is
   * the same one the chat series use and the fraction is over one calendar.
   */
  fleetByOp: OpTotals[];
  /** M5, filtered to `CHAT_OPS` — the chat's own worst rolling five hours. */
  chatPeak: PeakWindow | null;
  /** M5, unfiltered — the same number `/admin`'s hero prints, from the same query.
   *  **If the two disagree, one of them is wrong**, which is what the panel says. */
  fleetPeak: PeakWindow | null;
};

/**
 * How many statements `chatRollup` issues. **The test asserts this exact number**, so
 * a later "just one more panel" is visible as a regression rather than as a slightly
 * slower page nobody measures.
 *
 * Thirteen: eight single-statement chat functions, `runHealth`'s two, A3's `callsByOp`
 * for the fleet-share denominator, and `peakWindow5h` twice — once filtered to
 * `CHAT_OPS` and once not. **Those last two are one function called twice rather than a
 * second copy of the rolling-window frame** (F7-Q3): the two meters sit side by side on
 * one card, and a divergence between two spellings of that query would read as a
 * finding rather than as a bug.
 */
export const CHAT_ROLLUP_QUERIES = 13;

/**
 * Everything `/admin/chat` needs for one range, in one read.
 *
 * `fleetRollup`'s shape and its reasons: **not cached** (a stale aggregate is worse
 * than a slow one on a surface with one reader), composed from the metric functions
 * rather than re-writing their SQL, and issued concurrently inside the caller's
 * read-only transaction so postgres.js pipelines them.
 *
 * **Every admin request is a COLD one** — one admin, no warm instance — so the first
 * query of a session also wakes a suspended Neon compute. That is why the count above
 * is asserted.
 */
export async function chatRollup(db: DbOrTx, range: Range): Promise<ChatRollup> {
  const [
    reply,
    runs,
    beats,
    cast,
    intents,
    tokens,
    callTotals,
    latency,
    health,
    fleetByOp,
    chatPeak,
    fleetPeak,
  ] = await Promise.all([
    proactiveReplyRate(db, range),
    runsByUtcDay(db, range),
    beatHistogram(db, range),
    castByTarget(db, range),
    beatIntents(db, range),
    chatTokensByUtcDay(db, range),
    chatCallTotals(db, range),
    chatLatency(db, range),
    runHealth(db, range),
    callsByOp(db, range),
    peakWindow5h(db, range, CHAT_OPS),
    peakWindow5h(db, range),
  ]);

  return {
    range,
    reply,
    runs,
    beats,
    cast,
    intents,
    tokens,
    callTotals,
    latency,
    health,
    fleetByOp,
    chatPeak,
    fleetPeak,
  };
}
