/**
 * `admin_access_log`, written and read. v0.5.0 / A1, decision A-D16.
 *
 * The four rules of this directory, applied:
 *
 *   1. The handle comes FIRST, so A5's route can hand in a transaction and the
 *      integration suite can hand in a rolled-back one.
 *   2. Nothing here imports `../../client`, `react`, `next/*` or `server-only` --
 *      not even transitively. `contract.test.ts` walks the graph.
 *   3. No caching. Every read here is an operator looking at an audit trail; a
 *      stale answer to "what has been read about this person" is worse than a
 *      second indexed lookup.
 *   4. One file per read concern. A3 owns `metrics.ts`, `users.ts` and `rollup.ts`
 *      in this same directory; this file is the audit trail and nothing else.
 *
 * ── `recordAdminAccess` THROWS. IT MUST KEEP THROWING (reconciliation R30) ────
 *
 * **A FAILED AUDIT WRITE IS A FAILED REVEAL** (A-D16). Every other write in this
 * project does the opposite -- `flushEvents`, `persistReading` and the `after()`
 * blocks all fail silently and log, because analytics must never be on the path of
 * a byte the querent is waiting for. That rule does not reach here, and the
 * consistency argument is exactly how this gets broken: a swallowed rejection added
 * during a tidy-up produces a decryption of somebody's worst memory with no record
 * of it and nothing on fire. `audit.contract.test.ts` asserts that this file
 * contains no catch of any shape.
 *
 * R30 calls this the highest-value seam in the release, and the reason is that
 * getting it wrong LOOKS RIGHT: written in house style, A5's invariant becomes
 * unimplementable while appearing implemented -- the reveal would work, the audit
 * row would silently not exist, and the only evidence would be a log line nobody
 * reads.
 *
 * ── THE ROW IS WRITTEN BEFORE THE PLAINTEXT IS READ, NOT AFTER ───────────────
 *
 * `src/lib/account/delete.ts`'s ordering precedent: *"revocation and redaction run
 * BEFORE the flag, so a failure in a statement that actually removes something
 * aborts the whole thing"*. Here: the audit row commits, and only then does the
 * caller decrypt. Written after the read, a crash between the two leaves a
 * decryption that happened with no record.
 *
 * The cost is a row for a reveal that then 404s because the answer does not exist.
 * **An audit trail that over-records is honest; one that under-records is not.**
 *
 * ── `resource_key` IS A KEY, NEVER A VALUE ───────────────────────────────────
 *
 * A question key (`worst_thing`), or a `moderation_flags.id`. Never the decrypted
 * answer, never the flagged question, never prose. This table survives account
 * erasure with its user columns nulled -- the `events` bargain -- and that bargain
 * is only honest because there is provably nothing identifying in the row.
 */
import { desc, eq } from 'drizzle-orm';
import { adminAccessLog, type AdminAccessLogRow } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';

/**
 * The closed set. **A1 OWNS IT, and `schema.ts` deliberately does not narrow the
 * column** -- the `moderation_flags.category` precedent, so schema.ts does not come
 * to depend on a module that depends on schema.ts.
 *
 *   `onboarding_answer`     one of the six, decrypted. A5's reveal.
 *   `moderation_question`   one flagged question, decrypted. A5's reveal.
 *   `user_detail`           the per-user page as a whole was opened.
 *   `reading_body`          one reading's prose was read in the admin surface.
 *
 * **A FIFTH VALUE IS A RECONCILIATION QUESTION, NOT AN AUTHORING CONVENIENCE** --
 * the R16 precedent for `callout`. A5 needing a name that is not here means the
 * reveal it is building is not one of the four A-D16 licensed.
 *
 * **`reading_body` HAS A ROUTE, AND THAT WAS RECONCILIATION R28's DOING:** §4.1
 * originally had three endpoints for four values, and a dead audit value reads as a
 * capability that exists. A5 adds `GET /api/admin/users/[id]/reading/[readingId]`
 * on the same terms as the answer endpoint.
 *
 * **THERE IS DELIBERATELY NO VALUE FOR THE USER *LIST* PAGE**, and that is this
 * release's one stated gap in the audit trail (reconciliation §9.8): fifty rows per
 * page load would make the audit panel unreadable. `user_detail` covers opening one
 * person's page, which is the read a subject-access answer actually cares about.
 */
export const ADMIN_RESOURCES = [
  'onboarding_answer',
  'moderation_question',
  'user_detail',
  'reading_body',
] as const;

export type AdminResource = (typeof ADMIN_RESOURCES)[number];

export type AdminAccess = {
  /** The operator's `users.id`. */
  adminUserId: string;
  /** Whose data. NULL only for a read that is about nobody in particular. */
  subjectUserId: string | null;
  resource: AdminResource;
  /** A question key or a flag id. **NEVER a decrypted value.** */
  resourceKey: string | null;
};

/**
 * Append one row. Returns its id.
 *
 * **AWAIT IT, AND AWAIT IT BEFORE THE READ IT AUDITS.** Not in an `after()`, not
 * in a `void`, not behind a swallowed rejection. The id is returned so a caller can
 * put it in a log line without logging the subject.
 */
export async function recordAdminAccess(db: DbOrTx, access: AdminAccess): Promise<string> {
  const [row] = await db
    .insert(adminAccessLog)
    .values({
      adminUserId: access.adminUserId,
      subjectUserId: access.subjectUserId,
      resource: access.resource,
      resourceKey: access.resourceKey,
    })
    .returning({ id: adminAccessLog.id });
  return row.id;
}

/**
 * "What has been read about this person" -- the subject access request.
 *
 * Served by `admin_access_log_subject_created_idx`. **A subject whose account was
 * hard-deleted returns nothing**, because `subject_user_id` was set to NULL by that
 * delete; `/privacy` clause 8.1 says so out loud rather than leaving it to be
 * discovered.
 */
export async function accessesForSubject(
  db: DbOrTx,
  subjectUserId: string,
  limit = 200,
): Promise<AdminAccessLogRow[]> {
  return db
    .select()
    .from(adminAccessLog)
    .where(eq(adminAccessLog.subjectUserId, subjectUserId))
    .orderBy(desc(adminAccessLog.createdAt))
    .limit(limit);
}

/**
 * "What has been read lately" -- the review query. Newest first.
 *
 * **THE UNATTRIBUTED CASE IS REACHABLE AND A5 MUST RENDER IT** (reconciliation R3):
 * both user columns are nullable, so a row whose admin account was hard-deleted
 * comes back with `adminUserId: null`. It means *the admin's row is gone*, never
 * *unknown admin*, and it must not render as a blank line.
 */
export async function recentAccesses(db: DbOrTx, limit = 200): Promise<AdminAccessLogRow[]> {
  return db
    .select()
    .from(adminAccessLog)
    .orderBy(desc(adminAccessLog.createdAt))
    .limit(limit);
}
