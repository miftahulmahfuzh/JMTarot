/**
 * `GET /api/admin/users/[id]/reading/[readingId]` — one reading's prose.
 * **NOT IN ROADMAP §4.1; ADDED BY RECONCILIATION R28.** v0.5.0 / A5, task 9.
 *
 * ── WHY THIS ROUTE EXISTS AT ALL ────────────────────────────────────────────
 *
 * Roadmap §3.1 gives `admin_access_log.resource` the value `reading_body` and §4.1 listed no
 * route that could ever write it. **A dead audit value is worse than a missing one: it reads
 * as a capability that exists.** R28's ruling is this route, on the same terms as the answer
 * endpoint. The alternative resolution — rendering bodies inline on the detail page —
 * would have required striking the resource value **and** loosening A5-8's payload rule
 * together, and a reading body is exactly the thing that should cost an audit row.
 *
 * ── AUDITED ON EVERY 200, INCLUDING A `failed` READING WITH NO BODY ─────────
 *
 * Unlike the answer and the flag there is no "nothing to reveal" state worth
 * distinguishing: the response still carries `question`, which is plaintext the operator
 * has now read. So the ordering is ownership → audit → read, unconditionally.
 *
 * ── AND THE PAGE STILL CARRIES `question` INLINE, WHICH IS NOT AN INCONSISTENCY ─
 *
 * `readings.question` is plaintext in the table by design and `/privacy` names it as stored
 * user text; an audited reveal over an unencrypted column would suggest a protection that
 * does not exist, and it would make the readings list unusable for the one thing a list is
 * for. `body` is the artifact: four paragraphs per row, withheld from the payload (A5-8),
 * reachable one row at a time.
 */
import { revealReading } from '@/lib/admin/reveal';
import { db } from '@/lib/db/client';
import {
  UUID_RE,
  adminNotFound,
  logAdminFailure,
  ok,
  refuseMethod,
  requireAdmin,
  unavailable,
} from '../../../shared';

export const runtime = 'nodejs';
export const maxDuration = 15;

/** A-D2: an unimplemented verb answers 404, not 405. See `refuseMethod`. */
export const POST = refuseMethod;
export const PUT = refuseMethod;
export const PATCH = refuseMethod;
export const DELETE = refuseMethod;

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; readingId: string }> },
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const { id, readingId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(readingId)) return adminNotFound();

  let result;
  try {
    result = await revealReading(db, { adminUserId: gate.user.id, subjectUserId: id }, readingId);
  } catch (err) {
    // THE ERROR OBJECT IS NOT LOGGED (A5-18): `readings.question` and `readings.body` are
    // both columns in this statement.
    logAdminFailure('reading reveal', err, {
      adminUserId: gate.user.id,
      subjectUserId: id,
      readingId,
    });
    return unavailable();
  }

  if (!result.ok) return adminNotFound();
  return ok(result.value);
}
