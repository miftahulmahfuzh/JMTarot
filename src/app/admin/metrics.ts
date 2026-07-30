/**
 * A3's rows -> A4's chart props. **PURE, and THE ONE FILE AN A3 SHAPE CHANGE TOUCHES.**
 *
 * ── WHY THIS FILE EXISTS AT ALL ─────────────────────────────────────────────
 *
 * I-15 forbids `src/components/chart/**` from importing `@/lib/db/**`, *even as `import
 * type`* -- the V6 lesson, where `ReadingStatus` had to move to `@/data/types` because a
 * `clientBoundary`-style regex cannot see the `type` keyword. So the components take
 * structural view shapes, and something has to map one to the other. Concentrating that in
 * one pure module is what makes an A3 signature change a compile error in a single file
 * rather than eleven components, and it is why `npm test` can exercise every fold below with
 * no database at all.
 *
 * ── A3 SHIPPED DIFFERENT NAMES THAN A4's §10 ASKED FOR, AND THAT IS FINE ─────
 *
 * §10 requested `dailySeries`, `groupedTotals`, `windowCalls`, `heatCells` and `topUsers`.
 * A3's merged catalogue is `callsByUtcDay`, `callsByLocalDate`, `tokensByBucketAndModel`,
 * `callsByOp`, `peakWindow5h`, `readingsByLocalDate`, `activeUsers`, `modelsSeen`,
 * `userCostLeague` and `fleetRollup`. Neither plan was wrong -- A3's eleven tasks named their
 * own catalogue and reconciliation §8 bound it to eight rulings, none about A4's requested
 * names. **The adaptation is this file, which is what it was for.**
 *
 * Two shape differences that reach the screen are handled here explicitly:
 *
 *   1. **There is no hour-of-day query**, so §1.7's weekday x hour heatmap is a weekday x
 *      WEEK calendar heatmap folded from the daily series. See `weekdayHeat` and `copy.ts`.
 *   2. **`tokensByBucketAndModel` is per `(day, model)`**, not per day, because A-D7 prices
 *      per model per period -- so the input/output series has to be folded across models
 *      here, and the null-token counts summed rather than recomputed.
 *
 * ── A SPARSE SERIES IS AN ERROR, NOT A GAP TO FILL (Task 16) ─────────────────
 *
 * A3 zero-fills `callsByUtcDay`, `callsByLocalDate` and `readingsByLocalDate` in TypeScript
 * and asserts one row per calendar day. `assertDense` checks it and returns a REASON rather
 * than filling: **filling a gap invents data**, and a chart missing its left-hand side that
 * says nothing about it is the failure that survives review. `tokensByBucketAndModel` is
 * deliberately NOT zero-filled by A3 (it is grouped by model), so its fold produces the dense
 * series itself and says so.
 */
import type { LLMOp } from '@/lib/llm/types';
import type { LocalDateRow, OpTotals, TokenRow, UtcDayRow } from '@/lib/db/queries/admin/metrics';
import type { LeagueRow } from '@/lib/db/queries/admin/users';
import { OP_ORDER, OTHER, foldOps, type FoldedOp } from '@/lib/analytics/rollup';
import { enumerateDays, weekStart } from '@/lib/analytics/series';
import { OTHER_SLOT } from '@/theme/chart';
import type { Maybe } from '@/components/chart/types';

// ---------------------------------------------------------------------------
// Density
// ---------------------------------------------------------------------------

export type Density = { dense: true } | { dense: false; expected: number; got: number };

/**
 * Does this series have exactly one row per calendar day in the range, in order?
 *
 * **A4 DOES NOT FILL GAPS.** A3 promises dense output and zero-fills it in TypeScript; if
 * that promise ever breaks -- a query rewritten to group in SQL, a `generate_series` that
 * hands back `timestamptz` -- the honest response is `ChartError`, because a filled gap is a
 * measurement nobody made and a chart drawn over it cannot be told from a correct one.
 */
export function assertDense(
  buckets: readonly string[],
  from: string,
  to: string,
): Density {
  const days = enumerateDays(from, to);
  /*
   * **AN UNUSABLE RANGE IS NOT DENSE, AND THE FIRST VERSION SAID IT WAS.** `enumerateDays`
   * returns `[]` for a reversed, malformed or over-retention range, and an empty `buckets`
   * then matched it exactly -- so a reversed range reported `dense: true` and the page
   * rendered an EMPTY CHART AS IF IT WERE CORRECT. `parseRange` refuses such a range before
   * a query runs, so this is the belt rather than the braces; it is also the only one of the
   * two that a hand-written call site could bypass.
   */
  if (days.length === 0) return { dense: false, expected: 0, got: buckets.length };
  if (days.length === buckets.length && days.every((d, i) => d === buckets[i])) {
    return { dense: true };
  }
  return { dense: false, expected: days.length, got: buckets.length };
}

