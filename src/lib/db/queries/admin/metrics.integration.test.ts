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
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, readings, users, type NewLlmCall } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';
import {
  callsByLocalDate,
  callsByOp,
  callsByUtcDay,
  activeUsers,
  modelsSeen,
  peakWindow5h,
  readingsByLocalDate,
  tokenLedgerDrift,
  tokensByBucketAndModel,
  ttftByService,
} from './metrics';

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

/**
 * A ledger row with the boring columns filled in.
 *
 * **`createdAt` DEFAULTS TO NOON UTC ON `localDate` RATHER THAN TO `now()`, AND THE
 * FIRST DRAFT LEARNED WHY.** Half the catalogue filters on `created_at` (M1, M4, M5,
 * M10 -- the ones served by `llm_calls_created_idx`) and half on `local_date` (M2, M3
 * -- the querent's own day). A row left at the column default lands on *today*, so
 * every `created_at`-filtered query returned nothing while every `local_date` one
 * passed: four tests failed for a reason that had nothing to do with what they were
 * testing. Pinning both here keeps a test's failure about its own subject -- and the
 * two tests that deliberately separate the two clocks still override it.
 */
function row(over: Partial<NewLlmCall> & Pick<NewLlmCall, 'op' | 'localDate'>): NewLlmCall {
  return {
    model: 'glm-4.6',
    callClass: 'interactive',
    streamed: false,
    status: 'ok',
    locale: 'id',
    createdAt: new Date(`${over.localDate}T12:00:00Z`),
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
        // A call that died before reporting usage: absence stored as absence.
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
        expect(typeof r.cacheReadTokens).toBe('number');
        expect(typeof r.cachedBasisTokens).toBe('number');
      }
    }));

  it('SUMS THE CACHE BASIS OVER MEASURED ROWS ONLY, in real SQL', () =>
    withRollback(async (tx) => {
      /*
       * **THE `filter (where cache_read_tokens is not null)` CLAUSE, AGAINST POSTGRES.**
       *
       * The unit test in `metrics.test.ts` asserts the FOLD; this asserts the SQL, and
       * the two are different failures. A `coalesce(sum(input_tokens), 0)` without the
       * filter would compile, run, and report a plausible denominator that includes
       * every row written before the cache column existed -- so the hit rate would
       * halve on a range that spans the deploy and look like a caching regression.
       *
       * 1000 input of which 900 cached, plus 5000 input with no cache figure at all.
       * The basis is 1000. It is not 6000.
       */
      await tx.insert(llmCalls).values([
        row({
          op: 'reading',
          localDate: '2026-07-21',
          inputTokens: 1000,
          outputTokens: 10,
          cacheReadTokens: 900,
        }),
        row({
          op: 'reading',
          localDate: '2026-07-21',
          inputTokens: 5000,
          outputTokens: 10,
          cacheReadTokens: null,
        }),
      ]);

      const [r] = await tokensByBucketAndModel(tx, { from: '2026-07-21', to: '2026-07-21' });
      expect(r.inputTokens).toBe(6000);
      expect(r.cacheReadTokens).toBe(900);
      expect(r.cachedBasisTokens).toBe(1000);
    }));

  it('keeps a measured 0 in the basis, because a MISS is a measurement', () =>
    withRollback(async (tx) => {
      // `cache_read_tokens = 0` means usage was reported and nothing came from cache.
      // Its input tokens belong in the denominator, or the rate reads 100% forever.
      await tx.insert(llmCalls).values([
        row({
          op: 'reading',
          localDate: '2026-07-22',
          inputTokens: 800,
          outputTokens: 10,
          cacheReadTokens: 0,
        }),
      ]);

      const [r] = await tokensByBucketAndModel(tx, { from: '2026-07-22', to: '2026-07-22' });
      expect(r.cacheReadTokens).toBe(0);
      expect(r.cachedBasisTokens).toBe(800);
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

describe('M4 -- callsByOp', () => {
  it('returns one row per op, never a tenth key, ordered totally', () =>
    withRollback(async (tx) => {
      const OPS = [
        'reading',
        'moderation',
        'gist',
        'day_summary',
        'frequency',
        'lotus',
        'persona',
        'translation',
        'translation_repair',
      ] as const;

      await tx.insert(llmCalls).values(
        OPS.map((op) => row({ op, localDate: '2026-07-20', totalMs: 1000 })),
      );

      const rows = await callsByOp(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows).toHaveLength(9);
      // Seam 3: A3 groups by `op` and must not invent a tenth value or an alias.
      expect(rows.map((r) => r.op).sort()).toEqual([...OPS].sort());

      // Every count ties at 1, so the `op` tiebreak is what makes the order total --
      // without it two ops swap places between page loads and it reads as the data
      // changing.
      expect(rows.map((r) => r.op)).toEqual([...OPS].sort());
    }));

  it('percentile_cont over ONE row is that row, as a number', () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', totalMs: 4321 }),
      ]);
      const [only] = await callsByOp(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(only.p50Ms).toBe(4321);
      expect(typeof only.p50Ms).toBe('number');
      expect(typeof only.p95Ms).toBe('number');
    }));

  it('is null -- not 0 -- when nothing was timed', () =>
    withRollback(async (tx) => {
      // "No measurement" is not "instant". A 0ms p95 on a chart is a lie that reads
      // as a triumph.
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', totalMs: null }),
      ]);
      const [only] = await callsByOp(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(only.p50Ms).toBeNull();
      expect(only.calls).toBe(1);
    }));

  it('counts failed and aborted separately', () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', status: 'ok' }),
        row({ op: 'reading', localDate: '2026-07-20', status: 'failed', errorKind: 'upstream_5xx' }),
        row({ op: 'reading', localDate: '2026-07-20', status: 'aborted', errorKind: 'aborted' }),
      ]);
      const [only] = await callsByOp(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(only.calls).toBe(3);
      expect(only.failed).toBe(1);
      expect(only.aborted).toBe(1);
    }));
});

