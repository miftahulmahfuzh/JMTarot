/**
 * `readings.ts` against a real Postgres. v0.5.0 / A5, task 4.
 *
 * Three subjects, and the first is the one a future refactor breaks:
 *
 *  1. **`'body' in item === false`, asserted on the returned OBJECT.** Not
 *     `item.body === null` — V6's precedent, whose binding reason is VD8 rather than bytes:
 *     a query that fetched the column and dropped it has already put the prose in the
 *     payload. `hasBody` is the nullity, and it is a real `boolean` under `typeof`.
 *  2. **A `blocked` reading IS returned, with zero cards** (A5-22). V6 filters those and is
 *     right to; on `/admin` the ask is "everything" and the operator tunes the blocklist.
 *  3. **The ledger fold**, where `count()` is a bigint and `sum()` is a numeric — both
 *     arrive as strings a `sql<number>` would make the compiler believe.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, readingCards, readings, users } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import {
  readingCardsFor,
  readingCostsFor,
  readingExistsForUser,
  readingWithBodyForAdmin,
  readingsForAdmin,
} from './readings';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [row] = await tx
    .insert(users)
    .values({ googleSub: `a5read:${n}`, email: `a5read-${n}@example.com` })
    .returning({ id: users.id });
  return row.id;
}

async function seedReading(
  tx: Tx,
  userId: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const [row] = await tx
    .insert(readings)
    .values({
      userId,
      readerId: 'margaret',
      serviceId: 'spread3',
      locale: 'id',
      question: 'apa yang harus aku lakukan',
      status: 'ok',
      body: 'empat paragraf',
      gist: 'ringkas',
      model: 'glm-4.6',
      promptVersion: 'p1',
      latencyMs: 4591,
      tokenInput: 900,
      tokenOutput: 350,
      sessionId: 'sess-1',
      localDate: '2026-07-20',
      ...over,
    })
    .returning({ id: readings.id });
  return row.id;
}

describe('the list payload (A5-8)', () => {
  it('has no body and no gist KEY at all, and hasBody is a real boolean', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedReading(tx, user);

      const { rows } = await readingsForAdmin(tx, user);
      expect(rows).toHaveLength(1);
      for (const item of rows) {
        expect('body' in item).toBe(false);
        expect('gist' in item).toBe(false);
        expect(typeof item.hasBody).toBe('boolean');
        expect(typeof item.hasGist).toBe('boolean');
      }
      expect(rows[0].hasBody).toBe(true);
      expect(rows[0].hasGist).toBe(true);
      // `local_date` is a STRING and stays one (A5-15): a `Date` renders in the server's
      // zone and is a day out for anyone in Jakarta between midnight and 07:00.
      expect(typeof rows[0].localDate).toBe('string');
      expect(rows[0].localDate).toBe('2026-07-20');
      expect(rows[0].createdAt).toBeInstanceOf(Date);
      // The prose is not in the payload, but the QUESTION is -- deliberately, and the
      // asymmetry is the decision (§4.6).
      expect(rows[0].question).toBe('apa yang harus aku lakukan');
    }));

  it('reports hasBody false for a failed reading rather than omitting the row', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedReading(tx, user, { status: 'failed', body: null, gist: null });

      const { rows } = await readingsForAdmin(tx, user);
      expect(rows[0].status).toBe('failed');
      expect(rows[0].hasBody).toBe(false);
      expect(rows[0].hasGist).toBe(false);
    }));
});

describe('a blocked reading is returned, with no cards (A5-22)', () => {
  it('does not apply V6 status filter', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      await seedReading(tx, user, {
        status: 'blocked',
        body: null,
        gist: null,
        question: 'teks yang ditandai',
      });

      const { rows } = await readingsForAdmin(tx, user);
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('blocked');
      // A blocked reading has no `reading_cards` rows at all, which is why the caller
      // defaults to `[]` rather than asserting a length.
      expect(rows[0].cards).toEqual([]);
    }));
});

describe('cards come back in position order', () => {
  it('orders by position even when inserted out of order', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const reading = await seedReading(tx, user);
      await tx.insert(readingCards).values([
        { readingId: reading, userId: user, cardId: 16, reversed: false, position: 2, localDate: '2026-07-20' },
        { readingId: reading, userId: user, cardId: 9, reversed: true, position: 0, localDate: '2026-07-20' },
        { readingId: reading, userId: user, cardId: 6, reversed: false, position: 1, localDate: '2026-07-20' },
      ]);

      const { rows } = await readingsForAdmin(tx, user);
      expect(rows[0].cards.map((c) => c.position)).toEqual([0, 1, 2]);
      expect(rows[0].cards.map((c) => c.cardId)).toEqual([9, 6, 16]);
      expect(rows[0].cards[0].reversed).toBe(true);

      // And the map form, which the page uses for a page of readings.
      const map = await readingCardsFor(tx, [reading]);
      expect(map.get(reading)!.map((c) => c.cardId)).toEqual([9, 6, 16]);
      expect(await readingCardsFor(tx, [])).toEqual(new Map());
      expect(await readingCardsFor(tx, ['banana'])).toEqual(new Map());
    }));
});

describe('keyset paging (A5-D2)', () => {
  /*
   * **THIS TEST IS WHY `ReadingCursor.createdAt` IS TEXT AND NOT A `Date`.** Every row
   * seeded inside one transaction shares a `created_at`, because `now()` is fixed for the
   * transaction — so the `(created_at = $cursor AND id < $id)` tiebreak is the ONLY thing
   * paging these five rows, which is precisely the arm a millisecond-truncated `Date`
   * cursor cannot match. With the first version it returned **two unique ids across three
   * pages** and a non-null cursor at the end.
   *
   * In production the timestamps differ, so a `Date` cursor would instead drop one row per
   * page boundary whose microseconds are non-zero, and the list would quietly end early.
   */
  it('returns no duplicate id across three pages and stops at the end', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      for (let i = 0; i < 5; i += 1) await seedReading(tx, user);

      const first = await readingsForAdmin(tx, user, { limit: 2 });
      expect(first.rows).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();

      const second = await readingsForAdmin(tx, user, { limit: 2, before: first.nextCursor! });
      const third = await readingsForAdmin(tx, user, { limit: 2, before: second.nextCursor! });

      const ids = [...first.rows, ...second.rows, ...third.rows].map((r) => r.id);
      expect(new Set(ids).size).toBe(5);
      expect(third.nextCursor).toBeNull();
    }));
});

