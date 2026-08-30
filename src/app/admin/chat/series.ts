/**
 * `/admin/chat`'s rows -> chart props. **PURE, and THE ONE FILE A QUERY SHAPE CHANGE
 * TOUCHES.** F7, v0.7.0.
 *
 * `src/app/admin/metrics.ts`'s role for this page, for its reasons: I-15 forbids
 * `src/components/chart/**` from importing `@/lib/db/**` *even as `import type`*, so
 * the components take structural view shapes and something has to map one to the
 * other. Concentrating that here is why `npm test` can exercise every fold below with
 * **no database at all** — which matters more on this page than on either existing
 * one, because the reply rate is the release's own scorecard and every one of its
 * edges is an arithmetic edge.
 *
 * ── A RATE WITH NO DENOMINATOR IS `null`, NEVER `0` ────────────────────────
 *
 * `periodDelta`'s ruling, applied four times below: the reply rate, the silence rate,
 * the ask share and the top reader's share all return `null` when nothing was
 * measured. `0%` and *"nothing to measure"* are different claims and an operator would
 * act on the first. **On this page that matters most for the silence rate**, because
 * `C-R6` makes a zero silence rate a FINDING — *"a rate of zero means the director is
 * not really deciding"* — and a fold that printed `0%` for an empty range would
 * manufacture that finding on every first visit.
 *
 * ── AND THE DENSE SERIES ARE BUILT FROM THE RANGE, NOT FROM THE ROWS ───────
 *
 * `runsByUtcDay`, `chatTokensByUtcDay` and `chatLatency` group by two keys, so none of
 * them can be zero-filled per bucket in SQL — `tokensByBucketAndModel`'s precedent
 * exactly, where A3 leaves the rows sparse and `tokenSeries` enumerates the days. A
 * day with no runs is a `0` rather than a missing column, and a day with no measured
 * latency is a `null` rather than a `0`: **the first is a count and the second is a
 * measurement, and only one of them has a meaningful zero.**
 */
import type { Maybe } from '@/components/chart/types';
import { enumerateDays } from '@/lib/analytics/series';
import type { BeatIntent, RunStatus, RunTrigger } from '@/lib/chat/types';
import type {
  BeatBucketRow,
  CastRow,
  ChatLatencyRow,
  ChatTokenRow,
  IntentRow,
  ReplyRateRow,
  RunDayRow,
  RunHealth,
} from '@/lib/db/queries/admin/chat';
import {
  BEAT_BUCKETS,
  CHAT_OP_ORDER,
  INTENT_ORDER,
  STATUS_ORDER,
  TRIGGER_ORDER,
} from './slots';

/** The three readers, in `READER_SLOT`'s order. Spelled here rather than imported from
 *  `@/theme/chart` because this module maps DATA and the theme maps COLOUR; the page
 *  resolves the slot. */
export const READER_ORDER = ['thessaly', 'margaret', 'adrian'] as const;

