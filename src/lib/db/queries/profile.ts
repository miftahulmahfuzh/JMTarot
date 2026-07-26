/**
 * users + profiles. Read by W2 (auth) and written by W3 (onboarding).
 *
 * THE CONTRACT FOR EVERY FILE IN THIS DIRECTORY (plan §4.6):
 *
 *  1. Every exported function takes the handle FIRST: `(db: DbOrTx, ...args)`.
 *     No module-level `import { db }`. This is what lets a test pass a
 *     rolled-back transaction and what lets a caller write two tables
 *     atomically inside one db.transaction().
 *  2. Import the TYPE, not the value: `import type { DbOrTx } from '../types'`.
 *     Never from '../client'.
 *  3. No React, no Next. Not next/cache, not next/headers, not react's
 *     cache(). These modules are called from route handlers, from after(),
 *     from scripts/db-seed.ts and from Vitest, and three of those four have no
 *     React runtime. Caching is the caller's decision, made where the caller
 *     knows the request context. Enforced by contract.test.ts.
 *  4. Return domain shapes, not query builders.
 *  5. One file per read concern. A function that fits none of the four is a
 *     sign the concern is new -- add a file and say so in your plan, do not
 *     widen this one into a junk drawer.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Locale } from '@/data/types';
import type { Db, DbOrTx } from '../types';
import { profiles, users, type NewProfile, type Profile, type User } from '../schema';

/**
 * The erasure grace period, in days (reconciliation §7.8).
 *
 * Exported so W7's daily sweep uses the same number rather than re-deriving it.
 * A sweep that purges at 30 days and a sign-in that restores at 31 would leave a
 * window where the row is gone and the promise was still "recoverable".
 */
export const ERASURE_GRACE_DAYS = 30;

/**
 * The one lookup on the auth path (W2).
 *
 * Soft-deleted users are NOT found. Reconciliation §7.8: a deleted account is
 * recoverable for 30 days by clearing `deleted_at`, and W2's sign-in path is
 * what decides to do that -- it must look the row up deliberately rather than
 * receiving it from here, or "sign in" and "resurrect" become the same code
 * path by accident.
 */
export async function findUserByGoogleSub(db: DbOrTx, googleSub: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.googleSub, googleSub), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** By primary key. `userId` means `users.id` everywhere in this directory. */
export async function getUserById(db: DbOrTx, userId: string): Promise<User | null> {
  const [row] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);
  return row ?? null;
}

export async function getProfile(db: DbOrTx, userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row ?? null;
}

/**
 * Insert or update the single profile row for a user.
 *
 * `updatedAt` is set explicitly in the conflict branch. Drizzle's
 * `$onUpdate()` fires on `db.update()` and NOT inside `onConflictDoUpdate`, so
 * relying on the column definition alone leaves updated_at frozen at the
 * insert -- which is the exact failure the column exists to prevent, and it is
 * invisible until someone asks when a profile last changed.
 */
export async function upsertProfile(db: DbOrTx, input: NewProfile): Promise<Profile> {
  const [row] = await db
    .insert(profiles)
    .values(input)
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        fullName: input.fullName,
        nickname: input.nickname,
        birthDate: input.birthDate,
        onboardingVersion: input.onboardingVersion,
        completedAt: input.completedAt,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/**
 * Write the three factual answers, and NOTHING ELSE (W3 Task 1 / L13).
 *
 * ADDED BY W3, against the interface its plan names under *Interfaces I need
 * from W1*, which specified `upsertProfileFacts` and `markOnboardingComplete`
 * and did not land with W1.
 *
 * IT MUST NOT GO THROUGH `upsertProfile`, AND THIS IS THE WHOLE REASON IT
 * EXISTS. That function sets `completedAt: input.completedAt` in its conflict
 * branch, so a facts-only edit -- which L13 makes a permanent feature, since
 * names are typo-prone and the nickname is what the reader calls you -- would
 * carry `undefined` into the one column that decides whether onboarding is
 * finished. The user edits their nickname from `/account` and is sent back
 * through the questionnaire.
 *
 * `onboarding_version` is written on insert only. Bumping it for an existing
 * profile would claim the user answered a question set they never saw.
 *
 * `updatedAt` is set by hand: `$onUpdate()` does not fire inside
 * `onConflictDoUpdate`.
 */
export async function upsertProfileFacts(
  db: DbOrTx,
  userId: string,
  facts: { fullName: string; nickname: string; birthDate: string },
): Promise<void> {
  await db
    .insert(profiles)
    .values({
      userId,
      fullName: facts.fullName,
      nickname: facts.nickname,
      birthDate: facts.birthDate,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        fullName: facts.fullName,
        nickname: facts.nickname,
        birthDate: facts.birthDate,
        updatedAt: new Date(),
      },
    });
}

