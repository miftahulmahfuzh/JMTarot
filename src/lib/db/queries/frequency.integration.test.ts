/**
 * The frequency scan against a real Postgres (W5 plan Task 2).
 *
 * The pure halves -- the M3 comparator, the M4 gate, the fingerprint, the window
 * maths -- are unit-tested in `src/lib/memory/`. What can only be checked here
 * is that the SQL returns what those functions assume: the right aggregates, the
 * right types, and a DISTINCT reading count that a three-card spread does not
 * triple.
 *
 * FIXTURES ARE BUILT IN-TEST, NOT READ FROM THE SEED. The plan asks W1's seed
 * for a specific shape, and the seed does provide one -- but a test that asserts
 * "the four-reading user fails the gate" against a seed someone else maintains
 * fails the day that user gains a fifth reading for an unrelated reason. The
 * fixtures here are three lines each and they say what they are testing.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { users } from '@/lib/db/schema';
import { closeTestDb, testDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import {
  cardFrequency,
  firstPassingWindow,
  passesGate,
  rankCounts,
} from '@/lib/memory/frequency';
import { cardCounts, readingsInWindow } from './frequency';
import { insertReading } from './history';

afterAll(closeTestDb);

/** 2026-07-26 is a SUNDAY, so the Monday-start week is 2026-07-20..26. */
const TODAY = '2026-07-26';

async function makeUser(tx: Tx, sub: string): Promise<string> {
  const [u] = await tx
    .insert(users)
    .values({ googleSub: sub, email: `${sub}@example.com` })
    .returning();
  return u.id;
}

/** One reading on `localDate` drawing `cards`, as `[cardId, reversed]` pairs. */
async function draw(
  tx: Tx,
  userId: string,
  localDate: string,
  cards: [number, boolean][],
): Promise<string> {
  const row = await insertReading(
    tx,
    {
      userId,
      readerId: 'thessaly',
      serviceId: cards.length === 3 ? 'spread3' : 'daily',
      locale: 'id',
      model: 'test',
      promptVersion: 'id-v1.testtest',
      localDate,
    },
    cards.map(([cardId, reversed], position) => ({ cardId, reversed, position })),
  );
  return row.id;
}

describe('the scan', () => {
  it('counts appearances, reversals and the most recent local date', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-basic');
      await draw(tx, userId, '2026-07-21', [[8, true]]);
      await draw(tx, userId, '2026-07-23', [[8, false]]);
      await draw(tx, userId, '2026-07-25', [[8, true]]);
      await draw(tx, userId, '2026-07-22', [[12, false]]);

      const counts = await cardCounts(tx, userId, '2026-07-20', TODAY);
      const strength = counts.find((c) => c.cardId === 8);

      expect(strength).toEqual({
        cardId: 8,
        count: 3,
        // Only the reversed rows, not all three.
        reversedCount: 2,
        // The LATEST local date, and a 'YYYY-MM-DD' string rather than a Date.
        lastSeen: '2026-07-25',
      });
      expect(counts.find((c) => c.cardId === 12)?.reversedCount).toBe(0);
    });
  });

  it('returns aggregates as numbers, not strings', async () => {
    // postgres.js hands back bigint-shaped aggregates as strings. If this
    // regresses, `count` sorts lexically and '10' ranks below '3' with nothing
    // throwing anywhere -- the ranking is simply wrong for heavy users only.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-types');
      await draw(tx, userId, '2026-07-21', [[8, true]]);

      const [row] = await cardCounts(tx, userId, '2026-07-20', TODAY);
      expect(typeof row.count).toBe('number');
      expect(typeof row.reversedCount).toBe('number');
      expect(typeof row.lastSeen).toBe('string');
      expect(typeof (await readingsInWindow(tx, userId, '2026-07-20', TODAY))).toBe('number');
    });
  });

  it('counts DISTINCT readings, so one three-card spread is one reading', async () => {
    // The gate counts readings, not cards (M4). Summing the grouped counts
    // would report 3 here and let a single spread look like a pattern.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-distinct');
      await draw(tx, userId, '2026-07-21', [
        [1, false],
        [2, false],
        [3, true],
      ]);

      expect(await readingsInWindow(tx, userId, '2026-07-20', TODAY)).toBe(1);
      expect(await cardCounts(tx, userId, '2026-07-20', TODAY)).toHaveLength(3);
    });
  });

  it('bounds are inclusive at both ends', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-bounds');
      await draw(tx, userId, '2026-07-20', [[8, false]]); // the from
      await draw(tx, userId, '2026-07-26', [[8, false]]); // the to
      await draw(tx, userId, '2026-07-19', [[8, false]]); // one day before
      await draw(tx, userId, '2026-07-27', [[8, false]]); // one day after

      const [row] = await cardCounts(tx, userId, '2026-07-20', TODAY);
      expect(row.count).toBe(2);
    });
  });

  it('never sees another user’s cards', async () => {
    await withRollback(async (tx) => {
      const mine = await makeUser(tx, 'freq-mine');
      const theirs = await makeUser(tx, 'freq-theirs');
      await draw(tx, theirs, '2026-07-21', [[8, false]]);
      await draw(tx, theirs, '2026-07-22', [[8, false]]);

      expect(await cardCounts(tx, mine, '2026-07-20', TODAY)).toEqual([]);
      expect(await readingsInWindow(tx, mine, '2026-07-20', TODAY)).toBe(0);
    });
  });

  it('counts failed and aborted readings (reconciliation R7)', async () => {
    // The querent drew those cards. The verdict is about what the deck keeps
    // giving them, not about whether the model finished a sentence.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-r7');
      await insertReading(
        tx,
        {
          userId,
          readerId: 'adrian',
          serviceId: 'daily',
          locale: 'id',
          model: 'test',
          promptVersion: 'id-v1.testtest',
          localDate: '2026-07-21',
          status: 'failed',
          body: null,
        },
        [{ cardId: 8, reversed: false, position: 0 }],
      );

      expect(await cardCounts(tx, userId, '2026-07-20', TODAY)).toHaveLength(1);
    });
  });
});