describe('M5 -- peakWindow5h', () => {
  it('finds the worst window, and the peak is a NUMBER', () =>
    withRollback(async (tx) => {
      /*
       * Six calls inside four hours, then three more nine hours later. The worst
       * rolling five-hour window holds six.
       */
      const burst = ['08:00', '08:30', '09:00', '10:00', '11:00', '11:59'];
      const later = ['21:00', '21:30', '22:00'];
      await tx.insert(llmCalls).values(
        [...burst, ...later].map((hhmm) =>
          row({
            op: 'reading',
            localDate: '2026-07-20',
            createdAt: at(`2026-07-20T${hhmm}:00Z`),
          }),
        ),
      );

      const peak = await peakWindow5h(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(peak).not.toBeNull();
      if (!peak) return;
      expect(peak.calls).toBe(6);
      /*
       * **THE MOST LOAD-BEARING TYPE ASSERTION IN A3.** This value is compared with
       * `>=` against 280. A string would be right most of the time -- `'300' >= 280`
       * is true by coercion and `'30' >= 280` is false -- which is worse than a bug
       * that always fires.
       */
      expect(typeof peak.calls).toBe('number');
      expect(peak.windowEnd).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    }));

  it('THE NEGATIVE CONTROL: moving one call out of the window drops the peak to 5', () =>
    withRollback(async (tx) => {
      // Same six calls, but the first is now six hours before the last of the group,
      // so no five-hour window contains all six.
      const burst = ['05:30', '08:30', '09:00', '10:00', '11:00', '11:59'];
      await tx.insert(llmCalls).values(
        burst.map((hhmm) =>
          row({
            op: 'reading',
            localDate: '2026-07-20',
            createdAt: at(`2026-07-20T${hhmm}:00Z`),
          }),
        ),
      );
      const peak = await peakWindow5h(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(peak?.calls).toBe(5);
    }));

  it('sees a window that STRADDLES MIDNIGHT, which is why it is a frame and not a bucket', () =>
    withRollback(async (tx) => {
      // Three calls before midnight and three after. Any daily bucketing splits this
      // into 3 and 3 and hides the worst window in the range entirely.
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', createdAt: at('2026-07-20T22:00:00Z') }),
        row({ op: 'reading', localDate: '2026-07-20', createdAt: at('2026-07-20T22:30:00Z') }),
        row({ op: 'reading', localDate: '2026-07-20', createdAt: at('2026-07-20T23:00:00Z') }),
        row({ op: 'reading', localDate: '2026-07-21', createdAt: at('2026-07-21T00:30:00Z') }),
        row({ op: 'reading', localDate: '2026-07-21', createdAt: at('2026-07-21T01:00:00Z') }),
        row({ op: 'reading', localDate: '2026-07-21', createdAt: at('2026-07-21T01:30:00Z') }),
      ]);
      const peak = await peakWindow5h(tx, { from: '2026-07-20', to: '2026-07-21' });
      expect(peak?.calls).toBe(6);
    }));

  it('is NULL for an empty range -- "no calls" and "no data" are different answers', () =>
    withRollback(async (tx) => {
      expect(await peakWindow5h(tx, { from: '2026-07-20', to: '2026-07-20' })).toBeNull();
    }));

  it("excludes a 'refused' row, so headroom is not double-counted against itself", () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', createdAt: at('2026-07-20T08:00:00Z') }),
        row({
          op: 'reading',
          localDate: '2026-07-20',
          createdAt: at('2026-07-20T08:01:00Z'),
          status: 'refused',
        }),
      ]);
      const peak = await peakWindow5h(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(peak?.calls).toBe(1);
    }));
});

