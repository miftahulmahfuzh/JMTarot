/**
 * The metric catalogue against a real Postgres. A3, v0.5.0.
 *
 * **THE RUNTIME-TYPE ASSERTIONS ARE THE POINT OF THIS FILE AND ROADMAP §10.1 CALLS
 * THEM `required`.** A unit test cannot see this class of bug, because a unit test
 * constructs the value it then asserts on. Only this layer talks to the driver, and
 * the driver hands back `count()` and `sum()` as strings -- V8's `answersUpdatedAt`
 * asserted `sql<Date>` over a `max(timestamptz)`, got a string, and made
 * `personaStaleness` judge every answer edit wrongly with a green typecheck and a
 * green unit suite.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, users, type NewLlmCall } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import { callsByLocalDate, callsByUtcDay, tokensByBucketAndModel } from './metrics';

afterAll(closeTestDb);

let n = 0;

async function seedUser(tx: Tx): Promise<string> {
  n += 1;
  const [user] = await tx
    .insert(users)
    .values({ googleSub: `metrics:${n}`, email: `metrics-${n}@example.com` })
    .returning({ id: users.id });
  return user.id;
}

/** A ledger row with the boring columns filled in. `createdAt` defaults to now(). */
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

/** `createdAt` has to be pinned for a UTC-day test, and Drizzle wants a `Date`. */
function at(iso: string): Date {
  return new Date(iso);
}

describe('M1 -- callsByUtcDay', () => {
  it('buckets by UTC day, zero-fills the gap, and every field is a NUMBER', () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', createdAt: at('2026-07-20T10:00:00Z'), streamed: true }),
        row({ op: 'gist', localDate: '2026-07-20', createdAt: at('2026-07-20T10:00:05Z') }),
        // 2026-07-21 has nothing at all -- the gap.
        row({ op: 'moderation', localDate: '2026-07-22', createdAt: at('2026-07-22T03:00:00Z') }),
      ]);

      const rows = await callsByUtcDay(tx, { from: '2026-07-20', to: '2026-07-22' });

      expect(rows.map((r) => r.bucket)).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
      expect(rows.map((r) => r.calls)).toEqual([2, 0, 1]);
      expect(rows[0].streamedCalls).toBe(1);

      for (const r of rows) {
        // `expect('2').toBe(2)` fails but a caller that adds these gets '11'.
        expect(typeof r.calls).toBe('number');
        expect(typeof r.streamedCalls).toBe('number');
        expect(typeof r.bucket).toBe('string');
        expect(r.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }));

  it("excludes a 'refused' row from the counter reconstruction", () =>
    withRollback(async (tx) => {
      /*
       * A2 struck `'refused'` from the value set (R4), so this predicate matches
       * everything today. It is here because a refusal charged the Redis window
       * NOTHING -- `memoryBackend.consume` returns `{ok:false}` before pushing the
       * timestamp -- so a row for one would double-count the thing that was declined,
       * and this series is what reconstructs the counter.
       */
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', createdAt: at('2026-07-20T10:00:00Z') }),
        row({
          op: 'reading',
          localDate: '2026-07-20',
          createdAt: at('2026-07-20T10:01:00Z'),
          status: 'refused',
        }),
      ]);

      const [day] = await callsByUtcDay(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.calls).toBe(1);
    }));

  it('is empty for a reversed range and for one longer than 400 days', () =>
    withRollback(async (tx) => {
      // The guard refuses rather than truncating: a silently shortened range is a
      // chart missing its left-hand side, saying nothing about it.
      expect(await callsByUtcDay(tx, { from: '2026-07-22', to: '2026-07-20' })).toEqual([]);
      expect(await callsByUtcDay(tx, { from: '2026-01-01', to: '2027-02-05' })).toEqual([]);
      expect(await callsByUtcDay(tx, { from: 'nope', to: '2026-07-20' })).toEqual([]);
    }));
});

