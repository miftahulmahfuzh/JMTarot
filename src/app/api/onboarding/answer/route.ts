/**
 * One of the six. Written optimistically -- the client does not await this (L2).
 *
 * These rows are RESUME MARKERS, not the authoritative record: the close screen
 * re-sends everything and `unique (user_id, question_key)` makes each upsert
 * idempotent, so a lost write here costs nothing and a spinner between two
 * questions would cost more.
 *
 * WHERE THE ENCRYPTION IS. In `upsertAnswer`, not here -- see that function's
 * module header for why the pair was kept together rather than split across the
 * boundary as Task 6 Step 3 describes. The property Step 5 asks you to verify is
 * unchanged: an answered row holds `v1.…` ciphertext and a skipped row holds NULL.
 */
import { NextResponse, after } from 'next/server';
import { ONBOARDING_MAX_ANSWER_CHARS, isFreeText, normaliseAnswer } from '@/data/onboarding';
import { db } from '@/lib/db/client';
import { upsertAnswer } from '@/lib/db/queries/onboarding';
import { generateLotus } from '@/lib/prompt/lotus.generate';
import { sanitizeAnswer } from '@/lib/prompt/sanitize';
import { AnswerBody, badRequest, onboardingGate, readJson, serverError } from '../shared';

/** `encryptField` is `node:crypto`. Not optional. */
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await onboardingGate();
  if (!gate.ok) return gate.response;

  const parsed = AnswerBody.safeParse(await readJson(request));
  if (!parsed.success) return await badRequest();

  const { key, text, choice, skipped } = parsed.data;

  /*
   * THE ORDER OF THE NEXT THREE STEPS IS THE WHOLE POINT OF THIS HANDLER.
   *
   *   1. zod checked the RAW length (in `AnswerBody`), so "too long" is already a
   *      400 and cannot be mistaken for anything else below.
   *   2. `sanitizeAnswer` strips delimiters, control and format characters. Its
   *      null means "nothing usable left" -- which here is a genuine skip, and is
   *      only unambiguous BECAUSE step 1 already rejected the over-cap case.
   *   3. `normaliseAnswer` decides skip-versus-answer and validates the closed
   *      sets, throwing on anything it cannot represent.
   */
  const cleaned = isFreeText(key) ? sanitizeAnswer(text, ONBOARDING_MAX_ANSWER_CHARS) : null;

  let answer;
  try {
    answer = normaliseAnswer(key, {
      text: cleaned,
      choice,
      /*
       * A free-text answer that sanitized down to nothing IS a skip. Typing only
       * whitespace, or only a delimiter, is a decision not to answer, and
       * recording it as an empty string would put an encrypted empty value in a
       * column where it is indistinguishable from a real answer.
       */
      skipped: skipped === true || (isFreeText(key) && cleaned === null),
    });
  } catch {
    // A closed value outside its set, or prose on a closed question. The client
    // cannot produce either; a hand-rolled request can.
    return await badRequest();
  }

  try {
    await upsertAnswer(db, gate.user.id, answer);
  } catch (err) {
    /*
     * Reported even though the client ignores it. The status is what the iframe
     * harness and `curl` read, and a 500 that arrives as a 200 would make this
     * endpoint untestable -- which for the endpoint that encrypts the most
     * sensitive column in the product is not acceptable.
     */
    console.error('onboarding answer write failed', { userId: gate.user.id, key, err });
    return await serverError();
  }

  /*
   * AN ANSWER CHANGED, SO THE BLOCK IS STALE.
   *
   * This is where the `input_hash` trigger actually fires. `readLotusBlock`
   * cannot check it on the reading path -- that would mean decrypting six answers
   * per reading, the request-path work roadmap §6 forbids -- so the write path
   * regenerates instead, because it is the thing that KNOWS an answer changed.
   *
   * `generateLotus` DIRECTLY, NOT `scheduleLotusRefresh`, and the difference
   * cost a debugging round. The scheduler's ten-minute cooldown exists to bound
   * the speculative repair the READ path fires; used here it swallows the edit
   * the user just made. Measured with the first version: after changing
   * `willow_wish` from skipped to answered, `input_hash` was byte-identical and
   * `updated_at` had not moved -- the delete button not reaching the block, which
   * is precisely what `input_hash` is for.
   *
   * Calling it unthrottled is safe because it is idempotent: it recomputes the
   * hash and returns `unchanged` after one indexed read when nothing differs. The
   * cost is bounded by how often a person edits an answer.
   *
   * During first-run onboarding this is a cheap no-op six times over, because
   * `completed_at` is still null and `generateLotus` refuses to distil a
   * half-written set (L3). It earns its place on the EDIT path, from /account.
   */
  after(() => generateLotus(gate.user.id));

  // `skipped` echoed back so a harness can diff the request against what was
  // actually recorded. Never the text.
  return NextResponse.json({ ok: true, key, skipped: answer.skipped });
}
