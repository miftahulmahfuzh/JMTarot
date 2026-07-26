/**
 * DELETE one of the six (L13, roadmap §8's erasure right made concrete).
 *
 * THE SIX ARE DELETABLE BUT NOT EDITABLE, and that asymmetry is the decision
 * rather than an omission. Editing them turns a rite into a settings page and
 * drains the conceit; it also means the reader's sense of you changes under you.
 * Deletion is a right, and it costs one button. The three FACTS are the other way
 * round -- editable, because names are typo-prone and the nickname is what the
 * reader calls you -- and they live on `POST /api/onboarding/facts`.
 *
 * WHAT DELETING ACTUALLY DOES, AND WHY IT IS NOT A ROW DELETE. The row survives
 * with `answer_text = NULL, skipped = true`. Removing it outright would make
 * `nextUnansweredKey` treat the question as never asked, so a user who deleted an
 * answer would be marched back into a stepper they had finished. A skip is also
 * the honest record: they were asked, and there is now no answer.
 *
 * THE DELETE HAS TO REACH THE LOTUS BLOCK OR IT IS A LIE. Nulling the column is
 * only half the erasure -- the deleted material is also PARAPHRASED inside
 * `lotus_avatars.summary`, which is read into every subsequent reading prompt. So
 * this schedules the regeneration, `lotusInputHash` changes because the answer
 * set changed, and `generateLotus` rewrites the block without that material. A
 * delete button whose effect stops at this table is worse than no delete button.
 *
 * THE SCREEN THAT HOSTS THIS IS NOT W3's TO SHIP HERE. Reconciliation R14 puts
 * the controls at `/account`, which W3 owns and which is not in this task. W3
 * ships the endpoint; `/account` wires the button.
 */
import { NextResponse, after } from 'next/server';
import { isOnboardingQuestionKey } from '@/data/onboarding';
import { db } from '@/lib/db/client';
import { deleteAnswer } from '@/lib/db/queries/onboarding';
import { generateLotus } from '@/lib/prompt/lotus.generate';
import { badRequest, onboardingGate, serverError } from '../../shared';

/** `getAnswers` decrypts during the regeneration, and that is `node:crypto`. */
export const runtime = 'nodejs';

/** Headroom for the `after()` regeneration, which makes a model call. */
export const maxDuration = 60;

export async function DELETE(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  const gate = await onboardingGate();
  if (!gate.ok) return gate.response;

  const { key } = await ctx.params;

  /*
   * The key comes from the URL, so it is narrowed rather than trusted. An
   * unknown key would otherwise reach `deleteAnswer`, match nothing, and return
   * a cheerful 404 for a question that does not exist -- which reads as "already
   * deleted" and hides a client bug.
   */
  if (!isOnboardingQuestionKey(key)) return badRequest();

  let existed: boolean;
  try {
    existed = await deleteAnswer(db, gate.user.id, key);
  } catch (err) {
    console.error('onboarding answer delete failed', { userId: gate.user.id, key, err });
    return serverError();
  }

  if (!existed) {
    // 404 rather than a cheerful 200: reporting success for an erasure that
    // erased nothing is the wrong answer to give about someone's data.
    return NextResponse.json({ error: 'Jawaban itu tidak ada.' }, { status: 404 });
  }

  /*
   * `generateLotus` directly, NOT `scheduleLotusRefresh` -- the same reason the
   * answer route gives. The scheduler's cooldown exists to bound the speculative
   * repair the reading path fires; used here it would swallow the erasure the
   * user just asked for, and that is exactly how the delete button becomes a lie.
   */
  after(() => generateLotus(gate.user.id));

  return NextResponse.json({ ok: true, key });
}
