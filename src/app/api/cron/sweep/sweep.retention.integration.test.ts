/**
 * The FIFTH sweep statement and the size probe, against a real Postgres. A3, v0.5.0.
 *
 * Same shape and the same deliberate cost as `sweep.integration.test.ts`: **the route
 * is not exercised** -- it reaches `next/server` and the `server-only` singleton --
 * so the statement is duplicated here and `sweep.contract.test.ts` is what stops the
 * two copies drifting. An edit to a `DELETE` that runs unattended against production
 * should cost a second file.
 *
 * A separate file from `sweep.integration.test.ts` because §2 of A3's plan names it,
 * and because its subject is different: the other file proves three statements match
 * old rows, this one proves **a boundary, a defaulting parse and an absence.**
 */
import { sql } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls, type NewLlmCall } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import type { Tx } from '@/lib/db/types';

afterAll(closeTestDb);

/** Duplicated from `route.ts`; `sweep.contract.test.ts` guards the copy. */
const EXPIRE_CALLS = (days: number) => sql`
  delete from llm_calls
   where created_at < now() - make_interval(days => ${days}::int)
`;

/** The probe, verbatim. It has to actually run, or it is a query in a document. */
const SIZE_PROBE = sql`
  select count(*)                            as rows,
         pg_total_relation_size('llm_calls') as bytes,
         min(created_at)::text               as oldest
    from llm_calls
`;

