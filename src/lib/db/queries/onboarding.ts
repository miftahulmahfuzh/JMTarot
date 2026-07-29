/**
 * `onboarding_answers`, and the one read a resumed stepper needs.
 *
 * WRITTEN BY W3 INTO W1's DIRECTORY. W1 owns `src/lib/db/**` and shipped
 * `profile.ts`, `history.ts`, `frequency.ts` and `summary.ts`; this module is
 * named in W3's plan under *Interfaces I need from W1* and did not land with
 * W1, so W3 supplies it against that specification rather than inventing one.
 * No table and no column is redefined here -- see `../schema.ts`, which already
 * carries W3's three folded deltas.
 *
 * It obeys the four rules in `profile.ts`'s header: the handle comes first, the
 * types are imported type-only, there is no React and no Next, and it returns
 * domain shapes.
 *
 * THIS MODULE IS THE ONLY PLACE `answer_text` IS ENCRYPTED OR DECRYPTED, AND
 * THAT IS A DEVIATION FROM THE PLAN WORTH READING. W3's Task 6 Step 3 puts
 * `encryptField()` in the route handler. Doing it here instead, symmetrically
 * with the decrypt that `getAnswers` was always specified to do, buys three
 * things:
 *
 *   1. `OnboardingAnswer.text` KEEPS ITS DOCUMENTED MEANING. That field says
 *      "plaintext". Under the plan's split, `upsertAnswer` would receive
 *      ciphertext in a field typed and documented as plaintext while
 *      `getAnswers` returned real plaintext in the same field -- the same type
 *      meaning two different things depending on direction, which is how a
 *      later refactor writes plaintext into the column by accident.
 *   2. THE AAD IS CONSTRUCTED ONCE. Reconciliation R2 made the AAD required
 *      precisely so it cannot be forgotten; two call sites building it by hand
 *      is the next-best way to get it wrong, and a mismatched AAD is
 *      indistinguishable from data loss.
 *   3. THE AUDIT IS ONE FILE. "Does anything write this column in plaintext?"
 *      is answered by reading this file, not by auditing every handler that
 *      ever touches an answer.
 *
 * The property Task 6 Step 5 verifies is unchanged and still verifiable the
 * same way: the column holds `v1.…` ciphertext and a skip holds NULL.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Profile } from '@/data/types';
import {
  ONBOARDING_QUESTION_KEYS,
  ONBOARDING_VERSION,
  isFreeText,
  type OnboardingAnswer,
  type OnboardingQuestionKey,
} from '@/data/onboarding';
import { answerAad, decryptField, encryptField } from '../crypto';
import { onboardingAnswers, profiles } from '../schema';
import type { DbOrTx } from '../types';

/**
 * Everything `/onboarding` needs to render, in one place.
 *
 * TWO QUERIES AND DELIBERATELY NO DECRYPTION. `answeredKeys` is which questions
 * have a row -- not what is in them -- because the server never sends answer
 * text back to a browser. Decrypting `worst_thing` to pre-fill a textarea is
 * not a thing this app does, and the resume case does not need it: a revisited
 * step shows an empty field and says an answer is already saved.
 *
 * This is the one DB read on a render path in W3, and it is the exemption
 * roadmap non-negotiable #1 allows: the page cannot exist without it. The
 * `onb` claim in the session cookie is what keeps every OTHER route free of it.
 */
export async function getOnboardingState(
  db: DbOrTx,
  userId: string,
): Promise<{ profile: Profile | null; answeredKeys: OnboardingQuestionKey[] }> {
  const [profileRows, answerRows] = await Promise.all([
    db
      .select({
        fullName: profiles.fullName,
        nickname: profiles.nickname,
        birthDate: profiles.birthDate,
        onboardingVersion: profiles.onboardingVersion,
        completedAt: profiles.completedAt,
      })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1),
    db
      .select({ questionKey: onboardingAnswers.questionKey })
      .from(onboardingAnswers)
      .where(eq(onboardingAnswers.userId, userId)),
  ]);

  const row = profileRows[0];

  return {
    /*
     * `completedAt` crosses to a client component, so it becomes an ISO string
     * here rather than at the boundary. A Date would not survive the
     * serialization, and converting it in the page would put the same three
     * lines in every future caller.
     */
    profile: row
      ? {
          fullName: row.fullName,
          nickname: row.nickname,
          birthDate: row.birthDate,
          onboardingVersion: row.onboardingVersion,
          completedAt: row.completedAt ? row.completedAt.toISOString() : null,
        }
      : null,
    answeredKeys: answerRows.map((a) => a.questionKey),
  };
}

