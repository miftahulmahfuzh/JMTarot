/**
 * DELETE one of the six (L13, roadmap §8's erasure right made concrete).
 *
 * **L13's ASYMMETRY IS GONE AS OF 2026-07-29 AND THIS PARAGRAPH IS KEPT INVERTED,
 * because the failure mode of a reversed decision is somebody restoring it.** It
 * read: *"THE SIX ARE DELETABLE BUT NOT EDITABLE, and that asymmetry is the
 * decision rather than an omission. Editing them turns a rite into a settings page
 * and drains the conceit; it also means the reader's sense of you changes under
 * you."*
 *
 * Miftah's ruling, on a phone: a querent must be able to see what they said and fix
 * it. The conceit is protected the way V8 already protected the delete control --
 * the section sits below the persona, the rows are labelled by question, and
 * nothing is revealed until tapped -- and the "settles under you" objection is
 * answered rather than dismissed, because the persona now regenerates on the next
 * visit, which is when the querent is there to see it change.
 *
 * So the six are now readable (`GET` below), editable
 * (`POST /api/onboarding/answer`, whose own comment always said it *"earns its
 * place on the EDIT path, from /account"*) and deletable (`DELETE`). The three
 * FACTS were always editable -- names are typo-prone and the nickname is what the
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
 * THE SCREEN THAT HOSTS THIS IS `/account`, AND IT EXISTS NOW. W3 shipped this
 * endpoint and left the button to whoever built that page; v0.3.0's
 * reconciliation §7.3 assigned it to V8 on the evidence that `/privacy` promises
 * per-answer clearing TWICE, in both locales -- clause 3 and clause 7 -- which made
 * it a published promise of a control nobody could perform, the exact mistake
 * `/account` itself made for a release. `AccountAnswers` is the caller.
 */
import { NextResponse, after } from 'next/server';
import { isFreeText, isOnboardingQuestionKey } from '@/data/onboarding';
import { db } from '@/lib/db/client';
import { deleteAnswer, getAnswer } from '@/lib/db/queries/onboarding';
import { getT } from '@/lib/i18n/t';
import { generateLotus } from '@/lib/prompt/lotus.generate';
import { badRequest, onboardingGate, serverError } from '../../shared';

/** Both verbs decrypt -- the GET directly, the DELETE during the regeneration. */
export const runtime = 'nodejs';

/** Headroom for the `after()` regeneration, which makes a model call. */
export const maxDuration = 60;

