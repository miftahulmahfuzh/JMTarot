// F2 REPLACES THIS FILE ENTIRELY. See `docs/plans/2026-08-07-chat-director.md`.
/**
 * **A PLACEHOLDER. IT EXISTS SO F1 IS INDEPENDENTLY VERIFIABLE END TO END, AND SO
 * `callClass.test.ts` AND `flagCoverage.test.ts` HAVE A CALL SITE TO NAME.**
 *
 * F1 ships the engine with a **stub director behind the interface F2 will implement**
 * (roadmap §7). This is that stub. Everything here is a shape and a deterministic
 * answer; **there is no prompt prose in it and there must not be until F2 lands**,
 * because a half-written director prompt in the tree is one somebody reads as the
 * contract.
 *
 * ── WHAT F2 MUST PRESERVE WHEN IT REPLACES THIS ───────────────────────────
 *
 *  - The three exports and their signatures. `plan.ts` is F1's and F2 may not edit it
 *    (`[R13]`), so the seam is these names.
 *  - **`validatePlan` REFUSES SHAPE, NOT TRUTH, AND SAYS SO** — `validateInsight`'s
 *    ruling verbatim. A beat naming a fifth reader, a reply target outside the
 *    supplied window, a beat count over `CHAT_MAX_BEATS`, a repeated reader in
 *    adjacent beats: all refused. *"Is this the right reader for this question"* has
 *    no cheap test and must not be faked with one.
 *  - **`rejectReason` IS A CLOSED SET, NEVER A MESSAGE.** It becomes
 *    `chat.run_planned.reject_reason`, and `events.props` may hold no free text.
 *  - **`planFallback` MUST BE TUNED TOWARD ONE READER RATHER THAN THREE.** A fallback
 *    that is louder than the real thing is the wrong failure.
 *  - **`beats: []` IS A LEGAL RETURN AND IS THE COMMON GOOD OUTCOME** (`C-R6`).
 *  - The prompt is FORKED PER LOCALE behind a `Record<Locale, …>` facade, so
 *    forgetting a locale is a compile error rather than `undefined` handed to a model
 *    — which does not throw and returns a fluent plan generated with no contract.
 */
import type { Locale } from '@/data/types';
import type { CompletionPrompt } from '@/lib/llm/types';
import type { Beat, DirectorInput } from '../types';

/** `[R19]` and `[R9]`: four, ruled by Miftah — *more voices in a run is the
 *  naturalness bet*, and `C-D6`'s sub-budget is what bounds the cost. F2 owns the
 *  variable; the number is the reconciliation's. */
export const CHAT_MAX_BEATS = 4;

export type PlanCheck =
  | { ok: true; beats: Beat[]; locale: Locale }
  /** A CLOSED set. Never a message — this reaches `events.props`. */
  | { ok: false; reason: 'unparseable' | 'shape' | 'cast' | 'target' | 'too_many' };

/**
 * The prompt. **STUBBED, AND DELIBERATELY NOT A DRAFT.**
 *
 * `async` because F2's real builder reads F3's context assembler with a narrower
 * profile (seam S2) — it does **not** build a second one — and that is a database
 * read. Declaring the signature now means F2 changes a body rather than a caller.
 */
export async function buildPlanPrompt(input: DirectorInput): Promise<CompletionPrompt> {
  return {
    system: 'placeholder',
    user: input.runId,
    maxTokens: 400,
  };
}

/**
 * **THE STUB PLANS SILENCE**, which is the one answer that is correct with no model
 * behind it: `C-R6` makes a zero-beat sheet valid, the run goes straight to `done`, no
 * `chat_turn` call is made, and the room is exactly as it was.
 *
 * The alternative — stubbing a single `answer` beat — would make F1's own end-to-end
 * check produce a bubble containing placeholder text, **stored, and therefore context
 * for every future turn in the room** (`C-R5`). That is the failure `C-R7` refuses an
 * error bubble to avoid, arriving through the back door.
 */
export function validatePlan(_raw: string, input: DirectorInput): PlanCheck {
  return { ok: true, beats: [], locale: input.fallbackLocale };
}

/** The deterministic fallback. Silence until F2 lands, for `validatePlan`'s reason. */
export function planFallback(_input: DirectorInput): Beat[] {
  return [];
}
