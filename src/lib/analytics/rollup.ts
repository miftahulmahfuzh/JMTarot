/**
 * The folds. **PURE: no handle, no database, no `server-only`, no `process.env`.**
 *
 * A3, v0.5.0. `src/lib/db/queries/admin/rollup.ts` is the composite QUERY; this file is
 * what folds what that query returned. **The duplicate name is not duplication** --
 * `queries/contract.test.ts` asserts *"the handle is the first parameter of every
 * exported function"* over every file matching `/queries/`, and **a pure fold has no
 * handle to take.** Same wall W3 hit with the Lotus cache, W5 with `windowBounds` and
 * V6 with `history/dates.ts`; same resolution, and the precedent is `origin.ts` /
 * `keys.ts` / `lines.ts` -- *this codebase separates the pure part from the part that
 * touches the world, and the reason is always that the pure part is what tests can
 * reach.*
 *
 * ── THE NINE `op` VALUES ARE ORDERED HERE, AND A TENTH IS A COMPILE ERROR ────
 *
 * A2 owns the value set and exports `LLMOp` as a TYPE from `@/lib/llm/types`. It does
 * **not** export the nine as a value, and A3 may not add one: §6 assigns
 * `src/lib/llm/types.ts` to A2, and an unlisted edit to a shared file is a
 * reconciliation defect. So `OP_ORDER` is declared here **with a type-level
 * exhaustiveness guard** -- `_MissingOps` fails to compile the moment A2's union grows
 * a value this array does not name, which is stronger than the runtime `includes()`
 * check `callClass.test.ts` performs and costs nothing at runtime.
 *
 * Roadmap seam 3 in one line: **A3 groups by `op` and never invents a tenth value or
 * an alias.** `'Other'` below is not a tenth `op` -- it is a fold marker with its own
 * type, which is why it is spelled with a capital and cannot be assigned to `LLMOp`.
 */
import type { LLMOp } from '@/lib/llm/types';

/**
 * **THE THIRTEEN**, in the order a chart or a legend renders them. (This line said
 * *"The ten"* over an eleven-member array from 2026-07-31 until v0.7.0 — one of the
 * three stale op counts reconciliation `[R13]` found in prose. **The count is written
 * out rather than deleted because the boundary below is what a reader needs, and a
 * number that is checkable is what makes the boundary checkable.**) **Not by rank** -- an order
 * that changes with the data reads as the data changing, which is the same reason M4's
 * SQL breaks its `calls desc` tie on `op` and `topCardAllTime` breaks its on `card_id`.
 *
 * The order is the request's own shape: what a reading costs, in the order a reading
 * incurs it, then the two background generators, then the two translation passes.
 *
 * **THE LAST FOUR HAVE NO QUERENT BEHIND THEM, AND THAT IS WHY THEY ARE LAST.**
 * `insight` arrived with A7 on 2026-07-31 and `blog_format` the same day with the markdown
 * editor; `chat_plan` and `chat_turn` arrived with v0.7.0's group chat on 2026-08-07.
 * Every value above them is incurred by somebody taking a reading, directly or in
 * its wake; these are incurred by the operator or by a room that keeps going when nobody
 * is looking at it. Keeping them at the end leaves the nine querent-side rows in the
 * shape they have always had, so a table that grew a row does not also look reordered.
 *
 * **A COST-PER-READING DENOMINATOR MUST EXCLUDE ALL FOUR**, which is the reason the
 * boundary is visible in the order rather than only in a comment.
 *
 * **THE TWO CHAT OPS SIT AFTER THE TWO ADMIN ONES AND THE DISTINCTION IS WORTH A LINE**:
 * `insight` and `blog_format` measure the DASHBOARD and the CMS, and the chat pair
 * measures a product feature that simply is not a reading. All four are excluded from a
 * per-reading denominator for the same arithmetic reason and for two different product
 * ones. `chat_plan` before `chat_turn`, because a run plans before it speaks.
 */
export const OP_ORDER = [
  'moderation',
  'reading',
  'gist',
  'day_summary',
  'frequency',
  'lotus',
  'persona',
  'translation',
  'translation_repair',
  'insight',
  'blog_format',
  'chat_plan',
  'chat_turn',
] as const satisfies readonly LLMOp[];

/**
 * **THE GUARD.** If A2's union grows a value `OP_ORDER` does not name, `Exclude` stops
 * being `never` and this alias fails its constraint with the missing value in the
 * error message. Type-only: nothing is emitted.
 */
type AssertNever<T extends never> = T;
type _MissingOps = AssertNever<Exclude<LLMOp, (typeof OP_ORDER)[number]>>;

/** The fold marker. **Deliberately not assignable to `LLMOp`.** */
export const OTHER = 'Other' as const;
export type FoldedOp = LLMOp | typeof OTHER;

/**
 * A row of anything measured per `op`.
 *
 * Structural rather than imported from `queries/admin/**`, so this module keeps no
 * edge at all into the data layer -- the fold is testable against a literal.
 */
