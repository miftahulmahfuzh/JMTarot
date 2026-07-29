/**
 * `llm_calls` against a real Postgres. v0.5.0 / A2.
 *
 * **THE `typeof === 'number'` ASSERTIONS ARE THE POINT OF THIS FILE.** `count()` and
 * `sum()` come back from postgres.js as STRINGS, and `sql<T>` is an assertion the
 * driver is not obliged to honour -- V8's `answersUpdatedAt` asserted `sql<Date>`
 * over a `max(timestamptz)`, got a string, compared it to a real `Date` with `>`, and
 * judged every answer edit wrongly **with a green typecheck and a green unit suite**.
 * A unit test cannot see this class of bug because it supplies the values the type
 * claims. Only this layer talks to the driver.
 *
 * It would be worse here than there: `'12' > '9'` is `false` and `'100' + 1` is
 * `'1001'`, so a summed token count would be wrong in a direction nobody questions.
 *
 * The FK cases are the other half: both columns are `on delete set null`, so a ledger
 * row **outlives** the user and the reading it was about, losing its attribution
 * rather than blocking an erasure -- the `events.user_id` bargain, and the same shape
 * whose `NOT NULL` spelling would have aborted every hard delete (R3, one table over).
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, readings, users, type NewLlmCall } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { callTotals, callTotalsForUser, callsForReading, insertCalls } from './calls';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `calls:${n}`, email: `calls-${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

async function seedReading(tx: Tx, userId: string, localDate: string): Promise<string> {
  const [reading] = await tx
    .insert(readings)
    .values({
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      localDate,
      model: 'glm-4.6',
      promptVersion: 'id-v1.testtest',
    })
    .returning({ id: readings.id });
  return reading.id;
}

function row(over: Partial<NewLlmCall> & Pick<NewLlmCall, 'op' | 'localDate'>): NewLlmCall {
  return {
    model: 'glm-4.6',
    callClass: 'interactive',
    streamed: false,
    status: 'ok',
    locale: 'id',
    ...over,
  };
}

describe('insertCalls + callTotals', () => {
  it('EVERY AGGREGATE IS A NUMBER, not the string postgres.js hands back', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-20', userId, inputTokens: 1200, outputTokens: 400 }),
        row({ op: 'reading', localDate: '2026-07-20', userId, inputTokens: 1100, outputTokens: 300 }),
      ]);

      const [total] = await callTotals(tx, { from: '2026-07-20', to: '2026-07-20' });

      /*
       * Asserted with `typeof` and not only with `toBe(2)`, because `expect('2').toBe(2)`
       * fails but `expect(Number('2')).toBe(2)` passes -- and a caller that adds these
       * together is what actually breaks. Two rows and four-figure token counts so the
       * string form would be visibly wrong rather than coincidentally right.
       */
      expect(typeof total.calls).toBe('number');
      expect(typeof total.inputTokens).toBe('number');
      expect(typeof total.outputTokens).toBe('number');
      expect(typeof total.untokenized).toBe('number');
      expect(total).toMatchObject({
        model: 'glm-4.6',
        localDate: '2026-07-20',
        op: 'reading',
        calls: 2,
        inputTokens: 2300,
        outputTokens: 700,
        untokenized: 0,
      });
      // The sum is an addition, not a concatenation. `'1200' + '1100'` is '12001100'.
      expect(total.inputTokens + total.outputTokens).toBe(3000);
    }));

  it('groups by (model, local_date, op) and by nothing else', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-20', userId, model: 'glm-4.6', inputTokens: 10 }),
        // Same day, same op, DIFFERENT model: a separate group, because pricing is
        // per model per period and merging them makes a range unpriceable.
        row({ op: 'reading', localDate: '2026-07-20', userId, model: 'glm-4.5-flash', inputTokens: 20 }),
        // Same day, same model, different op: cost by purpose is the whole reason
        // `op` exists.
        row({ op: 'gist', localDate: '2026-07-20', userId, model: 'glm-4.6', inputTokens: 30 }),
        // Different day.
        row({ op: 'reading', localDate: '2026-07-21', userId, model: 'glm-4.6', inputTokens: 40 }),
        // Same group as the first, and DIFFERENT call_class and status -- neither is
        // a grouping key, so this must fold in rather than split.
        row({
          op: 'reading',
          localDate: '2026-07-20',
          userId,
          model: 'glm-4.6',
          callClass: 'deferred',
          status: 'partial',
          inputTokens: 50,
        }),
      ]);

      const rows = await callTotals(tx, { from: '2026-07-20', to: '2026-07-21' });
      expect(rows).toHaveLength(4);
      expect(rows.map((r) => [r.localDate, r.model, r.op, r.calls, r.inputTokens])).toEqual([
        ['2026-07-20', 'glm-4.5-flash', 'reading', 1, 20],
        ['2026-07-20', 'glm-4.6', 'gist', 1, 30],
        ['2026-07-20', 'glm-4.6', 'reading', 2, 60],
        ['2026-07-21', 'glm-4.6', 'reading', 1, 40],
      ]);
    }));

  it('counts a row with NO tokens as untokenized and sums it as zero, never as null', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await insertCalls(tx, [
        // THE z.ai CASE, and it is expected to be the common one: `nonZero()` turns
        // `input_tokens: 0` into NULL on both provider paths, so a whole group can be
        // untokenized. `sum()` over all-NULL is NULL, hence the `coalesce`.
        row({ op: 'lotus', localDate: '2026-07-20', userId }),
        row({ op: 'lotus', localDate: '2026-07-20', userId }),
        row({ op: 'lotus', localDate: '2026-07-20', userId, outputTokens: 90 }),
      ]);

      const [total] = await callTotals(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(total.calls).toBe(3);
      expect(total.untokenized).toBe(2);
      expect(total.inputTokens).toBe(0);
      expect(total.outputTokens).toBe(90);
      expect(Number.isNaN(total.inputTokens)).toBe(false);
    }));

  it('the range is INCLUSIVE at both ends, on local_date and not created_at', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-19', userId }),
        row({ op: 'reading', localDate: '2026-07-20', userId }),
        row({ op: 'reading', localDate: '2026-07-21', userId }),
        row({ op: 'reading', localDate: '2026-07-22', userId }),
      ]);

      const rows = await callTotals(tx, { from: '2026-07-20', to: '2026-07-21' });
      expect(rows.map((r) => r.localDate)).toEqual(['2026-07-20', '2026-07-21']);
    }));

  it('inserts nothing and runs no statement for an empty buffer', () =>
    withRollback(async (tx) => {
      // The common case on a request that made no model call. An `insert ... values ()`
      // with no rows is a syntax error, so the guard is load-bearing rather than tidy.
      await insertCalls(tx, []);
      const rows = await tx.execute(sql`select count(*)::int as n from llm_calls`);
      expect((rows[0] as { n: number }).n).toBe(0);
    }));
});

