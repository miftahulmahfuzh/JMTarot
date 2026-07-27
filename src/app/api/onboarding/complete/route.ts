/**
 * The authoritative submit (L2). Sets `completed_at`, and nothing else does.
 *
 * FOUR THINGS HAPPEN BEFORE THE RESPONSE, AND THE ORDER MATTERS:
 *
 *   1. everything the client holds is upserted, in ONE transaction
 *   2. the six are confirmed present -- otherwise `completed_at` is not set
 *   3. `completed_at` is set
 *   4. the session is re-minted with `onb: true`
 *
 * STEP 4 CANNOT BE DEFERRED, and it is the single most likely bug at the W2/W3
 * seam. The gate reads `onb` out of the cookie; if the row says complete and the
 * cookie still says false, the user taps "Pilih pembacamu" and middleware sends
 * them straight back into the questionnaire they just finished. The
 * `/onboarding` page repairs that state (see `SessionRepair`), but arriving there
 * at all is a visible flash of the thing they escaped.
 *
 * The distillation is step 5 and runs in `after()`, wired in Task 8. The user
 * never waits for a model call.
 */
import { NextResponse, after } from 'next/server';
import { z } from 'zod';
import { generateLotus } from '@/lib/prompt/lotus.generate';
import {
  ONBOARDING_MAX_ANSWER_CHARS,
  ONBOARDING_QUESTION_KEYS,
  isFreeText,
  normaliseAnswer,
  type OnboardingAnswer,
} from '@/data/onboarding';
import { refreshSession } from '@/lib/auth/auth';
import { db } from '@/lib/db/client';
import { getAnsweredKeys, upsertAnswers } from '@/lib/db/queries/onboarding';
import { markOnboardingComplete, upsertProfileFacts } from '@/lib/db/queries/profile';
import { sanitizeAnswer, stripUntrusted } from '@/lib/prompt/sanitize';
import { AnswerBody, FactsBody, badRequest, onboardingGate, readJson, serverError } from '../shared';

export const runtime = 'nodejs';

const Body = z.object({
  /** Absent when the facts step was completed in an earlier session. */
  facts: FactsBody.optional(),
  /** Everything this session answered. Absent keys keep whatever row they have. */
  answers: z.array(AnswerBody).max(ONBOARDING_QUESTION_KEYS.length).optional(),
});

/** Thrown to roll the transaction back when the set is not actually complete. */
class Incomplete extends Error {
  constructor(readonly missing: string[]) {
    super(`missing answers: ${missing.join(', ')}`);
  }
}