describe('M8 -- the two latencies never merge', () => {
  it('TTFT 400 and total 9000 on ONE reading: each function returns its own number', () =>
    withRollback(async (tx) => {
      /*
       * Roadmap seam 2. `readings.latency_ms` is time to FIRST TOKEN -- the wait a
       * querent watched. `llm_calls.total_ms` is the whole call, timed from above
       * `gateReading`. One word, two meanings, one schema; two functions, two names,
       * and neither is called `latency`.
       */
      const userId = await seedUser(tx);
      const [reading] = await tx
        .insert(readings)
        .values({
          userId,
          readerId: 'thessaly',
          serviceId: 'spread3',
          locale: 'id',
          localDate: '2026-07-20',
          model: 'glm-4.6',
          promptVersion: 'id-v1.testtest',
          latencyMs: 400,
        })
        .returning({ id: readings.id });

      await tx.insert(llmCalls).values([
        row({
          op: 'reading',
          localDate: '2026-07-20',
          userId,
          readingId: reading.id,
          totalMs: 9000,
        }),
      ]);

      const [ttft] = await ttftByService(tx, { from: '2026-07-20', to: '2026-07-20' });
      const [op] = await callsByOp(tx, { from: '2026-07-20', to: '2026-07-20' });

      expect(ttft.serviceId).toBe('spread3');
      expect(ttft.p50Ms).toBe(400);
      expect(op.p50Ms).toBe(9000);
      // Neither returns the other, which is the assertion the seam asks for.
      expect(ttft.p50Ms).not.toBe(op.p50Ms);
    }));

  it('skips readings with no TTFT rather than counting them as 0', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await tx.insert(readings).values([
        {
          userId,
          readerId: 'thessaly',
          serviceId: 'daily',
          locale: 'id',
          localDate: '2026-07-20',
          model: 'glm-4.6',
          promptVersion: 'id-v1.testtest',
          latencyMs: null,
        },
      ]);
      expect(await ttftByService(tx, { from: '2026-07-20', to: '2026-07-20' })).toEqual([]);
    }));

  /*
   * ── THE FLEET ROW, AND WHY IT IS A `rollup()` RATHER THAN A SECOND QUERY ────
   *
   * `/admin`'s TTFT tile needs one number for the whole fleet, and **a fleet p95 is not
   * the mean of three service p95s** -- there is no fold over the per-service rows that
   * produces it. Adding `rollup (service_id)` keeps the two answers on ONE predicate
   * (`rollup.ts`'s opening rule) and keeps `FLEET_ROLLUP_QUERIES` at 8, which matters
   * because every `/admin` request is a cold one and the first query also wakes a
   * suspended Neon compute.
   */
  it('returns a fleet total row whose percentile is over the whole population', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      // Chosen so the fleet p50 (250) equals NEITHER service's p50 (200 and 1000): a
      // total row that merely copied a service row would pass a weaker fixture.
      for (const latencyMs of [100, 200, 300]) {
        await seedReading(tx, userId, { serviceId: 'daily', latencyMs });
      }
      await seedReading(tx, userId, { serviceId: 'spread3', latencyMs: 1000 });

      const rows = await ttftByService(tx, { from: '2026-07-20', to: '2026-07-20' });
      const total = rows.filter((r) => r.serviceId === null);
      expect(total).toHaveLength(1);
      expect(total[0].readings).toBe(4);
      expect(total[0].p50Ms).toBe(250);

      const daily = rows.find((r) => r.serviceId === 'daily');
      expect(daily?.readings).toBe(3);
      expect(daily?.p50Ms).toBe(200);
      expect(rows.find((r) => r.serviceId === 'spread3')?.p50Ms).toBe(1000);
    }));

  it('sorts the fleet total LAST, so the per-service tiebreak keeps its order', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      // `spread3` has fewer readings, so `readings desc` puts `daily` first. The total
      // has the most readings of all and would lead without `order by is_total` -- which
      // would make `rows[0]` the fleet, silently changing what every existing caller
      // destructuring the first row means.
      for (const latencyMs of [100, 200]) {
        await seedReading(tx, userId, { serviceId: 'daily', latencyMs });
      }
      await seedReading(tx, userId, { serviceId: 'spread3', latencyMs: 400 });

      const rows = await ttftByService(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows.map((r) => r.serviceId)).toEqual(['daily', 'spread3', null]);
    }));

  /*
   * **MEASURED, 2026-07-30, local Postgres 16:** `group by rollup(x)` over an EMPTY input
   * returns ONE row -- the grand total, `n = 0`, percentiles NULL -- not zero rows. So the
   * mapper has to drop a total row carrying no readings, or "no data" acquires a second
   * representation and the sibling test above ("skips readings with no TTFT") starts
   * failing on a phantom row. The guard looks like a redundant nullability check; this is
   * what it is actually for.
   */
  it('returns NO fleet row when nothing in the range has a TTFT at all', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      await seedReading(tx, userId, { serviceId: 'daily', latencyMs: null });
      expect(await ttftByService(tx, { from: '2026-07-20', to: '2026-07-20' })).toEqual([]);
    }));
});