/** Duplicated from `route.ts`, so the fallback is tested rather than described. */
function llmCallsRetentionDays(): number {
  const raw = Number(process.env.LLM_CALLS_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 400;
}

let n = 0;

async function callAgedDays(tx: Tx, days: number): Promise<void> {
  n += 1;
  const row: NewLlmCall = {
    op: 'reading',
    model: 'glm-4.6',
    callClass: 'interactive',
    streamed: false,
    status: 'ok',
    localDate: '2026-07-20',
    // `now() - interval` in SQL rather than a JS Date, so the row's age is measured
    // against the same clock the DELETE uses. A test that compares two clocks fails
    // once a year at midnight and nobody ever reproduces it.
    createdAt: sql`now() - make_interval(days => ${days}::int)` as unknown as Date,
  };
  await tx.insert(llmCalls).values(row);
}

async function remaining(tx: Tx): Promise<number> {
  const rows = await tx.execute(sql`select count(*) as n from llm_calls`);
  return Number((rows as unknown as Array<Record<string, unknown>>)[0].n);
}

describe('the fifth delete', () => {
  it('deletes what is older than the window and keeps what is inside it', () =>
    withRollback(async (tx) => {
      await callAgedDays(tx, 401);
      await callAgedDays(tx, 399);
      await tx.execute(EXPIRE_CALLS(400));
      expect(await remaining(tx)).toBe(1);
    }));

  it('KEEPS a row aged exactly n days -- the `<` vs `<=` off-by-one', () =>
    withRollback(async (tx) => {
      /*
       * The boundary is the only part of a retention policy that can be wrong by
       * exactly one day forever without anybody noticing. `created_at < now() - 400
       * days` keeps a row at 400 days minus a microsecond; the row seeded here is
       * aged with the same `now()` the delete reads, so it lands on the inclusive
       * side.
       */
      await callAgedDays(tx, 400);
      await tx.execute(EXPIRE_CALLS(400));
      expect(await remaining(tx)).toBe(1);
    }));

  it('deletes nothing when the table is inside the window', () =>
    withRollback(async (tx) => {
      await callAgedDays(tx, 1);
      await tx.execute(EXPIRE_CALLS(400));
      expect(await remaining(tx)).toBe(1);
    }));

  it('MEASURES the ::int claim rather than repeating it -- and it does not reproduce', () =>
    withRollback(async (tx) => {
      /*
       * **THIS PROJECT HAS SAID SINCE W7 THAT `make_interval(days => $1)` FAILS
       * WITHOUT AN EXPLICIT `::int` CAST**, because *"a bound parameter arrives as
       * `text` and there is no `text` overload"* -- it is in `sweep.contract.test.ts`,
       * in `sweep.integration.test.ts` and in the route's own comments, and
       * `sweep.contract.test.ts` fails a build over it.
       *
       * **Measured against the local Postgres 16 with the shipped postgres.js on
       * 2026-07-30: neither the number form nor the string form raises anything.**
       * Both `${400}` and `${'400'}` execute cleanly, because the driver describes
       * the parameter and the server infers `integer` from `make_interval`'s
       * signature.
       *
       * **THE CAST STAYS, AND THE REASON IS NOW THE JsonLd ONE RATHER THAN THE
       * ORIGINAL ONE.** CLAUDE.md: framework behaviour is measured here, never
       * recalled -- and parameter type inference is an unspecified implementation
       * detail of a driver plus a server version. **A `DELETE` that runs unattended
       * against production at 03:17, whose failure would first appear a month after
       * launch, must not rest on one.** So the belt is kept and its justification is
       * corrected, which is the opposite of deleting a tripwire whose stated reason
       * turned out to be wrong.
       */
      const uncastNumber = tx.execute(sql`
        select now() - make_interval(days => ${400}) as t
      `);
      const uncastString = tx.execute(sql`
        select now() - make_interval(days => ${'400'}) as t
      `);
      await expect(uncastNumber).resolves.toBeDefined();
      await expect(uncastString).resolves.toBeDefined();

      // And the cast form -- the one that ships -- works on both, which is the
      // property that actually matters.
      await expect(
        tx.execute(sql`select now() - make_interval(days => ${'400'}::int) as t`),
      ).resolves.toBeDefined();
    }));
});

describe('llmCallsRetentionDays', () => {
  const original = process.env.LLM_CALLS_RETENTION_DAYS;
  afterAll(() => {
    if (original === undefined) delete process.env.LLM_CALLS_RETENTION_DAYS;
    else process.env.LLM_CALLS_RETENTION_DAYS = original;
  });

  it('is 400 when unset', () => {
    delete process.env.LLM_CALLS_RETENTION_DAYS;
    expect(llmCallsRetentionDays()).toBe(400);
  });

  it("FALLS BACK TO 400 ON 'abc' AND ON '' -- a 0 would delete the whole table", () => {
    /*
     * `Number('abc')` is NaN and `Number('')` is **0**. With only the `isFinite`
     * half, a blank value in the Vercel dashboard becomes
     * `make_interval(days => 0)` and the first run at 03:17 empties the ledger,
     * silently. `auth/ttl.ts`'s defensiveness with a sharper consequence.
     */
    process.env.LLM_CALLS_RETENTION_DAYS = 'abc';
    expect(llmCallsRetentionDays()).toBe(400);
    process.env.LLM_CALLS_RETENTION_DAYS = '';
    expect(llmCallsRetentionDays()).toBe(400);
    process.env.LLM_CALLS_RETENTION_DAYS = '0';
    expect(llmCallsRetentionDays()).toBe(400);
    process.env.LLM_CALLS_RETENTION_DAYS = '-1';
    expect(llmCallsRetentionDays()).toBe(400);
  });

  it('honours a real number', () => {
    process.env.LLM_CALLS_RETENTION_DAYS = '90';
    expect(llmCallsRetentionDays()).toBe(90);
  });
});

describe('the size probe', () => {
  it('RUNS, and returns a byte figure that includes the indexes', () =>
    withRollback(async (tx) => {
      /*
       * `pg_total_relation_size` and not `pg_relation_size`: five indexes roughly
       * double this table, so a heap-only figure understates it by half -- and the
       * number exists to answer *"are we near Neon free's 0.5 GB"*, where being
       * wrong by half is the whole question.
       */
      await callAgedDays(tx, 1);
      const rows = await tx.execute(SIZE_PROBE);
      const r = (rows as unknown as Array<Record<string, unknown>>)[0];
      expect(Number(r.rows)).toBeGreaterThan(0);
      expect(Number(r.bytes)).toBeGreaterThan(0);
      expect(typeof r.oldest).toBe('string');

      const heapOnly = await tx.execute(sql`select pg_relation_size('llm_calls') as bytes`);
      const heap = Number((heapOnly as unknown as Array<Record<string, unknown>>)[0].bytes);
      expect(Number(r.bytes)).toBeGreaterThan(heap);
    }));

  it('answers on an EMPTY table, because it must log every night', () =>
    withRollback(async (tx) => {
      // A size series is only useful as a series, so this fires unconditionally --
      // unlike the ceiling warning, which fires only when there is something to say.
      const rows = await tx.execute(SIZE_PROBE);
      const r = (rows as unknown as Array<Record<string, unknown>>)[0];
      expect(Number(r.rows)).toBe(0);
      expect(r.oldest).toBeNull();
      expect(Number(r.bytes)).toBeGreaterThanOrEqual(0);
    }));
});

describe('the negative control', () => {
  it('THE SWEEP NEVER TOUCHES admin_access_log', () => {
    /*
     * §9.14, and the outcome rather than the mechanism: **an audit trail with a
     * delete path is the audit trail's absence**, and a retention policy is a delete
     * path with a timer on it. `/privacy` clause 6's row for that table therefore
     * reads *kept indefinitely*, which is the honest one.
     *
     * Comments stripped, because the route's header has to be able to explain why the
     * table is not swept -- the same trap `queries/contract.test.ts` records in one
     * line: *a rule that fires on prose describing the rule is a rule people delete.*
     */
    const route = readFileSync(
      join(process.cwd(), 'src', 'app', 'api', 'cron', 'sweep', 'route.ts'),
      'utf8',
    );
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('admin_access_log');
  });
});
