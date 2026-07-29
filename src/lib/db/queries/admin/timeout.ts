/**
 * Every admin read runs inside a READ ONLY transaction with a statement timeout.
 * **Two invariants for the price of one transaction block.**
 *
 * A3, v0.5.0, plan §1.5.
 *
 * ── READ-ONLY MAKES §9.2 MECHANICAL RATHER THAN A PROMISE ───────────────────
 *
 * *"No admin write to querent data"* is roadmap non-negotiable 2, and today it is a
 * sentence somebody has to keep in mind while writing a dashboard query. Inside this
 * block a stray `delete` fails **at the database** with `25006`, not at review. That
 * is the same move `redactForUser()` makes by running inside the delete transaction:
 * an ordering enforced by the engine beats an ordering enforced by attention.
 *
 * ── THE TIMEOUT IS THE SERVER HALF OF §4.2's PAIRING ────────────────────────
 *
 *     statement_timeout 10s   <   maxDuration 30s   <   client abort 15s
 *
 * **AND THE ORDERING LOOKS BACKWARDS, SO: the client bound sits ABOVE the statement
 * timeout ON PURPOSE.** The statement must die first, so what the operator gets is a
 * *stated failure state* naming the query that was slow, rather than a platform 504
 * with no diagnosis. If the client aborted first it would win the race and the server's
 * own message -- the only thing that says which query -- would never be read. Somebody
 * will try to "fix" the client number down to 5s; that is the regression.
 *
 * A bigger `maxDuration` without a bound on the client only makes a hang longer. That
 * is the `POST /api/locale` lesson, and **every admin request is a COLD one** -- one
 * admin, no warm instance, so the first query of a session also wakes a suspended Neon
 * compute. These three numbers are unverified against real hardware until loop 6 runs;
 * 1348ms warm from WSL told us nothing then either.
 *
 * ── `SET LOCAL transaction_read_only`, NOT `SET TRANSACTION READ ONLY` ──────
 *
 * Same GUC, and the LOCAL spelling is chosen for one measured reason. A3's plan said
 * *"`set transaction read only` comes before any other statement in the block or it
 * errors"* -- **measured against the local Postgres 16 on 2026-07-30, that is not
 * true**: the access mode may be set after a query, unlike the isolation level, which
 * is where the folklore comes from.
 *
 * ── THE EXPLICIT SAVEPOINT, WHICH LOOKS REDUNDANT AND IS NOT ────────────────
 *
 * **postgres.js's nested-transaction helper NEVER ISSUES `RELEASE SAVEPOINT`.**
 * `node_modules/postgres/src/index.js`'s `scope()` emits `savepoint sN`, then
 * `rollback to sN` **only on the error path**, and on success it simply returns. So a
 * `SET LOCAL` made inside a nested Drizzle transaction **persists to the end of the
 * OUTER transaction** -- and the integration suite, whose every test is one big
 * rolled-back transaction, would silently become read-only after its first admin read.
 * Measured: the first draft of `timeout.integration.test.ts` failed with
 * *"cannot execute INSERT in a read-only transaction"* on a line nowhere near this
 * file, and nothing in the error named a cause.
 *
 * **It cannot be undone by setting the GUC back**: `set local transaction_read_only =
 * off` inside a read-only transaction raises *"cannot set transaction read-write mode
 * inside a read-only transaction"* and aborts the transaction, which is worse than the
 * leak. Measured the same day.
 *
 * So this function opens **its own savepoint and releases it**, which is what pops the
 * two `SET LOCAL`s -- measured: after `release`, `show transaction_read_only` is `off`
 * and a write succeeds. `savepoint` is always legal here because we are always inside
 * `.transaction()`, whether that opened a `BEGIN` or a savepoint of its own.
 */
import { sql } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '@/lib/db/types';

/**
 * How long an admin query may run before the DATABASE kills it. See the header for the
 * ordering; **this is the smallest of the three numbers and it has to stay that way.**
 */
export const ADMIN_STATEMENT_TIMEOUT_MS = 10_000;

/** What every admin route declares. `maxDuration` is seconds; the other two are ms. */
export const ADMIN_MAX_DURATION_SECONDS = 30;

/**
 * What A4's fetches bound themselves by. **Above the statement timeout, deliberately**
 * -- see the header.
 */
export const ADMIN_CLIENT_ABORT_MS = 15_000;

/**
 * Run `fn` inside a read-only, time-bounded transaction. **Handle first**, so
 * `contract.test.ts` is satisfied with no exception and the integration suite can hand
 * in its rolled-back transaction.
 *
 * `timeoutMs` is an override for tests only -- a suite that proves the timeout fires
 * should not take ten seconds to do it. Production callers pass nothing.
 */
export async function withAdminRead<T>(
  db: DbOrTx,
  fn: (tx: DbOrTx) => Promise<T>,
  timeoutMs: number = ADMIN_STATEMENT_TIMEOUT_MS,
): Promise<T> {
  const ms =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.floor(timeoutMs)
      : ADMIN_STATEMENT_TIMEOUT_MS;

  return (db as Db).transaction(async (tx: Tx) => {
    // A fixed name, not a counter: this block never nests inside itself, and a
    // generated name would be one more thing to read in a log.
    await tx.execute(sql.raw(`savepoint ${SAVEPOINT}`));
    await tx.execute(sql`set local transaction_read_only = on`);
    await tx.execute(sql.raw(`set local statement_timeout = ${ms}`));
    /*
     * NO `try`/`finally`. On the error path the statement that failed has already
     * aborted the (sub)transaction, so a `release` would raise `25P02` and REPLACE the
     * real error with a meaningless one -- and postgres.js's own `rollback to` on the
     * way out discards the two settings anyway. The success path is the only one that
     * has to clean up, and it is the only one that can.
     */
    const out = await fn(tx);
    await tx.execute(sql.raw(`release savepoint ${SAVEPOINT}`));
    return out;
  });
}

const SAVEPOINT = 'jmt_admin_read';