/**
 * WHICH questions have a row. Decrypts nothing, reads no text.
 *
 * The completion check (Task 6) and the resume read both want exactly this, and
 * it has to be callable inside the completion transaction -- `getOnboardingState`
 * would drag the profile along and is shaped for a page render.
 *
 * It reading no text is not an optimisation, it is the guarantee: this is the
 * function on the path that answers "is the set complete", and it must never be
 * the reason a plaintext answer exists in memory.
 */
export async function getAnsweredKeys(
  db: DbOrTx,
  userId: string,
): Promise<OnboardingQuestionKey[]> {
  const rows = await db
    .select({ questionKey: onboardingAnswers.questionKey })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, userId));
  return rows.map((r) => r.questionKey);
}

/**
 * WHICH questions have an answer and which are a skip. **DECRYPTS NOTHING.**
 *
 * V8's per-answer clearing (reconciliation §7.3) needs to render six rows saying
 * "answered" or "not answered" with a clear control beside the first kind, and
 * `getAnsweredKeys` cannot tell the two apart — every one of the six has a row from
 * the moment the stepper passes it, whether it was answered or skipped.
 *
 * **`answer_text IS NOT NULL` IS THE TEST, AND IT IS THE SAME PREDICATE THE AUDIT
 * QUERY IN `schema.ts` USES.** A skip is `answer_text IS NULL` and NEVER an
 * encrypted empty string — which would be indistinguishable from a real answer in a
 * dump, and which is why that audit query must return 0.
 *
 * IT READS THE COLUMN'S NULLITY AND NOT THE COLUMN. `worst_thing` is the most
 * sensitive string in the product; the page that lets somebody delete it has no
 * business decrypting it, and "show which answers exist without showing their text
 * until asked" is the requirement §7.3 folded in. There is no "until asked" here:
 * V8 does not offer a reveal at all, so the plaintext never leaves the server.
 */
export async function answerPresence(
  db: DbOrTx,
  userId: string,
): Promise<Array<{ key: OnboardingQuestionKey; answered: boolean }>> {
  const rows = await db
    .select({
      questionKey: onboardingAnswers.questionKey,
      skipped: onboardingAnswers.skipped,
      hasText: sql<boolean>`${onboardingAnswers.answerText} is not null`,
      choice: onboardingAnswers.answerChoice,
    })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, userId));

  const byKey = new Map(rows.map((r) => [r.questionKey, r]));

  // CATALOG ORDER, not row order, so the six rows on `/account` are always in the
  // order the querent was asked -- the same reason `lotusInputHash` iterates it.
  return ONBOARDING_QUESTION_KEYS.map((key) => {
    const row = byKey.get(key);
    return {
      key,
      answered:
        row !== undefined &&
        !row.skipped &&
        // A closed question stores its value in `answer_choice`, which is not
        // encrypted and is not text the querent typed. Both count as answered.
        (row.hasText || (row.choice !== null && row.choice !== '')),
    };
  });
}

/**
 * Every answer, DECRYPTED. Server-side only, and only ever on the way to the
 * distiller.
 *
 * AN UNDECRYPTABLE ANSWER READS AS A SKIP. That is `decryptField`'s documented
 * asymmetry rather than a shrug: it returns null on a missing key, a rotated
 * key, a wrong AAD or a tampered tag, and roadmap §8 already requires the app
 * to work without any given free-text answer. The alternative is a distillation
 * that throws for every user the moment a key changes. The failure is logged
 * inside `decryptField`, so it is not silent -- just not fatal.
 *
 * Returns rows in the catalog's asking order, so the prompt the distiller sees
 * has a stable shape regardless of what order the user answered in.
 */
export async function getAnswers(db: DbOrTx, userId: string): Promise<OnboardingAnswer[]> {
  const rows = await db
    .select({
      questionKey: onboardingAnswers.questionKey,
      answerText: onboardingAnswers.answerText,
      answerChoice: onboardingAnswers.answerChoice,
      skipped: onboardingAnswers.skipped,
    })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, userId));

  return rows.map((row) => {
    const text =
      row.answerText === null
        ? null
        : decryptField(row.answerText, answerAad(userId, row.questionKey));

    return {
      key: row.questionKey,
      text,
      choice: row.answerChoice,
      // A row whose ciphertext will not open is reported as skipped, because
      // that is what it now is: there is no answer to be had from it.
      skipped: row.skipped || (row.answerText !== null && text === null),
    };
  });
}