export type OpRow = { op: LLMOp; value: number };

/**
 * Where an entity sits in a fixed categorical palette. **COLOUR FOLLOWS THE ENTITY,
 * NEVER ITS RANK** (A-D11): filtering to two readers must not repaint the survivors,
 * so `adrian` is slot 2 whether or not `thessaly` is on screen.
 *
 * `-1` for an unknown entity, which a caller renders as "Other" rather than as slot 0.
 */
export function slotFor<T extends string>(entity: T, order: readonly T[]): number {
  return order.indexOf(entity);
}

/**
 * Keep the largest `keep - 1` ops and fold the rest into `'Other'`, which is always
 * last.
 *
 * **`keep = 4` IS TOP-3 + OTHER, NOT FOUR PLUS OTHER** (R11): the categorical palette
 * has four slots and slot 4 **is** Other, so "folded to 4 + Other" needed five slots
 * and there are four.
 *
 * ── WHAT THIS FOLD CAN AND CANNOT PROMISE ABOUT COLOUR ──────────────────────
 *
 * The kept rows come back in **`OP_ORDER`, never in rank order**, so a change in
 * relative magnitude does not reshuffle a legend. But with nine entities and four
 * slots there is no fixed entity→slot map, so **a folded op chart's colours are
 * POSITIONAL and are only stable while the top-3 SET is stable.** That is not a
 * defect being hidden -- it is why roadmap §5.3 makes the nine ops a **table** and why
 * this fold exists for a stacked bar, where ≤4 series carry mandatory direct labels
 * anyway. Use `slotFor` with a fixed order for the entity sets that fit (three
 * readers, three services, two token directions); use this for the ones that do not.
 *
 * A row whose `value` is not finite is dropped rather than poisoning the sum -- the
 * same reason `forecast()` refuses a `NaN`.
 */
export function foldOps(
  rows: readonly OpRow[],
  keep = 4,
): { op: FoldedOp; value: number }[] {
  const clean = rows.filter((r) => Number.isFinite(r.value));
  const byOp = new Map<LLMOp, number>();
  for (const r of clean) byOp.set(r.op, (byOp.get(r.op) ?? 0) + r.value);

  const top = Math.max(0, keep - 1);
  // Ranked ONLY to choose the survivors. The tie is broken on `OP_ORDER` so the
  // choice is deterministic between two ops with equal values.
  const survivors = new Set(
    [...byOp.entries()]
      .sort((a, b) => b[1] - a[1] || OP_ORDER.indexOf(a[0]) - OP_ORDER.indexOf(b[0]))
      .slice(0, top)
      .map(([op]) => op),
  );

  const out: { op: FoldedOp; value: number }[] = [];
  let other = 0;
  for (const op of OP_ORDER) {
    const value = byOp.get(op);
    if (value === undefined) continue;
    if (survivors.has(op)) out.push({ op, value });
    else other += value;
  }
  // `'Other'` appears only when something was folded into it -- an empty Other slot is
  // a legend entry for nothing, and V5's M14 rule is that an empty panel wearing a dot
  // IS the empty state.
  if (other > 0) out.push({ op: OTHER, value: other });
  return out;
}

/**
 * One `(model, day)` group of the ledger, as `callTotals` returns it.
 *
 * Structural, so `CallTotals` from `queries/admin/calls.ts` is assignable without this
 * module importing `@/lib/db/**`.
 */
export type PriceableRow = {
  model: string;
  localDate: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Calls whose provider reported no tokens at all. A2's `untokenized`. */
  untokenized: number;
};

/** A2's `priceFor`, structurally. Taken as an ARGUMENT so the fold is testable at a
 *  price table the test invents -- `PRICES` ships one row per model, so a test of the
 *  shipped table could not exercise a missing model at all. */
export type PriceLookup = (
  model: string,
  on: string,
) => { inputPerMTok: number; outputPerMTok: number } | null;

export type PriceRollup = {
  /**
   * **`null`, NEVER `0`, WHEN NOTHING COULD BE PRICED.** A zero silently understates
   * the bill; a null renders as "unpriced" and gets fixed (A-D7).
   */
  costUsd: number | null;
  /** Calls that contributed to `costUsd`. */
  pricedCalls: number;
  /**
   * **THE DENOMINATOR A10 REQUIRES BESIDE EVERY COST FIGURE.** The union of the two
   * counts below, and a cost quoted without it reads as complete when it is not.
   */
  unpricedCalls: number;
  /** Unpriced because **the model** has no price row for that day. */
  unpricedModelCalls: number;
  /**
   * Unpriced because **the provider reported no tokens**. On `LLM_PROVIDER=zai` this
   * is expected to be large -- `input_tokens` comes back as `0` and is stored NULL --
   * which is exactly why it may not be hidden. The two nulls mean different things
   * and a caller must not conflate them; `prices.ts` says the same at its `costUsd`.
   */
  untokenizedCalls: number;
  /** Which models could not be priced, so the fix is a five-minute one. */
  unpricedModels: string[];
};

