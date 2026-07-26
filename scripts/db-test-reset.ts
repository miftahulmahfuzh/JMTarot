/**
 * Drop and recreate the integration-test database.
 *
 * Creates it the first time and resets it later, so it is the only command
 * anyone needs to know. The migrations are NOT applied here -- the integration
 * suite's globalSetup does that on every run, which incidentally tests that
 * the committed migration history still applies cleanly from an empty
 * database.
 */
import { config } from 'dotenv';
import postgres from 'postgres';

config({ path: '.env.local', quiet: true });

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env.local.');

  const name = new URL(url).pathname.slice(1);

  // Not a style rule. This is the only thing standing between a mistyped
  // variable and DROP DATABASE across your development data.
  if (!name.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL must name a database ending in _test, got: ${name}`);
  }

  // Connect to `postgres`, not to the database we are about to drop.
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });

  try {
    // A single leftover connection from a previous run makes DROP DATABASE
    // fail with "is being accessed by other users", which reads like a
    // permissions problem and is not.
    await sql`
      select pg_terminate_backend(pid) from pg_stat_activity
       where datname = ${name} and pid <> pg_backend_pid()`;
    await sql.unsafe(`drop database if exists "${name}"`);
    await sql.unsafe(`create database "${name}"`);
    console.log(`recreated ${name}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\ndb:test:reset failed:', err);
  process.exit(1);
});