describe('cardFrequency, end to end', () => {
  it('ranks the real rows and fingerprints them stably', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-rank');
      for (const d of ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25']) {
        await draw(tx, userId, d, [[8, false]]);
      }
      await draw(tx, userId, '2026-07-25', [[12, false]]);
      await draw(tx, userId, '2026-07-24', [[12, true]]);
      await draw(tx, userId, '2026-07-23', [[12, false]]);

      const a = await cardFrequency(tx, 'week', { userId, today: TODAY });
      const b = await cardFrequency(tx, 'week', { userId, today: TODAY });

      expect(a?.ranked.map((c) => c.cardId).slice(0, 2)).toEqual([8, 12]);
      expect(a?.readings).toBe(8);
      // The same input twice produces the same fingerprint. The cache depends
      // on nothing else.
      expect(a?.fingerprint).toBe(b?.fingerprint);
      expect(passesGate(a!)).toBe(true);
    });
  });

  it('returns an empty result, not null, for a window with no readings', async () => {
    // The distinction drives §3.4's "delete any existing row" branch: a window
    // that slid past its evidence must clear its cached line, and a window that
    // was never askable must not.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-empty');
      const r = await cardFrequency(tx, 'week', { userId, today: TODAY });
      expect(r).not.toBeNull();
      expect(r?.readings).toBe(0);
      expect(r?.ranked).toEqual([]);
      expect(passesGate(r!)).toBe(false);
    });
  });

  it('returns null for the birthday window with no birth date', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-nobirth');
      expect(await cardFrequency(tx, 'birthday', { userId, today: TODAY })).toBeNull();
    });
  });

  it('fails the gate for a user with four readings', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-four');
      for (const d of ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']) {
        await draw(tx, userId, d, [
          [8, false],
          [12, false],
        ]);
      }

      const r = await cardFrequency(tx, 'week', { userId, today: TODAY });
      expect(r?.readings).toBe(4);
      // The counts would pass on their own -- 4 and 4 -- so this is the
      // reading gate firing and nothing else.
      expect(r?.ranked[0].count).toBe(4);
      expect(passesGate(r!)).toBe(false);
    });
  });

  it('fails the gate when every card appears exactly once', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-once');
      const days = ['2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24', '2026-07-25'];
      for (const [i, d] of days.entries()) await draw(tx, userId, d, [[i, false]]);

      const r = await cardFrequency(tx, 'week', { userId, today: TODAY });
      expect(r?.readings).toBe(5); // clears minReadings
      expect(passesGate(r!)).toBe(false); // and still fails on minTopCount
    });
  });
});

