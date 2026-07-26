/**
 * Apply every committed migration to DATABASE_URL.
 *
 * Idempotent: drizzle records what it has run in `drizzle.__drizzle_migrations`
 * and tops up whatever is missing, so running this twice is a no-op.
 *
 * Wrapped in main() rather than using top-level await, because this project
 * has no `"type": "module"` and tsx therefore transforms to CJS, where
 * top-level await is a build error. Same shape as scripts/smoke-llm.ts.
 */
import { config } from 'dotenv';
import { sql as drizzleSql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Not Next, so nothing loads .env.local for us. See drizzle.config.ts.
config({ path: '.env.local', quiet: true });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  // A dedicated single connection, not the app's pool: migrations run DDL and
  // must not share a pooled connection with anything else.
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  const db = drizzle(sql);

  try {
    await migrate(db, { migrationsFolder: './src/lib/db/migrations' });
    const rows = await db.execute<{ count: string }>(
      drizzleSql`select count(*)::text as count from information_schema.tables
                  where table_schema = 'public'`,
    );
    console.log(`migrations applied (${rows[0].count} tables in public)`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('\nmigration failed:', err);
  process.exit(1);
});
