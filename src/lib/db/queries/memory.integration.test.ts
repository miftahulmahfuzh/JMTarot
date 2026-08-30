import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import {
  dismissUserMemoryItems,
  getUserMemory,
  redactUserMemory,
  touchUserMemory,
  upsertUserMemory,
} from '@/lib/db/queries/memory';
import { userMemory, users } from '@/lib/db/schema';
import { closeTestDb, testDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { USER_MEMORY_SOURCE_VERSION, type UserMemoryItem } from '@/lib/memory/profile/types';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `mem:${n}`, email: `mem${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

const item = (id: string, text: string): UserMemoryItem => ({
  id,
  kind: 'taste',
  text,
  lastSeen: '2026-08-30',
});

const NASI = item('0a1b2c3d4e5f', 'suka nasi padang buat makan malam');
const LARI = item('112233445566', 'lari pagi, idealnya jam lima');

async function seedMemory(tx: Tx, userId: string, items: UserMemoryItem[]) {
  await upsertUserMemory(tx, {
    userId,
    items,
    inputHash: 'hash-1',
    sourceVersion: USER_MEMORY_SOURCE_VERSION,
    model: 'glm-5.3',
    promptVersion: 'um-1',
  });
}

describe('getUserMemory', () => {
  it('returns null for a user with no row, which is the ordinary case', () =>
    withRollback(async (tx) => {
      expect(await getUserMemory(tx, await seedUser(tx))).toBeNull();
    }));

  it('returns null for a malformed uuid rather than raising 22P02', () =>
    withRollback(async (tx) => {
      // A read that 500s on a caller's bug is an outage. `share.ts`'s guard.
      expect(await getUserMemory(tx, 'not-a-uuid')).toBeNull();
    }));
});

describe('upsertUserMemory', () => {
  it('inserts, defaults dismissed_ids to an empty array, and round-trips the items', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);

      const row = await getUserMemory(tx, userId);
      expect(row?.items).toEqual([NASI, LARI]);
      expect(row?.dismissedIds).toEqual([]);
      expect(row?.inputHash).toBe('hash-1');
      expect(row?.model).toBe('glm-5.3');
    }));

  it('MOVES updated_at BY HAND on conflict and leaves created_at alone', () =>
    withRollback(async (tx) => {
      /*
       * THE ASSERTION THIS WHOLE FILE EXISTS FOR. `$onUpdate()` does not fire
       * inside `onConflictDoUpdate`, so without the explicit line the column
       * freezes at the first insert -- silently, because every other assertion
       * about the row still passes. Phase 4's staleness compares against it.
       */
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const first = await getUserMemory(tx, userId);

      await tx.execute(sql`select pg_sleep(0.01)`);
      await upsertUserMemory(tx, {
        userId,
        items: [NASI, LARI],
        inputHash: 'hash-2',
        sourceVersion: USER_MEMORY_SOURCE_VERSION,
        model: 'glm-5.3',
        promptVersion: 'um-1',
      });
      const second = await getUserMemory(tx, userId);

      expect(second!.items).toHaveLength(2);
      expect(second!.inputHash).toBe('hash-2');
      expect(second!.createdAt.getTime()).toBe(first!.createdAt.getTime());
      expect(second!.updatedAt.getTime()).toBeGreaterThan(first!.updatedAt.getTime());
    }));

  it('NEVER CLOBBERS dismissed_ids', () =>
    withRollback(async (tx) => {
      /*
       * The querent owns that column and the model owns `items`. An extraction
       * that could undo a deletion is the delete button lying through the one
       * door the tombstone was built to close.
       */
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);
      await dismissUserMemoryItems(tx, userId, [NASI.id]);

      await upsertUserMemory(tx, {
        userId,
        items: [LARI],
        inputHash: 'hash-3',
        sourceVersion: USER_MEMORY_SOURCE_VERSION,
        model: 'glm-5.3',
        promptVersion: 'um-1',
      });

      expect((await getUserMemory(tx, userId))!.dismissedIds).toEqual([NASI.id]);
    }));
});

describe('the array CHECK constraints', () => {
  it('refuses a jsonb object where a list belongs', () =>
    withRollback(async (tx) => {
      // `$type<>` is an assertion the driver is not obliged to honour; this is
      // the version postgres enforces.
      const userId = await seedUser(tx);
      await expect(
        tx.execute(sql`
          insert into user_memory (user_id, items, input_hash, source_version, model, prompt_version)
          values (${userId}, '{"a":1}'::jsonb, 'h', 1, 'm', 'p')`),
      ).rejects.toThrow();
    }));
});

describe('dismissUserMemoryItems', () => {
  it('removes the item AND tombstones its id, in one statement', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);

      const row = await dismissUserMemoryItems(tx, userId, [NASI.id]);

      expect(row!.items).toEqual([LARI]);
      expect(row!.dismissedIds).toEqual([NASI.id]);
    }));

  it('is idempotent, and a second pass adds no duplicate tombstone', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);
      await dismissUserMemoryItems(tx, userId, [NASI.id]);
      const row = await dismissUserMemoryItems(tx, userId, [NASI.id]);
      expect(row!.items).toEqual([LARI]);
      expect(row!.dismissedIds).toEqual([NASI.id]);
    }));

  it('empties the list to `[]` rather than to null when the last item goes', () =>
    withRollback(async (tx) => {
      // `coalesce(..., '[]'::jsonb)`. A null here would violate the NOT NULL and
      // abort the querent's delete.
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const row = await dismissUserMemoryItems(tx, userId, [NASI.id]);
      expect(row!.items).toEqual([]);
    }));

  it('drops a malformed id instead of tombstoning it', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const row = await dismissUserMemoryItems(tx, userId, ['../../etc/passwd', 'ZZZZ']);
      expect(row!.items).toEqual([NASI]);
      expect(row!.dismissedIds).toEqual([]);
    }));

  it('returns null for a user with no row', () =>
    withRollback(async (tx) => {
      expect(await dismissUserMemoryItems(tx, await seedUser(tx), [NASI.id])).toBeNull();
    }));

  it('touches nobody else', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      await seedMemory(tx, mine, [NASI, LARI]);
      await seedMemory(tx, theirs, [NASI, LARI]);

      await dismissUserMemoryItems(tx, mine, [NASI.id]);

      expect((await getUserMemory(tx, theirs))!.items).toHaveLength(2);
    }));
});

describe('touchUserMemory', () => {
  it('moves updated_at and nothing else', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      const before = await getUserMemory(tx, userId);

      await tx.execute(sql`select pg_sleep(0.01)`);
      await touchUserMemory(tx, userId);
      const after = await getUserMemory(tx, userId);

      expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
      expect(after!.items).toEqual(before!.items);
      expect(after!.inputHash).toBe(before!.inputHash);
      expect(after!.model).toBe(before!.model);
    }));

  it('IS NOT AN UPSERT -- no row means no flag to clear', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await touchUserMemory(tx, userId);
      expect(await getUserMemory(tx, userId)).toBeNull();
    }));
});

describe('redactUserMemory', () => {
  it('empties items, blanks input_hash and KEEPS the tombstones', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI, LARI]);
      await dismissUserMemoryItems(tx, userId, [NASI.id]);

      expect(await redactUserMemory(tx, userId)).toBe(1);

      const row = await getUserMemory(tx, userId);
      expect(row!.items).toEqual([]);
      /*
       * BLANKED ON PURPOSE. An emptied list beside a matching hash means the
       * extractor reports `unchanged` and never writes again -- the feature dead
       * with nothing logged.
       */
      expect(row!.inputHash).toBe('');
      /*
       * KEPT ON PURPOSE. Dropping the row would resurrect, on a day-three
       * restore, exactly the facts the querent had individually deleted.
       */
      expect(row!.dismissedIds).toEqual([NASI.id]);
    }));

  it('is idempotent and reports 0 on a replay', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);
      expect(await redactUserMemory(tx, userId)).toBe(1);
      expect(await redactUserMemory(tx, userId)).toBe(0);
    }));

  it('reports 0 for a user with no memory and for a malformed uuid', () =>
    withRollback(async (tx) => {
      expect(await redactUserMemory(tx, await seedUser(tx))).toBe(0);
      expect(await redactUserMemory(tx, 'not-a-uuid')).toBe(0);
    }));
});

describe('the cascade', () => {
  it('takes the whole row with the account at the HARD delete', () =>
    withRollback(async (tx) => {
      /*
       * NAMED FOR THE PROMISE: `/privacy` clause 8 says everything is removed
       * from the database within thirty days, and this is the only thing that
       * makes that sentence true for this table. **`user_memory.user_id` MUST
       * STAY `on delete cascade`.** The day somebody changes it to `set null`
       * "to keep the analytics", a model's dossier about a deleted person
       * outlives them and this paragraph becomes false, silently.
       */
      const userId = await seedUser(tx);
      await seedMemory(tx, userId, [NASI]);

      await tx.delete(users).where(sql`id = ${userId}`);

      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(userMemory)
        .where(sql`user_id = ${userId}`);
      expect(row.n).toBe(0);
    }));
});

describe('testDb is reachable', () => {
  it('answers a trivial query, so a red suite means the code and not the container', async () => {
    const rows = await testDb.execute(sql`select 1 as one`);
    expect(rows[0].one).toBe(1);
  });
});
