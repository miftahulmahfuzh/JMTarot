import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, resetDb, testDb, withRollback } from '@/lib/db/testing/harness';
import {
  ERASURE_GRACE_DAYS,
  findUserByGoogleSub,
  getProfile,
  readSessionFacts,
  touchLastSeen,
  upsertProfile,
  upsertUserOnSignIn,
} from './profile';

afterAll(closeTestDb);

describe('the harness itself', () => {
  it('rolls back, so tests cannot see each other', async () => {
    // Not ceremony. If withRollback silently commits, every integration test
    // in this repo still passes individually and the suite starts failing in a
    // different order six weeks from now.
    await withRollback(async (tx) => {
      await tx.insert(users).values({ googleSub: 'probe', email: 'p@example.com' });
      expect(await findUserByGoogleSub(tx, 'probe')).not.toBeNull();
    });

    // A NEW transaction. If the rollback did not happen, this is not null.
    await withRollback(async (tx) => {
      expect(await findUserByGoogleSub(tx, 'probe')).toBeNull();
    });
  });

  it('propagates a real failure instead of swallowing it as a rollback', async () => {
    // withRollback catches exactly one exception type. If it caught everything,
    // a failing assertion inside the callback would be reported as a pass.
    await expect(
      withRollback(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('resetDb clears data a transaction cannot roll back', async () => {
    // Committed deliberately, outside withRollback, because that is the exact
    // case resetDb exists for.
    await testDb.insert(users).values({ googleSub: 'committed', email: 'c@example.com' });
    expect(await findUserByGoogleSub(testDb, 'committed')).not.toBeNull();

    await resetDb();
    expect(await findUserByGoogleSub(testDb, 'committed')).toBeNull();
  });
});

describe('profile queries', () => {
  it('does not find a soft-deleted user', async () => {
    await withRollback(async (tx) => {
      await tx.insert(users).values({
        googleSub: 'gone',
        email: 'g@example.com',
        deletedAt: new Date(),
      });
      expect(await findUserByGoogleSub(tx, 'gone')).toBeNull();
    });
  });

  it('returns date columns as YYYY-MM-DD strings, not Dates', async () => {
    // Roadmap §7. This assertion is why every date column is mode: 'string',
    // and it is the one that will catch a well-meaning "fix" to mode: 'date'.
    // A Date renders in the server's zone and is a day out for anyone in
    // Jakarta between midnight and 07:00 -- plausible, and wrong.
    await withRollback(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ googleSub: 'tz', email: 't@example.com' })
        .returning();

      const p = await upsertProfile(tx, {
        userId: u.id,
        fullName: 'Tanggal Lahir',
        nickname: 'TZ',
        birthDate: '1990-03-14',
      });

      expect(p.birthDate).toBe('1990-03-14');
      expect(typeof p.birthDate).toBe('string');
    });
  });

  it('upserts rather than duplicating, and moves updated_at when it does', async () => {
    // The $onUpdate trap: Drizzle does not apply it inside onConflictDoUpdate,
    // so upsertProfile sets updatedAt by hand. Without that line this passes
    // on the first insert and the timestamp never moves again.
    await withRollback(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ googleSub: 'up', email: 'u@example.com' })
        .returning();

      const first = await upsertProfile(tx, {
        userId: u.id,
        fullName: 'Nama Awal',
        nickname: 'awal',
        birthDate: '1991-01-01',
        updatedAt: new Date('2020-01-01T00:00:00Z'),
      });
      expect(first.nickname).toBe('awal');

      const second = await upsertProfile(tx, {
        userId: u.id,
        fullName: 'Nama Baru',
        nickname: 'baru',
        birthDate: '1991-01-01',
      });

      expect(second.nickname).toBe('baru');
      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
      // Still one row, not two.
      expect(await getProfile(tx, u.id)).toMatchObject({ nickname: 'baru' });
    });
  });

  it('cascades the profile away when the user is hard-deleted', async () => {
    // Reconciliation §7.8 promises a real purge at 30 days. This is the
    // cascade that promise rests on.
    await withRollback(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ googleSub: 'purge', email: 'p2@example.com' })
        .returning();
      await upsertProfile(tx, {
        userId: u.id,
        fullName: 'Akan Dihapus',
        nickname: 'hapus',
        birthDate: '1992-02-02',
      });

      await tx.delete(users).where(eq(users.id, u.id));
      expect(await getProfile(tx, u.id)).toBeNull();
    });
  });

  it('touchLastSeen moves the timestamp', async () => {
    await withRollback(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          googleSub: 'seen',
          email: 's@example.com',
          lastSeenAt: new Date('2020-01-01T00:00:00Z'),
        })
        .returning();

      await touchLastSeen(tx, u.id);

      const [after] = await tx.select().from(users).where(eq(users.id, u.id));
      expect(after.lastSeenAt.getTime()).toBeGreaterThan(u.lastSeenAt.getTime());
    });
  });
});