/**
 * Set `completed_at`. THE completion marker (L3), and the only writer of it.
 *
 * IDEMPOTENT, AND IT KEEPS THE FIRST TIMESTAMP. `where completed_at is null`
 * means a replayed or double-submitted completion does not move the date --
 * "when did this person finish onboarding" stays answerable, and the value
 * cannot silently become the moment of the most recent retry.
 *
 * Returns the timestamp now in the column, whether this call set it or an
 * earlier one did, so the handler can put it in its response without a second
 * read. Null only if there is no `profiles` row at all, which means the facts
 * step never completed and the caller is finishing a questionnaire that never
 * started.
 */
export async function markOnboardingComplete(
  db: DbOrTx,
  userId: string,
): Promise<Date | null> {
  const [updated] = await db
    .update(profiles)
    .set({ completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(profiles.userId, userId), isNull(profiles.completedAt)))
    .returning({ completedAt: profiles.completedAt });

  if (updated?.completedAt) return updated.completedAt;

  // Already complete, or no row. One indexed lookup tells those apart.
  const [existing] = await db
    .select({ completedAt: profiles.completedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return existing?.completedAt ?? null;
}

/**
 * Bump `last_seen_at`. Called from after(), never awaited by a handler.
 *
 * Returns void rather than the row: nothing needs the value back, and
 * returning it would invite someone to await this on the request path.
 */
export async function touchLastSeen(db: DbOrTx, userId: string): Promise<void> {
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
}

// ---------------------------------------------------------------------------
// The sign-in path (W2)
// ---------------------------------------------------------------------------

export type SignInUpsertResult = {
  /** users.id. */
  id: string;
  locale: Locale;
  /** profiles.completed_at IS NOT NULL. */
  onboardingComplete: boolean;
  /**
   * What actually happened, for the sign-in log.
   *
   * `restored` and `recreated` are the two an operator wants to see and the two
   * a plain upsert would hide. They cost nothing to report: the statement below
   * reads the prior row's `deleted_at` in the same round trip.
   */
  outcome: 'created' | 'updated' | 'restored' | 'recreated';
};

export type SignInUpsertInput = {
  /** Google's OIDC `sub`, or `dev:<username>` under DEV_PASSWORD_LOGIN. */
  googleSub: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

/**
 * Create or refresh the `users` row for whoever just came back from Google.
 *
 * ONE STATEMENT for every path anyone actually takes, because this sits on the
 * sign-in critical path -- and note that it also refreshes `last_seen_at`, which
 * the analytics plan otherwise defers to `after()`. It is already in the
 * statement, so doing it here is strictly cheaper.
 *
 * ERASURE SEMANTICS ARE RECONCILIATION §7.8, NOT W2's PLAN §5.3. The plan
 * refused a soft-deleted account outright and returned null, on the reading that
 * an erasure you can undo by signing in again is not an erasure. Miftah overruled
 * that with a grace period, and the reason is the trap in R23: under the strict
 * design the dead row held the `google_sub` forever, so a user who rage-quit
 * could never come back EVEN AS A NEW USER. So:
 *
 *   deleted within  ERASURE_GRACE_DAYS -> clear deleted_at, account restored
 *   deleted  before ERASURE_GRACE_DAYS -> hard delete, fresh user, same tx
 *
 * **This function therefore never returns null.** W2's plan declares
 * `Promise<SignInUpsertResult | null>` with null meaning "soft-deleted, refused";
 * that case no longer exists, so the nullable is gone rather than kept as a
 * branch nothing can reach. A real database error THROWS, and the caller turns
 * that into a failed sign-in -- never into a session with no user id, which is
 * worse than no session because every downstream write would then take
 * `undefined` as a foreign key.
 *
 * The lazy purge here is the SAFETY NET, not the mechanism: it only fires for a
 * user who comes back. W7's daily sweep is what makes the 30-day promise true for
 * everyone else, and it must use `ERASURE_GRACE_DAYS`.
 */
export async function upsertUserOnSignIn(
  db: DbOrTx,
  input: SignInUpsertInput,
): Promise<SignInUpsertResult> {
  /*
   * Raw SQL rather than the query builder, for two things the builder cannot
   * express: the `where` on the conflict branch, and the data-modifying CTE that
   * joins `profiles` so the onboarding flag comes back in the same round trip.
   *
   * `prior` reads the row BEFORE the upsert touches it. A CTE sees the statement's
   * snapshot, so this is the pre-update `deleted_at` even though the conflict
   * branch is about to set it to null -- which is the only way to distinguish a
   * restore from an ordinary sign-in without a second round trip.
   *
   * The `where` on `do update` is the load-bearing part. When the row exists and
   * was erased longer ago than the grace period, it suppresses the update AND the
   * RETURNING -- so the statement yields zero rows rather than raising, and zero
   * rows is the signal to take the purge path below. That "silently returns no
   * rows" behaviour is easy to get wrong, which is why both branches have an
   * integration test.
   */
  const rows = (await db.execute(sql`
    with prior as (
      select deleted_at from ${users} where google_sub = ${input.googleSub}
    ),
    upserted as (
      insert into ${users} (google_sub, email, email_verified, display_name, avatar_url)
      values (${input.googleSub}, ${input.email}, ${input.emailVerified},
              ${input.displayName}, ${input.avatarUrl})
      on conflict (google_sub) do update set
        email          = excluded.email,
        email_verified = excluded.email_verified,
        display_name   = excluded.display_name,
        avatar_url     = excluded.avatar_url,
        last_seen_at   = now(),
        deleted_at     = null
      where users.deleted_at is null
         or users.deleted_at >= now() - make_interval(days => ${ERASURE_GRACE_DAYS}::int)
      returning id, locale
    )
    select u.id                                       as id,
           u.locale                                   as locale,
           (p.completed_at is not null)               as onboarding_complete,
           (exists (select 1 from prior))             as existed,
           ((select deleted_at from prior) is not null) as was_deleted
    from upserted u
    left join ${profiles} p on p.user_id = u.id
  `)) as unknown as Array<{
    id: string;
    locale: Locale;
    onboarding_complete: boolean;
    existed: boolean;
    was_deleted: boolean;
  }>;

  const row = rows[0];
  if (row) {
    return {
      id: row.id,
      locale: row.locale,
      onboardingComplete: row.onboarding_complete,
      outcome: row.was_deleted ? 'restored' : row.existed ? 'updated' : 'created',
    };
  }

  return purgeAndRecreate(db, input);
}

/**
 * The rare path: the account was erased longer ago than the grace period, and the
 * sweep has not got to it yet.
 *
 * A transaction rather than one clever statement. A `delete` and an `insert` on
 * the same unique key inside a single statement is exactly the case Postgres'
 * documentation warns about -- the sub-statements share a snapshot, so whether the
 * insert sees the delete is not something to be confident about by reading. This
 * path runs at most once per returning user, so the cost of being unambiguous is
 * nothing.
 *
 * A `Tx` also has `.transaction()`, where it opens a savepoint, so this is
 * correct whether the caller handed us a pool handle or an open transaction.
 */
async function purgeAndRecreate(
  db: DbOrTx,
  input: SignInUpsertInput,
): Promise<SignInUpsertResult> {
  return (db as Db).transaction(async (tx) => {
    /*
     * Deliberately re-states the age predicate instead of deleting by id. If a
     * concurrent sign-in restored the row between the statement above and this
     * one, this delete matches nothing and the insert below fails the unique
     * constraint -- which surfaces as a failed sign-in the user can retry, rather
     * than as an erasure of an account that had just been recovered.
     */
    await tx
      .delete(users)
      .where(
        and(
          eq(users.googleSub, input.googleSub),
          sql`${users.deletedAt} < now() - make_interval(days => ${ERASURE_GRACE_DAYS}::int)`,
        ),
      );

    const [row] = await tx
      .insert(users)
      .values({
        googleSub: input.googleSub,
        email: input.email,
        emailVerified: input.emailVerified,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
      })
      .returning({ id: users.id, locale: users.locale });

    return {
      id: row.id,
      locale: row.locale,
      // A fresh row cannot have a profile: the hard delete cascaded it away, and
      // §7.8's whole point is that this Google account comes back as a stranger.
      onboardingComplete: false,
      outcome: 'recreated' as const,
    };
  });
}

/**
 * The token-refresh read (W2 §5.4).
 *
 * Called from the `trigger === 'update'` branch of the jwt callback, which
 * IGNORES the payload the browser sent and re-reads the truth from here.
 * `POST /api/auth/session` is reachable by any signed-in user, so a callback that
 * believed `{ onboardingComplete: true }` would put onboarding one curl away from
 * optional -- and since that flag also gates /api/reading, that is the whole gate.
 *
 * Returns null for a user that does not exist or is soft-deleted, which the
 * caller turns into a dead session.
 */
export async function readSessionFacts(
  db: DbOrTx,
  userId: string,
): Promise<{ locale: Locale; onboardingComplete: boolean } | null> {
  const [row] = await db
    .select({ locale: users.locale, completedAt: profiles.completedAt })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    .limit(1);

  if (!row) return null;
  return { locale: row.locale, onboardingComplete: row.completedAt !== null };
}