/**
 * Price a set of `(model, day)` groups.
 *
 * **PRICED OVER SUMS, NEVER PER ROW.** The query groups first, so 100k ledger rows cost
 * a few dozen price lookups rather than 100k table scans.
 *
 * **A NULL PRICE CONTRIBUTES TO `unpricedCalls` AND NEVER TO `costUsd`.** If every
 * call is unpriced, `costUsd` is `null` rather than `0`.
 */
export function priceRollup(
  rows: readonly PriceableRow[],
  priceFor: PriceLookup,
): PriceRollup {
  let costUsd = 0;
  let pricedCalls = 0;
  let unpricedModelCalls = 0;
  let untokenizedCalls = 0;
  const unpricedModels = new Set<string>();

  for (const row of rows) {
    const price = priceFor(row.model, row.localDate);
    if (price === null) {
      // The WHOLE group is unpriceable; its untokenized calls are not counted a
      // second time, or the denominator would exceed the numerator's population.
      unpricedModelCalls += row.calls;
      unpricedModels.add(row.model);
      continue;
    }
    pricedCalls += row.calls - row.untokenized;
    untokenizedCalls += row.untokenized;
    costUsd +=
      (row.inputTokens * price.inputPerMTok + row.outputTokens * price.outputPerMTok) /
      1_000_000;
  }

  return {
    costUsd: pricedCalls > 0 ? costUsd : null,
    pricedCalls,
    unpricedCalls: unpricedModelCalls + untokenizedCalls,
    unpricedModelCalls,
    untokenizedCalls,
    unpricedModels: [...unpricedModels].sort(),
  };
}

/**
 * The change from one period to the next, as a **fraction** (`0.25` is +25%).
 *
 * **`null` WHEN `previous` IS 0 -- never `Infinity` and never `100%`.** A percentage
 * against a zero denominator is the most common wrong number on a dashboard, and the
 * two plausible wrong answers are both worse than an empty state: `Infinity` renders
 * as `∞%` and `100%` reads as "doubled" when the truth is "started".
 */
export function periodDelta(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/** Mean calls per day over an inclusive range. `null` when the range has no days. */
export function meanCallsPerDay(totalCalls: number, days: number): number | null {
  if (!Number.isFinite(totalCalls) || !Number.isFinite(days) || days <= 0) return null;
  return totalCalls / days;
}

/**
 * **`k` -- HOW BURSTY THE TRAFFIC ACTUALLY IS.** §6.2 step 2, and the number the whole
 * honesty of the ceiling projection rests on.
 *
 *   k = peakWindow5h / (meanCallsPerDay × 5/24)
 *
 * The observed ratio of the worst five hours to what five *average* hours would hold.
 * `k = 1` is perfectly flat traffic; `k = 4.8` means an entire day's calls land inside
 * one five-hour window. **`k >= 1` by construction**, and a measured value below 1 can
 * only mean the peak and the mean were computed over different ranges -- so it is
 * returned as measured rather than clamped, because clamping would hide that.
 *
 * **IT IS A DISPLAYED NUMBER, TRACKED OVER TIME** (§6.3.1). One abusive script shifts
 * `k` with no visible change in the daily series at all -- the ceiling then arrives
 * early while the trajectory chart looks unchanged. Hiding `k` is how that becomes
 * invisible.
 */
export function burstiness(
  peak5h: number | null,
  callsPerDay: number | null,
): number | null {
  if (peak5h === null || callsPerDay === null) return null;
  if (!Number.isFinite(peak5h) || !Number.isFinite(callsPerDay)) return null;
  const expected = callsPerDay * (5 / 24);
  if (expected <= 0) return null;
  return peak5h / expected;
}

/**
 * The rolling-window ceiling expressed in the daily series' own units. §6.2 step 3.
 *
 *   dailyEquivalentCeiling = windowCeiling × (24/5) ÷ k
 *
 * At `k = 1` a daily series may reach 1344 before a 280/5h ceiling binds; at `k = 3` it
 * binds at 448. **The conversion is one division and the whole honesty of the answer
 * is in the denominator** -- which is why `k` is measured (`burstiness`) and never
 * assumed.
 *
 * The two ways to get this wrong, both tempting and both in §6.1: comparing calls/day
 * to 280 directly is **wrong by 4.8× in the alarmist direction**, and dividing by a
 * flat 4.8 assumes uniform traffic, which a consumer app with an evening certainly is
 * not -- and that one is wrong in the **dangerous** direction, because the real 5-hour
 * peak crosses the ceiling while the figure still reads comfortable.
 */
export function dailyEquivalentCeiling(
  windowCeiling: number,
  k: number | null,
): number | null {
  if (k === null || !Number.isFinite(k) || k <= 0) return null;
  if (!Number.isFinite(windowCeiling) || windowCeiling <= 0) return null;
  return (windowCeiling * (24 / 5)) / k;
}