/** A reading, with whatever the test needs pinned. */
async function seedReading(
  tx: Tx,
  userId: string,
  over: Partial<typeof readings.$inferInsert> = {},
): Promise<string> {
  const [reading] = await tx
    .insert(readings)
    .values({
      userId,
      readerId: 'thessaly',
      serviceId: 'spread3',
      locale: 'id',
      localDate: '2026-07-20',
      model: 'glm-4.6',
      promptVersion: 'id-v1.testtest',
      ...over,
    })
    .returning({ id: readings.id });
  return reading.id;
}

describe('M6 / M7 -- readings, and the distinct count nobody may sum', () => {
  it('partitions the total across the five statuses', () =>
    withRollback(async (tx) => {
      const userId = await seedUser(tx);
      for (const status of ['ok', 'partial', 'failed', 'aborted', 'blocked'] as const) {
        await seedReading(tx, userId, { status });
      }

      const [day] = await readingsByLocalDate(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.readings).toBe(5);
      expect(day.ok + day.partial + day.failed + day.aborted + day.blocked).toBe(day.readings);
      expect(typeof day.readings).toBe('number');
      expect(day.bucket).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }));

  it('counts a BLOCKED reading, which the ledger cannot see at all', () =>
    withRollback(async (tx) => {
      // A blocked reading makes no model call and still happened. A "readings per day"
      // series built from `llm_calls` would silently exclude exactly the population
      // W7's gate exists for.
      const userId = await seedUser(tx);
      await seedReading(tx, userId, { status: 'blocked' });
      const [day] = await readingsByLocalDate(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.blocked).toBe(1);
      const utc = await callsByUtcDay(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(utc[0].calls).toBe(0);
    }));

  it('WAU IS NOT sum(DAU): one user over three days is M7 = 1 and M6 = three 1s', () =>
    withRollback(async (tx) => {
      /*
       * **BOTH ASSERTIONS IN ONE TEST, BECAUSE THE TEST'S SUBJECT IS THE DIFFERENCE.**
       * Summing M6's `users` column gives 3 -- plausible, monotone and wrong, which is
       * the kind of number that survives review.
       */
      const userId = await seedUser(tx);
      for (const localDate of ['2026-07-20', '2026-07-21', '2026-07-22']) {
        await seedReading(tx, userId, { localDate });
      }

      const days = await readingsByLocalDate(tx, { from: '2026-07-20', to: '2026-07-22' });
      expect(days.map((d) => d.users)).toEqual([1, 1, 1]);
      expect(days.reduce((n, d) => n + d.users, 0)).toBe(3); // the wrong answer

      expect(await activeUsers(tx, { from: '2026-07-20', to: '2026-07-22' })).toBe(1);
    }));

  it("INCLUDES a soft-deleted user's readings", () =>
    withRollback(async (tx) => {
      /*
       * `allTime.ts`'s ruling, and R29 one directory over: the account is restorable
       * for `ERASURE_GRACE_DAYS`, so filtering here would make this page disagree with
       * every other query in the app during the grace window -- and hiding them is how
       * a thirty-day restore window becomes invisible.
       */
      const userId = await seedUser(tx);
      await seedReading(tx, userId);
      await tx.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));

      const [day] = await readingsByLocalDate(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(day.readings).toBe(1);
      expect(await activeUsers(tx, { from: '2026-07-20', to: '2026-07-20' })).toBe(1);
    }));

  it('RECORDS the plan: the index is usable as a full scan, never as a seek', () =>
    withRollback(async (tx) => {
      /*
       * V8's technique and its lesson: *"an assertion that fails for a reason that is
       * not a defect is an assertion people delete."* So this asserts the SHAPE with
       * `enable_seqscan` off rather than the planner's real choice, which at this row
       * count is correctly a seq scan.
       *
       * **AND IT CORRECTED A3's PLAN.** §9.1 says `readings_user_local_date_idx
       * (user_id, local_date)` *"cannot use"* a fleet-wide `local_date` range. It can
       * -- as a full Index Only Scan with the range applied to the second column --
       * it just cannot SEEK, so the work is proportional to the whole index rather
       * than to the range. The declared unbuilt `readings_local_date_idx` stands for
       * the same reason either way.
       */
      const userId = await seedUser(tx);
      await seedReading(tx, userId);

      await tx.execute(sql`set local enable_seqscan = off`);
      const explained = await tx.execute(
        sql`explain select count(*) from readings where local_date >= '2026-07-20' and local_date <= '2026-07-25'`,
      );
      const plan = (explained as unknown as Array<Record<string, unknown>>)
        .map((r) => String(r['QUERY PLAN']))
        .join('\n');

      expect(plan).toContain('readings_user_local_date_idx');
      expect(plan).toContain('Index Cond');
      // No seek: `user_id` is absent from the predicate, so the whole index is walked.
      expect(plan).not.toContain('user_id =');
    }));
});