export async function POST(request: Request) {
  const gate = await onboardingGate();
  if (!gate.ok) return gate.response;

  const parsed = Body.safeParse(await readJson(request));
  if (!parsed.success) return await badRequest();

  /*
   * Normalise BEFORE opening the transaction. `normaliseAnswer` throws on a
   * closed value outside its set, and that is a 400 rather than a rollback --
   * doing it inside would mean a database round trip to discover a validation
   * error.
   */
  let answers: OnboardingAnswer[];
  try {
    answers = (parsed.data.answers ?? []).map((raw) => {
      const cleaned = isFreeText(raw.key)
        ? sanitizeAnswer(raw.text, ONBOARDING_MAX_ANSWER_CHARS)
        : null;
      return normaliseAnswer(raw.key, {
        text: cleaned,
        choice: raw.choice,
        skipped: raw.skipped === true || (isFreeText(raw.key) && cleaned === null),
      });
    });
  } catch {
    return await badRequest();
  }

  const facts = parsed.data.facts;
  const fullName = facts ? stripUntrusted(facts.fullName) : null;
  const nickname = facts ? stripUntrusted(facts.nickname) : null;
  if (facts && (fullName!.length === 0 || nickname!.length === 0)) return await badRequest();

  let completedAt: Date | null;
  try {
    /*
     * ONE TRANSACTION, and the reason is the state it makes unreachable: a user
     * marked onboarded with four of six answers written. Onboarding is asked
     * exactly once, so that user can never be asked again, and their Lotus block
     * would be distilled from a set nobody can complete.
     */
    completedAt = await db.transaction(async (tx) => {
      if (facts) {
        await upsertProfileFacts(tx, gate.user.id, {
          fullName: fullName!,
          nickname: nickname!,
          birthDate: facts.birthDate,
        });
      }

      await upsertAnswers(tx, gate.user.id, answers);

      /*
       * THE COMPLETENESS CHECK, READ BACK FROM THE DATABASE rather than from the
       * request. The client is trusted to say what it answered and not to say
       * that it finished: a bare `POST /api/onboarding/complete` with an empty
       * body would otherwise mark a brand-new user onboarded with nothing stored,
       * and since `onb` also gates `/api/reading`, that is the whole gate.
       *
       * Reading it back inside the transaction also covers the resume case for
       * free -- rows written in a previous session count, and the client never
       * had to know about them.
       */
      const recorded = new Set(await getAnsweredKeys(tx, gate.user.id));
      const missing = ONBOARDING_QUESTION_KEYS.filter((k) => !recorded.has(k));
      if (missing.length > 0) throw new Incomplete(missing);

      // Idempotent, and it keeps the FIRST timestamp: a replayed submit must not
      // move the date. Null means there is no profiles row, so the facts step
      // never completed.
      return markOnboardingComplete(tx, gate.user.id);
    });
  } catch (err) {
    if (err instanceof Incomplete) {
      // 400 and not 409: the request was wrong about being final. The body names
      // what is missing so the stepper could route back to it -- this is our own
      // client, and the keys are not a secret.
      return NextResponse.json(
        { error: 'Belum semua pertanyaan terjawab.', missing: err.missing },
        { status: 400 },
      );
    }
    console.error('onboarding completion failed', { userId: gate.user.id, err });
    return await serverError();
  }

  if (!completedAt) {
    // No profiles row: the facts step never landed. The stepper cannot reach
    // this, and a hand-rolled request should not get a 500 for it.
    return await badRequest();
  }

  /*
   * RE-MINT. `refreshSession()` is `unstable_update({})`, whose jwt branch
   * IGNORES its payload and re-reads `profiles.completed_at` -- which is why
   * `POST /api/auth/session` is not a way to declare yourself onboarded, and why
   * the ordering above matters: the row must already say complete or this
   * re-reads `false` and changes nothing.
   *
   * A FAILURE HERE IS NOT FATAL. The row is written and onboarding really is
   * finished; the cookie is merely behind. `/onboarding` repairs that itself, so
   * the honest response is a 200 that reports the cookie was not refreshed
   * rather than a 500 that suggests nothing was saved.
   */
  let sessionRefreshed = false;
  try {
    await refreshSession();
    sessionRefreshed = true;
  } catch (err) {
    console.error('onboarding completed but the session re-mint failed', {
      userId: gate.user.id,
      err,
    });
  }

  /*
   * THE DISTILLATION RUNS AFTER THE RESPONSE IS FLUSHED (D9/§6, L7).
   *
   * `after()` runs its callback once the response has gone, inside the same
   * serverless invocation -- the Vercel equivalent of the goroutine there is no
   * way to spawn. The user taps "Pilih pembacamu" and lands on the reader picker
   * in the time one round trip takes, not in the time a model call takes.
   *
   * The alternative is a spinner at the end of a nine-step form, which is exactly
   * where abandonment costs the most because the data is already collected.
   *
   * `generateLotus` never throws, so there is nothing to catch. If it fails
   * anyway, the next reading's repair picks it up (L15) -- absence of the row is
   * the "needs generation" signal, which is why there is no status column.
   *
   * WHAT THE USER SEES IF THEY BEAT IT: nothing. No shimmer, no "preparing your
   * reading". `getLotusBlock` returns null and the reading is built without the
   * block -- exactly the reading a fully-skipped user gets, which is a perfectly
   * good reading. Their SECOND reading has it.
   */
  after(() => generateLotus(gate.user.id));

  return NextResponse.json({ ok: true, sessionRefreshed });
}