describe('firstPassingWindow', () => {
  it('skips week and returns d13 when only the wider window qualifies', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-ladder');
      // 2026-07-14..19 is inside d13 (from 2026-07-14) and outside the
      // Monday-start week (from 2026-07-20).
      const days = ['2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19'];
      for (const d of days) {
        await draw(tx, userId, d, [
          [8, false],
          [12, false],
        ]);
      }

      const week = await cardFrequency(tx, 'week', { userId, today: TODAY });
      expect(week?.readings).toBe(0);

      const chosen = await firstPassingWindow(tx, { userId, today: TODAY });
      expect(chosen?.window).toBe('d13');
      expect(chosen?.ranked.map((c) => c.cardId)).toEqual([8, 12]);
    });
  });

  it('prefers week when week qualifies, even though the wider windows also do', async () => {
    // Narrowest first: "this week" is a more interesting statement.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-narrow');
      const days = ['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24'];
      for (const d of days) {
        await draw(tx, userId, d, [
          [8, false],
          [12, false],
        ]);
      }

      expect((await firstPassingWindow(tx, { userId, today: TODAY }))?.window).toBe('week');
    });
  });

  it('returns null when no window on the ladder qualifies', async () => {
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-none');
      await draw(tx, userId, '2026-07-21', [[8, false]]);
      expect(await firstPassingWindow(tx, { userId, today: TODAY })).toBeNull();
    });
  });

  it('walks the ladder without a birth date, since birthday is not on it', async () => {
    // `birthday` returns null without a birth date; the ladder must not treat
    // that as a reason to stop or throw. It is not on VERDICT_LADDER at all,
    // which is what this asserts by not blowing up.
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-nobday-ladder');
      await expect(firstPassingWindow(tx, { userId, today: TODAY })).resolves.toBeNull();
    });
  });
});

describe('the query plan', () => {
  it('can be served by the (user_id, local_date, card_id) index', async () => {
    /*
     * WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT.
     *
     * It asserts that `reading_cards_user_date_card_idx` COVERS this query --
     * that the predicate and the grouping line up with the index's columns in
     * the right order, which is the property that breaks when someone reorders
     * the index or adds a filter to the query.
     *
     * It does NOT assert that the planner picks the index, and the first
     * version of this test did. That version failed, correctly: on the 60 rows
     * a rolled-back transaction can afford, the whole table is one page and a
     * seq scan really is cheaper. Asserting the choice there would have been
     * testing Postgres's cost model against a table size that will never exist
     * in production. `enable_seqscan = off` removes the cheaper option so the
     * question becomes "can the index do it at all", which is the question this
     * file can actually answer.
     *
     * IT IS AN INDEX SCAN, NOT AN INDEX ONLY SCAN, and W5's §3.2 claim that
     * this is "one index-only scan" is wrong. `count(*) filter (where reversed)`
     * references `reversed`, which is not in the index, so every matching row
     * still needs a heap fetch. Making it index-only would mean
     * `include (reversed)` on the index -- W1's call, on W1's table, and not
     * worth a migration until the table is big enough to measure.
     */
    await withRollback(async (tx) => {
      const userId = await makeUser(tx, 'freq-explain');
      for (let i = 0; i < 60; i += 1) {
        await draw(tx, userId, `2026-07-${String((i % 26) + 1).padStart(2, '0')}`, [
          [i % 22, i % 2 === 0],
        ]);
      }
      await tx.execute(sql`analyze reading_cards`);
      await tx.execute(sql`set local enable_seqscan = off`);

      const rows = await tx.execute(sql`
        explain (format text)
        select rc.card_id, count(*), count(*) filter (where rc.reversed), max(rc.local_date)
        from reading_cards rc
        where rc.user_id = ${userId}::uuid
          and rc.local_date >= ${'2026-07-01'}::date
          and rc.local_date <= ${TODAY}::date
        group by rc.card_id
      `);

      const plan = (rows as unknown as { 'QUERY PLAN': string }[])
        .map((r) => r['QUERY PLAN'])
        .join('\n');

      expect(plan).toContain('reading_cards_user_date_card_idx');
      // Both bounds pushed into the index, not re-checked as a heap filter.
      expect(plan).toMatch(/Index Cond:.*local_date/s);
      expect(plan).toMatch(/Index Cond:.*user_id/s);
    });
  });
});
