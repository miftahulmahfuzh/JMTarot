/**
 * The erasure grace period, in days (reconciliation §7.8). A LEAF: no imports at
 * all, so anything may reach it.
 *
 * **IT MOVED HERE OUT OF `queries/profile.ts` FOR THE REASON V2's
 * `translate/keys.ts` EXISTS, AND THE CONSTRAINT CAME FROM THE CLIENT SIDE.**
 * `DeleteAccount.tsx` renders "for {days} days you can still get it back", and
 * `clientBoundary.test.ts` forbids a client component importing `@/lib/db/**` --
 * so the number was reachable by every server consumer and by none of the ones
 * that actually show it to a person. The alternatives were both worse: hardcode
 * `30` in the copy path, which is the drift `profile.ts` exported the constant to
 * prevent in the first place, or relax the client fence for one integer.
 *
 * `queries/profile.ts` RE-EXPORTS IT, so every existing import site keeps working
 * and there is still exactly one number. Do not "clean up" the re-export by
 * pointing those call sites here: the re-export is what makes this a move rather
 * than a fork, and `profile.ts` is where somebody reasoning about the restore
 * window will look.
 *
 * Consumers, and why they must agree: `upsertUserOnSignIn` restores an account
 * inside this window and hard-deletes outside it, `/api/cron/sweep` purges at it,
 * `/privacy`'s facts table quotes it, `deleteAccount` returns
 * `restorableUntil` from it, and the confirmation sheet promises it. A sweep that
 * purges at 30 and a sign-in that restores at 31 leaves a window where the row is
 * gone and the promise was still "recoverable".
 */
export const ERASURE_GRACE_DAYS = 30;