/**
 * ONE answer, DECRYPTED, for the querent to look at and edit (2026-07-29).
 *
 * ── THIS IS THE "UNTIL ASKED" THAT V8 MADE UNREACHABLE ───────────────────────
 *
 * `answerPresence` above says in its own header that reconciliation §7.3's
 * requirement was *"show which answers exist without showing their text until
 * asked"*, and that **"there is no 'until asked' here: V8 does not offer a reveal
 * at all"**. Miftah's ruling is that a querent must be able to see and fix what
 * they said, and a tap on a question IS asking. So this is the amendment that
 * header invited rather than a hole knocked in it, and L13's "the six are
 * deletable and NOT editable" is what actually changed.
 *
 * ── WHY IT IS ONE KEY AND WHY THERE IS NO `getAnswersForDisplay` ─────────────
 *
 * `getAnswers` already returns all six decrypted and is right to: it feeds the
 * distiller, server-side, and its output never leaves the process. A six-answer
 * READ PATH for a browser is a different thing entirely -- it would put
 * `worst_thing`'s plaintext in the response to opening a page, which is the
 * render-path decryption `/account` deliberately does not do. **One key per
 * request means the most sensitive string in the product crosses the wire only
 * when the querent tapped that specific row.**
 *
 * Returns null when there is no row at all -- a question the stepper never
 * reached. A row that exists with `answer_text IS NULL` is a SKIP and comes back
 * as one, which the caller renders as an empty field rather than as "not asked".
 *
 * AN UNDECRYPTABLE ANSWER READS AS A SKIP, which is `getAnswers`' documented
 * asymmetry and `decryptField`'s: a rotated key, a wrong AAD or a tampered tag
 * returns null, and there is genuinely no answer to be had from that row any more.
 * The querent sees an empty field they can rewrite, which is the only useful thing
 * left to offer them.
 */
export async function getAnswer(
  db: DbOrTx,
  userId: string,
  key: OnboardingQuestionKey,
): Promise<OnboardingAnswer | null> {
  const [row] = await db
    .select({
      answerText: onboardingAnswers.answerText,
      answerChoice: onboardingAnswers.answerChoice,
      skipped: onboardingAnswers.skipped,
    })
    .from(onboardingAnswers)
    .where(and(eq(onboardingAnswers.userId, userId), eq(onboardingAnswers.questionKey, key)))
    .limit(1);

  if (!row) return null;

  const text =
    row.answerText === null ? null : decryptField(row.answerText, answerAad(userId, key));

  return {
    key,
    text,
    choice: row.answerChoice,
    skipped: row.skipped || (row.answerText !== null && text === null),
  };
}

/**
 * When any of the six was last written, or null if none ever was.
 *
 * **THE SIGNAL THAT AN ANSWER EDIT WAS USER-CAUSED, AND IT IS TWO EXISTING
 * COLUMNS RATHER THAN A NEW ONE.** Since 2026-07-29 a facts edit still regenerates
 * the persona eagerly but an ANSWER edit does not -- it defers to the next
 * `/account` open, which is the whole LLM-call saving. That leaves the READ path
 * needing to tell "the querent just changed an answer" from "ten more readings
 * have accumulated", because `PERSONA_MIN_AGE_SECONDS` must throttle the second
 * and **must never guard the first**. Comparing this against
 * `personas.updated_at` answers it with no new state to keep in step: both columns
 * are already maintained BY HAND, here and in `upsertPersona`, because Drizzle's
 * `$onUpdate()` does not fire inside `onConflictDoUpdate`.
 *
 * `max()` over at most six rows on an indexed `user_id`, so it joins
 * `personaMaterial`'s existing `Promise.all` for free.
 *
 * IT READS NO TEXT. Same rule as `getAnsweredKeys`: a function on the path that
 * decides whether to regenerate must never be the reason a plaintext answer exists
 * in memory.
 */
