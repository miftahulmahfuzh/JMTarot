/**
 * The three audited reveals, as one ordering in one file. v0.5.0 / A5.
 *
 * ── WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT IN THE ROUTES ─────────────
 *
 * Plan §6.2 writes the sequence — gate, params, decrypt, `await recordAdminAccess`,
 * respond — inline in each route handler, and §9's fence A5-28 asserts it against the
 * route's SOURCE. **A source-level assertion is the weakest instrument available for
 * the release's highest-value invariant** (R30 calls it *the highest-value seam*), and
 * this project has a precedent for what to do instead: `delete.integration.test.ts`
 * proves `redactForUser()`'s ordering with a **`pg_temp` trigger that raises**, and the
 * ordering it proves is the same shape as this one.
 *
 * A route handler cannot be driven by that test. It imports `next/server` and the
 * `server-only` singleton, and this repo's own precedent is explicit —
 * `sweep.retention.integration.test.ts`: *"the route is not exercised … so the
 * statement is duplicated here"*. Duplicating an ORDERING is worse than duplicating a
 * `DELETE`, because the copy can be right while the original is wrong.
 *
 * **So the ordering lives here, handle-first, with no `next/*` import, and
 * `reveal.integration.test.ts` drives it with a trigger that makes the audit write
 * fail.** The routes become a gate, a uuid guard and a delegation. The fence still
 * asserts the routes contain no `try` around a reveal and no `after(`, and it now also
 * asserts that `recordAdminAccess` appears in THIS file and in no route — which is a
 * stronger claim than the original, because it is checkable *and* executable.
 *
 * ── THE ORDERING, AND WHY EACH STEP IS WHERE IT IS (A5-10, A5-11) ───────────
 *
 *   1. **Does this resource belong to the subject?** A read that touches no plaintext:
 *      six nullity flags, one `redacted_at`, or one `select id`. Without this step a
 *      404 would still write an audit row, and anybody holding the admin's session could
 *      salt a subject's own audit trail with reads that never happened.
 *   2. **`await recordAdminAccess(...)`, with NO `try`/`catch`.** It THROWS by contract
 *      (`queries/admin/audit.ts`, reconciliation R30) and the throw is the mechanism: a
 *      failed audit write must be a failed reveal, and the only way to make that true is
 *      to let the exception escape. `after()` is wrong here by definition — an `after()`
 *      callback runs once the response is on its way, which is the exact opposite of
 *      *before the response*.
 *   3. **Then decrypt / read the prose.** The plaintext never exists in this process
 *      before the row that records it has committed. `src/lib/account/delete.ts`'s
 *      ordering precedent, in the other direction: there, redaction runs before the flag
 *      so a failure aborts rather than marking an account deleted with its text intact.
 *
 * **The cost is a row for a reveal that turns out to have nothing to reveal** — a
 * skipped answer, a `failed` reading with no body. That is accepted: *an audit trail
 * that over-records is honest; one that under-records is not* (`audit.ts`). The one
 * exception is a moderation flag whose text is redacted or was never stored, where the
 * STATE is knowable before any decrypt and A5-11 requires no row: padding the log with
 * no-op reads makes the subject-access answer wrong in the alarming direction.
 *
 * ── AND NOTHING HERE LOGS A DRIVER ERROR (A5-18) ────────────────────────────
 *
 * There is no `catch` in this file at all. Every failure — a thrown audit write, a dead
 * database — propagates to the route, which logs the error's **class** and the resource
 * ids and nothing else. A postgres error quotes the failing statement *and its bound
 * parameters*, and on these paths those include a subject id and a question key.
 */
import { recordAdminAccess } from '@/lib/db/queries/admin/audit';
import { answerStatesForAdmin } from '@/lib/db/queries/admin/detail';
import { flagQuestionState, revealFlagQuestion } from '@/lib/db/queries/admin/moderation';
import {
  readingExistsForUser,
  readingWithBodyForAdmin,
  type AdminReadingBody,
} from '@/lib/db/queries/admin/readings';
import { getAnswer } from '@/lib/db/queries/onboarding';
import type { DbOrTx } from '@/lib/db/types';
import { isFreeText, type OnboardingQuestionKey } from '@/data/onboarding';
import type { AdminAnswerReveal, AdminFlagReveal } from './types';

/** Who is reading, and about whom. Both are `users.id`. */
export type RevealActor = { adminUserId: string; subjectUserId: string };

/** `notFound` is the ONLY refusal these functions produce, and the route turns it into
 *  a 404 with an empty body — the same response `adminNotFound()` gives an unauthorised
 *  caller, which is what makes "does this resource exist" unanswerable from outside. */
export type Revealed<T> = { ok: true; value: T } | { ok: false; reason: 'notFound' };

/**
 * One of the six onboarding answers, decrypted.
 *
 * **`getAnswer` IS THE ONLY DECRYPT SITE FOR THAT COLUMN AND A5 ADDS NONE** (A5-6).
 * Writing an `adminGetAnswer` that repeated the `decryptField(row, answerAad(...))` pair
 * would make the audit two files instead of one, and **a mismatched AAD is
 * indistinguishable from data loss** — the row would read as a skip for ever.
 *
 * The audit row is written for any answer row that EXISTS, including a skip, because
 * whether it is a skip is not knowable without the decrypt this row records. See the
 * header's "cost" paragraph.
 */
