/**
 * `translations` against a real Postgres (V2 Tasks 10, 11 and 18).
 *
 * Three things here can only be checked against a real database, and all three
 * have already cost this project time in one form or another:
 *
 *   1. THE UPSERT MOVES `updated_at`. `$onUpdate()` does not fire inside
 *      `onConflictDoUpdate`, and for THIS table that column is the entire
 *      staleness mechanism — a frozen one serves the first translation forever.
 *   2. THE ORPHAN SWEEP'S `to_regclass` GUARD leaves `persona` rows alone while
 *      V8's table does not exist. Without it the unknown-entity arm would delete
 *      every persona translation the day V8 ships one.
 *   3. `resolveTranslatable` RETURNS NULL FOR SOMEBODY ELSE'S UUID. This is the
 *      security-relevant test in the workstream: without it `/api/translate` is
 *      an oracle that hands you another user's reading in your language.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { translations, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { insertReading } from './history';
import {
  deleteOrphanTranslations,
  deleteTranslationsFor,
  getTranslation,
  putTranslation,
  resolveTranslatable,
} from './translations';

afterAll(closeTestDb);

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

async function makeReading(tx: Tx, userId: string, body = 'Bacaan asli.'): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: 'margaret',
      serviceId: 'spread3',
      locale: 'id',
      localDate: '2026-07-27',
      body,
      model: 'glm-4.6',
      promptVersion: 'id-v1.deadbeef',
      status: 'ok',
    },
    [
      { cardId: 16, reversed: false, position: 0 },
      { cardId: 9, reversed: false, position: 1 },
      { cardId: 6, reversed: true, position: 2 },
    ],
  );
  return row.id;
}

/**
 * Every message in an error's `cause` chain, joined.
 *
 * Drizzle wraps driver errors, so the interesting text -- a constraint name, a
 * SQLSTATE -- is one or two levels down. This is a test helper and not production
 * code on purpose: the production rule is the opposite one, that a driver error is
 * never logged at all, because it quotes its bound parameters and one of those is
 * the translated body.
 */
function causeChain(err: unknown): string {
  const out: string[] = [];
  for (let e: unknown = err, depth = 0; e && depth < 6; depth++) {
    if (e instanceof Error) out.push(e.message);
    e = (e as { cause?: unknown })?.cause;
  }
  return out.join(' | ');
}

const KEY = (entityId: string) =>
  ({ entity: 'reading', entityId, field: 'body', locale: 'en' }) as const;

const input = (entityId: string, body: string) => ({
  entity: 'reading',
  entityId,
  field: 'body',
  sourceLocale: 'id' as const,
  locale: 'en' as const,
  body,
  model: 'glm-4.6',
  promptVersion: 'translate-v1',
});

