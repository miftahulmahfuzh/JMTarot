// F3 REPLACES THIS FILE ENTIRELY. See `docs/plans/2026-08-07-chat-voices.md`.
/**
 * **A PLACEHOLDER. IT EXISTS SO F1 IS INDEPENDENTLY VERIFIABLE END TO END, AND SO
 * `callClass.test.ts` AND `flagCoverage.test.ts` HAVE A CALL SITE TO NAME.**
 *
 * There is **no prompt prose here and there must not be until F3 lands.** A
 * half-written reader voice in the tree is one somebody reads as the contract — and
 * `C-N1a`'s rule is that *if the three readers ever stop being distinguishable with
 * the names covered, fix the persona paragraphs, not the code*, which presumes the
 * paragraphs are real.
 *
 * ── WHAT F3 MUST PRESERVE WHEN IT REPLACES THIS ───────────────────────────
 *
 *  - The two exports and their signatures. `turn.ts` is F1's and F3 may not edit it
 *    (`[R13]`).
 *  - **`bodies` IS AN ARRAY AND MAY HOLD TWO** (`[R19]`, granted by Miftah as *"the
 *    largest naturalness gain left"*): a person who has more to say sends a second
 *    message rather than a longer one. **Never empty** — an empty array is a failure
 *    and must come back as `ok: false`, or `C-R7`'s *"a reader never stores an empty
 *    bubble"* arrives as data.
 *  - **`validateTurn` REFUSES SHAPE, AND IS BIASED TOWARDS ACCEPTING.** That is the
 *    OPPOSITE of `validateChoice`'s bias, deliberately: there a false acceptance ships
 *    the reported bug, and **here a false rejection costs a bubble and makes the room
 *    quieter, which is the failure this release cannot afford.**
 *  - **`addressForm` IS A CLASS, NEVER THE WORD.** `mif`, `tah`, `jo` are slices of a
 *    nickname a person typed, `events` rows survive account erasure, and
 *    `chat.turn_generated.address_form` is where this value lands.
 *  - The prompt is FORKED PER LOCALE behind a `Record<Locale, …>` facade, so a missing
 *    locale is a compile error rather than `undefined` handed to a model.
 *  - **THE SIX RAW ONBOARDING ANSWERS ENTER THROUGH F3's ASSEMBLER AND NOWHERE ELSE**
 *    (`C-D8` condition 1), through `queries/onboarding.ts` — still *the only module
 *    that encrypts or decrypts that column* — behind `chatAnswersEnabled()`, fenced in
 *    `<jawaban>`, with nulls omitted (`[F1-31]`) and the prompt told the set is
 *    partial.
 */
import type { CompletionPrompt } from '@/lib/llm/types';
import type { VoiceInput } from '../types';

export type TurnCheck =
  | { ok: true; bodies: string[]; addressForm: 'nickname' | 'clipped' | 'none' }
  /** A CLOSED set. Never a message — this reaches `events.props`. */
  | {
      ok: false;
      reason: 'empty' | 'too_long' | 'too_short' | 'address' | 'card_name' | 'markdown' | 'self_address';
    };

/**
 * The prompt. **STUBBED.**
 *
 * `async` because F3's real builder reads the context assembler — the six answers, the
 * Lotus, the last *n* readings, the last *m* messages and this run's beats so far —
 * and that is several database reads. Declaring the signature now means F3 changes a
 * body rather than a caller.
 */
export async function buildTurnPrompt(
  input: VoiceInput & { attempt: 1 | 2 },
): Promise<CompletionPrompt> {
  return {
    system: 'placeholder',
    user: `${input.runId}:${input.beatIndex}`,
    maxTokens: 200,
  };
}

/**
 * **THE STUB REFUSES.** Not because refusing is right, but because the alternative is
 * worse: an accepting stub would store placeholder text as a bubble, and **a stored
 * bubble is context for every future turn in the room** (`C-R5`). `C-R7`'s skip path
 * is the honest stub — the beat advances, nothing is shown, and the room is exactly as
 * it was.
 *
 * `plan.ts`'s stub plans silence, so this is unreachable in practice until F2 and F3
 * land. It is written to the same standard anyway, because *"unreachable"* is a
 * property of two other files.
 */
export function validateTurn(_raw: string, _input: VoiceInput): TurnCheck {
  return { ok: false, reason: 'empty' };
}