export async function answersUpdatedAt(db: DbOrTx, userId: string): Promise<Date | null> {
  const [row] = await db
    /*
     * **TYPED `unknown`, NOT `Date`, AND CONVERTED BELOW. THE FIRST VERSION SAID
     * `sql<Date | null>` AND THAT WAS A LIE THE COMPILER BELIEVED.**
     *
     * Drizzle maps a timestamp to a `Date` when it knows the COLUMN; inside a raw
     * `sql` template there is no mapper, so postgres.js hands back whatever it hands
     * back — which for `max(timestamptz)` is a STRING. The assertion made
     * `answersTouchedAt` a `Date` as far as TypeScript was concerned, and
     * `personaStaleness` compares it with `>` against a real `Date` from
     * `personas.updated_at`. A string-versus-Date `>` coerces through
     * `ToPrimitive` and answers something, so **every answer edit would have been
     * compared wrongly with a green typecheck and a green unit suite** — the unit
     * tests pass real `Date`s in, because that is what the type says.
     *
     * Caught by the integration test asserting `.getTime()`, which is the only layer
     * that sees the driver. Exactly the trap `readingsForDay`'s `Boolean(...)`
     * comment names one file over: **`sql<T>` is an assertion the driver is not
     * obliged to honour.** Do not "tidy" this back into a typed template.
     */
    .select({ at: sql<unknown>`max(${onboardingAnswers.updatedAt})` })
    .from(onboardingAnswers)
    .where(eq(onboardingAnswers.userId, userId));

  const raw = row?.at ?? null;
  if (raw === null) return null;
  if (raw instanceof Date) return raw;
  /* A string or a number, depending on the driver's parser settings. An
     unparseable value reads as "no edit pending", which is the safe direction: it
     under-reports a user edit into ordinary drift rather than regenerating forever. */
  const at = new Date(raw as string);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * Write one answer. Idempotent on `(user_id, question_key)`.
 *
 * A SKIP WRITES `answer_text = NULL`, NEVER AN ENCRYPTED EMPTY STRING. The
 * second would be indistinguishable from an encrypted answer in a database
 * dump, which defeats the point of recording the skip at all (§5).
 *
 * `updatedAt` is set BY HAND in the conflict branch. Drizzle's `$onUpdate()`
 * fires on `db.update()` and NOT inside `onConflictDoUpdate` -- the trap
 * CLAUDE.md names -- so relying on the column definition leaves it frozen at
 * the first insert, and this column exists to answer "when did they change it?"
 * for the erasure right.
 */
export async function upsertAnswer(
  db: DbOrTx,
  userId: string,
  answer: OnboardingAnswer,
): Promise<void> {
  const answerText =
    answer.text === null || answer.skipped
      ? null
      : encryptField(answer.text, answerAad(userId, answer.key));

  // Belt to normaliseAnswer's braces. A closed question whose choice reached
  // here as prose would put unencrypted user text in `answer_choice`, the one
  // column in this table nothing treats as sensitive.
  const answerChoice = isFreeText(answer.key) ? null : answer.choice;

  await db
    .insert(onboardingAnswers)
    .values({
      userId,
      questionKey: answer.key,
      answerText,
      answerChoice,
      skipped: answer.skipped,
    })
    .onConflictDoUpdate({
      target: [onboardingAnswers.userId, onboardingAnswers.questionKey],
      set: { answerText, answerChoice, skipped: answer.skipped, updatedAt: new Date() },
    });
}

/**
 * The authoritative write at the end of the stepper (L2).
 *
 * ONE TRANSACTION, because a half-applied final submit is the state the whole
 * design exists to avoid: `completed_at` is about to be set on the strength of
 * these rows, and a user who is marked onboarded with four of six answers
 * written can never be asked again.
 *
 * The six per-step writes are best-effort resume markers; this repairs any that
 * were lost, and re-sending everything costs nothing because each upsert is
 * idempotent.
 */
export async function upsertAnswers(
  db: DbOrTx,
  userId: string,
  answers: readonly OnboardingAnswer[],
): Promise<void> {
  for (const answer of answers) {
    await upsertAnswer(db, userId, answer);
  }
}

/**
 * The per-answer erasure (L13, Task 10).
 *
 * DELETES THE TEXT, KEEPS THE ROW, AND THE ROW BECOMES A SKIP. Removing the row
 * outright would make `nextUnansweredKey` treat the question as never asked, so
 * a user who deleted an answer would be sent back into a stepper they finished.
 * A skip is also the honest record: they were asked and there is now no answer.
 *
 * This changes `lotusInputHash`, which makes the Lotus block stale, which the
 * next reading regenerates. That chain is what makes the delete button reach all
 * the way through -- a delete whose effect stops at this table is worse than no
 * delete button, because the deleted material stays paraphrased in a
 * current-looking block.
 *
 * Returns whether a row was actually there, so the handler can 404 rather than
 * reporting success for a question the user never answered.
 */
export async function deleteAnswer(
  db: DbOrTx,
  userId: string,
  key: OnboardingQuestionKey,
): Promise<boolean> {
  const rows = await db
    .update(onboardingAnswers)
    .set({ answerText: null, answerChoice: null, skipped: true, updatedAt: new Date() })
    .where(and(eq(onboardingAnswers.userId, userId), eq(onboardingAnswers.questionKey, key)))
    .returning({ questionKey: onboardingAnswers.questionKey });

  return rows.length > 0;
}

/**
 * Erase every free-text answer a user has, in one statement.
 *
 * For W7's account-deletion path, which needs the text gone before the 30-day
 * hard delete cascades the rows away. Kept here rather than in W7 so that the
 * only module that writes this column is still the only module that writes it.
 */
export async function clearFreeTextAnswers(db: DbOrTx, userId: string): Promise<void> {
  const freeText = (
    ['best_thing', 'worst_thing', 'most_loved', 'willow_wish'] satisfies OnboardingQuestionKey[]
  ).filter(isFreeText);

  await db
    .update(onboardingAnswers)
    .set({ answerText: null, skipped: true, updatedAt: new Date() })
    .where(
      and(
        eq(onboardingAnswers.userId, userId),
        inArray(onboardingAnswers.questionKey, freeText),
      ),
    );
}

/** Re-exported so a caller writing `onboarding_version` cannot invent a number. */
export { ONBOARDING_VERSION };
