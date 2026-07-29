/**
 * `llm_calls`, written and read. v0.5.0 / A2, decisions A-D4, A-D7 and A-D17.
 *
 * The four rules of this directory, applied:
 *
 *   1. The handle comes FIRST, so `flushCalls` can hand in the request's own handle
 *      and the integration suite can hand in a rolled-back transaction.
 *   2. Nothing here imports `../../client`, `react`, `next/*` or `server-only` --
 *      **not even transitively**, which is why `LLMOp` comes from
 *      `@/lib/llm/types` (zero imports, and it must keep none) and NOT from
 *      `@/lib/llm/index`, which opens with `import 'server-only'`.
 *      `contract.test.ts` walks the graph.
 *   3. No caching. Every read here is an operator looking at a cost figure.
 *   4. One file per read concern. A3 owns the rollups, the metric catalogue and the
 *      user list in this same directory; this file is the ledger and nothing else.
 *
 * ── `sql<T>` IS AN ASSERTION THE DRIVER IS NOT OBLIGED TO HONOUR ──────────────
 *
 * **EVERY AGGREGATE HERE IS TYPED `unknown` AND CONVERTED WITH `Number()` BY HAND,
 * AND THAT IS NOT TIDINESS.** Drizzle maps a value to a JS type when it knows the
 * COLUMN; inside a raw `sql` template there is no mapper, so postgres.js hands back
 * what it hands back -- and for `count()` and `sum()` that is a **string**, because
 * both come back as `bigint`/`numeric`.
 *
 * V8 paid for this with `answersUpdatedAt`, which asserted `sql<Date>` over
 * `max(timestamptz)`, got a string, and made `personaStaleness` compare a string to
 * a `Date` with `>`. That coerces and answers *something*, so **every answer edit
 * was judged wrongly with a green typecheck and a green unit suite** -- the unit
 * tests pass real `Date`s in, because that is what the type said. Only an
 * integration test calling `.getTime()` saw it.
 *
 * The same shape here would be worse, not better: `'12' > '9'` is `false` and
 * `'100' + 1` is `'1001'`, so a summed token count would be silently wrong in a
 * direction nobody would question. `calls.integration.test.ts` asserts
 * `typeof === 'number'` on every aggregate this file returns, which is the only
 * layer that sees the driver at all.
 *
 * ── THIS TABLE HOLDS NO PROSE, AND THAT IS WHY A5 NEEDS NO REVEAL MACHINERY ───
 *
 * Nine scalars, a model name and two ids. No question, no body, no gist, no
 * `error_kind` that is anything but a short classifier. So a per-user cost page can
 * render every column of it with no audit row, no one-key rule and nothing to
 * redact -- unlike every other per-user read in the admin surface. **Do not add a
 * text column to this table without re-reading that sentence**, because A5's page
 * was designed against it.
 */
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { llmCalls, type LlmCall, type NewLlmCall } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import type { LLMOp } from '@/lib/llm/types';

/** An inclusive `local_date` range, both `'YYYY-MM-DD'`. The querent's day, never UTC. */
export type CallRange = { from: string; to: string };

/**
 * One row per `(model, local_date, op)`. **The shape A3's rollups and A4's charts
 * group**, and the grouping is not arbitrary:
 *
 *   - by `model`, because **pricing is per model per period** and a range spanning a
 *     price change must be priced with the prices of its own period (A-D7);
 *   - by `local_date`, because that is the querent's own calendar day and the bucket
 *     every other daily figure in this project uses;
 *   - by `op`, because "what does a user cost" is only answerable by purpose.
 *
 * **PRICED OVER SUMS, NEVER PER ROW.** A range is grouped here first and priced
 * afterwards, so 100k rows cost 100k additions and a few dozen price lookups.
 */
export type CallTotals = {
  model: string;
  localDate: string;
  op: LLMOp;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /**
   * Rows whose `input_tokens` AND `output_tokens` were both NULL -- the provider
   * reported nothing. **THE DENOMINATOR WARNING A-D7 REQUIRES: every cost figure
   * must travel with this count**, or a cost is quoted over an incomplete
   * denominator and reads as complete. With `LLM_PROVIDER=zai` this is expected to
   * be large, which is exactly why it may not be hidden.
   */
  untokenized: number;
};

