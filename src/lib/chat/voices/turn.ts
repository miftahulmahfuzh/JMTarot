/**
 * One reader speaking. `op: 'chat_turn'`.
 *
 * ── F1 OWNS THIS FILE; F3 OWNS `./prompt.ts`, `validateTurn` AND THE PACE ──
 *
 * `[R13]`, and **this path is binding** because `callClass.test.ts` and
 * `flagCoverage.test.ts` name files by string. F1 owns the op, the tier, the model,
 * the flag guard, the budget and the retry; F3 owns the prompt module, the validator
 * and the context assembler behind it.
 *
 * ── IT BUFFERS AND MUST NOT STREAM (`C-D3`) ────────────────────────────────
 *
 * **A GROUP CHAT MESSAGE ARRIVES AS A BUBBLE.** Watching Adrian type character by
 * character is a chatbot tell; a typing indicator followed by a whole bubble is what
 * every person in the world reads as a message. `ReadingView`'s streaming machinery,
 * `teeReading`, `tee.ts` and `splitChoiceMarker` are not reused here and must not be.
 *
 * It also buys three things a stream cannot: **validation before display** (the
 * address form, the forbidden vocabulary, the card names, the length); **the
 * inter-turn beat**, which is most of what "natural" means in a group; and **one code
 * path for proactive turns**, which have nobody watching them.
 *
 * ── THE RETRY IS INSIDE ONE REQUEST, NOT A SECOND ONE (`F1-D2`) ───────────
 *
 * `C-R2` says one advance does one thing and `C-R7` says a failed turn is retried
 * once. The reading that makes them compatible: **the retry is a second model call
 * inside the same request.** So there is no `attempt` column, no `last_error` column,
 * and no way for a client to lose count of retries by closing a tab.
 *
 * `maxDuration = 60` on `/api/chat/advance` covers two of these plus the lease round
 * trips; a chat turn is one to three sentences and the lease is ninety seconds.
 * **Both attempts write an `llm_calls` row**, because both reached a provider — so
 * F7's validation-failure rate is computable and the cost is honest.
 *
 * ── `callClass: 'deferred'`, AND `llm_calls.reading_id` IS NULL ([R8]) ─────
 *
 * Both for the reasons `../direct/plan.ts`'s header gives at length. Short form: a run
 * is 2–5 calls, sixty runs exhaust the app's five-hour quota, the next thing refused
 * would be somebody's reading — and a `reading_id` here would inflate the cost of the
 * reading that triggered the run, silently, in a query with no `op` predicate.
 */
import 'server-only';

import { getProvider } from '@/lib/llm';
import { chatEnabled } from '@/lib/llm/flags';
import { chatModel, chatModelName } from '../model';
import { reserveChatCall } from '../budget';
import type { VoiceInput, VoiceResult } from '../types';
import { buildTurnPrompt, validateTurn } from './prompt';

export type TurnOutcome =
  | { kind: 'spoke'; result: Extract<VoiceResult, { ok: true }>; attempt: 1 | 2 }
  /** Both attempts failed validation. `C-R7`: the beat advances and stores NOTHING. */
  | { kind: 'failed'; rejectReason: string; attempts: 1 | 2; totalMs: number }
  | { kind: 'shed'; reason: 'chat_window' | 'soft' | 'hard' | 'disabled' };

/**
 * Speak one beat. **Never throws.**
 *
 * **A TURN THAT FAILS VALIDATION IS RETRIED ONCE; A TURN THAT FAILS TWICE IS
 * SKIPPED** (`C-R7`): `beats_done` advances, the run continues to the next beat, and
 * **nothing is shown**. A run whose every beat fails ends `abandoned` and the querent
 * sees no bubble — indistinguishable, from the room, from `C-R6`'s silence.
 *
 * **THERE IS NO ERROR BUBBLE IN THIS RELEASE AND THERE MUST NEVER BE ONE.** W4's
 * `[Bacaan terputus…]` rule — the notice reaches the screen and never `readings.body`
 * — is unimplementable here: in a chat **every message IS stored and IS context for
 * the next one** (`C-R5`), so a stored notice would be quoted back at the querent by
 * the next beat as if a reader had said it. The failure is automatic rather than
 * accidental.
 */
export async function speak(input: VoiceInput): Promise<TurnOutcome> {
  // `[F1-19]`: the flag gates the call, never the read. A shed, not a failure.
  if (!chatEnabled()) return { kind: 'shed', reason: 'disabled' };

  const startedAt = performance.now();
  let lastReason = 'call_failed';

  for (const attempt of [1, 2] as const) {
    /*
     * **RESERVED PER ATTEMPT, NOT PER BEAT.** Both attempts reach a provider, so both
     * spend quota, and a budget that charged once for two calls would under-report
     * exactly the feature `LLM_WINDOW_CHAT_CEILING` exists to bound.
     *
     * A shed on the SECOND attempt is still a shed and not a failure: nothing was
     * stored either way, and `[F1-6]` leaves the run to be picked up later — which is
     * better for the room than skipping a beat that might have worked.
     */
    const reservation = await reserveChatCall();
    if (!reservation.ok) return { kind: 'shed', reason: reservation.reason };

    let raw: string;
    try {
      const { text } = await getProvider().complete(
        await buildTurnPrompt({ ...input, attempt }),
        { op: 'chat_turn', callClass: 'deferred', model: chatModel() },
      );
      raw = text;
    } catch (err) {
      /*
       * **THE ERROR OBJECT IS NOT LOGGED.** On this surface the request body carries
       * the querent's own sentences and — under `C-D8` — their six raw onboarding
       * answers, including `worst_thing`. An LLM SDK error can quote the request.
       */
      console.warn('[chat] voice failed', {
        run: input.runId,
        beat: input.beatIndex,
        attempt,
        name: err instanceof Error ? err.name : typeof err,
      });
      lastReason = 'call_failed';
      continue;
    }

    const checked = validateTurn(raw, input);
    if (checked.ok) {
      return {
        kind: 'spoke',
        attempt,
        result: {
          ok: true,
          bodies: checked.bodies,
          addressForm: checked.addressForm,
          model: chatModelName(),
          totalMs: Math.round(performance.now() - startedAt),
        },
      };
    }
    lastReason = checked.reason;
  }

  return {
    kind: 'failed',
    rejectReason: lastReason,
    attempts: 2,
    totalMs: Math.round(performance.now() - startedAt),
  };
}
