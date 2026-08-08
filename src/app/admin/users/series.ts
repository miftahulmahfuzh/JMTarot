/**
 * The per-user token series, as a PURE fold. v0.5.0 / A5, task 14.
 *
 * **WHY NOT A4's `tokenSeries`:** that one takes A3's `TokenRow`, which carries
 * `nullInputCalls` and `nullOutputCalls` as separate counts, and the per-user shape is
 * `CallTotals` from `queries/admin/calls.ts`, which carries ONE `untokenized` count —
 * *rows whose `input_tokens` AND `output_tokens` were both NULL*. Mapping one onto the
 * other would put the same number in two fields that mean different things, and the
 * number in question is A-D7's denominator warning. A five-line fold is cheaper than a
 * misreported count.
 *
 * **BUCKETED ON `local_date` AND ZERO-FILLED FROM THE RANGE** (A5-15): the bucket list
 * comes from the range and not from the rows, so a day with no calls is a `0` rather than
 * a missing column — a chart missing its left-hand side says nothing about it. And the
 * bucket is the *querent's* calendar day, never `created_at` in the server's zone.
 *
 * PURE, no imports beyond A3's day enumerator, so `npm test` reaches the whole policy —
 * the `swipeDeck.ts` precedent.
 */
import { enumerateDays } from '@/lib/analytics/series';
import type { CallTotals } from '@/lib/db/queries/admin/calls';
import type { Maybe } from '@/components/chart/types';

export type UserTokenSeries = {
  buckets: string[];
  input: Maybe[];
  output: Maybe[];
  calls: Maybe[];
  /** Summed over the range. **Rendered beside every cost figure, never hidden** (A-D7). */
  untokenized: number;
  totalCalls: number;
  totalInput: number;
  totalOutput: number;
};

export function userTokenSeries(
  rows: readonly CallTotals[],
  from: string,
  to: string,
): UserTokenSeries {
  const buckets = enumerateDays(from, to);
  const input = new Map<string, number>();
  const output = new Map<string, number>();
  const calls = new Map<string, number>();
  let untokenized = 0;
  let totalCalls = 0;
  let totalInput = 0;
  let totalOutput = 0;

  for (const r of rows) {
    input.set(r.localDate, (input.get(r.localDate) ?? 0) + r.inputTokens);
    output.set(r.localDate, (output.get(r.localDate) ?? 0) + r.outputTokens);
    calls.set(r.localDate, (calls.get(r.localDate) ?? 0) + r.calls);
    untokenized += r.untokenized;
    totalCalls += r.calls;
    totalInput += r.inputTokens;
    totalOutput += r.outputTokens;
  }

  return {
    buckets,
    input: buckets.map((d) => input.get(d) ?? 0),
    output: buckets.map((d) => output.get(d) ?? 0),
    calls: buckets.map((d) => calls.get(d) ?? 0),
    untokenized,
    totalCalls,
    totalInput,
    totalOutput,
  };
}

/**
 * `(op, calls)` folded across models and days, biggest first. The stacked bar's input, and the
 * table's.
 *
 * **Thirteen `op` values, closed** (roadmap seam 3): A5 invents no fourteenth and no alias,
 * and the caller folds to three + Other rather than growing a fifth hue (R11).
 *
 * *(Nine when A5 shipped; ten and eleven on 2026-07-31 with `insight` and `blog_format`,
 * twelve and thirteen with v0.7.0's `chat_plan` and `chat_turn`. **Four of the thirteen have
 * no querent behind them** — `src/lib/admin/ops.ts` is the machine-checked copy — and this
 * fold deliberately does not filter them out: on a PER-USER page an `insight` row is the
 * operator's own press and a chat row is that person's own room, and hiding either would
 * make this card disagree with the `Panggilan` total beside it.)*
 *
 * **THE `op` TYPE IS DERIVED FROM `CallTotals` RATHER THAN IMPORTED FROM `@/lib/llm/types`,
 * AND THE FENCE IS WHY.** `page.contract.test.ts` allows exactly one `@/lib/llm/**` specifier
 * anywhere in A5 -- `prices`, which is PURE with zero imports -- because *the admin tree makes
 * no model call on any path*. Deriving the union through the row type keeps the caller free of
 * a cast AND free of the import, which is better than widening the fence for a type.
 */
export function callsByOpForUser(
  rows: readonly CallTotals[],
): Array<{ op: CallTotals['op']; calls: number }> {
  const byOp = new Map<CallTotals['op'], number>();
  for (const r of rows) byOp.set(r.op, (byOp.get(r.op) ?? 0) + r.calls);
  return [...byOp.entries()]
    .map(([op, calls]) => ({ op, calls }))
    .sort((a, b) => b.calls - a.calls || a.op.localeCompare(b.op));
}