// ---------------------------------------------------------------------------
// Daily series
// ---------------------------------------------------------------------------

/** The calls-per-UTC-day series, for the area chart and the trajectory. */
export function callSeries(rows: readonly UtcDayRow[]): Maybe[] {
  return rows.map((r) => r.calls);
}

/** The querent-day series, for anything about people rather than about quota. */
export function localCallSeries(rows: readonly LocalDateRow[]): Maybe[] {
  return rows.map((r) => r.calls);
}

export type TokenSeries = {
  buckets: string[];
  input: Maybe[];
  output: Maybe[];
  /** Calls whose provider reported no tokens at all, summed over the range.
   *  **Rendered beside the series, never hidden.** */
  nullInputCalls: number;
  nullOutputCalls: number;
  /** Numerator of the cache-hit rate. */
  cacheReadTokens: number;
  /**
   * Denominator: input tokens **of rows that reported a cache figure**, never the
   * whole `input` series. `0` means nothing in this range was measured, which the
   * page must render as an empty state rather than as a 0% hit rate -- those are
   * different claims and only one of them is true.
   */
  cachedBasisTokens: number;
};

/**
 * Fold `(day, model)` token rows into two daily series.
 *
 * **THE FOLD IS ACROSS MODELS AND THE NULL COUNTS ARE SUMMED, NOT RECOMPUTED.** A3 groups by
 * model because *a single `sum(output_tokens)` for a day that spanned two models is
 * unpriceable*; the CHART does not price anything, so it may sum -- but the half-blindness
 * has to survive the fold, or a token chart invites the reader to conclude the app has no
 * prompt cost. `nullInputCalls` is what `copy.ts` prints under the chart.
 *
 * The bucket list is built from the RANGE and not from the rows, so a day with no calls at all
 * is a 0 rather than a missing column -- which is the same zero-fill A3 does for its own
 * series, applied to the one series A3 could not zero-fill.
 */
export function tokenSeries(rows: readonly TokenRow[], from: string, to: string): TokenSeries {
  const days = enumerateDays(from, to);
  const input = new Map<string, number>();
  const output = new Map<string, number>();
  let nullInputCalls = 0;
  let nullOutputCalls = 0;
  let cacheReadTokens = 0;
  let cachedBasisTokens = 0;

  for (const r of rows) {
    input.set(r.bucket, (input.get(r.bucket) ?? 0) + r.inputTokens);
    output.set(r.bucket, (output.get(r.bucket) ?? 0) + r.outputTokens);
    nullInputCalls += r.nullInputCalls;
    nullOutputCalls += r.nullOutputCalls;
    /*
     * TWO SEPARATE SUMS, AND THEY ARE NOT NUMERATOR-OVER-`input`. `cachedBasisTokens`
     * counts only the input tokens of rows that reported a cache figure at all, which
     * is what keeps the rate honest across the 2026-07-30 boundary -- before it, every
     * streamed row has NULL here and a real `input_tokens` on the buffered path.
     */
    cacheReadTokens += r.cacheReadTokens;
    cachedBasisTokens += r.cachedBasisTokens;
  }

  return {
    buckets: days,
    input: days.map((d) => input.get(d) ?? 0),
    output: days.map((d) => output.get(d) ?? 0),
    nullInputCalls,
    nullOutputCalls,
    cacheReadTokens,
    cachedBasisTokens,
  };
}

/** The last `n` values, for a sparkline. **Trimmed here and not in the component**, so a tile
 *  and its table row cannot disagree about which days they describe. */
export function tail(values: readonly Maybe[], n = 12): Maybe[] {
  return values.slice(Math.max(0, values.length - n));
}

// ---------------------------------------------------------------------------
// The op fold
// ---------------------------------------------------------------------------

export type FoldedRow = { op: FoldedOp; value: number; slot: number };

/**
 * Top-3 + Other, with a slot per row (R11).
 *
 * **NOT "4 + OTHER"**: the categorical palette is four wide and **slot 4 IS Other**, so the
 * roadmap's *"folded to 4 + Other"* needed five slots and there are four.
 *
 * A3's `foldOps` returns the kept rows in `OP_ORDER` and never in rank order, so a change in
 * relative magnitude does not reshuffle a legend. What it cannot promise -- and says so -- is
 * a fixed entity->slot map: with nine entities and four slots **a folded op chart's colours are
 * POSITIONAL and stable only while the top-3 SET is stable.** That is why §5.3 makes the nine
 * ops a TABLE, and why this fold exists only for a form where ≤4 series carry mandatory direct
 * labels anyway. Not used by either shipped page's `op` card, which is a table; kept because
 * the fold is the tested thing and the next chart that needs it should not re-derive it.
 */