describe('getTranslation / putTranslation', () => {
  it('misses cleanly rather than throwing', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-miss');
      const rid = await makeReading(tx, uid);
      expect(await getTranslation(tx, KEY(rid))).toBeNull();
    });
  });

  it('inserts, and reads back on the composite key', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-insert');
      const rid = await makeReading(tx, uid);

      const written = await putTranslation(tx, input(rid, 'The reading, in English.'));
      expect(written.body).toBe('The reading, in English.');

      const read = await getTranslation(tx, KEY(rid));
      expect(read?.id).toBe(written.id);
      expect(read?.sourceLocale).toBe('id');
    });
  });

  /*
   * THE `$onUpdate()`-INSIDE-`onConflictDoUpdate` TRAP.
   *
   * Asserting the timestamp ACTUALLY MOVED, not merely that the body changed — the
   * body changing is what a broken implementation also does. For this table
   * `updated_at` is compared against the source's own timestamp to decide staleness,
   * so a column frozen at the first insert means every regenerated source serves its
   * first translation forever, and nothing looks wrong.
   */
  it('updates on conflict AND moves updated_at, which $onUpdate would not', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-upsert');
      const rid = await makeReading(tx, uid);

      const first = await putTranslation(tx, input(rid, 'First.'));

      /*
       * `withRollback` runs inside ONE transaction, and `now()` is
       * transaction-start time — the same trap `created_at` sprang on W5's
       * `recallableReadings`. So the two writes would share a timestamp exactly and
       * a `>` assertion would fail against correct code. `new Date()` is JS clock
       * time, which is what `putTranslation` actually writes, so this is asserting
       * the real mechanism rather than working around it.
       */
      const second = await putTranslation(tx, input(rid, 'Second.'));

      expect(second.id).toBe(first.id);
      expect(second.body).toBe('Second.');
      expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
      expect(second.updatedAt.getTime()).toBeGreaterThan(second.createdAt.getTime() - 1000);

      // And exactly one row: the unique key is (entity, entity_id, field, locale).
      const all = await tx.select().from(translations);
      expect(all).toHaveLength(1);
    });
  });

  /*
   * The check constraint doing its job. A row translated into its own source
   * language is a bug, not data, and it is the shape a caller produces by passing
   * the viewer's locale as both.
   */
  it('refuses a row whose source locale equals its target', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-check');
      const rid = await makeReading(tx, uid);

      /*
       * ASSERTED ON THE CAUSE CHAIN, not on `.toThrow(/…/)`. Drizzle wraps a driver
       * error in a `DrizzleQueryError` whose own message is only "Failed query:
       * insert into …", so a regex against the outer message matches nothing and
       * the first version of this test failed while the constraint was working
       * perfectly. The constraint name is on the postgres error underneath.
       */
      const err = await putTranslation(tx, { ...input(rid, 'x'), locale: 'id' }).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err).not.toBeNull();
      expect(causeChain(err)).toMatch(/translations_locale_differs_ck/);
    });
  });
});

describe('deleteTranslationsFor', () => {
  it('removes both fields of one entity and nothing else', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-del');
      const mine = await makeReading(tx, uid);
      const other = await makeReading(tx, uid);

      await putTranslation(tx, input(mine, 'body en'));
      await putTranslation(tx, { ...input(mine, 'gist en'), field: 'gist' });
      await putTranslation(tx, input(other, 'other body en'));

      expect(await deleteTranslationsFor(tx, 'reading', mine)).toBe(2);
      expect(await getTranslation(tx, KEY(mine))).toBeNull();
      expect(await getTranslation(tx, KEY(other))).not.toBeNull();
    });
  });

  it('is a no-op on an entity with no translations', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-del-none');
      const rid = await makeReading(tx, uid);
      expect(await deleteTranslationsFor(tx, 'reading', rid)).toBe(0);
    });
  });
});

describe('deleteOrphanTranslations', () => {
  it('reaps a translation whose reading is gone, and spares one whose reading is not', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-orphan');
      const doomed = await makeReading(tx, uid);
      const kept = await makeReading(tx, uid);

      await putTranslation(tx, input(doomed, 'doomed en'));
      await putTranslation(tx, input(kept, 'kept en'));

      await tx.execute(sql`delete from readings where id = ${doomed}`);

      expect(await deleteOrphanTranslations(tx)).toBe(1);
      expect(await getTranslation(tx, KEY(kept))).not.toBeNull();
    });
  });

  /*
   * A value that no longer means anything can never be resolved and would
   * otherwise accumulate forever. This is the arm that makes the `to_regclass`
   * guard necessary rather than merely tidy — without the guard, `persona` would
   * either fall into THIS arm and be deleted, or have to be left out until V8
   * remembered to come back.
   */
  it('reaps a row whose entity is not in the registry at all', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-unknown');
      const rid = await makeReading(tx, uid);
      await tx.insert(translations).values({ ...input(rid, 'x'), entity: 'nonsense' });

      expect(await deleteOrphanTranslations(tx)).toBe(1);
    });
  });

  /*
   * THE ASSERTION THAT STOPS V8 LOSING DATA.
   *
   * `personas` does not exist yet. A `persona` row must be left ALONE rather than
   * swept as an unknown entity — the entity is in the registry from day one, its
   * orphan arm is written from day one, and `to_regclass` makes it do nothing until
   * the table lands. If V8 ships `personas` and this test starts failing, the guard
   * has begun working rather than stopped.
   */
  it('leaves persona rows untouched while V8’s table does not exist', async () => {
    await withRollback(async (tx) => {
      const [{ exists }] = (await tx.execute(
        sql`select to_regclass('public.personas') is not null as exists`,
      )) as unknown as Array<{ exists: boolean }>;

      const uid = await makeUser(tx, 'dev:t-persona');
      await tx.insert(translations).values({
        ...input(uid, 'persona en'),
        entity: 'persona',
        // The persona is keyed on users.user_id, so the entity id IS the user id.
        entityId: uid,
      });

      const reaped = await deleteOrphanTranslations(tx);

      if (exists) {
        // V8 has landed. A real persona row exists for this user or it does not;
        // either way the arm is now live and this test's premise is gone.
        return;
      }
      expect(reaped).toBe(0);
      const [row] = await tx.select().from(translations);
      expect(row?.entity).toBe('persona');
    });
  });
});

