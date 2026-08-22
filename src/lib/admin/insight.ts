/**
 * One panel of the admin dashboard, read by a model. **A7, 2026-07-31.**
 *
 * `docs/plans/2026-07-31-admin-panel-insights-design.md` §3. The pure half — the
 * facts block, the prompt, the hash and the check on what comes back — is
 * `./insightPrompt`, which `npm test` can drive. This file is the call.
 *
 * ── IT STORES NOTHING, LIKE `blogAutoTranslate` ────────────────────────────
 *
 * The route writes, in one place, after the check. That is the same split A6 made and
 * for the same reason: **machine output gets no shortcut past the gate every other
 * write goes through**, and a generator that also persisted would be two callers of
 * `putInsight` the first time somebody adds a background refresh.
 *
 * ── `op: 'insight'` — THE TENTH VALUE, AND IT WAS ASKED FOR ────────────────
 *
 * `@/lib/llm/types` carries the argument. Short form: this is a new recurring model
 * call with no querent behind it, and `/admin/tokens`' own *Biaya per keperluan* table
 * is the surface that has to be able to say what it costs. Reusing an existing op would
 * make the dashboard hide the price of its own newest feature.
 *
 * ── `callClass: 'deferred'`, WHICH IS NOT THE OBVIOUS CHOICE ───────────────
 *
 * The operator IS waiting, so `'interactive'` looks right. It is wrong, for
 * `blogAutoTranslate`'s reason verbatim: that tier exists so a reading a QUERENT is
 * waiting for is shed last, and `LLM_WINDOW_CALL_CEILING` is fleet-wide. **An operator
 * convenience must be shed before somebody's reading is**, and the cost of being right
 * about that is a button that occasionally says "try again later" — which is exactly
 * what it should say when the window is nearly spent.
 *
 * ── AND THEREFORE NO ENTRY IN `flags.ts` ───────────────────────────────────
 *
 * `flagCoverage.test.ts`'s `EXEMPT` table carries the row. The tier IS the switch here:
 * the ceiling sheds this before any querent-facing call by construction, so a manual
 * flag would duplicate an automatic mechanism and could be left off. With it shed, the
 * button reports a failure and the operator reads the chart themselves — which is what
 * they were doing the day before this shipped. There is no degraded querent experience
 * for a flag to protect.
 *
 * ── `ADMIN_MODEL`, 2026-08-01 — THIS HEADER USED TO SAY THERE WAS NO SUCH ──
 * ── VARIABLE, AND LEFT THE DOOR OPEN FOR THE REASON THAT ARRIVED ───────────
 *
 * The old text: *"This is analysis over numbers, which is the work a cheap model does
 * worst … A variable can be added the day somebody measures a reason for it."* Both
 * halves stand. The variable is `./model`'s `ADMIN_MODEL`, and it covers the whole
 * admin class rather than this one call site — see that file for why one variable and
 * not three. Unset still falls back to `LLM_MODEL`, so nothing has to be set.
 */
import 'server-only';

import { getProvider } from '@/lib/llm';
import { adminModel, adminModelName } from './model';
import {
  buildInsightPrompt,
  insightInputHash,
  isRetryableReason,
  retryFitsBudget,
  serializePanelFacts,
  validateInsight,
  type PanelFacts,
} from './insightPrompt';

export type InsightResult =
  | { kind: 'generated'; body: string; inputHash: string; model: string }
  /**
   * The facts hash the caller already holds. **NO MODEL CALL WAS MADE** — this is the
   * arm that makes a double-tap free, and it is decided here rather than in the route
   * because the hash is taken over the serialized block and this is the only module
   * that serializes.
   */
  | { kind: 'unchanged'; inputHash: string }
  | {
      kind: 'failed';
      /** `'ceiling'` is the shed; the other four come from `validateInsight`. */
      reason: 'failed' | 'empty' | 'too-long' | 'format' | 'tally' | 'ceiling';
      inputHash: string;
    };

/**
 * Read one panel. **Never throws** — every failure is a named reason the box renders as
 * a sentence, because this runs behind a button somebody just pressed and a 500 there
 * tells them nothing about whether to press it again.
 *
 * `inputHash` comes back on EVERY arm deliberately: the caller stores it beside the
 * prose and compares it on the next page load, and on the `failed` arm it is what lets
 * the box keep telling the truth about the row it already has.
 *
 * **`cachedHash` IS CHECKED BEFORE THE CALL, NOT AFTER.** Checking afterwards would
 * spend the quota and then discard the answer, which is the whole cost this cache
 * exists to avoid. `force` is what the button passes when the operator asks for a fresh
 * reading of numbers that have not moved.
 */