/** `a / b`, or `null` when `b` is zero. The one place this page divides. */
function rate(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

function sum(values: readonly number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}

// ---------------------------------------------------------------------------
// P1 -- the reply rate
// ---------------------------------------------------------------------------

export type ReplyFold = {
  rows: {
    trigger: RunTrigger;
    delivered: number;
    replied: number;
    pending: number;
    /** `null` when nothing settled for this trigger. */
    rate: number | null;
  }[];
  delivered: number;
  replied: number;
  pending: number;
  /** The range-wide rate, over settled runs only (`[F7-3]`). */
  rate: number | null;
};

/**
 * `C-N2f` folded for the hero and the bars.
 *
 * **ROWS IN `TRIGGER_ORDER` AND NEVER IN RANK ORDER**, with `user_message` dropped
 * because it is not proactive — the query already excludes it, and this order is the
 * one the tables print. A trigger that fired zero proactive runs gets **no row**: a
 * bar of length zero under a trigger nobody used is furniture, and `M14`'s rule is to
 * render nothing until there is something.
 */
export function replyFold(rows: readonly ReplyRateRow[]): ReplyFold {
  const byTrigger = new Map(rows.map((r) => [r.trigger, r]));
  const ordered = TRIGGER_ORDER.filter((t) => t !== 'user_message')
    .map((trigger) => byTrigger.get(trigger))
    .filter((r): r is ReplyRateRow => r !== undefined)
    .map((r) => ({ ...r, rate: rate(r.replied, r.delivered) }));

  const delivered = sum(ordered.map((r) => r.delivered));
  const replied = sum(ordered.map((r) => r.replied));
  return {
    rows: ordered,
    delivered,
    replied,
    pending: sum(ordered.map((r) => r.pending)),
    rate: rate(replied, delivered),
  };
}

// ---------------------------------------------------------------------------
// P2 -- runs per day
// ---------------------------------------------------------------------------

export type RunFold = {
  buckets: string[];
  /** `trigger = 'user_message'`. */
  reactive: number[];
  /** The other four, summed. The split is in `byTrigger`, which the table prints. */
  proactive: number[];
  byTrigger: Record<RunTrigger, number[]>;
  totals: Record<RunTrigger, number>;
  total: number;
};

export function runFold(rows: readonly RunDayRow[], from: string, to: string): RunFold {
  const buckets = enumerateDays(from, to);
  const index = new Map(buckets.map((d, i) => [d, i]));
  const byTrigger = Object.fromEntries(
    TRIGGER_ORDER.map((t) => [t, buckets.map(() => 0)]),
  ) as Record<RunTrigger, number[]>;

  for (const r of rows) {
    const i = index.get(r.bucket);
    // A row outside the enumerated range is DROPPED rather than appended: the caller
    // enumerated the days it wants, and `zeroFill`'s rule is the same one.
    if (i === undefined) continue;
    byTrigger[r.trigger][i] += r.runs;
  }

  const proactive = buckets.map((_, i) =>
    TRIGGER_ORDER.filter((t) => t !== 'user_message').reduce((acc, t) => acc + byTrigger[t][i], 0),
  );
  const totals = Object.fromEntries(
    TRIGGER_ORDER.map((t) => [t, sum(byTrigger[t])]),
  ) as Record<RunTrigger, number>;

  return {
    buckets,
    reactive: byTrigger.user_message,
    proactive,
    byTrigger,
    totals,
    total: sum(Object.values(totals)),
  };
}

// ---------------------------------------------------------------------------
// P3 -- the beat histogram
// ---------------------------------------------------------------------------

export type BeatFold = {
  buckets: { bucket: number; runs: number; share: number }[];
  total: number;
  /** The `0` bucket over all terminal runs. **`null` for an empty range**, because a
   *  zero silence rate is the finding and must never be manufactured. */
  silence: number | null;
  /** **A LOWER BOUND, AND IT STAYS FLAGGED AS ONE.** The top bucket is `8+` since
   *  2026-08-30 and this treats it as exactly 8 — exact only while `CHAT_MAX_BEATS` is
   *  8. **Widening the bucket did not make the mean exact; it made it exact until the
   *  next raise**, and deleting this flag along with the widening is how it went stale
   *  the first time (it read `4+` through two cap raises). The mean is offered only as a
   *  companion to the distribution, never instead of it (roadmap §6.1's own wording). */
  mean: number | null;
};

export function beatFold(rows: readonly BeatBucketRow[]): BeatFold {
  const byBucket = new Map(rows.map((r) => [r.bucket, r.runs]));
  const total = sum(rows.map((r) => r.runs));
  const buckets = BEAT_BUCKETS.map((bucket) => {
    const runs = byBucket.get(bucket) ?? 0;
    return { bucket, runs, share: total > 0 ? runs / total : 0 };
  });

  return {
    // Every bucket renders, including the empty ones: a histogram missing its `0` bar
    // reads as no data, and the `0` bar is what the operator came for.
    buckets,
    total,
    silence: rate(byBucket.get(0) ?? 0, total),
    mean: total > 0 ? sum(buckets.map((b) => b.bucket * b.runs)) / total : null,
  };
}

// ---------------------------------------------------------------------------
// P4 -- the cast
// ---------------------------------------------------------------------------

export type CastFold = {
  rows: {
    author: (typeof READER_ORDER)[number];
    querent: number;
    reader: number;
    none: number;
    total: number;
  }[];
  total: number;
  /** The busiest reader's share of all bubbles. Over ~60% is uneven casting, which is
   *  a fact about the director rather than about the reader. */
  topShare: number | null;
  /** Reader-to-reader as a share of all bubbles. **Zero across a range means this is
   *  three monologues** (`C-N1a`, `C-R5`). */
  readerToReader: number | null;
};

export function castFold(rows: readonly CastRow[]): CastFold {
  const empty = () => ({ querent: 0, reader: 0, none: 0 });
  const byAuthor = new Map(READER_ORDER.map((a) => [a, empty()]));
  for (const r of rows) {
    const bucket = byAuthor.get(r.author as (typeof READER_ORDER)[number]);
    // An author with no slot is dropped rather than coloured `Other`: `READER_SLOT` has
    // three keys and a fourth reader is a decision somebody makes on purpose.
    if (!bucket) continue;
    bucket[r.target] += r.messages;
  }

  const folded = READER_ORDER.map((author) => {
    const b = byAuthor.get(author)!;
    return { author, ...b, total: b.querent + b.reader + b.none };
  }).filter((r) => r.total > 0);

  const total = sum(folded.map((r) => r.total));
  return {
    rows: folded,
    total,
    topShare: rate(Math.max(0, ...folded.map((r) => r.total)), total),
    readerToReader: rate(sum(folded.map((r) => r.reader)), total),
  };
}

// ---------------------------------------------------------------------------
// P5 -- beat intents
// ---------------------------------------------------------------------------

export type IntentFold = {
  rows: { intent: BeatIntent | null; beats: number; share: number }[];
  total: number;
  /** `C-N1d`'s number: the share of beats the director planned as a question back. */
  askShare: number | null;
};

/**
 * The six intents in `INTENT_ORDER`, then the unrecorded row.
 *
 * **`null` RENDERS AND IS NOT DROPPED.** A beat whose sheet carried no `intent` key is
 * a real beat, and if `[R9]`'s key ever moved every beat would land there — visible,
 * and visibly wrong, which is a much better failure than a panel that quietly reads as
 * empty. An intent the union does not know is folded into the same row for the same
 * reason.
 */
export function intentFold(rows: readonly IntentRow[]): IntentFold {
  const known = new Map<BeatIntent, number>();
  let unrecorded = 0;
  for (const r of rows) {
    if (r.intent !== null && (INTENT_ORDER as readonly string[]).includes(r.intent)) {
      known.set(r.intent, (known.get(r.intent) ?? 0) + r.beats);
    } else {
      unrecorded += r.beats;
    }
  }

  const total = sum(rows.map((r) => r.beats));
  const ordered: IntentFold['rows'] = INTENT_ORDER.map((intent) => ({
    intent: intent as BeatIntent,
    beats: known.get(intent as BeatIntent) ?? 0,
    share: total > 0 ? (known.get(intent as BeatIntent) ?? 0) / total : 0,
  }));
  if (unrecorded > 0) {
    ordered.push({ intent: null, beats: unrecorded, share: total > 0 ? unrecorded / total : 0 });
  }

  return { rows: ordered, total, askShare: rate(known.get('ask') ?? 0, total) };
}

// ---------------------------------------------------------------------------
// P6 -- tokens
// ---------------------------------------------------------------------------

export type ChatOp = (typeof CHAT_OP_ORDER)[number];

export type TokenFold = {
  buckets: string[];
  /** Tokens (input + output) per day, per op. The two are never averaged into one
   *  series — `C-D5`'s argument, and the reason the release spent two `LLMOp` values. */
  byOp: Record<ChatOp, number[]>;
  totals: Record<ChatOp, { calls: number; inputTokens: number; outputTokens: number; untokenized: number }>;
  calls: number;
  tokens: number;
  /** Calls whose provider reported nothing at all. **Rendered beside the total, never
   *  hidden** (A-D7). */
  untokenized: number;
};

export function tokenFold(rows: readonly ChatTokenRow[], from: string, to: string): TokenFold {
  const buckets = enumerateDays(from, to);
  const index = new Map(buckets.map((d, i) => [d, i]));
  const byOp = Object.fromEntries(CHAT_OP_ORDER.map((op) => [op, buckets.map(() => 0)])) as Record<
    ChatOp,
    number[]
  >;
  const totals = Object.fromEntries(
    CHAT_OP_ORDER.map((op) => [op, { calls: 0, inputTokens: 0, outputTokens: 0, untokenized: 0 }]),
  ) as TokenFold['totals'];

  for (const r of rows) {
    const i = index.get(r.bucket);
    if (i === undefined) continue;
    byOp[r.op][i] += r.inputTokens + r.outputTokens;
    totals[r.op].calls += r.calls;
    totals[r.op].inputTokens += r.inputTokens;
    totals[r.op].outputTokens += r.outputTokens;
    totals[r.op].untokenized += r.untokenized;
  }

  const all = Object.values(totals);
  return {
    buckets,
    byOp,
    totals,
    calls: sum(all.map((t) => t.calls)),
    tokens: sum(all.map((t) => t.inputTokens + t.outputTokens)),
    untokenized: sum(all.map((t) => t.untokenized)),
  };
}

export type FleetShare = {
  /** Chat calls over EVERY model call in the range. `null` when the fleet made none. */
  calls: number | null;
  /** Chat tokens over every model call's tokens. */
  tokens: number | null;
};

/**
 * The chat as a fraction of the whole fleet.
 *
 * **THE DENOMINATOR IS EVERY MODEL CALL, INCLUDING MODERATION, THE GIST AND THE
 * INSIGHT BUTTON ON THIS VERY DASHBOARD — and it is NOT "share of readings."** That is
 * the number a reader assumes and it is not this one, which is why the panel says so
 * out loud. Dividing anything here by *Bacaan selesai* is the arithmetic
 * `src/lib/admin/ops.ts` exists to forbid.
 *
 * The numerator comes from the chat's own rows rather than by filtering `fleetByOp`, so
 * that a mismatch between the two queries shows up as a share above 100% rather than as
 * a plausible number. Both filter on `created_at`, so the window is one calendar.
 */
export function fleetShare(
  chat: Pick<TokenFold, 'calls' | 'tokens'>,
  fleet: readonly { calls: number; inputTokens: number; outputTokens: number }[],
): FleetShare {
  const fleetCalls = sum(fleet.map((r) => r.calls));
  const fleetTokens = sum(fleet.map((r) => r.inputTokens + r.outputTokens));
  return { calls: rate(chat.calls, fleetCalls), tokens: rate(chat.tokens, fleetTokens) };
}

// ---------------------------------------------------------------------------
// P7 -- latency
// ---------------------------------------------------------------------------

export type LatencyFold = {
  buckets: string[];
  /** p95 per day, per op. **`null` STAYS `null`** — a day with no measured call is not
   *  a day of 0ms, and `TableSpec.emptyCell` prints an em dash for it. */
  p95: Record<ChatOp, Maybe[]>;
  /** The range-wide row per op, **as Postgres computed it over the whole population**.
   *  Never the mean of the daily figures: the mean of thirty p95s is not a p95, which
   *  is `ttftOverall`'s rule in a second place. */
  overall: Record<ChatOp, { calls: number; p50Ms: number | null; p95Ms: number | null }>;
};

export function latencyFold(rows: readonly ChatLatencyRow[], from: string, to: string): LatencyFold {
  const buckets = enumerateDays(from, to);
  const index = new Map(buckets.map((d, i) => [d, i]));
  const p95 = Object.fromEntries(
    CHAT_OP_ORDER.map((op) => [op, buckets.map(() => null as Maybe)]),
  ) as Record<ChatOp, Maybe[]>;
  const overall = Object.fromEntries(
    CHAT_OP_ORDER.map((op) => [op, { calls: 0, p50Ms: null, p95Ms: null }]),
  ) as LatencyFold['overall'];

  for (const r of rows) {
    if (r.bucket === null) {
      overall[r.op] = { calls: r.calls, p50Ms: r.p50Ms, p95Ms: r.p95Ms };
      continue;
    }
    const i = index.get(r.bucket);
    if (i === undefined) continue;
    p95[r.op][i] = r.p95Ms;
  }

  return { buckets, p95, overall };
}

// ---------------------------------------------------------------------------
// P8 -- run health
// ---------------------------------------------------------------------------

export type HealthFold = {
  statuses: { status: RunStatus; runs: number; stuck: number }[];
  total: number;
  /** `beats_planned - bubbles` over `done` runs, **clamped at zero**. `[R19]` grants
   *  one beat two bubbles, so the raw difference is a signed quantity — and a
   *  *"beat dijatuhkan: −3"* reads as a broken dashboard rather than as a reader who
   *  had two things to say. */
  dropped: number;
  /** The raw, unclamped difference. Kept so the panel's facts block can be honest
   *  about which side of zero it fell on without the tile printing a negative. */
  droppedRaw: number;
  fallbackPlans: number;
  /** `validatePlan`'s refusal rate: the share of terminal runs the director did not
   *  write. **`null` for an empty range.** */
  fallbackRate: number | null;
  stuck: number;
};

export function healthFold(health: RunHealth): HealthFold {
  const byStatus = new Map(health.statuses.map((s) => [s.status, s]));
  const statuses = STATUS_ORDER.map((status) => byStatus.get(status)).filter(
    (s): s is RunHealth['statuses'][number] => s !== undefined,
  );
  const droppedRaw = health.beatsPlanned - health.bubbles;

  return {
    statuses,
    total: sum(statuses.map((s) => s.runs)),
    dropped: Math.max(0, droppedRaw),
    droppedRaw,
    fallbackPlans: health.fallbackPlans,
    fallbackRate: rate(health.fallbackPlans, health.terminalRuns),
    stuck: sum(statuses.map((s) => s.stuck)),
  };
}
