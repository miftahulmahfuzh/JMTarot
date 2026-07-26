/**
 * The integration-test database handle.
 *
 * Its own client, NOT the app's. The app's is `server-only` and reads
 * DATABASE_URL; this one reads TEST_DATABASE_URL and must never be the same
 * connection.
 */
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../schema';
import type { Db, Tx } from '../types';

// Vitest does not load .env.local, and test files run in worker processes that
// do not inherit anything globalSetup put on process.env. Each worker loads it
// for itself.
config({ path: '.env.local', quiet: true });

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Run `npm run db:up` and copy .env.example to .env.local.',
  );
}

// The same guard globalSetup applies, repeated here because this module is the
// one that holds a connection capable of TRUNCATE. Cheap, and it means the
// mistake cannot be made by importing the harness from somewhere unexpected.
if (!/_test(\?|$)/.test(url)) {
  throw new Error(`TEST_DATABASE_URL must name a database ending in _test, got: ${url}`);
}

/*
 * Reconciliation R20. W4 defaults ANALYTICS_ENABLED to 0 in CI so its own
 * tests and the smoke run need no database. The integration suite needs the
 * opposite -- a no-op writer would make every analytics assertion here pass
 * vacuously -- so it is set explicitly rather than inherited.
 */
process.env.ANALYTICS_ENABLED = '1';

const client = postgres(url, { max: 5, onnotice: () => {} });

export const testDb: Db = drizzle(client, { schema });

/** Thrown to force the rollback, and swallowed by withRollback alone. */
class Rollback extends Error {}

/**
 * Run `fn` inside a transaction that is always rolled back.
 *
 * ~100x faster than truncating ten tables per test, and it composes for free
 * with the rule that every query takes its handle as the first argument --
 * `tx` satisfies exactly the same parameter as `db`.
 *
 * IT CANNOT TEST code that opens AND COMMITS its own top-level transaction, or
 * anything that spans two connections. Use `resetDb()` for those.
 */
export async function withRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await testDb.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
}

/**
 * The escape hatch. CASCADE handles the foreign-key order for us, so the list
 * does not have to be topologically sorted -- but every table is named anyway,
 * so that a table added to the schema and forgotten here shows up as leaked
 * state rather than as a silent survivor.
 */
export async function resetDb(): Promise<void> {
  await testDb.execute(sql`
    TRUNCATE TABLE users, profiles, onboarding_answers, lotus_avatars,
                   readings, reading_cards, events, daily_summaries,
                   moderation_flags, frequency_verdicts
    RESTART IDENTITY CASCADE`);
}

export async function closeTestDb(): Promise<void> {
  await client.end();
}