export async function generateInsight(
  facts: PanelFacts,
  range: { from: string; to: string; days: number },
  opts: { cachedHash?: string | null; force?: boolean } = {},
): Promise<InsightResult> {
  const serialized = serializePanelFacts(facts, range);
  const inputHash = insightInputHash(serialized);
  /* What the STORED row says. `adminModel()` below is what the provider is TOLD; the
   * two resolve the same chain and `model.test.ts` is what keeps them from drifting. */
  const model = adminModelName();

  if (!opts.force && opts.cachedHash != null && opts.cachedHash === inputHash) {
    return { kind: 'unchanged', inputHash };
  }

  /* When the FIRST call started. The retry's budget is spent against this and nothing
   * else — see `retryFitsBudget`, whose ceiling is derived from the client's abort. */
  const startedAt = Date.now();

  let raw: string;
  try {
    const { text } = await getProvider().complete(buildInsightPrompt(serialized), {
      op: 'insight',
      callClass: 'deferred',
      model: adminModel(),
    });
    raw = text;
  } catch (err) {
    /*
     * **THE ERROR OBJECT IS NOT LOGGED**, `blogAutoTranslate`'s rule applied without
     * reasoning about the case: an LLM error can carry the request body, and the rule
     * is worth more than the one diagnosis it costs. Nothing here binds a database
     * parameter, and the panel id is machine-generated.
     */
    console.error('[admin-insight] provider failed', {
      panel: facts.title,
      name: err instanceof Error ? err.name : typeof err,
      /*
       * The shed reads as an ordinary failure to the caller and is distinguished only
       * here, because the two need different copy: `ceiling` means "come back later"
       * and `failed` means "press it again".
       */
      ceiling: isCeiling(err),
    });
    return { kind: 'failed', reason: isCeiling(err) ? 'ceiling' : 'failed', inputHash };
  }

  let checked = validateInsight(raw);

  /*
   * ── THE SECOND ATTEMPT: THE NEGATIVE EXAMPLE, WITHIN ONE PRESS ─────────────
   *
   * **CARD #2 WAS TEN PRESSES OF THE SAME REFUSAL**, and the ask was to show the model
   * the shape it had just got wrong. This is that, with the loop inside one press rather
   * than across them: the rejected text never leaves the server, nothing is stored, and
   * an operator who pressed once gets the retry for free.
   *
   * **AT MOST ONE RETRY.** Two calls per press is already double on a class that exists
   * to be shed first; a third would triple an operator convenience against a fleet-wide
   * ceiling that a querent's reading shares.
   */
  if (!checked.ok && isRetryableReason(checked.reason) && retryFitsBudget(Date.now() - startedAt)) {
    /* Snapshot BEFORE the await. `checked` is reassigned below, and `tee.ts`'s trap is
     * exactly this shape: a field read after an await that something else has moved. */
    const first = checked.reason;
    const rejectedBody = raw;

    try {
      const { text } = await getProvider().complete(
        buildInsightPrompt(serialized, { reason: first, body: rejectedBody }),
        { op: 'insight', callClass: 'deferred', model: adminModel() },
      );
      raw = text;
      checked = validateInsight(raw);
    } catch (err) {
      /*
       * The retry itself did not come back. **REPORT THE FIRST ATTEMPT'S REASON, UNLESS
       * THE RETRY WAS SHED** — `ceiling` is the newer and the more actionable fact
       * ("come back later", and the ceiling chart will show it), where a provider 500 on
       * the second call leaves the first attempt's shape failure as the truest thing
       * known about this press.
       */
      console.error('[admin-insight] retry failed', {
        panel: facts.title,
        first,
        name: err instanceof Error ? err.name : typeof err,
        ceiling: isCeiling(err),
      });
      return { kind: 'failed', reason: isCeiling(err) ? 'ceiling' : first, inputHash };
    }
  }

  /* **THE SECOND ATTEMPT'S REASON, BEING THE NEWER TRUTH.** Every value already has a
   * sentence in `INSIGHT.error`, so a retry needs no copy of its own. */
  if (!checked.ok) return { kind: 'failed', reason: checked.reason, inputHash };

  return { kind: 'generated', body: checked.body, inputHash, model };
}

/**
 * Did `meter.ts` shed this call rather than the provider refusing it?
 *
 * **A NAME MATCH AND NOT AN `instanceof`.** `ModelCeilingError` lives in
 * `@/lib/llm/meter`, which reaches `@/lib/ratelimit` and therefore `next/server`, and
 * dragging a request-scoped runtime in here for one comparison is the edge `types.ts`
 * goes out of its way to avoid.
 *
 * **The name, NOT the message.** A regex over the message would also match a provider
 * error that happened to say *"window"* or *"rate"*, and the consequence is the wrong
 * sentence under a button: *"kuota model hampir habis"* on what was really a 500 sends
 * the operator to look at the ceiling chart for nothing. The failure of getting it wrong
 * is copy, never a wrong write — the row is not stored on either arm.
 */
function isCeiling(err: unknown): boolean {
  return err instanceof Error && err.name === 'ModelCeilingError';
}
