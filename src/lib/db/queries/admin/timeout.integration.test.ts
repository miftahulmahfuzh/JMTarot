/**
 * `withAdminRead` against a real Postgres. A3, v0.5.0.
 *
 * **THE `pg_sleep` TEST IS THE ONLY ONE THAT PROVES THE TIMEOUT IS APPLIED AND NOT
 * MERELY SET.** A `set local statement_timeout` that never reaches the server, or
 * reaches it in a transaction the query does not run in, looks identical from
 * TypeScript. It runs at 250ms rather than at the shipped 10s so the suite does not
 * pay ten seconds to learn it; the constant itself is asserted separately.
 */
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { llmCalls } from '@/lib/db/schema';
import { closeTestDb, withRollback } from '@/lib/db/testing/harness';
import {
  ADMIN_CLIENT_ABORT_MS,
  ADMIN_MAX_DURATION_SECONDS,
  ADMIN_STATEMENT_TIMEOUT_MS,
  withAdminRead,
} from './timeout';

afterAll(closeTestDb);

/** postgres.js puts the SQLSTATE on `.code`; Drizzle may wrap the error in its own. */
function sqlstate(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur; i += 1) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

describe('the three numbers', () => {
  it('orders statement_timeout < maxDuration < client abort', () => {
    /*
     * The ordering looks backwards and somebody will "fix" the client bound down.
     * The statement has to die FIRST so the operator gets a stated failure naming the
     * slow query rather than a platform 504 with no diagnosis.
     */
    expect(ADMIN_STATEMENT_TIMEOUT_MS).toBeLessThan(ADMIN_MAX_DURATION_SECONDS * 1000);
    expect(ADMIN_STATEMENT_TIMEOUT_MS).toBeLessThan(ADMIN_CLIENT_ABORT_MS);
    expect(ADMIN_CLIENT_ABORT_MS).toBeLessThan(ADMIN_MAX_DURATION_SECONDS * 1000);
  });
});

describe('withAdminRead', () => {
  it('reads', () =>
    withRollback(async (tx) => {
      const out = await withAdminRead(tx, async (t) => {
        const rows = await t.execute(sql`select 1 as n`);
        return (rows as unknown as Array<{ n: number }>)[0].n;
      });
      expect(Number(out)).toBe(1);
    }));

  it('REFUSES AN INSERT AT THE DATABASE with 25006', () =>
    withRollback(async (tx) => {
      /*
       * The mechanical form of roadmap non-negotiable 2. A stray write in a dashboard
       * query fails here rather than at review -- and this test is what stops somebody
       * "simplifying" the two SET LOCALs away because the queries all happened to be
       * selects on the day they looked.
       */
      const attempt = withAdminRead(tx, async (t) =>
        t.insert(llmCalls).values({
          op: 'reading',
          model: 'glm-4.6',
          callClass: 'interactive',
          streamed: false,
          status: 'ok',
          localDate: '2026-07-30',
        }),
      );
      await expect(attempt).rejects.toThrow();
      await attempt.catch((err) => {
        expect(sqlstate(err)).toBe('25006');
      });
    }));

  it('KILLS A SLOW STATEMENT with 57014 rather than hanging', () =>
    withRollback(async (tx) => {
      const started = Date.now();
      const attempt = withAdminRead(
        tx,
        async (t) => t.execute(sql`select pg_sleep(2)`),
        250,
      );
      await expect(attempt).rejects.toThrow();
      await attempt.catch((err) => {
        expect(sqlstate(err)).toBe('57014');
      });
      // It died on the timeout, not on the sleep finishing.
      expect(Date.now() - started).toBeLessThan(1500);
    }));

  it('does NOT leave the surrounding transaction read-only', () =>
    withRollback(async (tx) => {
      /*
       * **THIS TEST FAILED FIRST AND THE FIX IS THE EXPLICIT SAVEPOINT.** postgres.js's
       * nested-transaction helper emits `savepoint` and, on the error path only,
       * `rollback to` -- it **never issues `RELEASE`** -- so the two `SET LOCAL`s made
       * inside a nested Drizzle transaction persisted to the end of the OUTER one, and
       * the whole rolled-back test transaction went read-only. The first failure was
       * `cannot execute INSERT in a read-only transaction` on the line below, naming
       * neither this file nor a cause.
       *
       * Setting the GUC back is not available: `set local transaction_read_only = off`
       * inside a read-only transaction raises *"cannot set transaction read-write mode
       * inside a read-only transaction"* and aborts the transaction. `withAdminRead`
       * releases its own savepoint instead, which pops both settings.
       */
      await withAdminRead(tx, async (t) => t.execute(sql`select 1`));
      await tx.insert(llmCalls).values({
        op: 'reading',
        model: 'glm-4.6',
        callClass: 'interactive',
        streamed: false,
        status: 'ok',
        localDate: '2026-07-30',
      });
      const rows = await tx.select().from(llmCalls);
      expect(rows).toHaveLength(1);
    }));

  it('falls back to the shipped timeout on a nonsense override', () =>
    withRollback(async (tx) => {
      // `auth/ttl.ts`'s defensiveness: a 0 here would mean "no timeout at all", which
      // is the opposite of what the caller asked for.
      const out = await withAdminRead(tx, async () => 'ok', 0);
      expect(out).toBe('ok');
    }));
});