/**
 * The whole buffer in one `insert ... values (...), (...)`.
 *
 * **NOT RETRIED, and the failure policy is `flushEvents`'s rather than
 * `persistReading`'s** (invariant 6). W4 keeps two on purpose: the `readings` row
 * gets a bounded retry because a missing row breaks a user-facing memory feature; a
 * missing ledger row breaks a dashboard. The caller logs and swallows.
 */
export async function insertCalls(db: DbOrTx, rows: NewLlmCall[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(llmCalls).values(rows);
}

/** Fleet-wide, for A3's rollups and A4's overview. */
export async function callTotals(db: DbOrTx, range: CallRange): Promise<CallTotals[]> {
  return grouped(db, range, undefined);
}

/**
 * A5's per-user page. Same shape, one user.
 *
 * **A soft-deleted user's rows are returned, and a hard-deleted one's are not
 * attributable at all** -- `user_id` is `on delete set null`, so those rows survive
 * with the attribution gone. R29's rule for the admin surface applies here too: this
 * function does not filter `users.deleted_at`, because the page exists to show a
 * deleted account during its thirty-day window.
 */
export async function callTotalsForUser(
  db: DbOrTx,
  userId: string,
  range: CallRange,
): Promise<CallTotals[]> {
  return grouped(db, range, userId);
}

async function grouped(
  db: DbOrTx,
  range: CallRange,
  userId: string | undefined,
): Promise<CallTotals[]> {
  const where = userId
    ? and(
        gte(llmCalls.localDate, range.from),
        lte(llmCalls.localDate, range.to),
        eq(llmCalls.userId, userId),
      )
    : and(gte(llmCalls.localDate, range.from), lte(llmCalls.localDate, range.to));

  const rows = await db
    .select({
      model: llmCalls.model,
      localDate: llmCalls.localDate,
      op: llmCalls.op,
      /*
       * `unknown` ON ALL FOUR, per this file's header. `count()` is a bigint and
       * `sum()` is a numeric; both arrive as strings and both would be believed.
       *
       * `coalesce(sum(...), 0)`, because `sum()` over a group whose every row is
       * NULL is itself NULL rather than 0 -- and `Number(null)` is 0 by accident
       * rather than on purpose, which is the kind of agreement that stops being
       * true. `untokenized` is the column that says how much of that happened.
       */
      calls: sql<unknown>`count(*)`,
      inputTokens: sql<unknown>`coalesce(sum(${llmCalls.inputTokens}), 0)`,
      outputTokens: sql<unknown>`coalesce(sum(${llmCalls.outputTokens}), 0)`,
      untokenized: sql<unknown>`count(*) filter (
        where ${llmCalls.inputTokens} is null and ${llmCalls.outputTokens} is null
      )`,
    })
    .from(llmCalls)
    .where(where)
    .groupBy(llmCalls.model, llmCalls.localDate, llmCalls.op)
    .orderBy(asc(llmCalls.localDate), asc(llmCalls.model), asc(llmCalls.op));

  return rows.map((r) => ({
    model: r.model,
    localDate: r.localDate,
    // Bare `text` in the schema by this project's narrowing rule; A2 owns the set
    // and `callClass.test.ts` is what keeps a tenth value out of it.
    op: r.op as LLMOp,
    calls: Number(r.calls),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    untokenized: Number(r.untokenized),
  }));
}

/**
 * A5's detail list: every model call this reading is answerable for.
 *
 * **THAT IS `reading` AND `gist`, AND IT IS NOT THE READING'S TOTAL COST**
 * (reconciliation R51). The moderation classifier runs *before* the `readings` row
 * exists, so it can never carry a `reading_id`; a true per-reading total would need
 * a request id threaded through both, which nobody asked for. **The figure A5 renders
 * from this is "biaya generasi" -- generation cost -- and calling it anything else
 * on screen is a claim this data cannot support.**
 *
 * Oldest first: the reading call precedes the gist that was distilled from it, and
 * an operator reading a list of two wants them in that order.
 */
export async function callsForReading(db: DbOrTx, readingId: string): Promise<LlmCall[]> {
  return db
    .select()
    .from(llmCalls)
    .where(eq(llmCalls.readingId, readingId))
    .orderBy(asc(llmCalls.createdAt));
}
