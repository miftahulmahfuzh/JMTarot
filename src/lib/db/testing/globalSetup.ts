/**
 * Runs once per `npm run test:integration`, before any test file.
 *
 * There is deliberately no teardown that drops the database. `migrate()` is
 * idempotent and tops up whatever is missing, so keeping it between runs saves
 * several seconds every time. `npm run db:test:reset` exists for the one case
 * that needs it -- an already-applied migration having been edited, which
 * `migrations/README.md` rule 5 forbids anyway.
 */
import { config } from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

config({ path: '.env.local', quiet: true });

export async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Run `npm run db:up` and copy .env.example to .env.local.',
    );
  }

  // Not a style rule. This is the only thing standing between a mistyped
  // variable and TRUNCATE across your development data.
  if (!/_test(\?|$)/.test(url)) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in _test, got: ${url}`);
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Applying the COMMITTED migrations, not push: this run is also a test
    // that the migration history still applies cleanly from an empty database.
    await migrate(drizzle(sql), { migrationsFolder: './src/lib/db/migrations' });
  } finally {
    await sql.end();
  }
}