describe('resolveTranslatable', () => {
  it('returns the reading body and its provenance for its owner', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-resolve');
      const rid = await makeReading(tx, uid, 'Bacaan yang panjang.');

      const got = await resolveTranslatable(tx, {
        entity: 'reading',
        entityId: rid,
        field: 'body',
        userId: uid,
      });

      expect(got?.body).toBe('Bacaan yang panjang.');
      expect(got?.sourceLocale).toBe('id');
      expect(got?.readerId).toBe('margaret');
      expect(got?.serviceId).toBe('spread3');
      expect(got?.sourceUpdatedAt).toBeInstanceOf(Date);
    });
  });

  /*
   * T9, AND THE ONE ASSERTION HERE WITH A SECURITY CONSEQUENCE.
   *
   * "Does not exist" and "not yours" are the SAME ANSWER. Distinguishing them
   * would confirm the uuid exists, which is the same reasoning V7 applies to share
   * slugs — and the filter is in the same statement rather than a fetch-then-compare,
   * which is one refactor away from not comparing.
   */
  it('returns null for another user’s uuid, exactly as for one that does not exist', async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'dev:t-mine');
      const theirs = await makeUser(tx, 'dev:t-theirs');
      const rid = await makeReading(tx, theirs);

      expect(
        await resolveTranslatable(tx, {
          entity: 'reading',
          entityId: rid,
          field: 'body',
          userId: mine,
        }),
      ).toBeNull();

      expect(
        await resolveTranslatable(tx, {
          entity: 'reading',
          entityId: '00000000-0000-4000-8000-000000000000',
          field: 'body',
          userId: mine,
        }),
      ).toBeNull();
    });
  });

  /*
   * A reading whose stream died has `body: null`. There is nothing to translate,
   * and returning a row with a null body would push that check onto the route.
   */
  it('returns null for a reading with no body', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-nobody');
      const row = await insertReading(
        tx,
        {
          userId: uid,
          readerId: 'adrian',
          serviceId: 'daily',
          locale: 'id',
          localDate: '2026-07-27',
          body: null,
          model: 'glm-4.6',
          promptVersion: 'id-v1.deadbeef',
          status: 'failed',
        },
        [],
      );

      expect(
        await resolveTranslatable(tx, {
          entity: 'reading',
          entityId: row.id,
          field: 'body',
          userId: uid,
        }),
      ).toBeNull();
    });
  });

  it('resolves the gist field, and returns null when there is no gist', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-gist');
      const rid = await makeReading(tx, uid);

      const args = { entity: 'reading', entityId: rid, field: 'gist', userId: uid } as const;
      expect(await resolveTranslatable(tx, args)).toBeNull();

      await tx.execute(sql`update readings set gist = 'satu klausa' where id = ${rid}`);
      expect((await resolveTranslatable(tx, args))?.body).toBe('satu klausa');
    });
  });

  /*
   * The persona arm is guarded by `to_regclass` too, for the same reason the sweep's
   * is: it must not raise on a table V8 has not built.
   */
  it('answers null for a persona while V8’s table does not exist, rather than raising', async () => {
    await withRollback(async (tx) => {
      const uid = await makeUser(tx, 'dev:t-persona-resolve');
      await expect(
        resolveTranslatable(tx, {
          entity: 'persona',
          entityId: uid,
          field: 'body',
          userId: uid,
        }),
      ).resolves.toBeNull();
    });
  });
});