describe('M2 -- callsByLocalDate', () => {
  it('ONE UTC bucket, TWO querent days -- the whole reason both functions exist', () =>
    withRollback(async (tx) => {
      /*
       * Two querents share an instant and differ in calendar day: 18:00Z is already
       * Wednesday at UTC+7 (Jakarta) and still Tuesday at UTC-5. M1 must put them in
       * one bucket and M2 in two, and **that pair of assertions in one test is the
       * point** -- either function alone looks correct.
       *
       * The roadmap's phrasing, "a range spanning a DST-free but timezone-shifted
       * day", does not describe a real scenario. This is the test it was reaching for.
       */
      const jakarta = await seedUser(tx);
      const lima = await seedUser(tx);
      const instant = at('2026-07-21T18:00:00Z');

      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: jakarta, localDate: '2026-07-22', createdAt: instant }),
        row({ op: 'reading', userId: lima, localDate: '2026-07-21', createdAt: instant }),
      ]);

      const utc = await callsByUtcDay(tx, { from: '2026-07-21', to: '2026-07-22' });
      expect(utc.find((r) => r.bucket === '2026-07-21')?.calls).toBe(2);
      expect(utc.find((r) => r.bucket === '2026-07-22')?.calls).toBe(0);

      const local = await callsByLocalDate(tx, { from: '2026-07-21', to: '2026-07-22' });
      expect(local.map((r) => r.calls)).toEqual([1, 1]);
    }));

  it('counts DISTINCT users, and every field is a number', () =>
    withRollback(async (tx) => {
      const a = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: a, localDate: '2026-07-20' }),
        row({ op: 'gist', userId: a, localDate: '2026-07-20' }),
      ]);

      const [day] = await callsByLocalDate(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.calls).toBe(2);
      expect(day.users).toBe(1);
      expect(typeof day.users).toBe('number');
    }));

  it('onlyWithUser drops the unattributed rows that make the series two calendars', () =>
    withRollback(async (tx) => {
      /*
       * R25. A cron-driven repair pass, and the three W3 onboarding routes R49 left
       * unattributed, store the UTC date -- so the fleet-wide series is mostly
       * querent-days with a UTC-day minority mixed in. This is the homogeneous
       * version, one argument away.
       */
      const a = await seedUser(tx);
      await tx.insert(llmCalls).values([
        row({ op: 'reading', userId: a, localDate: '2026-07-20' }),
        row({ op: 'translation_repair', localDate: '2026-07-20' }), // no querent
      ]);

      const [mixed] = await callsByLocalDate(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(mixed.calls).toBe(2);
      expect(mixed.users).toBe(1); // count(distinct) already ignores the NULL

      const [pure] = await callsByLocalDate(
        tx,
        { from: '2026-07-20', to: '2026-07-20' },
        { onlyWithUser: true },
      );
      expect(pure.calls).toBe(1);
    }));
});

describe('M3 -- tokensByBucketAndModel', () => {
  it('does NOT collapse two models in one day, and reports the null counts', () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', inputTokens: 1200, outputTokens: 400 }),
        // The z.ai shape: `input_tokens: 0` on the wire, stored NULL.
        row({ op: 'gist', localDate: '2026-07-20', inputTokens: null, outputTokens: 90 }),
        row({
          op: 'moderation',
          localDate: '2026-07-20',
          model: 'glm-4.5-flash',
          inputTokens: 300,
          outputTokens: 12,
        }),
      ]);

      const rows = await tokensByBucketAndModel(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows).toHaveLength(2);

      const main = rows.find((r) => r.model === 'glm-4.6');
      const flash = rows.find((r) => r.model === 'glm-4.5-flash');
      expect(main).toBeDefined();
      expect(flash).toBeDefined();
      if (!main || !flash) return;

      // A single sum across models would be UNPRICEABLE: A-D7 prices per model per
      // period, and the number produced anyway is the one that understates the bill.
      expect(main.calls).toBe(2);
      expect(main.inputTokens).toBe(1200);
      expect(main.outputTokens).toBe(490);
      expect(main.nullInputCalls).toBe(1);
      expect(main.nullOutputCalls).toBe(0);
      expect(flash.inputTokens).toBe(300);

      for (const r of rows) {
        expect(typeof r.calls).toBe('number');
        expect(typeof r.inputTokens).toBe('number');
        expect(typeof r.outputTokens).toBe('number');
        expect(typeof r.nullInputCalls).toBe('number');
      }
    }));

  it('sums to 0 -- not null, not NaN -- when EVERY row is NULL', () =>
    withRollback(async (tx) => {
      /*
       * `sum()` over a group whose every row is NULL is itself NULL, and `Number(null)`
       * is 0 **by accident**. The `coalesce` in SQL and the `Number()` in TypeScript
       * are belt and brace: the two failures look identical on screen and different in
       * a chart.
       */
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', inputTokens: null, outputTokens: null }),
        row({ op: 'gist', localDate: '2026-07-20', inputTokens: null, outputTokens: null }),
      ]);

      const [day] = await tokensByBucketAndModel(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.inputTokens).toBe(0);
      expect(day.outputTokens).toBe(0);
      expect(Number.isNaN(day.inputTokens)).toBe(false);
      expect(day.nullInputCalls).toBe(2);
      // The count that stops a reader concluding the app has no prompt cost.
      expect(day.nullInputCalls).toBe(day.calls);
    }));

  it("does not blow up on `substring(local_date, ...)` -- the `::text` cast is present", () =>
    withRollback(async (tx) => {
      /*
       * `dateCol` is `date(name, { mode: 'string' })` and `mode: 'string'` is a
       * DRIZZLE-side mapping -- the Postgres column is still `date`. Without `::text`
       * the bucket expression raises *"function substring(date, integer, integer) does
       * not exist"*. It fails loudly, which makes it the friendliest member of this
       * family of bugs; every other one is silent.
       */
      await tx.insert(llmCalls).values([row({ op: 'reading', localDate: '2026-07-20' })]);
      const [day] = await tokensByBucketAndModel(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.bucket).toBe('2026-07-20');
      expect(typeof day.bucket).toBe('string');

      // And the raw SQL form the header documents, executed here so the doc comment
      // cannot rot into a query nobody has run.
      const probe = await tx.execute(sql`
        select substring(local_date::text, 1, 7) as month,
               to_char(local_date - ((extract(dow from local_date)::int + 6) % 7),
                       'YYYY-MM-DD')             as week
          from llm_calls limit 1
      `);
      const first = (probe as unknown as Array<Record<string, unknown>>)[0];
      expect(first.month).toBe('2026-07');
      expect(first.week).toBe('2026-07-20'); // 2026-07-20 is itself a Monday
    }));
});
