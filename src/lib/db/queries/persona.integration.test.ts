import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { getPersona, upsertPersona } from './persona';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `persona:${n}`, email: `p${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

const ROW = {
  body: 'Angka jalan hidupmu tujuh, dan wujudnya The Chariot.',
  locale: 'id' as const,
  facts: { lifePath: 7 },
  inputHash: 'a'.repeat(64),
  sourceVersion: 1,
  model: 'glm-4.6',
  promptVersion: 'persona-v1',
};

describe('persona queries', () => {
  it('returns null when there is no row', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      expect(await getPersona(tx, userId)).toBeNull();
    }));

  it('inserts and reads back', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await upsertPersona(tx, { userId, ...ROW });

      const row = await getPersona(tx, userId);
      expect(row).not.toBeNull();
      expect(row?.body).toBe(ROW.body);
      expect(row?.locale).toBe('id');
      expect(row?.facts).toEqual({ lifePath: 7 });
      expect(row?.inputHash).toBe(ROW.inputHash);
      expect(row?.model).toBe('glm-4.6');
    }));

  it('overwrites the body on the second upsert rather than inserting a second row', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await upsertPersona(tx, { userId, ...ROW });
      await upsertPersona(tx, { ...ROW, userId, body: 'Different prose entirely.', model: 'fallback' });

      const rows = await tx.execute(
        sql`select count(*)::int as c from personas where user_id = ${userId}`,
      );
      expect(rows[0].c).toBe(1);

      const row = await getPersona(tx, userId);
      expect(row?.body).toBe('Different prose entirely.');
      expect(row?.model).toBe('fallback');
    }));

  /**
   * THE ONE THAT MATTERS. `$onUpdate()` does not fire inside
   * `onConflictDoUpdate`, so `updatedAt` has to be set by hand -- and here that
   * is not cosmetic: `updated_at` is what `isPersonaStale`'s throttle compares,
   * so a frozen column means the throttle never releases and the persona never
   * regenerates. It is also V2's translation-staleness comparand, so a frozen
   * column serves a stale translation forever too.
   */
  it('moves updated_at on the second upsert', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await upsertPersona(tx, { userId, ...ROW });
      const first = (await getPersona(tx, userId))!.updatedAt;

      /*
       * Back-date the row rather than sleeping. The insert and the second upsert
       * land inside the same millisecond otherwise, which would make this pass
       * for the wrong reason -- or fail for one.
       */
      await tx.execute(
        sql`update personas set updated_at = updated_at - interval '1 hour' where user_id = ${userId}`,
      );
      const backdated = (await getPersona(tx, userId))!.updatedAt;
      expect(backdated.getTime()).toBeLessThan(first.getTime());

      await upsertPersona(tx, { ...ROW, userId, body: 'Newer prose.' });
      const second = (await getPersona(tx, userId))!.updatedAt;
      expect(second.getTime()).toBeGreaterThan(backdated.getTime());
    }));

  it('keeps created_at from the first insert', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await upsertPersona(tx, { userId, ...ROW });
      const first = (await getPersona(tx, userId))!.createdAt;

      await tx.execute(
        sql`update personas set created_at = created_at - interval '2 days' where user_id = ${userId}`,
      );
      await upsertPersona(tx, { ...ROW, userId, body: 'Newer prose.' });

      const after = (await getPersona(tx, userId))!.createdAt;
      // Two days ago, not now: "when did this person first get a persona" must
      // stay answerable across regenerations.
      expect(after.getTime()).toBeLessThan(first.getTime());
    }));

  it('cascades away with the user', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await upsertPersona(tx, { userId, ...ROW });
      await tx.execute(sql`delete from users where id = ${userId}`);

      const rows = await tx.execute(
        sql`select count(*)::int as c from personas where user_id = ${userId}`,
      );
      expect(rows[0].c).toBe(0);
    }));

  it('is scoped per user', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      await upsertPersona(tx, { userId: mine, ...ROW });

      expect(await getPersona(tx, theirs)).toBeNull();
    }));

  it('refuses a malformed uuid without throwing', () =>
    withRollback(async (tx) => {
      // `/api/persona` reads `user.id` off a session so this cannot happen from
      // the app -- but a query that 500s on a bad id is a query that turns a
      // client bug into an outage, and `queries/share.ts` guards the same way.
      expect(await getPersona(tx, 'not-a-uuid')).toBeNull();
    }));
});
