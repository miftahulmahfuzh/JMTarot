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
import { and, eq, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../types';
import { profiles, users, type NewProfile, type Profile, type User } from '../schema';

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
 * Bump `last_seen_at`. Called from after(), never awaited by a handler.
 *
 * Returns void rather than the row: nothing needs the value back, and
 * returning it would invite someone to await this on the request path.
 */
export async function touchLastSeen(db: DbOrTx, userId: string): Promise<void> {
  await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, userId));
}