describe('callTotalsForUser', () => {
  it('sees one user and no other, and returns numbers', () =>
    withRollback(async (tx) => {
      const mine = await seedUser(tx);
      const theirs = await seedUser(tx);
      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-20', userId: mine, inputTokens: 100 }),
        row({ op: 'reading', localDate: '2026-07-20', userId: theirs, inputTokens: 999 }),
        // Unattributed -- the R49 Lotus case. It belongs to the fleet total and to
        // nobody's per-user page.
        row({ op: 'lotus', localDate: '2026-07-20', inputTokens: 555 }),
      ]);

      const [total] = await callTotalsForUser(tx, mine, { from: '2026-07-20', to: '2026-07-20' });
      expect(total.inputTokens).toBe(100);
      expect(typeof total.calls).toBe('number');

      // The fleet total sees all three, including the unattributed one.
      const fleet = await callTotals(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(fleet.reduce((sum, r) => sum + r.inputTokens, 0)).toBe(1654);
    }));

  it('returns an empty array rather than a zero row for a user with no calls', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      expect(await callTotalsForUser(tx, userId, { from: '2026-07-20', to: '2026-07-21' })).toEqual(
        [],
      );
    }));
});

describe('callsForReading', () => {
  it('returns this reading only, oldest first', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const readingId = await seedReading(tx, userId, '2026-07-20');
      const other = await seedReading(tx, userId, '2026-07-20');

      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-20', userId, readingId, streamed: true }),
        row({ op: 'gist', localDate: '2026-07-20', userId, readingId, callClass: 'deferred' }),
        row({ op: 'reading', localDate: '2026-07-20', userId, readingId: other, streamed: true }),
        /*
         * THE MODERATION CALL, WITH NO `reading_id`, AND R51 IS WHY. The classifier
         * runs BEFORE the `readings` row exists, so it can never carry one -- which is
         * why what this function returns is "generation cost" and not the reading's
         * total cost. If a future change makes this row appear here, the label on
         * A5's page is wrong.
         */
        row({ op: 'moderation', localDate: '2026-07-20', userId, model: 'glm-4.5-flash' }),
      ]);

      const rows = await callsForReading(tx, readingId);
      expect(rows.map((r) => r.op)).toEqual(['reading', 'gist']);
    }));
});

describe('the FK actions do not veto erasure', () => {
  it('lets a USER be hard-deleted, keeping the row with a null user_id', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-20', userId, inputTokens: 1200 }),
      ]);

      // The sweep's statement, and it must SUCCEED. A `NOT NULL` column with an
      // `on delete set null` action raises 23502 here -- the R3 failure, one table
      // over, where it would have aborted every erasure.
      await tx.execute(sql`delete from users where id = ${userId}`);

      const rows = await tx.select().from(llmCalls);
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBeNull();
      // The COST FACT survives the erasure, which is the whole bargain: a deleted
      // account's spend still counts against the window it was spent in.
      expect(rows[0].inputTokens).toBe(1200);
    }));

  it('lets a READING be deleted, keeping the row with a null reading_id', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      const readingId = await seedReading(tx, userId, '2026-07-20');
      await insertCalls(tx, [row({ op: 'reading', localDate: '2026-07-20', userId, readingId })]);

      await tx.execute(sql`delete from readings where id = ${readingId}`);

      const rows = await tx.select().from(llmCalls);
      expect(rows).toHaveLength(1);
      expect(rows[0].readingId).toBeNull();
      expect(rows[0].userId).toBe(userId);
    }));

  it('a user delete CASCADES the reading and still leaves the ledger row', () =>
    withRollback(async (tx) => {
      /*
       * The real erasure path: `readings.user_id` is `cascade`, so deleting the user
       * deletes the reading, which then `set null`s this row's `reading_id` on the way
       * past. Both actions fire in one statement and neither may abort it.
       */
      const userId = await seedUser(tx);
      const readingId = await seedReading(tx, userId, '2026-07-20');
      await insertCalls(tx, [
        row({ op: 'reading', localDate: '2026-07-20', userId, readingId, outputTokens: 640 }),
      ]);

      await tx.execute(sql`delete from users where id = ${userId}`);

      const rows = await tx.select().from(llmCalls);
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBeNull();
      expect(rows[0].readingId).toBeNull();
      expect(rows[0].outputTokens).toBe(640);
    }));
});
