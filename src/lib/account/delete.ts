/**
 * Account erasure (VD13). THE BUTTON `/privacy` §8 HAS DESCRIBED FOR A RELEASE.
 *
 * `redactForUser()` RUNS IN THE SAME TRANSACTION THAT SETS `deleted_at`, AND
 * THAT IS THE ENTIRE DESIGN. `moderation_flags.user_id` is `on delete set null`,
 * so the row OUTLIVES the account -- a self-harm disclosure would otherwise sit
 * there for up to thirty more days, which is exactly what "delete my data" is
 * supposed to prevent. `log.ts`'s `redactForUser` header says so in those words
 * and names this file as the caller it did not have.
 *
 * `revokeAllForUser()` IS IN HERE FOR THE SAME SHAPE OF REASON, AND V8 FOUND IT
 * RATHER THAN THE ROADMAP (reconciliation §5.6). `share_links.user_id` is
 * `on delete cascade`, and that cascade fires at the HARD delete thirty days
 * later -- so without this call a shared reading or persona keeps serving the
 * public internet for a month after somebody asked to be forgotten. V8's plan
 * §3.1 has it behind a guarded dynamic import because V7 had not landed; V7 HAS
 * landed, `queries/share.ts` exports it handle-first for exactly this caller, and
 * a static import is the honest shape now. THE GUARD WAS NEVER THE POINT -- the
 * call site was.
 *
 * WHAT IS DELIBERATELY *NOT* IN HERE: `clearFreeTextAnswers()`.
 * `onboarding_answers` is `on delete cascade`, so the thirty-day hard delete
 * removes it outright; clearing it now would buy nothing and would break the
 * restore that `upsertUserOnSignIn` implements and that the confirmation copy
 * promises. The asymmetry with `moderation_flags` IS the asymmetry in the foreign
 * keys: `set null` outlives the account, `cascade` does not.
 *
 * ORDER MATTERS AND IT IS NOT ALPHABETICAL. Revocation and redaction run BEFORE
 * the flag, so a failure in a statement that actually removes something aborts
 * the whole thing rather than leaving an account marked deleted with its text
 * intact. `delete.integration.test.ts` proves it with a trigger, and a
 * source-level test in the same file proves nobody reordered it afterwards.
 *
 * NOT A QUERY MODULE -- it is a writer, like `flush.ts` and `log.ts` -- but it
 * still takes the handle FIRST, because two conventions inside one feature is
 * worse than one applied slightly beyond its home. `memory/frequency.ts`'s header
 * makes the same call. Taking the handle is also what lets the integration suite
 * pass a rolled-back transaction in, which is the only way the boundary above is
 * testable at all.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { ERASURE_GRACE_DAYS } from '@/lib/db/queries/profile';
import { revokeAllForUser } from '@/lib/db/queries/share';
import { users } from '@/lib/db/schema';
import type { DbOrTx } from '@/lib/db/types';
import { redactForUser } from '@/lib/moderation/log';

export type DeleteOutcome = {
  /**
   * False when there was no live row to flag -- already deleted, or never
   * existed. The route turns that into a 404, and the two are deliberately
   * indistinguishable to the caller.
   */
  deleted: boolean;
  flagsRedacted: number;
  linksRevoked: number;
  /** ISO. `ERASURE_GRACE_DAYS` from now, for the confirmation copy. */
  restorableUntil: string;
};

export async function deleteAccount(db: DbOrTx, userId: string): Promise<DeleteOutcome> {
  /*
   * Computed BEFORE the transaction and returned whatever happens inside it, so
   * the number the user is shown is the number the sweep will act on. The sweep
   * reads `deleted_at + ERASURE_GRACE_DAYS`; the constant is imported rather than
   * typed, because `profile.ts` exports it precisely so the copy and the cron
   * cannot disagree.
   */
  const restorableUntil = new Date(
    Date.now() + ERASURE_GRACE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await db.transaction(async (tx) => {
    const linksRevoked = await revokeAllForUser(tx, userId);
    const flagsRedacted = await redactForUser(tx, userId);

    /*
     * `where deleted_at is null` makes this idempotent and makes the return value
     * mean something: a replayed request does not move the timestamp, so "when
     * did this person ask to be erased" stays answerable and the grace window
     * cannot be silently extended by tapping the button twice.
     */
    const flagged = await tx
      .update(users)
      /* `users` carries no `updated_at` -- W1 did not give it one -- so there is
         nothing to touch by hand here. `deleted_at` IS the timestamp. */
      .set({ deletedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .returning({ id: users.id });

    return { deleted: flagged.length === 1, flagsRedacted, linksRevoked };
  });

  return { ...result, restorableUntil };
}