describe('M9 -- tokenLedgerDrift, the A-D17 check', () => {
  /** The same predicate spelled the wrong way, for the negative control. */
  async function driftWithNotEquals(tx: Tx, from: string, to: string) {
    const rows = await tx.execute(sql`
      select r.id::text as reading_id
        from readings r
        join llm_calls c on c.reading_id = r.id and c.op = 'reading'
       where r.local_date >= ${from}
         and r.local_date <= ${to}
         and (r.token_input <> c.input_tokens or r.token_output <> c.output_tokens)
    `);
    return rows as unknown as Array<Record<string, unknown>>;
  }

  async function pair(
    tx: Tx,
    reading: { input: number | null; output: number | null },
    call: { input: number | null; output: number | null },
  ): Promise<string> {
    const userId = await seedUser(tx);
    const readingId = await seedReading(tx, userId, {
      tokenInput: reading.input,
      tokenOutput: reading.output,
    });
    await tx.insert(llmCalls).values([
      row({
        op: 'reading',
        localDate: '2026-07-20',
        userId,
        readingId,
        inputTokens: call.input,
        outputTokens: call.output,
      }),
    ]);
    return readingId;
  }

  it('AGREEMENT returns 0 rows -- the expected answer', () =>
    withRollback(async (tx) => {
      await pair(tx, { input: 1200, output: 400 }, { input: 1200, output: 400 });
      expect(await tokenLedgerDrift(tx, { from: '2026-07-20', to: '2026-07-20' })).toEqual([]);
    }));

  it('a real disagreement, 5 vs 7, returns 1 row', () =>
    withRollback(async (tx) => {
      await pair(tx, { input: 5, output: 400 }, { input: 7, output: 400 });
      const rows = await tokenLedgerDrift(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows).toHaveLength(1);
      expect(rows[0].readingInput).toBe(5);
      expect(rows[0].callInput).toBe(7);
    }));

  it('NULL vs 0 IS REPORTED -- the case the whole ruling is about', () =>
    withRollback(async (tx) => {
      /*
       * Roadmap §12.6 arriving as data. `anthropic.ts`'s buffered path stored `0`
       * where the streamed path stored NULL, so a buffered z.ai call and its streamed
       * twin disagreed by construction; A2 fixed it under R16. This is the check that
       * catches it coming back, and it is the case a `<>` implementation gets wrong.
       */
      await pair(tx, { input: null, output: 400 }, { input: 0, output: 400 });
      const rows = await tokenLedgerDrift(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows).toHaveLength(1);
      expect(rows[0].readingInput).toBeNull();
      expect(rows[0].callInput).toBe(0);
    }));

  it('THE NEGATIVE CONTROL: the `<>` spelling finds nothing in ALL THREE cases', () =>
    withRollback(async (tx) => {
      /*
       * **A CHECK THAT CANNOT FAIL MUST BE SEEN TO BE UNABLE TO FAIL.** `a <> b` is
       * NULL -- not true -- when either side is NULL, so the row is filtered out and
       * the query returns 0 rows whether or not the ledger agrees with anything. The
       * `5 vs 7` case is the only one it catches, and z.ai makes NULL the common case
       * for `input_tokens`, so in production it would be silently vacuous.
       */
      await pair(tx, { input: null, output: 400 }, { input: 0, output: 400 });
      expect(await driftWithNotEquals(tx, '2026-07-20', '2026-07-20')).toHaveLength(0);
      // ...while the shipped spelling reports it.
      expect(await tokenLedgerDrift(tx, { from: '2026-07-20', to: '2026-07-20' })).toHaveLength(1);
    }));

  it('ignores the gist row, which carries a reading_id and different tokens', () =>
    withRollback(async (tx) => {
      // `c.op = 'reading'` is load-bearing: A2 sets `reading_id` on the gist call too
      // (R51), and the gist's tokens are its own.
      const userId = await seedUser(tx);
      const readingId = await seedReading(tx, userId, { tokenInput: 1200, tokenOutput: 400 });
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', userId, readingId, inputTokens: 1200, outputTokens: 400 }),
        row({ op: 'gist', localDate: '2026-07-20', userId, readingId, inputTokens: 900, outputTokens: 30 }),
      ]);
      expect(await tokenLedgerDrift(tx, { from: '2026-07-20', to: '2026-07-20' })).toEqual([]);
    }));
});