describe('readingCostsFor -- the ledger fold (R51)', () => {
  it('sums the calls that carry a reading_id and keeps untokenized separate', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const reading = await seedReading(tx, user);
      await tx.insert(llmCalls).values([
        {
          userId: user,
          readingId: reading,
          op: 'reading',
          model: 'glm-4.6',
          callClass: 'interactive',
          streamed: true,
          inputTokens: 900,
          outputTokens: 350,
          totalMs: 6100,
          status: 'ok',
          localDate: '2026-07-20',
        },
        {
          userId: user,
          readingId: reading,
          op: 'gist',
          model: 'glm-4.5-flash',
          callClass: 'deferred',
          streamed: false,
          // The provider reported nothing: NULL and never 0 (A-D7).
          inputTokens: null,
          outputTokens: null,
          totalMs: null,
          status: 'ok',
          localDate: '2026-07-20',
        },
        {
          // The moderation classifier: no `reading_id`, and it can never have one --
          // it runs BEFORE the readings row exists. This row must NOT be folded in.
          userId: user,
          readingId: null,
          op: 'moderation',
          model: 'glm-4.5-flash',
          callClass: 'interactive',
          streamed: false,
          inputTokens: 40,
          outputTokens: 4,
          totalMs: 700,
          status: 'ok',
          localDate: '2026-07-20',
        },
      ]);

      const costs = await readingCostsFor(tx, [reading]);
      const cost = costs.get(reading)!;
      expect(cost.calls).toBe(2);
      expect(typeof cost.calls).toBe('number');
      expect(cost.inputTokens).toBe(900);
      expect(cost.outputTokens).toBe(350);
      expect(cost.untokenized).toBe(1);
      expect(cost.totalMs).toBe(6100);
    }));

  it('reports a null total_ms as null and never as zero', () =>
    withRollback(async (tx) => {
      const user = await seedUser(tx);
      const reading = await seedReading(tx, user);
      await tx.insert(llmCalls).values({
        userId: user,
        readingId: reading,
        op: 'reading',
        model: 'glm-4.6',
        callClass: 'interactive',
        streamed: true,
        totalMs: null,
        status: 'aborted',
        localDate: '2026-07-20',
      });

      // `sum()` over a group whose every value is NULL is itself NULL, and `Number(null)`
      // is 0 by accident. A null latency is a fact; a zero is a claim.
      const costs = await readingCostsFor(tx, [reading]);
      expect(costs.get(reading)!.totalMs).toBeNull();
      expect(costs.get(reading)!.calls).toBe(1);
    }));
});

describe('ownership is a predicate (A5-16)', () => {
  it('will not return another user reading for a valid uuid', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      const theirReading = await seedReading(tx, theirs, { body: 'rahasia' });

      expect(await readingWithBodyForAdmin(tx, mine, theirReading)).toBeNull();
      expect(await readingExistsForUser(tx, mine, theirReading)).toBe(false);
      expect((await readingsForAdmin(tx, mine)).rows).toEqual([]);

      // And it DOES return it for the owner, so the null above is a predicate rather than
      // a broken query.
      const row = await readingWithBodyForAdmin(tx, theirs, theirReading);
      expect(row?.body).toBe('rahasia');
      expect(await readingExistsForUser(tx, theirs, theirReading)).toBe(true);
    }));

  it('is empty for a malformed uuid rather than raising 22P02 (A5-17)', () =>
    withRollback(async (tx) => {
      expect((await readingsForAdmin(tx, 'banana')).rows).toEqual([]);
      expect(await readingWithBodyForAdmin(tx, 'banana', 'banana')).toBeNull();
      expect(await readingExistsForUser(tx, 'banana', 'banana')).toBe(false);
      expect(await readingCostsFor(tx, ['banana'])).toEqual(new Map());
    }));
});