/**
 * GET one answer, decrypted, because the querent tapped that question
 * (2026-07-29).
 *
 * **THIS IS THE ONE ROUTE IN THE APP THAT SENDS A DECRYPTED ONBOARDING ANSWER TO A
 * BROWSER, AND EVERY RULE ON IT FOLLOWS FROM THAT.**
 *
 *   1. **ONE KEY PER REQUEST, AND THERE MUST NEVER BE A BULK VARIANT.** A
 *      `GET /api/onboarding/answers` returning all six would put `worst_thing`'s
 *      plaintext in the response to *opening a page* -- the render-path decryption
 *      `/account` deliberately avoids by calling `answerPresence`, which reads the
 *      column's NULLITY and not the column. The key is in the PATH rather than a
 *      query parameter for the same reason `DELETE` puts it there: it is part of
 *      the resource's identity, and a list is then a different route somebody has
 *      to write on purpose.
 *   2. **`private, no-store`.** No shared cache, no disk, no history entry. It is
 *      the most sensitive response this app produces.
 *   3. **NOTHING IS LOGGED ON THE FAILURE PATH.** The rule CLAUDE.md states three
 *      times -- for `flush.ts`, `moderation/log.ts` and `auth.ts` -- is that a
 *      postgres error quotes its bound parameters. This statement binds only a
 *      user id and a question key, so the answer itself cannot appear in one; the
 *      rule is applied anyway, because this is not the file in which to reason
 *      about an exception.
 *
 * **A MISSING ROW IS A 404 AND A SKIP IS A 200.** They look alike on screen -- both
 * render an empty field -- and they are different facts: no row means the stepper
 * never reached that question, which after completion is a bug worth seeing rather
 * than an empty textarea worth editing.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string }> }) {
  const gate = await onboardingGate();
  if (!gate.ok) return gate.response;

  const { key } = await ctx.params;
  if (!isOnboardingQuestionKey(key)) return await badRequest();

  let answer;
  try {
    answer = await getAnswer(db, gate.user.id, key);
  } catch (err) {
    /* THE ERROR OBJECT IS NOT LOGGED. See rule 3 above. */
    console.error('onboarding answer read failed', {
      userId: gate.user.id,
      key,
      name: err instanceof Error ? err.name : typeof err,
    });
    return await serverError();
  }

  if (!answer) {
    return NextResponse.json(
      { error: (await getT())('onboarding.error.notFound') },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      key,
      /*
       * SENT RATHER THAN DERIVED CLIENT-SIDE, though `isFreeText` is pure and in
       * `@/data` and the client could call it. It decides which CONTROL the sheet
       * mounts -- a textarea against three plates against a slider -- and a client
       * that disagreed with the server about which kind a question is would post
       * `text` to a closed question and get an opaque 400 from `normaliseAnswer`.
       * One answer, from the side that owns the write.
       */
      freeText: isFreeText(key),
      /*
       * **THE PLAINTEXT, AND THE ONLY PLACE IT CROSSES THE WIRE.** Null for a skip,
       * for a closed question, and for a row whose ciphertext will not open --
       * which reads as a skip on purpose, because there is no answer to be had
       * from it and an empty field the querent can rewrite is the useful offer.
       */
      text: answer.text,
      choice: answer.choice,
      skipped: answer.skipped,
    },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}

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
  if (!isOnboardingQuestionKey(key)) return await badRequest();

  let existed: boolean;
  try {
    existed = await deleteAnswer(db, gate.user.id, key);
  } catch (err) {
    console.error('onboarding answer delete failed', { userId: gate.user.id, key, err });
    return await serverError();
  }

  if (!existed) {
    // 404 rather than a cheerful 200: reporting success for an erasure that
    // erased nothing is the wrong answer to give about someone's data.
    return NextResponse.json({ error: (await getT())('onboarding.error.notFound') }, { status: 404 });
  }

  /*
   * `generateLotus` directly, NOT `scheduleLotusRefresh` -- the same reason the
   * answer route gives. The scheduler's cooldown exists to bound the speculative
   * repair the reading path fires; used here it would swallow the erasure the
   * user just asked for, and that is exactly how the delete button becomes a lie.
   *
   * ── THE PERSONA CALL WAS HERE AND IS DELIBERATELY GONE (2026-07-29) ──────────
   *
   * Miftah's ruling: regenerate the Inner Lotus on the next `/account` open rather
   * than on the write, to spend fewer model calls. So the pair that used to run
   * here is now split, and **the split is not symmetric because the two artifacts
   * do not carry the same obligation:**
   *
   *   `lotus_avatars.summary` STAYS EAGER, and this is an ERASURE duty rather than
   *   a freshness one. `getLotusBlock` reads it into EVERY reading prompt, so a
   *   deferred rewrite means a reading taken between this request and the querent's
   *   next `/account` visit is still generated from the answer they just deleted.
   *   `/privacy` clause 3 promises otherwise, twice, in both locales -- which is
   *   the whole reason this endpoint reaches past its own table.
   *
   *   `personas.body` DEFERS. Nothing reads it except `/account`, so a stale
   *   paragraph costs nobody anything until somebody looks at it, and at that
   *   moment the read path regenerates. That is one model call per edit instead of
   *   two, and NONE at all for a querent who fixes three answers before reopening
   *   the page.
   *
   * **WHAT MOVED WITH IT, AND WITHOUT WHICH THIS IS A BUG:** V8's A13 rule that
   * `PERSONA_MIN_AGE_SECONDS` must never guard a user-caused regeneration was
   * satisfied by calling the generator DIRECTLY from here. Deferring means the
   * READ path now has to tell a user edit from ordinary hash drift, and it does --
   * `answersUpdatedAt` against `personas.updated_at`, in `isPersonaStale`. Deleting
   * that arm reinstates W3's swallowed-edit bug with its exact signature:
   * `input_hash` moved and `updated_at` frozen.
   *
   * `getLocale()` IS GONE TOO, because nothing in this `after()` needs a locale any
   * more. It was resolved outside the callback on purpose -- it reads the request's
   * forwarded header and an `after()` runs once the response is on its way -- and
   * that reasoning now lives on `/api/persona`, which is where the generation does.
   */
  after(async () => {
    await generateLotus(gate.user.id).catch(() => {});
  });

  return NextResponse.json({ ok: true, key });
}
