/**
 * `GET /api/admin/users/[id]/answer/[key]` — **the most sensitive response this
 * application produces.** v0.5.0 / A5, task 7.
 *
 * The precedent this copies is `GET /api/onboarding/answer/[key]` — V8's, where the
 * querent reads their own answer — with one addition and one subtraction: every reveal
 * here writes an `admin_access_log` row before the plaintext exists, and there is no write
 * verb at all.
 *
 * ── ONE KEY PER REQUEST, AND THERE MUST NEVER BE A BULK VARIANT (A5-5) ───────
 *
 * CLAUDE.md, verbatim, applied to a second reader: *"a six-answer read for a browser puts
 * the most sensitive string in the product into the response to opening a page."* The key
 * is in the PATH rather than a query parameter because it is part of the resource's
 * identity — which makes a list a different route somebody has to write on purpose.
 *
 * ── THE ORDERING IS IN `@/lib/admin/reveal`, AND THAT IS THE POINT ───────────
 *
 * `revealAnswer()` holds it: existence → `await recordAdminAccess(...)` with no
 * `try`/`catch` → decrypt. It lives in a handle-first module with no `next/*` import so
 * that **`reveal.integration.test.ts` can drive it with a `pg_temp` trigger that makes the
 * audit insert raise** — the `delete.integration.test.ts` instrument, applied to the
 * invariant reconciliation R30 calls the highest-value seam in the release. A route
 * handler cannot be driven by that test (it imports `next/server` and the `server-only`
 * singleton), and an ordering asserted only by grep is the weakest instrument available for
 * the one control that fails silently.
 *
 * **So there is no `try` around the reveal here.** A thrown audit write becomes Next's
 * 500 and the plaintext is discarded unsent. **That is the correct outcome and must not be
 * softened into a 200 with a warning**: the alternative is somebody's worst memory on
 * screen with no record that it was read. The `catch` below exists for the DATABASE being
 * unreachable, and it returns 503 — which cannot be reached by an audit failure, because
 * the audit failure is a database error too. That is deliberate: **both outcomes refuse,
 * and neither returns text.**
 *
 * ── AN UNKNOWN KEY IS A 404, NOT A 400 ─────────────────────────────────────
 *
 * An unknown key on an admin path is a URL that should not resolve, and every refusal in
 * this tree is byte-identical (A5-1). A missing ROW is also a 404: the stepper never
 * reached that question, which after completion is a bug worth seeing rather than an empty
 * field worth editing. A SKIP is a 200 with `text: null` — they look alike on screen and
 * they are different facts.
 */
import { isOnboardingQuestionKey } from '@/data/onboarding';
import { revealAnswer } from '@/lib/admin/reveal';
import { db } from '@/lib/db/client';
import { adminNotFound, logAdminFailure, ok, requireAdmin, unavailable, UUID_RE } from '../../../shared';

export const runtime = 'nodejs';
/** 15s, paired with `REVEAL_ABORT_MS = 12_000` on the client (§4.2 rule 2) and above
 *  A3's 10s statement timeout, so the database gives up first with a diagnosable error. */
export const maxDuration = 15;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; key: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, key } = await ctx.params;
  if (!UUID_RE.test(id) || !isOnboardingQuestionKey(key)) return adminNotFound();

  /*
   * NO `try` AROUND `revealAnswer`, and the reveal is not wrapped in a transaction
   * either: `withAdminRead` sets `transaction_read_only = on`, which would make the audit
   * INSERT fail — the one write this surface performs. A read-only wrapper around an
   * audited reveal is the tidy-up that turns every reveal into a 500.
   */
  let result;
  try {
    result = await revealAnswer(db, { adminUserId: gate.user.id, subjectUserId: id }, key);
  } catch (err) {
    /*
     * THE ERROR OBJECT IS NOT LOGGED (A5-18). This statement binds a user id and a
     * question key, so the answer itself cannot appear in one — but
     * `onboarding_answers.answer_text` is a column in it, and the rule is applied without
     * exception because this is not the file in which to reason about one.
     *
     * A thrown AUDIT write lands here too, and 503 is the right answer for it: no
     * plaintext was read, nothing is returned, and the operator sees a refusal rather
     * than a reveal. The distinction that matters is not the status code — it is that
     * `revealAnswer` decrypts nothing until the row has committed.
     */
    logAdminFailure('answer reveal', err, { adminUserId: gate.user.id, subjectUserId: id, key });
    return unavailable();
  }

  if (!result.ok) return adminNotFound();
  return ok(result.value);
}