describe('M10 -- modelsSeen', () => {
  it('lists the models that ran, with a first_seen STRING', () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20' }),
        row({ op: 'reading', localDate: '2026-07-20' }),
        row({ op: 'moderation', localDate: '2026-07-20', model: 'glm-4.5-flash' }),
      ]);

      const rows = await modelsSeen(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows.map((r) => r.model)).toEqual(['glm-4.6', 'glm-4.5-flash']);
      expect(rows[0].calls).toBe(2);
      expect(typeof rows[0].calls).toBe('number');
      // `min(created_at)::text`: a bare `min()` inside a raw template has no mapper.
      expect(typeof rows[0].firstSeen).toBe('string');
      expect(rows[0].firstSeen).toMatch(/^2026-07-20/);
    }));

  it('breaks the count tie on the model name, so the order is total', () =>
    withRollback(async (tx) => {
      await tx.insert(llmCalls).values([
        row({ op: 'reading', localDate: '2026-07-20', model: 'zzz' }),
        row({ op: 'reading', localDate: '2026-07-20', model: 'aaa' }),
      ]);
      const rows = await modelsSeen(tx, { from: '2026-07-20', to: '2026-07-20' });
      expect(rows.map((r) => r.model)).toEqual(['aaa', 'zzz']);
    }));
});
