/**
 * `GET /api/admin/users/[id]/moderation/[flagId]` — one flagged question, decrypted.
 * v0.5.0 / A5, task 8.
 *
 * Same terms as the answer reveal: one resource per request, `private, no-store`, audited
 * before the plaintext exists, no write verb. The differences are the four states and
 * which of them owes an audit row.
 *
 * ── ONLY `available` WRITES A ROW (A5-11) ────────────────────────────────────
 *
 * A flag whose `question` is NULL has nothing to reveal — redacted by the 30-day sweep, or
 * never stored at all because the category was `sexual_minor`. Those return the STATE and
 * write no row: **padding the log with no-op reads makes the subject-access answer wrong in
 * the alarming direction**, and that answer is the whole reason
 * `admin_access_log_subject_created_idx` exists. `@/lib/admin/reveal` holds that split, so
 * the integration test can prove it by counting rows before and after.
 *
 * ── FOUR STATES, AND `undecryptable` IS NOT A SHRUG ─────────────────────────
 *
 * A rotated key is not the same fact as a redaction: rendering it as one would claim a
 * retention guarantee that may not have been kept. `queries/admin/moderation.ts` returns
 * the discriminated union and the route never sees a raw column.
 *
 * ── AND A FLAG BELONGING TO SOMEBODY ELSE IS A 404, THOUGH THE CALLER IS AN
 *    ADMIN (A5-16) ─────────────────────────────────────────────────────────────
 *
 * Ownership is a PREDICATE in the same statement, never a comparison afterwards. The
 * failure mode this prevents is not a 403 — it is the wrong person's flagged question
 * under the right person's URL, and the forgotten `if` is invisible in review.
 *
 * **Nothing here un-redacts and nothing reads `question_hmac`** (A5-12). The sweep is
 * untouched: no exemption, no "keep for review" flag, and no path that compares an HMAC
 * against a candidate string — which is the feature that would turn a dedupe key into an
 * oracle.
 */
import { revealFlag } from '@/lib/admin/reveal';
import { db } from '@/lib/db/client';
import { adminNotFound, logAdminFailure, ok, requireAdmin, unavailable, UUID_RE } from '../../../shared';

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; flagId: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, flagId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(flagId)) return adminNotFound();

  let result;
  try {
    result = await revealFlag(db, { adminUserId: gate.user.id, subjectUserId: id }, flagId);
  } catch (err) {
    // THE ERROR OBJECT IS NOT LOGGED (A5-18): `moderation_flags.question` is a column in
    // this statement, and a postgres error quotes the statement and its parameters.
    logAdminFailure('moderation reveal', err, {
      adminUserId: gate.user.id,
      subjectUserId: id,
      flagId,
    });
    return unavailable();
  }

  if (!result.ok) return adminNotFound();
  return ok(result.value);
}