export async function revealAnswer(
  db: DbOrTx,
  actor: RevealActor,
  key: OnboardingQuestionKey,
): Promise<Revealed<AdminAnswerReveal>> {
  // 1. Ownership and existence, touching no plaintext: six nullity flags.
  const states = await answerStatesForAdmin(db, actor.subjectUserId);
  const state = states.find((s) => s.key === key);
  if (!state || !state.asked) return { ok: false, reason: 'notFound' };

  // 2. The audit row. NO try/catch: the throw IS the control (R30).
  await recordAdminAccess(db, {
    adminUserId: actor.adminUserId,
    subjectUserId: actor.subjectUserId,
    resource: 'onboarding_answer',
    resourceKey: key,
  });

  // 3. Only now does the plaintext exist in this process.
  const answer = await getAnswer(db, actor.subjectUserId, key);
  if (!answer) return { ok: false, reason: 'notFound' };

  return {
    ok: true,
    value: {
      key,
      /* Sent rather than derived client-side, the `/account` twin's reasoning: it
       * decides which shape the panel renders, and one answer from the side that owns
       * the column beats two implementations agreeing. */
      freeText: isFreeText(key),
      text: answer.text,
      choice: answer.choice,
      skipped: answer.skipped,
    },
  };
}

/**
 * One flagged question, decrypted — **and only the `available` state writes a row**
 * (A5-11).
 *
 * The state is read first and read again inside `revealFlagQuestion`, deliberately:
 * between the two statements the 30-day sweep could have redacted the row, and returning
 * this function's stale opinion of the state would render *"ada teks"* over an empty
 * string. The second read is the authority; the first exists to decide whether an audit
 * row is owed.
 */
export async function revealFlag(
  db: DbOrTx,
  actor: RevealActor,
  flagId: string,
): Promise<Revealed<AdminFlagReveal>> {
  const state = await flagQuestionState(db, actor.subjectUserId, flagId);
  if (!state) return { ok: false, reason: 'notFound' };

  if (state.state === 'redacted') {
    return {
      ok: true,
      value: { flagId, state: 'redacted', redactedAt: state.redactedAt.toISOString() },
    };
  }
  if (state.state === 'never_stored') {
    return { ok: true, value: { flagId, state: 'never_stored' } };
  }

  await recordAdminAccess(db, {
    adminUserId: actor.adminUserId,
    subjectUserId: actor.subjectUserId,
    resource: 'moderation_question',
    resourceKey: flagId,
  });

  const revealed = await revealFlagQuestion(db, actor.subjectUserId, flagId);
  if (!revealed) return { ok: false, reason: 'notFound' };
  return { ok: true, value: revealed };
}

/**
 * One reading's prose.
 *
 * **AUDITED ON EVERY 200, INCLUDING A `failed` READING WHOSE `body` IS NULL** — unlike
 * the two above there is no "nothing to reveal" state worth distinguishing, because the
 * response still carries `question`, which is plaintext the operator has now read.
 */
export async function revealReading(
  db: DbOrTx,
  actor: RevealActor,
  readingId: string,
): Promise<Revealed<AdminReadingBody>> {
  const owned = await readingExistsForUser(db, actor.subjectUserId, readingId);
  if (!owned) return { ok: false, reason: 'notFound' };

  await recordAdminAccess(db, {
    adminUserId: actor.adminUserId,
    subjectUserId: actor.subjectUserId,
    resource: 'reading_body',
    resourceKey: readingId,
  });

  const row = await readingWithBodyForAdmin(db, actor.subjectUserId, readingId);
  if (!row) return { ok: false, reason: 'notFound' };
  return { ok: true, value: row };
}

/**
 * Opening `/admin/users/[id]` is itself a privileged read, and this is its row.
 *
 * **`resource = 'user_detail'` COVERS EVERY UNAUDITED PANEL ON THAT PAGE**, which is
 * how §4's legend can say `Audited: no` for eleven of the fourteen sections: the
 * questions, the Lotus, the persona, the summaries and the verdicts are all rendered
 * from this one read, and this one row is what a subject-access answer quotes for them.
 *
 * **AWAITED BEFORE THE PANELS ARE READ, for the same reason as the three reveals**, and
 * a throw becomes the page's failure state with no data rendered — not a 500, because a
 * page that 500s tells an operator nothing on the one occasion they came looking, and
 * not a partial render, because that would be prose on screen with no record that it was
 * read.
 *
 * **There is deliberately no row for the LIST page** (§13.7, reconciliation §9.8): fifty
 * audit rows per page load would make §4.14 unreadable. That is this release's one
 * stated gap in the audit trail, and it is written into the copy where the operator can
 * see it rather than only here.
 */
export async function recordUserDetailView(db: DbOrTx, actor: RevealActor): Promise<void> {
  await recordAdminAccess(db, {
    adminUserId: actor.adminUserId,
    subjectUserId: actor.subjectUserId,
    resource: 'user_detail',
    resourceKey: null,
  });
}
