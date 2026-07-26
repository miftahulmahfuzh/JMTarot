import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, resetDb, testDb, withRollback } from '@/lib/db/testing/harness';
import { findUserByGoogleSub, getProfile, touchLastSeen, upsertProfile } from './profile';

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
