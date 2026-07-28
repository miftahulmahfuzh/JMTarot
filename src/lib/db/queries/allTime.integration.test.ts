import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { readingCards, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { readingCountAllTime, topCardAllTime, topReaderAllTime } from './allTime';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx, deleted = false): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({
      googleSub: `all:${n}`,
      email: `a${n}@example.com`,
      deletedAt: deleted ? new Date() : null,
    })
    .returning({ id: users.id });
  return user.id;
}

/** One reading with its cards, on a given day, by a given reader. */
async function seedReading(
  tx: Tx,
  userId: string,
  readerId: 'margaret' | 'adrian' | 'thessaly',
  localDate: string,
  cards: { cardId: number; reversed?: boolean }[],
): Promise<void> {
  const [reading] = await tx
    .insert(readings)
    .values({
      userId,
      readerId,
      serviceId: 'spread3',
      locale: 'id',
      localDate,
      model: 'glm-4.6',
      promptVersion: 'id-v1.testtest',
    })
    .returning({ id: readings.id });

  await tx.insert(readingCards).values(
    cards.map((c, position) => ({
      readingId: reading.id,
      userId,
      cardId: c.cardId,
      reversed: c.reversed ?? false,
      position,
      localDate,
    })),
  );
}

describe('the all-time tallies', () => {
  it('counts readings across every day, with no window', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedReading(tx, userId, 'margaret', '2020-01-01', [{ cardId: 0 }]);
      await seedReading(tx, userId, 'margaret', '2024-06-15', [{ cardId: 1 }]);
      await seedReading(tx, userId, 'adrian', '2026-07-28', [{ cardId: 2 }]);

      // Four and a half years apart. Every windowed query in `frequency.ts`
      // would return one of these; that is the whole reason this file exists.
      expect(await readingCountAllTime(tx, userId)).toBe(3);
    }));

  it('returns zero and null for a user with no readings', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      expect(await readingCountAllTime(tx, userId)).toBe(0);
      expect(await topCardAllTime(tx, userId)).toBeNull();
      expect(await topReaderAllTime(tx, userId)).toBeNull();
    }));

  it('names the recurring card and counts it right', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: 8 }, { cardId: 3 }]);
      await seedReading(tx, userId, 'margaret', '2026-07-02', [{ cardId: 8 }, { cardId: 4 }]);
      await seedReading(tx, userId, 'adrian', '2026-07-03', [{ cardId: 8, reversed: true }]);

      const top = await topCardAllTime(tx, userId);
      expect(top).not.toBeNull();
      expect(top?.cardId).toBe(8);
      expect(top?.count).toBe(3);
      expect(top?.reversedCount).toBe(1);
      expect(top?.lastSeen).toBe('2026-07-03');
    }));

  it('hands the count back as a number, not a string', () =>
    withRollback(async (tx) => {
      /*
       * postgres.js returns bigint-shaped aggregates as STRINGS. `'10'` compares
       * fine with `>=` against a number and then sorts below `'3'`, with nothing
       * throwing -- `cardCounts` documents this and this file has to repeat the
       * `Number()`. Eleven draws so the string form would actually be wrong.
       */
      const userId = await seedUser(tx);
      for (let i = 0; i < 11; i += 1) {
        await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: 5 }]);
      }
      const top = await topCardAllTime(tx, userId);
      expect(typeof top?.count).toBe('number');
      expect(top?.count).toBe(11);
      expect(typeof (await readingCountAllTime(tx, userId))).toBe('number');
    }));

  it('breaks a card tie on card id ascending, so the order is total', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: 17 }, { cardId: 2 }]);
      await seedReading(tx, userId, 'margaret', '2026-07-02', [{ cardId: 17 }, { cardId: 2 }]);

      // Both at two. Without the tiebreak the winner would depend on the plan.
      expect((await topCardAllTime(tx, userId))?.cardId).toBe(2);
    }));

  it('does not exclude a soft-deleted user rows', () =>
    withRollback(async (tx) => {
      /*
       * The account is RESTORABLE for `ERASURE_GRACE_DAYS`, and filtering here
       * would make `/account` lie during the grace window while every other query
       * in the app still returned the rows. Consistency beats a filter that only
       * one page applies.
       */
      const userId = await seedUser(tx, true);
      await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: 9 }]);
      expect(await readingCountAllTime(tx, userId)).toBe(1);
      expect((await topCardAllTime(tx, userId))?.cardId).toBe(9);
    }));

  it('names the leading reader and reports the runner-up count', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: 1 }]);
      await seedReading(tx, userId, 'margaret', '2026-07-02', [{ cardId: 1 }]);
      await seedReading(tx, userId, 'adrian', '2026-07-03', [{ cardId: 1 }]);

      const top = await topReaderAllTime(tx, userId);
      expect(top?.readerId).toBe('margaret');
      expect(top?.count).toBe(2);
      expect(top?.runnerUpCount).toBe(1);
    }));

  it('returns null when two readers tie (readerMustLead)', () =>
    withRollback(async (tx) => {
      /*
       * A three-way or two-way tie is not a path opening; it is somebody
       * browsing. The gate lives in `@/lib/persona/lines.ts` because it is pure,
       * but the runner-up count it needs has to come from here -- which is why
       * this query returns it rather than just the winner.
       */
      const userId = await seedUser(tx);
      await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: 1 }]);
      await seedReading(tx, userId, 'adrian', '2026-07-02', [{ cardId: 1 }]);

      const top = await topReaderAllTime(tx, userId);
      expect(top).not.toBeNull();
      expect(top?.count).toBe(top?.runnerUpCount);
    }));

  it('reports runnerUpCount 0 for a user who has only ever used one reader', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedReading(tx, userId, 'thessaly', '2026-07-01', [{ cardId: 1 }]);
      await seedReading(tx, userId, 'thessaly', '2026-07-02', [{ cardId: 1 }]);

      const top = await topReaderAllTime(tx, userId);
      expect(top?.readerId).toBe('thessaly');
      expect(top?.count).toBe(2);
      expect(top?.runnerUpCount).toBe(0);
    }));

  it('is scoped per user in all three', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      await seedReading(tx, mine, 'margaret', '2026-07-01', [{ cardId: 4 }, { cardId: 4 }]);

      expect(await readingCountAllTime(tx, theirs)).toBe(0);
      expect(await topCardAllTime(tx, theirs)).toBeNull();
      expect(await topReaderAllTime(tx, theirs)).toBeNull();
    }));

  it('refuses a malformed uuid without throwing', () =>
    withRollback(async (tx) => {
      expect(await readingCountAllTime(tx, 'nope')).toBe(0);
      expect(await topCardAllTime(tx, 'nope')).toBeNull();
      expect(await topReaderAllTime(tx, 'nope')).toBeNull();
    }));

  /**
   * A12: NO NEW INDEX. `reading_cards_user_date_card_idx` is
   * `(user_id, local_date, card_id)` and its own comment in `schema.ts` argues
   * that a leading-column-only prefix serves anything `(user_id, card_id)` would.
   * This is that case. The plan asked for the plan line to be recorded; this
   * asserts it rather than printing it, so a future index change that turns this
   * into a sequential scan is a red test and not a note nobody reads.
   */
  it('can serve the top-card aggregate from the existing index', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      for (let i = 0; i < 40; i += 1) {
        await seedReading(tx, userId, 'margaret', '2026-07-01', [{ cardId: i % 22 }]);
      }

      /*
       * `enable_seqscan = off`, AND THE FIRST VERSION OF THIS TEST DID NOT HAVE IT
       * AND FAILED. At forty rows the planner chooses `Seq Scan on reading_cards`
       * and is RIGHT to -- the whole table is one page, and no index beats reading
       * one page. So the naive "assert the plan names the index" check fails for a
       * reason that is not a defect, which is the shape of assertion people delete.
       *
       * What A12 actually claims is that the EXISTING index SERVES this predicate,
       * so a second `(user_id, card_id)` index would buy nothing. That is a
       * statement about the index's usability, not about the planner's cost model
       * at toy scale, and `enable_seqscan = off` is exactly how you ask it. `local`,
       * so it dies with the test's transaction.
       *
       * The measured plan is in `allTime.ts`'s header.
       */
      await tx.execute(sql`set local enable_seqscan = off`);

      const rows = await tx.execute(sql`
        explain (format text)
        select card_id, count(*) from reading_cards
         where user_id = ${userId} group by card_id`);
      const plan = rows.map((r) => Object.values(r)[0]).join('\n');

      expect(plan).toContain('reading_cards_user_date_card_idx');
      // The leading-column-only case: no `local_date` in the condition.
      expect(plan).toMatch(/Index Cond: \(user_id = /);
    }));
});