export function foldedOps(rows: readonly { op: LLMOp; value: number }[]): FoldedRow[] {
  return foldOps(rows).map((r, i) => ({
    ...r,
    slot: r.op === OTHER ? OTHER_SLOT : i,
  }));
}

/** Every op that ran, in `OP_ORDER`, with the ones that did not run omitted. For the table:
 *  nine rows of which three are zero reads as a broken query, and `OP_ORDER` is what keeps
 *  the surviving rows in a stable order rather than a rank that moves between page loads. */
export function opRows(rows: readonly OpTotals[]): OpTotals[] {
  const byOp = new Map(rows.map((r) => [r.op, r]));
  return OP_ORDER.map((op) => byOp.get(op)).filter((r): r is OpTotals => r !== undefined);
}

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

/**
 * A cost figure and its denominator, as **one required object**.
 *
 * A-D7: *a cost is never quoted over an incomplete denominator.* Returning them together is
 * what makes that mechanical -- a caller cannot render the dollar figure and forget the
 * caveat, because there is no shape in which the figure arrives alone.
 *
 * `usd: null` is the honest state today: `NOTIONAL_MODEL` is deliberately unset, because
 * nobody has read a current price page for the fallback provider and `prices.ts`'s own rule is
 * that nothing unverified enters it. The tile prints "belum berharga" rather than `0`, and a
 * zero would silently understate the bill.
 */
export type CostFigure = { usd: number | null; unpricedCalls: number };

// ---------------------------------------------------------------------------
// The calendar heatmap
// ---------------------------------------------------------------------------

export type HeatFold = {
  cells: { row: number; col: number; value: number; day: string; week: string }[];
  /** ISO week-start dates, in order -- the column axis. */
  weeks: string[];
  max: number;
};

/**
 * Weekday x ISO week, folded from a dense daily series.
 *
 * ── THIS IS §1.7's HONEST HALF, AND IT NEEDED NO NEW QUERY ──────────────────
 *
 * §1.7 established that the querent's local HOUR is not derivable from `llm_calls`
 * (`local_date` has no time; `created_at` is UTC) and that **weekday from `local_date` is
 * exact, with no zone involved.** A3 shipped no hour query and `queries/admin/**` is A3's, so
 * the hour axis is a stated gap and this is the axis that was never an approximation.
 *
 * `weekStart` is A3's, and using it rather than `getUTCDay()` is load-bearing: its own header
 * records that **the naive version puts Sunday in the following week**, which is wrong for one
 * day in seven and invisible for about a month -- long enough that the first person to notice
 * is looking at a weekly chart wondering why the last column is short.
 *
 * `row` is 0=Monday, matching `weekStart`'s `(dow + 6) % 7`, and `copy.heatWeekdays` is in
 * that order.
 */
export function weekdayHeat(
  buckets: readonly string[],
  values: readonly Maybe[],
): HeatFold {
  const weeks: string[] = [];
  const seen = new Set<string>();
  const cells: HeatFold['cells'] = [];
  let max = 0;

  for (let i = 0; i < buckets.length; i += 1) {
    const day = buckets[i];
    const week = weekStart(day);
    if (week === '') continue;
    if (!seen.has(week)) {
      seen.add(week);
      weeks.push(week);
    }
    const t = new Date(`${day}T00:00:00Z`).getTime();
    if (Number.isNaN(t)) continue;
    // 0 = Monday, as `weekStart` computes it. JavaScript's Sunday-is-0 is the bug source.
    const row = (new Date(t).getUTCDay() + 6) % 7;
    const v = values[i];
    const value = v === null || !Number.isFinite(v) ? 0 : v;
    if (value > max) max = value;
    cells.push({ row, col: weeks.indexOf(week), value, day, week });
  }

  return { cells, weeks, max };
}

// ---------------------------------------------------------------------------
// The league
// ---------------------------------------------------------------------------

export type LeagueEntry = LeagueRow & { tokens: number };

/**
 * The cost league, biggest first, capped.
 *
 * A3 returns per `(user, model)` sorted by `output_tokens desc`. **The `tokens` total is
 * input + output**, which is what the table's one number column shows -- two columns of
 * tokens per row is four numbers a reader has to add, and the split is already on the token
 * chart.
 *
 * **A `null` `userId` IS A REAL ROW AND IS NEVER DROPPED.** `llm_calls.user_id` is `on delete
 * set null`, so a hard-deleted user's history survives with the attribution gone -- and the
 * tokens were still spent. Dropping it would make the league's total disagree with the KPI
 * tile's, which is how a dashboard loses its reader.
 */
export function league(rows: readonly LeagueRow[], limit = 10): LeagueEntry[] {
  return rows
    .map((r) => ({ ...r, tokens: r.inputTokens + r.outputTokens }))
    .sort((a, b) => b.tokens - a.tokens || (a.userId ?? '').localeCompare(b.userId ?? ''))
    .slice(0, limit);
}
