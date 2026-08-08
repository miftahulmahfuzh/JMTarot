/**
 * The director's ONE model call. `op: 'chat_plan'`.
 *
 * ── F1 OWNS THIS FILE; F2 OWNS `./prompt.ts` AND `validatePlan` ────────────
 *
 * The boundary is ratified by reconciliation `[R13]` and **this path is binding**,
 * because `callClass.test.ts` and `flagCoverage.test.ts` name files by string. The
 * split is drawn at the prompt MODULE:
 *
 *   - **F1 owns the CALL SITE** — the op, the tier, the model, the flag guard, the
 *     budget, and what a failure means to the run.
 *   - **F2 owns the PROMPT and the VALIDATOR** — it deletes `./prompt.placeholder.ts`
 *     and supplies `./prompt.ts` exporting `buildPlanPrompt` and `validatePlan`.
 *
 * Roadmap §7 cuts the other way in two places — F1 *"must not touch any prompt file"*
 * and F2 *"must not touch the engine"* — and the file that calls
 * `getProvider().complete()` is simultaneously the engine's edge and the prompt's
 * edge. `[R13]` settles it here so three plans do not each assume a different
 * filename and the two grep-based tests do not name a file that does not exist.
 *
 * ── `callClass: 'deferred'` IS A PROMISE TO THE READING (`C-D6`) ───────────
 *
 * The rule in `@/lib/llm/types` says a call somebody is watching a spinner for is
 * `interactive`, and by that rule this is interactive — the querent is watching a
 * typing indicator. **The exception is deliberate and arithmetic:**
 *
 * > `LLM_WINDOW_CALL_CEILING` is 280 model calls per rolling five hours, fleet-wide.
 * > A chat run is 2–5 calls. **Sixty chat runs exhaust the entire app's five-hour
 * > quota** — and the next thing to be refused is somebody's reading.
 *
 * A reading is the product; the chat is the best thing in the product. When those two
 * compete the reading wins.
 *
 * ── `llm_calls.reading_id` IS NULL HERE, AND THAT IS `[R8]` ────────────────
 *
 * `readingCostsFor` and `callsForReading` fold every `reading_id`-bearing ledger row
 * into a reading's *Biaya generasi* **with no `op` predicate**, and a chat run has two
 * plausible reading pointers (`chat_runs.trigger_reading_id`, and an attachment's
 * `attached_reading_id`). Passing one here would make **a chat run inflate the cost of
 * the reading that triggered it, silently.** The decorator writes the row and passes
 * no `readingId`; the rule is that neither may this file.
 */
import 'server-only';

import type { Locale } from '@/data/types';
import { getProvider } from '@/lib/llm';
import { chatEnabled } from '@/lib/llm/flags';
import { chatModel, chatModelName } from '../model';
import { reserveChatCall } from '../budget';
import type { Beat, DirectorInput, DirectorResult } from '../types';
import { buildPlanPrompt, planFallback, validatePlan } from './prompt';

/**
 * What `run.ts` gets back. **`'shed'` IS NOT A FAILURE** — the run is left exactly as
 * it was, with beats remaining, and the querent's next visit picks it up (`[F1-6]`).
 */
export type PlanOutcome =
  | { kind: 'planned'; result: DirectorResult }
  | { kind: 'shed'; reason: 'chat_window' | 'soft' | 'hard' | 'disabled' };

/**
 * Plan one run. **Never throws** — a provider failure becomes F2's deterministic
 * fallback, which is a plausible SINGLE beat rather than three: *a fallback that is
 * louder than the real thing is the wrong failure.*
 */
export async function plan(input: DirectorInput): Promise<PlanOutcome> {
  /*
   * **THE FLAG GATES THE CALL, NEVER THE READ** (`[F1-19]`). With `CHAT_ENABLED=0` the
   * room still opens and every past message still renders; only this declines. And it
   * declines as a SHED rather than as a failure, so nothing is written and the run is
   * picked up the moment the flag returns to `1` (`[F1-20]`).
   */
  if (!chatEnabled()) return { kind: 'shed', reason: 'disabled' };

  const reservation = await reserveChatCall();
  if (!reservation.ok) return { kind: 'shed', reason: reservation.reason };

  const startedAt = performance.now();
  /* What the STORED row says. `chatModel()` below is what the provider is TOLD; the
   * two resolve the same chain and `model.test.ts` is what keeps them from drifting. */
  const model = chatModelName();

  let raw: string;
  try {
    const { text } = await getProvider().complete(await buildPlanPrompt(input), {
      op: 'chat_plan',
      callClass: 'deferred',
      model: chatModel(),
    });
    raw = text;
  } catch (err) {
    /*
     * **THE ERROR OBJECT IS NOT LOGGED**, `insight.ts`'s and `blogAutoTranslate`'s rule
     * applied without reasoning about the case: an LLM error can carry the request
     * body, and on this surface the request body contains the querent's own sentences
     * and — under `C-D8` — their six onboarding answers. The rule is worth more than
     * the one diagnosis it costs.
     */
    console.warn('[chat] planner failed', {
      run: input.runId,
      name: err instanceof Error ? err.name : typeof err,
    });
    return {
      kind: 'planned',
      result: fallbackResult(input, model, startedAt, 'call_failed'),
    };
  }

  const checked = validatePlan(raw, input);
  if (!checked.ok) {
    return {
      kind: 'planned',
      result: fallbackResult(input, model, startedAt, checked.reason),
    };
  }

  return {
    kind: 'planned',
    result: {
      beats: checked.beats,
      locale: checked.locale,
      /*
       * **A ZERO-BEAT SHEET IS `'silence'` AND NOT `'ok'`, AND THAT IS NOT COSMETIC**
       * (`C-R6`). It is the outcome F7 measures to answer *"is the director really
       * deciding?"* — a rate of zero means it is not — and it is one of the strongest
       * naturalness signals the release has. Folding it into `'ok'` would delete the
       * measurement while leaving the behaviour.
       */
      outcome: checked.beats.length === 0 ? 'silence' : 'ok',
      rejectReason: null,
      model,
      totalMs: Math.round(performance.now() - startedAt),
    },
  };
}

/**
 * F2's deterministic fallback, wrapped so the two failure paths above agree.
 *
 * **`outcome: 'fallback'` AND `plan_source = 'fallback'` ARE THE SAME FACT IN TWO
 * PLACES, DELIBERATELY** (`[R9]`, §5): the event prop is what F7 reads over a range,
 * the column is what it reads per run, and F2's fallback is otherwise
 * **indistinguishable from a real plan** — so without both, the panel measuring the
 * director measures nothing.
 */
function fallbackResult(
  input: DirectorInput,
  model: string,
  startedAt: number,
  rejectReason: string,
): DirectorResult {
  const beats: Beat[] = planFallback(input);
  return {
    beats,
    locale: input.fallbackLocale as Locale,
    outcome: 'fallback',
    rejectReason,
    model,
    totalMs: Math.round(performance.now() - startedAt),
  };
}