/**
 * The sign-in upsert (W2 §5.3, with reconciliation §7.8's erasure semantics).
 *
 * All four outcomes get a test, because the statement's key behaviour -- a
 * suppressed `do update ... where` yielding ZERO ROWS rather than raising -- is
 * exactly the kind of thing that is easy to believe by reading and wrong.
 */
describe('upsertUserOnSignIn', () => {
  const google = {
    googleSub: '107384726150398472615',
    email: 'querent@example.com',
    emailVerified: true,
    displayName: 'Querent Nameish',
    avatarUrl: 'https://lh3.googleusercontent.com/a/abc123',
  };

  /** Backdated by `days`, so a grace-period boundary is a value and not a wait. */
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  it('creates the row on a first sign-in', async () => {
    await withRollback(async (tx) => {
      const r = await upsertUserOnSignIn(tx, google);

      expect(r.outcome).toBe('created');
      expect(r.locale).toBe('id'); // the schema default, and D6's correct fallback
      expect(r.onboardingComplete).toBe(false);
      expect(r.id).toMatch(/^[0-9a-f]{8}-/);

      const row = await findUserByGoogleSub(tx, google.googleSub);
      expect(row).toMatchObject({ email: google.email, emailVerified: true });
    });
  });

  it('updates rather than duplicating on a second sign-in', async () => {
    // The `unique` on google_sub is the conflict target. Without it every
    // sign-in creates a duplicate row and nothing complains.
    await withRollback(async (tx) => {
      const first = await upsertUserOnSignIn(tx, google);
      await tx
        .update(users)
        .set({ lastSeenAt: new Date('2020-01-01T00:00:00Z') })
        .where(eq(users.id, first.id));

      const second = await upsertUserOnSignIn(tx, {
        ...google,
        email: 'renamed@example.com',
        displayName: 'Renamed',
      });

      expect(second.outcome).toBe('updated');
      expect(second.id).toBe(first.id);

      const rows = await tx.select().from(users).where(eq(users.googleSub, google.googleSub));
      expect(rows).toHaveLength(1);
      // Google is authoritative for these, and last_seen_at rides along in the
      // same statement rather than costing after() a second write.
      expect(rows[0].email).toBe('renamed@example.com');
      expect(rows[0].displayName).toBe('Renamed');
      expect(rows[0].lastSeenAt.getFullYear()).toBeGreaterThan(2020);
    });
  });

  it('reports onboarding as complete once profiles.completed_at is set', async () => {
    await withRollback(async (tx) => {
      const first = await upsertUserOnSignIn(tx, google);
      await upsertProfile(tx, {
        userId: first.id,
        fullName: 'Sudah Selesai',
        nickname: 'selesai',
        birthDate: '1993-03-03',
        completedAt: new Date(),
      });

      expect((await upsertUserOnSignIn(tx, google)).onboardingComplete).toBe(true);
    });
  });

  it('reports onboarding as incomplete when the profile exists but was never finished', async () => {
    // NULL completed_at means started, not finished. A LEFT JOIN that only
    // checked for the profile's existence would let a half-finished stepper
    // through the gate.
    await withRollback(async (tx) => {
      const first = await upsertUserOnSignIn(tx, google);
      await upsertProfile(tx, {
        userId: first.id,
        fullName: 'Belum Selesai',
        nickname: 'belum',
        birthDate: '1994-04-04',
      });

      expect((await upsertUserOnSignIn(tx, google)).onboardingComplete).toBe(false);
    });
  });

  it('restores an account erased inside the grace period, as the same user', async () => {
    // Reconciliation §7.8. The id must be UNCHANGED: "restored as it was" means
    // the readings, the profile and the Lotus avatar all still point at it.
    await withRollback(async (tx) => {
      const first = await upsertUserOnSignIn(tx, google);
      await upsertProfile(tx, {
        userId: first.id,
        fullName: 'Kembali Lagi',
        nickname: 'kembali',
        birthDate: '1995-05-05',
        completedAt: new Date(),
      });
      await tx
        .update(users)
        .set({ deletedAt: daysAgo(ERASURE_GRACE_DAYS - 1) })
        .where(eq(users.id, first.id));

      const back = await upsertUserOnSignIn(tx, google);

      expect(back.outcome).toBe('restored');
      expect(back.id).toBe(first.id);
      expect(back.onboardingComplete).toBe(true);
      // findUserByGoogleSub filters on deleted_at, so finding it again is the
      // assertion that the flag was actually cleared.
      expect(await findUserByGoogleSub(tx, google.googleSub)).not.toBeNull();
      expect(await getProfile(tx, first.id)).toMatchObject({ nickname: 'kembali' });
    });
  });

  it('purges and recreates an account erased before the grace period', async () => {
    // The other half of §7.8: the identity is released when the data is, so the
    // same Google account comes back as a stranger. This also exercises the
    // zero-rows path -- the suppressed `do update ... where` -- which is the one
    // behaviour in this statement that cannot be verified by reading it.
    await withRollback(async (tx) => {
      const first = await upsertUserOnSignIn(tx, google);
      await upsertProfile(tx, {
        userId: first.id,
        fullName: 'Sudah Hilang',
        nickname: 'hilang',
        birthDate: '1996-06-06',
        completedAt: new Date(),
      });
      await tx
        .update(users)
        .set({ deletedAt: daysAgo(ERASURE_GRACE_DAYS + 1) })
        .where(eq(users.id, first.id));

      const stranger = await upsertUserOnSignIn(tx, google);

      expect(stranger.outcome).toBe('recreated');
      expect(stranger.id).not.toBe(first.id);
      expect(stranger.onboardingComplete).toBe(false);
      // One row, and the old profile went with the old row.
      expect(
        await tx.select().from(users).where(eq(users.googleSub, google.googleSub)),
      ).toHaveLength(1);
      expect(await getProfile(tx, first.id)).toBeNull();
    });
  });

  it('accepts the dev synthetic sub, so local development takes the real path', async () => {
    // `dev:` cannot collide with a real Google sub, which is a decimal string.
    await withRollback(async (tx) => {
      const r = await upsertUserOnSignIn(tx, {
        googleSub: 'dev:miftah',
        email: 'miftah@localhost',
        emailVerified: true,
        displayName: 'miftah',
        avatarUrl: null,
      });
      expect(r.outcome).toBe('created');
      expect(await findUserByGoogleSub(tx, 'dev:miftah')).not.toBeNull();
    });
  });
});

describe('readSessionFacts', () => {
  it('returns the locale and the onboarding flag', async () => {
    await withRollback(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ googleSub: 'facts', email: 'f@example.com', locale: 'en' })
        .returning();

      expect(await readSessionFacts(tx, u.id)).toEqual({
        locale: 'en',
        onboardingComplete: false,
      });

      await upsertProfile(tx, {
        userId: u.id,
        fullName: 'Fakta',
        nickname: 'fakta',
        birthDate: '1997-07-07',
        completedAt: new Date(),
      });

      expect(await readSessionFacts(tx, u.id)).toEqual({
        locale: 'en',
        onboardingComplete: true,
      });
    });
  });

  it('returns null for an unknown or soft-deleted user', async () => {
    // Both become a dead session in the jwt callback. A soft-deleted user whose
    // cookie is still warm must not keep refreshing it.
    await withRollback(async (tx) => {
      expect(await readSessionFacts(tx, '00000000-0000-4000-8000-000000000000')).toBeNull();

      const [u] = await tx
        .insert(users)
        .values({ googleSub: 'facts-gone', email: 'fg@example.com', deletedAt: new Date() })
        .returning();
      expect(await readSessionFacts(tx, u.id)).toBeNull();
    });
  });
});
